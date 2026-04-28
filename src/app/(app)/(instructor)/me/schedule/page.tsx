// SPEC-ME-001 §2.5 REQ-ME-CAL — 강사 본인 캘린더 (FullCalendar 마운트).
import { CalendarDays } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow, getMySchedules } from "@/lib/instructor/me-queries";
import { MeCalendarView, type MeScheduleEvent } from "@/components/instructor/me-calendar-view";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await requireUser();
  if (session.role !== "instructor") {
    redirect("/dashboard");
  }
  const ctx = await ensureInstructorRow();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center text-sm text-[var(--color-text-muted)]">
        강사 프로필 초기화에 실패했습니다.
      </div>
    );
  }
  const rows = await getMySchedules(ctx.instructorId);
  const events: MeScheduleEvent[] = rows.map((r) => ({
    id: r.id,
    scheduleKind: r.schedule_kind,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    notes: r.notes,
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-[var(--color-primary)]" />
          일정
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          알고링크 강의·개인 일정을 통합 관리하세요. 강의 불가 일정을 등록하면 추천에서 자동 회피됩니다.
        </p>
      </header>

      <MeCalendarView initialEvents={events} />
    </div>
  );
}
