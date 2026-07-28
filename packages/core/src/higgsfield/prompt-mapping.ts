/**
 * Prompt Engine output -> provider-agnostic `GenerationRequest` (TDD §9.2,
 * first half: "The Prompt Engine (§13) outputs a provider-agnostic
 * structure").
 *
 * TODO(integration): depends on Agent 3's `packages/core/prompt-engine`
 * module (a stub in this Sprint). `PromptEngineOutput` below mirrors TDD
 * §13's documented Output shape exactly
 * (`{ finalPromptText, referenceBindings, negativePromptText, provenance }`)
 * — once `prompt-engine/index.ts` exports a real type, replace this local
 * copy with `import type { PromptEngineOutput } from "../prompt-engine/index.js"`.
 */

import type { CameraParams, GenerationRequest, ReferenceBindings } from "../render-provider/index.js";
import type { ReferenceSelectionResult } from "./reference-selection.js";

export interface PromptEngineOutput {
  finalPromptText: string;
  negativePromptText: string;
  /** Camera DNA slot values this job was composed with (TDD §13 Input `variationSlotValues.camera`). */
  cameraParams: CameraParams;
  provenance: {
    templateVersionId: string;
    dnaVersionIds: string[];
  };
}

export interface BuildGenerationRequestInput {
  jobId: string;
  assetClass: "image" | "video";
  promptOutput: PromptEngineOutput;
  /** Result of `selectReferencesForRequest` (reference-selection.ts) for each DNA role this job references. Absent role = no binding for that role. */
  productReference?: ReferenceSelectionResult;
  characterReference?: ReferenceSelectionResult;
  /** Brand mood-board / style reference, when the template calls for one (FSD §13 step 2's `style_ref`) — not DNA-versioned like product/character, so it bypasses `selectReferencesForRequest`. */
  styleReferenceImageIds?: string[];
}

/**
 * Assembles the provider-agnostic `GenerationRequest` this module's
 * `RenderProvider` implementation consumes. Pure data transformation, no
 * network calls, no Higgsfield-specific field names (those only appear in
 * `client.ts`'s mapping to `HiggsfieldGenerationRequestBody`).
 */
export function buildGenerationRequest(input: BuildGenerationRequestInput): GenerationRequest {
  const referenceBindings: ReferenceBindings = {};

  if (input.productReference) {
    referenceBindings.productRef = {
      referenceImageIds: input.productReference.referenceImageIds,
      weight: input.productReference.referenceWeight,
    };
  }
  if (input.characterReference) {
    referenceBindings.characterRef = {
      referenceImageIds: input.characterReference.referenceImageIds,
      weight: input.characterReference.referenceWeight,
    };
  }
  if (input.styleReferenceImageIds?.length) {
    referenceBindings.styleRef = { referenceImageIds: input.styleReferenceImageIds };
  }

  const negativeConstraints = [
    ...(input.productReference?.negativeConstraints ?? []),
    ...(input.characterReference?.negativeConstraints ?? []),
  ];
  const negativePromptText = [input.promptOutput.negativePromptText, ...negativeConstraints]
    .filter((s) => s.trim().length > 0)
    .join(", ");

  return {
    jobId: input.jobId,
    finalPromptText: input.promptOutput.finalPromptText,
    negativePromptText,
    referenceBindings,
    cameraParams: input.promptOutput.cameraParams,
    soulIdReference: input.characterReference?.soulIdReference,
    assetClass: input.assetClass,
  };
}
