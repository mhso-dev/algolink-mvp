"use client";
// @MX:NOTE: SPEC-DASHBOARD-001 §M6 — 월력 전용 캘린더 (KST 고정, 강사 색상 8색 사이클).
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  colorForInstructor,
  type ScheduleEvent,
} from "@/lib/dashboard/types";
import {
  daysInMonthKst,
  groupEventsByDay,
  shiftMonth,
  startOfMonthKst,
} from "@/lib/dashboard/calendar-events";
import { toKstDate } from "@/lib/dashboard/format";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

interface OperatorCalendarProps {
  /** 초기 표시 월 (KST). */
  initialYear: number;
  initialMonthIndex0: number;
  /**
   * 클라이언트가 보유한 이벤트. 월 이동 시 클라이언트는 라우터 navigate로
   * 새 month를 query로 요청하며, 본 컴포넌트는 props로 받은 events 그대로 표시.
   */
  events: ScheduleEvent[];
}

export function OperatorCalendar({
  initialYear,
  initialMonthIndex0,
  events,
}: OperatorCalendarProps) {
  const [{ year, monthIndex0 }, setMonth] = React.useState({
    year: initialYear,
    monthIndex0: initialMonthIndex0,
  });

  const grouped = React.useMemo(
    () => groupEventsByDay(events, { year, monthIndex0 }),
    [events, monthIndex0, year],
  );
  const dim = daysInMonthKst(year, monthIndex0);
  const first = startOfMonthKst(year, monthIndex0);
  // KST 기준 요일 (1일).
  const firstWeekday = toKstDate(first).getUTCDay();

  const cells: Array<{ day: number | null; events: ScheduleEvent[] }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, events: [] });
  for (let d = 1; d <= dim; d++) {
    cells.push({ day: d, events: grouped.get(d) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, events: [] });

  const total = events.length;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {year}년 {monthIndex0 + 1}월
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setMonth(shiftMonth(year, monthIndex0, -1))}
            aria-label="이전 달"
            className="min-h-touch min-w-touch"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const k = toKstDate(new Date());
              setMonth({ year: k.getUTCFullYear(), monthIndex0: k.getUTCMonth() });
            }}
          >
            오늘
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setMonth(shiftMonth(year, monthIndex0, 1))}
            aria-label="다음 달"
            className="min-h-touch min-w-touch"
          >
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-7 text-xs text-[var(--color-text-muted)]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1 text-center font-medium">
            {w}
          </div>
        ))}
      </div>

      <div className="relative grid grid-cols-7 gap-px overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-border)]">
        {/* @MX:NOTE: SPEC-MOBILE-001 §M4 — <md 셀 축소(min-h-60 p-1) + 도트, >=md 기존 텍스트 미리보기 */}
        {cells.map((c, i) => (
          <div
            key={i}
            className="min-h-[60px] md:min-h-[88px] bg-[var(--color-bg)] p-1 md:p-1.5 align-top"
          >
            {c.day !== null && (
              <>
                <div className="text-xs font-semibold text-[var(--color-text-muted)]">
                  {c.day}
                </div>
                {/* 모바일(<md): 도트 인디케이터만 */}
                <div
                  className="mt-1 flex flex-wrap gap-0.5 md:hidden"
                  aria-label={
                    c.events.length > 0
                      ? `${c.events.length}건의 일정`
                      : undefined
                  }
                >
                  {c.events.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: colorForInstructor(ev.instructorId) }}
                    />
                  ))}
                  {c.events.length > 3 && (
                    <span className="text-[9px] leading-none text-[var(--color-text-muted)]">
                      +{c.events.length - 3}
                    </span>
                  )}
                </div>
                {/* 데스크탑(>=md): 일정 텍스트 미리보기 */}
                <div className="mt-1 hidden md:flex md:flex-col md:gap-0.5">
                  {c.events.slice(0, 3).map((ev) => {
                    const color = colorForInstructor(ev.instructorId);
                    return (
                      <div
                        key={ev.id}
                        title={`${ev.instructorName} - ${ev.projectTitle ?? "프로젝트"}`}
                        aria-label={`${ev.instructorName} ${ev.projectTitle ?? "강의"}`}
                        className="truncate rounded-sm px-1 py-0.5 text-[10px] text-white"
                        style={{ backgroundColor: color }}
                      >
                        {ev.instructorName} · {ev.projectTitle ?? "강의"}
                      </div>
                    );
                  })}
                  {c.events.length > 3 && (
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      +{c.events.length - 3}개 더
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {total === 0 && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_oklab,var(--color-bg)_80%,transparent)] text-sm text-[var(--color-text-muted)]"
          >
            이 기간에 배정된 강의가 없습니다.
          </div>
        )}
      </div>
    </Card>
  );
}
