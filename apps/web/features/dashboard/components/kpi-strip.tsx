import { Card, CardContent, CardHeader, CardTitle } from "@aaf/ui";
import type { KpiStrip as KpiStripData } from "@aaf/core/analytics";

/**
 * FSD §8: "KPI Strip: Active Missions, Assets Generated Today, Pending
 * Review, QC Pass Rate (7d), Google Drive Usage %." A pure render of
 * already-fetched data — the page (`apps/web/app/(app)/dashboard/page.tsx`)
 * owns fetching via `getDashboardSummary`.
 */
export function KpiStrip({ kpis }: { kpis: KpiStripData }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Active Missions", value: kpis.activeMissions.toLocaleString() },
    { label: "Assets Today", value: kpis.assetsGeneratedToday.toLocaleString() },
    { label: "Pending Review", value: kpis.pendingReview.toLocaleString() },
    { label: "QC Pass Rate (7d)", value: `${kpis.qcPassRate7d}%` },
    { label: "Google Drive Usage", value: `${kpis.driveUsagePct}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
