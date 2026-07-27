# FSD: Complete Database Design (ERD) & Dashboard Wireframes

## Database Design

### Entity-Relationship Diagram (textual)

```
brands (brand_dna) 1---* brand_dna_versions
brand_dna_versions 1---* product_dna
brand_dna_versions 1---* character_dna

product_dna 1---* product_dna_versions
product_dna_versions 1---* product_dna_reference_images

character_dna 1---* character_dna_versions
character_dna_versions 1---* character_dna_reference_images
character_dna_versions 1---1 soul_id_training_jobs (latest)

prompt_templates 1---* prompt_template_versions
prompt_template_versions 1---* regression_test_runs

missions *---* product_dna_versions      (via mission_dna_refs)
missions *---* character_dna_versions    (via mission_dna_refs)
missions 1---1 prompt_template_versions
missions 1---* generation_jobs

generation_jobs 1---1 assets            (a completed job produces one asset)
generation_jobs 1---* job_attempts       (retry history)

assets 1---1 asset_metadata
assets 1---1 qc_reports (latest; historical reports retained, linked 1-*)
assets 1---* reviews
assets 1---* asset_tags *---1 tag_vocabulary
assets 1---1 assets (self-referential: supersedes / superseded_by)

audit_logs (independent, references entity_type + entity_id polymorphically)
notifications (independent, references entity_type + entity_id polymorphically)
storage_usage_snapshots (independent, periodic aggregation)
mission_summary_mv (materialized view over missions + generation_jobs + assets)
```

### Core Tables

**brand_dna**
`id (uuid, pk)`, `slug (unique)`, `name`, `created_at`

**brand_dna_versions**
`id (uuid, pk)`, `brand_dna_id (fk)`, `version (int)`, `palette (jsonb)`, `typography_rules (jsonb)`, `tone_descriptors (text[])`, `negative_constraints (text[])`, `logo_asset_ref (text)`, `status (enum: draft/approved/deprecated)`, `approved_by`, `approved_at`, `created_at`
Index: `(brand_dna_id, version)` unique; `(status)`.

**product_dna**
`id (uuid, pk)`, `slug (unique)`, `name`, `sku`, `brand_dna_id (fk)`, `created_at`

**product_dna_versions**
`id (uuid, pk)`, `product_dna_id (fk)`, `version (int)`, `color_lock (jsonb)`, `typography_lock (jsonb)`, `logo_lock (jsonb)`, `dimension_notes (text)`, `negative_constraints (text[])`, `reference_weight_override (numeric, nullable)`, `canonical_reference_image_id (fk, nullable)`, `status (enum: draft/generating_reference/pending_approval/approved/deprecated)`, `approved_by`, `approved_at`, `created_at`
Index: `(product_dna_id, version)` unique; `(status)`.

**product_dna_reference_images**
`id (uuid, pk)`, `product_dna_version_id (fk)`, `drive_file_id`, `angle_label`, `is_canonical (bool)`, `uploaded_at`

**character_dna** / **character_dna_versions** / **character_dna_reference_images**
Mirror structure of product_dna equivalents, plus on `character_dna_versions`: `face_descriptors (jsonb)`, `hair_descriptors (jsonb)`, `body_descriptors (jsonb)`, `age_descriptor (text)`, `default_outfit (jsonb)`, `allowed_outfit_variants (jsonb[])`, `allowed_expressions (text[])`, `higgsfield_soul_id (text, nullable)`.

**soul_id_training_jobs**
`id (uuid, pk)`, `character_dna_version_id (fk)`, `status (enum: queued/running/complete/failed)`, `higgsfield_training_ref`, `attempt_count`, `error_detail (jsonb, nullable)`, `started_at`, `completed_at`

**prompt_templates** / **prompt_template_versions**
`prompt_templates`: `id (uuid, pk)`, `slug (unique)`, `asset_class (enum: hero/lifestyle/ugc/turnaround/social)`
`prompt_template_versions`: `id (uuid, pk)`, `prompt_template_id (fk)`, `version (int)`, `composition_spec (jsonb — module order + slot definitions)`, `status (enum: draft/production/deprecated)`, `parent_version_id (fk, nullable)`, `promoted_by`, `promoted_at`, `created_at`
Index: `(prompt_template_id, version)` unique; `(prompt_template_id, status)` (fast "current production version" lookup).

**regression_test_runs**
`id (uuid, pk)`, `prompt_template_version_id (fk)`, `run_at`, `aggregate_qc_score (numeric)`, `comparison_result (enum: better/equal/worse)`, `job_ids (uuid[])`

**missions**
`id (uuid, pk)`, `name`, `subject_type (enum: product/character/scene/mixed)`, `target_quantity (int)`, `prompt_template_version_id (fk)`, `target_platforms (text[])`, `priority (enum: low/normal/high/urgent)`, `status (enum: draft/queued/running/paused/completed/completed_with_failures/cancelled)`, `auto_regenerate_on_reject (bool, default false)`, `created_by (fk users)`, `created_at`, `jobs_total`, `jobs_completed`, `jobs_failed`
Index: `(status)`, `(priority, created_at)`, `(created_by)`.

**mission_dna_refs**
`mission_id (fk)`, `dna_type (enum: product/character/brand)`, `dna_version_id (uuid)` — composite key, resolves polymorphically to the relevant `_dna_versions` table.

**generation_jobs**
`id (uuid, pk)`, `mission_id (fk)`, `status (enum: queued/submitted/running/retrieving/ingested/needs_review/blocked/approved/rejected/failed/failed_content_policy/failed_integrity/duplicate_skipped/timeout/dead_letter/cancelled)`, `priority (inherited from mission)`, `higgsfield_job_id (text, nullable)`, `variation_slot_values (jsonb)`, `attempt_count (int, default 0)`, `enqueued_at`, `last_attempted_at`, `job_purpose (enum: production/dna_onboarding/regression_test)`
Index: `(status, priority, enqueued_at)` (dispatcher's primary query); `(mission_id)`; `(higgsfield_job_id)`.

**job_attempts**
`id (uuid, pk)`, `generation_job_id (fk)`, `attempt_number`, `started_at`, `ended_at`, `outcome (enum: succeeded/failed_transient/failed_permanent)`, `error_category`, `error_detail (jsonb)`

**assets**
`id (uuid, pk)`, `generation_job_id (fk, unique)`, `drive_file_id`, `drive_path`, `filename`, `checksum_sha256`, `asset_type`, `company`, `project`, `campaign`, `platform`, `status (enum: pending_upload/uploaded/needs_review/blocked/approved/rejected/archived/superseded)`, `supersedes_asset_id (fk, nullable)`, `created_at`
Index: `(checksum_sha256)` (duplicate prevention); `(status)`; `(company, project, campaign)`; full-text index on `asset_metadata.search_text`.

**asset_metadata**
`asset_id (fk, pk)`, `product_dna_version_id (fk, nullable)`, `character_dna_version_id (fk, nullable)`, `prompt_template_version_id (fk)`, `prompt_final (text)`, `higgsfield_model`, `seed (text, nullable)`, `search_text (tsvector, generated)`

**asset_embeddings**
`asset_id (fk, pk)`, `embedding (vector)` — semantic search index (pgvector or equivalent).

**qc_reports**
`id (uuid, pk)`, `asset_id (fk)`, `product_fidelity_score (numeric, nullable)`, `character_fidelity_score (numeric, nullable)`, `technical_quality_score (numeric)`, `brand_compliance_score (numeric)`, `decision (enum: auto_approve/needs_review/blocked)`, `failure_categories (text[])`, `evaluated_at`
Index: `(asset_id, evaluated_at)`.

**reviews**
`id (uuid, pk)`, `asset_id (fk)`, `reviewer_id (fk users)`, `decision (enum: approved/rejected/lock_override)`, `reason_category (text, nullable)`, `note (text, nullable)`, `reviewed_at`

**tag_vocabulary**
`id (uuid, pk)`, `dimension (enum: mood/shot_type/platform/content_type/scene_category)`, `value`, `active (bool)`, `merged_into (fk, nullable)`

**asset_tags**
`asset_id (fk)`, `tag_id (fk)` — composite pk.

**audit_logs**
`id (uuid, pk)`, `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `before_state (jsonb, nullable)`, `after_state (jsonb)`, `metadata (jsonb)`, `severity`, `timestamp`
Index: `(entity_type, entity_id)`, `(timestamp)`, `(severity)`.

**notifications**
`id (uuid, pk)`, `recipient_id (fk users)`, `category`, `entity_type`, `entity_id`, `read (bool)`, `created_at`

**storage_usage_snapshots**
`id (uuid, pk)`, `captured_at`, `company`, `total_bytes`, `quota_bytes`, `file_count`

**mission_summary_mv** (materialized view, refreshed by Dashboard Aggregator every 5 min per §24)
Aggregates `missions` + `generation_jobs` + `assets` into the fields consumed directly by the Dashboard (§8) — deliberately denormalized so dashboard load never runs an expensive live join (NFR-6).

**users / roles / permissions / role_permissions**
Mirrors the proven MK Connect structure (Master Planning `01-research-mkconnect.md` §5) — data-driven roles/permissions, not hardcoded enums, so new roles are addable without a schema migration.

### Optimization Notes
- All status-transition-heavy tables (`generation_jobs`, `assets`) use partial/composite indexes matching the dispatcher's and dashboard's actual query shapes, not blanket single-column indexes.
- `asset_metadata.search_text` (full-text) and `asset_embeddings.embedding` (semantic) are two independent indexes queried together and merged at the application layer for Asset Search (§17), not a single combined index — keeps each index type doing what it's good at.
- No table is ever hard-deleted from; all "removal" is a status column change, so no cascading-delete complexity exists anywhere in the schema (simplifies referential integrity significantly compared to a delete-capable design).

---

## Dashboard Wireframes

### Main Dashboard (`/dashboard`) — see full spec in `01-dashboard-navigation-journey.md` §8

```
+-----------------------------------------------------------------+
| [Active Missions: 4] [Assets Today: 87] [Pending Review: 12]    |
| [QC Pass Rate 7d: 91%] [Drive Usage: 62%]                       |
+---------------------------------+-------------------------------+
| MISSION PROGRESS                | RENDER QUEUE / ALERTS         |
| Villa Launch Hero  [====  ] 70% | Queue: 34 running, 5 retrying |
| Beauty UGC Batch   [======] 95% | Dead-letter: 2  [Selesaikan]  |
| Bathroom Scenes v2 [==    ] 30% | Drive quota 85%+ WARNING       |
+---------------------------------+-------------------------------+
| STORAGE USAGE (donut, by project) | QC TREND (line, 30d, 4 series)|
+-----------------------------------------------------------------+
```

### Mission Detail (`/missions/:id`)

```
+-----------------------------------------------------------------+
| Villa Launch Hero            status: running   priority: high  |
| [Pause] [Cancel] [Retry Failed Jobs]                            |
+-----------------------------------------------------------------+
| Progress: 70/100 jobs complete   |  Approved: 58  Rejected: 6   |
| [===============          ]      |  Pending Review: 6           |
+-----------------------------------------------------------------+
| MISSION ANALYTICS                                                |
| Avg QC score: 88   Avg job duration: 3m40s                       |
| Failure breakdown (pie): timeout 40%, content_policy 30%, other  |
+-----------------------------------------------------------------+
| JOB LIST (table: id, status, attempt, age, error)                |
+-----------------------------------------------------------------+
```

### Render Queue / Job Monitor (`/queue`) — tabs: Queued | Running | Retrying | Dead Letter | Completed

```
+-----------------------------------------------------------------+
| [Queued 34] [Running 12] [Retrying 5] [Dead Letter 2] [Completed]|
+-----------------------------------------------------------------+
| Job ID | Mission          | Priority | Attempts | Age  | Action |
| j-102  | Villa Launch     | high     | 3/4      | 8m   | Retry  |
| j-088  | Bathroom Scenes  | normal   | 4/4 DEAD | 40m  | Retry  |
+-----------------------------------------------------------------+
```

### Review Console (`/qc/review`) — full spec `03-drive-metadata-search-approval-qc.md` §18

```
+---------------------+-------------------------------------------+
| QUEUE (12 pending)   |  ASSET PREVIEW                            |
| [x] asset-441 urgent |  [ large image/video preview ]            |
| [ ] asset-442        |  QC SCORES                                |
| [ ] asset-443        |   Product Fidelity   62  (threshold 75) X |
| ...                  |   Character Fidelity  -                  |
|                       |   Technical Quality   91  OK              |
|                       |   Brand Compliance    88  OK              |
|                       |  [Setujui] [Tolak] [Lewati]               |
|                       |  Canonical reference side-by-side toggle  |
+---------------------+-------------------------------------------+
```

### QC Analytics (`/qc/analytics`)

```
+-----------------------------------------------------------------+
| QC PASS RATE OVER TIME (line, 4 series: product/char/tech/brand) |
+---------------------------------+-------------------------------+
| FAILURE CATEGORY BREAKDOWN       | TOP TEMPLATES BY SCORE (table)|
| (bar chart)                      |                                |
+---------------------------------+-------------------------------+
| DNA VERSIONS WITH REPEATED REJECTIONS (alert list)               |
+-----------------------------------------------------------------+
```

### Google Drive Storage & Sync Status (`/drive`)

```
+-----------------------------------------------------------------+
| Total Usage: 620 GB / 1 TB (62%)      [Refresh Sync Status]      |
+---------------------------------+-------------------------------+
| USAGE BY PROJECT (bar chart)     | RECONCILIATION FLAGS          |
|                                   |  storage_missing: 0           |
|                                   |  unindexed_file: 3 [Review]   |
+---------------------------------+-------------------------------+
```

### Identity Manager — Product/Character DNA List (`/identity/products`, `/identity/characters`)

```
+-----------------------------------------------------------------+
| [+ Tambah Produk Baru]                     Search: [________]    |
+-----------------------------------------------------------------+
| Slug        | Name          | Version | Status    | Updated      |
| product-a   | Serum X       | v3      | approved  | 2026-07-01   |
| product-b   | Cream Y       | v1      | pending   | 2026-07-20   |
+-----------------------------------------------------------------+
```

Every wireframe above is a low-fidelity structural reference for the build team; visual design system (spacing, color, component library) is a separate UX deliverable outside FSD scope, consistent with "architecture and specification, not code or final visual design" framing of this phase.
