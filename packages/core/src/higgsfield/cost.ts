/**
 * Cost/quota tracking (TDD §9.9): "Every successful submission records
 * Higgsfield's reported credit cost (if the API exposes it) or a
 * locally-estimated cost (config-driven per job type, §31, if the API
 * does not) against the job row — feeds the Dashboard's cost-visibility
 * requirement (NFR-10) and the Mission Analytics panel (FSD §12.7)."
 */

import type { ProviderCost } from "../render-provider/index.js";

/** Config-driven per-job-type cost estimate, used only when the API response omits `credit_cost`. */
export interface LocalCostEstimateConfig {
  imageGenerationCredits: number;
  videoGenerationCredits: number;
  soulIdTrainingCredits: number;
}

/**
 * ASSUMPTION: no live Higgsfield pricing sheet available in this
 * environment. These defaults are placeholders only, intended to keep the
 * cost-tracking code path exercised (never silently `0`, which would read
 * as "free" on the Dashboard) until real figures are configured. MUST be
 * replaced with real values (via `packages/core/config`, not by editing
 * this file) before production use. See `DECISIONS-agent-4.md`.
 */
export const DEFAULT_LOCAL_COST_ESTIMATE: LocalCostEstimateConfig = {
  imageGenerationCredits: 1,
  videoGenerationCredits: 5,
  soulIdTrainingCredits: 20,
};

export function resolveGenerationCost(
  reportedCost: ProviderCost | undefined,
  assetClass: "image" | "video",
  estimateConfig: LocalCostEstimateConfig = DEFAULT_LOCAL_COST_ESTIMATE,
): ProviderCost {
  if (reportedCost) {
    return reportedCost;
  }
  const amount =
    assetClass === "video"
      ? estimateConfig.videoGenerationCredits
      : estimateConfig.imageGenerationCredits;
  return { amount, currency: "credits" };
}

export function resolveTrainingCost(
  reportedCost: ProviderCost | undefined,
  estimateConfig: LocalCostEstimateConfig = DEFAULT_LOCAL_COST_ESTIMATE,
): ProviderCost {
  return reportedCost ?? { amount: estimateConfig.soulIdTrainingCredits, currency: "credits" };
}

/**
 * A single cost-ledger entry, persisted to `higgsfield_cost_ledger`
 * (`infra/supabase/migrations/0006_higgsfield_job_tracking.sql`, owned by
 * Agent 4 — see that migration's header comment for why this table exists
 * separately from `generation_jobs`, which Agent 2 owns).
 */
export interface CostLedgerEntry {
  jobKind: "generation" | "soul_id_training";
  /** `generation_jobs.id` or the local `higgsfield_soul_id_training_jobs.id`, depending on `jobKind`. */
  jobId: string;
  providerJobId: string;
  cost: ProviderCost;
  wasEstimated: boolean;
}

export function buildCostLedgerEntry(
  jobKind: CostLedgerEntry["jobKind"],
  jobId: string,
  providerJobId: string,
  reportedCost: ProviderCost | undefined,
  resolvedCost: ProviderCost,
): CostLedgerEntry {
  return {
    jobKind,
    jobId,
    providerJobId,
    cost: resolvedCost,
    wasEstimated: !reportedCost,
  };
}
