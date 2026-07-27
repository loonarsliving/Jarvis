# Agent 1 (Foundation) — Decisions Where the Spec Was Ambiguous

Per Engineering Constitution Article VI, these are documented for
cross-agent review rather than silently assumed. None block other agents'
work; all are flagged here so a reviewer can override before other Sprints
build on top of them.

1. **Package manager: pnpm.** TDD §4 says "Monorepo (npm/pnpm workspaces)"
   without picking one. Chose pnpm — faster installs, strict
   node_modules by default (catches phantom-dependency bugs earlier, which
   matters across 7 agents' workspaces), and it's already present in this
   environment. Documented in `package.json`'s `packageManager` field and
   `README.md`.

2. **`rbac` as its own `@aaf/core` subpath, not listed in TDD §3's module
   table.** TDD §3 enumerates `db, identity, prompt-engine, product-lock,
   character-lock, higgsfield, drive, qc, mission, queue, notifications,
   audit, config` — no `rbac`/`auth` module. But Constitution Article VIII
   explicitly assigns Agent 1 "the RBAC guard utility" as a deliverable.
   Rather than bolting `requirePermission()` onto `audit` (mixing concerns)
   or `config` (wrong domain), added `packages/core/src/rbac/` as
   foundation/cross-cutting infrastructure, exported as `@aaf/core/rbac`.
   Flagged for review: should a future TDD revision fold this into an
   existing module instead?

3. **`ActionResult<T>` / API error shape live in `@aaf/core/result`, also
   not in TDD §3's module list.** Same reasoning as #2 — Constitution
   Article VIII assigns Agent 1 "general error handling scaffolding: the
   ActionResult<T> pattern, standard API error shape." Kept as its own
   small subpath rather than attaching it to an unrelated module.

4. **Settings pages (`Integrations`, `Users & Roles`, `System Logs`)
   scaffolded as placeholders, not wired to real logic, despite Article
   VIII listing "settings shell" under Agent 1's `apps/web` scope.**
   Interpreted "shell" as routing/layout only (consistent with the
   explicit instruction that ALL nav pages this Sprint are placeholders) —
   NOT full CRUD for user provisioning or integration key management, since
   building those out would mean writing Server Actions against tables/
   flows no other TDD section fully specifies yet (e.g., there's no TDD
   section for "how does the Integrations page write Higgsfield keys").
   Flagged for review: if Settings truly is fully Agent 1's to implement
   (not just scaffold), that's a scope addition beyond what this Sprint's
   task description asked for ("empty placeholder pages are fine").

5. **Docker Compose / self-hosted Supabase secrets (`POSTGRES_PASSWORD`,
   `SUPABASE_JWT_SECRET`, `SUPAVISOR_SECRET_KEY_BASE`,
   `SUPAVISOR_VAULT_ENC_KEY`, `AAF_DOMAIN`) are NOT in `packages/core/config`'s
   Zod schema.** TDD §30's table is scoped to variables `@aaf/core`-based
   services read via `loadConfig()`. These four are consumed directly by
   the Supabase *containers themselves* (GoTrue, Supavisor, Postgres) —
   no application code reads them — so adding them to the app-level schema
   would be misleading (implies an app service needs them). Documented
   instead in `.env.example` under a clearly separated "Docker Compose /
   self-hosted Supabase stack only" section.

6. **`infra/supabase/docker-compose.supabase.yml` is a trimmed reference,
   not Supabase's actual official self-hosted compose export.** TDD §38/§40.4
   call for vendoring the real official file. Fully vendoring it here would
   mean copying a large, frequently-updated third-party file into the repo
   sight-unseen in an offline scaffolding pass — riskier than writing a
   deliberately minimal version covering exactly the services TDD §40.2
   names (`supabase-db`, `supabase-auth`, `supabase-rest`,
   `supabase-realtime`, `supabase-studio`, plus Supavisor per §7.6) with a
   loud comment explaining what's missing (Kong, Storage, ImgProxy,
   postgres-meta) and why. Whoever does the pre-production deployment pass
   should swap this for the real upstream file per TDD §40.4's own
   "tested in a staging pass" instruction — this was always going to be a
   deployment-time step, not something correctly automatable from docs
   alone.

7. **Health checks for worker stubs use a bare `node:http` server, not a
   framework.** TDD §37 only specifies the `/health` contract (process up,
   DB reachable, last-tick staleness), not an implementation. Workers have
   no HTTP framework dependency otherwise (TDD §5: "no UI code, no Next.js
   dependency") — pulling in Express/Fastify for one health route seemed
   like unjustified weight, so `node:http`'s built-in `createServer` is
   used directly. DB-reachability is currently stubbed `true` since there's
   no real query for these stub loops to run yet; the owning agent should
   wire an actual `select 1` through `@aaf/core/db` when it replaces the
   loop body.

8. **`Database` type in `packages/core/src/db/client.ts` is `any` with an
   explicit lint-disable, not a hand-rolled placeholder type.** TDD §7.1
   specifies `supabase gen types typescript` generates this from a *live*
   schema — there is no running Supabase instance in this scaffolding
   pass to generate against. Rather than hand-writing a fake/partial type
   that would silently drift from the real one, left it as a documented,
   narrow `any` (permitted per Constitution Article IV.1: "no `any` except
   at a documented, narrow external-API boundary"). First agent to run
   against a live instance should run the generator and replace this.

9. **`moddatetime` extension assumed available in self-hosted Supabase's
   default extension set** (used for `updated_at` triggers in `users` and
   `system_settings`). This is Supabase's documented convention but wasn't
   verified against a live instance in this pass — if a target environment
   lacks it, swap for a hand-written `set updated_at = now()` trigger
   function (one-line change, called out in both migration files' comments).

10. **NFR-8 (Bahasa Indonesia as primary UI language)**: applied to
    user-facing action copy (login form, buttons) but NOT to the sidebar
    nav labels, which are transcribed verbatim from FSD §9 in English
    (matching the FSD's own nav diagram) and placeholder page owner notes
    (internal/engineering-facing text, not end-user UI copy). Business
    pages built in later Sprints should follow FSD §9's precedent: nav
    structure/technical terms in English, everything else in Bahasa
    Indonesia.
