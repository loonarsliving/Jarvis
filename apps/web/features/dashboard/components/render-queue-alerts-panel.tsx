import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@aaf/ui";
import type { AlertItem, RenderQueueSummary } from "@aaf/core/analytics";

const SEVERITY_VARIANT: Record<AlertItem["severity"], "neutral" | "warning" | "danger" | "info"> = {
  info: "info",
  warning: "warning",
  critical: "danger",
};

function formatAge(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * FSD §8: "Render Queue panel: current queue depth, jobs
 * queued/running/retrying/dead_letter, oldest-job age." + "Alerts panel:
 * system health flags ... Alert row action 'Selesaikan' ... navigates to
 * the relevant queue/detail filtered to the failing items. No direct
 * mutation from the dashboard itself." — every action here is a `<Link>`,
 * never a Server Action, per this agent's read-only boundary.
 */
export function RenderQueueAlertsPanel({ queue, alerts }: { queue: RenderQueueSummary; alerts: AlertItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Render Queue / Alerts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs text-slate-500">Queued</span>
            <span className="font-semibold text-slate-900">{queue.queued}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Running</span>
            <span className="font-semibold text-slate-900">{queue.running}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Retrying</span>
            <span className="font-semibold text-slate-900">{queue.retrying}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Dead-letter</span>
            <span className="font-semibold text-slate-900">{queue.deadLetter}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Oldest queued job age: {formatAge(queue.oldestQueuedJobAgeSeconds)}</p>

        <div className="flex flex-col gap-2">
          {alerts.length === 0 && <p className="text-sm text-slate-500">No active alerts.</p>}
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2">
              <div className="flex items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
                <span className="text-sm text-slate-700">{alert.message}</span>
              </div>
              <Link href={alert.href} className="text-xs font-medium text-blue-600 hover:underline">
                Selesaikan
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
