// SPEC-RECEIPT-001 §M4 — registerInstructorRemittance 핵심 로직 단위 테스트.
// REQ-RECEIPT-INSTRUCTOR-001~005 — 강사 송금 등록 흐름.
//
// Server Action 자체는 next/headers + Supabase server client에 의존하므로 핵심 검증 로직만
// 별도 함수로 분리하여 테스트. Server Action은 통합 테스트(M7)에서 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateInstructorRemittanceInput,
  computeClientPayoutAmount,
} from "../instructor-remittance";
import { PAYOUT_ERRORS } from "../errors";

const BASE_SETTLEMENT = {
  id: "11111111-1111-1111-1111-111111111111",
  settlement_flow: "client_direct" as const,
  status: "pending" as const,
  instructor_remittance_amount_krw: 2_000_000,
  instructor_fee_krw: 3_000_000,
  withholding_tax_rate: "3.30",
  withholding_tax_amount_krw: 99_000,
};

// =============================================================================
// validateInstructorRemittanceInput
// =============================================================================

test("validateInstructorRemittanceInput: 정상 케이스 (pending + 일치 금액)", () => {
  const result = validateInstructorRemittanceInput(BASE_SETTLEMENT, {
    settlementId: BASE_SETTLEMENT.id,
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 2_000_000,
  });
  assert.equal(result.ok, true);
});

test("validateInstructorRemittanceInput: pending 외 상태 → STATUS_INVALID_TRANSITION", () => {
  const result = validateInstructorRemittanceInput(
    { ...BASE_SETTLEMENT, status: "requested" },
    {
      settlementId: BASE_SETTLEMENT.id,
      remittanceDate: "2026-04-29",
      remittanceAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
  }
});

test("validateInstructorRemittanceInput: paid → STATUS_PAID_FROZEN", () => {
  const result = validateInstructorRemittanceInput(
    { ...BASE_SETTLEMENT, status: "paid" },
    {
      settlementId: BASE_SETTLEMENT.id,
      remittanceDate: "2026-04-29",
      remittanceAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_PAID_FROZEN);
  }
});

test("validateInstructorRemittanceInput: client_direct 외 흐름 → STATUS_INVALID_TRANSITION", () => {
  const result = validateInstructorRemittanceInput(
    { ...BASE_SETTLEMENT, settlement_flow: "corporate" as const },
    {
      settlementId: BASE_SETTLEMENT.id,
      remittanceDate: "2026-04-29",
      remittanceAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
});

test("validateInstructorRemittanceInput: 금액 불일치 → REMITTANCE_AMOUNT_MISMATCH", () => {
  const result = validateInstructorRemittanceInput(BASE_SETTLEMENT, {
    settlementId: BASE_SETTLEMENT.id,
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 1_500_000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});

test("validateInstructorRemittanceInput: instructor_remittance_amount_krw NULL → REMITTANCE_AMOUNT_MISMATCH", () => {
  const result = validateInstructorRemittanceInput(
    { ...BASE_SETTLEMENT, instructor_remittance_amount_krw: null },
    {
      settlementId: BASE_SETTLEMENT.id,
      remittanceDate: "2026-04-29",
      remittanceAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});

// =============================================================================
// computeClientPayoutAmount — 고객사가 강사에게 송금한 금액 (정보용)
// =============================================================================

test("computeClientPayoutAmount: 정상 케이스 (instructor_fee - withholding)", () => {
  // instructor_fee_krw 3,000,000 - withholding_tax_amount_krw 99,000 = 2,901,000
  const result = computeClientPayoutAmount(BASE_SETTLEMENT);
  assert.equal(result, 2_901_000);
});

test("computeClientPayoutAmount: withholding_tax_amount_krw NULL → instructor_fee 그대로", () => {
  const result = computeClientPayoutAmount({
    ...BASE_SETTLEMENT,
    withholding_tax_amount_krw: null,
  });
  assert.equal(result, 3_000_000);
});

test("computeClientPayoutAmount: 8.80% rate 정상 계산", () => {
  // fee 4,000,000 * 8.80% = 352,000 → 4,000,000 - 352,000 = 3,648,000
  const result = computeClientPayoutAmount({
    ...BASE_SETTLEMENT,
    instructor_fee_krw: 4_000_000,
    withholding_tax_rate: "8.80",
    withholding_tax_amount_krw: 352_000,
  });
  assert.equal(result, 3_648_000);
});
