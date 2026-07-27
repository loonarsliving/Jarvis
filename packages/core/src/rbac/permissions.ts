/**
 * Permission keys and the role/permission matrix — verbatim from
 * docs/ai-asset-factory/fsd/00-executive-objectives-requirements.md §7.
 * This is FSD-owned POLICY; this file is the typed mirror of it, not a
 * reinterpretation. If the FSD table changes, this file changes to match —
 * never the other way around (Constitution Article I).
 *
 * The matrix here is also the seed data for `role_permissions`
 * (infra/supabase/migrations/0002_roles_permissions.sql) — the two must
 * stay in lockstep; the migration is the runtime source of truth (data,
 * not code, per TDD §28 "data-driven, not hardcoded"), this constant is
 * for compile-time typing/client-side gating convenience only.
 */

export const ROLES = [
  "super_admin",
  "production_manager",
  "creative_director",
  "qc_reviewer",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "mission.create",
  "mission.view_all",
  "mission.cancel",
  "mission.retry",
  "dna.create",
  "dna.approve_version",
  "dna.view",
  "prompt_template.edit",
  "prompt_template.promote",
  "qc.review",
  "qc.override_lock_failure",
  "asset.view_approved",
  "asset.view_rejected",
  "asset.archive",
  "integration.manage",
  "user.manage",
  "analytics.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** FSD §7 matrix, transcribed exactly. Kept in sync with the seed migration. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [...PERMISSIONS],
  production_manager: [
    "mission.create",
    "mission.view_all",
    "mission.cancel",
    "mission.retry",
    "dna.view",
    "asset.view_approved",
    "asset.view_rejected",
    "asset.archive",
    "analytics.view",
  ],
  creative_director: [
    "mission.view_all",
    "dna.create",
    "dna.approve_version",
    "dna.view",
    "prompt_template.edit",
    "prompt_template.promote",
    "qc.override_lock_failure",
    "asset.view_approved",
    "asset.view_rejected",
    "analytics.view",
  ],
  qc_reviewer: [
    "mission.view_all",
    "dna.view",
    "qc.review",
    "asset.view_approved",
    "asset.view_rejected",
    "analytics.view",
  ],
  viewer: ["mission.view_all", "dna.view", "asset.view_approved", "analytics.view"],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * `qc.override_lock_failure` is the single most consequential permission in
 * the system (FSD §7) — bypasses the Product/Character Lock hard gate
 * (Constitution Article II.4). Call sites that grant it MUST require a
 * non-empty `justification` and MUST notify every Super Admin
 * (`onCriticalEvent` in `@aaf/core/audit`) — enforced structurally by
 * `requirePermission`'s `justification` parameter below, not left to each
 * caller to remember.
 */
export const MANDATORY_JUSTIFICATION_PERMISSIONS: readonly Permission[] = [
  "qc.override_lock_failure",
];
