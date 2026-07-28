# worker-higgsfield-poller

**Owner: Agent 4 (Render Provider Framework).**

Two independently-scheduled polling loops (TDD §11/§12 — "every worker
schedules its own recurring work internally", no central scheduler):

- **Generation Status Poller** (`generation-poller.ts`, 15s + jitter): polls all `generation_jobs` rows in `submitted`/`running` status via the `RenderProvider` (`@aaf/core/higgsfield`), applies the 10-minute timeout (TDD §9.8) and the canonical retry policy (`@aaf/core/retry`, TDD §25), and on success enqueues an Upload Queue entry (`upload-queue.ts`) rather than downloading the asset itself (TDD §9.6).
- **Soul ID Training Poller** (`training-poller.ts`, 60s + jitter): same shape, against this module's own `higgsfield_soul_id_training_jobs` table (`infra/supabase/migrations/0006_higgsfield_job_tracking.sql`), 45-minute timeout.

On startup, both loops run one recovery pass (`recoverStaleClaims` /
`recoverStaleTrainingClaims`, TDD §12.4) before entering their normal
schedule. `SIGTERM`/`SIGINT` trigger graceful shutdown (TDD §12.3): stop
scheduling new ticks, let any in-flight tick finish, then exit.

This worker never submits generation jobs itself — `mission-dispatcher`
(Agent 2) calls `createHiggsfieldProvider(...).submitGeneration(...)`
directly when it dispatches a `queued` Render Queue job (Constitution
Article VIII: "your poller picks up already-submitted jobs and tracks
their Higgsfield-side status onward").

## Files

- `main.ts` — wiring, scheduling, health server, graceful shutdown.
- `generation-poller.ts` / `training-poller.ts` — the two tick bodies.
- `generation-jobs-repo.ts` — reads/writes Agent 2's `generation_jobs` table (status-tracking columns only). **TODO(integration)**: column names are inferred, not yet reconciled against Agent 2's real migration.
- `training-jobs-repo.ts` / `cost-ledger-repo.ts` — this module's own tables.
- `upload-queue.ts` — enqueues into the Upload Queue via `@aaf/core/queue`'s public interface. **TODO(integration)**: `@aaf/core/queue` is a stub in this Sprint (Agent 2).

## Known integration gaps (see `docs/ai-asset-factory/DECISIONS-agent-4.md`)

- `@aaf/core/queue` (Agent 2), `@aaf/core/identity` reference-selection (Agent 3), and `@aaf/core/prompt-engine` output (Agent 3) are all consumed as documented interfaces against stub modules — not real implementations, in this Sprint.
- `generation_jobs` does not exist as a migration in this worktree (Agent 2's, built in parallel) — this worker's repository functions and its startup recovery pass are written against the TDD-inferred shape and will need reconciliation once merged.

Build/run: `pnpm --filter worker-higgsfield-poller build && pnpm --filter worker-higgsfield-poller start`
(or `pnpm --filter worker-higgsfield-poller dev` for local iteration via `tsx`).
