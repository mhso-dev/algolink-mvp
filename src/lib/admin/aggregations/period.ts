// SPEC-ADMIN-001 §3.3 F-302 — 기간 정의(month/quarter/year) + 범위 헬퍼.
// @MX:NOTE: anchor 시점 기준 from/to 범위(반열린 구간 [from, to)) 산출.

export type PeriodKind = "month" | "quarter" | "year";

export interface Period {
  kind: PeriodKind;
  /** 기준일 (해당 일자가 속한 month/quarter/year로 정규화). */
  anchor: Date;
}

export interface PeriodRange {
  from: Date; // inclusive (UTC)
  to: Date; // exclusive
}

const PERIOD_KIND_SET = new Set<string>(["month", "quarter", "year"]);

export function isPeriodKind(v: unknown): v is PeriodKind {
  return typeof v === "string" && PERIOD_KIND_SET.has(v);
}

/** UTC 기준 [from, to) 반환. month: 1개월, quarter: 3개월, year: 12개월. */
export function toRange(period: Period): PeriodRange {
  const a = period.anchor;
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth();

  if (period.kind === "month") {
    return {
      from: new Date(Date.UTC(y, m, 1)),
      to: new Date(Date.UTC(y, m + 1, 1)),
    };
  }
  if (period.kind === "quarter") {
    const qStartMonth = Math.floor(m / 3) * 3;
    return {
      from: new Date(Date.UTC(y, qStartMonth, 1)),
      to: new Date(Date.UTC(y, qStartMonth + 3, 1)),
    };
  }
  // year
  return {
    from: new Date(Date.UTC(y, 0, 1)),
    to: new Date(Date.UTC(y + 1, 0, 1)),
  };
}

/** 현재 시점 기준 default Period (month). */
export function currentPeriod(kind: PeriodKind = "month"): Period {
  return { kind, anchor: new Date() };
}
