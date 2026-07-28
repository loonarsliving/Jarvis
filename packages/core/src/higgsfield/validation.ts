/**
 * Pre-submission prompt validation (TDD §9.3) — runs *before* every
 * `submitGeneration` call, independent of Higgsfield's own API-side
 * validation. A failure here is a configuration/code defect, not a
 * runtime job failure: "it raises immediately and never reaches
 * Higgsfield, logged at `critical` severity since it indicates the Prompt
 * Engine produced an invalid request" (TDD §9.3).
 */

import type { GenerationRequest } from "../render-provider/index.js";

/**
 * Higgsfield's documented prompt character limit. ASSUMPTION: no live API
 * docs available in this environment — 4000 is a conservative placeholder
 * consistent with typical image/video-gen provider limits (comparable
 * providers researched in Master Planning `02-research-market.md` §1
 * commonly cap in the 2000-4000 range). Configurable via
 * `packages/core/config` rather than hardcoded here (Constitution Article
 * III.5) — see `higgsfieldPromptMaxLength` in `higgsfield/config.ts`.
 * MUST be verified against real Higgsfield API docs before production use.
 */
export const DEFAULT_HIGGSFIELD_PROMPT_MAX_LENGTH = 4000;

export class HiggsfieldPromptValidationError extends Error {
  constructor(
    message: string,
    public readonly failures: string[],
  ) {
    super(message);
    this.name = "HiggsfieldPromptValidationError";
  }
}

export interface ValidationContext {
  /** Whether this job's Mission references Product or Character DNA at all (TDD §9.3: "at least one reference present for any job referencing Product/Character DNA"). Jobs with no DNA reference (pure style/background generation) are exempt from the reference-presence check. */
  referencesProductOrCharacterDna: boolean;
  /** Whether the referenced DNA record(s) declare `negative_constraints` (TDD §9.3: "negative prompt non-empty when DNA-level negative_constraints exist"). */
  dnaHasNegativeConstraints: boolean;
  promptMaxLength?: number;
}

/**
 * Validates a fully-assembled `GenerationRequest` before it is ever handed
 * to `submitGeneration`. Throws `HiggsfieldPromptValidationError` — never
 * returns a soft/partial result — matching TDD §9.3's "raises immediately"
 * language (this is the one place in this module where throwing, rather
 * than the `RenderProvider` error types, is correct: it never reaches the
 * provider at all).
 */
export function validateGenerationRequest(
  request: GenerationRequest,
  context: ValidationContext,
): void {
  const failures: string[] = [];
  const maxLength = context.promptMaxLength ?? DEFAULT_HIGGSFIELD_PROMPT_MAX_LENGTH;

  if (!request.finalPromptText || request.finalPromptText.trim().length === 0) {
    failures.push("finalPromptText is empty");
  } else if (request.finalPromptText.length > maxLength) {
    failures.push(
      `finalPromptText length ${request.finalPromptText.length} exceeds max ${maxLength}`,
    );
  }

  if (context.referencesProductOrCharacterDna) {
    const hasAnyReference = Boolean(
      request.referenceBindings.productRef?.referenceImageIds.length ||
        request.referenceBindings.characterRef?.referenceImageIds.length,
    );
    if (!hasAnyReference) {
      failures.push(
        "job references Product/Character DNA but no reference binding is present on the request " +
          "(a job that silently drops its reference binding must fail loudly here, not generate an unlocked asset — TDD §9.3)",
      );
    }
  }

  if (context.dnaHasNegativeConstraints && request.negativePromptText.trim().length === 0) {
    failures.push(
      "DNA record declares negative_constraints but the assembled negativePromptText is empty",
    );
  }

  if (failures.length > 0) {
    throw new HiggsfieldPromptValidationError(
      `Generation request for job "${request.jobId}" failed pre-submission validation`,
      failures,
    );
  }
}
