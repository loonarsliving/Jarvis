import { Badge } from "@aaf/ui";

/**
 * FSD §8 "Error States": "If aggregation data is stale (>15 min old), show
 * a subtle 'data as of HH:MM' badge rather than blocking the page."
 */
export function FreshnessBadge({ aggregatedAsOf, isStale }: { aggregatedAsOf: string; isStale: boolean }) {
  const time = new Date(aggregatedAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (!isStale) {
    return <span className="text-xs text-slate-400">data as of {time}</span>;
  }

  return <Badge variant="warning">data as of {time} (stale)</Badge>;
}
