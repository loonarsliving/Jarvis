import "server-only";
import { createSupabaseServerClient } from "../supabase/server";
import type { Role } from "@aaf/core/rbac";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

/**
 * Resolves the current request's authenticated user + role, joining
 * `auth.users` (via the session) to the `users`/`roles` tables (migration
 * 0003). Returns `null` when unauthenticated — callers decide whether that's
 * an error (most pages: redirect, already handled by middleware.ts) or a
 * legitimate state (the /login page itself).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: row } = await supabase
    .from("users")
    .select("id, email, full_name, roles(key)")
    .eq("id", user.id)
    .single();

  if (!row) return null;

  // roles(key) comes back as an object via the FK join; narrow defensively
  // since this is queried against the `Database = any` placeholder type
  // (packages/core/src/db/client.ts) until `supabase gen types` runs.
  const roleKey = (row as { roles?: { key?: string } }).roles?.key;
  if (!roleKey) return null;

  return {
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    role: roleKey as Role,
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
