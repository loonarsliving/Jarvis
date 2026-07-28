/**
 * Higgsfield-specific API shapes.
 *
 * ASSUMPTION WARNING: this environment has no live Higgsfield API
 * credentials or vendored API docs. Every field name/shape below is
 * inferred from: FSD §14 ("Soul ID", "Cinema Studio", "Hero Frame"
 * terminology), TDD §9 (client architecture/mapping description), and
 * Master Planning `02-research-market.md` §1's Higgsfield competitor
 * research. These shapes MUST be verified against real Higgsfield API
 * documentation before production use — see `DECISIONS-agent-4.md` for the
 * full list of assumptions. Nothing outside this file (and `client.ts`,
 * which performs the actual HTTP calls) may depend on these types —
 * that's the entire point of the `RenderProvider` boundary.
 */

/** POST /v1/generations (assumed endpoint) request body. */
export interface HiggsfieldGenerationRequestBody {
  prompt: string;
  negative_prompt?: string;
  /** Soul ID persona reference, when the Character DNA has one trained (§9.2 degraded-mode note applies when absent). */
  soul_id?: string;
  /** Weighted image references, role-tagged by Higgsfield's own reference-type enum (assumed). */
  references?: HiggsfieldReference[];
  /** Cinema Studio camera/lens parameters (FSD §14.1). */
  cinema_studio?: HiggsfieldCinemaStudioParams;
  /** Hero Frame anchor image, image-to-video jobs only (FSD §14.1, TDD §9.2's `style_ref` mapping). */
  hero_frame?: string;
  asset_class: "image" | "video";
  /** Caller-supplied idempotency/correlation token — assumed supported, mirrors MK Connect's own Gemini integration pattern (FSD §14.1). */
  external_reference_id: string;
}

export interface HiggsfieldReference {
  type: "character" | "product" | "style";
  image_url: string;
  weight?: number;
}

export interface HiggsfieldCinemaStudioParams {
  angle?: string;
  lens?: string;
  framing?: string;
  movement?: string;
}

/** POST /v1/generations response (assumed). */
export interface HiggsfieldGenerationSubmitResponse {
  job_id: string;
  status: HiggsfieldJobStatus;
  credit_cost?: number;
}

/** GET /v1/generations/{job_id} response (assumed). */
export interface HiggsfieldGenerationStatusResponse {
  job_id: string;
  status: HiggsfieldJobStatus;
  output_url?: string;
  credit_cost?: number;
  /** Present when `status === "failed"` and Higgsfield's own moderation rejected the prompt (assumed field name). */
  content_policy_violation?: boolean;
  failure_reason?: string;
}

/**
 * Higgsfield's own job-status vocabulary (assumed), mapped to our internal
 * `GenerationStatus` per FSD §14.4's table — this type never leaks outside
 * this module.
 */
export type HiggsfieldJobStatus = "pending" | "queued" | "processing" | "succeeded" | "failed";

/** POST /v1/soul-id/train (assumed endpoint). */
export interface HiggsfieldSoulIdTrainRequestBody {
  reference_image_urls: string[];
  external_reference_id: string;
}

export interface HiggsfieldSoulIdTrainSubmitResponse {
  training_id: string;
  status: HiggsfieldTrainingStatus;
}

/** GET /v1/soul-id/train/{training_id} response (assumed). */
export interface HiggsfieldSoulIdTrainStatusResponse {
  training_id: string;
  status: HiggsfieldTrainingStatus;
  soul_id?: string;
  credit_cost?: number;
}

export type HiggsfieldTrainingStatus = "queued" | "training" | "succeeded" | "failed";

/** Uniform Higgsfield API error envelope (assumed, mirrors typical REST provider conventions). */
export interface HiggsfieldApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
