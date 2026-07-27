# TDD §1–6: System, Service, Module, Folder, Project, Component Architecture

Status: **Technical Design Document (TDD) — Phase 3.** Builds on Master Planning (`docs/ai-asset-factory/00-overview.md`–`08-roadmap-risks.md`) and the approved FSD (`docs/ai-asset-factory/fsd/`). No application code is written in this phase. This is the engineering blueprint.

## Stack Decisions (binding for implementation)

| Concern | Decision | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS, TypeScript strict | Matches PT Maha Karya Haluoleo's existing engineering competency (MK Connect is Next.js/TypeScript) — minimizes onboarding cost, per Master Planning `01-research-mkconnect.md` stack survey. |
| Web/API framework | Next.js 15 (App Router) | Same reasoning — reuses proven patterns (Server Actions, repository/service layering) already validated in `mkhsistem`, without importing any of its code. |
| Database | Postgres via **self-hosted Supabase** (Docker Compose stack: Postgres, GoTrue Auth, PostgREST, Realtime, Storage disabled/unused, Studio) | Mini PC deployment target (§40) favors an on-prem, no-recurring-cloud-cost setup; Supabase's self-hosted Docker Compose distribution is officially supported and mirrors the DB/Auth/RLS model the team already knows from MK Connect. Google Drive is the asset store — Supabase Storage is provisioned but unused for asset binaries (metadata/index only). |
| Queue | **Postgres-native job queue** (`FOR UPDATE SKIP LOCKED` claim pattern), no separate broker (Redis/RabbitMQ) in v1 | Avoids an extra infrastructure dependency on a single Mini PC; Postgres-backed queues are proven sufficient at this system's expected volume (thousands, not millions, of jobs/day) and match the atomic-claim pattern already validated in MK Connect's render-job claiming (Master Planning `01-research-mkconnect.md` §3.6). Revisit only if queue throughput data in production shows Postgres contention (documented as a Scalability Strategy trigger, §35). |
| Background workers | Standalone Node.js worker processes, one Docker container per worker role | Mirrors MK Connect's proven pattern of moving long-running/polling work off the web process (`Dockerfile.render-worker`), necessary here too since Higgsfield generation and Drive sync exceed reasonable HTTP request lifetimes. |
| Object storage | Google Drive (service account) | Per FSD; no change. |
| Generation provider | Higgsfield API | Per FSD; wrapped behind an internal provider interface (§9). |
| Containerization | Docker + Docker Compose | Required for Mini PC deployment (§40) — single-host orchestration, no Kubernetes (unjustified complexity for one physical host). |
| Reverse proxy | Caddy (automatic HTTPS, simple config) | Lightweight, low-maintenance choice appropriate for a single Mini PC host, avoids hand-rolling TLS/nginx config. |

## 1. Overall System Architecture

```
                         +------------------------+
                         |   Caddy (reverse proxy) |
                         +-----------+------------+
                                     |
                    +----------------+----------------+
                    |                                 |
           +--------v-------+                +--------v---------+
           |  Web/API (Next.js) |            |  Supabase Stack    |
           |  container         |<---------->|  (Postgres/Auth/   |
           +--------+-------+                |   PostgREST)       |
                    |                        +--------------------+
                    | (enqueues via DB)              ^
                    v                                 |
      +-------------+--------------------------------+
      |    Postgres-native Job Queue (tables)          |
      +----+--------+--------+--------+--------+-------+
           |        |        |        |        |
     +-----v--+ +---v----+ +-v------+ +v-------+ +v--------+
     |Mission | |Render  | |Upload  | |QC      | |Retry/   |
     |Dispatch| |Worker  | |Worker  | |Worker  | |Archive  |
     |Worker  | |(Higgs- | |(Drive) | |        | |Worker   |
     |        | | field) | |        | |        | |         |
     +--------+ +---+----+ +---+----+ +--------+ +---------+
                    |           |
              +-----v---+  +----v-----+
              |Higgsfield|  |Google    |
              |   API    |  |Drive API |
              +----------+  +----------+
```

All worker containers and the web container connect to the same Postgres database as the coordination point — there is no separate message broker. The web container never talks to Higgsfield or Google Drive directly for production generation (only for admin/preview actions like DNA turnaround generation, which reuses the same job-queue path rather than a synchronous call, keeping the web process fast and stateless).

## 2. Service Architecture

Five deployable service units, each a separate Docker container/image, all stateless (all state lives in Postgres or Google Drive — no service holds durable state on local disk beyond ephemeral download buffers):

1. **`web`** — Next.js app: Dashboard UI, all human-facing pages from the FSD, API routes for UI data fetching, Server Actions for human-initiated mutations (create Mission, approve/reject asset, edit DNA, etc.). Does not run any polling loop.
2. **`mission-dispatcher`** — polls `generation_jobs` for `queued` rows matching capacity, assembles prompts (via the Prompt Engine module, shared library — §13), claims and transitions jobs to `submitted`, calls the Higgsfield Integration Layer.
3. **`higgsfield-poller`** — polls in-flight Higgsfield jobs for status, on success hands off to the Upload Worker via a queue row, on failure applies retry/backoff logic (§25).
4. **`drive-sync-worker`** — handles all Google Drive writes: folder resolution/creation, file upload, metadata sidecar write, the hourly Reconciliation Job, and the Archive Queue.
5. **`qc-worker`** — runs Quality Control checks (Product/Character Fidelity, Technical Quality, Brand Compliance) against newly-ingested assets, writes `qc_reports`, applies the auto-approve/needs-review/blocked decision.

A sixth logical role, **`scheduler`**, is not a separate container — it is a lightweight internal timer inside each worker (each worker owns its own polling interval) rather than a central cron dispatcher, so no single scheduler process is a single point of failure for every worker's cadence (learned directly from Master Planning's critique of MK Connect's single-worker dependency, `01-research-mkconnect.md` §3.6).

All five services share a single internal npm package (`@aaf/core`) containing the Prompt Engine, DNA models, QC scoring logic, and database access layer — **not duplicated per service** — so a scoring-rule change is made once and both `qc-worker` and any admin preview tooling in `web` stay consistent.

## 3. Module Architecture

Internal module boundaries within `@aaf/core` (a TypeScript workspace package, not a runtime service):

```
@aaf/core
├── db/              — typed query layer (see §7), migrations
├── identity/         — Brand/Product/Character DNA models + versioning logic
├── prompt-engine/     — modular prompt assembly (§13)
├── product-lock/      — Product Lock scoring/validation (§14)
├── character-lock/    — Character Lock scoring/validation (§15)
├── higgsfield/         — Higgsfield API client + request/response mapping (§9)
├── drive/               — Google Drive client + path/naming resolution (§8)
├── qc/                   — QC scoring orchestration (§21)
├── mission/              — Mission lifecycle state machine (§20)
├── queue/                 — job queue primitives: enqueue/claim/complete/fail (§10)
├── notifications/          — notification dispatch (email/in-app/WhatsApp bridge)
├── audit/                   — structured audit logging (§23)
└── config/                   — typed environment/configuration loader (§31)
```

Each module exposes a narrow public interface (`index.ts`) and forbids reaching into another module's internals — enforced by lint rule (import boundaries), not just convention, from day one (a discipline MK Connect's own layering — `app → features/actions → repositories → services → lib` — demonstrates the value of, per Master Planning `01-research-mkconnect.md` §1).

### Per-module specification template (applied to every engine module in later sections)

Every module documented in this TDD (Prompt Engine, Product Lock Engine, Character Lock Engine, Brand DNA Engine, Metadata Engine, Asset Index Engine, Search Engine, Mission Engine, QC Engine, Analytics Engine, Logging Engine) follows this structure: **Purpose, Responsibilities, Input, Output, Dependencies, Data Flow, Failure Cases, Recovery Strategy** — applied in §13–23.

## 4. Folder Structure

Monorepo (npm/pnpm workspaces), single Git repository (this `jarvis` repo, under a dedicated top-level application directory once implementation begins — not mixed with the planning docs):

```
/apps
  /web                    — Next.js application (Service 1)
  /worker-mission-dispatcher
  /worker-higgsfield-poller
  /worker-drive-sync
  /worker-qc
/packages
  /core                   — @aaf/core (module architecture above)
  /ui                     — shared React component library used only by /apps/web
  /config                 — shared tsconfig/eslint/prettier base configs
/infra
  /docker                 — Dockerfiles per app, docker-compose.yml, Caddyfile
  /supabase               — self-hosted Supabase compose overlay + migrations
/docs
  /ai-asset-factory        — this planning/FSD/TDD documentation tree (already exists)
```

Rationale for a monorepo over separate repos: five services share one core package and one database schema — a monorepo keeps them versioned and deployed together, avoiding the cross-repo version-skew risk that would otherwise exist between (e.g.) the QC scoring logic used by `web`'s preview tooling and by `worker-qc`'s production path.

## 5. Project Structure

Within `/apps/web` (Next.js), the folder layering mirrors — deliberately, for team familiarity — the pattern already proven in MK Connect (Master Planning `01-research-mkconnect.md` §1):

```
/apps/web
  /app                — routes only (pages, layouts, route handlers)
    /(app)/dashboard
    /(app)/missions
    /(app)/identity
    /(app)/prompts
    /(app)/qc
    /(app)/queue
    /(app)/drive
    /(app)/settings
    /api                — thin route handlers, delegate to @aaf/core services
  /features
    /<feature>/actions   — Server Actions (thin: validate input, call @aaf/core, return result)
    /<feature>/components
    /<feature>/schemas   — Zod schemas for form validation
  /components/ui         — from @aaf/ui
  /lib                    — web-only glue (session/auth helpers, RBAC guard wrapper)
```

Server Actions never contain business logic directly — they validate input, call into `@aaf/core` module functions, and translate the result into the FSD's `ActionResult` success/error contract (same never-throw discipline already proven effective in MK Connect, `01-research-mkconnect.md` §3.3).

Each `/apps/worker-*` service is deliberately minimal: an entrypoint (`main.ts`) that starts a polling loop calling into the relevant `@aaf/core` module functions, plus its own `Dockerfile` — no UI code, no Next.js dependency.

## 6. Component Structure

UI components (`@aaf/ui`, consumed only by `/apps/web`) follow atomic-ish layering, matching the FSD's wireframes (`fsd/07-database-erd-dashboards.md`):

- **Primitives**: button, input, select, dialog, table, badge, progress-bar, toast (thin wrappers over Radix UI primitives, matching MK Connect's proven component base, `01-research-mkconnect.md` §1, for visual/behavioral consistency without importing MK Connect's code).
- **Composed**: `MissionProgressCard`, `QCScoreBreakdown`, `AssetThumbnailGrid`, `ReviewDecisionPanel`, `DriveUsageDonut`, `JobQueueTable` — each maps to a specific FSD wireframe component, built once and reused across the Dashboard, Mission Detail, and Review Console pages.
- **Page-level**: assembled per-route inside `/apps/web/app`, composing the above — pages themselves hold no business logic, only data-fetching (via Server Components) and composition.

State management: React Query for all server-state (mirrors MK Connect's proven data-fetching approach, `01-research-mkconnect.md` §1) — no separate global client-state store, since nearly all UI state is server-derived (Missions, assets, queue status).
