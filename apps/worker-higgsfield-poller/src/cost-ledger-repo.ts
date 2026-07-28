/**
 * Repository access to `higgsfield_cost_ledger` (Agent 4's own table,
 * `infra/supabase/migrations/0006_higgsfield_job_tracking.sql`) — TDD
 * §9.9 cost/quota tracking.
 */

import type { TypedSupabaseClient } from "@aaf/core/db";
import type { CostLedgerEntry } from "@aaf/core/higgsfield";

export async function insertCostLedgerEntry(
  client: TypedSupabaseClient,
  entry: CostLedgerEntry,
): Promise<void> {
  const { error } = await client.from("higgsfield_cost_ledger").insert({
    job_kind: entry.jobKind,
    job_id: entry.jobId,
    higgsfield_job_id: entry.providerJobId,
    credit_amount: entry.cost.amount,
    currency: entry.cost.currency,
    was_estimated: entry.wasEstimated,
  });
  if (error) {
    // Cost tracking is important (NFR-10) but must never block the generation pipeline's own
    // progress (a job that already succeeded and enqueued its Upload Queue entry must not be
    // rolled back over a cost-ledger write failure) — logged loudly, not thrown.
    console.error(`[worker-higgsfield-poller] failed to write higgsfield_cost_ledger entry:`, error);
  }
}
