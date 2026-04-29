// @MX:ANCHOR: SPEC-RECEIPT-001 §M2 REQ-RECEIPT-COLUMNS-002 — 영수증 번호 atomic 발급.
// @MX:REASON: fan_in 1 (confirm-remittance Server Action). UNIQUE 제약 + receipt_counters 행락에 의존.
// @MX:WARN: 본 함수 외에서 직접 receipt_number를 SET 하는 경로가 있으면 동시성 invariant 위반.
// @MX:REASON: app.next_receipt_number() RPC만이 atomic 보장.

import { PAYOUT_ERRORS } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLikeRpc = { rpc: (fn: string, args?: any) => Promise<{ data: any; error: any }> };

const RECEIPT_REGEX = /^RCP-\d{4}-\d{4}$/;

/**
 * 영수증 번호 atomic 발급 — `app.next_receipt_number()` RPC 래퍼.
 *
 * 형식: `RCP-YYYY-NNNN` (4-digit zero-pad, 연도별 자동 reset).
 * 동시성: PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`이
 * 행 락을 atomically 획득하여 직렬화. UNIQUE 인덱스가 추가 방어선.
 *
 * @throws RECEIPT_GENERATION_FAILED 한국어 에러 (RPC 실패 또는 형식 위반)
 */
export async function nextReceiptNumber(supabase: SupaLikeRpc): Promise<string> {
  const { data, error } = await supabase.rpc("next_receipt_number");
  if (error) {
    throw new Error(PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED);
  }
  if (typeof data !== "string" || !RECEIPT_REGEX.test(data)) {
    throw new Error(PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED);
  }
  return data;
}
