/**
 * Analytics Engine configuration constants (TDD §22, FSD §8).
 *
 * These are NOT added to `packages/core/src/config/schema.ts` — that file
 * is Agent 1's owned module (Constitution Article VIII: "config" is
 * Foundation-owned) and none of these values are deployment-time secrets
 * or per-environment settings; they're domain constants of the Analytics
 * Engine itself; TDD §22's guard is worded as a fixed architectural rule
 * ("keeping aggregation windows bounded"), not an admin-tunable. Kept here
 * instead, mirroring Agent 1's own documented precedent for `rbac`/`result`
 * (DECISIONS.md items 2-3: a cross-cutting concern gets its own subpath
 * rather than being bolted onto an unrelated owned module) — see
 * DECISIONS-agent7.md item 2.
 *
 * Article III.5 ("no hardcoding... for anything that could plausibly
 * change") is satisfied by centralizing these here as named constants
 * rather than inlining magic numbers at each call site, even though they
 * aren't sourced from `@aaf/core/config`.
 */

/** FSD §8 "Validation Rules": date range must not exceed 365 days (performance guard on aggregation query). */
export const DASHBOARD_DATE_RANGE_MAX_DAYS = 365;

/** FSD §8 default: Quality Analytics chart defaults to the last 30 days. */
export const QUALITY_TREND_DEFAULT_RANGE_DAYS = 30;

/** TDD §7.4 / §22: mission_summary_mv is refreshed every 5 minutes by web's internal timer. */
export const MISSION_SUMMARY_MV_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * FSD §8 "Error States": "If aggregation data is stale (>15 min old), show
 * a subtle 'data as of HH:MM' badge rather than blocking the page." 15 min
 * is 3x the 5-minute refresh interval — tolerates one missed tick (TDD §22
 * Recovery Strategy: "previous materialized view snapshot remains
 * queryable... next scheduled tick retries") without alarming the UI.
 */
export const MISSION_SUMMARY_MV_STALE_THRESHOLD_MS = 15 * 60 * 1000;

/** FSD §8 KPI strip: "QC Pass Rate (7d)". */
export const QC_PASS_RATE_WINDOW_DAYS = 7;

/**
 * FSD §8 Alerts panel: "Drive quota >85% WARNING" (also shown verbatim in
 * the FSD §07 Google Drive wireframe). TDD doesn't name a second, more
 * severe threshold, so only this one is implemented — do not invent a
 * "critical" tier not traceable to the FSD (Constitution Article VI.1).
 */
export const DRIVE_QUOTA_WARNING_PCT = 85;

/**
 * TDD Bible "Retry Policy": 4 attempts max. Used to distinguish a job still
 * retrying from one that has truly exhausted its attempts (dead letter) in
 * `mission_summary_mv`'s job-status breakdown. Mirrors
 * `@aaf/core/config`'s `RETRY_MAX_ATTEMPTS` default (packages/core/src/config/schema.ts)
 * — kept as its own constant here (not imported from `config`) because the
 * SQL view (infra/supabase/migrations/0700_mission_summary_mv.sql) can't
 * read a TypeScript constant; both are documented as needing to move in
 * lockstep if the retry ceiling is ever externalized to `system_settings`.
 */
export const RETRY_MAX_ATTEMPTS = 4;
