import "server-only";
import { ZodError } from "zod";
import { PermissionDeniedError, MissingJustificationError } from "@aaf/core/rbac";
import { ok, err, type ActionResult } from "@aaf/core/result";

export { ok, err, type ActionResult } from "@aaf/core/result";

/**
 * Wraps a Server Action body so it NEVER throws across the client/server
 * boundary (TDD §29.1 "never throw" discipline) — every thrown error known
 * to this layer (permission, validation, "UNAUTHENTICATED" from
 * requireCurrentUser) is translated into a typed ActionResult failure;
 * anything unrecognized becomes UNEXPECTED_ERROR rather than crashing the
 * request, per TDD §24.1 tier "Detected + surfaced" (never silent).
 *
 * Usage:
 *   export async function createMissionAction(input: unknown): Promise<ActionResult<Mission>> {
 *     return withActionErrorHandling(async () => {
 *       const user = await requirePermission("mission.create");
 *       const parsed = createMissionSchema.parse(input);
 *       // ...call into @aaf/core, return ok(result)
 *     });
 *   }
 */
export async function withActionErrorHandling<T>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return err("PERMISSION_DENIED", error.message);
    }
    if (error instanceof MissingJustificationError) {
      return err("VALIDATION_FAILED", error.message);
    }
    if (error instanceof ZodError) {
      return err("VALIDATION_FAILED", "Input validation failed", error.flatten());
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return err("UNAUTHENTICATED", "You must be signed in to perform this action.");
    }
    // Intentionally not re-thrown: TDD §24.1 requires every error be
    // "detected + surfaced," never silent, but ALSO never crash the
    // request. Logging this case to process-level logs (LOG_LEVEL, TDD
    // §30) is the owning feature's responsibility at the call site if it
    // needs more than the generic message below.
    return err("UNEXPECTED_ERROR", "Something went wrong. Please try again.");
  }
}

/** Re-exported for convenience so feature actions only need one import. */
export function actionOk<T>(data: T): ActionResult<T> {
  return ok(data);
}
