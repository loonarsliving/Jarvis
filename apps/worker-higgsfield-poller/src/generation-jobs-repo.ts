/**
 * Repository access to Agent 2's `generation_jobs` table (the Render
 * Queue, TDD §10.2). Agent 4 is a *consumer* of this table for the
 * status-tracking half of its lifecycle only (Constitution Article VIII:
 * "your poller picks up already-submitted jobs and tracks their
 * Higgsfield-side status onward") — this file never claims `queued` rows
 * (that's `mission-dispatcher`'s job) and never writes any column outside
 * the status-tracking set documented below.
 *
 * TODO(integration): depends on Agent 2's `packages/core/mission`/`queue`
 * modules and the `generation_jobs` migration, none of which exist yet in
 * this Sprint (parallel worktree). Column names below are the best-effort
 * inference from TDD §10.3's common job-row shape
 * (`id, status, priority, payload, attempt_count, next_retry_at,
 * claimed_by, claimed_at, enqueued_at, updated_at`) plus the
 * Higgsfield-specific fields TDD §9.5 names explicitly
 * (`higgsfield_job_id`) and FSD §14.4's status vocabulary
 * (`submitted/running/retrieving/ingested/failed/failed_content_policy/
 * timeout`). MUST be reconciled against Agent 2's actual migration once
 * merged — this repository's queries are the single place that needs
 * updating if column names differ.
 */

import type { TypedSupabaseClient } from "@aaf/core/db";

export type GenerationJobStatus =
  | "queued"
  | "submitted"
  | "running"
  | "retrieving"
  | "ingested"
  | "failed"
  | "failed_content_policy"
  | "timeout"
  | "retrying"
  | "dead_letter"
  | "cancelled";

export interface GenerationJobRow {
  id: string;
  status: GenerationJobStatus;
  higgsfield_job_id: string | null;
  attempt_count: number;
  /** Set when the job entered `submitted` — the poller's timeout window (TDD §9.8) is measured from here. */
  submitted_at: string | null;
  next_retry_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  /** `jsonb` — includes `assetClass` at minimum, needed to pick the right cost estimate (§9.9) if Higgsfield doesn't report one. */
  payload: { assetClass?: "image" | "video" } | null;
}

const TABLE = "generation_jobs";

/** Fetches every job this poller instance should poll this tick — status `submitted` or `running` (FSD §14.4). */
export async function fetchInFlightGenerationJobs(
  client: TypedSupabaseClient,
  limit: number,
): Promise<GenerationJobRow[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .in("status", ["submitted", "running"])
    .order("priority", { ascending: false })
    .order("enqueued_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch in-flight generation_jobs: ${error.message}`);
  }
  return (data ?? []) as GenerationJobRow[];
}

/** Transitions a job to `running` once Higgsfield reports `processing` (FSD §14.4) — a no-op update if already `running`. Stamps `claimed_by`/`claimed_at` so the startup recovery pass (§12.4, `recoverStaleClaims`) can find it if this instance crashes mid-flight. */
export async function markRunning(
  client: TypedSupabaseClient,
  jobId: string,
  workerInstanceId: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "running", claimed_by: workerInstanceId, claimed_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) {
    throw new Error(`Failed to mark generation_jobs ${jobId} running: ${error.message}`);
  }
}

/** Success path: `succeeded` → `retrieving`, after the Upload Queue entry is enqueued (TDD §9.6, FSD §14.4). */
export async function markRetrieving(client: TypedSupabaseClient, jobId: string): Promise<void> {
  const { error } = await client.from(TABLE).update({ status: "retrieving" }).eq("id", jobId);
  if (error) {
    throw new Error(`Failed to mark generation_jobs ${jobId} retrieving: ${error.message}`);
  }
}

/** Schedules a retry per the canonical policy (TDD §25) — sets `status='retrying'`, increments `attempt_count`, sets `next_retry_at`. */
export async function scheduleRetry(
  client: TypedSupabaseClient,
  jobId: string,
  attemptCount: number,
  nextRetryAt: Date,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "retrying", attempt_count: attemptCount, next_retry_at: nextRetryAt.toISOString() })
    .eq("id", jobId);
  if (error) {
    throw new Error(`Failed to schedule retry for generation_jobs ${jobId}: ${error.message}`);
  }
}

/**
 * Startup recovery pass (TDD §12.4): "reset any row it previously claimed
 * that's still `running` back to `retrying` — handles the case where the
 * container was killed ungracefully." This poller doesn't hold an
 * exclusive per-row claim while polling (it re-reads `submitted`/`running`
 * rows fresh every tick, see `fetchInFlightGenerationJobs`), but it does
 * write `claimed_by`/`claimed_at` when it transitions a row to `running`
 * (see `markRunning` — TODO: thread `workerInstanceId` through once Agent
 * 2's real `generation_jobs` schema confirms this column is present) so
 * this recovery step still has a well-defined meaning: a `running` row
 * still stamped with this instance's id from before a crash gets reset
 * rather than being polled forever by a poller that no longer remembers
 * it was mid-processing.
 */
export async function recoverStaleClaims(
  client: TypedSupabaseClient,
  workerInstanceId: string,
): Promise<number> {
  const { data, error } = await client
    .from(TABLE)
    .update({ status: "retrying", next_retry_at: new Date().toISOString() })
    .eq("status", "running")
    .eq("claimed_by", workerInstanceId)
    .select("id");

  if (error) {
    throw new Error(`Failed to recover stale generation_jobs claims: ${error.message}`);
  }
  return data?.length ?? 0;
}

/** Terminal failure — attempts exhausted (`dead_letter`, TDD §10.6) or a deterministic content-policy rejection (`failed_content_policy`, never retried per TDD §9.7). */
export async function markTerminalFailure(
  client: TypedSupabaseClient,
  jobId: string,
  status: "dead_letter" | "failed_content_policy" | "failed",
  failureReason: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status, failure_reason: failureReason })
    .eq("id", jobId);
  if (error) {
    throw new Error(`Failed to mark generation_jobs ${jobId} ${status}: ${error.message}`);
  }
}
