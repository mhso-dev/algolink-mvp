// SPEC-NOTIFY-001 §M2 / §5.1 — 알림 발행 단일 진입점.
// @MX:ANCHOR: 모든 도메인의 알림 INSERT가 본 함수 경유. 로그 형식 변경 금지.
// @MX:REASON: 콘솔 로그 형식은 SPEC-PAYOUT-001 / SPEC-PROJECT-001 회귀 테스트 hook.
// @MX:SPEC: SPEC-NOTIFY-001 REQ-NOTIFY-EMIT-001~007

import { NOTIF_LOG_PREFIX, DEDUP_WINDOW_HOURS } from "./constants";
import { NOTIFY_ERRORS } from "./errors";
import { emitPayloadSchema, type EmitPayload } from "./validation";
import { hasRecentDuplicate } from "./dedup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export type EmitReason = "validation" | "duplicate" | "rls" | "db";

export type EmitResult =
  | { ok: true; id: string }
  | { ok: false; error: string; reason: EmitReason };

export async function emitNotification(
  supabase: SupaLike,
  payload: EmitPayload,
): Promise<EmitResult> {
  const parsed = emitPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: NOTIFY_ERRORS.VALIDATION, reason: "validation" };
  }

  const data = parsed.data;

  if (data.dedupKey) {
    const dup = await hasRecentDuplicate(
      supabase,
      { recipientId: data.recipientId, type: data.type, linkUrl: data.linkUrl },
      DEDUP_WINDOW_HOURS,
    );
    if (dup) {
      return { ok: false, error: NOTIFY_ERRORS.DUPLICATE, reason: "duplicate" };
    }
  }

  // RLS 주의: INSERT ... RETURNING (supabase-js .select().single()) 은 RETURNING
  // 단계에서 SELECT 정책을 추가로 요구한다. operator 는 notifications_operator_insert 로
  // INSERT 만 허용되고, recipient_id != auth.uid() 인 행에 대한 SELECT 권한이 없으므로
  // RETURNING 이 RLS 위반(42501)으로 실패한다.
  // 회피: 본 함수는 notification id 를 반환할 책임이 없으므로 `.select()` 호출을 제거한다.
  // (notificationId 는 호출처(mail-stub)에서 실제 사용처 없음 — 로그만 사용)
  const { error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: data.recipientId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link_url: data.linkUrl ?? null,
    });

  if (error) {
    console.error("[notify.emit] insert failed", {
      type: data.type,
      recipientId: data.recipientId,
      error,
    });
    const reason: EmitReason =
      (error as { code?: string }).code === "42501" ? "rls" : "db";
    return {
      ok: false,
      error: reason === "rls" ? NOTIFY_ERRORS.RLS : NOTIFY_ERRORS.DB_INSERT,
      reason,
    };
  }

  // 콘솔 로그 — 기존 SPEC-PAYOUT-001 / SPEC-PROJECT-001 형식 보존.
  const ctx = data.logContext ?? `recipient_id=${data.recipientId}`;
  console.log(`${NOTIF_LOG_PREFIX} ${data.type} → ${ctx}`);

  // id 는 RETURNING 없이 반환할 수 없으므로 빈 문자열 placeholder.
  // 호출처는 ok 만 검사하며 id 는 사용하지 않는다 (관련 호출처: src/lib/payouts/mail-stub.ts).
  return { ok: true, id: "" };
}
