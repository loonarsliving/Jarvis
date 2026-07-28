"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CategoryBarChart } from "@aaf/ui";
import type { StorageUsageSummary } from "@aaf/core/analytics";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(1)} ${units[exponent]}`;
}

/**
 * FSD §07 Google Drive Storage & Sync Status wireframe:
 *
 *   +-----------------------------------------------------------------+
 *   | Total Usage: 620 GB / 1 TB (62%)      [Refresh Sync Status]      |
 *   +---------------------------------+-------------------------------+
 *   | USAGE BY PROJECT (bar chart)     | RECONCILIATION FLAGS          |
 *   +---------------------------------+-------------------------------+
 *
 * The `/drive` route is entirely this agent's per the FSD §9 nav diagram
 * ("Google Drive -> Storage & Sync Status" is the whole section — Asset
 * Library browse/search lives at the separate `/asset-library` route
 * Agent 5 owns), unlike the split-route coordination needed for
 * `/qc/analytics` vs `/qc/review`.
 */
export function StorageUsagePanel({ initial }: { initial: StorageUsageSummary }) {
  const [usage, setUsage] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => setUsage(initial), [initial]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard/storage-usage");
      if (res.ok) setUsage(await res.json());
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Total Usage: {formatBytes(usage.totalBytes)} / {formatBytes(usage.quotaBytes)} ({usage.usagePct}%)
          </CardTitle>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh Sync Status"}
          </button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500">
            Last captured: {new Date(usage.capturedAt).toLocaleString()} — sourced from
            storage_usage_snapshots (append-only, written by Agent 5&apos;s drive-sync-worker after each
            Reconciliation Job run, TDD §7.4).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usage by Project</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.byProject.length === 0 ? (
              <p className="text-sm text-slate-500">No storage snapshots yet.</p>
            ) : (
              <>
                <CategoryBarChart data={usage.byProject.map((p) => ({ ...p, label: p.company }))} xKey="label" yKey="totalBytes" />
                <p className="mt-2 text-xs text-slate-500">
                  TODO(integration): storage_usage_snapshots (FSD §07 ERD) captures usage per-company only, not
                  per-project — bars above are company totals until Agent 5 adds project-level granularity. See
                  packages/core/src/analytics/README.md.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              No reconciliation-flags table is defined in the binding ERD
              (docs/ai-asset-factory/fsd/07-database-erd-dashboards.md) yet — the Reconciliation Job (TDD §8.6,
              owned by Agent 5) doesn&apos;t persist `storage_missing`/`unindexed_file` counts anywhere this agent
              can read today. Not fabricating a table for this per Constitution Article VI.1; escalate to Agent 5
              if/when that data becomes available.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
