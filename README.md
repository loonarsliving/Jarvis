# AI Asset Factory

PT Maha Karya Haluoleo's internal system for producing brand-consistent
visual assets at scale via Higgsfield, archived in Google Drive. This is the
**application code** (this Sprint: foundation/scaffold only — see
`DECISIONS.md` and each package's README for what's implemented vs. stubbed).

Planning/FSD/TDD/Constitution documents (the actual source of truth for
every decision below) live in [`docs/ai-asset-factory/`](./docs/ai-asset-factory/):
start with [`AI_ASSET_FACTORY_BIBLE.md`](./docs/ai-asset-factory/AI_ASSET_FACTORY_BIBLE.md)
for a condensed overview, and
[`ENGINEERING_CONSTITUTION.md`](./docs/ai-asset-factory/ENGINEERING_CONSTITUTION.md)
for binding engineering rules and the module ownership map.

## What's in this Sprint (Agent 1 — Foundation & Core Architecture)

- Monorepo scaffold: `apps/*`, `packages/*`, `infra/*` per TDD §4.
- `packages/core/config` — typed `loadConfig()`, Zod-validated (TDD §31).
- `packages/core/audit` — `logAction()` writing to `audit_logs` (TDD §23).
- `packages/core/rbac` — `requirePermission()` guard + FSD §7 permission matrix.
- `packages/core/result` — `ActionResult<T>` / API error shape (TDD §29.4).
- Database migrations: roles/permissions/RBAC, `users`, `audit_logs`, `system_settings` (`infra/supabase/migrations`).
- Next.js app shell: nav, layout, login/logout, permission-gated sidebar, placeholder pages for every route in FSD §9.
- Docker: per-service Dockerfiles, `docker-compose.yml`, `Caddyfile`, self-hosted Supabase overlay reference.

Every business-logic module (`identity`, `prompt-engine`, `product-lock`,
`character-lock`, `higgsfield`, `drive`, `qc`, `mission`, `queue`,
`notifications`) is an intentional empty stub — see
`packages/core/README.md`'s ownership table. Agent 1 must not implement
business logic (Engineering Constitution Article VIII).

## Prerequisites

- Node.js 22 LTS
- [pnpm](https://pnpm.io) 9.x (`corepack enable` will provision the pinned version from `package.json`'s `packageManager` field)
- Docker + Docker Compose (for the full stack / self-hosted Supabase)

## Running locally

```bash
pnpm install
cp .env.example .env   # fill in real values — see comments in the file

# Typecheck / build everything
pnpm typecheck
pnpm build

# Web app only, against a Supabase instance you already have running
# (either the Docker stack below, or `supabase start` via the Supabase CLI
# for a lighter local-dev loop)
pnpm dev:web
```

## Running the full stack (Docker)

```bash
cp .env.example .env   # fill in real values, plus the Docker-only vars at the bottom of the file
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --wait
```

This brings up: `caddy` (host ports 80/443) → `web` → the four workers → the
self-hosted Supabase stack (`supabase-db`, `supavisor`, `supabase-auth`,
`supabase-rest`, `supabase-realtime`, `supabase-studio`) → `migrate` (one-shot,
applies `infra/supabase/migrations` before anything else starts).

`infra/supabase/docker-compose.supabase.yml` is a **trimmed reference** —
see the comment at the top of that file for what to replace it with before
production use.

## Workspace layout

```
/apps
  /web                        — Next.js app (Service 1/5)
  /worker-mission-dispatcher  — Service 2/5 (stub, Agent 2)
  /worker-higgsfield-poller   — Service 3/5 (stub, Agent 4)
  /worker-drive-sync          — Service 4/5 (stub, Agent 5)
  /worker-qc                  — Service 5/5 (stub, Agent 6)
/packages
  /core                       — @aaf/core (see its README for module ownership)
  /ui                         — @aaf/ui, Radix-based primitives
  /config                     — shared tsconfig/eslint/prettier base
/infra
  /docker                     — Dockerfiles, docker-compose.yml, Caddyfile
  /supabase                   — migrations + self-hosted Supabase overlay reference
```

## Commands

| Command | Does |
|---|---|
| `pnpm build` | Builds every workspace package/app |
| `pnpm typecheck` | Typechecks every workspace package/app |
| `pnpm lint` | Lints every workspace package/app |
| `pnpm dev:web` | Runs `apps/web` in dev mode |

See `DECISIONS.md` for choices made where the spec was ambiguous, flagged
for cross-agent review per Engineering Constitution Article VI.
