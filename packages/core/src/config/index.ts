import { envSchema, type AppConfig, type Env } from "./schema.js";

export type { AppConfig, Env } from "./schema.js";
export { envSchema } from "./schema.js";

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

let cachedConfig: AppConfig | undefined;

function mapEnvToConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    database: {
      url: env.DATABASE_URL,
    },
    supabase: {
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    higgsfield: {
      apiKey: env.HIGGSFIELD_API_KEY,
      apiBaseUrl: env.HIGGSFIELD_API_BASE_URL,
      timeoutMs: env.HIGGSFIELD_TIMEOUT_MS,
      trainingTimeoutMs: env.HIGGSFIELD_TRAINING_TIMEOUT_MS,
    },
    googleDrive: {
      serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
      rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    },
    retry: {
      maxAttempts: env.RETRY_MAX_ATTEMPTS,
      backoffBaseMs: env.RETRY_BACKOFF_BASE_MS,
    },
    worker: {
      instanceId: env.WORKER_INSTANCE_ID,
    },
    notifications: {
      email: {
        host: env.NOTIFICATION_EMAIL_PROVIDER_HOST,
        port: env.NOTIFICATION_EMAIL_PROVIDER_PORT,
        user: env.NOTIFICATION_EMAIL_PROVIDER_USER,
        password: env.NOTIFICATION_EMAIL_PROVIDER_PASSWORD,
        from: env.NOTIFICATION_EMAIL_PROVIDER_FROM,
      },
      whatsapp: {
        bridgeUrl: env.WHATSAPP_BRIDGE_URL,
        bridgeToken: env.WHATSAPP_BRIDGE_TOKEN,
      },
    },
    web: {
      port: env.PORT,
    },
  };
}

/**
 * Loads and validates process.env once per process, per TDD §31: this is the
 * ONLY place `process.env` is read directly anywhere in the codebase. Every
 * other module receives configuration via function parameters or an
 * injected config object — never `process.env` itself.
 *
 * Fails fast (throws `ConfigValidationError`) at boot with a clear,
 * itemized error rather than failing confusingly deep in a request/job
 * path later (TDD §30).
 *
 * @param source - injectable for testing; defaults to `process.env`.
 * @param options.cache - reuse the previously loaded config within this
 *   process instead of re-parsing (default true). Pass `false` in tests
 *   that need a fresh parse against different fake env values.
 */
export function loadConfig(
  source: NodeJS.ProcessEnv = process.env,
  options: { cache?: boolean } = {},
): AppConfig {
  const cache = options.cache ?? true;
  if (cache && cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigValidationError(issues);
  }

  const config = mapEnvToConfig(result.data);
  if (cache) {
    cachedConfig = config;
  }
  return config;
}

/** Test-only helper to reset the module-level cache between test cases. */
export function __resetConfigCacheForTests(): void {
  cachedConfig = undefined;
}
