// SPEC-RECEIPT-001 §M5 — operator-confirmation 핵심 검증 로직 단위 테스트.
// REQ-RECEIPT-OPERATOR-003 (validation 부분), REQ-RECEIPT-OPERATOR-005 (race-condition).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOperatorConfirmationInput } from "../operator-confirmation";
import { PAYOUT_ERRORS } from "../errors";

const BASE_SETTLEMENT = {
  id: "11111111-1111-1111-1111-111111111111",
  settlement_flow: "client_direct" as const,
  status: "requested" as const,
  instructor_remittance_amount_krw: 2_000_000,
  receipt_number: null as string | null,
};

// =============================================================================
// validateOperatorConfirmationInput
// =============================================================================

test("validateOperatorConfirmationInput: 정상 케이스 (requested + 일치 금액 + receipt_number NULL)", () => {
  const result = validateOperatorConfirmationInput(BASE_SETTLEMENT, {
    settlementId: BASE_SETTLEMENT.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 2_000_000,
  });
  assert.equal(result.ok, true);
});

test("validateOperatorConfirmationInput: pending → STATUS_INVALID_TRANSITION", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, status: "pending" },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
  }
});

test("validateOperatorConfirmationInput: paid → STATUS_PAID_FROZEN", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, status: "paid" },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_PAID_FROZEN);
  }
});

test("validateOperatorConfirmationInput: held → STATUS_INVALID_TRANSITION", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, status: "held" },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
  }
});

test("validateOperatorConfirmationInput: corporate flow → STATUS_INVALID_TRANSITION", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, settlement_flow: "corporate" as const },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
  }
});

test("validateOperatorConfirmationInput: 입금 금액 불일치 → REMITTANCE_AMOUNT_MISMATCH", () => {
  const result = validateOperatorConfirmationInput(BASE_SETTLEMENT, {
    settlementId: BASE_SETTLEMENT.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_999_000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});

test("validateOperatorConfirmationInput: receipt_number 이미 존재 → RECEIPT_ALREADY_ISSUED", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, receipt_number: "RCP-2026-0001" },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.RECEIPT_ALREADY_ISSUED);
  }
});

test("validateOperatorConfirmationInput: instructor_remittance_amount_krw NULL → REMITTANCE_AMOUNT_MISMATCH", () => {
  const result = validateOperatorConfirmationInput(
    { ...BASE_SETTLEMENT, instructor_remittance_amount_krw: null },
    {
      settlementId: BASE_SETTLEMENT.id,
      receivedDate: "2026-04-30",
      receivedAmountKrw: 2_000_000,
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});
