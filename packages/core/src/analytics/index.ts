/**
 * Analytics Engine (TDD §22) — public interface. Owner: Agent 7 (Dashboard
 * & Analytics). Not in TDD §3's original module list; added following
 * Agent 1's own documented precedent for `rbac`/`result` (DECISIONS.md
 * items 2-3) — see DECISIONS-agent7.md item 2.
 *
 * Consumed by `apps/web`'s dashboard/QC-analytics/drive API routes and
 * pages, and by `apps/web/instrumentation.ts`'s internal refresh timer.
 * Read-only except for `markNotificationRead` and `refreshMissionSummaryMv`
 * (see repository.ts's header comment for why those two are in-scope for a
 * "read-only by design" agent).
 */
export * from "./types.js";
export * from "./constants.js";
export {
  getDashboardSummary,
  getKpiStrip,
  getMissionProgress,
  getRenderQueueSummary,
  getAlerts,
  getMissionSummaryMvFreshness,
  refreshMissionSummaryMv,
  getStorageUsageSummary,
  getQualityTrend,
  getFailureCategoryBreakdown,
  getQcAnalyticsSummary,
} from "./repository.js";
