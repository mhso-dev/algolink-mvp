// SPEC-ME-001 §2.6 REQ-ME-SET-001/002/008 — 정산 월별 그룹핑 + flow별 분리.
// 순수 함수. Asia/Seoul 타임존 기준 YYYY-MM 키 생성.
// @MX:NOTE: settlements 화면의 단일 그룹/필터 진실 공급원. 단위 테스트로 회계 검증.

import {
  summarizeSettlements,
  type SettlementInput,
  type SettlementStatus,
  type SettlementFlow,
  type SettlementSummary,
} from "./settlement-summary";

const KST_TIME_ZONE = "Asia/Seoul";

export interface SettlementRecord extends SettlementInput {
  id: string;
  projectTitle: string;
  clientName: string | null;
  /** 강의 기간 시작 (ISO 또는 YYYY-MM-DD). 그룹 키 산출의 기준일. */
  educationStartAt: string | null;
  educationEndAt: string | null;
  payoutSentAt: string | null;
  paymentReceivedAt: string | null;
  withholdingTaxAmountKrw: number | bigint;
}

export interface MonthlyGroup {
  /** YYYY-MM (KST). null = 강의 시작일 미정. */
  monthKey: string | null;
  /** 표시용 라벨. null monthKey 일 때는 "기간 미정". */
  label: string;
  records: SettlementRecord[];
  summary: SettlementSummary;
}

/**
 * Asia/Seoul 타임존 기준으로 YYYY-MM 키를 만든다.
 * - null/빈 값/파싱 실패 → null.
 * - "YYYY-MM-DD" 단순 date-only 도 안전하게 처리.
 */
export function toKstMonthKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}`;
  const ts = Date.parse(input);
  if (!Number.isFinite(ts)) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(ts));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) return null;
  return `${year}-${month}`;
}

/** "YYYY-MM" → "YYYY년 M월" (한국어). null → "기간 미정". */
export function formatMonthLabel(monthKey: string | null): string {
  if (!monthKey) return "기간 미정";
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${m[1]}년 ${Number(m[2])}월`;
}

/**
 * settlements 를 educationStartAt KST 월 단위로 그룹핑한다.
 * 정렬: monthKey DESC (최신 월 위), null 그룹은 맨 아래.
 */
export function groupByMonth(records: readonly SettlementRecord[]): MonthlyGroup[] {
  const buckets = new Map<string | null, SettlementRecord[]>();
  for (const r of records) {
    const key = toKstMonthKey(r.educationStartAt);
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  const groups: MonthlyGroup[] = [];
  for (const [monthKey, recs] of buckets) {
    groups.push({
      monthKey,
      label: formatMonthLabel(monthKey),
      records: recs,
      summary: summarizeSettlements(recs),
    });
  }
  groups.sort((a, b) => {
    if (a.monthKey === null) return 1;
    if (b.monthKey === null) return -1;
    return b.monthKey.localeCompare(a.monthKey);
  });
  return groups;
}

export interface FlowBreakdown {
  flow: SettlementFlow;
  summary: SettlementSummary;
}

/** settlement_flow 별 합계 (인건비 vs 세금계산서). */
export function breakdownByFlow(records: readonly SettlementRecord[]): FlowBreakdown[] {
  const flows: SettlementFlow[] = ["government", "corporate"];
  return flows
    .map((flow) => ({
      flow,
      summary: summarizeSettlements(records.filter((r) => r.settlementFlow === flow)),
    }))
    .filter((b) => b.summary.count > 0);
}

/** 상태 필터 helper. status 배열이 비어있으면 그대로 반환. */
export function filterByStatus(
  records: readonly SettlementRecord[],
  statuses: readonly SettlementStatus[],
): SettlementRecord[] {
  if (statuses.length === 0) return [...records];
  const set = new Set<SettlementStatus>(statuses);
  return records.filter((r) => set.has(r.status));
}
