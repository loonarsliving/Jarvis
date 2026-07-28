# @aaf/core

Shared business-logic workspace package consumed by `apps/web` and all four
`apps/worker-*` services. Module boundaries below are binding per
`docs/ai-asset-factory/ENGINEERING_CONSTITUTION.md` Article V/VIII — each
module exposes a narrow public interface (`index.ts`) and may not be reached
into internally by another module's owner.

## Module Ownership Map (mirrors Constitution Article VIII)

| Module | Owner | Status in this Sprint |
|---|---|---|
| `config/` | Agent 1 (Foundation) | **Implemented** — typed `loadConfig()`, Zod-validated against TDD §30 |
| `audit/` | Agent 1 (Foundation) | **Implemented** — `logAction()`, TDD §23 |
| `db/` | Agent 1 (Foundation) | **Implemented** — Supabase client factory, migration tooling lives in `/infra/supabase` |
| `identity/` | Agent 3 (AI Intelligence) | Stub — do not implement business logic here (Constitution Article VIII) |
| `prompt-engine/` | Agent 3 (AI Intelligence) | Stub |
| `product-lock/` | Agent 6 (Quality Intelligence) | Stub |
| `character-lock/` | Agent 6 (Quality Intelligence) | Stub |
| `higgsfield/` | Agent 4 (Render Provider Framework) | Stub |
| `drive/` | Agent 5 (Asset Library) | Stub |
| `qc/` | Agent 6 (Quality Intelligence) | Stub |
| `mission/` | Agent 2 (Mission Engine) | Stub |
| `queue/` | Agent 2 (Mission Engine) — shared primitive, consumed by Agents 4/5/6 | Stub |
| `notifications/` | Agent 7 (Dashboard & Analytics) | **Implemented** — Notification Engine, FSD §21 |
| `analytics/` | Agent 7 (Dashboard & Analytics) | **Implemented** — Analytics Engine, TDD §22. Not in TDD §3's original module list — added per the same documented-ambiguity pattern as `rbac`/`result` (root `DECISIONS.md` items 2-3); see `DECISIONS-agent7.md` item 2 |

Each remaining stub folder contains its own `README.md` restating its owner
and a placeholder `index.ts` that exports nothing yet (so the package
builds cleanly) — this is intentional per Article VIII ("Foundation...
never touches any business-logic module").

## Import boundaries

Lint (`packages/config/eslint.base.mjs`) forbids reaching into another
module's `internal/*` path. Cross-module dependencies must be expressed as
TypeScript interfaces in the depended-upon module's public `index.ts`
(Constitution Article III.4).
