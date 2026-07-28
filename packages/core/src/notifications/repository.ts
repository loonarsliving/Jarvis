import type { TypedSupabaseClient } from "../db/client.js";
import type { AuditLogRow, CriticalEventHandler } from "../audit/index.js";
import type { CreateNotificationInput, MarkNotificationReadInput, NotificationRow } from "./types.js";

/**
 * Notification Engine (FSD §21, referenced by TDD §23's Logging Engine as
 * the `critical`-severity fan-out target). Owner: Agent 7 (Dashboard &
 * Analytics) — `infra/supabase/migrations/README.md` reserves the
 * `notifications` table for this agent explicitly.
 *
 * Read-only boundary: `listNotifications`/`getUnreadNotificationCount` are
 * plain reads. `markNotificationRead` and `createNotification` write only
 * to `notifications`, a table this agent owns — not another agent's
 * business-logic table (Constitution Article VIII's "read-only by design"
 * targets *other* agents' write paths, not this agent's own notifications
 * store). See DECISIONS-agent7.md item 4.
 */

export async function listNotifications(
  client: TypedSupabaseClient,
  recipientId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const { data, error } = await client
    .from("notifications")
    .select("id, category, entity_type, entity_id, title, body, read, created_at")
    .eq("recipient_id", recipientId)
    .order("read", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    category: row.category as NotificationRow["category"],
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function getUnreadNotificationCount(client: TypedSupabaseClient, recipientId: string): Promise<number> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("read", false);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Marks one notification read. Scoped to `recipientId` in the query itself
 * (belt) in addition to the RLS policy (suspenders,
 * `notifications_update_own_read_flag` in 0701_notifications.sql) — a user
 * can never mark another user's notification read even if this function
 * were ever called with the wrong id by a caller bug.
 */
export async function markNotificationRead(
  client: TypedSupabaseClient,
  recipientId: string,
  input: MarkNotificationReadInput,
): Promise<void> {
  const { error } = await client
    .from("notifications")
    .update({ read: true })
    .eq("id", input.notificationId)
    .eq("recipient_id", recipientId);

  if (error) throw error;
}

/**
 * System-originated write — called with the service-role client only (no
 * authenticated-client INSERT policy exists on `notifications`, per
 * 0701_notifications.sql's closing comment). Every other engine that needs
 * to notify a user calls this through `@aaf/core/notifications`'s public
 * interface rather than writing to the table directly (Constitution
 * Article III.4 "interfaces over coupling").
 */
export async function createNotification(client: TypedSupabaseClient, input: CreateNotificationInput): Promise<void> {
  const { error } = await client.from("notifications").insert({
    recipient_id: input.recipientId,
    category: input.category,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    title: input.title,
    body: input.body ?? null,
  });

  if (error) throw error;
}

/**
 * Resolves every `super_admin` user id (FSD §7: `qc.override_lock_failure`
 * "always notifies every Super Admin"; general convention that a
 * `critical`-severity audit event fans out to all Super Admins per TDD
 * §23). Read-only join against `users`/`roles` (Agent 1-owned foundation
 * tables, `infra/supabase/migrations/0002-0003`), not another business
 * module's data.
 */
async function listSuperAdminUserIds(client: TypedSupabaseClient): Promise<string[]> {
  const { data, error } = await client.from("users").select("id, roles!inner(key)").eq("roles.key", "super_admin");

  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

/**
 * Builds the `CriticalEventHandler` that `@aaf/core/audit`'s `logAction()`
 * documents as its `onCriticalEvent` extension point
 * (`packages/core/src/audit/index.ts`'s `LogActionOptions.onCriticalEvent`
 * TODO). Wires every `critical`-severity audit log write into a
 * notification fanned out to all Super Admins — satisfies TDD §23's "a
 * critical log must never be written without its corresponding alert
 * firing" from the notifications side.
 *
 * Call sites (Server Actions, worker critical-path code) pass this to
 * `requirePermission()`'s / `logAction()`'s `onCriticalEvent` option using
 * a service-role client, since notification fan-out is a system action.
 */
export function buildCriticalEventNotificationHandler(serviceRoleClient: TypedSupabaseClient): CriticalEventHandler {
  return async (row: AuditLogRow) => {
    const recipientIds = await listSuperAdminUserIds(serviceRoleClient);

    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification(serviceRoleClient, {
          recipientId,
          category: "critical_audit_event",
          entityType: row.entity_type,
          entityId: row.entity_id,
          title: `Critical event: ${row.action}`,
          body: row.justification ?? null,
        }),
      ),
    );
  };
}
