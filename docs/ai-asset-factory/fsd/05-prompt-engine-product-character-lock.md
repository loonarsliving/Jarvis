# FSD §26–32: AI Prompt Workflow, Prompt Versioning, Product Lock, Character Lock, Brand/Product/Character DNA Workflow

## 26. AI Prompt Workflow

Every Generation Job's prompt is assembled, never hand-typed for standard production (per FR-2). The Prompt Engine composes a prompt from **independent DNA modules**, each contributing its slice, combined by a Prompt Template that defines composition order and which modules are mandatory/optional for a given asset class.

### Modular DNA Components

| Module | Contributes | Source |
|---|---|---|
| **Brand DNA** | Tone, mood, brand color palette, brand typography rules, overall visual style guardrails | Brand DNA record (§30) |
| **Product DNA** | Exact product identity: shape, color, logo, packaging, canonical reference image binding | Product DNA record (§31) |
| **Character DNA** | Exact character identity: face, hair, body, outfit defaults, Higgsfield Soul ID binding | Character DNA record (§32) |
| **Scene DNA** | Environment/setting description (studio white, bathroom, villa exterior, lifestyle context) | Prompt Template variation slot |
| **Camera DNA** | Angle, shot type, lens/focal-length style (Higgsfield Cinema Studio parameters) | Prompt Template variation slot |
| **Lighting DNA** | Lighting setup description (three-point studio, golden hour, moody interior) | Prompt Template variation slot |
| **Motion DNA** | (video only) camera movement, subject movement intensity | Prompt Template variation slot |
| **Negative Prompt** | Explicit exclusions — merged from Brand/Product/Character DNA's own negative constraints + template-level standard exclusions (generic artifacts) | Aggregated from all referenced DNA + template |
| **Consistency Prompt** | A restated, verbatim identity-anchor phrase (per Master Planning `02-research-market.md` §3 finding on Google Veo's documented technique) repeated regardless of scene variation, so identity is never left implicit | Derived automatically from Product/Character DNA at assembly time |

### Assembly Order (fixed, per template)
```
[Consistency Prompt / Identity Header]
[Brand DNA guardrails]
[Product DNA / Character DNA descriptors]
[Scene DNA]
[Camera DNA]
[Lighting DNA]
[Motion DNA] (video only)
[Negative Prompt]
```

This mirrors the structure already specified in Master Planning `04-prompt-engine.md` §2 and `03-consistency-framework.md` §5, now made concrete as a system component rather than a conceptual pattern.

### Reference Binding
In parallel to the text prompt, the Prompt Engine outputs role-tagged reference bindings sent to the Higgsfield Integration Layer: `character_ref` (Soul ID reference), `product_ref` (canonical image), `style_ref` (Brand DNA mood reference, optional). This is the "role-tagged reference as universal primitive" pattern identified as the strongest cross-platform convergent practice in Master Planning `02-research-market.md` §4.

### Page: Prompt Preview (embedded in Mission Composer, read-only)
- **Purpose**: Let the Mission creator see exactly what will be sent to Higgsfield before launching, without allowing free-form edits that would bypass template governance.
- **Components**: assembled prompt text (read-only, syntax-highlighted by module), reference bindings list with thumbnails, "Minta Perubahan Template" link (routes to Creative Director, does not allow inline edit).
- **Permissions**: visible to whoever can reach Mission Composer; editing the underlying template requires `prompt_template.edit`.

## 27. Prompt Versioning Workflow

### Page: Template Library (`/prompts/templates`)
- **Purpose**: Manage the lifecycle of Prompt Templates as governed, versioned artifacts (per Master Planning `04-prompt-engine.md` §4).
- **UI Layout**: List of templates grouped by asset class (Hero Shot, Lifestyle, UGC-style, Turnaround/Character Sheet, Social Vertical), each with current production version badge.
- **Buttons**:
  - `Buat Draft Baru` — clones current production version as an editable draft. **DB changes**: new `prompt_templates` row, `status='draft'`, `parent_version` set.
  - `Uji terhadap Regression Set` — **Click behavior**: runs the draft against a fixed set of reference Brief+DNA combinations with known-good QC history. **Background process**: submits test generation jobs (flagged `is_test=true`, does not count toward any Mission, does not consume production quota accounting though it does consume Higgsfield credits — cost is shown before confirming). **Success state**: shows comparative QC score summary (draft vs. current production). **Failure state**: if draft's aggregate score is lower, promotion is blocked with an explicit warning (can still be overridden by `prompt_template.promote` holders, logged as a deliberate override).
  - `Promosikan ke Production` — enabled only after a regression test has run; sets draft `status='production'`, demotes previous production version to `deprecated` (never deleted). Logged as `prompt_template.promoted`.
  - `Rollback ke Versi Sebelumnya` — reactivates a `deprecated` version as `production`. Available at any time (emergency use), logged as `prompt_template.rollback`.
- **Permissions**: view open broadly; edit/promote/rollback require `prompt_template.edit` / `prompt_template.promote`.
- **Database Tables**: `prompt_templates`, `prompt_template_versions`, `regression_test_runs`.

### Prompt History
Every Generation Job stores its fully-assembled final prompt verbatim (not just references to template+DNA IDs) — this is non-negotiable for provenance (FR-7) even though it's technically re-derivable, because DNA/template content can change over time and the historical record must reflect exactly what was sent at that moment. Visible on Asset Detail (§17) provenance panel.

### Prompt Score & Improvement (Closed Loop)
Implements Master Planning `04-prompt-engine.md` §5 as a concrete workflow:
1. Scheduled aggregator (daily) computes per-template average QC scores across recent assets.
2. Templates whose average drops below a configured threshold, or whose rejection rate exceeds a threshold, generate a flag surfaced on the Template Library page (`Performa menurun` badge) and a notification to Creative Director.
3. This is a **signal**, not an automatic edit — a human (Creative Director) decides whether/how to draft a revision; full automation of template rewriting is explicitly out of scope for v1 (noted as a Fase 4 concern in Master Planning `08-roadmap-risks.md`, revisit only once sufficient production data exists).

## 28. Product Lock Workflow

Implements Master Planning `03-consistency-framework.md` §3–4, made concrete:

1. **Reference image strategy**: Product DNA record's canonical reference (§31) is always attached as the `product_ref` binding, at maximum supported reference weight by default (per-product override allowed, §14.3).
2. **Multiple reference selection**: a Product DNA record may hold more than one canonical angle (e.g., front + three-quarter); the Prompt Engine selects the most scene-appropriate reference(s) based on the Camera DNA slot for that job (e.g., a "top-down flat lay" scene selects the flat-lay reference, not the angled hero shot).
3. **Prompt engineering**: identity descriptors (exact color, logo placement, material) are restated in the Consistency Prompt every single job, never assumed carried over.
4. **Identity locking**: enforced structurally (reference binding + restated descriptors), not left to chance.
5. **Negative prompting**: Product DNA's `negative_constraints` list (wrong logo, wrong proportions, extra text, old packaging) is always merged into the final Negative Prompt module.
6. **Consistency validation**: performed post-generation by the QC Engine's Product Fidelity check (Master Planning `05-quality-control.md` §2) — logo-region similarity, color-delta sampling, canonical-image similarity score.
7. **Automatic rejection**: any asset scoring below the Product Fidelity blocking threshold is `blocked`, never auto-approved, per §19.
8. **Product similarity scoring**: the numeric output of step 6, stored on `qc_reports`, is what powers both the blocking decision and the Prompt Engine's per-template performance signal (§27).

## 29. Character Lock Workflow

Implements Master Planning `03-consistency-framework.md` §3–4, using Higgsfield Soul ID as the concrete mechanism (§14.2):

1. **Face consistency**: guaranteed primarily by Soul ID persona reuse across all jobs referencing a given Character DNA version; validated post-generation by face-embedding similarity against the Character DNA's reference set.
2. **Hair consistency**: described explicitly in the Character DNA's restated descriptors (color, style, length) every job — Soul ID handles face structure, but hair styling can still drift under scene variation, so it is deliberately treated as a *prompt-level* lock, not assumed solved by the persona alone.
3. **Body consistency**: proportions/body type stated in Character DNA descriptors; validated qualitatively during human review rather than a hard automated score in v1 (automated body-proportion scoring is a known-hard, less mature technique per Master Planning research — flagged as a future QC enhancement, not a v1 blocker).
4. **Outfit consistency**: default outfit stored on Character DNA; Missions may specify an approved outfit variant (Character DNA can define a small allowed-variant set) — anything outside that set requires explicit Creative Director sign-off on the Mission itself.
5. **Age consistency**: stated explicitly as a locked descriptor in Character DNA (not left inferable), since generative models can drift a character's apparent age across generations without an explicit anchor.
6. **Expression consistency**: treated as a **deliberately varied** slot (part of Scene DNA), not locked — expression range is defined per Character DNA as an allowed set (e.g., "warm smile", "neutral confident", "candid laugh") so variation stays on-brand rather than unconstrained.
7. **Lighting consistency**: not locked at the character level — lighting is a Scene/Lighting DNA variable; what's locked is that the *character* must remain recognizable under whatever lighting the scene calls for, validated by QC using face-embedding similarity robust to lighting change.
8. **Pose diversity**: explicitly the *opposite* of a locked axis — Camera DNA and template variation slots are responsible for generating pose/angle diversity precisely so identity-lock isn't confused with "every asset looks identical." The system's success metric is "same identity, different pose/scene," not "same image repeated."
9. **Identity validation**: QC Engine's Character Fidelity check (face-embedding similarity + attribute checks for hair/age/outfit-set membership); below blocking threshold → `blocked`, same hard-gate rule as Product Lock, no automatic override.

## 30. Brand DNA Workflow

### Page: Brand DNA (`/identity/brand`)
- **Purpose**: Single source of truth for company/sub-brand visual identity guardrails (PT Maha Karya Haluoleo may operate multiple sub-brands, per Master Planning's observation of MK Connect serving multiple business lines — Villa, Beauty, etc.).
- **Components**: brand palette (HEX values), typography rules, tone/mood descriptors, standard negative exclusions, logo asset reference.
- **Buttons**: `Buat Brand Baru`, `Edit` (creates new version, per non-destructive versioning rule), `Setujui Versi` (Creative Director/Super Admin).
- **Validation Rules**: at least one HEX palette value and one tone descriptor required before a Brand DNA can be approved.
- **Permissions**: `dna.create`/`dna.approve_version` (Creative Director, Super Admin); read open to all.
- **Database Tables**: `brand_dna`, `brand_dna_versions`.
- **Future Expansion**: brand compliance auto-check calibration (adjusting Brand Compliance QC thresholds per brand).

## 31. Product DNA Workflow

### Page: Product DNA (`/identity/products`)
Full onboarding journey already specified in `01-dashboard-navigation-journey.md` Journey B. Page spec:
- **Purpose**: Create/manage the canonical identity record for every product that will appear in generated assets.
- **UI Layout**: List view (searchable) + Detail/Edit form.
- **Components**: intake form (name, SKU, brand link, color/typography/logo lock fields, negative constraints list, reference weight override), reference photo uploader, turnaround sheet generation panel, version history timeline.
- **Buttons**:
  - `Generate Turnaround Sheet` — **Click behavior**: submits a Higgsfield job producing a multi-angle studio reference grid from uploaded photos. **Validation**: at least 1 reference photo uploaded, minimum resolution enforced (reject uploads below a configured minimum, e.g., 1024px shortest side — poor reference quality is a documented failure driver per Master Planning `02-research-market.md`). **Background process**: standard Generation Job flow (§13), tagged `job_purpose='dna_onboarding'`. **DB changes**: `product_dna.status='generating_reference'`. **Notifications**: Creative Director notified when the turnaround sheet is ready for review.
  - `Setujui sebagai DNA` — locks version, `status='approved'`, becomes selectable in Mission Composer. Logged `dna.version_approved`.
  - `Tolak & Regenerasi` — discards this attempt (retained, not deleted, for audit), allows re-submission with adjusted photos/parameters.
  - `Buat Versi Baru` — only available on an already-`approved` record; starts a new version cycle without invalidating the current one until the new one is itself approved.
- **Permissions**: `dna.create`/`dna.approve_version`.
- **Database Tables**: `product_dna`, `product_dna_versions`, `product_dna_reference_images`.
- **Future Expansion**: bulk product intake (CSV + zipped reference photos) for catalog-scale onboarding.

## 32. Character DNA Workflow

### Page: Character DNA (`/identity/characters`)
Mirrors Product DNA structurally, with character-specific fields and the added Soul ID training step:
- **Components**: intake form (name/internal codename, role, face/hair/body/age descriptors, default outfit, allowed expression set, allowed outfit-variant set), reference photo uploader (multiple angles required — minimum count enforced, e.g., 5+, since Soul ID training quality depends on reference breadth per Master Planning `02-research-market.md` §3), turnaround sheet panel, Soul ID training status panel.
- **Buttons**:
  - `Generate Turnaround Sheet` — same mechanics as Product DNA's, produces a face/body multi-angle reference grid.
  - `Latih Soul ID` — **Click behavior**: submits the approved turnaround sheet + reference photos to Higgsfield's Soul ID training endpoint. **Background process**: asynchronous training job (may take longer than a standard generation job), tracked with its own status (`training_queued`/`training_running`/`training_complete`/`training_failed`). **DB changes**: `character_dna.higgsfield_soul_id` populated on success. **Notifications**: Creative Director notified on completion or failure. **Failure recovery**: training failure is retried per the same policy as §23 for transient causes; a persistent training failure blocks the DNA record from reaching `approved` (a Character DNA cannot be approved for production Missions without a successful Soul ID, since Character Lock structurally depends on it per §14.2/§29).
  - `Setujui sebagai DNA`, `Tolak & Regenerasi`, `Buat Versi Baru` — same semantics as Product DNA.
- **Validation Rules**: cannot approve a Character DNA version without both a reviewed turnaround sheet and a successfully trained Soul ID.
- **Permissions**: `dna.create`/`dna.approve_version`.
- **Database Tables**: `character_dna`, `character_dna_versions`, `character_dna_reference_images`, `soul_id_training_jobs`.
- **Future Expansion**: multi-character scene support (Higgsfield's documented up-to-3-consistent-characters capability, Master Planning `02-research-market.md` §1) — v1 Mission Composer supports single primary character per Mission; multi-character composition is a noted future expansion, not a v1 requirement.
