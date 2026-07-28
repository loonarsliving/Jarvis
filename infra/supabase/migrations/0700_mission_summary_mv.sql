-- 0700_mission_summary_mv.sql
-- Owner: Agent 7 (Dashboard & Analytics), per Engineering Constitution
-- Article VIII and infra/supabase/migrations/README.md's reserved-range
-- table ("mission_summary_mv (materialized view), analytics aggregations
-- -> Agent 7"). Numbering: Agent 7 claims the 0700-0799 block for its own
-- migrations rather than guessing the next free number in the 0006+ range
-- while Agents 2-6 are adding their own migrations in parallel worktrees
-- (README.md: "coordinate numbering... before adding a new migration file
-- so two agents never claim the same number") — see DECISIONS-agent7.md
-- item 1 for the full rationale. Whoever integrates all seven branches
-- renumbers into one final sequential order; this file's *content* is what
-- matters for review, not its literal filename number.
--
-- TDD §7.4: "mission_summary_mv: refreshed every 5 minutes by a dedicated
-- lightweight job inside web's own process ... via REFRESH MATERIALIZED
-- VIEW CONCURRENTLY (non-blocking, requires a unique index on the MV,
-- included in its migration)."
--
-- TDD §22 (Analytics Engine): "own the mission_summary_mv refresh (§7.4)
-- ... all aggregation is SQL-native ... no application-level aggregation
-- loop over raw rows."
--
-- FSD §8 (Main Dashboard): "reads from mission_summary_mv (materialized/
-- aggregated view)" — backs the Mission Progress panel and the
-- "Active Missions" KPI without a live join at request time (NFR-6).
--
-- TODO(integration): this migration references `missions`, `generation_jobs`,
-- and `assets`, which are owned by Agent 2 (missions/generation_jobs) and
-- Agent 5 (assets) and do not exist yet in this isolated worktree. The SQL
-- below is written against the exact shapes documented in
-- docs/ai-asset-factory/fsd/07-database-erd-dashboards.md (the binding
-- ERD) and TDD §7.3's indexing table, so it should be correct once those
-- agents' migrations are merged ahead of this one in the final sequence.
-- This migration MUST run after: Agent 2's `missions`/`generation_jobs`
-- migrations and Agent 5's `assets` migration. It cannot literally execute
-- in this worktree until then — that is expected, not a bug in this file.

create materialized view mission_summary_mv as
select
  m.id as mission_id,
  m.name as mission_name,
  m.subject_type,
  m.status as mission_status,
  m.priority,
  m.target_quantity,
  m.jobs_total,
  m.jobs_completed,
  m.jobs_failed,
  m.created_by,
  m.created_at,
  -- Job-status breakdown, recomputed from generation_jobs rather than
  -- trusted from missions.jobs_total/jobs_completed/jobs_failed alone,
  -- since the Render Queue panel (FSD §8) needs the finer-grained
  -- queued/running/retrying/dead_letter split that the missions table's
  -- own counters (TDD §20, only completed/failed) don't carry.
  coalesce(jobs.jobs_queued, 0) as jobs_queued,
  coalesce(jobs.jobs_running, 0) as jobs_running,
  coalesce(jobs.jobs_retrying, 0) as jobs_retrying,
  coalesce(jobs.jobs_dead_letter, 0) as jobs_dead_letter,
  -- Asset-status breakdown per mission (FSD §8 Mission Progress panel +
  -- Journey A step 11 "X approved, Y rejected, Z pending") — assets don't
  -- carry mission_id directly (ERD: assets 1--1 generation_jobs, generation_jobs
  -- *--1 missions), so this is the one join this view exists to avoid
  -- having to repeat live at every dashboard page load.
  coalesce(assets.approved_count, 0) as approved_assets,
  coalesce(assets.rejected_count, 0) as rejected_assets,
  coalesce(assets.pending_review_count, 0) as pending_review_assets,
  now() as refreshed_at
from missions m
left join lateral (
  select
    count(*) filter (where gj.status = 'queued') as jobs_queued,
    count(*) filter (where gj.status in ('submitted', 'running', 'retrieving', 'ingested')) as jobs_running,
    count(*) filter (where gj.status = 'dead_letter' and gj.attempt_count < 4) as jobs_retrying,
    -- Retry policy is "4 attempts max" (Bible: Retry Policy, TDD §25) — a
    -- job that has exhausted attempt_count is a true dead letter; this
    -- mirrors that ceiling rather than hardcoding a magic number the
    -- owning agent (Agent 2) might tune via system_settings later.
    -- TODO(integration): if Agent 2's retry ceiling is externalized to
    -- system_settings('retry.max_attempts') at read time instead of a
    -- fixed 4, swap this literal for a join against that key.
    count(*) filter (where gj.status = 'dead_letter' and gj.attempt_count >= 4) as jobs_dead_letter
  from generation_jobs gj
  where gj.mission_id = m.id
) jobs on true
left join lateral (
  select
    count(*) filter (where a.status = 'approved') as approved_count,
    count(*) filter (where a.status = 'rejected') as rejected_count,
    count(*) filter (where a.status = 'needs_review') as pending_review_count
  from assets a
  join generation_jobs gj2 on gj2.id = a.generation_job_id
  where gj2.mission_id = m.id
) assets on true;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index (TDD
-- §7.4) — mission_id is unique per row by construction (one row per
-- mission) so it's the natural candidate.
create unique index mission_summary_mv_mission_id_idx on mission_summary_mv (mission_id);

-- Supporting index for the Mission Progress panel's default sort
-- (most-recently-created active missions first) and the "Active Missions"
-- KPI's status filter.
create index mission_summary_mv_status_idx on mission_summary_mv (mission_status);

-- Wrapped in a SECURITY DEFINER function so `web`'s scheduled refresh
-- (apps/web/instrumentation.ts, TDD §7.4 "internal timer inside web's own
-- process") can invoke it via `supabase.rpc()` under the anon/authenticated
-- client without needing broader materialized-view privileges, and so the
-- service-role worker path and the RPC path share one definition (Article
-- III.3 "no duplicate logic").
create function refresh_mission_summary_mv()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently mission_summary_mv;
end;
$$;

-- Only a system/service actor should trigger a refresh (it's a scheduled
-- job, not a user action) — restricting EXECUTE to service_role keeps this
-- off the authenticated-client attack surface entirely; `web`'s internal
-- timer calls this using the service-role client (packages/core/src/db
-- createServiceRoleClient), never the user-scoped client.
revoke execute on function refresh_mission_summary_mv() from public;
grant execute on function refresh_mission_summary_mv() to service_role;

-- Materialized views don't support RLS policies directly in Postgres;
-- access is controlled by table-level GRANTs instead. Readable by any
-- authenticated user (FSD §8: "Visible to all roles (analytics.view)") —
-- the application-level requirePermission('analytics.view') guard (TDD §28
-- layer 1) is the primary gate; this GRANT is the layer-2 backstop.
grant select on mission_summary_mv to authenticated;
