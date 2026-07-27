-- 0002_roles_and_permissions.sql
-- RBAC data model per FSD §6-7 and TDD §28 ("data-driven, not hardcoded" —
-- role_permissions is a table, new roles/grants are a data change, not a
-- code deploy). Seed data below is the FSD §7 permission matrix verbatim —
-- keep in lockstep with packages/core/src/rbac/permissions.ts.

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete restrict,
  permission_id uuid not null references permissions (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;

-- Reference data: readable by any authenticated user (needed for
-- client-side nav permission-gating, FSD §9), writable only via migrations
-- / the service-role key (no INSERT/UPDATE/DELETE policy granted to the
-- authenticated role in v1 — role/permission management UI, if ever built,
-- is a data change proposed through a migration or a future admin action,
-- not a direct client write path).
create policy roles_select_authenticated on roles for select to authenticated using (true);
create policy permissions_select_authenticated on permissions for select to authenticated using (true);
create policy role_permissions_select_authenticated on role_permissions for select to authenticated using (true);

-- Seed: roles (FSD §6)
insert into roles (key, name, description) values
  ('super_admin', 'Super Admin', 'Full system access: all missions, all DNA records, all settings, user management, integration configuration.'),
  ('production_manager', 'Production Manager', 'Creates and manages Missions, sets priority, views all production/quality dashboards, cannot change system integration settings.'),
  ('creative_director', 'Creative Director', 'Owns Brand DNA, Product DNA, Character DNA — creates, reviews, approves new DNA versions and turnaround sheets. Reviews Prompt Templates.'),
  ('qc_reviewer', 'QC Reviewer', 'Works the Review Console — approves/rejects flagged assets, cannot create Missions or edit DNA records.'),
  ('viewer', 'Viewer / Analyst', 'Read-only access to dashboards, Asset Library search, analytics. No production or approval actions.');

-- Seed: permissions (FSD §7, resource.action convention)
insert into permissions (key, description) values
  ('mission.create', 'Create a new Mission.'),
  ('mission.view_all', 'View all Missions.'),
  ('mission.cancel', 'Cancel a Mission.'),
  ('mission.retry', 'Retry failed jobs within a Mission.'),
  ('dna.create', 'Create a new Brand/Product/Character DNA record.'),
  ('dna.approve_version', 'Approve a new DNA version.'),
  ('dna.view', 'View DNA records.'),
  ('prompt_template.edit', 'Edit a Prompt Template.'),
  ('prompt_template.promote', 'Promote a Prompt Template version to active.'),
  ('qc.review', 'Approve/reject flagged assets in the Review Console.'),
  ('qc.override_lock_failure', 'Bypass Product/Character Lock hard gate. Super Admin + Creative Director only, mandatory justification, always notifies every Super Admin (FSD §7).'),
  ('asset.view_approved', 'View approved assets.'),
  ('asset.view_rejected', 'View rejected assets.'),
  ('asset.archive', 'Archive an asset.'),
  ('integration.manage', 'Manage integration settings (Higgsfield API keys, Google Drive service account).'),
  ('user.manage', 'Manage users and role assignments.'),
  ('analytics.view', 'View analytics/dashboards.');

-- Seed: role_permissions — FSD §7 matrix transcribed exactly.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  ('super_admin', 'mission.create'), ('super_admin', 'mission.view_all'), ('super_admin', 'mission.cancel'),
  ('super_admin', 'mission.retry'), ('super_admin', 'dna.create'), ('super_admin', 'dna.approve_version'),
  ('super_admin', 'dna.view'), ('super_admin', 'prompt_template.edit'), ('super_admin', 'prompt_template.promote'),
  ('super_admin', 'qc.review'), ('super_admin', 'qc.override_lock_failure'), ('super_admin', 'asset.view_approved'),
  ('super_admin', 'asset.view_rejected'), ('super_admin', 'asset.archive'), ('super_admin', 'integration.manage'),
  ('super_admin', 'user.manage'), ('super_admin', 'analytics.view'),

  ('production_manager', 'mission.create'), ('production_manager', 'mission.view_all'),
  ('production_manager', 'mission.cancel'), ('production_manager', 'mission.retry'),
  ('production_manager', 'dna.view'), ('production_manager', 'asset.view_approved'),
  ('production_manager', 'asset.view_rejected'), ('production_manager', 'asset.archive'),
  ('production_manager', 'analytics.view'),

  ('creative_director', 'mission.view_all'), ('creative_director', 'dna.create'),
  ('creative_director', 'dna.approve_version'), ('creative_director', 'dna.view'),
  ('creative_director', 'prompt_template.edit'), ('creative_director', 'prompt_template.promote'),
  ('creative_director', 'qc.override_lock_failure'), ('creative_director', 'asset.view_approved'),
  ('creative_director', 'asset.view_rejected'), ('creative_director', 'analytics.view'),

  ('qc_reviewer', 'mission.view_all'), ('qc_reviewer', 'dna.view'), ('qc_reviewer', 'qc.review'),
  ('qc_reviewer', 'asset.view_approved'), ('qc_reviewer', 'asset.view_rejected'), ('qc_reviewer', 'analytics.view'),

  ('viewer', 'mission.view_all'), ('viewer', 'dna.view'), ('viewer', 'asset.view_approved'),
  ('viewer', 'analytics.view')
) as seed(role_key, permission_key)
join roles r on r.key = seed.role_key
join permissions p on p.key = seed.permission_key;
