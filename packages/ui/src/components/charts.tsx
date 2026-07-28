"use client";

/**
 * Chart primitives, added by Agent 7 (Dashboard & Analytics) — the first
 * and (per Constitution Article VIII) only consumer of charts in this
 * Sprint (Main Dashboard, QC Analytics, Google Drive Storage pages, FSD
 * §8/§07). `recharts` chosen as the charting library: lightweight,
 * composable with Tailwind (no separate theme system to fight, unlike
 * heavier suites), React-native SVG rendering (no canvas/WebGL dependency
 * this Mini-PC-class deployment doesn't need per the Bible's "no
 * unnecessary infrastructure" principle), and the most common choice in
 * the shadcn/Radix-adjacent ecosystem this project's `packages/ui` already
 * follows (`packages/ui/README.md`). Documented in `DECISIONS-agent7.md`
 * item 3.
 *
 * Per `packages/ui/README.md`'s own stated layering ("Composed components
 * ... owned by the agents whose features they belong to — not scaffolded
 * [by Agent 1], to avoid Agent 1 building business-shaped UI ahead of the
 * business logic that drives it"), these are intentionally generic/
 * data-shape-only (no knowledge of missions/assets/QC dimensions) so any
 * future agent's dashboard-shaped need can reuse them without reaching
 * into Agent 7's feature code.
 */
import * as React from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../lib/cn";

/**
 * Brand-neutral categorical palette (validated for adjacent-pair contrast) —
 * swap for a project-specific brand palette later; not specified in the FSD
 * wireframes beyond "donut chart" / "line chart" / "bar chart" shapes.
 */
export const CHART_COLORS = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#d97706", // amber-600
  "#dc2626", // red-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
] as const;

export interface DonutChartDatum {
  label: string;
  value: number;
}

export function DonutChart({
  data,
  className,
  valueFormatter = (v: number) => v.toLocaleString(),
}: {
  data: DonutChartDatum[];
  className?: string;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => valueFormatter(value)} />
          <Legend verticalAlign="bottom" height={36} />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TrendSeriesConfig {
  key: string;
  label: string;
  color?: string;
}

export function TrendLineChart<T extends object>({
  data,
  xKey,
  series,
  className,
  yDomain,
}: {
  data: T[];
  xKey: string;
  series: TrendSeriesConfig[];
  className?: string;
  yDomain?: [number, number];
}) {
  return (
    <div className={cn("h-72 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {/* recharts' own typings want `Record<string, unknown>[]`; `T` here
            is deliberately any caller-shaped readonly data object (e.g.
            `QualityTrendSeriesPoint`, which has no index signature by
            design — Constitution Article IV.1 "no `any`" favors a precise
            interface at the call site over a loosened index-signature
            type just to satisfy this wrapper). Narrowed once, here, at the
            chart-library boundary, not at every call site. */}
        <RechartsLineChart data={data as unknown as Record<string, unknown>[]} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip />
          <Legend />
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBarChart<T extends object>({
  data,
  xKey,
  yKey,
  className,
  color = CHART_COLORS[0],
}: {
  data: T[];
  xKey: string;
  yKey: string;
  className?: string;
  color?: string;
}) {
  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data as unknown as Record<string, unknown>[]} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
