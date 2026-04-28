// @MX:ANCHOR: SPEC-PAYOUT-001 §M3 — settlements CRUD + 상태 전환 (atomic UPDATE).
// @MX:REASON: 모든 status 변경의 단일 통로. SETTLEMENT_UPDATABLE_COLUMNS 화이트리스트가
//             GENERATED 컬럼(profit_krw / withholding_tax_amount_krw) INSERT/UPDATE 를 차단한다.
// @MX:WARN: profit_krw / withholding_tax_amount_krw 를 페이로드에 직접 추가하지 말 것 — DB CHECK 위반.
// @MX:REASON: settlement.ts 스키마는 두 컬럼을 GENERATED ALWAYS AS STORED 로 선언한다.

import type { PostgrestError } from "@supabase/supabase-js";
import { PAYOUT_ERRORS } from "./errors";
import type {
  Settlement,
  SettlementFlow,
  SettlementStatus,
} from "./types";
import type { PayoutListQuery } from "./list-query";
import { periodToUtcRange } from "./list-query";

/** Supabase client (Database 제네릭 회피용 최소 시그니처). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

/** UPDATE 가능한 컬럼 화이트리스트 (GENERATED 보호). */
export const SETTLEMENT_UPDATABLE_COLUMNS = [
  "settlement_flow",
  "status",
  "business_amount_krw",
  "instructor_fee_krw",
  "withholding_tax_rate",
  "payment_received_at",
  "payout_sent_at",
  "tax_invoice_issued",
  "tax_invoice_issued_at",
  "notes",
  "deleted_at",
  "updated_at",
] as const;

const SELECT_COLUMNS =
  "id, project_id, instructor_id, settlement_flow, status, business_amount_krw, instructor_fee_krw, withholding_tax_rate, profit_krw, withholding_tax_amount_krw, payment_received_at, payout_sent_at, tax_invoice_issued, tax_invoice_issued_at, notes, deleted_at, created_at, updated_at, created_by";

export interface ListSettlementsResult {
  items: Settlement[];
  total: number;
}

/** filter + pagination 적용 SELECT. deleted_at IS NULL 자동 필터. */
export async function listSettlements(
  supabase: SupaLike,
  query: PayoutListQuery,
): Promise<ListSettlementsResult> {
  const { rangeStart, rangeEnd } = computeRange(query.page, query.pageSize);

  let req = supabase
    .from("settlements")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (query.status.length > 0) req = req.in("status", query.status);
  if (query.flow) req = req.eq("settlement_flow", query.flow);
  if (query.instructorId) req = req.eq("instructor_id", query.instructorId);
  if (query.period) {
    const { startIso, endIso } = periodToUtcRange(query.period);
    req = req.gte("created_at", startIso).lt("created_at", endIso);
  }

  const { data, count, error } = await req.range(rangeStart, rangeEnd - 1);
  if (error) {
    console.error("[payouts.queries.listSettlements] failed", error);
    return { items: [], total: 0 };
  }
  return {
    items: (data ?? []) as Settlement[],
    total: count ?? 0,
  };
}

/** id 단일 조회. deleted 또는 없으면 null. */
export async function getSettlement(
  supabase: SupaLike,
  id: string,
): Promise<Settlement | null> {
  const { data, error } = await supabase
    .from("settlements")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[payouts.queries.getSettlement] failed", error);
    return null;
  }
  return (data ?? null) as Settlement | null;
}

export interface UpdateResult {
  ok: boolean;
  error?: string;
  /** affected row 수. 0 = stale concurrency 충돌. */
  affected?: number;
}

/**
 * status 전환 atomic UPDATE.
 * `WHERE id=$1 AND status=$expectedFrom` 조건으로 동시성 충돌 시 affected=0 보장.
 * 추가로 갱신할 컬럼은 extraColumns 로 주입 (e.g. payment_received_at).
 */
export async function transitionSettlementStatus(
  supabase: SupaLike,
  params: {
    id: string;
    expectedFrom: SettlementStatus;
    to: SettlementStatus;
    extraColumns?: Record<string, unknown>;
  },
): Promise<UpdateResult> {
  const payload = sanitizePayload({
    status: params.to,
    updated_at: new Date().toISOString(),
    ...(params.extraColumns ?? {}),
  });

  const { data, error } = await supabase
    .from("settlements")
    .update(payload)
    .eq("id", params.id)
    .eq("status", params.expectedFrom)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    return { ok: false, error: messageFromError(error) };
  }
  const affected = Array.isArray(data) ? data.length : 0;
  if (affected === 0) {
    return { ok: false, error: PAYOUT_ERRORS.STALE_TRANSITION, affected: 0 };
  }
  return { ok: true, affected };
}

export async function markPaid(
  supabase: SupaLike,
  id: string,
): Promise<UpdateResult> {
  return transitionSettlementStatus(supabase, {
    id,
    expectedFrom: "requested",
    to: "paid",
    extraColumns: { payment_received_at: new Date().toISOString() },
  });
}

export async function holdSettlement(
  supabase: SupaLike,
  params: { id: string; from: SettlementStatus; notes?: string },
): Promise<UpdateResult> {
  const extra: Record<string, unknown> = {};
  if (typeof params.notes === "string" && params.notes.length > 0) {
    extra.notes = params.notes;
  }
  return transitionSettlementStatus(supabase, {
    id: params.id,
    expectedFrom: params.from,
    to: "held",
    extraColumns: extra,
  });
}

export async function resumeSettlement(
  supabase: SupaLike,
  id: string,
): Promise<UpdateResult> {
  return transitionSettlementStatus(supabase, {
    id,
    expectedFrom: "held",
    to: "requested",
  });
}

/** soft delete — deleted_at 갱신. (admin 전용 호출 가정) */
export async function softDeleteSettlement(
  supabase: SupaLike,
  id: string,
): Promise<UpdateResult> {
  const payload = sanitizePayload({
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await supabase
    .from("settlements")
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, error: messageFromError(error) };
  const affected = Array.isArray(data) ? data.length : 0;
  return affected > 0
    ? { ok: true, affected }
    : { ok: false, error: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND, affected: 0 };
}

/** SELECT settlement_status_history WHERE settlement_id=$1 ORDER BY changed_at DESC. */
export interface SettlementHistoryRow {
  id: string;
  settlement_id: string;
  from_status: SettlementStatus | null;
  to_status: SettlementStatus;
  changed_by: string | null;
  changed_at: string;
}

export async function listSettlementHistory(
  supabase: SupaLike,
  settlementId: string,
): Promise<SettlementHistoryRow[]> {
  const { data, error } = await supabase
    .from("settlement_status_history")
    .select("id, settlement_id, from_status, to_status, changed_by, changed_at")
    .eq("settlement_id", settlementId)
    .order("changed_at", { ascending: false });
  if (error) {
    console.error("[payouts.queries.listSettlementHistory] failed", error);
    return [];
  }
  return (data ?? []) as SettlementHistoryRow[];
}

/** 페이로드에서 GENERATED 컬럼 + 화이트리스트 외 키 제거. */
export function sanitizePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(SETTLEMENT_UPDATABLE_COLUMNS);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

function computeRange(
  page: number,
  pageSize: number,
): { rangeStart: number; rangeEnd: number } {
  const safe = Math.max(1, page);
  const start = (safe - 1) * pageSize;
  return { rangeStart: start, rangeEnd: start + pageSize };
}

function messageFromError(e: PostgrestError | { message?: string }): string {
  return (
    (e as { message?: string }).message ?? PAYOUT_ERRORS.GENERIC_FAILED
  );
}

/** 신규 정산 행 INSERT (admin/seed 용). GENERATED 컬럼 자동 제외. */
export async function createSettlement(
  supabase: SupaLike,
  data: {
    project_id: string;
    instructor_id: string;
    settlement_flow: SettlementFlow;
    business_amount_krw: number;
    instructor_fee_krw: number;
    withholding_tax_rate: number | string;
    notes?: string | null;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = sanitizePayload({
    ...data,
  });
  // project_id, instructor_id 는 화이트리스트에 없으므로 명시 추가 (INSERT 전용 키).
  const insertPayload = {
    project_id: data.project_id,
    instructor_id: data.instructor_id,
    ...payload,
  };
  const { data: inserted, error } = await supabase
    .from("settlements")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) return { ok: false, error: messageFromError(error) };
  return { ok: true, id: (inserted as { id: string }).id };
}
