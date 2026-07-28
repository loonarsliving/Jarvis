import "server-only";
import { refreshMissionSummaryMv, MISSION_SUMMARY_MV_REFRESH_INTERVAL_MS } from "@aaf/core/analytics";
import { createServiceRoleClient } from "@aaf/core/db";
import { getConfig } from "../config";

/**
 * TDD §7.4's Dashboard Aggregator: refreshes `mission_summary_mv` every 5
 * minutes via `REFRESH MATERIALIZED VIEW CONCURRENTLY`
 * (`infra/supabase/migrations/0700_mission_summary_mv.sql`). Called once
 * from `apps/web/instrumentation.ts`'s `register()` on process boot.
 *
 * Uses the service-role client deliberately — `refresh_mission_summary_mv()`'s
 * `EXECUTE` grant is restricted to `service_role` (0700's migration), since
 * this is a system-scheduled action, never a user-triggered one.
 *
 * TDD §22 Recovery Strategy: "if a scheduled refresh fails, the previous
 * materialized view snapshot remains queryable (stale-but-available, per
 * FSD §8's 'data as of HH:MM' badge UX) rather than the dashboard breaking
 * — next scheduled tick retries the refresh." Implemented here as: log and
 * swallow (never crash the process on a refresh failure), let `setInterval`
 * retry on the next tick.
 */
let timerStarted = false;

export function startMissionSummaryMvRefreshTimer(): void {
  // register() can theoretically run more than once per process in some
  // Next.js dev-mode reload scenarios — guard against double-scheduling.
  if (timerStarted) return;
  timerStarted = true;

  const tick = async () => {
    try {
      const client = createServiceRoleClient(getConfig());
      await refreshMissionSummaryMv(client);
    } catch (error) {
      // Intentionally not re-thrown (TDD §22 Recovery Strategy, above) —
      // a failed refresh must never crash `web`'s process; the previous
      // MV snapshot stays queryable and the FSD §8 staleness badge covers
      // the UX. LOG_LEVEL-gated structured logging is a future addition
      // once a process-wide logger exists (none is scaffolded yet in this
      // Sprint's foundation code) — a plain console.error is the minimum
      // "never silent" bar for now (Bible non-negotiable #6).
      console.error("[mission_summary_mv] refresh failed", error);
    }
  };

  // Fire once shortly after boot (don't make the dashboard wait a full 5
  // minutes for first data after a cold start), then on the documented
  // interval.
  setTimeout(tick, 5_000);
  setInterval(tick, MISSION_SUMMARY_MV_REFRESH_INTERVAL_MS);
}
