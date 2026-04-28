// SPEC-PAYOUT-001 §M2 — zod cross-field 검증 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { settlementUpdateSchema } from "../validation";
import { PAYOUT_ERRORS } from "../errors";

test("settlementUpdateSchema: corporate + rate=0 + 정상 금액 → OK", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "corporate",
    withholding_tax_rate: 0,
    business_amount_krw: 5000000,
    instructor_fee_krw: 3000000,
    notes: null,
  });
  assert.equal(r.success, true);
});

test("settlementUpdateSchema: corporate + rate=5 → CORPORATE_NONZERO 거부", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "corporate",
    withholding_tax_rate: 5,
    business_amount_krw: 5000000,
    instructor_fee_krw: 3000000,
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const msgs = r.error.issues.map((i) => i.message);
    assert.ok(msgs.includes(PAYOUT_ERRORS.TAX_RATE_CORPORATE_NONZERO));
  }
});

test("settlementUpdateSchema: government + rate=3.30 → OK", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "government",
    withholding_tax_rate: 3.3,
    business_amount_krw: 4000000,
    instructor_fee_krw: 2500000,
  });
  assert.equal(r.success, true);
});

test("settlementUpdateSchema: government + rate=5.00 → GOVERNMENT_INVALID 거부", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "government",
    withholding_tax_rate: 5,
    business_amount_krw: 4000000,
    instructor_fee_krw: 2500000,
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const msgs = r.error.issues.map((i) => i.message);
    assert.ok(msgs.includes(PAYOUT_ERRORS.TAX_RATE_GOVERNMENT_INVALID));
  }
});

test("settlementUpdateSchema: business_amount_krw 음수 → 거부", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "corporate",
    withholding_tax_rate: 0,
    business_amount_krw: -1,
    instructor_fee_krw: 1000,
  });
  assert.equal(r.success, false);
});

test("settlementUpdateSchema: 문자열 숫자 coerce", () => {
  const r = settlementUpdateSchema.safeParse({
    settlement_flow: "government",
    withholding_tax_rate: "3.30",
    business_amount_krw: "4000000",
    instructor_fee_krw: "2500000",
  });
  assert.equal(r.success, true);
});
