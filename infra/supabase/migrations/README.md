# Migrations

Hand-written SQL, sequentially numbered, forward-only (TDD §7.1/§7.7) — no
ORM, no down-migrations maintained. Run automatically as a one-shot init
container step before `web`/workers start (TDD §38/§39, wired in
`infra/docker/docker-compose.yml`'s `migrate` service).

## This Sprint (Agent 1 — Foundation)

| Migration | Contents |
|---|---|
| `0001_extensions.sql` | `pgcrypto`, `pg_trgm` |
| `0002_roles_and_permissions.sql` | `roles`, `permissions`, `role_permissions` + FSD §7 seed data |
| `0003_users.sql` | `users` (wired to `auth.users`), `current_user_role_key()`, `has_permission()` helper functions used by every later RLS policy |
| `0004_audit_logs.sql` | `audit_logs` (TDD §23), indexed per TDD §7.3 |
| `0005_system_settings.sql` | `system_settings` (TDD §31), LISTEN/NOTIFY trigger for cache invalidation |

## Reserved — do not renumber into these ranges

The following tables are **explicitly out of scope for Agent 1** and are
owned by the agents below, per Engineering Constitution Article VIII. Their
migrations start at `0006` and up — coordinate numbering with the other
agents' Sprints before adding a new migration file so two agents never claim
the same number:

| Table(s) | Owning agent |
|---|---|
| `missions`, `generation_jobs` | Agent 2 — Mission Engine (`mission`, `queue` modules) |
| `product_dna_versions`, `character_dna_versions`, `brand_dna_versions`, `prompt_templates`, `prompt_template_versions` | Agent 3 — AI Intelligence (`identity`, `prompt-engine`) |
| Higgsfield job-tracking tables (if any beyond `generation_jobs`) | Agent 4 — Render Provider Framework (`higgsfield`) |
| `assets`, `asset_metadata`, `asset_embeddings`, `storage_usage_snapshots` | Agent 5 — Asset Library (`drive`) |
| `qc_reports` | Agent 6 — Quality Intelligence (`qc`, `product-lock`, `character-lock`) |
| `mission_summary_mv` (materialized view), analytics aggregations | Agent 7 — Dashboard & Analytics |
| `notifications` | Agent 7 — Dashboard & Analytics (notifications area) |

All of the above must, per TDD §7.5, use `ON DELETE RESTRICT` (never
`CASCADE`) on foreign keys and provide no application-level `DELETE`
capability — status transitions only.
