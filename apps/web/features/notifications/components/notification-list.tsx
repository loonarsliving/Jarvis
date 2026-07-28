"use client";

import { useState, useTransition } from "react";
import { Badge, Card, CardContent } from "@aaf/ui";
import type { NotificationRow } from "@aaf/core/notifications";
import { markNotificationReadAction } from "../actions/mark-read";

const CATEGORY_LABEL: Record<NotificationRow["category"], string> = {
  mission_completed: "Mission Completed",
  mission_completed_with_failures: "Mission Completed (with failures)",
  asset_flagged_for_review: "Asset Flagged for Review",
  dead_letter_alert: "Dead-letter Alert",
  drive_quota_warning: "Drive Quota Warning",
  dna_awaiting_approval: "DNA Awaiting Approval",
  critical_audit_event: "Critical Event",
  lock_override_used: "Lock Override Used",
};

/**
 * Notification Center (FSD §9: "Notifications (bell icon, top bar)").
 * `initial` is server-fetched (`apps/web/app/(app)/notifications/page.tsx`)
 * — this component only handles the one interactive affordance, marking a
 * notification read, via the `markNotificationReadAction` Server Action.
 */
export function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const [notifications, setNotifications] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const handleMarkRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    startTransition(async () => {
      await markNotificationReadAction({ notificationId: id });
    });
  };

  if (notifications.length === 0) {
    return <p className="p-6 text-sm text-slate-500">No notifications yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2 p-6">
      {notifications.map((n) => (
        <Card key={n.id} className={n.read ? "opacity-60" : undefined}>
          <CardContent className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={n.read ? "neutral" : "info"}>{CATEGORY_LABEL[n.category]}</Badge>
                <span className="text-sm font-medium text-slate-900">{n.title}</span>
              </div>
              {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
              <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {!n.read && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleMarkRead(n.id)}
                className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Mark read
              </button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
