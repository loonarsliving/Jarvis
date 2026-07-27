import type { TypedSupabaseClient } from "../db/client.js";
import { logAction, type CriticalEventHandler } from "../audit/index.js";
import {
  roleHasPermission,
  MANDATORY_JUSTIFICATION_PERMISSIONS,
  type Permission,
  type Role,
} from "./permissions.js";

export class PermissionDeniedError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly role: Role,
  ) {
    super(`Role "${role}" does not have permission "${permission}"`);
    this.name = "PermissionDeniedError";
  }
}

export class MissingJustificationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Permission "${permission}" requires a non-empty justification`);
    this.name = "MissingJustificationError";
  }
}

export interface SessionContext {
  userId: string;
  role: Role;
}

export interface RequirePermissionOptions {
  /** Required and validated non-empty when `permission` is in MANDATORY_JUSTIFICATION_PERMISSIONS (e.g. qc.override_lock_failure). */
  justification?: string;
  /**
   * Audit client — when provided, every check (grant AND denial) is logged
   * per TDD §26.5 ("every permission-denied attempt is logged at `warning`
   * severity"). Omit only in contexts that log separately (rare); the
   * server-action wrapper in apps/web always provides this.
   */
  auditClient?: TypedSupabaseClient;
  onCriticalEvent?: CriticalEventHandler;
}

/**
 * The shared `requirePermission()` guard (TDD §28 "two-layer enforcement",
 * layer 1). Every Server Action begins with this call. Throws
 * `PermissionDeniedError` on denial (caught by the standard error-handling
 * wrapper — see apps/web/lib/auth) — this is layer 1 only; Postgres RLS
 * (infra/supabase/migrations) is the independent layer-2 backstop per the
 * same TDD section, so a bug here cannot alone leak data.
 */
export async function requirePermission(
  session: SessionContext,
  permission: Permission,
  options: RequirePermissionOptions = {},
): Promise<void> {
  if (
    MANDATORY_JUSTIFICATION_PERMISSIONS.includes(permission) &&
    !options.justification?.trim()
  ) {
    throw new MissingJustificationError(permission);
  }

  const granted = roleHasPermission(session.role, permission);

  if (options.auditClient) {
    await logAction(
      options.auditClient,
      {
        actorType: "user",
        actorId: session.userId,
        action: granted ? `${permission}.granted` : `${permission}.denied`,
        entityType: "permission_check",
        entityId: null,
        severity: granted ? "info" : "warning",
        justification: options.justification ?? null,
      },
      { onCriticalEvent: options.onCriticalEvent },
    );
  }

  if (!granted) {
    throw new PermissionDeniedError(permission, session.role);
  }
}

export {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  MANDATORY_JUSTIFICATION_PERMISSIONS,
  roleHasPermission,
  type Role,
  type Permission,
} from "./permissions.js";
