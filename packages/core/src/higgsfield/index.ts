/**
 * Public interface of the Higgsfield render-provider implementation
 * (Owner: Agent 4 — Render Provider Framework, TDD §9, Constitution
 * Article VIII). Callers outside this module import from here only —
 * never reach into `client.ts`/`types.ts` directly (Constitution Article
 * III.4).
 *
 * The general, provider-agnostic `RenderProvider` interface itself lives
 * in `../render-provider/index.js` (also Agent 4's — see Constitution
 * Article VIII: "`higgsfield` (and the general `render-provider` interface
 * + provider registry)"), re-exported here for convenience since most
 * callers only need "the Higgsfield provider" and don't care that the
 * interface is technically a sibling module.
 */

export { createHiggsfieldProvider, mapToHiggsfieldRequestBody } from "./client.js";
export type { HiggsfieldClientConfig } from "./client.js";

export { buildGenerationRequest } from "./prompt-mapping.js";
export type { PromptEngineOutput, BuildGenerationRequestInput } from "./prompt-mapping.js";

export {
  validateGenerationRequest,
  HiggsfieldPromptValidationError,
  DEFAULT_HIGGSFIELD_PROMPT_MAX_LENGTH,
} from "./validation.js";
export type { ValidationContext } from "./validation.js";

export {
  selectReferencesForRequest,
  MissingTrainedSoulIdError,
} from "./reference-selection.js";
export type {
  DnaKind,
  ReferenceSelectionRequest,
  ReferenceSelectionResult,
  IdentityReferenceSelector,
  SelectReferencesOptions,
} from "./reference-selection.js";

export {
  resolveGenerationCost,
  resolveTrainingCost,
  buildCostLedgerEntry,
  DEFAULT_LOCAL_COST_ESTIMATE,
} from "./cost.js";
export type { LocalCostEstimateConfig, CostLedgerEntry } from "./cost.js";

// Re-exported from ../render-provider for caller convenience (see header).
export type {
  RenderProvider,
  GenerationRequest,
  GenerationStatus,
  GenerationSubmissionResult,
  GenerationStatusResult,
  ReferenceBindings,
  ReferenceBinding,
  CameraParams,
  ProviderCost,
  TrainingStatus,
  SoulIdTrainingRequest,
  SoulIdTrainingSubmissionResult,
  SoulIdTrainingStatusResult,
} from "../render-provider/index.js";
export {
  ProviderContentPolicyError,
  ProviderTransientError,
  ProviderRateLimitError,
  ProviderAuthError,
  RenderProviderRegistry,
  defaultRenderProviderRegistry,
} from "../render-provider/index.js";
