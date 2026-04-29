// @MX:ANCHOR: SPEC-CONFIRM-001 §M1 REQ-CONFIRM-RESPONSES-003 / RESPONSE-WINDOW-001~003 — 응답 라이프사이클.
// @MX:REASON: 모든 응답 전환 검증이 본 모듈 통과. validateStatusTransition + isWithinChangeWindow.
// @MX:SPEC: SPEC-CONFIRM-001
// pure functions only — no IO.

import type { ResponseStatus, ResponseStatusOrPending } from "./types";

/** REQ-CONFIRM-RESPONSE-WINDOW-001 — 응답 변경 가능 시간 (시간 단위). */
export const CHANGE_WINDOW_HOURS = 1;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * REQ-CONFIRM-RESPONSE-WINDOW-001/002 — 1시간 변경 윈도 boundary 판정.
 * `respondedAt + 1h` 이내(`<=`)에만 응답 변경 가능.
 *
 * 경계 정책: 정확히 1시간 = OK (포함), 1시간 1초 = NG.
 *
 * @param respondedAt — 응답 시각 (서버 timestamp 신뢰). null이면 미응답 → 항상 true.
 * @param now — 현재 시각 (테스트 주입용, 기본값 new Date()).
 */
export function isWithinChangeWindow(
  respondedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (respondedAt === null) return true;
  const diffMs = now.getTime() - respondedAt.getTime();
  return diffMs <= ONE_HOUR_MS;
}

/**
 * REQ-CONFIRM-RESPONSES-003 — 응답 상태 전환 검증.
 *
 * - null → accepted | declined | conditional (first response; "pending" = null)
 * - accepted ↔ declined / conditional, declined ↔ conditional — 윈도 내 자유 전환
 * - 응답 → 동일 상태 — 거부 (idempotency는 DB에서 ON CONFLICT DO UPDATE로 보장)
 *
 * 본 함수는 pure validation; 윈도 체크는 호출자가 별도 isWithinChangeWindow로 수행.
 */
export function validateStatusTransition(
  from: ResponseStatusOrPending,
  to: ResponseStatus,
): { ok: true } | { ok: false; reason: string } {
  // null → 응답 (모든 상태 허용)
  if (from === null) {
    return { ok: true };
  }

  // 동일 상태 — 거부 (idempotency는 DB 차원 처리)
  if (from === to) {
    return {
      ok: false,
      reason: "이미 동일한 응답이 저장되어 있습니다.",
    };
  }

  // 3가지 상태 간 모든 전환은 허용 (윈도 내 한정 — 별도 체크).
  // accepted → declined / conditional
  // declined → accepted / conditional
  // conditional → accepted / declined
  return { ok: true };
}
