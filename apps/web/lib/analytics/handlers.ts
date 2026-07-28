import "server-only";
import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { PermissionDeniedError } from "@aaf/core/rbac";
import { toApiErrorBody, ERROR_CODE_HTTP_STATUS, type ErrorCode } from "@aaf/core/result";

/**
 * API-route equivalent of `apps/web/lib/auth/action.ts`'s
 * `withActionErrorHandling` for Server Actions — same translation table
 * (TDD §29.4 "uniform JSON error shape"), but returns a `NextResponse`
 * with the matching HTTP status instead of an `ActionResult`. Shared by
 * every `/api/dashboard/*` and `/api/qc-analytics/*` route this agent owns
 * so error handling isn't duplicated at each route (Constitution Article
 * III.3).
 */
export async function withApiErrorHandling(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    let code: ErrorCode = "UNEXPECTED_ERROR";
    let message = "Something went wrong. Please try again.";
    let details: unknown;

    if (error instanceof PermissionDeniedError) {
      code = "PERMISSION_DENIED";
      message = error.message;
    } else if (error instanceof ZodError) {
      code = "VALIDATION_FAILED";
      message = "Input validation failed";
      details = error.flatten();
    } else if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      code = "UNAUTHENTICATED";
      message = "You must be signed in to perform this action.";
    }

    return NextResponse.json(toApiErrorBody({ code, message, details }), { status: ERROR_CODE_HTTP_STATUS[code] });
  }
}
