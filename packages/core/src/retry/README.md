# retry

**Owner: Agent 4 (Render Provider Framework) — added this Sprint as
shared cross-cutting infra; not exclusively Higgsfield-scoped.**

The single canonical retry policy (TDD §25): 4 max attempts, exponential
backoff base 20s (20s/40s/80s/160s), ±10% jitter, ×3 multiplier for
rate-limit failures, and the retryable/non-retryable category split. TDD
§25 explicitly requires this be "a single shared `withRetry()` utility in
`packages/core` used by every worker — retry logic is not reimplemented
per engine."

This module is not in TDD §3's module architecture diagram and not
assigned to any single agent's exclusive ownership in Constitution
Article VIII — Agent 4 needed it first (the Higgsfield poller) and added
it here rather than duplicating retry math inline, mirroring the
precedent Agent 1 set for `rbac`/`result` (cross-cutting infra implied by
the TDD but not slotted into a named module). See
`docs/ai-asset-factory/DECISIONS-agent-4.md` for the full reasoning.
Agents 5/6 (Upload/QC workers) should import from here rather than
reimplementing.
