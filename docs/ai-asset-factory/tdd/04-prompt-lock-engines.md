# TDD §13–16: Prompt Engine, Product Lock Engine, Character Lock Engine, Brand DNA Engine

Each engine follows the module template (Purpose, Responsibilities, Input, Output, Dependencies, Data Flow, Failure Cases, Recovery Strategy) established in `00-system-service-module-architecture.md` §3.

## 13. Prompt Engine

**Purpose**: Deterministically assemble a complete, Higgsfield-ready prompt from independent DNA modules and a template, per FSD §26.

**Responsibilities**: load the current-production (or explicitly pinned) Prompt Template version; resolve all referenced DNA records to their approved versions; compose the 8-module structure (Brand/Product/Character/Scene/Camera/Lighting/Motion/Negative) plus the Consistency Prompt header in fixed order; validate the assembled result before returning it.

**Input**: `{ missionId | jobId, promptTemplateVersionId, dnaRefs: { brandId?, productId?, characterId? }, variationSlotValues: { scene, camera, lighting, motion? } }`.

**Output**: `{ finalPromptText, referenceBindings, negativePromptText, provenance: { templateVersionId, dnaVersionIds[] } }` — the exact structure consumed by the Higgsfield client (`02-drive-higgsfield-integration.md` §9.2).

**Dependencies**: `identity` module (DNA resolution), `db` (template/DNA reads), no network calls of its own — pure composition logic, fully unit-testable without any external service.

**Data Flow**:
```
Template (composition_spec) + DNA versions (approved only)
        v
[Resolve DNA -> descriptor fields, canonical refs, negative_constraints]
        v
[Compose Consistency Prompt header] (verbatim identity restatement, every call)
        v
[Compose Brand -> Product/Character -> Scene -> Camera -> Lighting -> Motion]
        v
[Merge all negative_constraints -> Negative Prompt module]
        v
[Assemble reference bindings: character_ref / product_ref / style_ref]
        v
Output (validated)
```

**Failure Cases**: referenced DNA not in `approved` status (must never happen for a launched Mission — Mission Composer already restricts selection to approved DNA, FSD §10 Journey A step 3 — but the engine re-validates defensively rather than trusting the caller); template `composition_spec` malformed (schema-validated on template save, so this indicates a data-integrity bug, not a runtime condition to design elaborate handling for); missing required module for the asset class (e.g., a `hero` template with no Product DNA ref).

**Recovery Strategy**: all failure cases above are **assembly-time validation errors**, raised before any Higgsfield submission — the job never reaches `submitted` status, it fails fast with a specific error code surfaced to Job Monitor as `failed_prompt_assembly`, distinct from a provider-side failure, so operators immediately know the problem is on the Asset Factory side, not Higgsfield's.

## 14. Product Lock Engine

**Purpose**: Guarantee, both structurally (at generation time) and empirically (at validation time), that a Product DNA's identity is preserved in every asset referencing it — implements FSD §28 as concrete engine logic, and Master Planning `03-consistency-framework.md`'s "strongest possible" mandate.

**Responsibilities**: at generation time, select the scene-appropriate canonical reference(s) and assemble the product-specific negative constraint set (`02-drive-higgsfield-integration.md` §9.4); at validation time (post-generation), compute the Product Fidelity score.

**Layered Architecture** (per the brief's "document every layer" instruction):

```
Layer 1 — Structural Lock (generation-time, preventive)
  - Canonical reference image always attached, weighted per Product DNA config
  - Consistency Prompt restates exact color/logo/material descriptors every job
  - Negative Prompt always includes Product DNA's negative_constraints

Layer 2 — Multi-Reference Selection
  - Camera DNA slot determines which canonical angle is used (flat-lay vs hero vs detail)
  - Prevents mismatched reference/scene combinations weakening lock fidelity

Layer 3 — Empirical Validation (post-generation, detective)
  - Logo-region detection + embedding similarity vs. canonical logo crop
  - Color-delta sampling on key packaging regions vs. Product DNA HEX lock values
  - Whole-image CLIP-style similarity vs. canonical reference as a coarse secondary signal

Layer 4 — Decision Gate
  - Weighted combination of Layer 3 scores -> single Product Fidelity score (0-100)
  - Below blocking threshold -> hard block, cannot auto-approve (FSD §19)

Layer 5 — Feedback
  - Score persisted to qc_reports, feeds Prompt Template performance aggregation (§FSD 27)
  - Product DNA records with chronically low scores flagged for review (are references stale/low-quality?)
```

**Input** (generation-time call): `{ productDnaVersionId, cameraSlotValue }` → **Output**: `{ referenceImageIds[], referenceWeight, negativeConstraints[] }`.
**Input** (validation-time call): `{ assetId, productDnaVersionId }` → **Output**: `{ productFidelityScore, subscores: { logoSimilarity, colorDelta, overallSimilarity }, failureCategories[] }`.

**Dependencies**: `identity` (DNA data), an embedding/similarity computation dependency (§14 Implementation Note below), `drive` (fetching the generated asset + canonical reference for comparison).

**Implementation Note on Layer 3 tooling**: the specific model(s) used for logo detection and embedding similarity are an implementation-time selection (candidates per Master Planning `02-research-market.md` §3: a lightweight object detector for logo region + a CLIP-family embedding model for similarity) — this TDD fixes the *architecture* (a pluggable `SimilarityScorer` interface inside `packages/core/product-lock`) rather than pinning a specific model version, so the model can be upgraded without touching the engine's calling contract.

**Failure Cases**: canonical reference image unreadable/corrupted (Product DNA data-integrity issue — surfaces as a `blocked` DNA-level alert, not a per-asset QC failure, since it would affect every asset for that product); similarity scorer service/model unavailable at validation time.

**Recovery Strategy**: if the similarity scorer is unavailable, the QC job is **not** force-scored with a default/fake value — it re-enters the QC Queue as `retrying` (transient failure path, §25), since a Product Fidelity score computed without the actual scoring model would be meaningless and dangerous to trust as a gate.

## 15. Character Lock Engine

**Purpose**: Guarantee character identity consistency — the FSD §29 workflow made concrete, using Higgsfield Soul ID as the primary structural mechanism plus independent empirical validation (never trusting Soul ID's black-box guarantee alone).

**Layered Architecture**:

```
Layer 1 — Structural Lock (generation-time)
  - Soul ID persona reused for every job referencing this Character DNA version
  - Consistency Prompt restates hair/age descriptors every job (Soul ID covers face/body identity,
    NOT guaranteed to hold hair styling or stated age under heavy scene variation - Master Planning
    finding, 02-research-market.md §3)

Layer 2 — Controlled Variation
  - Expression and pose are deliberately NOT locked - drawn from the DNA's allowed_expressions set
  - Outfit drawn from default or an explicitly allowed_outfit_variant - anything else requires
    Creative Director sign-off at the Mission level (FSD §32)

Layer 3 — Empirical Validation (post-generation)
  - Face-embedding similarity vs. Character DNA reference set (primary signal)
  - Attribute checks: hair color/style match, outfit-set membership, age-descriptor plausibility
    (qualitative/human-assisted in v1 for age and body proportion - Master Planning noted this
    is a known-hard automated problem, FSD §29 point 3)

Layer 4 — Decision Gate
  - Face-embedding similarity is the primary blocking signal (hard threshold)
  - Attribute mismatches (wrong hair/outfit) route to needs_review rather than hard-block,
    since these are template/prompt issues more often than true identity failures

Layer 5 — Feedback
  - Same pattern as Product Lock Layer 5
```

**Input** (generation-time): `{ characterDnaVersionId, missionApprovedOutfitVariant? }` → **Output**: `{ soulIdReference, referenceImageIds[] (fallback if untrained), negativeConstraints[] }`.
**Input** (validation-time): `{ assetId, characterDnaVersionId }` → **Output**: `{ characterFidelityScore, subscores: { faceEmbeddingSimilarity, hairMatch, outfitMatch }, failureCategories[] }`.

**Dependencies**: `identity`, Higgsfield client (to confirm Soul ID training state), a face-embedding similarity dependency (same pluggable-interface principle as §14).

**Failure Cases**: job submitted against a Character DNA with no trained Soul ID (degraded mode, §9.2) — allowed only for `dna_onboarding`-purpose jobs (generating the turnaround sheet itself, before Soul ID exists yet), **never** for a `production`-purpose Mission job; this is enforced as a hard precondition check, not a soft warning, because shipping "Character Lock" without the lock mechanism actually engaged would violate the FSD's core promise.

**Recovery Strategy**: a `production` Mission referencing a Character DNA without a completed Soul ID training fails Mission validation at creation time (Mission Composer, FSD §10) — the failure is prevented before any job is even created, the strongest possible recovery strategy (don't allow the invalid state to exist).

## 16. Brand DNA Engine

**Purpose**: Supply brand-level guardrails consumed by both the Prompt Engine (Brand DNA module, §13) and the QC Engine (Brand Compliance check, §21) — the umbrella identity layer above individual Product/Character DNA records.

**Responsibilities**: version management (mirrors Product/Character DNA versioning), exposing a resolved "active brand guardrail set" (palette, typography rules, tone, standard negative exclusions) to any caller by brand ID + optional version pin.

**Input**: `{ brandDnaId, version? }` (omitted version resolves to current-approved). **Output**: `{ palette, typographyRules, toneDescriptors, negativeConstraints, logoAssetRef }`.

**Dependencies**: `db` only — no external service calls, simplest engine in the system.

**Data Flow**: straightforward version-resolve + return; the only non-trivial responsibility is validating a new version's completeness (at least one palette value, one tone descriptor — FSD §30) before allowing `approved` status.

**Failure Cases**: brand referenced by a Mission/Product/Character DNA that has since been superseded without the referencing record being updated (a versioning-discipline gap, not a runtime bug) — Brand DNA resolution always defaults to "the version that was current at the time the referencing DNA record itself was approved" (stored explicitly as a foreign key to a specific `brand_dna_versions` row, never "latest"), so this failure case is structurally prevented rather than handled reactively.

**Recovery Strategy**: n/a beyond the above — this engine has no external dependency to fail, and its data-integrity guarantees are enforced by foreign-key design rather than runtime error handling.
