# FSD §8–10: Dashboard Overview, Navigation Structure, Complete User Journey

## 8. Dashboard Overview

The Dashboard is the landing page after login. It answers, at a glance: what's producing right now, what needs my attention, and is anything broken.

### Page: Main Dashboard (`/dashboard`)

- **Purpose**: Single-screen operational overview of the entire factory.
- **Business Goal**: Let a Production Manager or Super Admin detect production bottlenecks or quality problems within seconds of logging in, without navigating elsewhere.
- **UI Layout**: 4-zone grid — (1) top KPI strip, (2) Mission Progress panel (left, 60% width), (3) Render Queue + Alerts panel (right, 40% width), (4) bottom row: Storage Usage + Quality Analytics charts.
- **Components**:
  - KPI Strip: `Active Missions`, `Assets Generated Today`, `Pending Review`, `QC Pass Rate (7d)`, `Google Drive Usage %`.
  - Mission Progress panel: list of active missions with progress bar (`X of Y assets complete`), status chip (`queued`/`running`/`paused`/`completed`/`failed`), quick-link to Mission Detail.
  - Render Queue panel: current queue depth, jobs `queued`/`running`/`retrying`/`dead_letter`, oldest-job age.
  - Alerts panel: system health flags (Higgsfield API degraded, Drive quota >85%, dead-letter jobs pending, DNA awaiting approval).
  - Storage Usage chart: donut chart, used vs. quota, breakdown by company/project.
  - Quality Analytics chart: line chart, QC pass rate over last 30 days, split by dimension (Product Fidelity / Character Fidelity / Technical / Brand Compliance).
- **Buttons**:
  - `Buat Mission Baru` (primary, top-right) → navigates to Mission Composer (`/missions/new`). No validation at this point (navigation only). Logs a `navigation` event only, no DB change.
  - `Lihat Semua Mission` → navigates to Mission List (`/missions`).
  - Alert row action `Selesaikan` (e.g., on dead-letter alert) → navigates to the relevant queue/detail filtered to the failing items. No direct mutation from the dashboard itself.
- **Input Fields**: Date-range selector for the Quality Analytics chart (default: last 30 days); Company/Project filter for Storage Usage chart (default: all).
- **Validation Rules**: Date range must not exceed 365 days (performance guard on aggregation query).
- **System Actions**: On load, dashboard queries pre-aggregated summary tables (not live Drive traversal or live Higgsfield polling — see NFR-6) refreshed by a background aggregator job every 5 minutes.
- **Error States**: If aggregation data is stale (>15 min old), show a subtle "data as of HH:MM" badge rather than blocking the page. If a panel's query fails, that panel shows an inline retry button; the rest of the dashboard still renders.
- **Success States**: All panels populated; KPI strip shows live numbers with trend arrows vs. previous period.
- **Permissions**: Visible to all roles (`analytics.view`); content scope (which missions/companies shown) may be filtered by role in a future multi-tenant expansion, not required for v1 since this is single-company internal use.
- **API Requirements**: `GET /api/dashboard/summary`, `GET /api/dashboard/quality-trend`, `GET /api/dashboard/storage-usage`.
- **Database Tables**: reads from `mission_summary_mv` (materialized/aggregated view), `qc_reports`, `storage_usage_snapshots`.
- **Future Expansion**: per-user customizable widget layout; drill-down click-through from chart points to underlying asset list.

## 9. Navigation Structure

```
Sidebar (persistent, collapsible)
├── Dashboard
├── Missions
│   ├── All Missions
│   ├── New Mission
│   └── Mission Templates
├── Asset Library
│   ├── Browse / Search
│   ├── Pending Review
│   └── Rejected / Archive
├── Identity (DNA)
│   ├── Brand DNA
│   ├── Product DNA
│   └── Character DNA
├── Prompt Engine
│   ├── Template Library
│   └── Prompt History
├── Quality Control
│   ├── Review Console
│   └── QC Analytics
├── Render Queue
│   └── Job Monitor (queued/running/retry/dead-letter)
├── Google Drive
│   └── Storage & Sync Status
├── Notifications (bell icon, top bar)
├── Settings (Super Admin only)
│   ├── Integrations (Higgsfield, Google Drive)
│   ├── Users & Roles
│   └── System Logs
└── Profile / Logout (top-right)
```

Top bar (persistent across all pages): global search (assets + missions), notification bell with unread badge, user menu.

Navigation visibility is permission-gated: `Settings` hidden entirely unless `integration.manage` or `user.manage`; `Identity (DNA)` create/edit actions hidden unless `dna.create`, but the section itself remains visible read-only to all roles (`dna.view` is granted broadly per §7).

## 10. Complete User Journey

### Journey A — Production Manager launches a new Mission

1. Login → lands on Dashboard.
2. Clicks `Buat Mission Baru` → Mission Composer.
3. Selects subject type (Product / Character / Scene), selects the relevant approved DNA record(s) from a searchable dropdown (only `approved`-status DNA versions selectable — draft/unapproved DNA cannot be missioned against).
4. Sets target quantity, target platform(s), priority, selects a Prompt Template (or leaves default recommended template).
5. Reviews an auto-generated prompt preview (assembled by Prompt Engine from selected DNA + template — read-only preview, not manually editable in v1 to preserve template governance; manual override is a Creative Director-only escalation, see `12-prompt-engine.md`).
6. Clicks `Luncurkan Mission` → validation runs (see `05-production-mission-generation.md` for full Mission Composer button spec) → Mission created with status `queued`, jobs enqueued.
7. Redirected to Mission Detail page, sees live progress as jobs move `queued → running → completed`.
8. Receives in-app notification when Mission reaches 100% job completion (not necessarily 100% approval — QC still pending on newer completions).
9. Notification when assets are flagged for review → navigates to Review Console.
10. Approves/rejects flagged assets.
11. Mission Detail shows final tally: `X approved`, `Y rejected`, `Z pending`.

### Journey B — Creative Director onboards a new Product DNA

1. Login → navigates to Identity (DNA) → Product DNA → `Tambah Produk Baru`.
2. Fills product intake form (name, SKU, brand, color/typography/logo lock fields) and uploads canonical high-resolution reference photos.
3. Clicks `Generate Turnaround Sheet` → system submits a Higgsfield job to produce a multi-angle studio reference set from the uploaded photos.
4. Reviews generated turnaround sheet in a side-by-side comparison view against uploaded originals.
5. Either `Setujui sebagai DNA v1` (locks the record, status → `approved`, becomes selectable in Mission Composer) or `Tolak & Regenerasi` (requests a new turnaround attempt, previous attempt retained as an audit artifact, not deleted).
6. Once approved, the DNA record is immutable except via a new version (`Buat Versi Baru`), never edited in place.

### Journey C — QC Reviewer processes the review queue

1. Login → notification bell shows pending review count → navigates to Review Console.
2. Sees a queue of flagged assets, each with thumbnail, QC score breakdown per dimension, and the specific flag reason(s).
3. Opens an asset → full-size preview, side-by-side with canonical DNA reference image(s), prompt/provenance detail expandable.
4. Clicks `Setujui` (asset → `approved`, moves to Google Drive `/approved` folder, becomes searchable) or `Tolak` (mandatory reason selection from a controlled category list + optional free-text note; asset → `rejected`, moves to `/rejected` folder, retained for audit — never deleted).
5. Queue auto-advances to next flagged asset (keyboard shortcuts supported for high-throughput review: `A` approve, `R` reject).

### Journey D — Super Admin investigates a stuck Mission

1. Notified of a dead-letter alert on Dashboard.
2. Navigates to Render Queue → Job Monitor, filters by `dead_letter` status.
3. Opens a failed job → sees full error log, retry history (attempt count, timestamps, error messages per attempt).
4. Diagnoses (e.g., Higgsfield API quota exceeded) → either `Retry Manual` (re-enqueues with fresh attempt counter) or `Batalkan Job` (marks permanently cancelled, removed from active queue but retained in history).
5. If root cause is systemic (e.g., API key expired), navigates to Settings → Integrations to fix, then bulk-retries all dead-letter jobs from that cause via `Retry Semua yang Gagal karena Alasan Ini`.
