import { NextResponse } from "next/server";
import { storageUsageFilterSchema, getStorageUsageSummary } from "@aaf/core/analytics";
import { requirePermission } from "../../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { withApiErrorHandling } from "../../../../lib/analytics/handlers";

export const dynamic = "force-dynamic";

/**
 * FSD §8 "API Requirements": `GET /api/dashboard/storage-usage`. Backs the
 * Storage Usage donut chart. `company`/`project` query params match the
 * FSD §8 "Company/Project filter for Storage Usage chart (default: all)".
 */
export async function GET(request: Request) {
  return withApiErrorHandling(async () => {
    await requirePermission("analytics.view");

    const { searchParams } = new URL(request.url);
    const filter = storageUsageFilterSchema.parse({
      company: searchParams.get("company") ?? undefined,
      project: searchParams.get("project") ?? undefined,
    });

    const supabase = await createSupabaseServerClient();
    const usage = await getStorageUsageSummary(supabase, filter);
    return NextResponse.json(usage);
  });
}
