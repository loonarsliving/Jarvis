import { notFound } from "next/navigation";
import {
  getQcAnalyticsSummary,
  QUALITY_TREND_DEFAULT_RANGE_DAYS,
  type QcAnalyticsSummary,
} from "@aaf/core/analytics";
import { PermissionDeniedError } from "@aaf/core/rbac";
import { requirePermission } from "../../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { QcAnalyticsPanels } from "../../../../features/qc-analytics/components/qc-analytics-panels";

export const dynamic = "force-dynamic";

const EMPTY_SUMMARY: QcAnalyticsSummary = {
  trend: [],
  failureBreakdown: [],
  topTemplates: [],
  repeatedRejections: [],
};

/**
 * QC Analytics (`/qc/analytics`, FSD §07 wireframe) — owned by Agent 7.
 * Coordinates with Agent 6, which owns the sibling `/qc/review` Review
 * Console route (`apps/web/app/(app)/qc/review/page.tsx`) — this file only
 * touches the `/analytics` subpath, per this agent's task brief.
 */
export default async function QcAnalyticsPage() {
  try {
    await requirePermission("analytics.view");
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const from = new Date(now.getTime() - QUALITY_TREND_DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  let summary = EMPTY_SUMMARY;
  try {
    summary = await getQcAnalyticsSummary(supabase, { from, to: now });
  } catch {
    // TODO(integration): qc_reports doesn't exist yet in this isolated
    // worktree (owned by Agent 6) — expected until merged. Renders the
    // empty state rather than crashing the page.
  }

  return <QcAnalyticsPanels initial={summary} />;
}
