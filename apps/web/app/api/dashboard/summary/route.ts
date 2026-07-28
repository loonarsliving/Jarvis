import { NextResponse } from "next/server";
import { getDashboardSummary } from "@aaf/core/analytics";
import { requirePermission } from "../../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { withApiErrorHandling } from "../../../../lib/analytics/handlers";

export const dynamic = "force-dynamic";

/**
 * FSD §8 "API Requirements": `GET /api/dashboard/summary`. Backs the KPI
 * strip, Mission Progress panel, Render Queue/Alerts panel. Reads under the
 * requesting user's own RLS context (not service-role) — `analytics.view`
 * (TDD §28 layer 1) plus `mission_summary_mv`'s `authenticated` GRANT
 * (layer 2, `infra/supabase/migrations/0700_mission_summary_mv.sql`) are
 * the two independent gates.
 */
export async function GET() {
  return withApiErrorHandling(async () => {
    await requirePermission("analytics.view");
    const supabase = await createSupabaseServerClient();
    const summary = await getDashboardSummary(supabase);
    return NextResponse.json(summary);
  });
}
