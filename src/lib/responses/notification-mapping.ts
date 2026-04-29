// SPEC-CONFIRM-001 §M1 REQ-CONFIRM-NOTIFY-002 (LOW-7 fix) — 6 매핑 케이스.
// 2 source_kind × 3 non-pending status = 6 cases.

import type { ResponseSourceKind, ResponseStatus } from "./types";

/** notification_type enum 신규 5종 + assignment conditional fallback. */
export type ConfirmNotificationType =
  | "assignment_accepted"
  | "assignment_declined"
  | "inquiry_accepted"
  | "inquiry_declined"
  | "inquiry_conditional";

/**
 * REQ-CONFIRM-NOTIFY-002 — (source_kind, status) → notification_type 매핑.
 *
 * 매핑 테이블 (LOW-7: 6 cases):
 * | source_kind          | status      | notification_type    |
 * |----------------------|-------------|----------------------|
 * | assignment_request   | accepted    | assignment_accepted  |
 * | assignment_request   | declined    | assignment_declined  |
 * | assignment_request   | conditional | assignment_declined* |
 * | proposal_inquiry     | accepted    | inquiry_accepted     |
 * | proposal_inquiry     | declined    | inquiry_declined     |
 * | proposal_inquiry     | conditional | inquiry_conditional  |
 *
 * (*) §5.4 — assignment conditional은 "거절 후 재배정 필요" UX이므로 assignment_declined로
 * 통합 매핑. body 텍스트에 `[조건부]` 접두사 추가하여 운영자가 구분 가능.
 * SPEC-NOTIF-RULES-001 후속에서 별도 enum value `assignment_conditional` 추가 검토.
 */
export function mapResponseToNotificationType(
  sourceKind: ResponseSourceKind,
  status: ResponseStatus,
): ConfirmNotificationType {
  if (sourceKind === "assignment_request") {
    switch (status) {
      case "accepted":
        return "assignment_accepted";
      case "declined":
      case "conditional":
        return "assignment_declined";
    }
  } else {
    switch (status) {
      case "accepted":
        return "inquiry_accepted";
      case "declined":
        return "inquiry_declined";
      case "conditional":
        return "inquiry_conditional";
    }
  }
  // exhaustiveness — 컴파일러가 unreachable 검증.
  const _exhaustive: never = status;
  throw new Error(`Unhandled status: ${String(_exhaustive)}`);
}
