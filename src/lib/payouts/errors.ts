// SPEC-PAYOUT-001 §1.3 — 한국어 에러 메시지 단일 출처 (8 + STALE 1).
// 인라인 한국어 사용자 메시지 사용 금지. 모든 사용자 메시지는 본 모듈 경유.

export const PAYOUT_ERRORS = {
  STATUS_PAID_FROZEN: "정산 완료된 항목은 변경할 수 없습니다.",
  STATUS_HELD_TO_PAID_BLOCKED:
    "보류 상태에서는 정산 완료로 직접 전환할 수 없습니다. 정산 요청으로 먼저 복귀하세요.",
  STATUS_NEED_REQUESTED: "정산 요청 상태에서만 입금 확인이 가능합니다.",
  STATUS_INVALID_TRANSITION: "허용되지 않은 상태 전환입니다.",
  TAX_RATE_CORPORATE_NONZERO: "기업 정산은 원천세율이 0%여야 합니다.",
  TAX_RATE_GOVERNMENT_INVALID:
    "정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다.",
  MAIL_STUB_FAILED:
    "정산 요청 알림 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
  SETTLEMENT_NOT_FOUND: "정산 정보를 찾을 수 없습니다.",
  STALE_TRANSITION:
    "다른 사용자가 먼저 변경했습니다. 새로고침 후 다시 시도하세요.",
  FORBIDDEN: "권한이 없습니다.",
  GENERIC_FAILED: "처리 중 오류가 발생했습니다.",
} as const;

export type PayoutErrorKey = keyof typeof PAYOUT_ERRORS;
