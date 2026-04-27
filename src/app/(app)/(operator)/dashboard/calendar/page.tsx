// @MX:NOTE: SPEC-DASHBOARD-001 §M6 — 강사 일정 캘린더 페이지.
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperatorCalendar } from "@/components/dashboard/OperatorCalendar";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { requireUser } from "@/lib/auth";
import { getInstructorScheduleRange } from "@/lib/dashboard/queries";
import {
  currentMonthKst,
  startOfMonthKst,
  startOfNextMonthKst,
} from "@/lib/dashboard/calendar-events";

export const revalidate = 30;

export default async function CalendarPage() {
  await requireUser();
  const { year, monthIndex0 } = currentMonthKst();
  const from = startOfMonthKst(year, monthIndex0);
  const to = startOfNextMonthKst(year, monthIndex0);

  let events: Awaited<ReturnType<typeof getInstructorScheduleRange>> = [];
  let loadError = false;
  try {
    events = await getInstructorScheduleRange(from, to);
  } catch (e) {
    console.error("[dashboard/calendar] load failed", e);
    loadError = true;
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">강사 일정</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ChevronLeft aria-hidden /> 대시보드로 돌아가기
          </Link>
        </Button>
      </header>
      {loadError && (
        <ErrorState
          title="일정 데이터를 불러오지 못했습니다."
          message="잠시 후 다시 시도해주세요."
          retryHref="/dashboard/calendar"
        />
      )}
      <OperatorCalendar
        initialYear={year}
        initialMonthIndex0={monthIndex0}
        events={events}
      />
    </div>
  );
}
