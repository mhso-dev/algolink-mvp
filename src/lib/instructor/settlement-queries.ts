// SPEC-ME-001 §2.6 REQ-ME-SET-001/002/008 — 본인 settlements + projects/clients join.
// @MX:NOTE: server-only. RLS는 SPEC-DB-001이 적용. 본 모듈은 instructor 본인 row만 반환.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { SettlementRecord } from "./settlement-grouping";
import type { SettlementStatus, SettlementFlow } from "./settlement-summary";

interface RawJoinedSettlement {
  id: string;
  status: SettlementStatus;
  settlement_flow: SettlementFlow;
  instructor_fee_krw: number;
  withholding_tax_rate: string | number;
  withholding_tax_amount_krw: number | null;
  payout_sent_at: string | null;
  payment_received_at: string | null;
  projects: {
    title: string | null;
    education_start_at: string | null;
    education_end_at: string | null;
    clients: { company_name: string | null } | null;
  } | null;
}

/**
 * 본인 instructor_id 의 모든 settlements 를 join 해서 SettlementRecord[] 로 반환.
 * RLS 덕에 자기 row 만 반환됨.
 */
export async function getMySettlements(instructorId: string): Promise<SettlementRecord[]> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("settlements")
    .select(
      `id, status, settlement_flow, instructor_fee_krw, withholding_tax_rate,
       withholding_tax_amount_krw, payout_sent_at, payment_received_at,
       projects:project_id ( title, education_start_at, education_end_at,
         clients:client_id ( company_name ) )`,
    )
    .eq("instructor_id", instructorId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMySettlements] failed", error);
    return [];
  }

  const rows = (data ?? []) as RawJoinedSettlement[];
  return rows.map((r): SettlementRecord => {
    const project = r.projects;
    return {
      id: r.id,
      status: r.status,
      settlementFlow: r.settlement_flow,
      instructorFeeKrw: r.instructor_fee_krw,
      withholdingTaxRate:
        typeof r.withholding_tax_rate === "string"
          ? Number.parseFloat(r.withholding_tax_rate)
          : r.withholding_tax_rate,
      withholdingTaxAmountKrw: r.withholding_tax_amount_krw ?? 0,
      projectTitle: project?.title ?? "(프로젝트 없음)",
      clientName: project?.clients?.company_name ?? null,
      educationStartAt: project?.education_start_at ?? null,
      educationEndAt: project?.education_end_at ?? null,
      payoutSentAt: r.payout_sent_at,
      paymentReceivedAt: r.payment_received_at,
    };
  });
}
