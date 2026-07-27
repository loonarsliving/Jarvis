# FSD §33–40: Folder Organization, Drive Hierarchy, Naming, Metadata/Tagging Standard, Asset Lifecycle, Archive, Future Scalability

## 33. Folder Organization Workflow

Folder resolution is fully automatic — no user ever manually creates a Drive folder. Given a Generation Job's context (company, project, campaign, asset status), the Ingestion service computes the target path and calls Drive's idempotent "get-or-create" folder logic (check for existing child folder by exact name before creating — same pattern already proven in MK Connect's `ensureChildFolder`, Master Planning `01-research-mkconnect.md` §5). Folder creation is logged (`drive.folder_created`) the first time a new company/project/campaign combination appears; subsequent assets in the same combination reuse the folder silently.

## 34. Google Drive Folder Hierarchy

Directly implements Master Planning `06-storage-architecture.md` §2, unchanged, now as the binding v1 specification:

```
/AI Asset Factory
  /_DNA
    /products/{product-slug}/v{n}/
    /characters/{character-slug}/v{n}/
    /brands/{brand-slug}/v{n}/
  /{company}
    /{project}
      /{campaign}
        /raw
        /approved
        /rejected
        /archive
  /_templates
```

Note: `/archive` is added here as a sibling to `/approved`/`/rejected` at the campaign level (not specified at that granularity in Master Planning) to keep archived assets scoped to their originating campaign rather than pooled globally — see §39.

## 35. Asset Naming Convention

Binding specification (implements Master Planning `06-storage-architecture.md` §3):

```
{company}_{project}_{campaign}_{assetType}_{shortDescriptor}_v{version}_{status}.{ext}
```

- `company`, `project`, `campaign`: lowercase, hyphenated slugs, no spaces.
- `assetType`: controlled vocabulary — `hero`, `lifestyle`, `ugc`, `turnaround`, `social`.
- `shortDescriptor`: derived automatically from the Product/Character DNA slug + a short scene tag (e.g., `productA-bathroom`), never freely typed by a user at upload time (uploads are always system-generated, not manual).
- `version`: integer, increments only when an asset is a deliberate revision of a prior one (`supersedes` chain), not incremented for unrelated new generations.
- `status`: reflects folder placement redundantly in the filename itself (`raw`/`approved`/`rejected`/`archived`) so a file remains self-describing even if viewed outside the folder structure (e.g., shared as a direct link).

Enforced entirely by the Ingestion service at upload time — there is no UI path that allows a human to name a file manually, eliminating naming-convention drift by construction.

## 36. Metadata Standard

Binding field-level specification (implements Master Planning `06-storage-architecture.md` §4):

| Field | Type | Written when | Mutable? |
|---|---|---|---|
| `asset_id` | UUID | creation | no |
| `asset_type`, `company`, `project`, `campaign`, `platform` | string (controlled where noted) | creation | no |
| `status` | enum | creation, updated on lifecycle transitions | yes (status transitions only) |
| `product_dna_ref` / `character_dna_ref` + version | reference | creation | no |
| `prompt_template_id` + version | reference | creation | no |
| `prompt_final` | text | creation | no (append-only record, never edited) |
| `higgsfield_job_id`, `generation_model` | string | creation | no |
| `seed` (if applicable) | string | creation | no |
| `qc_report` | object | after QC evaluation | append-only (new report supersedes, old retained) |
| `reviewed_by`, `reviewed_at`, `review_decision`, `review_reason` | fields | at human review, if applicable | no (one review is final per version; a re-review after appeal creates a new `reviews` row, not an edit) |
| `tags[]` | array of controlled-vocabulary strings | creation + editable post-hoc for search improvement | yes |
| `created_at` | timestamp | creation | no |
| `supersedes` / `superseded_by` | reference | on revision | set once |

Stored both as a database row (`asset_metadata`, primary query surface) and a `.json` sidecar in Drive next to the asset (portability guarantee per Master Planning §16).

## 37. Tagging Standard

Implements Master Planning `06-storage-architecture.md` §5 as a binding rule: tags are drawn from a **maintained controlled vocabulary table** (`tag_vocabulary`), not free text, to prevent fragmentation (`"kamar mandi"` vs `"bathroom"` vs `"toilet"` splitting search results into disconnected buckets).

### Page: Tag Vocabulary Management (`/settings/tags`, Super Admin/Creative Director)
- **Purpose**: Govern the controlled tag list per dimension (mood, shot_type, platform, content_type, scene_category).
- **Buttons**: `Tambah Tag`, `Gabungkan Tag` (merge two tags that turned out to mean the same thing — re-tags all affected assets, logged as a bulk operation), `Nonaktifkan Tag` (soft-disable, doesn't retroactively strip it from existing assets, just hides it from future selection).
- **System Actions**: a scheduled job periodically surfaces "failed search" queries (searches returning near-zero results) as vocabulary-gap candidates for Creative Director review — directly implements the DAM best practice noted in Master Planning `02-research-market.md` §1 (review failed-search logs to catch metadata gaps).

## 38. Asset Lifecycle

```
pending_upload -> uploaded (in /raw) -> qc_evaluated -> {approved | needs_review | blocked}
   needs_review/blocked -> (human decision) -> {approved | rejected}
approved -> [searchable, consumable] -> (optionally) archived
rejected -> [retained for audit, not searchable by default] -> (optionally) archived
approved -> superseded (when a revised version is approved) -> original retained, flagged non-primary
```

No status is ever a dead end that deletes data — every terminal state (`approved`, `rejected`, `archived`, `superseded`) retains the asset and its full metadata permanently (NFR-7). "Deletion" as a user-facing concept does not exist in v1; only status transitions.

## 39. Archive Workflow

- **Trigger**: manual (`Arsipkan` button, §17) or automatic (scheduled policy — e.g., `rejected` assets older than a configurable retention window auto-archive to reduce active-index size without losing the data; policy is configurable, default off in v1 per the conservative-rollout recommendation in Master Planning `08-roadmap-risks.md` §3).
- **Effect**: Drive file moved to the campaign's `/archive` subfolder; database `status='archived'`; excluded from default Asset Library search results (still reachable via an explicit "include archived" filter, §17) and excluded from QC Analytics trend calculations (keeps analytics reflective of active production quality, not historical noise).
- **Reversal**: `Batalkan Arsip` restores prior status and folder location — archiving is not a one-way action.

## 40. Future Scalability

Documented as explicit forward-compatibility notes, not v1 requirements:

- **Multi-provider generation**: the Higgsfield Integration Layer's internal contract (§14.6) is designed so a second provider could be added without touching Mission/QC/Storage logic.
- **Multi-character scenes**: Character DNA and Prompt Engine reference-binding structure already supports multiple `character_ref` bindings per job at the data-model level; Mission Composer UI restricting v1 to single-primary-character is a UI-scope decision, not an architectural ceiling (§32).
- **Multi-tenant / multi-company expansion**: RBAC and folder hierarchy are already company-scoped (§6/§34), so extending to serve sibling businesses under the Holding structure MK Connect already models (Master Planning `01-research-mkconnect.md` §2, FRIDAY Holding Architecture) would primarily be a permissions-scoping exercise, not a data-model rewrite.
- **Horizontal worker scaling**: Scheduler's atomic-claim design (§24) already supports multiple concurrent worker instances; scaling is an infrastructure/deployment change, not a code change.
- **API for MK Connect integration**: deferred per Master Planning `08-roadmap-risks.md` §1 Fase 5 — only built once MK Connect's Publishing/Analytics stages are mature enough to be a real consumer; the shared Google Drive structure (§34) is deliberately sufficient as the integration point until then.
- **Automated prompt-template rewriting**: the closed feedback loop currently surfaces performance signals to a human (Creative Director, §27); a fully automated optimizer (per Master Planning `04-prompt-engine.md` §5's described pattern) is a defined future capability, intentionally not built until enough production QC data exists to validate it safely.
