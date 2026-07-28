import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@aaf/ui";
import type { MissionProgressItem } from "@aaf/core/analytics";

const STATUS_BADGE_VARIANT: Record<MissionProgressItem["status"], "neutral" | "success" | "warning" | "danger" | "info"> = {
  queued: "neutral",
  running: "info",
  paused: "warning",
  completed: "success",
  completed_with_failures: "warning",
  cancelled: "danger",
};

/**
 * FSD §8: "Mission Progress panel: list of active missions with progress
 * bar (X of Y assets complete), status chip
 * (queued/running/paused/completed/failed), quick-link to Mission Detail."
 * Reads from `mission_summary_mv` only (see `@aaf/core/analytics`'s
 * `getMissionProgress`) — never a live join, per NFR-6.
 */
export function MissionProgressPanel({ missions }: { missions: MissionProgressItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mission Progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {missions.length === 0 && <p className="text-sm text-slate-500">No active missions.</p>}
        {missions.map((mission) => {
          const pct = mission.jobsTotal > 0 ? Math.round((mission.jobsCompleted / mission.jobsTotal) * 100) : 0;
          return (
            <Link
              key={mission.missionId}
              href={`/missions/${mission.missionId}`}
              className="flex flex-col gap-1.5 rounded-md border border-slate-200 p-3 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-900">{mission.name}</span>
                <Badge variant={STATUS_BADGE_VARIANT[mission.status]}>{mission.status}</Badge>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-slate-500">
                {mission.jobsCompleted} of {mission.jobsTotal} assets complete — {mission.approvedAssets} approved,{" "}
                {mission.rejectedAssets} rejected, {mission.pendingReviewAssets} pending
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
