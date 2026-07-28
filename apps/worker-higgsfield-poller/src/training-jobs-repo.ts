/**
 * Repository access to `higgsfield_soul_id_training_jobs` (Agent 4's own
 * table, `infra/supabase/migrations/0006_higgsfield_job_tracking.sql`).
 */

import type { TypedSupabaseClient } from "@aaf/core/db";

export type TrainingJobStatus = "queued" | "training" | "succeeded" | "failed" | "retrying" | "dead_letter";

export interface TrainingJobRow {
  id: string;
  character_dna_version_id: string;
  status: TrainingJobStatus;
  higgsfield_training_id: string | null;
  reference_image_ids: string[];
  soul_id_reference: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  enqueued_at: string;
}

const TABLE = "higgsfield_soul_id_training_jobs";

export async function fetchInFlightTrainingJobs(
  client: TypedSupabaseClient,
  limit: number,
): Promise<TrainingJobRow[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .in("status", ["queued", "training"])
    .order("enqueued_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch in-flight ${TABLE}: ${error.message}`);
  }
  return (data ?? []) as TrainingJobRow[];
}

export async function markTraining(
  client: TypedSupabaseClient,
  id: string,
  workerInstanceId: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "training", claimed_by: workerInstanceId, claimed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to mark ${TABLE} ${id} training: ${error.message}`);
}

/** Startup recovery pass (TDD §12.4) — see `generation-jobs-repo.ts`'s `recoverStaleClaims` for full rationale, identical pattern applied to this table. */
export async function recoverStaleTrainingClaims(
  client: TypedSupabaseClient,
  workerInstanceId: string,
): Promise<number> {
  const { data, error } = await client
    .from(TABLE)
    .update({ status: "retrying", next_retry_at: new Date().toISOString() })
    .eq("status", "training")
    .eq("claimed_by", workerInstanceId)
    .select("id");
  if (error) {
    throw new Error(`Failed to recover stale ${TABLE} claims: ${error.message}`);
  }
  return data?.length ?? 0;
}

/**
 * Success — writes `soul_id_reference` on this tracking row. Per FSD §14.2
 * the Character DNA record's `higgsfield_soul_id` column (Agent 3's table)
 * must also be updated so future jobs reuse it.
 *
 * TODO(integration): depends on Agent 3's `identity` module exposing a
 * function to persist the trained persona onto `character_dna_versions`.
 * `onSoulIdTrained` is called after this row is updated so Agent 3's
 * write, once wired, participates in the same logical completion step
 * without this poller reaching into Agent 3's table directly (Constitution
 * Article VIII: never write to another agent's owned module).
 */
export async function markTrainingSucceeded(
  client: TypedSupabaseClient,
  id: string,
  soulIdReference: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "succeeded", soul_id_reference: soulIdReference })
    .eq("id", id);
  if (error) throw new Error(`Failed to mark ${TABLE} ${id} succeeded: ${error.message}`);
}

export async function scheduleTrainingRetry(
  client: TypedSupabaseClient,
  id: string,
  attemptCount: number,
  nextRetryAt: Date,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "retrying", attempt_count: attemptCount, next_retry_at: nextRetryAt.toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to schedule retry for ${TABLE} ${id}: ${error.message}`);
}

/**
 * TDD §9.7: "a training failure that recurs after max attempts blocks the
 * Character DNA version from reaching `approved` (FSD §32) rather than
 * silently leaving a half-trained identity available for production use."
 * This function only marks the training row `dead_letter` — the DNA
 * approval gate itself lives in Agent 3's `identity` module (TODO
 * integration, same as `markTrainingSucceeded` above).
 */
export async function markTrainingDeadLetter(
  client: TypedSupabaseClient,
  id: string,
  failureReason: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .update({ status: "dead_letter", failure_reason: failureReason })
    .eq("id", id);
  if (error) throw new Error(`Failed to mark ${TABLE} ${id} dead_letter: ${error.message}`);
}
