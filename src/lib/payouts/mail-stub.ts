// SPEC-PAYOUT-001 §2.5 REQ-PAYOUT-MAIL-003 — 1-클릭 정산요청 메일 스텁.
// 실제 이메일 발송은 SPEC-NOTIFY-001 후속. 본 모듈은:
//   1) instructors.user_id 조회
//   2) notifications INSERT (type='settlement_requested')
//   3) console.log("[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>")
//
// @MX:NOTE: 콘솔 로그 형식은 SPEC-NOTIFY-001 어댑터의 첫 hook 이다. 형식을 변경하지 말 것.

import { NOTIF_LOG_PREFIX } from "./constants";
import { PAYOUT_ERRORS } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface SendSettlementRequestStubInput {
  settlementId: string;
  instructorId: string;
  projectTitle: string;
  amounts: {
    businessKrw: number;
    feeKrw: number;
    profitKrw: number;
    taxKrw: number;
  };
}

export interface MailStubResult {
  ok: boolean;
  error?: string;
  notificationId?: string;
}

/** instructor_id → instructors.user_id 조회. */
export async function resolveInstructorUserId(
  supabase: SupaLike,
  instructorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("instructors")
    .select("user_id")
    .eq("id", instructorId)
    .maybeSingle();
  if (error || !data) return null;
  const userId = (data as { user_id: string | null }).user_id;
  return userId ?? null;
}

/**
 * 정산 요청 알림 발송 (스텁).
 * 트랜잭션은 호출측 Server Action 에서 status UPDATE 와 함께 묶어 처리해야 한다 —
 * Supabase JS 는 multi-statement TX 미지원이므로, INSERT 실패 시 status 롤백을
 * 호출측이 보상 UPDATE 로 수행한다.
 */
export async function sendSettlementRequestStub(
  supabase: SupaLike,
  input: SendSettlementRequestStubInput,
): Promise<MailStubResult> {
  const userId = await resolveInstructorUserId(supabase, input.instructorId);
  if (!userId) {
    return { ok: false, error: PAYOUT_ERRORS.MAIL_STUB_FAILED };
  }

  const title = `정산 요청 — ${input.projectTitle}`;
  const body =
    `사업비 ${input.amounts.businessKrw.toLocaleString("ko-KR")}원 · ` +
    `강사비 ${input.amounts.feeKrw.toLocaleString("ko-KR")}원 · ` +
    `수익 ${input.amounts.profitKrw.toLocaleString("ko-KR")}원 · ` +
    `원천세 ${input.amounts.taxKrw.toLocaleString("ko-KR")}원`;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: userId,
      type: "settlement_requested",
      title,
      body,
      link_url: "/me/payouts",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[payouts.mail-stub] notifications INSERT failed", error);
    return { ok: false, error: PAYOUT_ERRORS.MAIL_STUB_FAILED };
  }

  // 정확한 1줄 콘솔 로그 — SPEC-NOTIFY-001 hook 식별자.
  console.log(
    `${NOTIF_LOG_PREFIX} settlement_requested → instructor_id=${input.instructorId} settlement_id=${input.settlementId}`,
  );

  return {
    ok: true,
    notificationId: (data as { id: string } | null)?.id,
  };
}
