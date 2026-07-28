"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, DonutChart } from "@aaf/ui";
import type { StorageUsageSummary } from "@aaf/core/analytics";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(1)} ${units[exponent]}`;
}

/**
 * FSD §8: "Storage Usage chart: donut chart, used vs. quota, breakdown by
 * company/project." + "Input Fields: ... Company/Project filter for
 * Storage Usage chart (default: all)."
 */
export function StorageUsageChart({ initial }: { initial: StorageUsageSummary }) {
  const [company, setCompany] = useState<string>("");
  const [usage, setUsage] = useState<StorageUsageSummary>(initial);
  const [error, setError] = useState(false);

  const companies = [...new Set(initial.byProject.map((p) => p.company))];

  useEffect(() => {
    if (!company) {
      setUsage(initial);
      return;
    }

    const controller = new AbortController();
    setError(false);
    fetch(`/api/dashboard/storage-usage?company=${encodeURIComponent(company)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: StorageUsageSummary) => setUsage(body))
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      });

    return () => controller.abort();
  }, [company, initial]);

  const donutData = [
    { label: "Used", value: usage.totalBytes },
    { label: "Free", value: Math.max(0, usage.quotaBytes - usage.totalBytes) },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Storage Usage</CardTitle>
        {companies.length > 1 && (
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-slate-500">
            <p>Failed to load storage usage.</p>
            <button type="button" onClick={() => setCompany((c) => c)} className="text-blue-600 hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <>
            <DonutChart data={donutData} valueFormatter={formatBytes} />
            <p className="mt-2 text-center text-sm text-slate-600">
              {formatBytes(usage.totalBytes)} / {formatBytes(usage.quotaBytes)} ({usage.usagePct}%)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
