// @MX:NOTE: SPEC-RECEIPT-001 §M3 REQ-RECEIPT-PDF-001~006 — 영수증 PDF 렌더 함수.
// @MX:REASON: @react-pdf/renderer + NotoSansKR. PDF Buffer를 in-memory로 반환.
// @MX:WARN: instructor.business_number는 PDF Buffer + pii_access_log 외부에 영속 금지 (REQ-RECEIPT-PII-003).
// @MX:REASON: LESSON-004 PII invariant — 평문 bizno 누출 방지.
//
// 본 모듈과 ReceiptDocument는 모두 static import 사용 — @react-pdf/renderer Font 등록은
// 모듈 스코프 한 번만 일어나므로 dynamic import + static import 혼용 시 별도 인스턴스가
// 생성될 수 있음. 일관성을 위해 둘 다 static import.
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptDocument } from "@/components/payouts/receipt-document";
import { PAYOUT_ERRORS } from "./errors";
import type { OrganizationInfo, Settlement } from "./types";

export interface ReceiptPdfInput {
  settlement: Pick<
    Settlement,
    | "id"
    | "instructor_id"
    | "instructor_remittance_amount_krw"
    | "instructor_remittance_received_at"
  >;
  instructor: {
    id: string;
    user_id: string;
    name: string;
    /** 복호화된 사업자등록번호 (NULL이면 PDF에서 생략). */
    business_number: string | null;
  };
  organization: OrganizationInfo;
  receiptNumber: string;
  issuedAt: Date;
}

/**
 * 영수증 PDF를 in-memory Buffer로 렌더.
 *
 * @throws RECEIPT_GENERATION_FAILED 한국어 에러 (font load fail, react-pdf exception)
 */
export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
  try {
    const amount = input.settlement.instructor_remittance_amount_krw ?? 0;
    const element = React.createElement(ReceiptDocument, {
      receiptNumber: input.receiptNumber,
      issuedAt: input.issuedAt,
      remittanceReceivedAt:
        input.settlement.instructor_remittance_received_at,
      amountKrw: amount,
      instructor: {
        name: input.instructor.name,
        businessNumber: input.instructor.business_number,
      },
      organization: input.organization,
    });
    // @react-pdf renderToBuffer 시그니처는 ReactElement<DocumentProps>를 요구하지만
    // 실제로는 ReactElement이면 모두 허용 — Document 노드를 children에 가지므로 cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    // @react-pdf returns Uint8Array on Node — wrap as Buffer for downstream uploads.
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (err) {
    console.error("[receipt-pdf] renderToBuffer failed", err);
    throw new Error(PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED);
  }
}
