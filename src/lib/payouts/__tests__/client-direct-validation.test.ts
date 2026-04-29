// SPEC-RECEIPT-001 §M2 — client-direct-validation 단위 테스트.
// REQ-RECEIPT-INSTRUCTOR-003, REQ-RECEIPT-OPERATOR-003 (zod 사전 거부).
// REQ-RECEIPT-FLOW-005 (TAX_RATE_CLIENT_DIRECT_INVALID).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructorRemittanceSchema,
  buildOperatorConfirmationSchema,
} from "../client-direct-validation";
import { validateTaxRate } from "../tax-calculator";
import { PAYOUT_ERRORS } from "../errors";

// =============================================================================
// validateTaxRate(client_direct, ...) — 화이트리스트 + 거부
// =============================================================================

test("validateTaxRate: client_direct + 3.30 → ok", () => {
  const r = validateTaxRate("client_direct", 3.3);
  assert.equal(r.ok, true);
});

test("validateTaxRate: client_direct + 8.80 → ok", () => {
  const r = validateTaxRate("client_direct", 8.8);
  assert.equal(r.ok, true);
});

test("validateTaxRate: client_direct + 0 → TAX_RATE_CLIENT_DIRECT_INVALID", () => {
  const r = validateTaxRate("client_direct", 0);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, PAYOUT_ERRORS.TAX_RATE_CLIENT_DIRECT_INVALID);
  }
});

test("validateTaxRate: client_direct + 5 → TAX_RATE_CLIENT_DIRECT_INVALID", () => {
  const r = validateTaxRate("client_direct", 5);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, PAYOUT_ERRORS.TAX_RATE_CLIENT_DIRECT_INVALID);
  }
});

// =============================================================================
// 강사 송금 등록 zod 스키마 (REMITTANCE_AMOUNT_MISMATCH)
// =============================================================================

test("instructorRemittanceSchema: 송금 금액 일치 → 통과", () => {
  const schema = buildInstructorRemittanceSchema(2_000_000);
  const result = schema.safeParse({
    settlementId: "11111111-1111-1111-1111-111111111111",
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 2_000_000,
  });
  assert.equal(result.success, true);
});

test("instructorRemittanceSchema: 송금 금액 불일치 → REMITTANCE_AMOUNT_MISMATCH 에러", () => {
  const schema = buildInstructorRemittanceSchema(2_000_000);
  const result = schema.safeParse({
    settlementId: "11111111-1111-1111-1111-111111111111",
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 1_500_000,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    assert.ok(
      messages.includes(PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH),
      `expected REMITTANCE_AMOUNT_MISMATCH in errors, got: ${JSON.stringify(messages)}`,
    );
  }
});

test("instructorRemittanceSchema: 잘못된 UUID 형식 → 거부", () => {
  const schema = buildInstructorRemittanceSchema(1_000_000);
  const result = schema.safeParse({
    settlementId: "not-a-uuid",
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 1_000_000,
  });
  assert.equal(result.success, false);
});

test("instructorRemittanceSchema: 잘못된 날짜 형식 → 거부", () => {
  const schema = buildInstructorRemittanceSchema(1_000_000);
  const result = schema.safeParse({
    settlementId: "11111111-1111-1111-1111-111111111111",
    remittanceDate: "not-a-date",
    remittanceAmountKrw: 1_000_000,
  });
  assert.equal(result.success, false);
});

// =============================================================================
// 운영자 수취 확인 zod 스키마
// =============================================================================

test("operatorConfirmationSchema: 입금 금액 일치 → 통과", () => {
  const schema = buildOperatorConfirmationSchema(2_000_000);
  const result = schema.safeParse({
    settlementId: "22222222-2222-2222-2222-222222222222",
    receivedDate: "2026-04-30",
    receivedAmountKrw: 2_000_000,
    memo: "정상 수취",
  });
  assert.equal(result.success, true);
});

test("operatorConfirmationSchema: 입금 금액 불일치 → REMITTANCE_AMOUNT_MISMATCH 에러", () => {
  const schema = buildOperatorConfirmationSchema(2_000_000);
  const result = schema.safeParse({
    settlementId: "22222222-2222-2222-2222-222222222222",
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_999_000,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    assert.ok(messages.includes(PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH));
  }
});

test("operatorConfirmationSchema: memo optional/null 허용", () => {
  const schema = buildOperatorConfirmationSchema(1_000_000);
  const result1 = schema.safeParse({
    settlementId: "33333333-3333-3333-3333-333333333333",
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_000_000,
  });
  assert.equal(result1.success, true);
  const result2 = schema.safeParse({
    settlementId: "33333333-3333-3333-3333-333333333333",
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_000_000,
    memo: null,
  });
  assert.equal(result2.success, true);
});

test("operatorConfirmationSchema: memo 너무 길면 거부 (max 2000)", () => {
  const schema = buildOperatorConfirmationSchema(1_000_000);
  const result = schema.safeParse({
    settlementId: "33333333-3333-3333-3333-333333333333",
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_000_000,
    memo: "x".repeat(2001),
  });
  assert.equal(result.success, false);
});

// =============================================================================
// 신규 에러 메시지 단일 출처 검증
// =============================================================================

test("PAYOUT_ERRORS: 6개 신규 에러 메시지 한국어 단일 출처", () => {
  assert.equal(
    PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH,
    "송금 금액이 정산 정보와 일치하지 않습니다.",
  );
  assert.equal(
    PAYOUT_ERRORS.RECEIPT_ALREADY_ISSUED,
    "이미 영수증이 발급된 정산입니다.",
  );
  assert.match(
    PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED,
    /영수증 생성 중 오류/,
  );
  assert.match(
    PAYOUT_ERRORS.ORGANIZATION_INFO_MISSING,
    /알고링크 사업자 정보가 설정되지 않았습니다/,
  );
  assert.equal(
    PAYOUT_ERRORS.STORAGE_UPLOAD_FAILED,
    "영수증 파일 업로드에 실패했습니다.",
  );
  assert.match(
    PAYOUT_ERRORS.TAX_RATE_CLIENT_DIRECT_INVALID,
    /고객 직접 정산 원천세율은 3.30% 또는 8.80%만 가능합니다/,
  );
});
