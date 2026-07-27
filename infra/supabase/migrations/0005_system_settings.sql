-- 0005_system_settings.sql
-- Operational configuration a Super Admin can tune without a redeploy
-- (TDD §31) — QC thresholds, retry counts, notification toggles, Mission
-- auto-pause thresholds, etc. Distinct from env vars (TDD §30, deployment-
-- time/secret config): this table is for values a non-engineer should be
-- able to adjust via the Settings UI. Readers cache in-process with a short
-- TTL and invalidate via LISTEN/NOTIFY per TDD §31 — that cache lives in
-- each service's own code, not in this migration.

create table system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete restrict
);

create extension if not exists moddatetime schema extensions;

create trigger system_settings_set_updated_at
  before update on system_settings
  for each row
  execute function extensions.moddatetime(updated_at);

alter table system_settings enable row level security;

-- Readable by any authenticated user: several operational values (e.g. a
-- Mission auto-pause threshold surfaced in the UI) are informational, not
-- secret. Writes are gated to integration.manage (Super Admin-exclusive,
-- FSD §7), matching the Settings > Integrations page's permission scope.
create policy system_settings_select_authenticated on system_settings
  for select to authenticated
  using (true);

create policy system_settings_write_admin on system_settings
  for insert to authenticated
  with check (has_permission('integration.manage'));

create policy system_settings_update_admin on system_settings
  for update to authenticated
  using (has_permission('integration.manage'))
  with check (has_permission('integration.manage'));

-- LISTEN/NOTIFY trigger: fires a notification on the `system_settings_changed`
-- channel with the changed key, so services can invalidate their in-process
-- cache proactively (TDD §31) instead of polling.
create function notify_system_settings_change()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('system_settings_changed', coalesce(new.key, old.key));
  return coalesce(new, old);
end;
$$;

create trigger system_settings_notify
  after insert or update on system_settings
  for each row
  execute function notify_system_settings_change();

-- Seed: the specific operational values named explicitly in the TDD as
-- examples of what belongs here (§31, §25). Owning agents add their own
-- keys via later migrations as their engines need new tunables — this
-- Sprint seeds only the ones already named in binding docs, to avoid
-- inventing thresholds the FSD/TDD never specified.
insert into system_settings (key, value, description) values
  ('retry.max_attempts', '4', 'Max automatic retry attempts before a job moves to dead_letter (TDD §25).'),
  ('retry.backoff_base_ms', '20000', 'Base exponential backoff delay in ms (TDD §25: 20s/40s/80s/160s).'),
  ('retry.jitter_pct', '0.10', 'Jitter percentage applied to each computed backoff delay (TDD §25).');
