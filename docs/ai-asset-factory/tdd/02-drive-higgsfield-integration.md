# TDD §8–9: Google Drive Architecture, Higgsfield Integration

## 8. Google Drive Architecture

### 8.1 Client & Auth
`packages/core/drive` wraps the Google Drive API v3 SDK using a **service account JWT**, exact pattern already validated in MK Connect (Master Planning `01-research-mkconnect.md` §7): credentials in `GOOGLE_SERVICE_ACCOUNT_JSON` (§30), root folder in `GOOGLE_DRIVE_ROOT_FOLDER_ID`, targeting a company-owned **Shared Drive** (service accounts have no personal storage quota, so a Shared Drive is mandatory, not optional).

### 8.2 Folder Synchronization

- `resolveFolderPath(company, project, campaign, statusSegment)` walks the path segment by segment, calling `ensureChildFolder(parentId, name)` per segment — each call does a `files.list` query scoped to the parent (`'{parentId}' in parents and name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`) before `files.create`, making folder creation idempotent under concurrent workers (two workers racing to create the same folder both do the list-then-create check; a unique-name collision on `create` is caught and treated as "already exists, re-list to get the ID" rather than an error).
- Folder ID resolution results are cached in-process per worker (short TTL, e.g. 10 minutes) to avoid a `files.list` round-trip on every single upload — cache invalidated by the Reconciliation Job if it detects drift.

### 8.3 Upload Strategy

- `drive-sync-worker` performs uploads using **resumable upload sessions** (Drive API's resumable upload protocol), not simple multipart upload — required for video assets that can exceed tens of MB and must survive a transient network interruption mid-upload without restarting from byte zero.
- Upload flow: download Higgsfield output to a local ephemeral scratch volume (Docker named volume, not host bind-mount, cleared on container restart) → compute checksum → resolve target folder → open resumable session → stream upload → on Drive confirmation, write the `assets` DB row's `drive_file_id` and mark `uploaded` → delete local scratch file.
- The **database row is created in `pending_upload` status before the upload begins**, so a crash mid-upload leaves a detectable, recoverable row rather than an orphaned file with no record (§8.6, Recovery).

### 8.4 Duplicate Prevention

Implements FSD §15.3 mechanically: checksum computed from the downloaded file *before* any Drive API call, checked against `assets.checksum_sha256` (indexed, §7.3) scoped to the same `product_dna_version`/`character_dna_version`/`prompt_template_version` combination (an identical checksum arising from an unrelated Mission is coincidental, not a true duplicate, and should not be silently discarded). A true duplicate short-circuits before any Drive write, saving both Drive quota and review time.

### 8.5 Versioning

No Drive-native versioning feature is relied upon (Drive's built-in revision history is a recovery safety net, §8.7, not the system's versioning mechanism). Versioning is entirely database-driven: a "new version" of an asset is a new file at a new path with `supersedes_asset_id` set — matching FSD §38's non-destructive lifecycle. This choice is deliberate: relying on Drive's native file-revision stacking would make an asset's "current version" ambiguous to any external reader (including a future MK Connect consumer) who isn't going through this system's database — a fresh file per version keeps the Drive tree itself self-describing.

### 8.6 Recovery / Reconciliation

The **Reconciliation Job** (`drive-sync-worker`, hourly, §FSD 15.7) is the system's primary Drive/DB consistency mechanism:
1. Query all `assets` rows in `pending_upload` older than 15 minutes (stuck uploads) → re-attempt or mark `failed` per standard retry policy (§25).
2. Query all `assets` rows with `uploaded`+ status → confirm `drive_file_id` still resolves via `files.get` → flag `storage_missing` if not (Drive-side deletion or corruption).
3. List all files under the current company/project/campaign tree not matched to any `assets.drive_file_id` → flag `unindexed_file` (never auto-delete — held for manual triage per FSD §15.8).

### 8.7 File Recovery
Google Drive's own Trash (30-day retention default) and Shared Drive version history are the underlying safety net for accidental deletion; the Asset Factory itself never issues a `files.delete` call in normal operation (only Archive, §FSD 39, which *moves*, never deletes). A documented manual runbook (outside this TDD's document set, an operational runbook artifact) covers restoring from Drive Trash if a human manually deletes something outside the app.

### 8.8 Rate Limiting & Quota
Drive API has per-project and per-user (service-account) quota. `drive-sync-worker` applies a token-bucket rate limiter (in-process, no external dependency needed at this system's volume) tuned comfortably under Drive's default quota, and treats `403 userRateLimitExceeded`/`429` responses as a transient-retry case (§25) with extended backoff, distinct from a permanent failure.

---

## 9. Higgsfield Integration

### 9.1 Client Architecture
`packages/core/higgsfield` exposes a narrow internal interface — `submitGeneration(request)`, `pollStatus(jobId)`, `submitSoulIdTraining(references)`, `pollTrainingStatus(trainingId)` — that is the *only* thing the rest of the system calls; all Higgsfield-specific request/response shape translation happens inside this module. This is the provider-abstraction boundary noted in the FSD (§14.6) made concrete: a second provider, if ever added, implements the same four functions and nothing outside this module changes.

### 9.2 Prompt Generation → Request Mapping
The Prompt Engine (§13) outputs a provider-agnostic structure: `{ finalPromptText, referenceBindings: { character_ref?, product_ref?, style_ref? }, cameraParams, negativePrompt }`. The Higgsfield client module maps this to Higgsfield's actual API schema: `character_ref` → Soul ID persona reference (if the Character DNA has a trained `higgsfield_soul_id`) or a plain image reference (if not yet trained — degraded mode, logged as a warning since it means Character Lock isn't fully enforced for that job), `product_ref` → weighted image reference, `cameraParams` → Cinema Studio parameters, `style_ref` → Hero Frame anchor for image-to-video jobs.

### 9.3 Prompt Validation (pre-submission)
Before submission, the client module runs local validation independent of Higgsfield's own API validation: prompt text length within Higgsfield's documented limit, at least one reference present for any job referencing Product/Character DNA (a job that silently drops its reference binding due to an upstream bug must fail loudly here, not generate an unlocked asset), negative prompt non-empty when DNA-level `negative_constraints` exist. A validation failure here is a **configuration/code defect**, not a runtime job failure — it raises immediately and never reaches Higgsfield, logged at `critical` severity since it indicates the Prompt Engine produced an invalid request.

### 9.4 Reference Selection
Implements FSD §28.2: given a job's Camera DNA slot value (e.g., `angle=flat_lay` vs `angle=three_quarter`), the client module selects the most scene-appropriate canonical reference image from the DNA record's reference set rather than always sending the primary reference — this selection logic lives in `packages/core/identity` (queried by the Higgsfield client at request-build time), not duplicated inside the Higgsfield module itself.

### 9.5 Submission & Job ID Persistence
`higgsfield_job_id` is written to the `generation_jobs` row **synchronously, before** the submission call returns to the caller's business logic completes — i.e., the write happens as part of handling Higgsfield's HTTP response, before any other processing, so a crash immediately after submission still leaves a trackable job (never an Higgsfield job running with no local record).

### 9.6 Download Process
On `pollStatus` returning `succeeded`, the response includes a signed output URL. `higgsfield-poller` does not download the asset itself — it enqueues an Upload Queue entry (§10) referencing the output URL, and `drive-sync-worker` performs the actual download+checksum+upload, keeping the poller lightweight and purely status-tracking (a poller stuck on a slow download would otherwise delay status-checking for every other in-flight job it's responsible for).

### 9.7 Retry Strategy
- Transient (network, 5xx, rate-limit): automatic retry per the standard policy (§25) — 4 attempts, exponential backoff base 20s.
- Content-policy rejection: **not retried** — Higgsfield's content-policy failure is deterministic for an identical prompt; retrying wastes credits and time. Job marked `failed_content_policy` per FSD §14.5, surfaced to a human.
- Soul ID training failure: retried per standard policy for transient causes; a training failure that recurs after max attempts blocks the Character DNA version from reaching `approved` (FSD §32) rather than silently leaving a half-trained identity available for production use.

### 9.8 Timeout Strategy
- Standard image/video generation: polled every 15s, hard timeout at 10 minutes (matches the ceiling already validated for Veo-class generation in Master Planning `01-research-mkconnect.md` §3.7) — a job still `processing` past this window is treated as `timeout`, entering the same retry path as a transient failure (a fresh submission, since Higgsfield does not support resuming an in-flight generation).
- Soul ID training: longer-running, polled every 60s, hard timeout at 45 minutes (training is documented as a heavier operation than a single generation) — configurable via environment (§30) since Higgsfield's own documented training duration may shift over time.
- Every timeout is logged with the full elapsed duration and last-known Higgsfield status string, so a systemic slowdown (versus a one-off) is distinguishable in the logs/analytics (§22/§23).

### 9.9 Cost/Quota Tracking
Every successful submission records Higgsfield's reported credit cost (if the API exposes it) or a locally-estimated cost (config-driven per job type, §31, if the API does not) against the job row — feeds the Dashboard's cost-visibility requirement (NFR-10) and the Mission Analytics panel (FSD §12.7).
