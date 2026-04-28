// SPEC-NOTIFY-001 §M1 — 한국어 에러 메시지 단일 출처.

export const NOTIFY_ERRORS = {
  VALIDATION: "알림 페이로드 검증 실패",
  DUPLICATE: "중복 알림 (24시간 내 발행됨)",
  RLS: "권한이 없습니다.",
  DB_INSERT: "알림 저장에 실패했습니다.",
  UNAUTHORIZED: "인증이 필요합니다.",
} as const;

export type NotifyErrorKey = keyof typeof NOTIFY_ERRORS;
