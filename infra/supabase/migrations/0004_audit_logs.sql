-- 0004_audit_logs.sql
-- Logging Engine primitive table (TDD §23, indexing per TDD §7.3). Written
-- to by packages/core/src/audit's logAction(). Append-only by design (no
-- delete/update policy, no repository update/delete function) — matches
-- Constitution Article II.5/Article III.6 "provenance and audit are not
-- optional additions".

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('user', 'system')),
  -- auth.users.id for actor_type='user'; worker instance id / service name
  -- for actor_type='system' (TDD §27 service-to-service auth) — stored as
  -- text, not a FK, since system actors are not rows in `users`.
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  justification text,
  created_at timestamptz not null default now()
);

-- TDD §7.3: "(entity_type, entity_id)", "(timestamp DESC)", "(severity)" —
-- drill-down from any entity, System Logs default sort, critical-event filtering.
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on audit_logs (created_at desc);
create index audit_logs_severity_idx on audit_logs (severity);

alter table audit_logs enable row level security;

-- System Logs page (FSD §9 Settings) is Super Admin-only; user.manage and
-- integration.manage are both Super Admin-exclusive permissions per the
-- FSD §7 matrix, so gating on either is equivalent to "Super Admin only"
-- without hardcoding the role key itself.
create policy audit_logs_select_admin on audit_logs
  for select to authenticated
  using (has_permission('user.manage') or has_permission('integration.manage'));

-- Any authenticated user may write an audit row for their OWN action —
-- system-actor rows are written exclusively via the service-role key
-- (which bypasses RLS entirely), so no policy is needed for actor_type='system'.
create policy audit_logs_insert_own on audit_logs
  for insert to authenticated
  with check (actor_type = 'user' and actor_id = auth.uid()::text);

-- Deliberately no UPDATE/DELETE policy: audit_logs is append-only.
