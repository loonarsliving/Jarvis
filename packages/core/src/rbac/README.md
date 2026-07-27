# rbac

Owner: **Agent 1 (Foundation)** — the `requirePermission()` guard utility
called out explicitly in Engineering Constitution Article VIII.

Implements TDD §28's layer-1 enforcement (application-level permission
check) against the role/permission matrix from FSD §7. Layer 2 (Postgres
RLS) lives in `infra/supabase/migrations`. See `permissions.ts` for the
FSD-derived matrix and `guard.ts` for `requirePermission()`.

Not listed under `@aaf/core`'s module architecture in TDD §3 (that table
lists the business/domain modules) — this is foundation/cross-cutting
infrastructure, exported as `@aaf/core/rbac`. If a later spec revision adds
it explicitly to TDD §3, this README should be updated to reference that.
