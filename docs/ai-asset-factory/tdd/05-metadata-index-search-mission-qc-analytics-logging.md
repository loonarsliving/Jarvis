# TDD §17–23: Metadata, Asset Index, Search, Mission, QC, Analytics, Logging Engines

## 17. Metadata Engine

**Purpose**: Write and maintain the complete provenance/metadata record for every asset, per FSD §16/§36.

**Responsibilities**: at ingestion, atomically construct the full metadata object (provenance fields, all immutable) and persist it to both the `asset_metadata` DB row and a `.json` Drive sidecar; at later lifecycle points, append mutable fields (QC report link, review decision, tags) without ever touching the immutable provenance fields.

**Input**: at creation — `{ assetId, promptProvenance (from Prompt Engine output), higgsfieldJobId, driveFileId }`. At update — `{ assetId, field, value }` restricted to the mutable field allowlist (`status`, `tags`, `qc_report_id`, `reviewed_by`/`reviewed_at`).

**Output**: the persisted `asset_metadata` row; a write-confirmation used by the Ingestion flow to know it's safe to move the asset out of `pending_upload`.

**Dependencies**: `db`, `drive` (sidecar write).

**Data Flow**: metadata write happens in the *same logical transaction* as the DB `assets` row creation (both committed together, or both rolled back) — the Drive sidecar write happens after the DB commit succeeds (DB is the authoritative record; the sidecar is a portability convenience per Master Planning `06-storage-architecture.md` §4, so a sidecar write failure is logged as a warning and retried by the Reconciliation Job, not treated as ingestion failure).

**Failure Cases**: DB write succeeds, sidecar write fails (network blip to Drive) — asset is still fully functional (searchable, reviewable) since DB is authoritative; sidecar catches up via reconciliation. DB write itself fails — full ingestion failure, standard retry path (§25).

**Recovery Strategy**: sidecar drift is self-healing via the hourly Reconciliation Job (§8.6), which can detect a missing/stale sidecar the same way it detects a missing Drive file, and re-write it.

## 18. Asset Index Engine

**Purpose**: Maintain the two parallel indexes that power Asset Search (full-text `tsvector` and semantic `embedding`) in sync with every new or updated asset.

**Responsibilities**: generate `search_text` (Postgres `GENERATED ALWAYS AS` column computed from title/description/tags — no application code needed, database-native) and compute+store the semantic embedding vector at ingestion time.

**Input**: `{ assetId, title, description, tags[], visualContent (for embedding) }`. **Output**: written `asset_embeddings` row; `search_text` is automatic (generated column, not application-written).

**Dependencies**: `db`, an embedding-model dependency (pluggable interface, same principle as the Lock Engines' similarity scorers, §14) — candidate: a CLIP-family multimodal embedding model run either via a hosted API or a small local inference step; TDD fixes the interface, not the specific model, deferring that choice to implementation time.

**Data Flow**: embedding computation happens as a step inside the QC Queue processing (co-located with QC scoring since both need to "look at" the asset's visual content once it's downloaded/accessible — avoids two separate downloads of the same file for two different engines).

**Failure Cases**: embedding model unavailable — asset still gets full-text indexed (degrades gracefully to text-only search for that asset until embedding is backfilled) rather than blocking the entire QC/approval pipeline on a search-index concern, which is explicitly lower-priority than the identity-lock gates.

**Recovery Strategy**: a nightly backfill job scans for `assets` rows with no `asset_embeddings` row and retries embedding computation — decoupled from the real-time ingestion path so a transient embedding-service outage never blocks production throughput.

## 19. Search Engine

**Purpose**: Serve the Asset Library search (FSD §17) by combining full-text and semantic results into one ranked list.

**Responsibilities**: accept a query + filters, run both a `tsvector` full-text query and a vector-similarity query against `asset_embeddings`, merge/re-rank (reciprocal rank fusion or a simple weighted-score merge — an implementation-time tuning decision, not architecturally significant), apply facet filters, paginate.

**Input**: `{ queryText?, filters: { company?, project?, campaign?, assetType?, status?, dnaRef?, dateRange?, qcScoreRange? }, sort, page }`. **Output**: `{ results[], facetCounts, totalCount }`.

**Dependencies**: `db` only (both indexes live in Postgres — no external search service needed at this system's scale, consistent with the "no unnecessary infrastructure on a Mini PC" principle).

**Data Flow**: filters are applied as SQL `WHERE` clauses (cheap, indexed per §7.3) before the more expensive text/vector ranking runs on the filtered subset — never rank the whole table then filter.

**Failure Cases**: query text empty with no filters — returns most-recent-first rather than an error (this is the Asset Library's default "browse" state, not a search error). Malformed filter combination — validated and rejected with a specific 400-level error before hitting the database.

**Recovery Strategy**: n/a beyond standard API error handling (§29) — this engine is read-only and stateless, so there's no "recovery" concept beyond retrying the request.

## 20. Mission Engine

**Purpose**: Own the Mission state machine end-to-end — FSD §12 made concrete as engine logic.

**Responsibilities**: validate and create Missions; expand a `queued` Mission into its constituent `generation_jobs` (respecting `target_quantity` and the variation-slot generation strategy — e.g., for 100 hero shots, deterministically generate 100 distinct `variation_slot_values` combinations from the template's declared variation axes, avoiding accidental exact-duplicate job parameters); recompute Mission status whenever a job completes; handle pause/cancel/retry-bulk actions.

**Input**: Mission creation — `{ name, subjectType, dnaRefs, targetQuantity, promptTemplateVersionId, targetPlatforms, priority }`. Job-completion event — `{ missionId, jobOutcome }`.

**Output**: created `missions` row + `generation_jobs` rows; updated Mission status/counters.

**Dependencies**: `identity` (validate referenced DNA is `approved`), `queue` (job creation), `db`.

**Data Flow**:
```
Mission Composer submit
   -> validate: all dnaRefs approved, character DNA (if any) has trained Soul ID
   -> create missions row (status=queued)
   -> expand into N generation_jobs rows (status=queued, inherits priority)
   -> mission-dispatcher's normal tick picks these up (no special-cased dispatch path)

Job completion event (success or dead_letter)
   -> increment missions.jobs_completed / jobs_failed
   -> if jobs_completed + jobs_failed == jobs_total:
        resolve status -> completed | completed_with_failures
        trigger notification (FSD §21)
```

**Failure Cases**: Mission validation failure (unapproved DNA, untrained Character DNA) — rejected at creation, no partial Mission ever exists in an invalid state (matches the Character Lock Engine's "prevent invalid state" recovery philosophy, §15). Job-expansion partial failure (e.g., crash after creating 40 of 100 jobs) — expansion runs inside a single DB transaction, so this is all-or-nothing at the database level, never leaves a Mission with an inconsistent job count.

**Recovery Strategy**: transactional expansion (above) makes partial-expansion structurally impossible rather than something to detect-and-fix after the fact.

## 21. QC Engine

**Purpose**: Orchestrate the four QC dimensions (Product Fidelity, Character Fidelity, Technical Quality, Brand Compliance) into one decision, per FSD §19.

**Responsibilities**: dispatch to Product Lock Engine / Character Lock Engine (only if the asset's Mission referenced the relevant DNA type), run Technical Quality checks (resolution/ratio validation, artifact detection — pluggable model interface again) and Brand Compliance checks (palette/tone adherence against the resolved Brand DNA), combine into the decision matrix, persist `qc_reports`.

**Input**: `{ assetId }` (all other context resolved via the asset's stored `asset_metadata` provenance — the QC job payload is deliberately minimal, everything else is looked up, avoiding payload/DB drift).

**Output**: `qc_reports` row + the asset's resulting status (`approved`/`needs_review`/`blocked`).

**Dependencies**: `product-lock`, `character-lock`, `identity` (Brand DNA resolution), `drive` (fetch asset content for scoring), `db`.

**Data Flow**: the four checks run **in parallel** (`Promise.all`-equivalent) since they're independent — total QC latency is bounded by the slowest single check, not their sum. Decision matrix application (FSD §19 step 4) is a pure function over the four scores, easily unit-tested in isolation from any network dependency.

**Failure Cases**: one dimension's scorer unavailable while others succeed — the whole QC evaluation is deferred (retried as a unit, not partially scored) rather than making an approve/reject decision on incomplete information, since a missing Product Fidelity score must never silently default to "pass."

**Recovery Strategy**: standard QC Queue retry (§10/§25); a QC job stuck in retry past a configured ceiling escalates to a `critical` log + notification (distinct from a normal dead-letter, since a stuck QC pipeline means production is silently backing up even if generation itself is healthy).

## 22. Analytics Engine

**Purpose**: Power the Dashboard, Mission Analytics, and QC Analytics views (FSD §8, §12.7, §19-adjacent analytics page) from pre-aggregated data, never live-computed joins at request time (NFR-6).

**Responsibilities**: own the `mission_summary_mv` refresh (§7.4), compute the QC trend series, compute failure-category breakdowns, compute template performance aggregates (feeding §27's flagging logic).

**Input**: scheduled trigger (no user-facing input at write time); read-time input is the same filter/date-range parameters as the relevant dashboard page.

**Output**: aggregated rows/views consumed directly by `web`'s dashboard API routes.

**Dependencies**: `db` only.

**Data Flow**: all aggregation is SQL-native (materialized views, `GROUP BY` queries with the indexes from §7.3 backing them) — no application-level aggregation loop over raw rows, keeping this engine simple and letting Postgres do what it's good at.

**Failure Cases**: aggregation query timeout as data volume grows — mitigated by the partial/targeted indexes already designed in §7.3 and by keeping aggregation windows bounded (the 365-day guard from FSD §8).

**Recovery Strategy**: if a scheduled refresh fails, the previous materialized view snapshot remains queryable (stale-but-available, per FSD §8's "data as of HH:MM" badge UX) rather than the dashboard breaking — next scheduled tick retries the refresh.

## 23. Logging Engine

**Purpose**: Implement FSD §20's audit log requirement as a shared, mandatory-use module — not an optional add-on.

**Responsibilities**: expose a single `logAction()` function used by every module that performs a state-changing operation; enforce the log entry shape (actor, action, entity, before/after, severity) at the type level so a caller cannot accidentally omit a required field.

**Input**: `{ actorType, actorId, action, entityType, entityId, beforeState?, afterState, metadata?, severity }`. **Output**: persisted `audit_logs` row; for `critical` severity, also triggers the notification dispatch (§FSD 21) synchronously as part of the same call (a critical log must never be written without its corresponding alert firing).

**Dependencies**: `db`, `notifications` (only for `critical` severity).

**Data Flow**: called synchronously, inline, by the calling module — not queued/async — because an audit log write failure must be visible immediately (if it silently failed async, the corresponding action might appear to have happened with no record, defeating the entire purpose).

**Failure Cases**: the log write itself fails (DB unavailable) — this is treated as severely as the triggering action's own failure: if `logAction()` throws, the calling module's transaction is rolled back too (the log write and the business-state write happen in the **same database transaction** wherever the calling module supports it, e.g., a Server Action's `assets.status` update and its `audit_logs` insert commit or roll back together) — this guarantees the audit trail can never silently diverge from actual state (directly satisfies NFR-3).

**Recovery Strategy**: transactional co-location (above) makes this failure mode structurally prevented rather than something requiring reactive recovery logic.
