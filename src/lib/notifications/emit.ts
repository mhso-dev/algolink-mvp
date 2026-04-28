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

  const { data: row, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: data.recipientId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      link_url: data.linkUrl ?? null,
    })
    .select("id")
    .single();

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

  return { ok: true, id: (row as { id: string }).id };
}
