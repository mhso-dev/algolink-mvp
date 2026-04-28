// SPEC-NOTIFY-001 §M5 — 한국어 상대 시간 포맷터.

const KST_OFFSET_MS = 9 * 3600 * 1000;

export function formatRelativeKo(iso: string, now: Date = new Date()): string {
  const created = new Date(iso).getTime();
  const diffSec = Math.floor((now.getTime() - created) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 2) return "어제";
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  // 7일 이상: KST 절대 날짜
  const kst = new Date(created + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatAbsoluteKstShort(iso: string): string {
  const t = new Date(iso).getTime();
  const kst = new Date(t + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} KST`;
}
