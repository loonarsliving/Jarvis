# Agent 4 (Render Provider Framework) — Decisions Where the Spec Was Ambiguous

Per Engineering Constitution Article VI, documented here for cross-agent
review rather than silently assumed.

## 0. Worktree base-branch mismatch (tooling issue, not a spec decision)

This worktree was initially created from `origin/main` (an unrelated
legacy game/joystick repo), not `origin/claude/repo-cleanup-assetfactory-s9jpv7`.
Fixed at the start of this Sprint via `git fetch` + `git reset --hard` onto
the correct branch before any AI Asset Factory work began — noting it here
per the task brief's instruction to document it if it had to be applied.

## 1. Higgsfield API shape (endpoints, field names, status vocabulary) is assumed, not verified

No live Higgsfield API credentials or vendored docs exist in this
environment. `packages/core/src/higgsfield/types.ts` and `client.ts`
infer: `POST /v1/generations`, `GET /v1/generations/{id}`,
`POST /v1/soul-id/train`, `GET /v1/soul-id/train/{id}` endpoints; a
`{ prompt, negative_prompt, soul_id, references[], cinema_studio, hero_frame,
asset_class, external_reference_id }` request body; a
`pending/queued/processing/succeeded/failed` job status vocabulary; and a
`content_policy_violation` boolean + `failure_reason` string on failed
generation responses. All inferred from FSD §14's terminology (Soul ID,
Cinema Studio, Hero Frame), TDD §9's client-architecture description, and
Master Planning `02-research-market.md` §1's Higgsfield competitor
research — never from real API documentation. **Every one of these must be
verified against Higgsfield's actual API docs before production use.**
Because all of this is isolated inside `higgsfield/types.ts` + `client.ts`
behind the `RenderProvider` interface (Constitution Article II.3), fixing
wrong assumptions later is a one-module change, not a system-wide one —
this was the entire point of building the interface first.

## 2. Prompt length limit and per-job-type cost estimates are placeholders

`DEFAULT_HIGGSFIELD_PROMPT_MAX_LENGTH = 4000` (`validation.ts`) and
`DEFAULT_LOCAL_COST_ESTIMATE` (`cost.ts`, 1 credit/image, 5/video, 20/Soul
ID training) are conservative placeholders, not real Higgsfield figures.
Deliberately never `0` (which would misleadingly read as "free" on the
cost-visibility dashboard, NFR-10) — flagged for whoever configures real
pricing via `packages/core/config` (never by editing these files directly,
per Constitution Article III.5's no-hardcoding rule).

## 3. Reference-selection *algorithm* ownership: `identity` (Agent 3), not this module

TDD §9.4 states verbatim: "this selection logic lives in
`packages/core/identity` ... queried by the Higgsfield client at
request-build time, not duplicated inside the Higgsfield module itself."
This appears, at first read, to be in slight tension with TDD §14/§15
(Product/Character Lock Engine sections), which describe a
"generation-time call" with the same input/output shape as if it were
part of the Lock Engine itself (nominally Agent 6's module per Article
VIII's ownership table). The Constitution's own "Note on Product/Character
Lock split" resolves this explicitly: Agent 4 owns *generation-time
reference selection*, sourced by calling Agent 3's `identity` public
interface; Agent 6 owns *post-generation validation* only. Implemented
accordingly: `higgsfield/reference-selection.ts` defines the narrow
`IdentityReferenceSelector` interface this module needs and calls it
(currently a documented `TODO(integration)` placeholder, since `identity`
is a stub this Sprint) — it does not reimplement the selection algorithm.

## 4. Submission happens in `mission-dispatcher` (Agent 2), not this poller

FSD §13 step 3 ("job submitted to Higgsfield via the Higgsfield
Integration Layer") doesn't name which service calls it. TDD §11's
Background Jobs table resolves this: "Mission Dispatcher tick ... expand
queued Missions into jobs; claim+submit queued Render Queue jobs" —
submission is Agent 2's responsibility, calling this module's
`createHiggsfieldProvider(...).submitGeneration(...)` directly as a
cross-module public-interface call. `worker-higgsfield-poller` only polls
`submitted`/`running` jobs onward (TDD §9.6, §11 "Higgsfield Status Poller
tick"). Confirmed explicitly in this Sprint's own task brief ("your poller
picks up already-submitted jobs"), documented here for the cross-agent
review since it affects how Agent 2's dispatcher must be wired.

## 5. `@aaf/core/retry` added as new shared cross-cutting infra, not exclusively Higgsfield-scoped

TDD §25 explicitly requires a single shared `withRetry()`-equivalent
utility "used by every worker ... not reimplemented per engine" but isn't
listed in TDD §3's module architecture diagram or assigned to a specific
agent's exclusive ownership in Constitution Article VIII. Agent 4 needed
it first (this Sprint's poller), so added `packages/core/src/retry/` —
mirrors Agent 1's own precedent for `rbac`/`result` (cross-cutting infra
implied by the TDD but not slotted into a named module, documented in
Agent 1's `DECISIONS.md` #2/#3). Agents 5/6 (Upload/QC workers, which also
need retry per TDD §25) should import this rather than reimplementing.
Flagged for review: should a future TDD revision fold this into `config`
or a new named module instead?

## 6. New migration `0006_higgsfield_job_tracking.sql`, two tables, without a DB-level FK to `generation_jobs`

`infra/supabase/migrations/README.md` reserves "Higgsfield job-tracking
tables (if any beyond `generation_jobs`)" for Agent 4. Added
`higgsfield_soul_id_training_jobs` (Soul ID training has its own status
vocabulary and 60s/45min poll/timeout profile, distinct from
`generation_jobs`, per TDD §11's background-jobs table listing it as a
separately-polled table) and `higgsfield_cost_ledger` (TDD §9.9 cost
tracking — ideally columns on `generation_jobs` itself, but that table is
Agent 2's and does not exist in this Sprint's isolated worktree; Article
VIII forbids writing into another agent's owned table/migration). Both
reference `generation_jobs.id` / `character_dna_versions.id` **by value
only**, not a DB foreign key, since neither table exists in this
migration's timeline (parallel agent worktrees). **Flagged for review**:
once merged, a follow-up migration should add real
`references ... on delete restrict` FK constraints per TDD §7.5, and RLS
select policies once the relevant permission keys are confirmed with
Agent 2 (see the two `TODO(integration)` comments in the migration file
itself).

## 7. `generation_jobs` column names in `generation-jobs-repo.ts` are inferred, not confirmed

Same root cause as #6 — Agent 2's table doesn't exist in this isolated
worktree yet. Column names (`higgsfield_job_id`, `submitted_at`,
`attempt_count`, `next_retry_at`, `claimed_by`, `claimed_at`, `priority`,
`payload`, `failure_reason`) are inferred from TDD §10.3's common job-row
shape plus the Higgsfield-specific fields TDD §9.5/§FSD 14.4 name
explicitly. This is the single file (`generation-jobs-repo.ts`) that needs
reconciling against Agent 2's real migration once merged — isolated
there deliberately so the blast radius of a wrong guess is one file.
