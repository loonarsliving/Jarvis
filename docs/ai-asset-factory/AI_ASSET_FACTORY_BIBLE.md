# The AI Asset Factory Bible

Status: **Condensed single-source-of-truth quick reference.** Every fact below is derived from, and traceable to, Master Planning / FSD / TDD / Engineering Constitution — this document adds nothing new, it exists so an engineer (or agent) doesn't have to re-read 27 files to answer "wait, what did we decide about X?" When in doubt, the linked source document wins over this summary.

## What This Is

AI Asset Factory is PT Maha Karya Haluoleo's internal system that produces premium, brand-consistent visual assets at scale using Higgsfield, storing everything in Google Drive, for MK Connect Content AI to eventually consume. It is not MK Connect. It never touches MK Connect's code or database. → `00-overview.md`

## The One-Sentence Rule for Every Decision

*Does this keep a product/character visually identical across thousands of assets, and does it leave a permanent, honest record of how every asset was made?* If a design choice doesn't serve one of those two goals, question it.

## Non-Negotiables (memorize these)

1. Never touch `mkhsistem`. → `00-overview.md` §2
2. Database is the index, Google Drive is the store. Metadata is never Drive-only. → `tdd/02-...` §8, §17
3. Higgsfield sits behind a provider interface. Never hardcoded outside that module. → `fsd/02-...` §14.6, `tdd/02-...` §9.1
4. Product Lock / Character Lock failures are a hard gate. No silent auto-approve. → `fsd/03-...` §19
5. No hard deletes on business data — status transitions only. → `tdd/01-database-architecture.md` §7.5
6. No silent failure — every job ends `completed`/`failed`/`dead_letter`, always visible. → `fsd/04-...` §22

## Stack Cheat Sheet

| What | Choice |
|---|---|
| Runtime | Node.js 22 LTS, TypeScript strict |
| Web | Next.js 15 App Router |
| DB | Postgres via self-hosted Supabase (Docker) |
| Queue | Postgres-native, `SKIP LOCKED`, no broker |
| Storage | Google Drive (assets), Postgres (metadata) |
| Generation | Higgsfield (Soul ID, Cinema Studio, Hero Frame) |
| Deployment | Docker Compose, single Mini PC, Caddy proxy |
→ `tdd/00-system-service-module-architecture.md`

## The Five Services

`web` (Next.js UI/API) · `mission-dispatcher` · `higgsfield-poller` · `drive-sync-worker` · `qc-worker` — all stateless, all coordinate only through Postgres. → `tdd/00-...` §2

## The Pipeline (memorize this shape)

```
Mission -> Prompt Engine -> Higgsfield -> Ingestion (/raw) -> QC Engine -> {approved | needs_review | blocked}
                                                                    -> Review Console (human) -> approved/rejected
                                                                    -> Google Drive /approved (searchable)
```
→ `fsd/02-...` §11

## The Seven DNA Modules of a Prompt (fixed order)

Consistency Header → Brand DNA → Product/Character DNA → Scene DNA → Camera DNA → Lighting DNA → Motion DNA → Negative Prompt. → `fsd/05-...` §26, `tdd/04-...` §13

## Product Lock, Five Layers

1. Structural (canonical reference + restated descriptors) → 2. Multi-reference selection (scene-appropriate angle) → 3. Empirical validation (logo/color/similarity scoring) → 4. Decision gate (hard block below threshold) → 5. Feedback (scores feed template performance). → `tdd/04-...` §14

## Character Lock, Five Layers

1. Structural (Higgsfield Soul ID reuse) → 2. Controlled variation (expression/pose deliberately varied, outfit/age locked) → 3. Empirical validation (face-embedding similarity) → 4. Decision gate (face similarity is the hard blocker; attribute mismatches route to review) → 5. Feedback. → `tdd/04-...` §15

## The Six Queues

Mission · Render · Upload · QC · Retry (a status, not a table) · Archive — all claimed via the same `SKIP LOCKED` pattern. → `tdd/03-...` §10

## Retry Policy (the one true policy, used everywhere)

4 attempts max, exponential backoff 20s→40s→80s→160s, ±10% jitter. Content-policy/permission/validation errors never retry — they fail fast. → `tdd/06-...` §25

## Roles & the One Scary Permission

Super Admin, Production Manager, Creative Director, QC Reviewer, Viewer. `qc.override_lock_failure` bypasses Product/Character Lock — Super Admin + Creative Director only, mandatory justification, always notifies every Super Admin. → `fsd/00-...` §6–7

## The Seven Agents & What They Own

1. Foundation (scaffold, auth, Docker, config, permissions — no business logic)
2. Mission Engine (+ shared `queue` primitive)
3. AI Intelligence (DNA models, Prompt Engine)
4. Render Provider Framework (Higgsfield + future providers, generation-time reference selection)
5. Asset Library (Google Drive, metadata, search index plumbing)
6. Quality Intelligence (QC scoring, Product/Character Lock validation)
7. Dashboard & Analytics (read-only)
→ `ENGINEERING_CONSTITUTION.md` Article VIII (binding ownership map)

## Folder/Naming/Metadata in One Line Each

- Drive: `/AI Asset Factory/_DNA/...` and `/{company}/{project}/{campaign}/{raw|approved|rejected|archive}`. → `fsd/06-...` §34
- Filename: `{company}_{project}_{campaign}_{assetType}_{shortDescriptor}_v{version}_{status}.ext`. → `fsd/06-...` §35
- Metadata: full provenance (prompt, DNA versions, job ID, QC report) written at creation, immutable except lifecycle fields. → `fsd/06-...` §36

## When Something Isn't Covered Here

Check, in order: the relevant FSD workflow section → the relevant TDD engine section → the Engineering Constitution (Article VI: escalation protocol) → ask, don't assume.
