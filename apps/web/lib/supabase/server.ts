import { cookies } from "next/headers";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import { getConfig } from "../config";

type CookieToSet = { name: string; value: string; options?: CookieOptionsWithName };

/**
 * Server Component / Server Action / Route Handler Supabase client, bound to
 * the current request's session cookies — runs under the authenticated
 * user's RLS context (TDD §7.1), NOT the service-role key. This is the
 * client Server Actions should use for user-facing reads/writes so RLS
 * layer-2 enforcement (TDD §28) actually applies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = getConfig();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (not a Route Handler/Server
          // Action) — cookies can't be written here. Safe to ignore as
          // long as middleware.ts also refreshes the session (it does).
        }
      },
    },
  });
}

/**
 * Service-role client for server-side admin actions (user provisioning,
 * worker-equivalent writes triggered from the UI) — bypasses RLS by design
 * (TDD §27). Every call site using this MUST call requirePermission()
 * first; RLS cannot backstop a service-role client.
 */
export async function createSupabaseServiceRoleClient() {
  const { createServiceRoleClient } = await import("@aaf/core/db");
  return createServiceRoleClient(getConfig());
}
