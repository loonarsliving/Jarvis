import { Badge } from "@aaf/ui";
import { logoutAction } from "../../lib/auth/actions";

export function Topbar({ userEmail, roleLabel }: { userEmail: string; roleLabel: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-400">Global search — owned by Agent 7 (Dashboard &amp; Analytics)</div>
      <div className="flex items-center gap-3">
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
