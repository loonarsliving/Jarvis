# worker-mission-dispatcher

**Owner: Agent 2 (Mission Engine).**

Stub worker service scaffolded by Agent 1 (Foundation) per Engineering
Constitution Article VIII. `src/main.ts` starts a polling loop skeleton
(entrypoint per TDD §5: "an entrypoint (main.ts) that starts a polling loop
calling into the relevant @aaf/core module functions") that currently logs
a "not yet implemented" heartbeat and exposes the health signal shape TDD
§37 requires — no business logic. The owning agent replaces the loop body
with real polling against its `@aaf/core` module.

Build/run: `pnpm --filter worker-mission-dispatcher build && pnpm --filter worker-mission-dispatcher start`
(or `pnpm --filter worker-mission-dispatcher dev` for local iteration via `tsx`).
