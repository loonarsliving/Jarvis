/**
 * The single canonical retry policy (TDD §25): "a single shared
 * `withRetry()` utility in `packages/core` used by every worker — retry
 * logic is not reimplemented per engine, preventing policy drift."
 *
 * TDD §25 is not assigned to any specific agent's exclusive module list in
 * Constitution Article VIII, and is not one of the modules enumerated in
 * TDD §3's module architecture diagram — same situation Agent 1 documented
 * for `rbac`/`result` in `DECISIONS.md` (cross-cutting infra implied by the
 * TDD but not slotted into a named module). Agent 4 is the first agent (in
 * this Sprint) that actually needs it (the Higgsfield poller), so it's
 * implemented here as its own small `@aaf/core/retry` subpath rather than
 * duplicated inline — see `docs/ai-asset-factory/DECISIONS-agent-4.md`.
 * Agents 5/6 (Upload/QC workers) should import this rather than
 * reimplementing, per TDD §25's explicit instruction.
 */

export type RetryableCategory = "transient" | "rate_limit";
export type NonRetryableCategory =
  | "content_policy"
  | "permission"
  | "validation"
  | "checksum_integrity";

export interface RetryClassification {
  retryable: boolean;
  category: RetryableCategory | NonRetryableCategory;
}

export interface RetryPolicyConfig {
  /** TDD §25: 4. */
  maxAttempts: number;
  /** TDD §25: 20_000 (20s), doubling each attempt. */
  backoffBaseMs: number;
}

/**
 * Computes the backoff delay for a given (1-indexed) attempt number, per
 * TDD §25: exponential doubling from `backoffBaseMs`, ±10% jitter, and a
 * ×3 multiplier for rate-limit-classified failures ("extended backoff").
 */
export function computeBackoffMs(
  attempt: number,
  policy: RetryPolicyConfig,
  category: RetryableCategory = "transient",
): number {
  const exponential = policy.backoffBaseMs * 2 ** (attempt - 1);
  const rateLimitMultiplier = category === "rate_limit" ? 3 : 1;
  const base = exponential * rateLimitMultiplier;
  const jitterFraction = (Math.random() * 2 - 1) * 0.1; // ±10%
  return Math.max(0, Math.round(base * (1 + jitterFraction)));
}

/**
 * `next_retry_at` helper — the queue row field polled by the claim query's
 * `next_retry_at <= now()` clause (TDD §10.4).
 */
export function computeNextRetryAt(
  attempt: number,
  policy: RetryPolicyConfig,
  category: RetryableCategory = "transient",
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + computeBackoffMs(attempt, policy, category));
}

export interface ClassifiableError {
  /** Set by provider clients / HTTP wrappers on the error they throw, per §25's category list. */
  retryCategory?: RetryableCategory | NonRetryableCategory;
}

/**
 * Classifies a thrown error into retryable/non-retryable per TDD §25's two
 * lists. Defaults unknown errors to `transient` (retryable) — an
 * unrecognized failure is far more likely to be a network blip than a new,
 * silently-introduced non-retryable category; a deliberately non-retryable
 * error must say so explicitly via `retryCategory`.
 */
export function classifyError(error: unknown): RetryClassification {
  const category = (error as ClassifiableError | undefined)?.retryCategory;
  switch (category) {
    case "content_policy":
    case "permission":
    case "validation":
    case "checksum_integrity":
      return { retryable: false, category };
    case "rate_limit":
      return { retryable: true, category: "rate_limit" };
    case "transient":
    default:
      return { retryable: true, category: "transient" };
  }
}

/**
 * Returns true when `attemptCount` (attempts already made, including the
 * one that just failed) has reached the policy's ceiling — the caller
 * transitions the job to `dead_letter` (or the Higgsfield-specific
 * `failed_content_policy` terminal status, which bypasses this check
 * entirely per §25/§9.7) rather than scheduling another attempt.
 */
export function hasExhaustedAttempts(attemptCount: number, policy: RetryPolicyConfig): boolean {
  return attemptCount >= policy.maxAttempts;
}
