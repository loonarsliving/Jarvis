import type { TypedSupabaseClient } from "../db/client.js";
import { logActionInputSchema, type LogActionInput, type AuditLogRow } from "./types.js";

export {
  auditSeveritySchema,
  actorTypeSchema,
  logActionInputSchema,
  type AuditSeverity,
  type ActorType,
  type LogActionInput,
  type AuditLogRow,
} from "./types.js";

export class AuditWriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AuditWriteError";
  }
}

/**
 * Notification-trigger interface point (TDD §23 + §37 "Alerting" — critical
 * severity audit events should be able to fan out into the Notification
 * Engine). The `notifications` module itself is owned by the
 * dashboard/notifications area (Agent 7) and is a stub in this Sprint — this
 * callback lets `logAction` remain decoupled from that module (Constitution
 * Article III.4: interfaces over coupling) rather than importing it
 * directly, which would create a dependency in the wrong direction.
 *
 * Agent 7 wires a real implementation of this type into `logAction`'s
 * `options.onCriticalEvent` at the call sites that need it (or via a
 * process-wide default set once at service startup) once the notifications
 * module is implemented.
 */
export type CriticalEventHandler = (row: AuditLogRow) => void | Promise<void>;

export interface LogActionOptions {
  /** TODO(Agent 7 / notifications module): wire a real dispatcher here once `@aaf/core/notifications` is implemented. Left `undefined` = no-op, per "no code path may silently assume a notification was sent." */
  onCriticalEvent?: CriticalEventHandler;
}

/**
 * Writes a single structured audit log row. Per Engineering Constitution
 * Article III.6, this must be called in the SAME transaction as the
 * business write it documents — callers are responsible for that
 * transactional pairing (Supabase JS client does not expose cross-table
 * transactions directly; RPC/stored-procedure wrapping is the documented
 * pattern for callers that need atomicity, left to each business module).
 *
 * Never throws away failures silently (Constitution/TDD §24 "no silent
 * failure") — a failed audit write throws `AuditWriteError` so the caller's
 * own transaction/error handling can decide how to react, rather than this
 * function swallowing the error and leaving an unlogged mutation.
 */
export async function logAction(
  client: TypedSupabaseClient,
  input: LogActionInput,
  options: LogActionOptions = {},
): Promise<AuditLogRow> {
  const parsed = logActionInputSchema.parse(input);

  const { data, error } = await client
    .from("audit_logs")
    .insert({
      actor_type: parsed.actorType,
      actor_id: parsed.actorId,
      action: parsed.action,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      before: parsed.before ?? null,
      after: parsed.after ?? null,
      severity: parsed.severity,
      justification: parsed.justification ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new AuditWriteError(`Failed to write audit log for action "${parsed.action}"`, error);
  }

  const row = data as AuditLogRow;

  if (row.severity === "critical" && options.onCriticalEvent) {
    await options.onCriticalEvent(row);
  }

  return row;
}
