// Shared helpers for date-only business fields stored in timestamptz columns.
// Asia/Seoul has no DST, so a fixed +09:00 boundary is safe for KST all-day ranges.

export const KST_OFFSET = "+09:00";
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type DateOnlyString = string;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isDateOnlyString(value: unknown): value is DateOnlyString {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

export function toKstDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isDateOnlyString(value)) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

export function dateOnlyToKstStartIso(value: string | null | undefined): string | null {
  if (!isDateOnlyString(value)) return null;
  return new Date(`${value}T00:00:00.000${KST_OFFSET}`).toISOString();
}

export function dateOnlyToKstEndIso(value: string | null | undefined): string | null {
  return dateOnlyToKstNextDayStartIso(value);
}

export function dateOnlyToKstNextDayStartIso(value: string | null | undefined): string | null {
  if (!isDateOnlyString(value)) return null;
  const start = new Date(`${value}T00:00:00.000${KST_OFFSET}`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

export function normalizeDateOnlyRangeForProject(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): { education_start_at: string | null; education_end_at: string | null } {
  const startDate = toKstDateOnly(start);
  const endDate = toKstDateOnly(end);
  return {
    education_start_at: dateOnlyToKstStartIso(startDate),
    education_end_at: dateOnlyToKstEndIso(endDate),
  };
}
