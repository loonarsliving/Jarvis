import { NextResponse } from "next/server";
import { dateRangeInputSchema, getQcAnalyticsSummary, QUALITY_TREND_DEFAULT_RANGE_DAYS } from "@aaf/core/analytics";
import { requirePermission } from "../../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { withApiErrorHandling } from "../../../../lib/analytics/handlers";

export const dynamic = "force-dynamic";

/**
 * QC Analytics page (FSD §07 wireframe `/qc/analytics`) — trend, failure
 * category breakdown, top templates, repeated-rejection alerts. Not named
 * explicitly with a `GET /api/...` contract in FSD §8 (that section only
 * lists the Main Dashboard's three routes) — added following the same
 * shape/convention since the QC Analytics page needs the same
 * server-rendered-then-client-refetchable pattern for its date range.
 */
export async function GET(request: Request) {
  return withApiErrorHandling(async () => {
    await requirePermission("analytics.view");

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - QUALITY_TREND_DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    const range = dateRangeInputSchema.parse({
      from: searchParams.get("from") ?? defaultFrom.toISOString(),
      to: searchParams.get("to") ?? now.toISOString(),
    });

    const supabase = await createSupabaseServerClient();
    const summary = await getQcAnalyticsSummary(supabase, range);
    return NextResponse.json(summary);
  });
}
