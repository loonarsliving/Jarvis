# @aaf/ui

Shared component library, consumed only by `apps/web` (TDD §6). Radix UI
primitives, styled with Tailwind utility classes, following the atomic-ish
layering described in `docs/ai-asset-factory/tdd/00-system-service-module-architecture.md`
§6:

- **Primitives** (this Sprint): `Button`, `Input`, `Card`, `Badge`.
- **Composed** components (`MissionProgressCard`, `QCScoreBreakdown`, etc.)
  are owned by the agents whose features they belong to — not scaffolded
  here, to avoid Agent 1 building business-shaped UI ahead of the business
  logic that drives it.

Consumers import from `@aaf/ui` (e.g. `import { Button } from "@aaf/ui"`).
Tailwind's own config lives in `apps/web` (the only Tailwind consumer); this
package assumes Tailwind's utility classes are available at build time via
`apps/web`'s `content` glob including `packages/ui/src/**/*.{ts,tsx}`.
