# worker-qc

**Owner: Agent 6 (Quality Intelligence).**

Stub worker service scaffolded by Agent 1 (Foundation) per Engineering
Constitution Article VIII. `src/main.ts` starts a polling loop skeleton
(entrypoint per TDD §5: "an entrypoint (main.ts) that starts a polling loop
calling into the relevant @aaf/core module functions") that currently logs
a "not yet implemented" heartbeat and exposes the health signal shape TDD
§37 requires — no business logic. The owning agent replaces the loop body
with real polling against its `@aaf/core` module.

Build/run: `pnpm --filter worker-qc build && pnpm --filter worker-qc start`
(or `pnpm --filter worker-qc dev` for local iteration via `tsx`).
