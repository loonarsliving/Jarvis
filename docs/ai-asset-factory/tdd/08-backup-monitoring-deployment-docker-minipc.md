# TDD §36–40: Backup Strategy, Monitoring, Deployment, Docker Strategy, Mini PC Deployment

## 36. Backup Strategy

Two independent durable stores, two independent backup mechanisms:

- **Postgres**: scheduled `pg_dump` (logical backup) via a dedicated backup script/container, mirroring MK Connect's already-proven approach (`scripts/backup-database.ts` + `.github/workflows/backup.yml`, Master Planning `01-research-mkconnect.md` §1) — run daily, output stored **off the Mini PC** (a cloud object store or a second physical location) since a local-only backup is not a real backup against hardware failure/theft/fire. Retention: 30 daily + 12 monthly, pruned automatically.
- **Google Drive**: Drive's own durability/replication is Google's responsibility (not re-backed-up separately) — the Asset Factory's job is ensuring the *database* (which is the only thing that knows how to interpret the Drive contents — file IDs, provenance, status) is recoverable; a lost database with intact Drive files is a recoverable-but-painful state (Drive files still exist, `unindexed_file` reconciliation flags would surface them, but provenance would need manual reconstruction) — a lost Postgres backup combined with a lost database is the actual catastrophic scenario this strategy prevents.
- **Backup verification**: a monthly automated restore-to-scratch-database test (restore the latest dump into a throwaway Postgres instance, run a basic row-count/integrity sanity check) — a backup that has never been test-restored is not a verified backup, a lesson worth encoding here explicitly even though it adds process overhead.
- **DNA records specifically**: since Product/Character DNA (especially trained Soul ID personas) represent real production investment (training cost, review time), their backup is doubly covered — both in the standard Postgres dump and, for the reference imagery specifically, already durable in Drive independent of the database.

## 37. Monitoring

- **Health endpoints**: every service (`web` + all four workers) exposes a `/health` (or equivalent internal check) reporting: process up, DB connection reachable, and — for pollers specifically — time since last successful tick (a worker that's "up" but whose loop has silently stopped ticking is a real failure mode worth distinguishing from a fully-dead process).
- **Docker health checks**: each container's `Dockerfile`/Compose service defines a `HEALTHCHECK` hitting the above endpoint — feeds directly into Docker's own restart behavior (§38) and into `docker compose ps` operational visibility.
- **Application-level monitoring surface**: the Monitoring dashboard already specified conceptually in FSD navigation (`fsd/01-dashboard-navigation-journey.md` §9) is backed by: queue depth per queue (§10), dead-letter counts, Higgsfield API error rate (rolling window), Drive reconciliation flag counts, last-successful-tick timestamp per worker — all queryable from existing tables (`generation_jobs`/`upload_jobs`/`qc_jobs` status counts, `audit_logs` severity counts) without a separate metrics database, appropriate at this system's scale.
- **Alerting**: piggybacks on the existing Notification Engine (FSD §21) — a monitoring threshold breach (e.g., dead-letter count above N, a worker's last-tick timestamp older than 3× its expected interval) generates the same kind of `critical`-severity notification as any other critical business event, rather than standing up a separate alerting stack (Prometheus/Grafana would be legitimate future additions per §35's "don't build ahead of need" principle, not a v1 requirement for a single-Mini-PC deployment).
- **Log aggregation**: Docker's own `json-file` log driver with rotation (`max-size`/`max-file` set per service in Compose) is sufficient at this deployment scale — `docker compose logs` is the operational log-reading tool; no external log shipping (e.g., to a hosted log service) is required for v1, documented as an easy addition later (Caddy/Docker logs are already structured enough to ship if ever needed).

## 38. Deployment

- **Deployment unit**: the entire system (5 app services + self-hosted Supabase stack + Caddy) is one `docker-compose.yml` (with the Supabase portion as a maintained overlay/subset of Supabase's official self-hosted compose file, kept in `/infra/supabase`, updated deliberately on Supabase version bumps rather than auto-tracking upstream).
- **Deployment process**: `git pull` on the Mini PC (or a CI-built image pushed to a private registry and pulled — the two viable options; given a single-host Mini PC with no complex CI infra requirement, a simple `docker compose build && docker compose up -d` pull-and-rebuild-in-place flow is the pragmatic v1 choice, with a private registry as a documented upgrade path once multiple hosts or CI-driven deploys are needed) → run migrations (one-shot init container, §7.7) → roll services (`docker compose up -d --wait`, which respects health checks before considering a service "up").
- **Rollback**: since migrations are additive-first (§7.7), rolling application code back to the previous Git commit/image tag and restarting is sufficient for the common case; a schema-breaking migration (rare, only when truly unavoidable) is paired with an explicit rollback runbook step in that migration's own commit message — not automated, since destructive schema rollbacks are exactly the kind of action that warrants a human decision per this engagement's own operating principles.
- **Zero-downtime consideration**: explicitly *not* a v1 requirement — a single Mini PC serving an internal team can tolerate a brief deploy window (Caddy returns a short 502 during container restart); building blue-green deployment on a single physical host would be disproportionate complexity for the actual availability need here.

## 39. Docker Strategy

- **Base images**: `node:22-slim` for all Node-based services (small attack surface, matches the pinned runtime version, §00 stack decision) — no Alpine (avoids musl-libc compatibility edge cases with native npm dependencies, a real risk for any embedding/similarity-scoring native modules the Lock Engines might depend on, §14/§15).
- **Multi-stage builds**: every `Dockerfile` separates a `build` stage (full devDependencies, TypeScript compilation) from a `runtime` stage (production `node_modules` only, compiled output copied in) — smaller final images, faster container start, smaller attack surface.
- **One image per service**, not one shared image with a mode flag — keeps each container's dependency footprint minimal (a worker that never touches Next.js doesn't ship Next.js) and makes resource limits (§39 below) meaningful per actual workload.
- **Resource limits**: every service defines Compose `deploy.resources.limits` (memory ceiling in particular) — critical on a Mini PC with fixed, non-elastic RAM, so one runaway process (e.g., a stuck video-processing step) cannot starve the rest of the stack; a container hitting its memory limit is killed and restarted (§38) rather than degrading the whole host.
- **Networking**: a single Docker Compose `bridge` network internal to the stack; only Caddy binds to the host's `80`/`443`, per §26.3.
- **Volumes**: named volumes only for (a) Postgres data directory, (b) the ephemeral scratch volume (§32) — no host bind-mounts for application code in production (bind-mounts are a development-only convenience, kept out of the production Compose file entirely to avoid accidental host-filesystem coupling).

## 40. Mini PC Deployment

### 40.1 Reference Hardware Baseline
A documented minimum, not a purchase recommendation: 8-core CPU, 32GB RAM, 1TB NVMe SSD, wired Ethernet (Wi-Fi is a reliability risk for a server role) — sized to comfortably run Postgres + 5 app containers + Caddy with headroom, informed by the "modest but real" workload profile (internal production system, not public-internet scale).

### 40.2 Full Stack on One Host

```
Mini PC (Ubuntu Server LTS recommended — long support window, minimal footprint)
 └── Docker Engine + Docker Compose
      ├── caddy                (host ports 80/443)
      ├── web                  (internal only)
      ├── mission-dispatcher   (internal only)
      ├── higgsfield-poller    (internal only)
      ├── drive-sync-worker    (internal only)
      ├── qc-worker            (internal only)
      ├── supabase-db (Postgres)
      ├── supabase-auth (GoTrue)
      ├── supabase-rest (PostgREST)
      ├── supabase-realtime    (used minimally/optionally — in-app notification live-push, if implemented via Realtime rather than polling)
      └── supabase-studio      (admin-only DB browser, bound to localhost/VPN only, never public)
```

### 40.3 Node — Runtime Presence
Node.js itself is never installed on the host directly — every Node process runs inside its container per §39, so the host's only "runtime" dependency is Docker Engine itself. This keeps the host OS minimal and avoids Node-version drift between host and containers.

### 40.4 Supabase on Mini PC
Self-hosted per the stack decision in `00-system-service-module-architecture.md` — the official Supabase Docker Compose distribution, vendored into `/infra/supabase` and version-pinned (upgraded deliberately, tested in a staging pass before production rollout, never auto-updated) since a self-hosted Auth/DB stack failing silently on an unattended upgrade would be a severe availability risk for a single-host deployment with no hot standby.

### 40.5 Google Drive & Higgsfield on Mini PC
Both are external cloud APIs reached over the Mini PC's outbound internet connection — no local component beyond the API clients already described in §8/§9. This means **outbound internet reliability is a hard dependency** for this system's core production loop, worth calling out explicitly: if the Mini PC's internet connection drops, generation and storage both pause (gracefully, per §24.2's degradation behavior) and resume automatically once connectivity returns, with no data loss, but zero production throughput during the outage — an accepted operational characteristic of this deployment model, not a defect to engineer around (an offline-capable generation pipeline is out of scope, since Higgsfield itself is a cloud service).

### 40.6 Background Workers — Automatic Restart
Every service's Compose entry sets `restart: unless-stopped` — Docker's own restart policy handles process-level crash recovery (a worker that throws an unhandled exception and exits gets restarted by Docker within seconds), combined with the container's own startup recovery pass (§12.4) to resume in-flight work cleanly. `unless-stopped` (rather than `always`) is chosen specifically so a deliberate `docker compose stop` for maintenance is respected and the service doesn't fight an intentional shutdown.

### 40.7 Crash Recovery — Whole-Host
- **Docker Engine restart on boot**: enabled (`systemctl enable docker`), and Compose's `restart: unless-stopped` policy means a full Mini PC power cycle (outage, reboot) brings the entire stack back up automatically with no manual intervention — verified as part of the deployment runbook (a documented "pull the power cable and confirm full auto-recovery" test before go-live is a reasonable acceptance criterion, given this is a single-host deployment with no failover host).
- **Postgres crash recovery**: standard Postgres WAL-based crash recovery on container restart (no special handling needed — this is Postgres's own well-proven mechanism); the named volume (§39) ensures data directory persistence across container recreation.
- **Mid-job crash recovery**: covered end-to-end by the queue staleness/recovery pass (§12.4) and the Drive/DB Reconciliation Job (§8.6) — no job, upload, or QC evaluation can be permanently lost to a crash at any single point in the pipeline, only delayed until the relevant recovery mechanism's next tick.
- **Disaster recovery (total hardware loss)**: restore from the off-host Postgres backup (§36) onto replacement hardware, re-point `GOOGLE_DRIVE_ROOT_FOLDER_ID`/`HIGGSFIELD_API_KEY` env vars (unchanged, since Drive/Higgsfield are cloud services independent of the Mini PC), redeploy the same Compose stack — the Reconciliation Job's first run on the new host will re-sync any Drive-side state the restored database doesn't yet fully reflect (e.g., assets uploaded after the last backup but before the failure) by surfacing them as `unindexed_file` flags for review rather than silently losing them.
