// SPEC-INSTRUCTOR-001 §2.6 REQ-INSTRUCTOR-DATA-005/006 — KRW + KST 포맷 유틸.

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");

export function formatKrw(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${KRW_FORMATTER.format(n)}원`;
}

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const KST_DATETIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toKstYmd(date: Date): string {
  // ko-KR는 'YYYY. MM. DD.' 형식 → '-' 구분으로 변환.
  const parts = KST_DATE_FORMATTER.formatToParts(date);
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value.padStart(2, "0") ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatKstDate(date: Date | null | undefined): string {
  if (!date) return "";
  return toKstYmd(date);
}

export function formatKstDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  const ymd = toKstYmd(date);
  const parts = KST_DATETIME_FORMATTER.formatToParts(date);
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value.padStart(2, "0") ?? "";
  return `${ymd} ${get("hour")}:${get("minute")}`;
}

export function formatAvgScore(
  avg: number | null | undefined,
  reviewCount: number,
): string {
  if (avg === null || avg === undefined || reviewCount === 0) return "-";
  return `${avg.toFixed(1)} (${reviewCount})`;
}
