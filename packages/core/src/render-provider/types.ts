/**
 * The general Render Provider interface (TDD §9.1, Constitution Article
 * VIII "Agent 4 — Render Provider Framework"). This is the provider-
 * abstraction boundary made concrete: `packages/core/src/higgsfield`
 * implements this interface; a future provider (Seedance/Runway/Veo/Kling
 * — FSD §14.6/§40 future-scalability notes, NOT implemented in this
 * Sprint) would implement the same four functions and nothing outside
 * this module or the specific provider's own implementation file would
 * change.
 *
 * Nothing in this file may reference "Higgsfield" — that would defeat the
 * purpose of the interface (Constitution Article II.3 non-negotiable).
 */

/** Provider-agnostic role-tagged reference bindings (FSD §13 step 2, TDD §9.2). */
export interface ReferenceBindings {
  characterRef?: ReferenceBinding;
  productRef?: ReferenceBinding;
  styleRef?: ReferenceBinding;
}

export interface ReferenceBinding {
  /** One or more canonical reference image IDs/URLs, already scene-selected (TDD §9.4). */
  referenceImageIds: string[];
  /** Provider-agnostic relative weight hint (0-1), if the DNA record specifies one (FSD §14.3). */
  weight?: number;
}

/** Provider-agnostic camera control params (TDD §13 "Camera DNA" module, mapped to Cinema Studio for Higgsfield). */
export interface CameraParams {
  angle?: string;
  lens?: string;
  framing?: string;
  movement?: string;
  [key: string]: string | undefined;
}

/**
 * The provider-agnostic generation request shape — this is exactly the
 * Prompt Engine's output structure (TDD §9.2, §13 Output), unmodified by
 * this module. Provider-specific mapping happens *inside* each provider's
 * own implementation file, never here.
 */
export interface GenerationRequest {
  /** Correlates back to the caller's `generation_jobs` row (Agent 2's table) — never persisted by this module itself. */
  jobId: string;
  finalPromptText: string;
  negativePromptText: string;
  referenceBindings: ReferenceBindings;
  cameraParams: CameraParams;
  /** Present only when the Character DNA already has a trained persona (TDD §9.2). Absent = degraded mode. */
  soulIdReference?: string;
  /** `image` vs `video` — affects whether a Hero Frame anchor is relevant (FSD §14.1). */
  assetClass: "image" | "video";
}

export type GenerationStatus =
  | "submitted"
  | "running"
  | "succeeded"
  | "failed"
  | "failed_content_policy"
  | "timeout";

export interface GenerationSubmissionResult {
  /** The provider's own job identifier — persisted synchronously by the caller (TDD §9.5), never held only in memory by this module. */
  providerJobId: string;
  status: GenerationStatus;
  /** Provider-reported credit/cost, if the API exposes it at submission time (TDD §9.9). */
  reportedCost?: ProviderCost;
}

export interface GenerationStatusResult {
  status: GenerationStatus;
  /** Present only when `status === "succeeded"` — a signed, time-limited download URL (TDD §9.6). This module never downloads it. */
  outputUrl?: string;
  /** Raw provider status string, kept for logging (TDD §9.8 "last-known status string"). */
  providerStatusRaw: string;
  reportedCost?: ProviderCost;
  /** Present only for `failed_content_policy` — human-readable reason, never retried (TDD §9.7). */
  rejectionReason?: string;
}

export interface ProviderCost {
  amount: number;
  currency: "credits" | "usd";
}

export type TrainingStatus = "queued" | "training" | "succeeded" | "failed";

export interface SoulIdTrainingRequest {
  /** Correlates back to the caller's Soul ID training job row — never persisted by this module itself. */
  trainingJobId: string;
  characterDnaVersionId: string;
  /** Canonical reference image set the persona is trained from (FSD §14.2). */
  referenceImageIds: string[];
}

export interface SoulIdTrainingSubmissionResult {
  providerTrainingId: string;
  status: TrainingStatus;
}

export interface SoulIdTrainingStatusResult {
  status: TrainingStatus;
  /** Present only when `status === "succeeded"` — the trained persona ID to store as `higgsfield_soul_id` on the Character DNA record (FSD §14.2). Field name is provider-agnostic on purpose. */
  soulIdReference?: string;
  providerStatusRaw: string;
  reportedCost?: ProviderCost;
}

/**
 * The narrow internal interface every render provider implements (TDD
 * §9.1). This is the *only* surface the rest of the system calls —
 * calling code never imports a provider-specific module directly outside
 * this package (Constitution Article II.3).
 */
export interface RenderProvider {
  readonly name: string;
  submitGeneration(request: GenerationRequest): Promise<GenerationSubmissionResult>;
  pollStatus(providerJobId: string): Promise<GenerationStatusResult>;
  submitSoulIdTraining(request: SoulIdTrainingRequest): Promise<SoulIdTrainingSubmissionResult>;
  pollTrainingStatus(providerTrainingId: string): Promise<SoulIdTrainingStatusResult>;
}

/** Thrown for a deterministic, non-retryable rejection (TDD §9.7, §25 "content-policy rejection"). */
export class ProviderContentPolicyError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "ProviderContentPolicyError";
  }
}

/** Thrown for a transient failure (network, 5xx) — retryable per §25. */
export class ProviderTransientError extends Error {
  public readonly providerCause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ProviderTransientError";
    this.providerCause = cause;
  }
}

/** Thrown for rate-limit/quota exceeded (429) — retryable with the ×3 extended backoff multiplier (§25). */
export class ProviderRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

/** Thrown for auth/permission failures against the provider's own API — never retried (§25). */
export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}
