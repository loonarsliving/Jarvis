import Link from "next/link";
import { Badge } from "@aaf/ui";
import { getUnreadNotificationCount } from "@aaf/core/notifications";
import { logoutAction } from "../../lib/auth/actions";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/**
 * `NotificationBell` is Agent 7's addition (Notification Center UI, FSD §9
 * "notification bell with unread badge") to Agent 1's topbar shell — the
 * rest of `Topbar` is unchanged. Kept as its own small async server
 * component so a failure resolving the unread count (e.g. `notifications`
 * table not yet reachable) can't take down the whole topbar; see
 * DECISIONS-agent7.md item 6.
 */
async function NotificationBell({ userId }: { userId: string }) {
  let unreadCount = 0;
  try {
    const supabase = await createSupabaseServerClient();
    unreadCount = await getUnreadNotificationCount(supabase, userId);
  } catch {
    // Fail quiet — the bell just shows no badge rather than breaking the topbar.
  }

  return (
    <Link href="/notifications" className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

export function Topbar({ userId, userEmail, roleLabel }: { userId: string; userEmail: string; roleLabel: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-400">Global search — owned by Agent 7 (Dashboard &amp; Analytics)</div>
      <div className="flex items-center gap-3">
        <NotificationBell userId={userId} />
        <Badge variant="neutral">{roleLabel}</Badge>
        <span className="text-sm text-slate-600">{userEmail}</span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
