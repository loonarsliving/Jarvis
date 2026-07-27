import "server-only";
import { requirePermission as coreRequirePermission, type Permission } from "@aaf/core/rbac";
import { createSupabaseServerClient } from "../supabase/server";
import { requireCurrentUser } from "./session";

/**
 * Web-bound wrapper over @aaf/core/rbac's requirePermission() — resolves
 * the current session, provides the request-scoped Supabase client for
 * audit logging (TDD §26.5 "every permission-denied attempt is logged"),
 * and re-throws PermissionDeniedError/MissingJustificationError for the
 * standard action wrapper (action.ts) to translate into an ActionResult.
 *
 * Every Server Action begins with this call (TDD §28 layer 1).
 */
export async function requirePermission(
  permission: Permission,
  options: { justification?: string } = {},
) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  await coreRequirePermission(
    { userId: user.id, role: user.role },
    permission,
    { justification: options.justification, auditClient: supabase },
  );

  return user;
}
