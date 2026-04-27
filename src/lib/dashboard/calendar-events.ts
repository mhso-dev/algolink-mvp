// @MX:NOTE: SPEC-DASHBOARD-001 §M6 — 캘린더 월 격자/이벤트 그룹핑 유틸 (KST 고정).
import { toKstDate } from "./format";
import type { ScheduleEvent } from "./types";

/** 해당 월(KST)의 1일 00:00 UTC 인스턴트. */
export function startOfMonthKst(year: number, monthIndex0: number): Date {
  // KST 1일 00:00 == UTC 전날 15:00.
  return new Date(Date.UTC(year, monthIndex0, 1) - 9 * 60 * 60 * 1000);
}

/** 다음 달 1일 00:00 KST (UTC 시간). */
export function startOfNextMonthKst(year: number, monthIndex0: number): Date {
  const ny = monthIndex0 === 11 ? year + 1 : year;
  const nm = monthIndex0 === 11 ? 0 : monthIndex0 + 1;
  return startOfMonthKst(ny, nm);
}

/** 현재 시각이 속한 KST 월(year, monthIndex0)을 반환. */
export function currentMonthKst(now: Date = new Date()): { year: number; monthIndex0: number } {
  const k = toKstDate(now);
  return { year: k.getUTCFullYear(), monthIndex0: k.getUTCMonth() };
}

/** 한 달 KST 일수. */
export function daysInMonthKst(year: number, monthIndex0: number): number {
  // Date 표준 — Date(y, m+1, 0).getDate() = 해당 월 마지막 일.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * 이벤트를 KST 일자(1..31) 키로 그룹화.
 * 일자 경계에 걸친 이벤트는 시작 일자 기준으로 묶는다.
 */
export function groupEventsByDay(
  events: ScheduleEvent[],
): Map<number, ScheduleEvent[]> {
  const m = new Map<number, ScheduleEvent[]>();
  for (const ev of events) {
    const k = toKstDate(ev.startsAt);
    const day = k.getUTCDate();
    const arr = m.get(day) ?? [];
    arr.push(ev);
    m.set(day, arr);
  }
  return m;
}

/** 다음/이전 월 계산 (KST 기준). */
export function shiftMonth(
  year: number,
  monthIndex0: number,
  delta: number,
): { year: number; monthIndex0: number } {
  const total = year * 12 + monthIndex0 + delta;
  return { year: Math.floor(total / 12), monthIndex0: ((total % 12) + 12) % 12 };
}
