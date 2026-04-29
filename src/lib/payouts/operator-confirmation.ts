// @MX:ANCHOR: SPEC-RECEIPT-001 §M5 REQ-RECEIPT-OPERATOR-003 — 운영자 수취 확인 검증.
// @MX:REASON: confirmRemittanceAndIssueReceipt Server Action의 사전 검증 로직 분리.
//             fan_in 3 (Server Action + 통합 테스트 + 단위 테스트). paid-freeze + receipt_number UNIQUE 위반 방어.

import { PAYOUT_ERRORS } from "./errors";
import type { SettlementFlow, SettlementStatus } from "./types";

interface SettlementForConfirmation {
  id: string;
  settlement_flow: SettlementFlow;
  status: SettlementStatus;
  instructor_remittance_amount_krw: number | null;
  receipt_number: string | null;
}

interface ConfirmationInput {
  settlementId: string;
  receivedDate: string;
  receivedAmountKrw: number;
  memo?: string | null;
}

export type ConfirmationValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 운영자 수취 확인 사전 검증.
 *
 * 우선순위:
 *   1. status === 'paid' → STATUS_PAID_FROZEN (paid-freeze 우선)
 *   2. status !== 'requested' → STATUS_INVALID_TRANSITION
 *   3. settlement_flow !== 'client_direct' → STATUS_INVALID_TRANSITION
 *   4. receipt_number IS NOT NULL → RECEIPT_ALREADY_ISSUED (race 또는 stale)
 *   5. expected !== input → REMITTANCE_AMOUNT_MISMATCH
 *
 * 본 검증은 트랜잭션 시작 전(pre-tx)에 호출. WHERE 절(`status='requested'`)이
 * race-condition 추가 방어선.
 */
export function validateOperatorConfirmationInput(
  settlement: SettlementForConfirmation,
  input: ConfirmationInput,
): ConfirmationValidation {
  if (settlement.status === "paid") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_PAID_FROZEN };
  }
  if (settlement.status !== "requested") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (settlement.settlement_flow !== "client_direct") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (settlement.receipt_number !== null) {
    return { ok: false, reason: PAYOUT_ERRORS.RECEIPT_ALREADY_ISSUED };
  }
  const expected = settlement.instructor_remittance_amount_krw;
  if (expected === null || expected !== input.receivedAmountKrw) {
    return { ok: false, reason: PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH };
  }
  return { ok: true };
}
