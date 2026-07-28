import { NextResponse } from "next/server";
import { dateRangeInputSchema, getQualityTrend, QUALITY_TREND_DEFAULT_RANGE_DAYS } from "@aaf/core/analytics";
import { requirePermission } from "../../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { withApiErrorHandling } from "../../../../lib/analytics/handlers";

export const dynamic = "force-dynamic";

/**
 * FSD §8 "API Requirements": `GET /api/dashboard/quality-trend`. Backs the
 * Quality Analytics line chart. `from`/`to` query params default to the
 * FSD-specified "last 30 days" and are Zod-validated against the 365-day
 * guard (`dateRangeInputSchema`, TDD §22's "keeping aggregation windows
 * bounded") before touching the database — TDD §26.4.
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
    const trend = await getQualityTrend(supabase, range);
    return NextResponse.json({ trend });
  });
}
