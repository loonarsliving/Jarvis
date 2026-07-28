import { notFound } from "next/navigation";
import type { StorageUsageSummary } from "@aaf/core/analytics";
import { getStorageUsageSummary } from "@aaf/core/analytics";
import { PermissionDeniedError } from "@aaf/core/rbac";
import { requirePermission } from "../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { StorageUsagePanel } from "../../../features/drive/components/storage-usage-panel";

export const dynamic = "force-dynamic";

const EMPTY_STORAGE_USAGE: StorageUsageSummary = {
  totalBytes: 0,
  quotaBytes: 0,
  usagePct: 0,
  capturedAt: new Date(0).toISOString(),
  byProject: [],
};

/**
 * Google Drive — Storage & Sync Status (`/drive`, FSD §9 nav + §07
 * wireframe). Owned by Agent 7 in full — the FSD §9 sidebar lists this as
 * one leaf ("Google Drive -> Storage & Sync Status"), distinct from Asset
 * Library's own `/asset-library` route (Agent 5), so unlike `/qc/analytics`
 * there's no route-level split to coordinate here. (Previously scaffolded
 * as an Agent 5 placeholder by Agent 1 — the FSD/TDD ownership assignment
 * in Constitution Article VIII takes precedence; see DECISIONS-agent7.md
 * item 5.)
 */
export default async function DrivePage() {
  try {
    await requirePermission("analytics.view");
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }

  const supabase = await createSupabaseServerClient();

  let usage = EMPTY_STORAGE_USAGE;
  try {
    usage = await getStorageUsageSummary(supabase);
  } catch {
    // TODO(integration): storage_usage_snapshots doesn't exist yet in this
    // isolated worktree (owned by Agent 5) — expected until merged.
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Google Drive — Storage & Sync Status</h1>
      <StorageUsagePanel initial={usage} />
    </div>
  );
}
