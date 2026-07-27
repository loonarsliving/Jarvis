# TDD §24–29: Error Recovery, Retry Mechanism, Security, Authentication, Authorization, API Design

## 24. Error Recovery

### 24.1 Recovery Tiers (applies system-wide, consolidating patterns already introduced per-engine in earlier sections)

1. **Prevented** (strongest): invalid states made structurally impossible (e.g., Mission Engine's validation-before-creation, §20; Character Lock's precondition check, §15).
2. **Self-healing**: automatic retry + reconciliation jobs correct drift without human involvement (Drive/DB reconciliation §8.6, queue staleness recovery §12.4).
3. **Detected + surfaced**: cannot be auto-corrected safely, but is never silent — logged, flagged, notified (dead-letter jobs, `storage_missing`/`unindexed_file` flags, QC `blocked` status).
4. **Human-resolved**: the terminal tier for anything the system cannot safely decide on its own (Review Console decisions, DNA approval, `qc.lock_override`).

Every error in the system is classified into one of these tiers at design time — there is no fifth tier ("ignored"), which is the concrete engineering expression of FSD §22's "no silent failure" principle.

### 24.2 Isolation Boundaries

- One Mission's failures never affect another Mission's jobs (§FSD 22) — enforced structurally: `generation_jobs` rows are independent, the dispatcher's claim query has no Mission-level locking that could create cross-Mission contention beyond normal queue priority ordering.
- One worker crashing never corrupts another worker's in-flight state — each worker only ever mutates rows it has itself claimed (`claimed_by = own instance id`), so there's no shared-mutable-state hazard between worker instances of different types.
- A Higgsfield outage degrades gracefully: `mission-dispatcher` keeps expanding Missions and queuing jobs (they simply accumulate in `queued` state); `higgsfield-poller` keeps attempting submission per its retry policy; nothing downstream (Drive, QC) is affected until jobs actually start succeeding again — no cascading failure across services.

## 25. Retry Mechanism

Consolidated, single canonical policy (referenced, not re-defined, by every engine section above and by the FSD):

- **Max automatic attempts**: 4.
- **Backoff**: exponential, base 20s, doubling (20s/40s/80s/160s) — chosen to match MK Connect's already-validated `AI_CONFIG` retry approach (Master Planning `01-research-mkconnect.md` §6) for operational-mental-model consistency across the company's systems.
- **Jitter**: ±10% added to each computed backoff delay to avoid synchronized retry storms across many jobs failing at once (e.g., a Higgsfield outage causing dozens of simultaneous timeouts).
- **Non-retryable categories** (fail immediately to `dead_letter`/specific terminal status, no attempts consumed pointlessly): content-policy rejection, permission/auth errors, validation errors, checksum-integrity mismatch after a single retry (data corruption is not a "try again and hope" condition beyond one confirmation attempt).
- **Retryable categories**: network timeout, 5xx responses, rate-limit (429) with extended backoff multiplier (×3 the standard delay), transient DB connection errors.
- **Implementation**: a single shared `withRetry()` utility in `packages/core` used by every worker — retry logic is not reimplemented per engine, preventing policy drift between (e.g.) the Higgsfield poller's retry behavior and the Drive uploader's.

## 26. Security

### 26.1 Threat Model Summary
Internal enterprise system, not internet-public-facing by design intent (§40 deployment is a Mini PC on the company network) — but designed defensively regardless, since "internal" is not a substitute for access control (a compromised employee laptop or a misconfigured network exposure are realistic threats).

### 26.2 Secrets Management
- Higgsfield API key, Google service account JSON, Supabase service-role key, and Postgres credentials are **never** committed to the repository — supplied exclusively via environment variables (§30) injected at container runtime from a `.env` file that is itself `.gitignore`d, with a `.env.example` template committed showing required keys with placeholder values (mirrors MK Connect's proven `.env.example` convention).
- The Google service account JSON is mounted as a Docker secret/file (not inlined as an env var string) where the deployment tooling supports it, reducing exposure in process listings/logs.

### 26.3 Network Security
- Only `web` (via Caddy) is exposed on the host network; all worker containers and the Supabase stack communicate over an internal Docker network with no host port binding — a worker or the database is never directly reachable from outside the Mini PC.
- Caddy terminates TLS (automatic HTTPS via its built-in ACME support, assuming the Mini PC has a resolvable domain/DDNS — if purely LAN-internal, Caddy is configured with an internal CA or self-signed cert per the operational runbook).

### 26.4 Input Validation
Every Server Action and API route validates input with Zod schemas before it reaches any business logic (matching MK Connect's proven `*.schema.ts` convention, Master Planning `01-research-mkconnect.md` §1) — validation failures never reach the database layer.

### 26.5 Audit Trail as a Security Control
The Logging Engine (§23) doubles as a security control, not just an operational one — every permission-denied attempt is logged at `warning` severity (FSD §20), giving visibility into probing/misuse attempts, not just legitimate action history.

## 27. Authentication

- **Provider**: Supabase Auth (GoTrue, bundled in the self-hosted stack) — email+password for all human users, matching MK Connect's proven auth approach (Master Planning `01-research-mkconnect.md` §1) for team familiarity; no self-registration flow (unlike MK Connect) — this is a small, internal-only user base, accounts are provisioned by Super Admin via the Users & Roles settings page (FSD §9 navigation), not open registration.
- **Session handling**: Supabase session tokens (JWT), refreshed via `web`'s middleware on every request (same `updateSession` pattern already proven in MK Connect), httpOnly cookies — no client-side token storage.
- **Service-to-service auth**: workers authenticate to Postgres/Supabase using a dedicated service-role key (bypasses RLS, §7.1), never a human user's session — a clear identity separation that also makes the `audit_logs.actor_type = 'system'` distinction (§20) trivial to enforce correctly.

## 28. Authorization

- **Model**: the RBAC structure already fully specified in FSD §6/§7 (roles, permission keys, `role_permissions` mapping table) — this TDD section specifies the **enforcement mechanism**, not the policy itself (policy is FSD's responsibility, already approved).
- **Two-layer enforcement** (per §7.1): (1) every Server Action begins with a `requirePermission(permissionKey)` guard — a shared utility, not reimplemented per action, that checks the current session's role against `role_permissions` and throws a typed `PermissionDeniedError` (caught by the standard error-handling wrapper, logged per §26.5) if absent; (2) Postgres RLS policies independently enforce the same boundary at the data layer, so a bug in a Server Action's guard call (e.g., a forgotten check) cannot leak data — RLS is the backstop, not the primary UX-facing check.
- **Permission data model**: identical structure to MK Connect's proven approach — data-driven (`role_permissions` table), not a hardcoded enum/switch — new roles or permission grants are a data change, not a code deploy (Master Planning `01-research-mkconnect.md` §5).

## 29. API Design

### 29.1 Style
- **Server Actions** (Next.js) for all human-initiated mutations from the UI — not a separate REST layer for the web app's own use, matching the FSD's and MK Connect's proven pattern; Server Actions return a typed `ActionResult<T>` (`{ success: true, data } | { success: false, error }`), never throwing across the client/server boundary (same "never throw" discipline as MK Connect, `01-research-mkconnect.md` §3.3).
- **REST-ish API routes** (`/api/...`) for: (a) data the Dashboard fetches client-side via React Query, (b) any future external consumer (e.g., if MK Connect's Fase 5 integration, per Master Planning `08-roadmap-risks.md`, is ever built) — these routes are the same functions Server Actions call internally, just exposed over HTTP with request/response JSON framing, so there is exactly one implementation of each operation, not two.
- **No GraphQL** — unjustified complexity for this system's access patterns (a handful of well-known dashboard queries, not an open-ended client-driven query surface).

### 29.2 Representative Endpoint Inventory (illustrative, not exhaustive — full OpenAPI-style spec is an implementation-phase artifact)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/dashboard/summary` | GET | Dashboard KPI strip (FSD §8) |
| `/api/missions` | GET/POST | List / create Missions |
| `/api/missions/:id` | GET | Mission Detail |
| `/api/missions/:id/pause`, `/cancel`, `/retry-failed` | POST | Mission lifecycle actions |
| `/api/assets/search` | GET | Asset Library search (§19) |
| `/api/assets/:id` | GET | Asset Detail + provenance |
| `/api/qc/queue` | GET | Review Console queue |
| `/api/qc/review/:assetId` | POST | Approve/reject/override decision |
| `/api/queue` | GET | Job Monitor |
| `/api/queue/:jobId/retry`, `/cancel` | POST | Job-level actions |
| `/api/identity/products`, `/characters`, `/brands` | GET/POST | DNA record CRUD (create = new version) |
| `/api/identity/characters/:id/train-soul-id` | POST | Trigger Soul ID training |
| `/api/prompts/templates` | GET/POST | Template Library |
| `/api/prompts/templates/:id/test`, `/promote`, `/rollback` | POST | Template lifecycle |
| `/api/notifications` | GET/POST (mark read) | Notification Center |
| `/api/drive/status` | GET | Drive usage + reconciliation flags |
| `/api/settings/tags` | GET/POST | Tag vocabulary management |
| `/api/settings/logs` | GET | System Logs (Super Admin) |

### 29.3 Versioning
No `/v1/` prefix in v1 — internal-only consumer (the `web` app itself); versioning is deferred until/unless an external consumer (MK Connect Fase 5) actually requires a stability contract, at which point the endpoints consumed externally get a version prefix retroactively without disrupting the internal-only ones.

### 29.4 Error Response Shape (uniform across all routes)
`{ error: { code, message, details? } }` with HTTP status reflecting the error class (400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict [e.g., duplicate DNA version race], 500 unexpected) — `code` is a stable machine-readable string (`PERMISSION_DENIED`, `DNA_NOT_APPROVED`, `VALIDATION_FAILED`, etc.) the frontend can branch on without parsing `message` text.
