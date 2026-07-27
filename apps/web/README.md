# @aaf/web

Next.js 15 (App Router) — Service 1 of 5 (TDD §2). Owner: Agent 1
(Foundation) for the scaffold in this Sprint — `app/(app)/dashboard` and
onward are placeholders each agent replaces with real pages per
`docs/ai-asset-factory/fsd/`.

- `app/(auth)/login` — Supabase Auth email+password login (TDD §27, no
  self-registration).
- `app/(app)/*` — permission-gated nav shell (`lib/nav/config.ts`,
  `components/nav/`) + placeholder pages for every FSD §9 route.
- `middleware.ts` — Supabase session refresh + unauthenticated redirect.
- `lib/auth/guard.ts` — `requirePermission()` wrapper every Server Action
  should call first (TDD §28 layer 1).
- `lib/auth/action.ts` — `withActionErrorHandling()`, the standard
  never-throw Server Action wrapper (TDD §29.1).
- `app/api/health` — health endpoint (TDD §37).

See `docs/ai-asset-factory/tdd/00-system-service-module-architecture.md`
§5 for the intended `/features/<feature>/{actions,components,schemas}`
layering — not populated yet since no feature has business logic in this
Sprint; the folder convention is documented here for the agent who adds the
first one.
