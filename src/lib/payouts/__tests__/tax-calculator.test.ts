// SPEC-PAYOUT-001 §M2 — 세율 검증 + GENERATED 공식 일치 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateTaxRate,
  calculateWithholdingAmount,
  calculateProfit,
} from "../tax-calculator";
import { PAYOUT_ERRORS } from "../errors";

test("validateTaxRate: corporate + 0 → ok", () => {
  assert.equal(validateTaxRate("corporate", 0).ok, true);
});

test("validateTaxRate: corporate + 5 → CORPORATE_NONZERO", () => {
  const r = validateTaxRate("corporate", 5);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, PAYOUT_ERRORS.TAX_RATE_CORPORATE_NONZERO);
});

test("validateTaxRate: government + 3.30 / 8.80 → ok", () => {
  assert.equal(validateTaxRate("government", 3.3).ok, true);
  assert.equal(validateTaxRate("government", 8.8).ok, true);
});

test("validateTaxRate: government + 5.00 → GOVERNMENT_INVALID", () => {
  const r = validateTaxRate("government", 5);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, PAYOUT_ERRORS.TAX_RATE_GOVERNMENT_INVALID);
});

test("validateTaxRate: government + 0 → GOVERNMENT_INVALID (정부는 0 불가)", () => {
  const r = validateTaxRate("government", 0);
  assert.equal(r.ok, false);
});

test("validateTaxRate: NaN/Infinity → reject", () => {
  assert.equal(validateTaxRate("government", NaN).ok, false);
  assert.equal(validateTaxRate("corporate", Infinity).ok, false);
});

test("calculateWithholdingAmount: floor(fee * rate / 100) — DB GENERATED 공식 일치", () => {
  // fee=3,000,000 × 3.30% = 99,000
  assert.equal(calculateWithholdingAmount(3_000_000, 3.3), 99_000);
  // fee=3,000,000 × 8.80% = 264,000
  assert.equal(calculateWithholdingAmount(3_000_000, 8.8), 264_000);
  // fee=5,000,000 × 0% = 0
  assert.equal(calculateWithholdingAmount(5_000_000, 0), 0);
  // fee=1,500,000 × 3.30% = 49,500
  assert.equal(calculateWithholdingAmount(1_500_000, 3.3), 49_500);
  // fee=4,000,000 × 8.80% = 352,000
  assert.equal(calculateWithholdingAmount(4_000_000, 8.8), 352_000);
});

test("calculateWithholdingAmount: 0 / 음수 입력 보호", () => {
  assert.equal(calculateWithholdingAmount(0, 3.3), 0);
  assert.equal(calculateWithholdingAmount(-1000, 3.3), 0);
  assert.equal(calculateWithholdingAmount(1000, -1), 0);
});

test("calculateProfit: business - fee", () => {
  assert.equal(calculateProfit(5_000_000, 3_000_000), 2_000_000);
  assert.equal(calculateProfit(2_000_000, 1_500_000), 500_000);
});
