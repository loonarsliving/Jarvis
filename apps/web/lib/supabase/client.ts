"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — anon key only, session via httpOnly cookies
 * managed by middleware.ts (TDD §27 "no client-side token storage").
 * `NEXT_PUBLIC_*` is required here because this module is bundled for the
 * client; the server-side `SUPABASE_URL`/`SUPABASE_ANON_KEY` values from
 * packages/core/config are not usable in the browser bundle.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
