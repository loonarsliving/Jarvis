"use client";

import { useEffect, useState } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, CategoryBarChart, TrendLineChart } from "@aaf/ui";
import type { QcAnalyticsSummary } from "@aaf/core/analytics";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/**
 * QC Analytics page (FSD §07 wireframe `/qc/analytics`):
 *
 *   +-----------------------------------------------------------------+
 *   | QC PASS RATE OVER TIME (line, 4 series: product/char/tech/brand) |
 *   +---------------------------------+-------------------------------+
 *   | FAILURE CATEGORY BREAKDOWN       | TOP TEMPLATES BY SCORE (table)|
 *   | (bar chart)                      |                                |
 *   +---------------------------------+-------------------------------+
 *   | DNA VERSIONS WITH REPEATED REJECTIONS (alert list)               |
 *   +-----------------------------------------------------------------+
 *
 * Client component with its own date-range selector, refetching
 * `/api/qc-analytics/summary`. `topTemplates`/`repeatedRejections` render
 * an honest empty state — see `@aaf/core/analytics`'s repository.ts
 * TODO(integration) for why those two aren't computed yet (cross-agent
 * joins not verifiable against real schemas in this worktree).
 */
export function QcAnalyticsPanels({ initial }: { initial: QcAnalyticsSummary }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [summary, setSummary] = useState<QcAnalyticsSummary>(initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (rangeDays === 30) {
      setSummary(initial);
      return;
    }

    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    setError(false);
    fetch(`/api/qc-analytics/summary?from=${from.toISOString()}&to=${to.toISOString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: QcAnalyticsSummary) => setSummary(body))
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      });

    return () => controller.abort();
  }, [rangeDays, initial]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">QC Analytics</h1>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setRangeDays(opt.days)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                rangeDays === opt.days ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>QC Pass Rate Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-slate-500">Failed to load trend data.</p>
          ) : (
            <TrendLineChart
              data={summary.trend}
              xKey="date"
              yDomain={[0, 100]}
              series={[
                { key: "productFidelity", label: "Product Fidelity" },
                { key: "characterFidelity", label: "Character Fidelity" },
                { key: "technicalQuality", label: "Technical" },
                { key: "brandCompliance", label: "Brand Compliance" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Failure Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.failureBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500">No QC failures in this range.</p>
            ) : (
              <CategoryBarChart data={summary.failureBreakdown} xKey="category" yKey="count" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Templates by Score</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.topTemplates.length === 0 ? (
              <p className="text-sm text-slate-500">
                Not yet available — requires a join across Agent 3&apos;s prompt_template_versions and Agent 6&apos;s
                qc_reports/asset_metadata (TODO(integration), see packages/core/src/analytics/repository.ts).
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-2">Template</th>
                    <th className="pb-2">Version</th>
                    <th className="pb-2">Avg QC Score</th>
                    <th className="pb-2">Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topTemplates.map((row) => (
                    <tr key={row.promptTemplateVersionId} className="border-t border-slate-100">
                      <td className="py-1.5">{row.templateSlug}</td>
                      <td className="py-1.5">v{row.version}</td>
                      <td className="py-1.5">{row.avgQcScore}</td>
                      <td className="py-1.5">{row.sampleSize}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DNA Versions with Repeated Rejections</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.repeatedRejections.length === 0 ? (
            <p className="text-sm text-slate-500">
              Not yet available — requires a join across Agent 3&apos;s product_dna_versions/character_dna_versions and
              Agent 6&apos;s reviews (TODO(integration)).
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.repeatedRejections.map((alert) => (
                <li key={alert.dnaVersionId} className="flex items-center gap-2 text-sm">
                  <Badge variant="warning">{alert.dnaType}</Badge>
                  <span>
                    {alert.dnaLabel} — {alert.rejectionCount} rejections in the last {alert.windowDays}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
