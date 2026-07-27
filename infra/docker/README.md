# infra/docker

Dockerfiles per app (TDD §39: one image per service, multi-stage
build/runtime split, `node:22-slim` base) + `docker-compose.yml` (the whole
system as one deployment unit, TDD §38) + `Caddyfile` (reverse proxy,
TDD §26.3).

Run everything from the repo root — see the root `README.md`'s "Running the
full stack" section.

| File | Service |
|---|---|
| `Dockerfile.web` | `web` (Next.js) |
| `Dockerfile.worker-mission-dispatcher` | `mission-dispatcher` |
| `Dockerfile.worker-higgsfield-poller` | `higgsfield-poller` |
| `Dockerfile.worker-drive-sync` | `drive-sync-worker` |
| `Dockerfile.worker-qc` | `qc-worker` |
| `Dockerfile.migrate` | one-shot migration init container (TDD §7.7/§38) |
