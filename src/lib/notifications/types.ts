// SPEC-NOTIFY-001 §M1 — 알림 도메인 타입.

export type NotificationType =
  | "assignment_request"
  | "assignment_overdue"
  | "schedule_conflict"
  | "low_satisfaction_assignment"
  | "dday_unprocessed"
  | "settlement_requested";

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "assignment_request",
  "assignment_overdue",
  "schedule_conflict",
  "low_satisfaction_assignment",
  "dday_unprocessed",
  "settlement_requested",
] as const;

export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

export type ReadFilter = "all" | "unread" | "read";

export interface ListFilters {
  types: NotificationType[];
  read: ReadFilter;
  page: number;
}
