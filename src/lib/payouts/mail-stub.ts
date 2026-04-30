// SPEC-PAYOUT-001 §2.5 REQ-PAYOUT-MAIL-003 — 1-클릭 정산요청 메일 스텁.
// SPEC-NOTIFY-001 §M4: emit 통합 — emitNotification 단일 진입점 사용.
// 콘솔 로그 형식은 SPEC-NOTIFY-001 LOG_RE 회귀 테스트 hook. 형식 보존.
//
// @MX:NOTE: 콘솔 로그 형식은 SPEC-NOTIFY-001 어댑터의 첫 hook 이다. 형식을 변경하지 말 것.

import { emitNotification } from "@/lib/notifications/emit";
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

  const r = await emitNotification(supabase, {
    recipientId: userId,
    type: "settlement_requested",
    title,
    body,
    linkUrl: "/me/settlements",
    logContext: `instructor_id=${input.instructorId} settlement_id=${input.settlementId}`,
  });

  if (!r.ok) {
    return { ok: false, error: PAYOUT_ERRORS.MAIL_STUB_FAILED };
  }

  return { ok: true, notificationId: r.id };
}
