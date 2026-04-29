// SPEC-PAYOUT-002 §M3 — sessions 도메인 한국어 에러 단일 출처.
// REQ-PAYOUT002-SESSIONS-003/-005/-008, REQ-PAYOUT002-EXCEPT-005, REQ-PAYOUT002-LINK-005/-006

export const SESSION_ERRORS = {
  // hours 검증 (REQ-PAYOUT002-SESSIONS-003 / -008)
  HOURS_NOT_HALF_STEP: "강의 시수는 0.5시간 단위로 입력해주세요.",
  HOURS_NOT_POSITIVE: "강의 시수는 0보다 커야 합니다.",
  HOURS_OVER_24: "강의 시수는 24시간을 초과할 수 없습니다.",

  // status 전환 (REQ-PAYOUT002-SESSIONS-005, REQ-PAYOUT002-EXCEPT-005)
  STATUS_FROZEN: "종료된 강의 세션은 상태를 변경할 수 없습니다.",

  // share_pct (REQ-PAYOUT002-PROJECT-FIELDS-005)
  SHARE_PCT_OUT_OF_RANGE: "강사 분배율은 0~100 사이여야 합니다.",

  // 정산 link 충돌 (REQ-PAYOUT002-LINK-005)
  SESSION_LINKED_TO_SETTLEMENT:
    "이 세션은 정산에 청구되어 삭제할 수 없습니다.",

  // race condition (REQ-PAYOUT002-LINK-006)
  ALREADY_BILLED:
    "이 강의는 이미 다른 정산에 청구되었습니다. 새로 고침 후 다시 시도해주세요.",

  // generate (REQ-PAYOUT002-GENERATE-006)
  NO_UNBILLED_SESSIONS: "선택한 기간에 청구할 강의가 없습니다.",

  // generic
  GENERIC_FAILED: "세션 처리 중 오류가 발생했습니다.",
} as const;

export type SessionErrorCode = keyof typeof SESSION_ERRORS;
