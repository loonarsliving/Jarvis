"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Logout Server Action, bound directly to a <form action={...}> (TDD §29.1
 * Server Actions for human-initiated mutations). Clears the Supabase
 * session cookie via the SSR client, then redirects to /login.
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
