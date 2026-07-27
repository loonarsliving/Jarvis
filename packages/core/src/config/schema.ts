import { z } from "zod";

/**
 * Binding environment variable schema — mirrors
 * docs/ai-asset-factory/tdd/07-config-storage-performance-scalability.md §30
 * exactly. Adding an undocumented required variable here without updating
 * that section is a spec violation (Engineering Constitution Article I).
 *
 * This schema defines shape/types for variables other agents' modules will
 * eventually *use* (e.g. HIGGSFIELD_API_KEY) — Agent 1 owns the schema so
 * every service loads config the same way, but does not implement anything
 * that reads these values beyond exposing them typed.
 */

const nodeEnv = z.enum(["development", "production", "test"]).default("development");

const logLevel = z.enum(["debug", "info", "warn", "error"]).default("info");

// A handful of numeric env vars ship with documented defaults (§30) — coerce
// from the string env representation into a validated number.
const numericWithDefault = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

export const envSchema = z.object({
  // --- Core / all services -------------------------------------------------
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,

  // --- Database (all services) ---------------------------------------------
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid Postgres connection URL" }),

  // --- Supabase (web) -------------------------------------------------------
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  // RLS-bypassing service access — all workers + web server-side admin actions.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- Higgsfield (mission-dispatcher, higgsfield-poller) -------------------
  // Optional at the config-schema level in this Sprint: Agent 1 defines the
  // shape so Agent 4 doesn't reinvent config loading, but does not require
  // it to be present for services this Sprint doesn't implement business
  // logic for. Agent 4 should tighten these to required in its own service
  // entrypoint validation once the Higgsfield client lands.
  HIGGSFIELD_API_KEY: z.string().min(1).optional(),
  HIGGSFIELD_API_BASE_URL: z.string().url().optional(),
  HIGGSFIELD_TIMEOUT_MS: numericWithDefault(600_000),
  HIGGSFIELD_TRAINING_TIMEOUT_MS: numericWithDefault(2_700_000),

  // --- Google Drive (drive-sync-worker, web DNA turnaround preview) ---------
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1).optional(),

  // --- Retry policy (all workers, TDD §25) -----------------------------------
  RETRY_MAX_ATTEMPTS: numericWithDefault(4),
  RETRY_BACKOFF_BASE_MS: numericWithDefault(20_000),

  // --- Worker identity --------------------------------------------------------
  WORKER_INSTANCE_ID: z.string().min(1).optional(),

  // --- Notifications (web) -----------------------------------------------------
  NOTIFICATION_EMAIL_PROVIDER_HOST: z.string().min(1).optional(),
  NOTIFICATION_EMAIL_PROVIDER_PORT: z.coerce.number().int().positive().optional(),
  NOTIFICATION_EMAIL_PROVIDER_USER: z.string().min(1).optional(),
  NOTIFICATION_EMAIL_PROVIDER_PASSWORD: z.string().min(1).optional(),
  NOTIFICATION_EMAIL_PROVIDER_FROM: z.string().email().optional(),
  WHATSAPP_BRIDGE_URL: z.string().url().optional(),
  WHATSAPP_BRIDGE_TOKEN: z.string().min(1).optional(),

  // --- web only ------------------------------------------------------------
  PORT: numericWithDefault(3000),
});

export type Env = z.infer<typeof envSchema>;

/** Machine-readable subset — grouped exactly as TDD §30 documents "Used by". */
export interface AppConfig {
  nodeEnv: Env["NODE_ENV"];
  logLevel: Env["LOG_LEVEL"];
  database: {
    url: string;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  higgsfield: {
    apiKey?: string;
    apiBaseUrl?: string;
    timeoutMs: number;
    trainingTimeoutMs: number;
  };
  googleDrive: {
    serviceAccountJson?: string;
    rootFolderId?: string;
  };
  retry: {
    maxAttempts: number;
    backoffBaseMs: number;
  };
  worker: {
    instanceId?: string;
  };
  notifications: {
    email: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      from?: string;
    };
    whatsapp: {
      bridgeUrl?: string;
      bridgeToken?: string;
    };
  };
  web: {
    port: number;
  };
}
