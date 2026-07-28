import { z } from "zod";

/**
 * Mirrors the `category` check constraint in
 * `infra/supabase/migrations/0701_notifications.sql` — keep both in
 * lockstep (same discipline as `@aaf/core/rbac`'s permission matrix vs. its
 * seed migration, `packages/core/src/rbac/permissions.ts`'s own header
 * comment).
 */
export const notificationCategorySchema = z.enum([
  "mission_completed",
  "mission_completed_with_failures",
  "asset_flagged_for_review",
  "dead_letter_alert",
  "drive_quota_warning",
  "dna_awaiting_approval",
  "critical_audit_event",
  "lock_override_used",
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export interface NotificationRow {
  id: string;
  category: NotificationCategory;
  entityType: string;
  entityId: string | null;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

export const markNotificationReadInputSchema = z.object({
  notificationId: z.string().uuid(),
});
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadInputSchema>;

export const createNotificationInputSchema = z.object({
  recipientId: z.string().uuid(),
  category: notificationCategorySchema,
  entityType: z.string().min(1),
  entityId: z.string().nullable().optional(),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
});
export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;
