// SPEC-NOTIFY-001 — barrel export.
export * from "./types";
export * from "./constants";
export * from "./errors";
export { emitNotification, type EmitResult, type EmitReason } from "./emit";
export { type EmitPayload } from "./validation";
export { hasRecentDuplicate } from "./dedup";
export {
  listMyNotifications,
  getUnreadCount,
  getRecentNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationById,
  type ListNotificationsOpts,
  type ListNotificationsResult,
} from "./queries";
export { parseListFilters, buildListQueryString } from "./list-query";
