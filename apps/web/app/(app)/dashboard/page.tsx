import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@aaf/ui";
import {
  getDashboardSummary,
  getQualityTrend,
  getStorageUsageSummary,
  QUALITY_TREND_DEFAULT_RANGE_DAYS,
  type DashboardSummary,
  type QualityTrendSeriesPoint,
  type StorageUsageSummary,
} from "@aaf/core/analytics";
import { PermissionDeniedError } from "@aaf/core/rbac";
import { requirePermission } from "../../../lib/auth/guard";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { KpiStrip } from "../../../features/dashboard/components/kpi-strip";
import { MissionProgressPanel } from "../../../features/dashboard/components/mission-progress-panel";
import { RenderQueueAlertsPanel } from "../../../features/dashboard/components/render-queue-alerts-panel";
import { QualityTrendChart } from "../../../features/dashboard/components/quality-trend-chart";
import { StorageUsageChart } from "../../../features/dashboard/components/storage-usage-chart";
import { FreshnessBadge } from "../../../features/dashboard/components/freshness-badge";

export const dynamic = "force-dynamic";

const EMPTY_STORAGE_USAGE: StorageUsageSummary = {
  totalBytes: 0,
  quotaBytes: 0,
  usagePct: 0,
  capturedAt: new Date(0).toISOString(),
  byProject: [],
};

/**
 * Main Dashboard (FSD §8) — "Single-screen operational overview of the
 * entire factory." 4-zone grid: KPI strip, Mission Progress (left, 60%),
 * Render Queue + Alerts (right, 40%), Storage Usage + Quality Analytics
 * (bottom row).
 *
 * Each of the three data groups (summary / quality trend / storage usage)
 * is fetched and error-isolated independently (FSD §8 "Error States": "If
 * a panel's query fails, that panel shows an inline retry button; the rest
 * of the dashboard still renders.") — a failure in one (e.g. because
 * another agent's table doesn't exist yet in this isolated worktree) never
 * blocks the rest of the page.
 */
export default async function DashboardPage() {
  try {
    await requirePermission("analytics.view");
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }

  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - QUALITY_TREND_DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  const [summaryResult, trendResult, storageResult] = await Promise.allSettled([
    getDashboardSummary(supabase),
    getQualityTrend(supabase, { from: defaultFrom, to: now }),
    getStorageUsageSummary(supabase),
  ]);

  const summary: DashboardSummary | null = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const trend: QualityTrendSeriesPoint[] = trendResult.status === "fulfilled" ? trendResult.value : [];
  const storage: StorageUsageSummary = storageResult.status === "fulfilled" ? storageResult.value : EMPTY_STORAGE_USAGE;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          {summary && <FreshnessBadge aggregatedAsOf={summary.aggregatedAsOf} isStale={summary.isStale} />}
        </div>
        <div className="flex gap-2">
          <Link
            href="/missions/new"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Buat Mission Baru
          </Link>
          <Link
            href="/missions"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Lihat Semua Mission
          </Link>
        </div>
      </div>

      {summary ? (
        <KpiStrip kpis={summary.kpis} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>KPI Strip</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            Failed to load. This is expected in an isolated worktree before other agents' tables (missions,
            generation_jobs, assets, qc_reports, storage_usage_snapshots) are merged — see
            packages/core/src/analytics/README.md.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {summary ? (
            <MissionProgressPanel missions={summary.missionProgress} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Mission Progress</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-500">Failed to load.</CardContent>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          {summary ? (
            <RenderQueueAlertsPanel queue={summary.renderQueue} alerts={summary.alerts} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Render Queue / Alerts</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-500">Failed to load.</CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StorageUsageChart initial={storage} />
        <QualityTrendChart initialTrend={trend} />
      </div>
    </div>
  );
}
