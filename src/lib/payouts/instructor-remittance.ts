// @MX:NOTE: SPEC-RECEIPT-001 §M4 REQ-RECEIPT-INSTRUCTOR-001~005 — 강사 송금 등록 로직.
// @MX:REASON: Server Action에서 검증 + 트랜잭션을 분리. 본 모듈은 순수 검증 함수만 노출.
// @MX:WARN: instructor_remittance_amount_krw는 SPEC-PAYOUT-002의 GENERATE Server Action이 owner.
// @MX:REASON: read-only 소비. NULL이면 PAYOUT-002 amendment 미적용 → mismatch error로 차단.

import { PAYOUT_ERRORS } from "./errors";
import type { SettlementFlow, SettlementStatus } from "./types";

interface SettlementForRemittance {
  id: string;
  settlement_flow: SettlementFlow;
  status: SettlementStatus;
  instructor_remittance_amount_krw: number | null;
  instructor_fee_krw: number;
  withholding_tax_rate: string | number;
  withholding_tax_amount_krw: number | null;
}

interface RemittanceInput {
  settlementId: string;
  remittanceDate: string;
  remittanceAmountKrw: number;
}

export type RemittanceValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 강사 송금 등록 사전 검증.
 * - status === 'pending' (paid-freeze + STATUS_INVALID_TRANSITION 우선순위)
 * - settlement_flow === 'client_direct'
 * - remittanceAmountKrw === settlement.instructor_remittance_amount_krw (mismatch 거부)
 */
export function validateInstructorRemittanceInput(
  settlement: SettlementForRemittance,
  input: RemittanceInput,
): RemittanceValidation {
  // status check (paid-freeze 우선)
  if (settlement.status === "paid") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_PAID_FROZEN };
  }
  if (settlement.status !== "pending") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (settlement.settlement_flow !== "client_direct") {
    return { ok: false, reason: PAYOUT_ERRORS.STATUS_INVALID_TRANSITION };
  }
  // amount check
  const expected = settlement.instructor_remittance_amount_krw;
  if (expected === null || expected !== input.remittanceAmountKrw) {
    return { ok: false, reason: PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH };
  }
  return { ok: true };
}

/**
 * client_payout_amount_krw (정보용) 계산.
 * 고객사가 강사에게 송금한 금액 = instructor_fee_krw - withholding_tax_amount_krw.
 * withholding_tax_amount_krw가 NULL이면 instructor_fee_krw 그대로.
 */
export function computeClientPayoutAmount(settlement: {
  instructor_fee_krw: number;
  withholding_tax_amount_krw: number | null;
  // optional pass-through (테스트에서 추가 필드 전달 가능).
  withholding_tax_rate?: string | number;
}): number {
  const fee = settlement.instructor_fee_krw;
  const withholding = settlement.withholding_tax_amount_krw ?? 0;
  return fee - withholding;
}
