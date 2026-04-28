// SPEC-NOTIFY-001 §M2 / §5.2 — 중복 가드.
// (recipient_id, type, link_url) proxy 키로 24h 내 동일 알림 검사.
// dedup_key 컬럼은 마이그레이션 최소화를 위해 추가하지 않음.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface DedupKey {
  recipientId: string;
  type: string;
  linkUrl?: string;
}

/**
 * 동일 (recipient, type, link_url) 알림이 withinHours 내 존재하는지.
 * RLS는 호출측 supabase 클라이언트의 JWT에 위임.
 */
export async function hasRecentDuplicate(
  supabase: SupaLike,
  payload: DedupKey,
  withinHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  let q = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", payload.recipientId)
    .eq("type", payload.type)
    .gte("created_at", since);
  if (payload.linkUrl) {
    q = q.eq("link_url", payload.linkUrl);
  }
  const { count, error } = await q;
  if (error) {
    // 검사 실패 시 false 반환 → emit 시도. 실제 INSERT는 RLS/CHECK가 차단.
    return false;
  }
  return (count ?? 0) > 0;
}
