// SPEC-ME-001 §2.6 REQ-ME-SET-004 — 정산 합계 100% 커버.
// product.md §6 회계 정확성.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeWithholding,
  computeNet,
  summarizeSettlements,
  type SettlementInput,
} from "../settlement-summary";

// ---------- computeWithholding ----------

test("computeWithholding: corporate 0% → 0원", () => {
  const r = computeWithholding({
    status: "pending",
    settlementFlow: "corporate",
    instructorFeeKrw: 1_000_000,
    withholdingTaxRate: 0,
  });
  assert.equal(r, 0n);
});

test("computeWithholding: government 3.30% on 800,000 → 26,400원", () => {
  const r = computeWithholding({
    status: "paid",
    settlementFlow: "government",
    instructorFeeKrw: 800_000,
    withholdingTaxRate: 3.3,
  });
  assert.equal(r, 26_400n);
});

test("computeWithholding: government 3.30% on 800,001 → 26,400원 (floor)", () => {
  // 800001 * 330 / 10000 = 26400.033 → floor 26400.
  const r = computeWithholding({
    status: "paid",
    settlementFlow: "government",
    instructorFeeKrw: 800_001,
    withholdingTaxRate: 3.3,
  });
  assert.equal(r, 26_400n);
});

test("computeWithholding: government 8.80% on 1,000,000 → 88,000원", () => {
  const r = computeWithholding({
    status: "pending",
    settlementFlow: "government",
    instructorFeeKrw: 1_000_000,
    withholdingTaxRate: 8.8,
  });
  assert.equal(r, 88_000n);
});

test("computeWithholding: 1조원 BigInt 정밀도", () => {
  const fee = 1_000_000_000_000n;
  const r = computeWithholding({
    status: "pending",
    settlementFlow: "government",
    instructorFeeKrw: fee,
    withholdingTaxRate: 3.3,
  });
  assert.equal(r, 33_000_000_000n);
});

test("computeWithholding: numeric 문자열 입력 (Drizzle)", () => {
  const r = computeWithholding({
    status: "pending",
    settlementFlow: "government",
    instructorFeeKrw: "500000",
    withholdingTaxRate: "3.30",
  });
  assert.equal(r, 16_500n);
});

test("computeWithholding: 음수 fee → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: -1,
        withholdingTaxRate: 0,
      }),
    /음수/,
  );
});

test("computeWithholding: 음수 rate → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: 1000,
        withholdingTaxRate: -1,
      }),
    /음수/,
  );
});

test("computeWithholding: corporate인데 rate != 0 → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: 1000,
        withholdingTaxRate: 3.3,
      }),
    /corporate/,
  );
});

test("computeWithholding: government rate 화이트리스트 외 → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "government",
        instructorFeeKrw: 1000,
        withholdingTaxRate: 5.5,
      }),
    /government/,
  );
});

test("computeWithholding: 비정수 number → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: 1000.5,
        withholdingTaxRate: 0,
      }),
    /정수/,
  );
});

test("computeWithholding: NaN → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: NaN,
        withholdingTaxRate: 0,
      }),
    /유한/,
  );
});

test("computeWithholding: 잘못된 fee 문자열 → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: "abc",
        withholdingTaxRate: 0,
      }),
    /형식 오류/,
  );
});

test("computeWithholding: 잘못된 rate 문자열 → throw", () => {
  assert.throws(
    () =>
      computeWithholding({
        status: "pending",
        settlementFlow: "government",
        instructorFeeKrw: 1000,
        withholdingTaxRate: "abc",
      }),
    /원천세율/,
  );
});

// ---------- computeNet ----------

test("computeNet: government 3.30% 800,000 → 773,600원", () => {
  const r = computeNet({
    status: "paid",
    settlementFlow: "government",
    instructorFeeKrw: 800_000,
    withholdingTaxRate: 3.3,
  });
  assert.equal(r, 773_600n);
});

test("computeNet: corporate 1,000,000 → 1,000,000원", () => {
  const r = computeNet({
    status: "pending",
    settlementFlow: "corporate",
    instructorFeeKrw: 1_000_000,
    withholdingTaxRate: 0,
  });
  assert.equal(r, 1_000_000n);
});

// ---------- summarizeSettlements ----------

test("summarizeSettlements: 빈 배열 → 모든 합계 0n", () => {
  const r = summarizeSettlements([]);
  assert.equal(r.totalFeeKrw, 0n);
  assert.equal(r.totalWithholdingKrw, 0n);
  assert.equal(r.totalNetKrw, 0n);
  assert.equal(r.unsettledNetKrw, 0n);
  assert.equal(r.count, 0);
});

test("summarizeSettlements: 시나리오 10 (corp 1M pending + gov 3.30 800K paid)", () => {
  const rows: SettlementInput[] = [
    {
      status: "pending",
      settlementFlow: "corporate",
      instructorFeeKrw: 1_000_000,
      withholdingTaxRate: 0,
    },
    {
      status: "paid",
      settlementFlow: "government",
      instructorFeeKrw: 800_000,
      withholdingTaxRate: 3.3,
    },
  ];
  const r = summarizeSettlements(rows);
  assert.equal(r.totalFeeKrw, 1_800_000n);
  assert.equal(r.totalWithholdingKrw, 26_400n);
  assert.equal(r.totalNetKrw, 1_773_600n);
  assert.equal(r.unsettledNetKrw, 1_000_000n);
  assert.equal(r.count, 2);
});

test("summarizeSettlements: 혼합 (corp + gov 3.30 + gov 8.80)", () => {
  const rows: SettlementInput[] = [
    {
      status: "pending",
      settlementFlow: "corporate",
      instructorFeeKrw: 500_000,
      withholdingTaxRate: 0,
    },
    {
      status: "requested",
      settlementFlow: "government",
      instructorFeeKrw: 600_000,
      withholdingTaxRate: 3.3,
    },
    {
      status: "paid",
      settlementFlow: "government",
      instructorFeeKrw: 700_000,
      withholdingTaxRate: 8.8,
    },
  ];
  const r = summarizeSettlements(rows);
  // 원천: 0 + 19800 + 61600 = 81400
  assert.equal(r.totalFeeKrw, 1_800_000n);
  assert.equal(r.totalWithholdingKrw, 81_400n);
  assert.equal(r.totalNetKrw, 1_718_600n);
  // 미정산: 500000 + (600000-19800) = 1_080_200
  assert.equal(r.unsettledNetKrw, 1_080_200n);
  assert.equal(r.count, 3);
});

test("summarizeSettlements: held/paid는 미정산 합계 제외", () => {
  const rows: SettlementInput[] = [
    {
      status: "held",
      settlementFlow: "corporate",
      instructorFeeKrw: 100_000,
      withholdingTaxRate: 0,
    },
    {
      status: "paid",
      settlementFlow: "corporate",
      instructorFeeKrw: 200_000,
      withholdingTaxRate: 0,
    },
  ];
  const r = summarizeSettlements(rows);
  assert.equal(r.unsettledNetKrw, 0n);
  assert.equal(r.totalFeeKrw, 300_000n);
});

test("summarizeSettlements: 1조원대 누적 BigInt 정밀도", () => {
  const rows: SettlementInput[] = Array.from({ length: 1000 }, () => ({
    status: "paid" as const,
    settlementFlow: "government" as const,
    instructorFeeKrw: 1_000_000_000n,
    withholdingTaxRate: 3.3,
  }));
  const r = summarizeSettlements(rows);
  assert.equal(r.totalFeeKrw, 1_000_000_000_000n);
  assert.equal(r.totalWithholdingKrw, 33_000_000_000n);
  assert.equal(r.totalNetKrw, 967_000_000_000n);
  assert.equal(r.count, 1000);
});

test("summarizeSettlements: 음수 row 포함 → throw", () => {
  assert.throws(() =>
    summarizeSettlements([
      {
        status: "pending",
        settlementFlow: "corporate",
        instructorFeeKrw: -1,
        withholdingTaxRate: 0,
      },
    ]),
  );
});
