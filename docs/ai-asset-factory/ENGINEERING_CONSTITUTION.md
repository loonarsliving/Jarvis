# AI Asset Factory — Engineering Constitution

Status: **Binding.** Every engineer (human or agent) writing code for AI Asset Factory follows this document without exception. Derived from, and subordinate to, the approved Master Planning, FSD, and TDD (`docs/ai-asset-factory/00-overview.md` through `docs/ai-asset-factory/tdd/`). Where this document and those disagree, the FSD/TDD wins and this document is corrected — this is a discipline document, not a source of new requirements.

## Article I — Source of Truth Hierarchy

1. Master Planning (`00-overview.md`–`08-roadmap-risks.md`) — why the system exists, what it must never become.
2. FSD (`fsd/`) — what the system does, page by page, workflow by workflow.
3. TDD (`tdd/`) — how the system is built, technically.
4. This Constitution — how engineers behave while building it.
5. The AI Asset Factory Bible (`AI_ASSET_FACTORY_BIBLE.md`) — the condensed, single-page-per-topic quick reference derived from all of the above, for day-to-day lookup.

No agent may invent a requirement not traceable to tiers 1–3. If a requirement seems missing, **stop and ask** — do not infer silently (Article VI).

## Article II — Non-Negotiable Boundaries

1. **AI Asset Factory never modifies MK Connect (`mkhsistem`).** No exceptions, no "just this once." The only integration surface is the shared Google Drive structure (Master Planning `00-overview.md` §2).
2. **Database is the index; Google Drive is the store.** Every uploaded asset produces a database row before it produces a usable Drive artifact for search/approval purposes (TDD §8, §17). Metadata is never Drive-only.
3. **Higgsfield is a provider behind an interface, never a hardcoded dependency.** Any module that needs generation calls the Render Provider interface (TDD §9, this session's Agent 4 scope) — never `import { Higgsfield } from ...` outside that provider module itself.
4. **Product Lock and Character Lock are hard gates.** No code path may auto-approve an asset that fails identity-lock validation. The only bypass is the explicitly-permissioned, mandatorily-justified, loudly-logged human override (FSD §18, §28, §29).
5. **No hard deletes on business data.** `assets`, `product_dna_versions`, `character_dna_versions`, `missions`, `generation_jobs` — status transitions only, ever (TDD §7.5).

## Article III — Architectural Discipline

1. **SOLID, always.** Single Responsibility per module (TDD §3's module boundaries are binding, not suggestions); Open/Closed via the provider-interface pattern (render providers, notification channels, embedding/similarity scorers); dependency direction flows inward toward `@aaf/core`, never the reverse.
2. **No monolith.** Five services (`web` + 4 workers) as specified in TDD §2 — business logic lives in `@aaf/core`, never duplicated into a service-specific copy.
3. **No duplicate logic.** If two agents need the same capability (e.g., both need DNA version resolution), it is written once in the owning module (`identity`) and imported — never reimplemented. When in doubt about ownership, check the Module Ownership Map (Article VIII) before writing.
4. **Interfaces over coupling.** Cross-module dependencies are declared as TypeScript interfaces in the depended-upon module's public `index.ts`, never as a direct reach into another module's internal files. A lint rule enforcing import boundaries (TDD §3) is treated as a build-breaking violation, not a warning.
5. **No hardcoding.** Configuration, thresholds, and provider selection come from `packages/core/config` (TDD §31) — never inline magic numbers/strings for anything that could plausibly change (QC thresholds, retry counts, provider name).
6. **Provenance and audit are not optional additions.** Every state-changing action logs through the Logging Engine (TDD §23) in the same transaction as the business write. A PR that adds a new mutation without a corresponding audit log call is incomplete, not "logging to be added later."

## Article IV — Code Quality Bar

1. TypeScript strict mode, no `any` except at a documented, narrow external-API boundary (and even then, validated with Zod immediately on entry).
2. Every Server Action and API route validates input with Zod before touching business logic (TDD §26.4).
3. Every module's public functions are unit-testable without a live database or live external API — dependencies are injected, not imported as singletons, wherever feasible (TDD's pluggable-interface pattern for similarity scorers, embedding models, render providers is the template for this).
4. No commit reaches `main`/the working branch without: the relevant engine's Failure Cases (from its TDD spec) having at least one corresponding test; a passing typecheck; a passing lint.
5. Comments explain **why**, never **what** — matching the project's general code style convention already established for this engagement.

## Article V — Module Ownership & Agent Boundaries

Each of the seven agents owns an exclusive set of `@aaf/core` modules and/or `/apps` services, per the Module Ownership Map (Article VIII). An agent:
- **May** read any module's public interface.
- **May not** write to a file inside another agent's owned module without that owning agent's interface contract being the only thing changed.
- **Must** express a needed capability from another agent's module as an interface request, not a direct implementation reach-in — if the interface doesn't exist yet, that is escalated (Article VI), not worked around.

## Article VI — Escalation Protocol

Any agent that encounters one of the following **stops and reports** rather than proceeding on assumption:
1. A requirement in its Sprint scope that isn't traceable to Master Planning/FSD/TDD.
2. A needed interface from another agent's module that doesn't exist yet.
3. A conflict between two source documents.
4. Any temptation to touch `mkhsistem`, hardcode Higgsfield outside the provider module, hard-delete business data, or bypass a Product/Character Lock gate.

Escalation format: state the issue, propose the best enterprise-standard resolution, wait for approval before deviating from the architecture as specified.

## Article VII — Definition of Done (per Sprint, per FSD/TDD deliverable requirement)

A Sprint is not done until it has:
1. Architecture note (how this Sprint's code maps to its TDD module spec).
2. Folder structure conforming to TDD §4/§5.
3. Database changes as versioned migrations (TDD §7.7), never ad hoc.
4. Components/Services/API implemented per the FSD page spec and TDD engine spec it fulfills.
5. Tests covering the engine's documented Failure Cases at minimum.
6. Error handling and Recovery Strategy implemented exactly as specified in the owning engine's TDD section — not a simplified version "for now."
7. Documentation: a short README in the module/service folder pointing back to its FSD/TDD sections (not duplicating their content).
8. No violation of Article II found on self-review before requesting the cross-agent engineering review (Article IX).

## Article VIII — Module Ownership Map

| Agent | Owns (`/apps`) | Owns (`packages/core`) | Never touches |
|---|---|---|---|
| 1 — Foundation & Core Architecture | `apps/web` (scaffold, layout, nav, auth pages, settings shell) | `config`, `audit` (logging primitives), RBAC guard utility, base DB migration tooling | Any business-logic module (2–7's modules) |
| 2 — Mission Engine | `apps/worker-mission-dispatcher` | `mission`, `queue` (shared primitive, see note) | `prompt-engine`, `product-lock`, `character-lock`, `drive`, `higgsfield`, `qc` internals |
| 3 — AI Intelligence | (none — library only) | `identity` (Brand/Product/Character DNA), `prompt-engine` | `queue`, `drive`, `higgsfield` client, `qc` scoring internals |
| 4 — Render Provider Framework | `apps/worker-higgsfield-poller` | `higgsfield` (and the general `render-provider` interface + provider registry) | `identity`, `prompt-engine` internals (consumes their output only), `drive` |
| 5 — Asset Library | `apps/worker-drive-sync` | `drive`, asset/metadata tables' repository functions | `higgsfield`, `identity` internals, `qc` scoring |
| 6 — Quality Intelligence | `apps/worker-qc` | `qc`, `product-lock`, `character-lock` (validation side; generation-time selection logic is owned jointly with Agent 3/4 via interface, see below) | `drive` upload mechanics, `mission` state machine |
| 7 — Dashboard & Analytics | `apps/web` (dashboard/analytics pages and routes only — a scoped subfolder within Agent 1's app shell, coordinated, not a separate app) | analytics aggregation queries/materialized views | Any write-path business logic — this agent is read-only by design |

**Note on `queue`**: the shared job-queue primitive (`packages/core/queue`, TDD §10.4's canonical claim pattern) is owned by Agent 2 (Mission Engine, the first and heaviest consumer) but its interface is used by Agents 4, 5, 6 for their respective queues (Render, Upload, QC). Agents 4/5/6 consume `queue`'s public interface (`enqueue`/`claim`/`complete`/`fail`) and never reimplement claim logic themselves — this is the canonical example of Article III.4 (interfaces over coupling) in practice.

**Note on Product/Character Lock split**: Agent 4 (Render Provider Framework) owns *generation-time* reference selection (which canonical image/Soul ID to send to Higgsfield, TDD §14/§15 generation-time layers), sourced by calling Agent 3's `identity` module's public interface. Agent 6 owns *post-generation validation* (the empirical scoring layers). This split is intentional and matches the TDD's own layered architecture (TDD §14/§15) — Agent 4 and Agent 6 must not duplicate each other's half.

## Article IX — Post-Implementation Engineering Review

After all seven Sprints report Definition-of-Done, a full review is performed (this is not optional, per the master prompt) covering: code review across all modules, architecture conformance to TDD, dependency graph conformance to Article VIII, scalability against TDD §35, performance against TDD §34, maintainability against Article IV, security against TDD §26–29, and specifically Google Drive integration, Higgsfield integration, Prompt Engine, Product Lock, and Character Lock as named highest-priority review targets. Refactor before considering development complete — a passing individual Sprint is not, by itself, sufficient sign-off.
