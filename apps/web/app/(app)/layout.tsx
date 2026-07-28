import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { Sidebar } from "../../components/nav/sidebar";
import { Topbar } from "../../components/nav/topbar";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  production_manager: "Production Manager",
  creative_director: "Creative Director",
  qc_reviewer: "QC Reviewer",
  viewer: "Viewer",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Belt-and-suspenders: middleware.ts already redirects unauthenticated
  // requests, this covers the case where the `users` row doesn't exist yet
  // (auth.users row created but not yet provisioned into `users`).
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userId={user.id} userEmail={user.email} roleLabel={ROLE_LABELS[user.role] ?? user.role} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
