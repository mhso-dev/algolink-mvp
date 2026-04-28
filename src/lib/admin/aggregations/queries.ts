import "server-only";
// SPEC-ADMIN-001 §3.3 F-302 — 매출/매입/마진/Top-N 집계 쿼리.
// @MX:ANCHOR: admin 대시보드 read 단일 진입점. fan_in 예상 ≥ 3 (KPI 카드, trend, top lists).
// @MX:WARN: GENERATED 컬럼(projects.margin_krw, settlements.profit_krw)은 SUM에만 사용.
// @MX:REASON: 직접 산술 계산은 GENERATED 컬럼 의미를 우회 — 항상 컬럼 SELECT/SUM만 한다.
// @MX:SPEC: SPEC-ADMIN-001 §3.3 EARS C-1 ~ C-10

import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * drizzle execute 결과를 일관된 row[]로 정규화.
 * postgres-js는 array 자체를, drizzle wrapper는 { rows } 객체를 반환할 수 있어 양쪽 모두 처리.
 */
function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: unknown[] } | null | undefined;
  return ((r?.rows as T[] | undefined) ?? []) as T[];
}

/** 단일 SUM 결과 정수로 정규화 (null/undefined → 0). */
function toInt(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface SumQueryParams {
  from: Date;
  to: Date;
}

/**
 * 매출 = projects.business_amount_krw SUM (deleted_at IS NULL, created_at ∈ [from, to)).
 * EARS C-9.
 */
export async function sumRevenue(p: SumQueryParams): Promise<number> {
  const rows = asRows<{ total: string | number | null }>(
    await db.execute(sql`
      SELECT COALESCE(SUM(business_amount_krw), 0)::bigint AS total
      FROM public.projects
      WHERE deleted_at IS NULL
        AND created_at >= ${p.from.toISOString()}
        AND created_at < ${p.to.toISOString()}
    `),
  );
  return toInt(rows[0]?.total);
}

/**
 * 매입 = settlements.instructor_fee_krw SUM (status='paid', deleted_at IS NULL,
 * payment_received_at ∈ [from, to)).
 * EARS C-8.
 */
export async function sumCost(p: SumQueryParams): Promise<number> {
  const rows = asRows<{ total: string | number | null }>(
    await db.execute(sql`
      SELECT COALESCE(SUM(instructor_fee_krw), 0)::bigint AS total
      FROM public.settlements
      WHERE deleted_at IS NULL
        AND status = 'paid'
        AND payment_received_at >= ${p.from.toISOString()}
        AND payment_received_at < ${p.to.toISOString()}
    `),
  );
  return toInt(rows[0]?.total);
}

/**
 * 마진 = projects.margin_krw SUM. GENERATED 컬럼 직접 합산 (별도 산술 X).
 * EARS C-10.
 */
export async function sumMargin(p: SumQueryParams): Promise<number> {
  const rows = asRows<{ total: string | number | null }>(
    await db.execute(sql`
      SELECT COALESCE(SUM(margin_krw), 0)::bigint AS total
      FROM public.projects
      WHERE deleted_at IS NULL
        AND created_at >= ${p.from.toISOString()}
        AND created_at < ${p.to.toISOString()}
    `),
  );
  return toInt(rows[0]?.total);
}

export interface MonthlyTrendRow {
  month: string; // YYYY-MM-01 ISO
  revenue: number;
  cost: number;
  margin: number;
}

/**
 * 최근 N개월 시계열. 빈 월은 0으로 채워진다 (generate_series 기반).
 * EARS C-4.
 */
export async function getMonthlyTrend(months: number = 6): Promise<MonthlyTrendRow[]> {
  const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
  const rows = asRows<{
    month: string;
    revenue: string | number | null;
    cost: string | number | null;
    margin: string | number | null;
  }>(
    await db.execute(sql`
      WITH series AS (
        SELECT generate_series(
          date_trunc('month', now()) - INTERVAL '1 month' * (${safeMonths - 1}),
          date_trunc('month', now()),
          INTERVAL '1 month'
        )::date AS month_start
      ),
      revenue AS (
        SELECT date_trunc('month', created_at)::date AS month_start,
               COALESCE(SUM(business_amount_krw), 0)::bigint AS revenue,
               COALESCE(SUM(margin_krw), 0)::bigint AS margin
        FROM public.projects
        WHERE deleted_at IS NULL
          AND created_at >= date_trunc('month', now()) - INTERVAL '1 month' * (${safeMonths - 1})
        GROUP BY 1
      ),
      cost AS (
        SELECT date_trunc('month', payment_received_at)::date AS month_start,
               COALESCE(SUM(instructor_fee_krw), 0)::bigint AS cost
        FROM public.settlements
        WHERE deleted_at IS NULL
          AND status = 'paid'
          AND payment_received_at >= date_trunc('month', now()) - INTERVAL '1 month' * (${safeMonths - 1})
        GROUP BY 1
      )
      SELECT
        to_char(s.month_start, 'YYYY-MM-DD') AS month,
        COALESCE(r.revenue, 0)::bigint AS revenue,
        COALESCE(c.cost, 0)::bigint AS cost,
        COALESCE(r.margin, 0)::bigint AS margin
      FROM series s
      LEFT JOIN revenue r ON r.month_start = s.month_start
      LEFT JOIN cost c ON c.month_start = s.month_start
      ORDER BY s.month_start ASC
    `),
  );
  return rows.map((r) => ({
    month: r.month,
    revenue: toInt(r.revenue),
    cost: toInt(r.cost),
    margin: toInt(r.margin),
  }));
}

export interface TopClientRow {
  clientId: string;
  companyName: string;
  revenue: number;
}

/** 매출 기준 고객사 Top-N. LEFT JOIN으로 결측 이름은 "(미확인)". EARS C-5. */
export async function getTopClients(
  limit: number,
  p: SumQueryParams,
): Promise<TopClientRow[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = asRows<{
    client_id: string;
    company_name: string | null;
    revenue: string | number | null;
  }>(
    await db.execute(sql`
      SELECT
        p.client_id,
        c.company_name,
        COALESCE(SUM(p.business_amount_krw), 0)::bigint AS revenue
      FROM public.projects p
      LEFT JOIN public.clients c ON c.id = p.client_id
      WHERE p.deleted_at IS NULL
        AND p.created_at >= ${p.from.toISOString()}
        AND p.created_at < ${p.to.toISOString()}
      GROUP BY p.client_id, c.company_name
      ORDER BY revenue DESC
      LIMIT ${safeLimit}
    `),
  );
  return rows.map((r) => ({
    clientId: r.client_id,
    companyName: r.company_name ?? "(미확인)",
    revenue: toInt(r.revenue),
  }));
}

export interface TopInstructorRow {
  instructorId: string;
  nameKr: string;
  profit: number;
}

/** 정산 마진(profit_krw GENERATED) 기준 강사 Top-N. EARS C-6. */
export async function getTopInstructors(
  limit: number,
  p: SumQueryParams,
): Promise<TopInstructorRow[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = asRows<{
    instructor_id: string;
    name_kr: string | null;
    profit: string | number | null;
  }>(
    await db.execute(sql`
      SELECT
        s.instructor_id,
        i.name_kr,
        COALESCE(SUM(s.profit_krw), 0)::bigint AS profit
      FROM public.settlements s
      LEFT JOIN public.instructors i ON i.id = s.instructor_id
      WHERE s.deleted_at IS NULL
        AND s.status = 'paid'
        AND s.payment_received_at >= ${p.from.toISOString()}
        AND s.payment_received_at < ${p.to.toISOString()}
      GROUP BY s.instructor_id, i.name_kr
      ORDER BY profit DESC
      LIMIT ${safeLimit}
    `),
  );
  return rows.map((r) => ({
    instructorId: r.instructor_id,
    nameKr: r.name_kr ?? "(미확인)",
    profit: toInt(r.profit),
  }));
}
