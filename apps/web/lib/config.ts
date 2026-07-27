import { loadConfig, type AppConfig } from "@aaf/core/config";

/**
 * Web's single call site for loadConfig() (TDD §31 — process.env is read in
 * exactly one place). Deliberately lazy (a function, not a module-level
 * constant): Next.js evaluates route/page modules at build time too (e.g.
 * "Collecting page data" for API routes), before any `.env` is guaranteed
 * to be populated — calling loadConfig() eagerly at import time would fail
 * the production build itself rather than only failing at runtime startup
 * as TDD §30 intends ("a service fails fast at boot"). `loadConfig()`
 * caches internally, so repeated calls within one process are cheap.
 */
export function getConfig(): AppConfig {
  return loadConfig();
}
