/**
 * Generation Status Poller tick (TDD §11 "Higgsfield Status Poller tick",
 * every 15s) + Timeout Strategy (TDD §9.8) + Retry Strategy (TDD §9.7,
 * §25) + Download handoff (TDD §9.6) + Cost tracking (TDD §9.9).
 */

import { logAction } from "@aaf/core/audit";
import type { TypedSupabaseClient } from "@aaf/core/db";
import {
  buildCostLedgerEntry,
  resolveGenerationCost,
  type RenderProvider,
} from "@aaf/core/higgsfield";
import { classifyError, computeNextRetryAt, hasExhaustedAttempts, type RetryPolicyConfig } from "@aaf/core/retry";
import {
  fetchInFlightGenerationJobs,
  markRetrieving,
  markRunning,
  markTerminalFailure,
  scheduleRetry,
  type GenerationJobRow,
} from "./generation-jobs-repo.js";
import { enqueueUploadJob, type QueueEnqueuer } from "./upload-queue.js";
import { insertCostLedgerEntry } from "./cost-ledger-repo.js";

/** Standard image/video generation timeout (TDD §9.8): 10 minutes. */
export const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

export interface GenerationPollTickDeps {
  db: TypedSupabaseClient;
  provider: RenderProvider;
  retryPolicy: RetryPolicyConfig;
  workerInstanceId: string;
  batchSize?: number;
  uploadEnqueuer?: QueueEnqueuer;
  now?: () => Date;
}

export interface GenerationPollTickResult {
  polled: number;
  succeeded: number;
  retried: number;
  terminallyFailed: number;
}

export async function runGenerationPollTick(
  deps: GenerationPollTickDeps,
): Promise<GenerationPollTickResult> {
  const now = deps.now ?? (() => new Date());
  const jobs = await fetchInFlightGenerationJobs(deps.db, deps.batchSize ?? 50);

  const result: GenerationPollTickResult = { polled: 0, succeeded: 0, retried: 0, terminallyFailed: 0 };

  for (const job of jobs) {
    result.polled += 1;
    await pollOneGenerationJob(job, deps, now, result);
  }

  return result;
}

async function pollOneGenerationJob(
  job: GenerationJobRow,
  deps: GenerationPollTickDeps,
  now: () => Date,
  result: GenerationPollTickResult,
): Promise<void> {
  if (!job.higgsfield_job_id) {
    // Defensive — a job in `submitted`/`running` with no provider job id is a data-integrity bug
    // (TDD §9.5 guarantees this is written synchronously before the job can reach `submitted`).
    // Never silently skip (Bible non-negotiable #6 "no silent failure") — log and leave it for
    // the next tick rather than crashing the whole batch.
    console.error(
      `[worker-higgsfield-poller] generation_jobs ${job.id} is ${job.status} with no higgsfield_job_id — skipping (data-integrity issue, see TDD §9.5)`,
    );
    return;
  }

  // Timeout check first (TDD §9.8) — a job still processing past 10 minutes is treated as
  // `timeout`, entering the same retry path as a transient failure, without spending a poll call.
  if (job.submitted_at) {
    const elapsedMs = now().getTime() - new Date(job.submitted_at).getTime();
    if (elapsedMs > GENERATION_TIMEOUT_MS) {
      console.warn(
        `[worker-higgsfield-poller] generation_jobs ${job.id} timed out after ${elapsedMs}ms (limit ${GENERATION_TIMEOUT_MS}ms)`,
      );
      await handleRetryableOutcome(job, deps, "timeout", result);
      return;
    }
  }

  let statusResult;
  try {
    statusResult = await deps.provider.pollStatus(job.higgsfield_job_id);
  } catch (error) {
    console.error(`[worker-higgsfield-poller] pollStatus failed for generation_jobs ${job.id}:`, error);
    await handleRetryableOutcome(job, deps, describeError(error), result);
    return;
  }

  switch (statusResult.status) {
    case "submitted":
      // No-op — still queued provider-side.
      return;
    case "running":
      if (job.status !== "running") {
        await markRunning(deps.db, job.id, deps.workerInstanceId);
      }
      return;
    case "succeeded": {
      if (!statusResult.outputUrl) {
        // Contract violation from the provider client — never proceed to enqueue an Upload Queue
        // entry with no URL to download.
        await handleRetryableOutcome(
          job,
          deps,
          "Higgsfield reported succeeded with no output URL",
          result,
        );
        return;
      }
      const assetClass = job.payload?.assetClass ?? "image";
      await enqueueUploadJob(
        { generationJobId: job.id, outputUrl: statusResult.outputUrl, assetClass },
        { enqueuer: deps.uploadEnqueuer, priority: job.priority },
      );
      await markRetrieving(deps.db, job.id);

      const resolvedCost = resolveGenerationCost(statusResult.reportedCost, assetClass);
      const ledgerEntry = buildCostLedgerEntry(
        "generation",
        job.id,
        job.higgsfield_job_id,
        statusResult.reportedCost,
        resolvedCost,
      );
      await insertCostLedgerEntry(deps.db, ledgerEntry);

      await logAction(deps.db, {
        actorType: "system",
        actorId: deps.workerInstanceId,
        action: "generation_job.higgsfield_succeeded",
        entityType: "generation_job",
        entityId: job.id,
        after: { higgsfieldJobId: job.higgsfield_job_id, outputUrl: statusResult.outputUrl },
        severity: "info",
      });
      result.succeeded += 1;
      return;
    }
    case "failed_content_policy": {
      // Deterministic — never retried (FSD §14.5, TDD §9.7).
      await markTerminalFailure(
        deps.db,
        job.id,
        "failed_content_policy",
        statusResult.rejectionReason ?? "Content policy rejection",
      );
      await logAction(
        deps.db,
        {
          actorType: "system",
          actorId: deps.workerInstanceId,
          action: "generation_job.failed_content_policy",
          entityType: "generation_job",
          entityId: job.id,
          after: { reason: statusResult.rejectionReason },
          severity: "warning",
        },
        // TDD §9.7: surfaced distinctly in Job Monitor so a human adjusts the prompt/template —
        // not `critical` (that's reserved for defect-shaped failures like §9.3 validation), but
        // not silent either.
      );
      result.terminallyFailed += 1;
      return;
    }
    case "failed":
    case "timeout":
      await handleRetryableOutcome(job, deps, statusResult.providerStatusRaw, result);
      return;
  }
}

async function handleRetryableOutcome(
  job: GenerationJobRow,
  deps: GenerationPollTickDeps,
  reason: string,
  result: GenerationPollTickResult,
): Promise<void> {
  const nextAttempt = job.attempt_count + 1;
  const classification = classifyError({ retryCategory: "transient" });

  if (hasExhaustedAttempts(nextAttempt, deps.retryPolicy)) {
    await markTerminalFailure(deps.db, job.id, "dead_letter", reason);
    await logAction(deps.db, {
      actorType: "system",
      actorId: deps.workerInstanceId,
      action: "generation_job.dead_letter",
      entityType: "generation_job",
      entityId: job.id,
      after: { reason, attemptCount: nextAttempt },
      severity: "critical",
    });
    result.terminallyFailed += 1;
    return;
  }

  const nextRetryAt = computeNextRetryAt(nextAttempt, deps.retryPolicy, classification.category as "transient" | "rate_limit");
  await scheduleRetry(deps.db, job.id, nextAttempt, nextRetryAt);
  await logAction(deps.db, {
    actorType: "system",
    actorId: deps.workerInstanceId,
    action: "generation_job.retry_scheduled",
    entityType: "generation_job",
    entityId: job.id,
    after: { reason, attemptCount: nextAttempt, nextRetryAt: nextRetryAt.toISOString() },
    severity: "warning",
  });
  result.retried += 1;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
