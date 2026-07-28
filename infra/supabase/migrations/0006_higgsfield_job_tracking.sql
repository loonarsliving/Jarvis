-- 0006_higgsfield_job_tracking.sql
-- Agent 4 (Render Provider Framework) — Higgsfield-specific job-tracking
-- tables, per infra/supabase/migrations/README.md's reservation: "Higgsfield
-- job-tracking tables (if any beyond generation_jobs) | Agent 4".
--
-- `generation_jobs` itself (the Render Queue, TDD §10.2) is Agent 2's table
-- and is NOT created here — this migration only adds the two tables that
-- are specific to this module's own responsibilities and don't belong on
-- Agent 2's row shape:
--
-- 1. `higgsfield_soul_id_training_jobs` — Soul ID training is tracked
--    separately from `generation_jobs` (TDD §11 background jobs table lists
--    "Soul ID Training Poller tick" as polling "in-flight
--    soul_id_training_jobs" distinctly from the Generation Poller/
--    `generation_jobs`) because it has its own status vocabulary, its own
--    60s/45min poll/timeout profile (TDD §9.8), and is keyed by Character
--    DNA version rather than by Mission/job. Shaped consistently with the
--    common job-row template (TDD §10.3) even though it isn't one of the
--    four enumerated queue tables, since it's polled/claimed the same way.
--
-- 2. `higgsfield_cost_ledger` — cost/quota tracking (TDD §9.9). Ideally
--    cost would be a column pair on `generation_jobs` itself ("recorded
--    ... against the job row"), but `generation_jobs` does not exist yet
--    in this migration timeline (Agent 2 builds it in a parallel worktree)
--    and Constitution Article VIII forbids Agent 4 writing into another
--    agent's owned table/migration. An append-only ledger, referencing
--    `generation_jobs.id` / this migration's own training-job id by value
--    (not a DB foreign key — see column comment) keeps cost data durable
--    and queryable for the Dashboard (NFR-10) without requiring
--    coordination on migration ordering across parallel agent worktrees.
--    TODO(integration): once `generation_jobs` exists in the merged
--    schema, a follow-up migration should add a proper
--    `references generation_jobs(id) on delete restrict` FK constraint to
--    `higgsfield_cost_ledger.generation_job_id` (documented as a real
--    ambiguity resolution in docs/ai-asset-factory/DECISIONS-agent-4.md).

create table higgsfield_soul_id_training_jobs (
  id uuid primary key default gen_random_uuid(),
  -- Not a DB foreign key: character_dna_versions is Agent 3's table and may
  -- not exist yet in this migration timeline (same cross-agent-parallel-
  -- build reasoning as higgsfield_cost_ledger below).
  character_dna_version_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'training', 'succeeded', 'failed', 'retrying', 'dead_letter')),
  higgsfield_training_id text,
  reference_image_ids text[] not null default '{}',
  soul_id_reference text,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  failure_reason text,
  claimed_by text,
  claimed_at timestamptz,
  enqueued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mirrors the canonical claim query's WHERE clause (TDD §10.4) against this
-- table's own status/next_retry_at columns.
create index higgsfield_soul_id_training_jobs_claim_idx
  on higgsfield_soul_id_training_jobs (status, next_retry_at);
create index higgsfield_soul_id_training_jobs_character_dna_idx
  on higgsfield_soul_id_training_jobs (character_dna_version_id);

alter table higgsfield_soul_id_training_jobs enable row level security;

-- Worker-only table (service-role key bypasses RLS entirely, TDD §27) — the
-- only human-facing surface is Job Monitor read access, gated the same way
-- as other queue tables' eventual RLS policy (mission.view-equivalent
-- permission). Scoped narrowly here since Agent 2's `mission.view`
-- permission key is the intended gate but its exact key name is Agent 2's
-- to confirm; left commented rather than guessed to avoid baking in a
-- wrong permission key (Constitution Article VI: escalate rather than
-- invent).
-- TODO(integration): add a select policy once Agent 2 confirms the
-- Job Monitor's read-permission key for Render-Queue-adjacent tables.

create table higgsfield_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null check (job_kind in ('generation', 'soul_id_training')),
  -- References generation_jobs.id (job_kind='generation', Agent 2's table)
  -- or higgsfield_soul_id_training_jobs.id (job_kind='soul_id_training',
  -- this migration) by value only — see header comment for why this isn't
  -- a DB-level FK yet.
  job_id uuid not null,
  higgsfield_job_id text not null,
  credit_amount numeric not null,
  currency text not null default 'credits' check (currency in ('credits', 'usd')),
  was_estimated boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index higgsfield_cost_ledger_job_idx on higgsfield_cost_ledger (job_kind, job_id);
create index higgsfield_cost_ledger_recorded_at_idx on higgsfield_cost_ledger (recorded_at desc);

alter table higgsfield_cost_ledger enable row level security;
-- TODO(integration): same RLS-policy note as above — append-only,
-- worker-written via service role; human read access policy pending
-- confirmation of the Dashboard's cost-visibility permission key (NFR-10).

-- Per Constitution Article II.5 / TDD §7.5: no hard deletes, status
-- transitions only — no DELETE policy/capability is provided on either
-- table, consistent with every other business-data table in this schema.
