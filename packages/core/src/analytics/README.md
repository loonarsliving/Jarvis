# analytics

**Owner: Agent 7 (Dashboard & Analytics).**

Implements the Analytics Engine (`docs/ai-asset-factory/tdd/05-metadata-index-search-mission-qc-analytics-logging.md`
§22): powers the Main Dashboard (FSD §8), QC Analytics page (FSD §07
wireframe), and Google Drive Storage & Sync Status page from pre-aggregated
data only — never a live join at request time (NFR-6).

Not listed in TDD §3's original `packages/core` module table. Added
following the same documented-ambiguity pattern Agent 1 used for `rbac` and
`result` (root `DECISIONS.md` items 2-3) — see `DECISIONS-agent7.md` item 2
at the repo root for the full resolution.

## What owns what

- `infra/supabase/migrations/0700_mission_summary_mv.sql` — the
  materialized view itself + its `REFRESH ... CONCURRENTLY` wrapper
  function, per TDD §7.4.
- `infra/supabase/migrations/0701_notifications.sql` — the `notifications`
  table (FSD §07 ERD), explicitly reserved for this agent in
  `infra/supabase/migrations/README.md`.
- `repository.ts` — every read query behind the Main Dashboard, QC
  Analytics, and Storage Usage pages, plus the two writes this agent is
  responsible for (`markNotificationRead` against its own `notifications`
  table, `refreshMissionSummaryMv` against its own Postgres function).
- `apps/web/instrumentation.ts` — the "internal timer inside web's own
  process" (TDD §7.4) that calls `refreshMissionSummaryMv` every 5 minutes.

## Read-only boundary

This agent is read-only by design (Constitution Article VIII). Every query
in `repository.ts` that reaches into another agent's owned table
(`missions`, `generation_jobs`, `assets`, `qc_reports`,
`product_dna_versions`, `character_dna_versions`,
`storage_usage_snapshots`) is a `SELECT` only, tagged
`TODO(integration)`, and written against the shapes in
`docs/ai-asset-factory/fsd/07-database-erd-dashboards.md` — verify against
each owning agent's actual migration once merged.

Two exceptions, both against tables this agent itself owns, not another
agent's business logic:

1. `markNotificationRead` — `UPDATE notifications SET read = true` scoped
   to the calling user's own row (query-level `.eq("recipient_id", ...)`
   plus the RLS policy in `0701_notifications.sql`).
2. `refreshMissionSummaryMv` — calls `refresh_mission_summary_mv()`, a
   Postgres function this agent's own migration defines.

## Known gaps (see repository.ts TODOs)

- "Higgsfield API degraded" alert (FSD §8 Alerts panel example) has no
  documented source table in the binding ERD — not implemented rather than
  invented (Constitution Article VI.1).
- Storage Usage "by project" breakdown (FSD §07 wireframe) needs a
  `project` column on `storage_usage_snapshots` that the current ERD
  doesn't specify (only `company`) — currently reports company-level
  totals only; flagged for Agent 5 to resolve.
- QC Analytics "Top Templates by Score" and "DNA Versions with Repeated
  Rejections" panels require live joins across Agent 2/3/6-owned tables
  not yet available to verify against — returns empty arrays with a
  `TODO(integration)` rather than a fabricated join.
