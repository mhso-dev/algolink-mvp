// @MX:ANCHOR: SPEC-PAYOUT-001 §2.3 REQ-PAYOUT-STATUS-001~004 — 정산 상태 전환 그래프.
// @MX:REASON: fan_in 4 (request/markPaid/hold/resume Server Action). paid 동결 / held→paid 차단은
//             감사 무결성과 금액 변조 방지의 invariant. 변경 시 즉시 회귀 테스트 필수.
// @MX:SPEC: SPEC-PAYOUT-001

import { PAYOUT_ERRORS } from "./errors";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "./types";

/**
 * 허용된 상태 전환 그래프 (5건만 허용).
 *
 *   pending   → requested, held
 *   requested → paid, held
 *   paid      → ∅            (동결)
 *   held      → requested    (paid 직접 전환 차단)
 */
export const ALLOWED_TRANSITIONS: Record<
  SettlementStatus,
  readonly SettlementStatus[]
> = {
  pending: ["requested", "held"],
  requested: ["paid", "held"],
  paid: [],
  held: ["requested"],
};

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 상태 전환 사전 검증.
 *
 * 우선순위:
 *   1. from === "paid" → STATUS_PAID_FROZEN (모든 전환 차단)
 *   2. from === "held" && to === "paid" → STATUS_HELD_TO_PAID_BLOCKED (특수 케이스)
 *   3. ALLOWED_TRANSITIONS 그래프 외 전환 → STATUS_INVALID_TRANSITION
 */
export function validateTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): TransitionResult {
  if (from === "paid") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_PAID_FROZEN };
  }
  if (from === "held" && to === "paid") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_HELD_TO_PAID_BLOCKED };
  }
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_INVALID_TRANSITION };
  }
  return { ok: true };
}

/** 4 × 4 = 16 조합을 모두 enumerate (테스트/검증 용). */
export function allTransitionPairs(): Array<{
  from: SettlementStatus;
  to: SettlementStatus;
}> {
  const pairs: Array<{ from: SettlementStatus; to: SettlementStatus }> = [];
  for (const from of SETTLEMENT_STATUSES) {
    for (const to of SETTLEMENT_STATUSES) {
      pairs.push({ from, to });
    }
  }
  return pairs;
}
