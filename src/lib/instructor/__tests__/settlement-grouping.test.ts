// SPEC-ME-001 §2.6 REQ-ME-SET-001/004/008 — 월별 그룹핑 + flow 분기 + Asia/Seoul.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toKstMonthKey,
  formatMonthLabel,
  groupByMonth,
  breakdownByFlow,
  filterByStatus,
  type SettlementRecord,
} from "../settlement-grouping";

function rec(overrides: Partial<SettlementRecord> & Pick<SettlementRecord, "id">): SettlementRecord {
  return {
    id: overrides.id,
    status: overrides.status ?? "pending",
    settlementFlow: overrides.settlementFlow ?? "government",
    instructorFeeKrw: overrides.instructorFeeKrw ?? 1_000_000,
    withholdingTaxRate: overrides.withholdingTaxRate ?? 3.3,
    projectTitle: overrides.projectTitle ?? "프로젝트",
    clientName: overrides.clientName ?? "고객사",
    educationStartAt:
      "educationStartAt" in overrides ? overrides.educationStartAt ?? null : "2026-04-01",
    educationEndAt: overrides.educationEndAt ?? null,
    payoutSentAt: overrides.payoutSentAt ?? null,
    paymentReceivedAt: overrides.paymentReceivedAt ?? null,
    withholdingTaxAmountKrw: overrides.withholdingTaxAmountKrw ?? 0,
  };
}

test("toKstMonthKey: YYYY-MM-DD 단순 입력", () => {
  assert.equal(toKstMonthKey("2026-04-01"), "2026-04");
  assert.equal(toKstMonthKey("2026-12-31"), "2026-12");
});

test("toKstMonthKey: ISO timestamp UTC midnight → KST 기준 다음날", () => {
  assert.equal(toKstMonthKey("2026-04-30T15:00:00.000Z"), "2026-05");
  assert.equal(toKstMonthKey("2026-04-15T12:00:00.000Z"), "2026-04");
});

test("toKstMonthKey: null/빈/유효하지 않은 입력 → null", () => {
  assert.equal(toKstMonthKey(null), null);
  assert.equal(toKstMonthKey(undefined), null);
  assert.equal(toKstMonthKey(""), null);
  assert.equal(toKstMonthKey("not-a-date"), null);
});

test("formatMonthLabel: 한국어 포맷", () => {
  assert.equal(formatMonthLabel("2026-04"), "2026년 4월");
  assert.equal(formatMonthLabel("2026-12"), "2026년 12월");
  assert.equal(formatMonthLabel(null), "기간 미정");
});

test("groupByMonth: 월별 그룹핑 + 최신 월 먼저 + summary 계산", () => {
  const records: SettlementRecord[] = [
    rec({ id: "a", educationStartAt: "2026-04-01", instructorFeeKrw: 1_000_000, withholdingTaxRate: 3.3 }),
    rec({ id: "b", educationStartAt: "2026-04-15", instructorFeeKrw: 500_000, withholdingTaxRate: 3.3 }),
    rec({ id: "c", educationStartAt: "2026-03-10", instructorFeeKrw: 2_000_000, withholdingTaxRate: 8.8 }),
  ];
  const groups = groupByMonth(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.monthKey, "2026-04");
  assert.equal(groups[0]!.records.length, 2);
  assert.equal(groups[0]!.summary.totalWithholdingKrw, 49_500n);
  assert.equal(groups[1]!.monthKey, "2026-03");
  assert.equal(groups[1]!.summary.count, 1);
});

test("groupByMonth: educationStartAt null → '기간 미정' 그룹 + 마지막 정렬", () => {
  const records: SettlementRecord[] = [
    rec({ id: "a", educationStartAt: null }),
    rec({ id: "b", educationStartAt: "2026-04-01" }),
  ];
  const groups = groupByMonth(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.monthKey, "2026-04");
  assert.equal(groups[1]!.monthKey, null);
  assert.equal(groups[1]!.label, "기간 미정");
});

test("groupByMonth: 빈 입력 → 빈 배열", () => {
  assert.deepEqual(groupByMonth([]), []);
});

test("breakdownByFlow: 인건비/세금계산서 분리, 빈 그룹은 제외", () => {
  const records: SettlementRecord[] = [
    rec({ id: "a", settlementFlow: "government", withholdingTaxRate: 3.3, instructorFeeKrw: 1_000_000 }),
    rec({ id: "b", settlementFlow: "government", withholdingTaxRate: 8.8, instructorFeeKrw: 800_000 }),
    rec({ id: "c", settlementFlow: "corporate", withholdingTaxRate: 0, instructorFeeKrw: 5_000_000 }),
  ];
  const breakdown = breakdownByFlow(records);
  assert.equal(breakdown.length, 2);
  const gov = breakdown.find((b) => b.flow === "government")!;
  const corp = breakdown.find((b) => b.flow === "corporate")!;
  assert.equal(gov.summary.count, 2);
  assert.equal(gov.summary.totalFeeKrw, 1_800_000n);
  assert.equal(corp.summary.count, 1);
  assert.equal(corp.summary.totalWithholdingKrw, 0n);
});

test("breakdownByFlow: 빈 입력 → 빈 배열", () => {
  assert.deepEqual(breakdownByFlow([]), []);
});

test("filterByStatus: 빈 필터 → 모두 반환", () => {
  const records = [rec({ id: "a", status: "paid" }), rec({ id: "b", status: "pending" })];
  assert.equal(filterByStatus(records, []).length, 2);
});

test("filterByStatus: pending/requested 만 반환", () => {
  const records = [
    rec({ id: "a", status: "paid" }),
    rec({ id: "b", status: "pending" }),
    rec({ id: "c", status: "requested" }),
    rec({ id: "d", status: "held" }),
  ];
  const r = filterByStatus(records, ["pending", "requested"]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.id).sort(), ["b", "c"]);
});
