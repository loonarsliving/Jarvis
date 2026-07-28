# higgsfield

**Owner: Agent 4 (Render Provider Framework).**

Implements the Higgsfield-specific `RenderProvider` (see
`../render-provider/` for the general, provider-agnostic interface this
module fulfills). Maps to/from Higgsfield's HTTP API — see
`docs/ai-asset-factory/tdd/02-drive-higgsfield-integration.md` §9 for the
full spec this module implements.

## Files

- `client.ts` — `createHiggsfieldProvider(config)`: the actual HTTP client, implements `RenderProvider`. The only file that knows Higgsfield's real request/response field names.
- `types.ts` — Higgsfield-specific API shapes. **Assumed**, not verified against live API docs (no credentials in this environment) — see header comment and `docs/ai-asset-factory/DECISIONS-agent-4.md`.
- `prompt-mapping.ts` — Prompt Engine output → provider-agnostic `GenerationRequest` (TDD §9.2).
- `validation.ts` — pre-submission validation (TDD §9.3), throws before anything reaches Higgsfield.
- `reference-selection.ts` — the interface this module needs from Agent 3's `identity` module (TDD §9.4) — selection *algorithm* lives in `identity`, not here.
- `cost.ts` — cost/quota tracking (TDD §9.9).

## What this module does NOT do

- Does not download generated assets — enqueues an Upload Queue entry instead (TDD §9.6), consumed by Agent 5's `drive-sync-worker`.
- Does not implement Product/Character Fidelity *scoring* — that's Agent 6's `product-lock`/`character-lock` (validation side). This module only does generation-time reference *selection*.
- Does not implement retry/claim logic itself — uses the shared `@aaf/core/retry` (`withRetry`-style utilities, TDD §25) and Agent 2's `@aaf/core/queue` claim primitive.

Do not reach into this folder's internals from another module — depend on
its public `index.ts` export only (Constitution Article III.4).
