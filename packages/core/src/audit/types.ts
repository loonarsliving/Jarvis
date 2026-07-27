import { z } from "zod";

/**
 * Mirrors the `audit_logs` table (infra/supabase/migrations/0003_audit_logs.sql)
 * and TDD §23 (Logging Engine spec).
 */
export const auditSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AuditSeverity = z.infer<typeof auditSeveritySchema>;

/**
 * `system` = one of the four automated workers acting without a human
 * session (TDD §27 "service-to-service auth" — service-role key, never a
 * human session). `user` = an authenticated human actor.
 */
export const actorTypeSchema = z.enum(["user", "system"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const logActionInputSchema = z.object({
  actorType: actorTypeSchema,
  /** Supabase auth user id for actorType "user"; worker instance id / service name for "system". */
  actorId: z.string().min(1),
  /** e.g. "mission.create", "qc.override_lock_failure", "auth.login_failed" — matches the permission-key convention (FSD §7). */
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1).nullable(),
  /** Full before/after state per NFR-3 traceability — never partial. */
  before: z.record(z.string(), z.unknown()).nullable().optional(),
  after: z.record(z.string(), z.unknown()).nullable().optional(),
  severity: auditSeveritySchema.default("info"),
  /** Mandatory for qc.override_lock_failure (FSD §7) — the RBAC guard layer enforces presence for that specific action; this schema keeps it optional generically. */
  justification: z.string().min(1).nullable().optional(),
});
export type LogActionInput = z.infer<typeof logActionInputSchema>;

export interface AuditLogRow {
  id: string;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  severity: AuditSeverity;
  justification: string | null;
  created_at: string;
}
