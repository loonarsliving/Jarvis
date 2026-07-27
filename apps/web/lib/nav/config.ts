import type { Permission, Role } from "@aaf/core/rbac";
import { roleHasPermission } from "@aaf/core/rbac";

/**
 * Sidebar structure — verbatim from FSD §9. `requiredPermission: null` means
 * visible to any authenticated role (e.g. Dashboard, or Identity's
 * read-only view since `dna.view` is granted broadly per FSD §7 — modeled
 * explicitly below rather than left implicit).
 *
 * "Owned by Agent X" placeholder pages (below, in app/(app)/...) are the
 * ONLY content behind these routes in this Sprint — Agent 1 scaffolds
 * routing + layout only, per Engineering Constitution Article VIII.
 */
export interface NavLeaf {
  label: string;
  href: string;
  requiredPermission: Permission | null;
}

export interface NavSection {
  label: string;
  href: string;
  requiredPermission: Permission | null;
  children?: NavLeaf[];
}

export const NAV_SECTIONS: NavSection[] = [
  { label: "Dashboard", href: "/dashboard", requiredPermission: "analytics.view" },
  {
    label: "Missions",
    href: "/missions",
    requiredPermission: "mission.view_all",
    children: [
      { label: "All Missions", href: "/missions", requiredPermission: "mission.view_all" },
      { label: "New Mission", href: "/missions/new", requiredPermission: "mission.create" },
      { label: "Mission Templates", href: "/missions/templates", requiredPermission: "mission.view_all" },
    ],
  },
  {
    label: "Asset Library",
    href: "/asset-library",
    requiredPermission: "asset.view_approved",
    children: [
      { label: "Browse / Search", href: "/asset-library", requiredPermission: "asset.view_approved" },
      { label: "Pending Review", href: "/asset-library/pending-review", requiredPermission: "qc.review" },
      {
        label: "Rejected / Archive",
        href: "/asset-library/rejected",
        requiredPermission: "asset.view_rejected",
      },
    ],
  },
  {
    label: "Identity (DNA)",
    href: "/identity",
    requiredPermission: "dna.view",
    children: [
      { label: "Brand DNA", href: "/identity/brand", requiredPermission: "dna.view" },
      { label: "Product DNA", href: "/identity/product", requiredPermission: "dna.view" },
      { label: "Character DNA", href: "/identity/character", requiredPermission: "dna.view" },
    ],
  },
  {
    label: "Prompt Engine",
    href: "/prompts",
    requiredPermission: "dna.view",
    children: [
      { label: "Template Library", href: "/prompts/templates", requiredPermission: "dna.view" },
      { label: "Prompt History", href: "/prompts/history", requiredPermission: "dna.view" },
    ],
  },
  {
    label: "Quality Control",
    href: "/qc",
    requiredPermission: "analytics.view",
    children: [
      { label: "Review Console", href: "/qc/review", requiredPermission: "qc.review" },
      { label: "QC Analytics", href: "/qc/analytics", requiredPermission: "analytics.view" },
    ],
  },
  { label: "Render Queue", href: "/queue", requiredPermission: "mission.view_all" },
  { label: "Google Drive", href: "/drive", requiredPermission: "analytics.view" },
  {
    label: "Settings",
    href: "/settings",
    // Visible if EITHER is granted (FSD §9: "hidden entirely unless
    // integration.manage or user.manage") — see isSectionVisible below,
    // which special-cases this OR semantics.
    requiredPermission: "integration.manage",
    children: [
      { label: "Integrations", href: "/settings/integrations", requiredPermission: "integration.manage" },
      { label: "Users & Roles", href: "/settings/users", requiredPermission: "user.manage" },
      { label: "System Logs", href: "/settings/logs", requiredPermission: "user.manage" },
    ],
  },
];

/**
 * Client-side visibility check ONLY — this is the FSD §9 "hide Settings
 * unless the user has the relevant permission" UX affordance, not a
 * security boundary. The real enforcement is requirePermission() (TDD §28
 * layer 1) inside every Server Action, backstopped by RLS (layer 2). A
 * user who forges a request to a hidden route is stopped by those layers,
 * not by this function.
 */
export function isNavItemVisible(role: Role, item: { requiredPermission: Permission | null }): boolean {
  if (item.requiredPermission === null) return true;
  if (item.requiredPermission === "integration.manage") {
    // Settings section special case (FSD §9 OR semantics).
    return roleHasPermission(role, "integration.manage") || roleHasPermission(role, "user.manage");
  }
  return roleHasPermission(role, item.requiredPermission);
}
