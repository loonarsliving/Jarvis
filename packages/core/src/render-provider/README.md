# render-provider

**Owner: Agent 4 (Render Provider Framework).**

The general, provider-agnostic render-provider interface (TDD §9.1,
Constitution Article VIII, Article II.3 non-negotiable: "Higgsfield is a
provider behind an interface, never a hardcoded dependency").

`types.ts` defines `RenderProvider` — `submitGeneration`, `pollStatus`,
`submitSoulIdTraining`, `pollTrainingStatus` — and every request/response
shape those four functions use. Nothing in this module may import or
reference Higgsfield specifically; `../higgsfield/client.ts` implements
this interface, and a future provider would implement the same interface
in its own sibling module without any change here.

`registry.ts` is a minimal name → provider lookup so calling code resolves
"the currently configured provider" without importing a specific
provider's module directly.

Not a v1 deliverable, but designed for it (FSD §14.6): adding a second
provider means a new `packages/core/src/<provider>/` module implementing
`RenderProvider` plus one registration call — no change to this module, to
`higgsfield/`, or to any caller.
