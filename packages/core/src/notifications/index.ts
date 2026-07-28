/**
 * Notification Engine (FSD §21) — public interface. Owner: Agent 7
 * (Dashboard & Analytics). Replaces the Agent 1-scaffolded stub (see
 * README.md) now that this agent's Sprint implements it.
 */
export * from "./types.js";
export {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  createNotification,
  buildCriticalEventNotificationHandler,
} from "./repository.js";
