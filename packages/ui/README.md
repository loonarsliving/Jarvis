# @aaf/ui

Shared component library, consumed only by `apps/web` (TDD §6). Radix UI
primitives, styled with Tailwind utility classes, following the atomic-ish
layering described in `docs/ai-asset-factory/tdd/00-system-service-module-architecture.md`
§6:

- **Primitives** (Agent 1's Sprint): `Button`, `Input`, `Card`, `Badge`.
- **Chart primitives** (Agent 7's Sprint, `components/charts.tsx`):
  `DonutChart`, `TrendLineChart`, `CategoryBarChart` — generic, data-shape-
  only wrappers over `recharts` (see `charts.tsx`'s header comment /
  `DECISIONS-agent7.md` item 3 for the library choice), used by the Main
  Dashboard, QC Analytics, and Google Drive Storage pages (FSD §8/§07).
- **Composed** components (`MissionProgressCard`, `QCScoreBreakdown`, etc.)
  are owned by the agents whose features they belong to — not scaffolded
  here, to avoid Agent 1 building business-shaped UI ahead of the business
  logic that drives it.

Consumers import from `@aaf/ui` (e.g. `import { Button } from "@aaf/ui"`).
Tailwind's own config lives in `apps/web` (the only Tailwind consumer); this
package assumes Tailwind's utility classes are available at build time via
`apps/web`'s `content` glob including `packages/ui/src/**/*.{ts,tsx}`.
