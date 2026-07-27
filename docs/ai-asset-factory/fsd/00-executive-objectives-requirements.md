# FSD §1–7: Executive Summary, Objectives, Requirements, Roles & Permissions

Status: **Functional Specification Document (FSD) — Phase 2.** Builds on the approved Master Planning in `docs/ai-asset-factory/00-overview.md` through `08-roadmap-risks.md`. No code has been written. This is the blueprint a build team implements against.

Concrete decisions locked in this phase (superseding "provider-agnostic" language from Master Planning where it conflicts):
- **Generation provider: Higgsfield**, specifically its Soul ID (character identity training), Cinema Studio 3.0 (camera/lens control), and Hero Frame (image-to-video anchor) capabilities, per `docs/ai-asset-factory/02-research-market.md` §1. The Generation Orchestrator (see `11-scheduler-mission-queue.md`) still wraps Higgsfield behind a provider interface internally — this is an implementation discipline, not a promise of multi-provider support in v1.
- **Storage: Google Drive** is the sole master storage (no Supabase Storage, no S3) — see `07-google-drive-workflow.md`.
- **Consumer: MK Connect Content AI** — read-only consumer of approved assets + metadata. AI Asset Factory never writes to `mkhsistem`.

---

## 1. Executive Summary

AI Asset Factory is PT Maha Karya Haluoleo's internal enterprise system for producing premium, brand-consistent visual assets (product photography, lifestyle scenes, character-based UGC-style video) at scale using Higgsfield as the generative engine, with Google Drive as the permanent, structured asset archive. It is organized around **Missions** — batch production orders ("Generate 100 Hero Product Assets") — that flow through a governed pipeline: Brief → Prompt Assembly (modular DNA-based) → Generation (Higgsfield) → Quality Control → Human Approval → Archival with full metadata/provenance. Every asset is traceable back to the exact prompt, DNA versions, and Higgsfield job that created it. The system's differentiators are enforced **Product Lock** and **Character Lock** — guarantees that a given product or model identity renders identically across thousands of assets — and a closed-loop **Prompt Engine** that improves its own templates using Quality Control scores as feedback.

## 2. Business Objectives

1. Eliminate per-asset manual creative production cost for high-volume commercial content needs (product catalogs, lifestyle campaigns, hospitality/villa footage).
2. Guarantee brand and product fidelity at scale — zero tolerance for wrong logo, wrong packaging, wrong color, inconsistent character identity reaching approved status.
3. Build a compounding, reusable visual asset library that increases in value over time (every approved asset is searchable and reusable, not disposable).
4. Feed MK Connect Content AI a reliable, high-quality upstream asset supply so its own pipeline (which today is partly scaffolding — see Master Planning `01-research-mkconnect.md`) is never asset-starved once its downstream stages mature.
5. Reduce time-to-campaign-ready-asset from days (manual photo/video shoots) to hours (governed AI production with automated QC triage).

## 3. System Objectives

1. Run **Missions**: batch generation orders with defined quantity, subject (product/character/scene), and success criteria, processed through a resilient queue (retry, backoff, dead-letter — capability absent in MK Connect's own render/Veo workers, deliberately fixed here).
2. Enforce **Product Lock** and **Character Lock** on every asset before it can reach `approved` status.
3. Store every asset in Google Drive under a deterministic, permission-controlled folder hierarchy with zero orphaned or duplicate files.
4. Attach complete, structured, queryable metadata (provenance, DNA versions, prompt, QC scores) to every asset.
5. Provide a Quality Control system that auto-approves, auto-rejects, or routes to human review based on scored dimensions, never allowing an identity-lock failure to slip through automatically.
6. Provide full audit logging, notification, and error-recovery for every automated step.
7. Provide dashboards giving production, quality, and storage visibility to every role that needs it.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | System shall allow authorized users to create a Mission specifying: subject type (product/character/scene), target quantity, Brand/Product/Character DNA references, platform target(s), and priority. |
| FR-2 | System shall assemble a complete Higgsfield-ready prompt automatically from modular DNA components (Brand, Product, Character, Scene, Camera, Lighting, Motion, Negative) without manual prompt writing required for standard missions. |
| FR-3 | System shall submit generation jobs to Higgsfield, track their status, and retrieve completed assets automatically. |
| FR-4 | System shall run every generated asset through Quality Control (Product Fidelity, Character Fidelity, Technical Quality, Brand Compliance) before it is visible as a production-ready candidate. |
| FR-5 | System shall block any asset that fails Product Lock or Character Lock validation from reaching `approved` status without human override. |
| FR-6 | System shall store every asset in Google Drive at a deterministic path derived from company/project/campaign/asset-type, and shall never create duplicate folders for the same logical path. |
| FR-7 | System shall write structured metadata (JSON companion + database row) for every asset at creation time, including full prompt, DNA versions, model/job ID, QC scores, and timestamps. |
| FR-8 | System shall allow full-text, tag, and semantic search over all approved assets. |
| FR-9 | System shall provide a Review Console where flagged assets can be approved or rejected by an authorized human, with reason capture. |
| FR-10 | System shall retry failed generation/upload/QC jobs automatically according to a defined backoff policy, and shall move permanently-failed jobs to a dead-letter state visible to operators. |
| FR-11 | System shall notify relevant users (in-app + optionally email/WhatsApp bridge) on Mission completion, Mission failure-threshold breach, and assets requiring review. |
| FR-12 | System shall maintain a versioned history of every Prompt Template and every DNA record (Brand/Product/Character), never destructively overwriting a version in use by existing assets. |
| FR-13 | System shall log every state-changing action (who/what/when/before-after) for audit purposes. |
| FR-14 | System shall expose dashboards showing Mission progress, render queue depth, Google Drive usage, asset statistics, and quality analytics, scoped by role permission. |
| FR-15 | System shall never modify or write to the MK Connect (`mkhsistem`) repository or database — its only interface with MK Connect is the shared Google Drive asset structure. |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Reliability | Generation/upload job failures must never silently disappear — every job ends in `completed`, `failed`, or `dead_letter`, all visible in the UI. |
| NFR-2 | Scalability | The mission queue must handle at least 1,000 queued generation jobs without degradation; architecture must not assume a single always-on worker is sufficient long-term (learned from MK Connect's single-worker render pipeline limitation). |
| NFR-3 | Auditability | Every asset must be traceable end-to-end: brief → DNA versions → prompt → Higgsfield job ID → QC report → approval decision, with no gaps. |
| NFR-4 | Security | Google Drive access is via a dedicated service account with least-privilege scope to the Asset Factory's Shared Drive only; role-based access control gates every UI action and API call. |
| NFR-5 | Availability | Core production loop (Mission → Generation → QC → Storage) must tolerate a single Higgsfield API outage without data loss — jobs pause and resume, not fail permanently. |
| NFR-6 | Performance | Dashboard pages must load primary KPIs within 2 seconds against up to 500,000 indexed assets (index-backed queries, not live Drive traversal — see `07-google-drive-workflow.md`). |
| NFR-7 | Data integrity | No hard-delete of any asset or DNA record that has ever been referenced by a Mission or downstream consumer — status transitions only (`archived`, `superseded`, `rejected`). |
| NFR-8 | Localization | UI text in Bahasa Indonesia as primary language (matching MK Connect convention), with English retained for technical/AI domain terms where that is the clearer convention (e.g., "Prompt", "Render Queue"). |
| NFR-9 | Observability | Every automated worker (mission dispatcher, Higgsfield poller, Drive uploader, QC engine) emits structured logs and health signals consumable by the Monitoring dashboard. |
| NFR-10 | Cost control | System must expose Higgsfield credit/quota usage and Google Drive storage usage prominently, since both are metered/finite resources. |

## 6. User Roles

| Role | Description |
|---|---|
| **Super Admin** | Full system access: all missions, all DNA records, all settings, user management, integration configuration (Higgsfield API keys, Google Drive service account). Mirrors MK Connect's `super_admin` convention. |
| **Production Manager** | Creates and manages Missions, sets priority, views all production/quality dashboards, cannot change system integration settings. |
| **Creative Director** | Owns Brand DNA, Product DNA, Character DNA — creates, reviews, approves new DNA versions and turnaround sheets. Reviews Prompt Templates. |
| **QC Reviewer** | Works the Review Console — approves/rejects flagged assets, cannot create Missions or edit DNA records. |
| **Viewer / Analyst** | Read-only access to dashboards, Asset Library search, analytics. No production or approval actions. |
| **System (service accounts)** | Non-human actor identities for automated workers (Mission Dispatcher, Higgsfield Poller, Drive Sync, QC Engine) — logged distinctly from human actions in the audit trail. |

## 7. User Permissions

Following MK Connect's proven `<resource>.<action>` convention (`constants/rbac.ts` pattern, see Master Planning `01-research-mkconnect.md` §5), additive per role via a `role_permissions` table (not hardcoded), enforced twice: server-action-level check + database RLS.

| Permission key | Super Admin | Production Manager | Creative Director | QC Reviewer | Viewer |
|---|---|---|---|---|---|
| `mission.create` | ✅ | ✅ | – | – | – |
| `mission.view_all` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `mission.cancel` | ✅ | ✅ | – | – | – |
| `mission.retry` | ✅ | ✅ | – | – | – |
| `dna.create` | ✅ | – | ✅ | – | – |
| `dna.approve_version` | ✅ | – | ✅ | – | – |
| `dna.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `prompt_template.edit` | ✅ | – | ✅ | – | – |
| `prompt_template.promote` | ✅ | – | ✅ | – | – |
| `qc.review` | ✅ | – | – | ✅ | – |
| `qc.override_lock_failure` | ✅ | – | ✅ | – | – |
| `asset.view_approved` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `asset.view_rejected` | ✅ | ✅ | ✅ | ✅ | – |
| `asset.archive` | ✅ | ✅ | – | – | – |
| `integration.manage` | ✅ | – | – | – | – |
| `user.manage` | ✅ | – | – | – | – |
| `analytics.view` | ✅ | ✅ | ✅ | ✅ | ✅ |

`qc.override_lock_failure` is deliberately restricted to Super Admin and Creative Director only — it is the single most consequential permission in the system since it bypasses the Product/Character Lock hard gate (see `13-product-lock.md`, `14-character-lock.md`). Every use of it is logged with mandatory justification text (see `20-logging-notification-error-retry.md`).
