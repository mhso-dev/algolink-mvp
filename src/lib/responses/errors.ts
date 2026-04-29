// SPEC-CONFIRM-001 §5.5 — 한국어 에러 상수.
// 모든 사용자 노출 메시지는 본 모듈 경유 (영문 평문 노출 금지).

export const RESPONSE_ERRORS = {
  /** REQ-CONFIRM-RESPONSES-004 — conditional_note 5자 미만. */
  NOTE_TOO_SHORT: "조건부 응답에는 5자 이상의 메모를 입력해주세요.",
  /** REQ-CONFIRM-RESPONSE-WINDOW-003 — 1시간 윈도 초과. */
  WINDOW_EXPIRED: "응답 변경 가능 시간이 지났습니다. 운영자에게 문의해주세요.",
  /** REQ-CONFIRM-RLS-003 — 본인 외 응답 시도. */
  NOT_OWN_RESPONSE: "본인 응답만 수정할 수 있습니다.",
  /** REQ-CONFIRM-ASSIGNMENTS-005 — 다른 강사로 재배정. */
  REASSIGNED_AWAY: "이미 다른 강사에게 재배정된 프로젝트입니다.",
  /** REQ-CONFIRM-EFFECTS-005 — schedule_items EXCLUSION 충돌. */
  SCHEDULE_CONFLICT:
    "이미 등록된 강의 일정과 겹쳐 자동 등록에 실패했습니다. 운영자에게 문의해주세요.",
  /** REQ-CONFIRM-EFFECTS-006 — education_start/end null. */
  PROJECT_DATES_MISSING:
    "강의 시작/종료일이 미정이어서 일정 등록이 보류되었습니다.",
  /** state-machine fallback. */
  INVALID_TRANSITION: "허용되지 않은 응답 상태 전환입니다.",
  /** SPEC-PROJECT-001 validateTransition 실패. */
  PROJECT_TRANSITION_BLOCKED: "프로젝트 상태 전환이 거부되었습니다.",
  /** 권한 없음 / 강사 record 부재. */
  UNAUTHORIZED: "강사 권한이 필요합니다.",
  /** 대상 프로젝트 없음. */
  NOT_FOUND: "응답 대상을 찾을 수 없습니다.",
  /** zod validation generic. */
  VALIDATION: "입력값이 올바르지 않습니다.",
  /** Server Action 일반 실패. */
  GENERIC_FAILURE: "응답 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
  /** Idempotency: 동일 응답 재시도. */
  ALREADY_RECORDED: "이미 동일한 응답이 저장되어 있습니다.",
} as const;

export type ResponseErrorKey = keyof typeof RESPONSE_ERRORS;
