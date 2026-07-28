/**
 * Reference selection at request-build time (TDD §9.4, FSD §28.2).
 *
 * IMPORTANT — ownership boundary (Constitution Article VIII "Note on
 * Product/Character Lock split" + TDD §9.4 verbatim): the actual
 * scene-appropriate-reference *selection algorithm* lives in Agent 3's
 * `packages/core/identity` module ("this selection logic lives in
 * `packages/core/identity` ... queried by the Higgsfield client at
 * request-build time, not duplicated inside the Higgsfield module
 * itself" — TDD §9.4). This file therefore does NOT reimplement selection
 * logic — it defines the narrow interface this module needs from
 * `identity` and calls it. `identity` is still a stub in this Sprint
 * (Agent 3 runs in parallel), so the call below is wired against a
 * documented interface shape, not identity's real implementation.
 *
 * TODO(integration): depends on Agent 3's `packages/core/identity` module
 * exporting a function matching `IdentityReferenceSelector` below (or
 * close enough that a thin adapter suffices). Swap
 * `notYetImplementedReferenceSelector` for a real import
 * (`import { selectCanonicalReference } from "../identity/index.js"`) once
 * that lands, and delete this TODO + the placeholder.
 */

export type DnaKind = "product" | "character";

export interface ReferenceSelectionRequest {
  dnaKind: DnaKind;
  /** Approved DNA version id (Product DNA or Character DNA, per `dnaKind`). */
  dnaVersionId: string;
  /** Camera DNA slot value for this job, e.g. `flat_lay`, `three_quarter`, `hero` (FSD §28.2, TDD §14 Product Lock Layer 2). */
  cameraSlotValue: string;
  /** Character Lock only — an explicitly Mission-approved outfit variant, else the DNA's default (TDD §15 Layer 2). */
  approvedOutfitVariant?: string;
}

export interface ReferenceSelectionResult {
  /** One or more canonical reference image ids/URLs, most scene-appropriate for `cameraSlotValue` first. */
  referenceImageIds: string[];
  /** Reference weight, from the DNA record's per-product override or the platform default (FSD §14.3). */
  referenceWeight: number;
  /** Merged DNA-level `negative_constraints` (TDD §14 Layer 1 / §15 Layer 1), always attached to the Negative Prompt module. */
  negativeConstraints: string[];
  /** Character Lock only: the trained Soul ID persona, if this DNA version has one (TDD §14.2). Absent = degraded mode (§9.2). */
  soulIdReference?: string;
}

export type IdentityReferenceSelector = (
  request: ReferenceSelectionRequest,
) => Promise<ReferenceSelectionResult>;

/**
 * Thrown when reference selection is requested for a `character` DNA kind
 * under `purpose: "production"` and no trained Soul ID exists yet (TDD §15
 * Failure Cases: "never for a production-purpose Mission job"). Per TDD
 * §15 Recovery Strategy this precondition is *supposed* to be enforced
 * earlier, at Mission Composer validation (Agent 2) — this check is Agent
 * 4's defensive re-validation at the boundary it owns (mirrors the Prompt
 * Engine's own "re-validates defensively rather than trusting the caller"
 * pattern, TDD §13 Failure Cases), never a substitute for that upstream gate.
 */
export class MissingTrainedSoulIdError extends Error {
  constructor(dnaVersionId: string) {
    super(
      `Character DNA version "${dnaVersionId}" has no trained Soul ID persona — refusing to build a production-purpose generation request in degraded mode (TDD §15).`,
    );
    this.name = "MissingTrainedSoulIdError";
  }
}

/** Placeholder until Agent 3's `identity` module lands — see file header TODO(integration). */
const notYetImplementedReferenceSelector: IdentityReferenceSelector = () => {
  throw new Error(
    "@aaf/core/identity does not yet export a reference-selection function (Agent 3's module is a stub in this Sprint). " +
      "See packages/core/src/higgsfield/reference-selection.ts TODO(integration).",
  );
};

export interface SelectReferencesOptions {
  /** Injectable for tests and for swapping in the real `identity` export once available (Constitution Article IV.3: dependencies injected, not imported as singletons). */
  selector?: IdentityReferenceSelector;
  /** `production` Mission jobs must never proceed in Character Lock degraded mode (TDD §15 Failure Cases). `dna_onboarding` jobs (generating the turnaround sheet before Soul ID exists) are exempt. */
  jobPurpose: "production" | "dna_onboarding";
}

/**
 * Selects the scene-appropriate canonical reference(s) for a generation
 * request by delegating to `identity` (see header). Enforces the
 * Character Lock hard precondition (TDD §15) that this module is
 * responsible for at its own boundary.
 */
export async function selectReferencesForRequest(
  request: ReferenceSelectionRequest,
  options: SelectReferencesOptions,
): Promise<ReferenceSelectionResult> {
  const selector = options.selector ?? notYetImplementedReferenceSelector;
  const result = await selector(request);

  if (
    request.dnaKind === "character" &&
    options.jobPurpose === "production" &&
    !result.soulIdReference
  ) {
    throw new MissingTrainedSoulIdError(request.dnaVersionId);
  }

  return result;
}
