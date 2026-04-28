// SPEC-PAYOUT-001 §2.6 REQ-PAYOUT-AGGREGATE — 매입매출 집계.
// @MX:NOTE: 합계 계산은 status != 'held' AND deleted_at IS NULL 필터를 항상 적용.
//           held 는 분쟁/정지 상태로 매출 인식에서 제외 (KPI 왜곡 방지).

import type { PayoutPeriod } from "./list-query";
import { periodToUtcRange } from "./list-query";
import type { MonthlyAggregate, Settlement } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

const ZERO: MonthlyAggregate = {
  businessSum: 0,
  feeSum: 0,
  profitSum: 0,
  count: 0,
};

/**
 * 선택된 period 의 매입매출 합계.
 * basis = 'created' (기본) 또는 'payment' — created_at vs payment_received_at 기준.
 */
export async function computeMonthlyAggregate(
  supabase: SupaLike,
  period: PayoutPeriod,
  basis: "created" | "payment" = "created",
): Promise<MonthlyAggregate> {
  const { startIso, endIso } = periodToUtcRange(period);
  const dateColumn = basis === "payment" ? "payment_received_at" : "created_at";

  const { data, error } = await supabase
    .from("settlements")
    .select(
      "business_amount_krw, instructor_fee_krw, profit_krw, status, deleted_at",
    )
    .neq("status", "held")
    .is("deleted_at", null)
    .gte(dateColumn, startIso)
    .lt(dateColumn, endIso);

  if (error) {
    console.error("[payouts.aggregations] query failed", error);
    return { ...ZERO };
  }
  return aggregateRows(
    (data ?? []) as Pick<
      Settlement,
      "business_amount_krw" | "instructor_fee_krw" | "profit_krw"
    >[],
  );
}

/** 행 배열 → 합계 (테스트용 순수 함수). */
export function aggregateRows(
  rows: Array<{
    business_amount_krw: number | null;
    instructor_fee_krw: number | null;
    profit_krw: number | null;
  }>,
): MonthlyAggregate {
  let businessSum = 0;
  let feeSum = 0;
  let profitSum = 0;
  for (const r of rows) {
    businessSum += r.business_amount_krw ?? 0;
    feeSum += r.instructor_fee_krw ?? 0;
    profitSum += r.profit_krw ?? 0;
  }
  return { businessSum, feeSum, profitSum, count: rows.length };
}
