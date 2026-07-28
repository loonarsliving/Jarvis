/**
 * Next.js instrumentation hook (stable since Next.js 15, no config flag
 * needed) — `register()` runs once per server process on boot, in the
 * Node.js runtime. This is the "internal timer inside web's own process"
 * TDD §7.4 specifies for `mission_summary_mv`'s 5-minute refresh:
 *
 *   "mission_summary_mv: refreshed every 5 minutes by a dedicated
 *   lightweight job inside web's own process (a Next.js scheduled route
 *   triggered by an internal timer, not a separate worker container —
 *   this one aggregation is cheap and tightly coupled to the Dashboard it
 *   serves)."
 *
 * Deliberately NOT a `apps/worker-*` service (Constitution Article
 * VIII/Article III.2 "No monolith... Five services... as specified in TDD
 * §2" — this agent owns no worker service, and TDD §7.4 is explicit this
 * one aggregation belongs inside `web`, not a sixth service).
 *
 * Guarded to the `nodejs` runtime only: `register()` also fires for the
 * `edge` runtime in some Next.js configurations, and `setInterval` +
 * service-role Postgres access have no meaning there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMissionSummaryMvRefreshTimer } = await import("./lib/analytics/refresh-scheduler");
  startMissionSummaryMvRefreshTimer();
}
