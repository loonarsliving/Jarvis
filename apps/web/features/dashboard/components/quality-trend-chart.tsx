"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, TrendLineChart } from "@aaf/ui";
import type { QualityTrendSeriesPoint } from "@aaf/core/analytics";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/**
 * FSD §8: "Quality Analytics chart: line chart, QC pass rate over last 30
 * days, split by dimension (Product Fidelity / Character Fidelity /
 * Technical / Brand Compliance)." + "Input Fields: Date-range selector for
 * the Quality Analytics chart (default: last 30 days)." Client component
 * so the date-range selector can refetch `/api/dashboard/quality-trend`
 * without a full page reload — `initialTrend` is server-rendered (FSD §8
 * default range) to avoid an empty-state flash on first paint.
 */
export function QualityTrendChart({ initialTrend }: { initialTrend: QualityTrendSeriesPoint[] }) {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [trend, setTrend] = useState<QualityTrendSeriesPoint[]>(initialTrend);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (rangeDays === 30) {
      setTrend(initialTrend);
      return;
    }

    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    setLoading(true);
    setError(false);
    fetch(`/api/dashboard/quality-trend?from=${from.toISOString()}&to=${to.toISOString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((body: { trend: QualityTrendSeriesPoint[] }) => setTrend(body.trend))
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [rangeDays, initialTrend]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Quality Analytics</CardTitle>
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
      </CardHeader>
      <CardContent>
        {/* Panel-level failure isolation (FSD §8 "Error States": "If a
            panel's query fails, that panel shows an inline retry button;
            the rest of the dashboard still renders."). */}
        {error ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-sm text-slate-500">
            <p>Failed to load quality trend.</p>
            <button type="button" onClick={() => setRangeDays((d) => d)} className="text-blue-600 hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <TrendLineChart
            data={trend}
            xKey="date"
            yDomain={[0, 100]}
            series={[
              { key: "productFidelity", label: "Product Fidelity" },
              { key: "characterFidelity", label: "Character Fidelity" },
              { key: "technicalQuality", label: "Technical" },
              { key: "brandCompliance", label: "Brand Compliance" },
            ]}
            className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}
          />
        )}
      </CardContent>
    </Card>
  );
}
