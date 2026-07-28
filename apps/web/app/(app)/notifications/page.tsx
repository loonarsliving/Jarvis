import { listNotifications } from "@aaf/core/notifications";
import { requireCurrentUser } from "../../../lib/auth/session";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { NotificationList } from "../../../features/notifications/components/notification-list";

export const dynamic = "force-dynamic";

/**
 * Notification Center UI (FSD §9). Not gated by `analytics.view` like the
 * rest of this agent's pages — every role has notifications about their
 * own actions/assignments, so this only requires authentication
 * (`requireCurrentUser`), same posture as `markNotificationReadAction`.
 */
export default async function NotificationsPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const notifications = await listNotifications(supabase, user.id);

  return (
    <div>
      <h1 className="px-6 pt-6 text-lg font-semibold text-slate-900">Notifications</h1>
      <NotificationList initial={notifications} />
    </div>
  );
}
