# Agent 7 (Dashboard & Analytics) — Decisions Where the Spec Was Ambiguous

Per Engineering Constitution Article VI, these are documented for
cross-agent review rather than silently assumed. Mirrors the format of the
root `DECISIONS.md` (Agent 1's own decisions log).

1. **Migration numbering: Agent 7 claims the `0700`-`0799` block.**
   `infra/supabase/migrations/README.md` says new migrations "start at
   `0006` and up" and to "coordinate numbering with the other agents'
   Sprints before adding a new migration file so two agents never claim the
   same number" — but Agents 2-6 are running in parallel worktrees with no
   live coordination channel available in this pass. Rather than guessing
   the next free single-digit number and risking a collision at merge time,
   Agent 7's two migrations (`0700_mission_summary_mv.sql`,
   `0701_notifications.sql`) claim a dedicated hundred-block. Whoever
   integrates all seven branches renumbers into one final sequential order
   — the block choice only exists to avoid a same-number collision before
   that integration pass, not to be the final numbering.

2. **`analytics` as its own `@aaf/core` subpath, not listed in TDD §3's
   module table.** Same situation Agent 1 already documented for `rbac`
   and `result` (root `DECISIONS.md` items 2-3): TDD §22 clearly assigns
   Agent 7 the Analytics Engine's responsibilities (own `mission_summary_mv`
   refresh, compute QC trend/failure-category/template-performance
   aggregates) but TDD §3's module list doesn't name an `analytics`
   package. Rather than bolting this onto an unrelated module, added
   `packages/core/src/analytics/` — mirrors the exact reasoning Agent 1
   used, extending the same precedent instead of inventing a new one.

3. **Charting library: Recharts, added to `packages/ui`.** FSD §8/§07
   specify chart *shapes* (donut, line, bar) but not a library. Chose
   Recharts: lightweight, SVG-native (no canvas/WebGL dependency this
   Mini-PC-class deployment doesn't need per the Bible's "no unnecessary
   infrastructure" principle), composes cleanly with the Tailwind-styled
   Radix-adjacent primitives Agent 1 already set up (`packages/ui`'s own
   README describes exactly this ecosystem), and is the most common choice
   in that ecosystem. Added as generic, data-shape-only primitives
   (`DonutChart`, `TrendLineChart`, `CategoryBarChart` in
   `packages/ui/src/components/charts.tsx`) rather than business-specific
   components, per `packages/ui/README.md`'s own stated layering
   ("Composed components ... owned by the agents whose features they
   belong to").

4. **`notifications` table writes are in-scope despite this agent being
   "read-only by design" (Constitution Article VIII).** The read-only
   constraint's clear intent (Article VIII's table: "Never touches ... Any
   write-path business logic") is about *other* agents' domain state
   (missions, assets, qc_reports, DNA records) — not about a table this
   agent itself owns and whose migration this agent itself defines
   (`notifications`, explicitly reserved for Agent 7 in
   `infra/supabase/migrations/README.md`). Implemented two writes, both
   scoped to `notifications` only:
   - `markNotificationRead` (`packages/core/src/notifications/repository.ts`)
     — a user acknowledging their own notification; RLS-scoped to
     `recipient_id = auth.uid()`, no business-state side effect.
   - `createNotification` / `buildCriticalEventNotificationHandler` —
     system-originated (service-role only, no authenticated-client INSERT
     policy), wired as the `CriticalEventHandler` extension point
     `@aaf/core/audit`'s `logAction()` already documents
     (`packages/core/src/audit/index.ts`'s `onCriticalEvent` TODO,
     explicitly annotated "TODO(Agent 7 / notifications module)").
   Every other table this agent touches (`missions`, `generation_jobs`,
   `assets`, `qc_reports`, `product_dna_versions`,
   `character_dna_versions`, `storage_usage_snapshots`) is read-only —
   `SELECT` only, no repository function issues an INSERT/UPDATE/DELETE
   against them.

5. **`/drive` (Google Drive — Storage & Sync Status) is fully Agent 7's,
   overriding Agent 1's placeholder annotation.** Agent 1's scaffolded
   placeholder at `apps/web/app/(app)/drive/page.tsx` was labeled `owner:
   "Agent 5 (Asset Library)"`. But FSD §9's nav diagram lists "Google Drive
   -> Storage & Sync Status" as one self-contained leaf, distinct from
   Asset Library's own `/asset-library` route, and the FSD §07 wireframe
   for `/drive` is entirely storage/reconciliation content (this agent's
   explicit task scope) with no asset-browsing UI in it at all. Per
   Constitution Article I ("Where this document and [the Constitution]
   disagree, the FSD/TDD wins"), built the full `/drive` page rather than
   only adding a sub-component, since there is no Agent-5-owned content at
   this route per the binding FSD. If Agent 5 needs Drive-adjacent UI, the
   FSD's own structure suggests it belongs under `/asset-library`, not
   here — flagged for cross-agent review at integration time.

6. **`apps/web/components/nav/topbar.tsx` (Agent 1's shared layout file)
   was edited to add the notification bell.** FSD §9: "Top bar (persistent
   across all pages): global search (assets + missions), notification bell
   with unread badge, user menu." The bell + unread badge is explicitly
   this agent's task ("Notification Center UI ... bell icon in topbar per
   FSD nav"), and no other route for it exists outside the shared topbar
   component. The edit is additive and scoped (`NotificationBell`, a new
   self-contained async server component with its own failure isolation) —
   the rest of `Topbar` (user menu, logout, role badge) is untouched. Did
   **not** implement the "global search (assets + missions)" half of that
   same FSD line — that reaches into Agent 5's asset search index and
   Agent 2's mission list, both outside this agent's explicit task scope
   list; left as Agent 1's existing placeholder text
   ("Global search — owned by Agent 7") for a future Sprint.

7. **`storage_usage_snapshots` is NOT this agent's migration, despite the
   task brief's phrasing ("define this table's migration yourself ...
   storage_usage_snapshots if not already covered elsewhere").**
   `infra/supabase/migrations/README.md`'s reserved-range table explicitly
   assigns `storage_usage_snapshots` to **Agent 5** ("Asset Library
   (`drive`)"), and TDD §7.4 confirms it's "written by `drive-sync-worker`"
   (Agent 5's worker service). That README is the binding coordination
   document per Constitution Article I precedence — followed it over the
   task brief's more tentative wording. This agent only *reads* from
   `storage_usage_snapshots` (`getStorageUsageSummary`,
   `packages/core/src/analytics/repository.ts`), tagged
   `TODO(integration)` like every other cross-agent read.

## Known gaps / escalations (Constitution Article VI)

- **"Higgsfield API degraded" alert** (an FSD §8 Alerts panel example) has
  no documented source table in the binding ERD. Not implemented —
  inventing a health-status table would violate Article VI.1 ("no agent
  may invent a requirement not traceable to tiers 1-3"). Escalate to
  Agent 4 (owns the `higgsfield` module) if a real source is ever added.
- **QC Analytics "Top Templates by Score" and "DNA Versions with Repeated
  Rejections"** (FSD §07 wireframe) need live joins across tables owned by
  Agents 2/3/6 that don't exist in this isolated worktree to verify
  against. Implemented as documented empty results with a
  `TODO(integration)` (`packages/core/src/analytics/repository.ts`'s
  `getQcAnalyticsSummary`) rather than a fabricated join over guessed
  column names.
- **Storage Usage "by project" breakdown** (FSD §07 wireframe) — the
  binding ERD's `storage_usage_snapshots` only has a `company` column, not
  `project`, so this agent's charts currently report company-level totals
  labeled per the FSD wireframe's expectation of per-project granularity.
  Flagged for Agent 5 to resolve (either add a `project` column or expose
  a project-level snapshot).
- **Drive "Reconciliation Flags" panel** (FSD §07 wireframe:
  `storage_missing`/`unindexed_file` counts) has no backing table in the
  binding ERD. Rendered as an honest "not available" message rather than
  invented data — see `apps/web/features/drive/components/storage-usage-panel.tsx`.

## Base-branch fix applied at session start

This worktree was initially created from the wrong base (`origin/main`, an
unrelated legacy game/joystick repo) — a known tooling issue named in this
agent's own task brief. Fixed at the very start of this session via:

```
git fetch origin claude/repo-cleanup-assetfactory-s9jpv7
git reset --hard origin/claude/repo-cleanup-assetfactory-s9jpv7
```

Verified afterward against `git log --oneline -5` (showed "Agent 1:
Foundation & Core Architecture — complete" at HEAD) and `ls
docs/ai-asset-factory` before any other work began.
