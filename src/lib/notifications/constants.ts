// SPEC-NOTIFY-001 §M1 — 도메인 상수 및 라벨 매핑.
import type { NotificationType } from "./types";

/** 모든 emit 콘솔 로그의 prefix. SPEC-PAYOUT-001 / SPEC-PROJECT-001 hook 호환. */
export const NOTIF_LOG_PREFIX = "[notif]" as const;

export const NOTIFICATION_PAGE_SIZE = 20 as const;
export const DROPDOWN_LIMIT = 10 as const;
export const DEDUP_WINDOW_HOURS = 24 as const;
export const TRIGGER_RATE_LIMIT_MINUTES = 5 as const;

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  assignment_request: "배정 요청",
  assignment_overdue: "배정 지연",
  schedule_conflict: "일정 충돌",
  low_satisfaction_assignment: "만족도 경고",
  dday_unprocessed: "D-Day 미처리",
  settlement_requested: "정산 요청",
};

export const NOTIFICATION_TYPE_BADGE_CLASS: Record<NotificationType, string> = {
  assignment_request: "bg-blue-100 text-blue-800",
  assignment_overdue: "bg-amber-100 text-amber-800",
  schedule_conflict: "bg-red-100 text-red-800",
  low_satisfaction_assignment: "bg-orange-100 text-orange-800",
  dday_unprocessed: "bg-purple-100 text-purple-800",
  settlement_requested: "bg-emerald-100 text-emerald-800",
};
