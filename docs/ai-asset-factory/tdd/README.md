# AI Asset Factory — Technical Design Document (TDD)

Status: **Phase 3 — Technical Design.** Builds on the approved Master Planning (`docs/ai-asset-factory/00-overview.md`–`08-roadmap-risks.md`) and the approved FSD (`docs/ai-asset-factory/fsd/`). No application code has been written. This TDD is the engineering blueprint a build team implements against.

## Binding Stack Decisions (see `00-system-service-module-architecture.md` for full rationale)

- **Runtime/Framework**: Node.js 22 LTS, TypeScript strict, Next.js 15 (App Router) for the web app.
- **Database**: Postgres via self-hosted Supabase (Docker Compose).
- **Queue**: Postgres-native (`SKIP LOCKED`), no external broker.
- **Storage**: Google Drive (asset binaries), Postgres (structured/metadata).
- **Generation provider**: Higgsfield, behind an internal provider-abstraction module.
- **Deployment**: Docker + Docker Compose on a single Mini PC host, Caddy reverse proxy.

## Document Map

| File | TDD Sections Covered |
|---|---|
| `00-system-service-module-architecture.md` | 1. Overall System Architecture · 2. Service Architecture · 3. Module Architecture · 4. Folder Structure · 5. Project Structure · 6. Component Structure |
| `01-database-architecture.md` | 7. Database Architecture (ERD extension, indexing, RLS, migrations, connection pooling) |
| `02-drive-higgsfield-integration.md` | 8. Google Drive Architecture · 9. Higgsfield Integration |
| `03-queue-jobs-scheduler.md` | 10. Queue Architecture (Mission/Render/Upload/QC/Retry/Archive) · 11. Background Jobs · 12. Scheduler |
| `04-prompt-lock-engines.md` | 13. Prompt Engine · 14. Product Lock Engine · 15. Character Lock Engine · 16. Brand DNA Engine |
| `05-metadata-index-search-mission-qc-analytics-logging.md` | 17. Metadata Engine · 18. Asset Index Engine · 19. Search Engine · 20. Mission Engine · 21. QC Engine · 22. Analytics Engine · 23. Logging Engine |
| `06-error-security-auth-api.md` | 24. Error Recovery · 25. Retry Mechanism · 26. Security · 27. Authentication · 28. Authorization · 29. API Design |
| `07-config-storage-performance-scalability.md` | 30. Environment Variables · 31. Configuration System · 32. File Management · 33. Storage Strategy · 34. Performance Optimization · 35. Scalability Strategy |
| `08-backup-monitoring-deployment-docker-minipc.md` | 36. Backup Strategy · 37. Monitoring · 38. Deployment · 39. Docker Strategy · 40. Mini PC Deployment |

## Cross-Cutting Engineering Principles

1. **No durable state outside Postgres and Google Drive.** Every service/worker is stateless and disposable — restartable at any time with zero data loss (§32, §40.6).
2. **Every failure is classified into a recovery tier at design time**: prevented, self-healing, detected+surfaced, or human-resolved — never "ignored" (§24.1).
3. **One canonical retry policy, one canonical queue-claim pattern**, reused everywhere rather than reimplemented per engine (§10.4, §25).
4. **Every engine is independently specified** (Purpose/Responsibilities/Input/Output/Dependencies/Data Flow/Failure Cases/Recovery Strategy) so implementation can proceed engine-by-engine without cross-team ambiguity (§13–23).
5. **This system never writes to MK Connect (`mkhsistem`)** — the only integration surface remains the shared Google Drive asset structure, unchanged from Master Planning/FSD scope.
6. **Designed for a single Mini PC host today, with documented (not built) extension points** for horizontal worker scaling and a queue-to-broker migration if volume ever demands it (§35).
