// SPEC-PAYOUT-001 §M3 — 매입매출 집계 순수 함수 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateRows } from "../aggregations";

test("aggregateRows: 빈 배열 → 모두 0", () => {
  assert.deepEqual(aggregateRows([]), {
    businessSum: 0,
    feeSum: 0,
    profitSum: 0,
    count: 0,
  });
});

test("aggregateRows: 5건 합산", () => {
  const r = aggregateRows([
    { business_amount_krw: 5_000_000, instructor_fee_krw: 3_000_000, profit_krw: 2_000_000 },
    { business_amount_krw: 4_000_000, instructor_fee_krw: 2_500_000, profit_krw: 1_500_000 },
    { business_amount_krw: 6_000_000, instructor_fee_krw: 4_000_000, profit_krw: 2_000_000 },
    { business_amount_krw: 3_000_000, instructor_fee_krw: 1_800_000, profit_krw: 1_200_000 },
    { business_amount_krw: 2_000_000, instructor_fee_krw: 1_500_000, profit_krw: 500_000 },
  ]);
  assert.equal(r.businessSum, 20_000_000);
  assert.equal(r.feeSum, 12_800_000);
  assert.equal(r.profitSum, 7_200_000);
  assert.equal(r.count, 5);
});

test("aggregateRows: null 안전 처리", () => {
  const r = aggregateRows([
    { business_amount_krw: 1_000_000, instructor_fee_krw: null, profit_krw: null },
  ]);
  assert.equal(r.businessSum, 1_000_000);
  assert.equal(r.feeSum, 0);
  assert.equal(r.profitSum, 0);
  assert.equal(r.count, 1);
});
