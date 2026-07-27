import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config/index.js";

/**
 * Minimal typed-DB surface. Full generated types (`supabase gen types
 * typescript` per TDD §7.1) land in `database.types.ts` once the schema is
 * live in a running Supabase instance — this Sprint ships the migrations
 * that generation depends on, plus this placeholder so `@aaf/core/db`
 * exports a stable shape other agents' repository functions can build on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- placeholder until `supabase gen types` runs against a live schema (TDD §7.1); narrowed by each repository function's own return type at the call site.
export type Database = any;

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Service-role client — bypasses RLS by design (TDD §27 "service-to-service
 * auth"). Used by workers and by `web`'s server-side admin actions. Never
 * pass this client's result to an unauthenticated/unauthorized surface.
 */
export function createServiceRoleClient(config: AppConfig): TypedSupabaseClient {
  return createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anonymous/session-bound client for use in `web` request contexts where
 * the caller must run under the authenticated user's RLS context (TDD
 * §7.1) rather than the service role. `accessToken` is the user's Supabase
 * session JWT (see `apps/web/lib/supabase/server.ts`).
 */
export function createUserScopedClient(config: AppConfig, accessToken?: string): TypedSupabaseClient {
  return createClient<Database>(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
