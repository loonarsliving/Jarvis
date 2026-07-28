# notifications

**Owner: Agent 7 (Dashboard & Analytics).**

Implements the Notification Engine (FSD §21). Originally scaffolded as an
intentional stub by Agent 1 (Foundation) per Engineering Constitution
Article VIII; implemented in this Sprint.

Table: `notifications` (`infra/supabase/migrations/0701_notifications.sql`,
reserved for this agent in `infra/supabase/migrations/README.md`).

## Public interface

- `listNotifications(client, recipientId)` / `getUnreadNotificationCount` —
  reads, powering the Notification Center page and the topbar bell badge.
- `markNotificationRead(client, recipientId, input)` — the one write this
  read-only agent needs against its own table (scoped to the caller's own
  rows both in the query and via RLS).
- `createNotification(client, input)` — system-originated write, called
  with the service-role client only. Other engines call this through this
  module's public interface rather than writing to `notifications`
  directly (Constitution Article III.4).
- `buildCriticalEventNotificationHandler(serviceRoleClient)` — builds the
  `CriticalEventHandler` that `@aaf/core/audit`'s `logAction()` documents
  as its `onCriticalEvent` extension point
  (`packages/core/src/audit/index.ts`). Fans a `critical`-severity audit
  event out to every Super Admin as a notification (TDD §23, FSD §7).

Do not reach into this folder's internals from another module — depend on
its public `index.ts` export only (Constitution Article III.4).
