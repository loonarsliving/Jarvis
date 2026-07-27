-- 0003_users.sql
-- Wires application users to Supabase Auth's `auth.users` (TDD §27). This
-- table is the row RLS policies join through to resolve "what can the
-- current session do" (TDD §7.1, §28 layer 2). No self-registration (FSD
-- §27/TDD §27) — rows are provisioned by a Super Admin via a service-role
-- Server Action, never a direct authenticated-client INSERT.

create table users (
  id uuid primary key references auth.users (id) on delete restrict,
  email text not null unique,
  full_name text not null,
  role_id uuid not null references roles (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_role_id_idx on users (role_id);

-- moddatetime is provided by the `moddatetime` extension bundled in
-- self-hosted Supabase's default extension set; if unavailable in a given
-- environment, replace with an equivalent trigger function.
create extension if not exists moddatetime schema extensions;

create trigger users_set_updated_at
  before update on users
  for each row
  execute function extensions.moddatetime(updated_at);

alter table users enable row level security;

-- Helper functions — SECURITY DEFINER so they can read `users`/`role_permissions`
-- regardless of the calling role's own RLS visibility, while still only
-- ever resolving permissions for auth.uid() (never an arbitrary user id
-- passed in), which is what keeps this safe to expose to `authenticated`.
create function current_user_role_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.key
  from users u
  join roles r on r.id = u.role_id
  where u.id = auth.uid();
$$;

create function has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from users u
    join role_permissions rp on rp.role_id = u.role_id
    join permissions p on p.id = rp.permission_id
    where u.id = auth.uid()
      and p.key = permission_key
      and u.status = 'active'
  );
$$;

-- A user can always see their own row; user.manage grants visibility into
-- every row (Users & Roles settings page, FSD §9, Super Admin only).
create policy users_select_self_or_managed on users
  for select to authenticated
  using (id = auth.uid() or has_permission('user.manage'));

-- No INSERT/UPDATE/DELETE policy for `authenticated` — provisioning and
-- role changes go through the service-role key from a Server Action that
-- has already run requirePermission('user.manage') (TDD §28 layer 1); RLS
-- here is deliberately the backstop that makes a forgotten guard call
-- non-exploitable, not the primary write path.
