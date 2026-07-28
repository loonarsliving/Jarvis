"use server";

import { markNotificationRead, markNotificationReadInputSchema } from "@aaf/core/notifications";
import { ok, type ActionResult } from "@aaf/core/result";
import { withActionErrorHandling } from "../../../lib/auth/action";
import { requireCurrentUser } from "../../../lib/auth/session";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * The one write this read-only agent's Notification Center needs —
 * against `notifications`, a table Agent 7 owns (see DECISIONS-agent7.md
 * item 4). No `requirePermission()` call beyond authentication: marking
 * one's own notification read isn't gated by a business permission in the
 * FSD §7 matrix (every role can have notifications), it's scoped to the
 * caller's own rows by `recipientId` — enforced in
 * `@aaf/core/notifications`'s `markNotificationRead` query and backstopped
 * by the `notifications_update_own_read_flag` RLS policy
 * (`infra/supabase/migrations/0701_notifications.sql`).
 */
export async function markNotificationReadAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withActionErrorHandling(async () => {
    const user = await requireCurrentUser();
    const parsed = markNotificationReadInputSchema.parse(input);
    const supabase = await createSupabaseServerClient();

    await markNotificationRead(supabase, user.id, parsed);

    return ok({ id: parsed.notificationId });
  });
}
