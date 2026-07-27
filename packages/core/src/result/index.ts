/**
 * Error handling scaffolding — TDD §29.1/§29.4. Two shapes, one convention:
 *
 * - `ActionResult<T>`: every Next.js Server Action's return type
 *   (`apps/web/features/*\/actions`). Server Actions never throw across the
 *   client/server boundary (TDD §29.1 "never throw" discipline, matching
 *   MK Connect's proven pattern) — they always resolve to one of these two
 *   shapes.
 * - `ApiErrorBody`: the uniform JSON error shape for `/api/*` route
 *   handlers (TDD §29.4), independent of ActionResult since REST routes
 *   communicate failure via HTTP status + this body, not a discriminated
 *   union return value.
 *
 * `ErrorCode` is a stable, machine-readable enum the frontend can branch on
 * without parsing `message` text (TDD §29.4). Business modules (Agents 2-7)
 * extend this list via their own error types as needed — this Sprint seeds
 * the codes already implied by Agent 1's own scope (auth/permission/
 * validation) plus the generic ones every module will need.
 */

export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

export interface ActionError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNEXPECTED_ERROR";

export interface ApiErrorBody {
  error: ActionError;
}

/** HTTP status the API layer should use for a given ErrorCode (TDD §29.4). */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNEXPECTED_ERROR: 500,
};

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function err<T = never>(code: ErrorCode, message: string, details?: unknown): ActionResult<T> {
  return { success: false, error: { code, message, details } };
}

export function toApiErrorBody(error: ActionError): ApiErrorBody {
  return { error };
}
