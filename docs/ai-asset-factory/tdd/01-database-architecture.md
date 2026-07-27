# TDD §7: Database Architecture

Extends the conceptual ERD from `fsd/07-database-erd-dashboards.md` with implementation-level architecture: access patterns, migration strategy, indexing rationale, and optimization.

## 7.1 Engine & Access Layer

- **Engine**: Postgres 15+ (via self-hosted Supabase Docker image).
- **Schema management**: hand-written SQL migrations under `/infra/supabase/migrations`, sequentially numbered (`0001_...`, `0002_...`) — the same discipline already proven at scale in MK Connect (189 migrations, zero ORM, Master Planning `01-research-mkconnect.md` §1). No ORM (Prisma/Drizzle) — deliberate, matching team convention and avoiding a second source-of-truth for schema shape.
- **Type generation**: `supabase gen types typescript` generates `packages/core/db/database.types.ts` from the live schema — the query layer is hand-written but fully typed against generated types, never `any`.
- **Query layer**: `@aaf/core/db` wraps `@supabase/supabase-js` with typed repository functions per table (`missionsRepository.claimNext()`, `assetsRepository.findByChecksum()`, etc.) — no raw query strings scattered across workers; every query lives in exactly one repository function, reused by whichever service needs it.
- **Row Level Security (RLS)**: enabled on every table containing business data, enforced as the second, independent authorization layer beneath the application-level permission checks (§28) — mirrors MK Connect's two-layer enforcement (`01-research-mkconnect.md` §5), specifically valuable here because worker processes use a service-role key that bypasses RLS by design, while the `web` service's user-facing queries run under the authenticated user's RLS context, so a bug in Server Action permission-checking cannot expose data RLS itself blocks.

## 7.2 ERD

Unchanged from `fsd/07-database-erd-dashboards.md` — that document is the binding entity/relationship specification. This section adds physical design detail on top of it.

## 7.3 Indexing Strategy (rationale per hot path)

| Table | Index | Query it serves |
|---|---|---|
| `generation_jobs` | `(status, priority DESC, enqueued_at ASC)` partial index `WHERE status = 'queued'` | Dispatcher's claim query — the single highest-frequency query in the system, must stay O(log n) as job volume grows into the tens of thousands. |
| `generation_jobs` | `(higgsfield_job_id)` unique | Poller's per-job status lookup. |
| `generation_jobs` | `(mission_id)` | Mission Detail page job list, Mission completion-check trigger (§20). |
| `assets` | `(checksum_sha256)` unique | Duplicate-prevention check (FSD §15.3) — must be O(1)/O(log n), runs on every ingestion. |
| `assets` | `(status)` | Review Console queue, Asset Library default filter. |
| `assets` | `(company, project, campaign)` | Folder-path resolution consistency checks, Storage Usage dashboard aggregation. |
| `asset_metadata` | GIN index on `search_text` (tsvector) | Full-text search (FSD §17). |
| `asset_embeddings` | ivfflat/HNSW index on `embedding` (pgvector) | Semantic search (FSD §17) — HNSW preferred over ivfflat once index size stabilizes, since HNSW gives better recall at the read-heavy, infrequent-write profile this table has (assets are embedded once at creation, queried many times). |
| `qc_reports` | `(asset_id, evaluated_at DESC)` | Latest-QC-report lookup, QC Analytics trend queries. |
| `audit_logs` | `(entity_type, entity_id)`, `(timestamp DESC)`, `(severity)` | Log drill-down from any entity, System Logs page default sort, critical-event filtering. |
| `notifications` | `(recipient_id, read, created_at DESC)` | Notification Center default query (unread-first). |

Partial indexes (e.g., the `generation_jobs` queued-only index) are used deliberately wherever a query only ever targets a status subset — this keeps the index small relative to full table size as completed-job history accumulates, which matters on Mini PC-class hardware with modest RAM for index caching (§34).

## 7.4 Materialized Views & Aggregation

- `mission_summary_mv`: refreshed every 5 minutes by a dedicated lightweight job inside `web`'s own process (a Next.js scheduled route triggered by an internal timer, not a separate worker container — this one aggregation is cheap and tightly coupled to the Dashboard it serves) via `REFRESH MATERIALIZED VIEW CONCURRENTLY` (non-blocking, requires a unique index on the MV, included in its migration).
- `storage_usage_snapshots`: append-only table (not a view), written by `drive-sync-worker` after each Reconciliation Job run — trend data, not a live recomputation, since Drive usage totals are relatively expensive to compute (`drive.about.get` quota call) and don't need per-request freshness.

## 7.5 Data Integrity Rules

- No table exposes a `DELETE` capability at the application layer (repository functions simply do not implement delete methods for business tables) — enforced by convention + RLS policies that deny `DELETE` outright on `assets`, `product_dna_versions`, `character_dna_versions`, `missions`, `generation_jobs`. This makes NFR-7 (no hard-delete of referenced data) structurally true, not just policy.
- Foreign keys use `ON DELETE RESTRICT` everywhere (never `CASCADE`) — since nothing is meant to be deleted, a cascade path is a bug smell if it's ever hit; `RESTRICT` fails loudly instead of silently propagating deletion.
- Version tables (`product_dna_versions`, `character_dna_versions`, `prompt_template_versions`) enforce `UNIQUE (parent_id, version)` and application logic always computes `version = MAX(version) + 1` inside a single transaction (`SELECT ... FOR UPDATE` on the parent row) to prevent a race between two concurrent "create new version" requests producing duplicate version numbers.

## 7.6 Connection Management

- `web` (Next.js, potentially multiple server-side request handlers concurrently) and each worker connect through **Supavisor** (Supabase's connection pooler, bundled in the self-hosted stack) in transaction mode — avoids exhausting Postgres's native connection limit on Mini PC-class hardware where Postgres itself is tuned for a modest `max_connections` (§34).
- Workers hold a small, fixed-size pool each (2–5 connections) since their query pattern is a tight poll-claim-update loop, not high-concurrency request serving.

## 7.7 Migration & Rollback Discipline

- Every migration is forward-only in the repository (no down-migrations maintained) — matching MK Connect's proven approach — but every migration is written to be additive/non-destructive where at all possible (add column nullable, backfill, then tighten constraint in a later migration) so a bad deploy can be recovered by rolling the application code back without requiring a schema rollback.
- Migrations run automatically as a one-shot init container step in the Docker Compose stack before `web`/workers start (§39) — never run ad hoc against production by hand.
