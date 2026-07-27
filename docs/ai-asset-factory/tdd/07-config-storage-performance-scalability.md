# TDD §30–35: Environment Variables, Configuration System, File Management, Storage Strategy, Performance Optimization, Scalability Strategy

## 30. Environment Variables

Binding list (implementation must not introduce undocumented required variables without updating this section):

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | all services | Postgres connection (via Supavisor pooler, §7.6) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `web` | Client-side/session-context Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | all workers, `web` server-side admin actions | RLS-bypassing service access (§27) |
| `HIGGSFIELD_API_KEY` | `mission-dispatcher`, `higgsfield-poller` | Higgsfield authentication |
| `HIGGSFIELD_API_BASE_URL` | same | Environment-configurable endpoint (staging/production if Higgsfield offers both) |
| `HIGGSFIELD_TIMEOUT_MS` | `higgsfield-poller` | Generation timeout ceiling (§9.8), default 600000 |
| `HIGGSFIELD_TRAINING_TIMEOUT_MS` | `higgsfield-poller` | Soul ID training timeout ceiling, default 2700000 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `drive-sync-worker`, `web` (DNA turnaround preview) | Drive service account credentials |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | same | Shared Drive root for `/AI Asset Factory` |
| `RETRY_MAX_ATTEMPTS` | all workers | Default 4 (§25), overridable for tuning without a code change |
| `RETRY_BACKOFF_BASE_MS` | all workers | Default 20000 |
| `WORKER_INSTANCE_ID` | each worker | Unique per-container identity for `claimed_by` (§10.3), typically the container hostname |
| `NOTIFICATION_EMAIL_PROVIDER_*` | `web` | Email dispatch credentials (provider-specific, e.g. SMTP or a transactional email API) |
| `WHATSAPP_BRIDGE_*` | `web` | Optional, mirrors MK Connect's WhatsApp integration credentials if the bridge is enabled (FSD §21) |
| `LOG_LEVEL` | all services | Standard `debug`/`info`/`warn`/`error` runtime log verbosity (distinct from the `audit_logs` business-event log, §23 — this is process-level operational logging, e.g. for Docker `logs`) |
| `NODE_ENV` | all services | `production`/`development` |
| `PORT` | `web` | HTTP listen port behind Caddy |

All variables are loaded and validated (presence + type) once at process startup by the Configuration System (§31) — a service fails fast at boot with a clear error if a required variable is missing, rather than failing confusingly at first use deep in a request/job path.

## 31. Configuration System

- `packages/core/config` exports a single typed `loadConfig()` function, called once per process at startup, backed by a Zod schema mirroring the table in §30 (required vs. optional, types, defaults) — this is the **only** place `process.env` is read directly anywhere in the codebase; every other module receives configuration values through function parameters or an injected config object, never reads `process.env` itself. This makes every module testable with fake config and prevents configuration-reading logic from drifting across services.
- **Non-secret operational configuration** that a Super Admin may reasonably want to change without a redeploy (QC score thresholds per dimension, retry attempt counts, notification channel toggles, Mission auto-pause thresholds) lives in a `system_settings` database table (key/value, typed by convention, editable via the Settings UI), not environment variables — environment variables are reserved for deployment-time/secret configuration (§30's table), while `system_settings` is reserved for operational tuning a non-engineer should be able to adjust. This split is deliberate: redeploying containers to change a QC threshold would be an unnecessary operational burden.
- `system_settings` reads are cached in-process per service with a short TTL (e.g., 60s) and invalidated proactively via a lightweight Postgres `LISTEN/NOTIFY` on update (avoids each worker re-querying the settings table on every single job) — this is the one place the design reaches for Postgres's pub/sub feature rather than polling, since settings changes are rare and latency-sensitive-enough (an operator changing a threshold expects it to take effect within seconds, not minutes).

## 32. File Management

- **Ephemeral scratch storage**: each worker container that touches file bytes (`drive-sync-worker` downloading from Higgsfield before uploading to Drive) uses a Docker named volume mounted at `/tmp/aaf-scratch`, cleared on container start (not `--rm`-cleared mid-run, since a crash-recovery pass, §12.4, may need to inspect a leftover partial file before discarding it) and swept by a periodic cleanup routine removing files older than a short ceiling (e.g., 1 hour) regardless of job state, as a backstop against any code path that fails to clean up after itself.
- **No persistent local file storage** anywhere in the system — this is a deliberate architectural constraint (not just a convenience): it means any worker container can be destroyed and recreated at any time (crash, redeploy, host reboot) with zero data loss, since Postgres and Google Drive are the only two places durable state lives. This directly serves the Mini PC deployment's crash-recovery requirement (§40).
- **Maximum file size handling**: video assets are streamed through the download→checksum→upload pipeline (Node streams, not full in-memory buffering) to keep worker memory footprint bounded regardless of asset size — important on Mini PC-class RAM budgets (§34).

## 33. Storage Strategy

- **Binary asset storage**: Google Drive exclusively (§8) — Supabase Storage is provisioned by the self-hosted stack but intentionally unused for asset binaries, avoiding a second, redundant storage location for the same data (a documented decision, not an oversight, so a future engineer doesn't "helpfully" start using it).
- **Structured data storage**: Postgres exclusively — metadata, provenance, DNA records, prompts, QC reports, logs.
- **Database storage growth management**: `audit_logs` and completed `generation_jobs`/`upload_jobs`/`qc_jobs` rows are the fastest-growing tables; retention/partitioning strategy (e.g., monthly partitioning of `audit_logs` once volume warrants it) is flagged as a Scalability Strategy trigger (§35) rather than built pre-emptively — avoids over-engineering before real volume data exists, consistent with Master Planning `08-roadmap-risks.md`'s conservative-rollout recommendation.

## 34. Performance Optimization

- **Dashboard**: served from pre-aggregated materialized views/snapshots (§7.4), never live joins — satisfies NFR-6 (2s load against 500k assets) by construction, since the aggregation cost is paid once per 5-minute refresh cycle, not once per page view.
- **Search**: filter-first query ordering (§19) keeps the expensive ranking step bounded to an already-narrowed row set.
- **Postgres tuning for Mini PC-class hardware**: `max_connections` kept modest (workers pool through Supavisor, §7.6) and `shared_buffers`/`work_mem` tuned conservatively against the Mini PC's actual RAM (an operational runbook parameter, not a fixed number in this document, since it depends on the specific hardware chosen — §40 specifies a reference minimum spec).
- **Worker concurrency**: each worker claims and processes jobs one-at-a-time by default (simplicity, predictable resource usage) rather than internally parallelizing — horizontal scaling (more container replicas) is the scale-out lever, not per-process concurrency tuning, keeping each worker's code simple (§35).
- **Image/video streaming**: as noted in §32, never fully buffered in memory.

## 35. Scalability Strategy

- **Vertical ceiling first**: the entire architecture is designed to run correctly as a single Mini PC deployment (§40) — scalability strategy is about what changes *if* volume outgrows that, not a requirement to build multi-host support now.
- **Horizontal worker scaling** (first lever, low cost): because the queue claim pattern (§10.4) is already race-safe via `SKIP LOCKED`, and workers are already stateless (§32), scaling any single worker role is simply running more container replicas — no code change required, only a Docker Compose `deploy.replicas` (or moving to a second host later) adjustment.
- **Database scaling triggers** (documented thresholds, not built pre-emptively): if `audit_logs` or job-history tables grow large enough to affect index performance, introduce time-based partitioning (Postgres native declarative partitioning) — the tables' `timestamp`/`enqueued_at` columns are already the natural partition key, so this is a low-risk future migration, not a redesign. If Postgres itself becomes the bottleneck (unlikely at this system's realistic volume, but documented for completeness), moving from self-hosted to managed Supabase Cloud is a drop-in `DATABASE_URL` change given the architecture never relies on self-hosted-specific behavior.
- **Queue-to-broker migration trigger**: if `SKIP LOCKED` polling ever shows measurable contention (monitored via §37), the `queue` module's interface (`enqueue`/`claim`/`complete`/`fail`) is already isolated enough that swapping its Postgres implementation for a Redis-backed one (e.g., BullMQ) would not require changes to any calling engine — documented as a clean extension point, not built speculatively now (avoids the exact "over-investment before volume justifies it" risk flagged in Master Planning `08-roadmap-risks.md` §2).
- **Multi-host readiness**: nothing in the design assumes single-host affinity except the Docker Compose deployment topology itself (§39/§40) — the moment volume justifies it, the same containers move to a multi-host Docker Swarm or a managed container platform without an application-level rewrite, since all coordination already goes through Postgres, not local process state.
