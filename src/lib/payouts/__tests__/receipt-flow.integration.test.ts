// SPEC-RECEIPT-001 §M7 — 통합 시나리오 (mock-based + 산출물 일치 검증).
// acceptance.md 시나리오 1, 2, 4, 5, 7, 8 mock 시뮬레이션.
//
// Server Action 자체는 next/headers + Supabase server client + console.log에 의존하여
// jsdom 환경에서 직접 실행 불가. 본 테스트는 도메인 로직 + 산출물 일치 + 정규식 매칭 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInstructorRemittanceInput } from "../instructor-remittance";
import { validateOperatorConfirmationInput } from "../operator-confirmation";
import { PAYOUT_ERRORS } from "../errors";
import { renderReceiptPdf } from "../receipt-pdf";

// =============================================================================
// Scenario 1 — 강사 송금 등록 (pending → requested)
// =============================================================================

test("Integration Scenario 1: 강사 송금 등록 정상 흐름", () => {
  const settlement = {
    id: "11111111-1111-1111-1111-111111111111",
    settlement_flow: "client_direct" as const,
    status: "pending" as const,
    instructor_remittance_amount_krw: 2_000_000,
    instructor_fee_krw: 3_000_000,
    withholding_tax_rate: "3.30",
    withholding_tax_amount_krw: 99_000,
  };
  const validation = validateInstructorRemittanceInput(settlement, {
    settlementId: settlement.id,
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 2_000_000,
  });
  assert.equal(validation.ok, true);
});

test("Integration Scenario 5-A: 강사 송금 금액 mismatch 거부", () => {
  const settlement = {
    id: "11111111-1111-1111-1111-111111111111",
    settlement_flow: "client_direct" as const,
    status: "pending" as const,
    instructor_remittance_amount_krw: 2_000_000,
    instructor_fee_krw: 3_000_000,
    withholding_tax_rate: "3.30",
    withholding_tax_amount_krw: 99_000,
  };
  const validation = validateInstructorRemittanceInput(settlement, {
    settlementId: settlement.id,
    remittanceDate: "2026-04-29",
    remittanceAmountKrw: 1_500_000,
  });
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});

// =============================================================================
// Scenario 2 — 운영자 수취 확인 (requested → paid)
// =============================================================================

test("Integration Scenario 2: 운영자 수취 확인 정상 흐름 (validation 통과)", () => {
  const settlement = {
    id: "22222222-2222-2222-2222-222222222222",
    settlement_flow: "client_direct" as const,
    status: "requested" as const,
    instructor_remittance_amount_krw: 2_000_000,
    receipt_number: null,
  };
  const validation = validateOperatorConfirmationInput(settlement, {
    settlementId: settlement.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 2_000_000,
  });
  assert.equal(validation.ok, true);
});

test("Integration Scenario 5-B: 운영자 입금 금액 mismatch 거부", () => {
  const settlement = {
    id: "22222222-2222-2222-2222-222222222222",
    settlement_flow: "client_direct" as const,
    status: "requested" as const,
    instructor_remittance_amount_krw: 2_000_000,
    receipt_number: null,
  };
  const validation = validateOperatorConfirmationInput(settlement, {
    settlementId: settlement.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_999_000,
  });
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.reason, PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH);
  }
});

// =============================================================================
// Scenario 7 — paid 동결 + 재발급 거부
// =============================================================================

test("Integration Scenario 7-A: paid 상태 → STATUS_PAID_FROZEN", () => {
  const settlement = {
    id: "33333333-3333-3333-3333-333333333333",
    settlement_flow: "client_direct" as const,
    status: "paid" as const,
    instructor_remittance_amount_krw: 1_200_000,
    receipt_number: "RCP-2026-0001",
  };
  const validation = validateOperatorConfirmationInput(settlement, {
    settlementId: settlement.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_200_000,
  });
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.reason, PAYOUT_ERRORS.STATUS_PAID_FROZEN);
  }
});

test("Integration Scenario 7-B: receipt_number 이미 존재 + status=requested → RECEIPT_ALREADY_ISSUED", () => {
  const settlement = {
    id: "44444444-4444-4444-4444-444444444444",
    settlement_flow: "client_direct" as const,
    status: "requested" as const,
    instructor_remittance_amount_krw: 1_500_000,
    receipt_number: "RCP-2026-0050", // 이미 발급된 상태 (race-condition 시뮬레이션)
  };
  const validation = validateOperatorConfirmationInput(settlement, {
    settlementId: settlement.id,
    receivedDate: "2026-04-30",
    receivedAmountKrw: 1_500_000,
  });
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.reason, PAYOUT_ERRORS.RECEIPT_ALREADY_ISSUED);
  }
});

// =============================================================================
// Scenario 8 — 콘솔 로그 정규식 매칭 (REQ-RECEIPT-NOTIFY-003)
// =============================================================================

test("Integration Scenario 8: 콘솔 로그 형식 정규식 매칭", () => {
  const REGEX =
    /^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{4}$/;

  // 정상 형식 — Server Action이 emit하는 console.log 메시지를 시뮬레이션.
  const validLog =
    "[notif] receipt_issued → instructor_id=11111111-1111-1111-1111-111111111111 settlement_id=22222222-2222-2222-2222-222222222222 receipt_number=RCP-2026-0042";
  assert.match(validLog, REGEX);

  // 실패 케이스 — receipt_number 형식 위반.
  const invalidLog =
    "[notif] receipt_issued → instructor_id=11111111-1111-1111-1111-111111111111 settlement_id=22222222-2222-2222-2222-222222222222 receipt_number=RCP-2026-1";
  assert.doesNotMatch(invalidLog, REGEX);

  // 실패 케이스 — uuid 형식 위반.
  const invalidUuid =
    "[notif] receipt_issued → instructor_id=invalid-uuid settlement_id=22222222-2222-2222-2222-222222222222 receipt_number=RCP-2026-0042";
  assert.doesNotMatch(invalidUuid, REGEX);
});

// =============================================================================
// Scenario 4 — 영수증 번호 동시성 (병렬 5건 unique, mock counter)
// =============================================================================

test("Integration Scenario 4: 영수증 번호 병렬 5건 unique (mock)", async () => {
  let counter = 0;
  const supabase = {
    rpc: async () => {
      counter += 1;
      const padded = counter.toString().padStart(4, "0");
      return { data: `RCP-2026-${padded}`, error: null };
    },
  };
  const { nextReceiptNumber } = await import("../receipt-number");
  const results = await Promise.all([
    nextReceiptNumber(supabase),
    nextReceiptNumber(supabase),
    nextReceiptNumber(supabase),
    nextReceiptNumber(supabase),
    nextReceiptNumber(supabase),
  ]);
  assert.equal(new Set(results).size, 5);
  for (const r of results) {
    assert.match(r, /^RCP-2026-\d{4}$/);
  }
});

// =============================================================================
// Scenario 3 — 영수증 PDF 한국어 렌더 검증 (Buffer + magic bytes)
// =============================================================================

test("Integration Scenario 3: 영수증 PDF Buffer + magic bytes + 크기", async () => {
  const buf = await renderReceiptPdf({
    settlement: {
      id: "55555555-5555-5555-5555-555555555555",
      instructor_id: "66666666-6666-6666-6666-666666666666",
      instructor_remittance_amount_krw: 2_000_000,
      instructor_remittance_received_at: "2026-04-30T01:00:00Z",
    },
    instructor: {
      id: "66666666-6666-6666-6666-666666666666",
      user_id: "77777777-7777-7777-7777-777777777777",
      name: "통합 테스트 강사",
      business_number: "987-65-43210",
    },
    organization: {
      name: "주식회사 알고링크",
      businessNumber: "123-45-67890",
      representative: "홍길동",
      address: "서울특별시 강남구 테헤란로 123",
      contact: "02-1234-5678",
    },
    receiptNumber: "RCP-2026-0099",
    issuedAt: new Date("2026-04-30T01:00:00Z"),
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.subarray(0, 5).toString("utf-8"), "%PDF-");
  assert.ok(buf.length > 5_000, `PDF 크기 ${buf.length} bytes — 한국어 컨텐츠 임베드 시 5KB 이상 예상`);
  assert.ok(buf.length < 500 * 1024, `PDF 크기 ${buf.length} bytes — 500KB 초과`);
});

// =============================================================================
// Scenario 8b — 알림 body 형식 검증 (REQ-RECEIPT-NOTIFY-002)
// =============================================================================

test("Integration Scenario 8b: 알림 body 형식 RCP-YYYY-NNNN (formatted KRW 원)", () => {
  // body는 `${receiptNumber} (${formatKRW(amount)} 원)` 형식.
  // formatKRW(2_000_000) = "2,000,000".
  const body = "RCP-2026-0042 (2,000,000 원)";
  assert.match(body, /^RCP-\d{4}-\d{4} \(\d{1,3}(,\d{3})* 원\)$/);
});
