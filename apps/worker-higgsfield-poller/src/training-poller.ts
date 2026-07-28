/**
 * Soul ID Training Poller tick (TDD §11, every 60s) + Timeout Strategy
 * (TDD §9.8: 45 minutes) + Retry Strategy (TDD §9.7).
 */

import { logAction } from "@aaf/core/audit";
import type { TypedSupabaseClient } from "@aaf/core/db";
import { buildCostLedgerEntry, resolveTrainingCost, type RenderProvider } from "@aaf/core/higgsfield";
import { classifyError, computeNextRetryAt, hasExhaustedAttempts, type RetryPolicyConfig } from "@aaf/core/retry";
import { insertCostLedgerEntry } from "./cost-ledger-repo.js";
import {
  fetchInFlightTrainingJobs,
  markTraining,
  markTrainingDeadLetter,
  markTrainingSucceeded,
  scheduleTrainingRetry,
  type TrainingJobRow,
} from "./training-jobs-repo.js";

/** Soul ID training timeout (TDD §9.8): 45 minutes, configurable via env per TDD §30 — see main.ts wiring. */
export const DEFAULT_TRAINING_TIMEOUT_MS = 45 * 60 * 1000;

export interface TrainingPollTickDeps {
  db: TypedSupabaseClient;
  provider: RenderProvider;
  retryPolicy: RetryPolicyConfig;
  workerInstanceId: string;
  timeoutMs?: number;
  batchSize?: number;
  now?: () => Date;
}

export interface TrainingPollTickResult {
  polled: number;
  succeeded: number;
  retried: number;
  terminallyFailed: number;
}

export async function runSoulIdTrainingPollTick(
  deps: TrainingPollTickDeps,
): Promise<TrainingPollTickResult> {
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TRAINING_TIMEOUT_MS;
  const jobs = await fetchInFlightTrainingJobs(deps.db, deps.batchSize ?? 20);

  const result: TrainingPollTickResult = { polled: 0, succeeded: 0, retried: 0, terminallyFailed: 0 };

  for (const job of jobs) {
    result.polled += 1;
    await pollOneTrainingJob(job, deps, now, timeoutMs, result);
  }

  return result;
}

async function pollOneTrainingJob(
  job: TrainingJobRow,
  deps: TrainingPollTickDeps,
  now: () => Date,
  timeoutMs: number,
  result: TrainingPollTickResult,
): Promise<void> {
  if (!job.higgsfield_training_id) {
    console.error(
      `[worker-higgsfield-poller] training job ${job.id} is ${job.status} with no higgsfield_training_id — skipping`,
    );
    return;
  }

  const elapsedMs = now().getTime() - new Date(job.enqueued_at).getTime();
  if (elapsedMs > timeoutMs) {
    console.warn(
      `[worker-higgsfield-poller] soul id training ${job.id} timed out after ${elapsedMs}ms (limit ${timeoutMs}ms)`,
    );
    await handleRetryableTrainingOutcome(job, deps, "timeout", result);
    return;
  }

  let statusResult;
  try {
    statusResult = await deps.provider.pollTrainingStatus(job.higgsfield_training_id);
  } catch (error) {
    console.error(`[worker-higgsfield-poller] pollTrainingStatus failed for ${job.id}:`, error);
    await handleRetryableTrainingOutcome(job, deps, describeError(error), result);
    return;
  }

  switch (statusResult.status) {
    case "queued":
      return;
    case "training":
      if (job.status !== "training") await markTraining(deps.db, job.id, deps.workerInstanceId);
      return;
    case "succeeded": {
      if (!statusResult.soulIdReference) {
        await handleRetryableTrainingOutcome(
          job,
          deps,
          "Higgsfield reported training succeeded with no soul_id",
          result,
        );
        return;
      }
      await markTrainingSucceeded(deps.db, job.id, statusResult.soulIdReference);

      const resolvedCost = resolveTrainingCost(statusResult.reportedCost);
      await insertCostLedgerEntry(
        deps.db,
        buildCostLedgerEntry(
          "soul_id_training",
          job.id,
          job.higgsfield_training_id,
          statusResult.reportedCost,
          resolvedCost,
        ),
      );

      await logAction(deps.db, {
        actorType: "system",
        actorId: deps.workerInstanceId,
        action: "soul_id_training.succeeded",
        entityType: "higgsfield_soul_id_training_job",
        entityId: job.id,
        after: { characterDnaVersionId: job.character_dna_version_id },
        severity: "info",
      });
      result.succeeded += 1;
      return;
    }
    case "failed":
      await handleRetryableTrainingOutcome(job, deps, statusResult.providerStatusRaw, result);
      return;
  }
}

async function handleRetryableTrainingOutcome(
  job: TrainingJobRow,
  deps: TrainingPollTickDeps,
  reason: string,
  result: TrainingPollTickResult,
): Promise<void> {
  const nextAttempt = job.attempt_count + 1;
  const classification = classifyError({ retryCategory: "transient" });

  if (hasExhaustedAttempts(nextAttempt, deps.retryPolicy)) {
    // TDD §9.7: blocks the Character DNA version from reaching `approved` — enforced in Agent
    // 3's `identity` module (TODO(integration), see training-jobs-repo.ts markTrainingDeadLetter
    // doc comment); this poller's responsibility ends at marking its own row terminal + logging
    // `critical` so the block is visible.
    await markTrainingDeadLetter(deps.db, job.id, reason);
    await logAction(deps.db, {
      actorType: "system",
      actorId: deps.workerInstanceId,
      action: "soul_id_training.dead_letter",
      entityType: "higgsfield_soul_id_training_job",
      entityId: job.id,
      after: { reason, characterDnaVersionId: job.character_dna_version_id, attemptCount: nextAttempt },
      severity: "critical",
    });
    result.terminallyFailed += 1;
    return;
  }

  const nextRetryAt = computeNextRetryAt(
    nextAttempt,
    deps.retryPolicy,
    classification.category as "transient" | "rate_limit",
  );
  await scheduleTrainingRetry(deps.db, job.id, nextAttempt, nextRetryAt);
  result.retried += 1;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
