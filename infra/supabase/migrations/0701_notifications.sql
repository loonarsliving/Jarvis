-- 0701_notifications.sql
-- Owner: Agent 7 (Dashboard & Analytics) — infra/supabase/migrations/README.md
-- explicitly reserves `notifications` for this agent ("Agent 7 — Dashboard
-- & Analytics (notifications area)"). See 0700's header comment for the
-- 0700-0799 numbering-block rationale.
--
-- FSD §9: "Notifications (bell icon, top bar)". FSD §07 ERD:
-- `notifications (independent, references entity_type + entity_id
-- polymorphically)`.
-- `notifications`
-- `id (uuid, pk)`, `recipient_id (fk users)`, `category`, `entity_type`,
-- `entity_id`, `read (bool)`, `created_at`
--
-- TDD §7.3 index: `(recipient_id, read, created_at DESC)` — "Notification
-- Center default query (unread-first)".
--
-- TDD §23 (Logging Engine): critical-severity audit events fan out into
-- notifications via `CriticalEventHandler` (packages/core/src/audit) —
-- this table is what that handler ultimately writes to.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references users (id) on delete restrict,
  category text not null check (
    category in (
      'mission_completed',
      'mission_completed_with_failures',
      'asset_flagged_for_review',
      'dead_letter_alert',
      'drive_quota_warning',
      'dna_awaiting_approval',
      'critical_audit_event',
      'lock_override_used'
    )
  ),
  -- Polymorphic reference (FSD §07 ERD) — resolved by the reading module,
  -- same pattern as audit_logs (0004_audit_logs.sql). Not a FK: the
  -- referenced entity type varies (mission / asset / generation_job /
  -- product_dna_version / character_dna_version / audit_logs row) across
  -- tables owned by different agents, so a real FK here would create a
  -- cross-module coupling this table must not have (Constitution Article
  -- III.4 "interfaces over coupling").
  entity_type text not null,
  entity_id text,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- TDD §7.3: "(recipient_id, read, created_at DESC) — Notification Center
-- default query (unread-first)".
create index notifications_recipient_unread_idx
  on notifications (recipient_id, read, created_at desc);

alter table notifications enable row level security;

-- A user only ever sees their own notifications (no cross-user visibility
-- permission exists for this in FSD §7 — notifications are inherently
-- per-recipient, unlike e.g. audit_logs which has a broad admin-visibility
-- policy).
create policy notifications_select_own on notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- Marking a notification read is the one write this read-only agent's
-- owned table needs (Constitution Article VIII: Agent 7 is read-only for
-- OTHER agents' business-logic tables; `notifications` is Agent 7's own
-- table, so maintaining its `read` flag is in-scope — see
-- DECISIONS-agent7.md item 4). Restricted to the row's own recipient and to
-- the `read` transition only (no update to category/entity/title/body from
-- the client).
create policy notifications_update_own_read_flag on notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Inserts happen exclusively via the service-role key (system-generated
-- notifications triggered by other engines' state transitions — Mission
-- completion, dead-letter alerts, etc.) — no authenticated-client INSERT
-- policy, matching the read-only posture: this agent's UI never originates
-- a notification's content, it only renders and acknowledges what other
-- engines produced.
