// SPEC-PAYOUT-001 §2.1 REQ-PAYOUT-LIST — URL searchParams → 정규화된 ListQuery.
// 순수 함수로 단위 테스트 가능. period 는 month(YYYY-MM) / quarter(YYYY-Qn) / year(YYYY) 지원.

import { z } from "zod";
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_FLOWS,
  type SettlementStatus,
  type SettlementFlow,
} from "./types";
import { SETTLEMENT_PAGE_SIZE } from "./constants";

const STATUS_SET = new Set<string>(SETTLEMENT_STATUSES);
const FLOW_SET = new Set<string>(SETTLEMENT_FLOWS);

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const quarterRe = /^\d{4}-Q[1-4]$/;
const yearRe = /^\d{4}$/;

const uuidSchema = z.string().uuid();

export type PeriodKind = "month" | "quarter" | "year";

export interface PayoutPeriod {
  kind: PeriodKind;
  /** 원본 표현 (e.g. "2026-05", "2026-Q2", "2026"). */
  raw: string;
}

export interface PayoutListQuery {
  status: SettlementStatus[];
  flow: SettlementFlow | null;
  instructorId: string | null;
  period: PayoutPeriod | null;
  page: number;
  pageSize: number;
}

export function parsePayoutsQuery(
  raw: Record<string, string | string[] | undefined>,
): PayoutListQuery {
  const getOne = (k: string): string | null => {
    const v = raw[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const getMany = (k: string): string[] => {
    const v = raw[k];
    if (Array.isArray(v))
      return v.filter((x) => typeof x === "string" && x.length > 0);
    if (typeof v === "string" && v.length > 0)
      return v.split(",").filter(Boolean);
    return [];
  };

  const status = getMany("status").filter((s): s is SettlementStatus =>
    STATUS_SET.has(s),
  );

  const flowRaw = getOne("flow");
  const flow: SettlementFlow | null =
    flowRaw && FLOW_SET.has(flowRaw) ? (flowRaw as SettlementFlow) : null;

  const instructorRaw =
    getOne("instructor_id") ?? getOne("instructorId");
  const instructorId =
    instructorRaw && uuidSchema.safeParse(instructorRaw).success
      ? instructorRaw
      : null;

  const period = parsePeriod(getOne("period"));

  const pageRaw = Number.parseInt(getOne("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    status,
    flow,
    instructorId,
    period,
    page,
    pageSize: SETTLEMENT_PAGE_SIZE,
  };
}

export function parsePeriod(raw: string | null | undefined): PayoutPeriod | null {
  if (!raw) return null;
  if (monthRe.test(raw)) return { kind: "month", raw };
  if (quarterRe.test(raw)) return { kind: "quarter", raw };
  if (yearRe.test(raw)) return { kind: "year", raw };
  return null;
}

/** Asia/Seoul 기준 [start, end) UTC ISO 범위 계산. KST 는 UTC+9 고정 (DST 없음). */
export function periodToUtcRange(period: PayoutPeriod): {
  startIso: string;
  endIso: string;
} {
  if (period.kind === "month") {
    const [y, m] = period.raw.split("-").map(Number);
    return kstRange(y, m, 1, y, m + 1, 1);
  }
  if (period.kind === "quarter") {
    const [yStr, qStr] = period.raw.split("-Q");
    const y = Number(yStr);
    const q = Number(qStr);
    const startMonth = (q - 1) * 3 + 1;
    return kstRange(y, startMonth, 1, y, startMonth + 3, 1);
  }
  // year
  const y = Number(period.raw);
  return kstRange(y, 1, 1, y + 1, 1, 1);
}

/** KST 자정 → UTC ISO. (월/일이 12 초과/13 등이면 자동 정규화) */
function kstRange(
  y1: number,
  m1: number,
  d1: number,
  y2: number,
  m2: number,
  d2: number,
): { startIso: string; endIso: string } {
  // KST 자정 = UTC 전날 15:00.
  const startUtc = new Date(Date.UTC(y1, m1 - 1, d1, -9, 0, 0));
  const endUtc = new Date(Date.UTC(y2, m2 - 1, d2, -9, 0, 0));
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

/** 페이지네이션 메타. */
export function computePayoutPagination(
  total: number,
  page: number,
  pageSize: number = SETTLEMENT_PAGE_SIZE,
): {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  needsRedirect: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const needsRedirect = page > totalPages;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = (safePage - 1) * pageSize;
  const rangeEnd = Math.min(rangeStart + pageSize, total);
  return {
    page: safePage,
    totalPages,
    total,
    pageSize,
    rangeStart,
    rangeEnd,
    needsRedirect,
  };
}

export function serializePayoutsQuery(q: Partial<PayoutListQuery>): string {
  const params = new URLSearchParams();
  if (q.status && q.status.length > 0) params.set("status", q.status.join(","));
  if (q.flow) params.set("flow", q.flow);
  if (q.instructorId) params.set("instructor_id", q.instructorId);
  if (q.period) params.set("period", q.period.raw);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  return params.toString();
}
