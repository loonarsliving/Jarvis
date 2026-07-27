# AI Asset Factory — Functional Specification Document (FSD)

Status: **Phase 2 — Functional Specification.** Builds on the approved Master Planning documents in `docs/ai-asset-factory/00-overview.md` through `08-roadmap-risks.md`. No code has been written for AI Asset Factory. This FSD is the blueprint a build team implements against.

Key concrete decisions made at this phase (see `00-executive-objectives-requirements.md` header):
- Generation provider: **Higgsfield** (Soul ID for Character Lock, Cinema Studio for camera control, Hero Frame for image-to-video), wrapped behind an internal provider-abstraction layer.
- Storage: **Google Drive** as sole master storage.
- Consumer: **MK Connect Content AI**, read-only, via shared Drive structure only — `mkhsistem` repo is never modified.

## Document Map

| File | FSD Sections Covered |
|---|---|
| `00-executive-objectives-requirements.md` | 1. Executive Summary · 2. Business Objectives · 3. System Objectives · 4. Functional Requirements · 5. Non-Functional Requirements · 6. User Roles · 7. User Permissions |
| `01-dashboard-navigation-journey.md` | 8. Dashboard Overview · 9. Navigation Structure · 10. Complete User Journey |
| `02-production-mission-generation-higgsfield.md` | 11. Complete Production Workflow · 12. Mission Workflow · 13. Asset Generation Workflow · 14. Higgsfield Integration Workflow |
| `03-drive-metadata-search-approval-qc.md` | 15. Google Drive Storage Workflow · 16. Metadata Workflow · 17. Asset Search Workflow · 18. Asset Approval Workflow · 19. Quality Control Workflow |
| `04-logging-notification-error-retry-scheduler-queue.md` | 20. Logging · 21. Notification · 22. Error Handling · 23. Retry · 24. Scheduler · 25. Mission Queue Workflow |
| `05-prompt-engine-product-character-lock.md` | 26. AI Prompt Workflow · 27. Prompt Versioning · 28. Product Lock · 29. Character Lock · 30. Brand DNA · 31. Product DNA · 32. Character DNA Workflow |
| `06-folder-naming-metadata-tagging-lifecycle-archive-scalability.md` | 33. Folder Organization · 34. Google Drive Folder Hierarchy · 35. Asset Naming Convention · 36. Metadata Standard · 37. Tagging Standard · 38. Asset Lifecycle · 39. Archive Workflow · 40. Future Scalability |
| `07-database-erd-dashboards.md` | Complete Database Design (ERD, tables, relationships, indexes) · All Dashboard Page Wireframes |

## Cross-Cutting Design Principles (apply to every section above)

1. **No silent failure, no silent data loss.** Every job ends in a visible terminal state; every deletion is a status change, never a hard delete.
2. **Identity lock is a hard gate.** Product/Character Fidelity failures block auto-approval; only a narrowly-permissioned, mandatorily-justified, loudly-logged override can bypass it.
3. **Provenance is non-negotiable.** Every asset carries its exact prompt, DNA versions, job ID, and QC history — permanently.
4. **AI Asset Factory does not do MK Connect's job.** No publishing, no campaign management, no social scheduling — the boundary is the shared Google Drive asset structure.
5. **Everything that failed in MK Connect's own render pipeline (no retry, single-worker SPOF, no feedback loop) is deliberately designed out here from day one**, per the findings in Master Planning `01-research-mkconnect.md`.
