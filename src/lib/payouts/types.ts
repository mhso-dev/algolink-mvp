// SPEC-PAYOUT-001 §M1 — 정산 도메인 타입 단일 출처.
// @MX:NOTE: GENERATED 컬럼(profit_krw / withholding_tax_amount_krw)은
//           Settlement 타입에는 포함되지만 SettlementUpdatePayload 에서는 제외된다.

export const SETTLEMENT_STATUSES = [
  "pending",
  "requested",
  "paid",
  "held",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

// SPEC-RECEIPT-001 §M1 — client_direct 흐름 추가.
export const SETTLEMENT_FLOWS = [
  "corporate",
  "government",
  "client_direct",
] as const;
export type SettlementFlow = (typeof SETTLEMENT_FLOWS)[number];

/** 정산 행 (DB SELECT row). withholding_tax_rate 는 numeric → 문자열로 직렬화될 수 있다. */
export interface Settlement {
  id: string;
  project_id: string;
  instructor_id: string;
  settlement_flow: SettlementFlow;
  status: SettlementStatus;
  business_amount_krw: number;
  instructor_fee_krw: number;
  withholding_tax_rate: string | number;
  /** GENERATED — read-only. */
  profit_krw: number | null;
  /** GENERATED — read-only. */
  withholding_tax_amount_krw: number | null;
  payment_received_at: string | null;
  payout_sent_at: string | null;
  tax_invoice_issued: boolean;
  tax_invoice_issued_at: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // SPEC-RECEIPT-001 §M1 — 6-2 흐름 (client_direct) 컬럼 (모두 nullable).
  /** 강사가 알고링크에 송금해야 할 금액. SPEC-PAYOUT-002 GENERATE가 owner. */
  instructor_remittance_amount_krw: number | null;
  /** 운영자가 강사 입금을 확인한 시각. */
  instructor_remittance_received_at: string | null;
  /** 고객사가 강사에게 송금한 금액 (정보용, 강사 송금 등록 시 derive). */
  client_payout_amount_krw: number | null;
  /** 영수증 PDF 파일 식별자. */
  receipt_file_id: string | null;
  /** 영수증 발급 시각. */
  receipt_issued_at: string | null;
  /** 영수증 번호 (`RCP-YYYY-NNNN`, UNIQUE). */
  receipt_number: string | null;
}

/** 알고링크 사업자 정보 (organization_info 테이블 + env fallback). */
export interface OrganizationInfo {
  name: string;
  businessNumber: string;
  representative: string;
  address: string;
  contact: string;
}

/** 매입매출 합계. */
export interface MonthlyAggregate {
  businessSum: number;
  feeSum: number;
  profitSum: number;
  count: number;
}

/** 사용자에게 전달되는 한국어 라벨. */
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "정산 전",
  requested: "정산 요청",
  paid: "정산 완료",
  held: "보류",
};

export const SETTLEMENT_FLOW_LABEL: Record<SettlementFlow, string> = {
  corporate: "기업",
  government: "정부",
  client_direct: "고객 직접",
};

/** Badge variant 매핑 (기존 lib/projects.ts 의 settlementStatusBadgeVariant 와 동일 시각). */
export function settlementStatusBadgeVariant(
  status: SettlementStatus | string,
): "pending" | "info" | "settled" | "alert" | "secondary" {
  return (
    {
      pending: "pending",
      requested: "info",
      paid: "settled",
      held: "alert",
    } as const
  )[status as SettlementStatus] ?? "secondary";
}
