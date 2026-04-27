// @MX:NOTE: SPEC-DASHBOARD-001 §M2 — 포맷 헬퍼 (KRW / Asia/Seoul / D-Day).
// @MX:SPEC: SPEC-DASHBOARD-001
//
// Asia/Seoul 고정 오프셋(UTC+9, DST 없음)을 직접 적용해 date-fns-tz 의존을 회피한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

/** `₩12,400,000` 형식의 한국 원화. */
export function formatKrw(amount: number): string {
  return KRW_FORMATTER.format(amount);
}

/** UTC 타임스탬프를 Asia/Seoul로 변환한 Date 객체 반환 (toISOString 의 KST 표현용). */
export function toKstDate(input: Date | string | number): Date {
  const d = input instanceof Date ? input : new Date(input);
  return new Date(d.getTime() + KST_OFFSET_MS);
}

const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `2026-04-27 (월)` 형식. */
export function formatKstDate(input: Date | string | number): string {
  const d = toKstDate(input);
  // toKstDate가 UTC시간을 KST 시각으로 옮겨놓음 → UTC getter로 KST 값 추출.
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const dayOfWeek = KO_DAYS[d.getUTCDay()];
  return `${y}-${m}-${day} (${dayOfWeek})`;
}

/** `오전 10:00` / `오후 02:30` (KST). */
export function formatKstTime(input: Date | string | number): string {
  const d = toKstDate(input);
  const h24 = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  const meridiem = h24 < 12 ? "오전" : "오후";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${meridiem} ${pad(h12)}:${m}`;
}

/** `2026-05-10 (월) ~ 05-12` 형식 (start만 있으면 단일 일자). */
export function formatKstDateRange(
  start: Date | string | null,
  end: Date | string | null,
): string {
  if (!start) return "일정 미정";
  const startLabel = formatKstDate(start);
  if (!end) return startLabel;
  const startD = toKstDate(start);
  const endD = toKstDate(end);
  if (
    startD.getUTCFullYear() === endD.getUTCFullYear() &&
    startD.getUTCMonth() === endD.getUTCMonth() &&
    startD.getUTCDate() === endD.getUTCDate()
  ) {
    return startLabel;
  }
  const em = pad(endD.getUTCMonth() + 1);
  const ed = pad(endD.getUTCDate());
  return `${startLabel} ~ ${em}-${ed}`;
}

/** 오늘 0시(KST) 기준 일수 차이로 D-N / D-Day / D+N 산출. */
export function formatDDay(target: Date | string, now: Date = new Date()): string {
  const t = toKstDate(target);
  const n = toKstDate(now);
  const tDay = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const nDay = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const diffDays = Math.round((tDay - nDay) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}
