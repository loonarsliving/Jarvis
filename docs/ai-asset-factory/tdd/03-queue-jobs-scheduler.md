# TDD §10–12: Queue Architecture, Background Jobs, Scheduler

## 10. Queue Architecture

### 10.1 Design Choice: Postgres-Native Queues

All six queues are Postgres tables with a common shape, claimed via `SELECT ... FOR UPDATE SKIP LOCKED`, not a separate broker (Redis/RabbitMQ/SQS) — see stack rationale in `00-system-service-module-architecture.md`. `SKIP LOCKED` gives correct, race-free concurrent claiming across multiple worker containers/replicas without external infrastructure, which is the same atomicity guarantee a broker would provide, at the cost/complexity budget appropriate for a single Mini PC deployment (§40).

### 10.2 The Six Queues

| Queue | Table | Producer | Consumer | Purpose |
|---|---|---|---|---|
| **Mission Queue** | `missions` (status-driven, not a separate job table) | `web` (Mission Composer submit) | `mission-dispatcher` | Tracks batch production orders; dispatcher expands `queued` Missions into `generation_jobs`. |
| **Render Queue** | `generation_jobs` | `mission-dispatcher` | `mission-dispatcher` (submit) + `higgsfield-poller` (status) | Individual Higgsfield generation jobs — the system's primary work queue. |
| **Upload Queue** | `upload_jobs` | `higgsfield-poller` (on generation success) | `drive-sync-worker` | Decouples "Higgsfield finished" from "asset safely in Drive with metadata" — see §9.6 rationale. |
| **QC Queue** | `qc_jobs` | `drive-sync-worker` (on upload confirm) | `qc-worker` | Decouples ingestion from scoring — an asset is never scored before it's durably stored. |
| **Retry Queue** | *(not a separate table — a status value)* `generation_jobs.status = 'retrying'` / `upload_jobs.status = 'retrying'` / `qc_jobs.status = 'retrying'` | any worker on transient failure | same worker type, on its next poll tick, gated by `next_retry_at` | Time-delayed re-attempt without a distinct table — avoids duplicating claim logic for what is structurally the same job, just delayed. |
| **Archive Queue** | `archive_jobs` | `web` (manual archive action) or a scheduled policy job | `drive-sync-worker` | Decouples the human/policy *decision* to archive from the actual Drive move + DB update, so a large batch-archive action doesn't block the requesting UI action. |

### 10.3 Common Job Row Shape (conceptual, applies to `generation_jobs`, `upload_jobs`, `qc_jobs`, `archive_jobs`)

`id`, `status` (`queued`/`running`/`retrying`/`succeeded`/`failed`/`dead_letter`/`cancelled`), `priority`, `payload (jsonb)`, `attempt_count`, `next_retry_at (nullable)`, `claimed_by (worker instance id, nullable)`, `claimed_at (nullable)`, `enqueued_at`, `updated_at`.

### 10.4 Claim Query (canonical pattern, reused across all four job tables)

```sql
UPDATE <queue_table>
SET status = 'running', claimed_by = $1, claimed_at = now()
WHERE id = (
  SELECT id FROM <queue_table>
  WHERE status = 'queued'
     OR (status = 'retrying' AND next_retry_at <= now())
  ORDER BY priority DESC, enqueued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

`SKIP LOCKED` ensures two worker replicas racing on the same tick never claim the same row — the loser simply sees an empty result and tries again next tick, no explicit locking/coordination code needed beyond this one query shape, reused identically by all four consumer workers against their respective table.

### 10.5 Priority & Fairness

Same four-tier priority (`low`/`normal`/`high`/`urgent`) as FSD §12.4, applied uniformly at every queue stage (a `urgent` Mission's jobs stay `urgent` through Render → Upload → QC, not just at submission) so an urgent Mission doesn't lose its priority advantage partway through the pipeline.

### 10.6 Dead-Letter Handling

A job exhausting its max attempts (§25) transitions to `dead_letter`, **remains in its table** (never moved to a separate dead-letter table — keeps the full attempt history colocated, simpler querying for the Job Monitor UI, FSD §25) and is excluded from the claim query's `WHERE` clause by virtue of its status no longer matching `queued`/`retrying`. Manual retry (FSD §23) resets `status='queued', attempt_count=0` — a normal update, re-entering the claim query naturally.

## 11. Background Jobs

Full inventory of every recurring/background process in the system, each mapped to its owning worker container:

| Job | Owner | Cadence | Responsibility |
|---|---|---|---|
| Mission Dispatcher tick | `mission-dispatcher` | every 10s | Expand queued Missions into jobs; claim+submit queued Render Queue jobs up to available capacity. |
| Higgsfield Status Poller tick | `higgsfield-poller` | every 15s | Poll all `submitted`/`running` generation jobs' Higgsfield status; on completion, enqueue Upload Queue entry. |
| Soul ID Training Poller tick | `higgsfield-poller` | every 60s | Poll in-flight `soul_id_training_jobs`. |
| Upload Worker tick | `drive-sync-worker` | every 5s | Claim+process Upload Queue entries. |
| QC Worker tick | `qc-worker` | every 5s | Claim+process QC Queue entries. |
| Archive Worker tick | `drive-sync-worker` | every 30s | Claim+process Archive Queue entries. |
| Reconciliation Job | `drive-sync-worker` | hourly | Drive/DB consistency check (§8.6). |
| Storage Usage Snapshot | `drive-sync-worker` | hourly (paired with Reconciliation) | Write `storage_usage_snapshots` row. |
| Dashboard Aggregator | `web` (internal timer, not a worker container — see §7.4 rationale) | every 5 min | Refresh `mission_summary_mv`. |
| Notification Digest | `web` | hourly | Batch review-flag digest notifications (FSD §21). |
| Prompt Template Performance Aggregator | `web` | daily | Compute per-template QC score averages, flag underperformers (FSD §27). |
| Repeated-Rejection Pattern Detector | `qc-worker` | on every rejection event (not time-scheduled — event-triggered) | FSD §18's "second rejection for same DNA+template" notification trigger. |

Every tick is independently scheduled inside its owning process (`setInterval`-equivalent with jitter to avoid thundering-herd alignment across replicas) — there is no central cron orchestrator process (§12 explains why).

## 12. Scheduler

### 12.1 Why No Central Scheduler Process

A single central scheduler (e.g., one process cron-triggering all of the above) would reintroduce exactly the single-point-of-failure pattern Master Planning explicitly flagged as a weakness in MK Connect's render pipeline (`01-research-mkconnect.md` §3.6, §25 resilience requirement in the FSD). Instead, **every worker schedules its own recurring work internally**. This means losing one worker container only stalls that worker's specific responsibility (e.g., losing `qc-worker` stalls QC processing, but Missions still dispatch, uploads still happen — assets simply queue up in the QC Queue until the container restarts), never the whole pipeline.

### 12.2 Jitter

Every interval adds a small random jitter (±10–20% of the interval) to its own tick timing — prevents multiple worker replicas (if horizontally scaled, §35) from all polling in lockstep and creating synchronized load spikes against Postgres.

### 12.3 Graceful Shutdown

Every worker registers a `SIGTERM` handler (Docker's stop signal) that: stops accepting new claims immediately, allows any in-flight claimed job to finish its current step (not abandon it mid-write), then exits — bounded by a shutdown grace period (Docker Compose `stop_grace_period`, tuned per worker: short for pollers, longer for `drive-sync-worker` mid-upload) after which Docker force-kills. A job whose worker is force-killed mid-processing is later caught by that queue's own staleness check (a `running`/`claimed_at` row older than a sane processing-time ceiling is treated as abandoned and reset to `retrying` by the next tick of the same worker type on startup) — this is the queue-level equivalent of the Reconciliation Job, applied to in-flight job state rather than Drive/DB drift.

### 12.4 Startup Behavior

On container start, each worker runs one **recovery pass** before entering its normal tick loop: reset any row it previously claimed (`claimed_by = <this worker's old instance id>`) that's still `running` back to `retrying` — handles the case where the container was killed ungracefully (crash, OOM, forced restart) and never got to run its graceful-shutdown recovery. This, combined with §12.3, means no job can be permanently stranded in `running` state regardless of how the previous process instance ended.
