// @MX:ANCHOR: SPEC-PAYOUT-001 §2.4 REQ-PAYOUT-TAX-001~004 — 원천세율 검증 + 금액 계산.
// @MX:REASON: fan_in 3+ (validation.ts / queries 표시 / 폼 사전검증).
//             공식이 DB GENERATED 컬럼 (settlement.ts withholdingTaxAmountKrw) 과 정확히 동일해야 함.
// @MX:SPEC: SPEC-PAYOUT-001

import { PAYOUT_ERRORS } from "./errors";
import {
  CORPORATE_TAX_RATE,
  GOVERNMENT_TAX_RATES,
} from "./constants";
import type { SettlementFlow } from "./types";

export type TaxValidation =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * settlement_flow ↔ withholding_tax_rate 화이트리스트 검증.
 * - corporate: rate === 0
 * - government: rate ∈ {3.30, 8.80}
 *
 * 부동소수 비교를 안전하게 하기 위해 epsilon 1e-9 사용.
 */
export function validateTaxRate(
  flow: SettlementFlow,
  rate: number,
): TaxValidation {
  if (!Number.isFinite(rate)) {
    return { ok: false, reason: PAYOUT_ERRORS.TAX_RATE_GOVERNMENT_INVALID };
  }
  if (flow === "corporate") {
    if (Math.abs(rate - CORPORATE_TAX_RATE) < 1e-9) return { ok: true };
    return { ok: false, reason: PAYOUT_ERRORS.TAX_RATE_CORPORATE_NONZERO };
  }
  // government
  const matches = GOVERNMENT_TAX_RATES.some(
    (allowed) => Math.abs(rate - allowed) < 1e-9,
  );
  if (matches) return { ok: true };
  return { ok: false, reason: PAYOUT_ERRORS.TAX_RATE_GOVERNMENT_INVALID };
}

/**
 * 원천세 금액 계산 — DB GENERATED 컬럼과 동일 공식.
 * SQL: `floor(instructor_fee_krw * withholding_tax_rate / 100)::bigint`
 *
 * 부동소수 누적 오차를 피하기 위해 정수 산술로 환산:
 *   fee * rate%(소수점 2자리) / 100
 *   = fee * Math.round(rate * 100) / 10000
 */
export function calculateWithholdingAmount(
  feeKrw: number,
  ratePercent: number,
): number {
  if (feeKrw <= 0 || ratePercent <= 0) return 0;
  // ratePercent 을 정수 basis points × 100 으로 환산 (3.30 → 330).
  const rateScaled = Math.round(ratePercent * 100);
  return Math.floor((feeKrw * rateScaled) / 10000);
}

/** profit_krw = business - fee (DB GENERATED 와 동일). */
export function calculateProfit(
  businessAmountKrw: number,
  instructorFeeKrw: number,
): number {
  return businessAmountKrw - instructorFeeKrw;
}
