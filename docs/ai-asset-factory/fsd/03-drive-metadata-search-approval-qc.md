# FSD §15–19: Google Drive Storage, Metadata, Asset Search, Asset Approval, Quality Control Workflows

## 15. Google Drive Storage Workflow

### 15.1 Upload Rules
- All uploads go through the Ingestion service (never direct client-to-Drive uploads) — enforces checksum, metadata-write, and folder-resolution consistency.
- Files always land in `/raw` first, regardless of eventual QC outcome (see `02-production-mission-generation-higgsfield.md` §13).
- Every upload is atomic from the system's perspective: the database `assets` row is created in a `pending_upload` state before the Drive API call, updated to `uploaded` only after Drive confirms success with a file ID — if the process crashes mid-upload, the `pending_upload` row is detectable and requeued by a reconciliation job (see §"File Recovery").

### 15.2 Automatic Folder Rules
Folders are created idempotently (check-then-create, never duplicate) by company → project → campaign → asset-status path, mirroring the pattern already proven in MK Connect's KontenAI Google Drive integration (Master Planning `01-research-mkconnect.md` §5). Folder creation is the Ingestion service's responsibility, never manual.

### 15.3 Duplicate Prevention
- Before upload, the Ingestion service computes a SHA-256 checksum of the output file.
- Checksum is checked against the `assets` table for the same DNA refs + template + job parameters; an exact checksum match against an existing non-rejected asset is treated as a duplicate and the new file is discarded (not uploaded), with the Generation Job marked `duplicate_skipped` and linked to the original asset.
- This specifically guards against a known failure class: retrying a job that actually succeeded on the provider side but whose success response was lost (network blip) — without this check, a retry could produce a redundant, indistinguishable asset consuming storage and review time for nothing new.

### 15.4 Versioning
Assets are never overwritten in place. A "revised" asset is a new row with `supersedes` / `superseded_by` links to the prior asset, exactly mirroring the Master Planning storage design (`06-storage-architecture.md` §6). DNA records follow the same non-destructive versioning rule.

### 15.5 Naming Convention
See §35 in `05-folder-naming-metadata-tagging-lifecycle.md` for the full specification; enforced programmatically at upload time, never left to manual entry.

### 15.6 Folder Permissions
The Asset Factory's Shared Drive is owned by the company (not a personal account), accessed by a single service account with edit rights scoped only to that Shared Drive. Human users never get direct Drive-level access — all human interaction with assets goes through the Asset Factory UI, which enforces the RBAC permissions from §7, not Drive's own sharing UI. This avoids permission drift between "who can see this in Drive" and "who can see this in the app."

### 15.7 Synchronization
The database is the source of truth for what *should* exist; Drive is the physical store. A scheduled **Reconciliation Job** (hourly) compares database asset rows against actual Drive folder contents:
- Database row with no matching Drive file → flagged `storage_missing`, surfaced to Super Admin (mirrors the `storage-orphan-cleanup` debug tool pattern already present in MK Connect, `01-research-mkconnect.md` §7).
- Drive file with no matching database row (e.g., manual upload by mistake, or a crashed ingestion) → flagged `unindexed_file`, not auto-deleted, held for manual triage.

### 15.8 File Recovery
- Google Drive's native trash/version history is the first line of recovery for accidental deletion (files are never permanently deleted by the Asset Factory itself — "delete" in the UI always means status change to `archived`/`rejected`, never a Drive-level delete).
- The Reconciliation Job (§15.7) catches drift proactively rather than relying solely on manual recovery.

## 16. Metadata Workflow

Every asset gets a **metadata companion** written at ingestion time, stored both as a database row (queryable) and as a `.json` sidecar file next to the asset in Drive (portable, survives even if the database were ever rebuilt). Written by the Ingestion service in the same transaction as the Drive upload confirmation — an asset row is never considered complete without its metadata.

Metadata is **append-only for provenance fields** (prompt, DNA versions, job ID — never edited after creation) and **mutable for lifecycle fields** (status, QC scores get added when QC runs, review decision gets added when a human reviews). See `05-folder-naming-metadata-tagging-lifecycle.md` §36 for the full field-level standard.

## 17. Asset Search Workflow

### Page: Asset Library — Browse / Search (`/assets`)

- **Purpose**: Find existing approved assets for reuse, or investigate rejected/archived assets for audit.
- **Business Goal**: Maximize asset reuse (core Master Planning principle: every asset must be reusable) by making retrieval fast and precise — directly addresses the gap found in MK Connect where asset matching is lexical/tag-only with no semantic search (`01-research-mkconnect.md` §3.5 / §6 table).
- **UI Layout**: Left filter sidebar (facets: company, project, campaign, asset type, status, DNA reference, date range, QC score range) + main grid of thumbnail cards + top search bar.
- **Components**: Search bar (full-text + semantic — see below), facet filter checkboxes, sort dropdown (`newest`/`oldest`/`highest QC score`), thumbnail grid with hover-preview, pagination.
- **Buttons**:
  - `Cari` (or live-search on keystroke, debounced 300ms) — runs combined query: full-text match on title/description/tags (Postgres `tsvector`, same technique already used in MK Connect's `kontenai_assets.search_text`) **plus** semantic similarity ranking (embedding vector search) — results merged and ranked, closing the gap noted in Master Planning research where MK Connect's matcher was text-overlap only.
  - Facet checkboxes → client-side triggers re-query with filters applied; no separate "apply" button needed (instant filter).
  - Asset card click → opens Asset Detail modal/page.
  - `Export Hasil` (CSV of current filtered result metadata) — Production Manager and above only.
- **Input Fields**: search text, date range picker, QC score min/max slider.
- **Validation Rules**: search text max 200 chars; date range same 365-day guard as Dashboard.
- **System Actions**: Query hits the metadata index (database), never Drive directly (NFR-6).
- **Error States**: zero-results state shows suggested broadened filters rather than a bare empty screen.
- **Success States**: result count shown, grid populated, facet counts update to reflect current filter combination.
- **Permissions**: `asset.view_approved` for default view; `asset.view_rejected` required to include rejected/archived in results (toggle hidden otherwise).
- **API Requirements**: `GET /api/assets/search?q=&facets=&sort=&page=`.
- **Database Tables**: `assets`, `asset_metadata`, `asset_embeddings` (vector index), `qc_reports`.
- **Future Expansion**: saved searches, "similar assets" recommendation from an asset detail page using the same embedding index.

### Page: Asset Detail (modal or `/assets/:id`)

- **Purpose**: Full inspection of one asset.
- **Components**: full preview (image/video player), full metadata panel (prompt, DNA refs+versions, Higgsfield job ID, QC report breakdown, review history), download button, "view canonical DNA reference" side-by-side toggle.
- **Buttons**: `Unduh Asset` (logs a `download` event, no state change), `Lihat Riwayat Versi` (navigates version chain if `supersedes`/`superseded_by` present), `Arsipkan` (Production Manager+, sets status `archived`, moves Drive file to `/archive` — see §39).
- **Permissions**: view gated as above; `Arsipkan` requires `asset.archive`.

## 18. Asset Approval Workflow

Covered operationally in the User Journey (`01-dashboard-navigation-journey.md`, Journey C). Full page spec:

### Page: Review Console (`/qc/review`)

- **Purpose**: Human gate for every asset QC flagged as `needs_review` or where a human override of a `blocked` (identity-lock failure) status is being considered.
- **Business Goal**: Maximize reviewer throughput while never letting an identity-lock failure through without deliberate, logged human judgment.
- **UI Layout**: Queue list (left, narrow) + large detail/preview pane (right, dominant).
- **Components**: Queue list sorted by priority then age (oldest first within priority — same fairness policy as job dispatch); detail pane with asset preview, QC score breakdown table (dimension, score, threshold, pass/fail), flag reason text, canonical DNA reference shown side-by-side for visual comparison, provenance panel (collapsed by default, expandable).
- **Buttons**:
  - `Setujui` — **Click behavior**: marks asset `approved`. **Validation**: none beyond permission check (`qc.review`). **Background process**: triggers Drive move `/raw` → `/approved`, updates database status, recomputes Mission's `assets_approved` counter. **Database changes**: `assets.status = 'approved'`, new `reviews` row (`decision=approved`, `reviewer`, `timestamp`). **Google Drive changes**: file moved (not copied) to `/approved` path; metadata sidecar updated with `reviewed_by`/`reviewed_at`. **Logs**: audit log entry (`asset.approved`, actor, asset ID). **Notifications**: none by default (approval is the expected happy path, not alert-worthy) — configurable per Mission if the creator wants completion pings. **Failure recovery**: if the Drive move fails after the DB commit, asset enters `approval_pending_sync` status, retried by the Reconciliation Job (§15.7) — UI shows a "syncing" badge rather than a false success.
  - `Tolak` — **Click behavior**: opens mandatory reason selector (controlled category list: `wrong_product_identity`, `wrong_character_identity`, `technical_artifact`, `brand_noncompliant`, `low_aesthetic_quality`, `other` + free-text note if `other`). Submit disabled until a reason is selected. **Background process/DB/Drive**: mirrors `Setujui` but to `rejected` status and `/rejected` folder. **Notifications**: if this is the asset's *second* rejection for the *same* Product/Character DNA + template combination, a notification is sent to the Creative Director suggesting the template may need revision (early signal into the Prompt Engine loop, §12.7 of Master Planning).
  - `Lewati` (Skip) — moves to next item without a decision, item returns to end of queue. No DB change beyond a `last_skipped_by` soft marker (prevents one reviewer from perpetually re-seeing an item they're unsure about, surfaces it to a second reviewer instead).
  - `Setujui Meski Gagal Lock` (only visible when the flag reason is a Product/Character Lock failure, only enabled for `qc.override_lock_failure` holders) — requires a mandatory justification text box (minimum 20 characters) before submit. Logged with elevated severity in the audit log (`asset.lock_override`) and always triggers a notification to all Super Admins regardless of notification settings — this is a deliberately loud action.
- **Error States**: if the queue is empty, show a positive "semua sudah direview" state, not a blank page.
- **Success States**: after a decision, the queue smoothly advances (no full page reload) and shows a brief toast confirming the action.
- **Permissions**: page itself requires `qc.review`; override button requires `qc.override_lock_failure`.
- **API Requirements**: `GET /api/qc/queue`, `POST /api/qc/review/:assetId` (body: decision, reason, note).
- **Database Tables**: `assets`, `qc_reports`, `reviews`.
- **Future Expansion**: bulk-approve for a batch of visually-verified-identical assets (e.g., 10 near-duplicate angle variants), reviewer performance analytics.

## 19. Quality Control Workflow

Detailed scoring logic inherits directly from Master Planning `05-quality-control.md`; this section specifies the *system workflow*, not the scoring research (already documented).

1. Asset arrives in QC Engine immediately after Drive `/raw` upload confirms.
2. QC Engine runs four independent checks in parallel: Product Fidelity (if Product DNA referenced), Character Fidelity (if Character DNA referenced), Technical Quality (always), Brand Compliance (always, against Brand DNA).
3. Each check returns a 0–100 score + pass/fail against its configured threshold.
4. Decision matrix applied:
   - Any identity check (Product/Character Fidelity) below its **blocking threshold** → `blocked`, routed to Review Console, cannot auto-approve under any circumstance (only `Setujui Meski Gagal Lock` can move it forward, and only by an authorized role).
   - All checks above their **auto-approve threshold** → `approved` automatically, no human touch (configurable per company policy — can be disabled entirely if the business prefers 100% human review during early rollout; see Master Planning `08-roadmap-risks.md` §3 recommendation to start conservative).
   - Anything in between → `needs_review`, routed to Review Console.
5. `qc_reports` row persisted regardless of outcome — this is the data source for the Prompt Engine's evolution loop (Master Planning `04-prompt-engine.md` §5) and for QC Analytics dashboards (§ in `07-database-erd-dashboards.md`).
6. Failure Categories (used both for auto-decisioning and for the Review Console's reject-reason list): `wrong_product_identity`, `wrong_character_identity`, `technical_artifact`, `brand_noncompliant`, `low_aesthetic_quality`.
7. Automatic Retry: a `blocked` or `needs_review` outcome does **not** by itself trigger regeneration — that is always a human or explicit Mission-level policy decision, to avoid silently burning Higgsfield credits on a systematically failing template. A distinct, opt-in Mission setting (`auto_regenerate_on_reject`) may requeue a fresh job with the same parameters up to a small configurable cap (default 1 auto-retry) — this is a production-throughput convenience, not the same thing as job-level technical retry (see `06-scheduler-mission-queue.md`, which handles transient infrastructure failures, not quality failures).
