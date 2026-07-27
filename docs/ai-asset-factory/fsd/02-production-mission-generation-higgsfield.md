# FSD §11–14: Production Workflow, Mission Workflow, Asset Generation Workflow, Higgsfield Integration

## 11. Complete Production Workflow (End-to-End)

```
[Mission Composer]
      |  human creates Mission (subject, DNA refs, quantity, template, priority)
      v
[Mission Engine]
      |  expands Mission into N individual Generation Jobs
      v
[Prompt Engine]
      |  assembles final Higgsfield prompt per job from DNA + template + variation slot
      v
[Higgsfield Integration Layer]
      |  submits job, polls status, retrieves output asset
      v
[Ingestion]
      |  downloads output, computes checksum, uploads to Google Drive at deterministic path
      v
[Quality Control Engine]
      |  scores Product Fidelity / Character Fidelity / Technical Quality / Brand Compliance
      v
   +--+-------------------+--------------------+
   |                      |                    |
[Auto-Approve]     [Flag for Review]     [Auto-Reject]
   |                      |                    |
   v                      v                    v
[approved]          [Review Console]     [rejected]
   |                 human decides             |
   |             +----+----+                   |
   |             v         v                   |
   |        [approved] [rejected]               |
   v             |         |                    v
[Asset Library / Google Drive /approved] <------+---------[Google Drive /rejected]
      |
      v
[Available to MK Connect Content AI as read-only consumer]
```

Every arrow in this diagram is a logged, auditable transition (see `07-logging-notification-error-retry.md`).

## 12. Mission Workflow (Mission Engine)

A **Mission** is the unit of production planning — a batch order, not an individual generation. Examples from the brief: "Generate 100 Hero Product Assets", "Generate 200 Bathroom Scenes", "Generate 300 Luxury Villa Footage", "Generate 100 Hospitality Lifestyle Clips".

### 12.1 Mission Data Model (conceptual)

- `mission_id`, `name`, `subject_type` (`product`/`character`/`scene`/`mixed`), `target_quantity`
- `dna_refs[]` — one or more Product/Character/Brand DNA record+version references
- `prompt_template_id` + version
- `target_platforms[]`
- `priority` (`low`/`normal`/`high`/`urgent`)
- `status` (`draft`/`queued`/`running`/`paused`/`completed`/`completed_with_failures`/`cancelled`)
- `created_by`, `created_at`
- `jobs_total`, `jobs_completed`, `jobs_failed`, `jobs_pending`
- `assets_approved`, `assets_rejected`, `assets_pending_review`

### 12.2 Mission Status Lifecycle

```
draft -> queued -> running -> [paused <-> running] -> completed | completed_with_failures | cancelled
```

- `draft`: being composed, not yet submitted (allows saving a Mission template without launching).
- `queued`: submitted, jobs being created, not yet dispatched.
- `running`: at least one job actively processing.
- `paused`: human-initiated hold — no new jobs dispatched, in-flight jobs finish normally.
- `completed`: all jobs finished, zero failures.
- `completed_with_failures`: all jobs finished, some ended in `dead_letter` after exhausting retries.
- `cancelled`: human-terminated before completion; already-completed assets are retained (not discarded).

### 12.3 Mission Queue

Missions do not compete directly — they expand into individual **Generation Jobs**, and it is jobs that populate the shared Render Queue (see `06-scheduler-mission-queue.md`). Mission-level priority propagates to its jobs' priority, so an `urgent` Mission's jobs are dispatched ahead of a `normal` Mission's queued jobs, but a `normal` Mission already `running` is not preempted mid-job.

### 12.4 Mission Priority

Four levels (`low`/`normal`/`high`/`urgent`). Dispatcher picks next job strictly by priority, then by enqueue time (FIFO within a priority tier). Only Super Admin and Production Manager can set `urgent` (guard against priority inflation).

### 12.5 Mission Retry

Mission-level retry is a bulk action: `Retry Semua Job Gagal` on a `completed_with_failures` Mission re-enqueues every job in `dead_letter` state belonging to that Mission with a reset attempt counter. Individual job retry is also available (see `06-scheduler-mission-queue.md`).

### 12.6 Mission Completion

A Mission is evaluated for completion whenever a job belonging to it finishes (success or dead-letter). When `jobs_completed + jobs_failed == jobs_total`, Mission status resolves to `completed` or `completed_with_failures`. Completion triggers a notification (see `08-logging-notification-error-retry.md`) to the Mission's creator and to any subscribed Production Manager.

### 12.7 Mission Analytics

Per-Mission analytics panel (on Mission Detail page): completion rate over time (chart), average QC score of resulting assets, approval rate, average job duration, failure reason breakdown (pie chart: `higgsfield_timeout`, `higgsfield_rejected_content`, `drive_upload_failed`, `qc_engine_error`, `other`).

## 13. Asset Generation Workflow

Per-job flow, triggered by the Dispatcher pulling a queued Generation Job:

1. **Prompt assembly**: Prompt Engine composes the final prompt (see `09-prompt-engine.md`) using the job's DNA refs, template, and this job's specific variation slot values (e.g., this is job 47 of 100 — background variant #7, angle variant #3).
2. **Reference binding**: canonical DNA reference images are attached to the Higgsfield request as role-tagged references (`character_ref`, `product_ref`, `style_ref`) per the pattern documented in Master Planning `03-consistency-framework.md` §5.
3. **Submission**: job submitted to Higgsfield via the Higgsfield Integration Layer; `higgsfield_job_id` stored against the Generation Job row immediately (before any polling) so no submitted job can ever become untracked.
4. **Polling**: status polled on a backoff schedule (see `06-scheduler-mission-queue.md`) until `succeeded`/`failed`/`timeout`.
5. **Retrieval**: on success, output media downloaded, checksum computed (duplicate-prevention input, see `07-google-drive-workflow.md` §"Duplicate Prevention").
6. **Ingestion**: uploaded to Google Drive `/raw` first (never directly to `/approved`), metadata companion written.
7. **QC dispatch**: job handed to Quality Control Engine (see `04-approval-qc-workflow.md`).

A **Generation Job** never skips the `/raw` stage — this guarantees nothing reaches an "approved" surface without QC evaluation, even under any future workflow shortcut.

## 14. Higgsfield Integration Workflow

### 14.1 Integration Layer Responsibilities

- Authenticate to Higgsfield API using a credential stored in Settings → Integrations (Super Admin only, encrypted at rest).
- Translate the AI Asset Factory's internal, role-tagged reference/prompt structure into Higgsfield's specific request schema (Soul ID persona reference for Character Lock, standard image reference for Product Lock, Cinema Studio parameters for camera/lens control, Hero Frame for image-to-video anchoring).
- Track Higgsfield credit/quota consumption per job (cost visibility, NFR-10).
- Isolate the rest of the system from Higgsfield-specific API shape — if Higgsfield's API changes or a second provider is ever added, only this layer changes (architecture discipline carried over from Master Planning `07-system-architecture.md` §2.4, and from the provider-abstraction pattern already proven in MK Connect for its Gemini integration).

### 14.2 Character Lock via Higgsfield Soul ID

For any Mission referencing a Character DNA record, the Integration Layer:
1. Checks whether this Character DNA version already has a trained Soul ID persona on Higgsfield (stored as `higgsfield_soul_id` on the Character DNA record).
2. If not, triggers Soul ID training as part of Character DNA onboarding (see `10-brand-product-character-dna.md`) — a one-time cost per character version, amortized across all future missions referencing it.
3. If yes, reuses the existing `higgsfield_soul_id` for every job — this is what guarantees identity consistency across thousands of assets per Master Planning's Character Lock framework.

### 14.3 Product Lock via Reference Conditioning

Higgsfield does not offer a persona-training equivalent for inanimate products, so Product Lock relies on: canonical high-resolution reference image(s) attached as weighted references + explicit negative-prompt exclusions assembled by the Prompt Engine (see `13-product-lock.md`). The Integration Layer always attaches the Product DNA's canonical reference at the platform's maximum supported reference weight for product-class jobs, configurable per product if a specific product needs a different weight (documented on the Product DNA record).

### 14.4 Job Status Mapping

| Higgsfield status | Internal Generation Job status |
|---|---|
| `pending` / `queued` (Higgsfield-side) | `submitted` |
| `processing` | `running` |
| `succeeded` | `retrieving` → `ingested` (after Drive upload) |
| `failed` (content policy / generation error) | `failed` (retry per `06-scheduler-mission-queue.md`) |
| No response within timeout window | `timeout` (treated as failure, retried) |

### 14.5 Failure Handling Specific to Higgsfield

- **Content policy rejection**: not retried automatically (retrying the identical prompt will fail identically) — job marked `failed_content_policy`, surfaced distinctly in Job Monitor so a human can adjust the prompt/template rather than the system wasting retry budget.
- **Rate limit / quota exceeded**: retried with extended backoff; if persistent, the Mission auto-pauses and an `urgent` notification is sent to Super Admin (this is a systemic issue, not a per-job issue).
- **Transient network/API error**: standard retry policy applies (see `06-scheduler-mission-queue.md`).

### 14.6 Future Expansion

The Integration Layer's interface is designed so a second generative provider (e.g., for a specific asset class Higgsfield handles poorly) could be added by implementing the same internal contract — this is an architectural allowance, not a v1 deliverable. No second provider is in scope for this FSD.
