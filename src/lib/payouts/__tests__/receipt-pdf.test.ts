// SPEC-RECEIPT-001 §M3 — receipt-pdf 단위 테스트.
// REQ-RECEIPT-PDF-001~006 — A4 portrait, 한국어 NotoSansKR, 알고링크 정보 임베드.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReceiptPdf } from "../receipt-pdf";
import type { OrganizationInfo, Settlement } from "../types";

const ORG: OrganizationInfo = {
  name: "주식회사 알고링크",
  businessNumber: "123-45-67890",
  representative: "홍길동",
  address: "서울특별시 강남구 테헤란로 123",
  contact: "02-1234-5678",
};

const INSTRUCTOR = {
  id: "11111111-aaaa-aaaa-aaaa-111111111111",
  user_id: "22222222-bbbb-bbbb-bbbb-222222222222",
  name: "강사 김철수",
  business_number: "987-65-43210",
};

const SETTLEMENT_BASE: Pick<
  Settlement,
  | "id"
  | "instructor_remittance_amount_krw"
  | "instructor_remittance_received_at"
> = {
  id: "33333333-cccc-cccc-cccc-333333333333",
  instructor_remittance_amount_krw: 2_000_000,
  instructor_remittance_received_at: "2026-04-30T01:00:00Z",
};

// =============================================================================
// 핵심: PDF Buffer 반환
// =============================================================================

test("renderReceiptPdf: Buffer 반환 + 0보다 큰 크기", async () => {
  const buf = await renderReceiptPdf({
    settlement: {
      ...SETTLEMENT_BASE,
      instructor_id: INSTRUCTOR.id,
    },
    instructor: INSTRUCTOR,
    organization: ORG,
    receiptNumber: "RCP-2026-0001",
    issuedAt: new Date("2026-04-30T01:00:00Z"),
  });
  assert.ok(Buffer.isBuffer(buf), "Buffer 반환 확인");
  assert.ok(buf.length > 1000, `PDF가 충분히 큼 (실제: ${buf.length} bytes)`);
});

test("renderReceiptPdf: PDF magic bytes (%PDF-)로 시작", async () => {
  const buf = await renderReceiptPdf({
    settlement: {
      ...SETTLEMENT_BASE,
      instructor_id: INSTRUCTOR.id,
    },
    instructor: INSTRUCTOR,
    organization: ORG,
    receiptNumber: "RCP-2026-0042",
    issuedAt: new Date("2026-04-30T01:00:00Z"),
  });
  const head = buf.subarray(0, 5).toString("utf-8");
  assert.equal(head, "%PDF-");
});

test("renderReceiptPdf: PDF 크기가 500KB 이하", async () => {
  const buf = await renderReceiptPdf({
    settlement: {
      ...SETTLEMENT_BASE,
      instructor_id: INSTRUCTOR.id,
    },
    instructor: INSTRUCTOR,
    organization: ORG,
    receiptNumber: "RCP-2026-9999",
    issuedAt: new Date("2026-04-30T01:00:00Z"),
  });
  assert.ok(
    buf.length < 500 * 1024,
    `PDF 크기 < 500KB (실제: ${buf.length} bytes = ${(buf.length / 1024).toFixed(1)} KB)`,
  );
});

test("renderReceiptPdf: 강사 사업자등록번호 null이어도 PDF 생성 성공", async () => {
  const buf = await renderReceiptPdf({
    settlement: {
      ...SETTLEMENT_BASE,
      instructor_id: INSTRUCTOR.id,
    },
    instructor: { ...INSTRUCTOR, business_number: null },
    organization: ORG,
    receiptNumber: "RCP-2026-0050",
    issuedAt: new Date("2026-04-30T01:00:00Z"),
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 0);
});
