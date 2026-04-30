"use client";

// SPEC-ME-001 §2.5 REQ-ME-CAL-001 ~ -010 — 강사 본인 캘린더 (FullCalendar v6).
// @MX:WARN: FullCalendar는 client-only. mounted 가드로 hydration mismatch 방지.

// @MX:NOTE: SPEC-MOBILE-001 §M4 — <md listWeek view + simplified headerToolbar
import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import koLocale from "@fullcalendar/core/locales/ko";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/app/(app)/(instructor)/me/schedule/actions";
import { detectConflicts, type ScheduleSpan } from "@/lib/instructor/schedule-conflict";

export interface MeScheduleEvent {
  id: string;
  scheduleKind: "system_lecture" | "personal" | "unavailable";
  title: string | null;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}

const KIND_COLORS: Record<MeScheduleEvent["scheduleKind"], { bg: string; border: string; text: string; label: string }> = {
  system_lecture: { bg: "#3b82f6", border: "#2563eb", text: "#ffffff", label: "강의(시스템)" },
  personal: { bg: "#9ca3af", border: "#6b7280", text: "#ffffff", label: "개인" },
  unavailable: { bg: "#ef4444", border: "#dc2626", text: "#ffffff", label: "강의 불가" },
};

export function MeCalendarView({ initialEvents }: { initialEvents: MeScheduleEvent[] }) {
  const [events, setEvents] = React.useState<MeScheduleEvent[]>(initialEvents);
  const [dialogState, setDialogState] = React.useState<DialogState>({ kind: "closed" });
  // useSyncExternalStore로 mounted 가드 (set-state-in-effect 회피).
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // @MX:NOTE: SPEC-MOBILE-001 §M4 — <md(767px)에서 listWeek + 단순 toolbar 분기.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setIsMobile(e.matches);
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const fcEvents = React.useMemo(
    () =>
      events.map((e) => {
        const c = KIND_COLORS[e.scheduleKind];
        const startDate = toKstDateInput(e.startsAt);
        const endDate = toKstDateInput(e.endsAt);
        return {
          id: e.id,
          title: e.title ?? c.label,
          start: startDate,
          end: toCalendarExclusiveEnd(endDate),
          allDay: true,
          backgroundColor: c.bg,
          borderColor: c.border,
          textColor: c.text,
          editable: e.scheduleKind !== "system_lecture",
          extendedProps: { kind: e.scheduleKind, notes: e.notes },
        };
      }),
    [events],
  );

  function openNew(start?: Date, end?: Date) {
    const s = start ?? new Date();
    const startDate = toKstDateInput(s);
    setDialogState({
      kind: "edit",
      mode: "add",
      form: {
        scheduleKind: "unavailable",
        title: "",
        startsAt: startDate,
        endsAt: end ? fromCalendarExclusiveEnd(end, s) : startDate,
        notes: "",
      },
    });
  }

  function openEdit(ev: MeScheduleEvent) {
    if (ev.scheduleKind === "system_lecture") {
      toast.message(`확정된 강의 일정: ${ev.title ?? "(제목 없음)"}`, {
        description: "확정된 시스템 강의는 직접 수정할 수 없습니다.",
      });
      return;
    }
    setDialogState({
      kind: "edit",
      mode: "edit",
      id: ev.id,
      form: {
        scheduleKind: ev.scheduleKind,
        title: ev.title ?? "",
        startsAt: toKstDateInput(ev.startsAt),
        endsAt: toKstDateInput(ev.endsAt),
        notes: ev.notes ?? "",
      },
    });
  }

  function handleEventClick(info: EventClickArg) {
    const ev = events.find((e) => e.id === info.event.id);
    if (ev) openEdit(ev);
  }

  function handleSelect(info: DateSelectArg) {
    openNew(info.start, info.end);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => openNew()}>
          <Plus /> 일정 추가
        </Button>
      </div>
      {mounted ? (
        <div className="rounded-md border border-[var(--color-border)] p-2 bg-[var(--color-surface)]">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
            initialView={isMobile ? "listWeek" : "dayGridMonth"}
            locale={koLocale}
            timeZone="Asia/Seoul"
            firstDay={1}
            headerToolbar={
              isMobile
                ? {
                    left: "prev,next",
                    center: "title",
                    right: "today",
                  }
                : {
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth",
                  }
            }
            buttonText={{
              today: "오늘",
              month: "월",
              week: "주",
              day: "일",
              list: "목록",
            }}
            height="auto"
            selectable
            select={handleSelect}
            events={fcEvents}
            eventClick={handleEventClick}
            eventDrop={async (info) => {
              const ev = events.find((e) => e.id === info.event.id);
              if (!ev || ev.scheduleKind === "system_lecture") return info.revert();
              const newStart = info.event.start;
              if (!newStart) return info.revert();
              const startsAt = toKstDateInput(newStart);
              const endsAt = info.event.end
                ? fromCalendarExclusiveEnd(info.event.end, newStart)
                : startsAt;
              const r = await updateSchedule(ev.id, {
                scheduleKind: ev.scheduleKind,
                title: ev.title ?? "",
                startsAt,
                endsAt,
                notes: ev.notes ?? "",
              });
              if (!r.ok) {
                toast.error(r.message ?? "이동에 실패했습니다.");
                info.revert();
              } else {
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === ev.id ? { ...e, startsAt, endsAt } : e,
                  ),
                );
                toast.success("일정 날짜가 이동되었습니다.");
              }
            }}
            eventResize={async (info) => {
              const ev = events.find((e) => e.id === info.event.id);
              if (!ev || ev.scheduleKind === "system_lecture") return info.revert();
              const newStart = info.event.start;
              const newEnd = info.event.end;
              if (!newStart || !newEnd) return info.revert();
              const startsAt = toKstDateInput(newStart);
              const endsAt = fromCalendarExclusiveEnd(newEnd, newStart);
              const r = await updateSchedule(ev.id, {
                scheduleKind: ev.scheduleKind,
                title: ev.title ?? "",
                startsAt,
                endsAt,
                notes: ev.notes ?? "",
              });
              if (!r.ok) {
                toast.error(r.message ?? "리사이즈에 실패했습니다.");
                info.revert();
              } else {
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === ev.id ? { ...e, startsAt, endsAt } : e,
                  ),
                );
                toast.success("일정 날짜가 변경되었습니다.");
              }
            }}
          />
        </div>
      ) : (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">캘린더 로딩 중…</div>
      )}

      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <LegendDot color={KIND_COLORS.system_lecture.bg} label="강의(시스템·읽기 전용)" />
        <LegendDot color={KIND_COLORS.personal.bg} label="개인 일정" />
        <LegendDot color={KIND_COLORS.unavailable.bg} label="강의 불가" />
        <span className="ml-2">시간대: Asia/Seoul</span>
      </div>

      {dialogState.kind === "edit" && (
        <ScheduleDialog
          state={dialogState}
          existing={events.map<ScheduleSpan>((e) => ({
            id: e.id,
            scheduleKind: e.scheduleKind,
            startsAt: dateOnlyStart(toKstDateInput(e.startsAt)),
            endsAt: dateOnlyEndExclusive(toKstDateInput(e.endsAt)),
          }))}
          onClose={() => setDialogState({ kind: "closed" })}
          onSaved={(saved) => {
            setEvents((prev) => {
              const others = prev.filter((p) => p.id !== saved.id);
              return [...others, saved];
            });
          }}
          onDeleted={(id) => setEvents((prev) => prev.filter((p) => p.id !== id))}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

type DialogState =
  | { kind: "closed" }
  | {
      kind: "edit";
      mode: "add" | "edit";
      id?: string;
      form: {
        scheduleKind: "personal" | "unavailable";
        title: string;
        startsAt: string;
        endsAt: string;
        notes: string;
      };
    };

function ScheduleDialog({
  state,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: Extract<DialogState, { kind: "edit" }>;
  existing: ScheduleSpan[];
  onClose: () => void;
  onSaved: (ev: MeScheduleEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = React.useState(state.form);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const r = state.mode === "add" ? await createSchedule(form) : await updateSchedule(state.id!, form);
      if (!r.ok) {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
        return;
      }
      const conflicts = detectConflicts(
        {
          scheduleKind: form.scheduleKind,
          startsAt: dateOnlyStart(form.startsAt),
          endsAt: dateOnlyEndExclusive(form.endsAt),
          id: state.id,
        },
        existing,
      );
      if (conflicts.hasConflict) {
        toast.warning("이미 확정된 강의 일정과 겹칩니다.");
      } else {
        toast.success(state.mode === "add" ? "일정이 추가되었습니다." : "일정이 수정되었습니다.");
      }
      const id = state.mode === "add" ? r.data!.id : state.id!;
      onSaved({
        id,
        scheduleKind: form.scheduleKind,
        title: form.title,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        notes: form.notes,
      });
      onClose();
    });
  }

  function handleDelete() {
    if (!state.id) return;
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      const r = await deleteSchedule(state.id!);
      if (r.ok) {
        toast.success("일정이 삭제되었습니다.");
        onDeleted(state.id!);
        onClose();
      } else {
        toast.error(r.message ?? "삭제에 실패했습니다.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={state.mode === "add" ? "새 일정" : "일정 수정"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">{state.mode === "add" ? "새 일정" : "일정 수정"}</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedKind" required>종류</Label>
            <Select
              value={form.scheduleKind}
              onValueChange={(v) => setForm({ ...form, scheduleKind: v as "personal" | "unavailable" })}
            >
              <SelectTrigger id="schedKind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unavailable">강의 불가 (추천 회피용)</SelectItem>
                <SelectItem value="personal">개인 일정</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedTitle">제목</Label>
            <Input
              id="schedTitle"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={form.scheduleKind === "unavailable" ? "강의 불가" : "개인 일정"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedStart" required>시작일</Label>
              <Input
                id="schedStart"
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                aria-invalid={errors.startsAt ? "true" : undefined}
              />
              {errors.startsAt && (
                <p role="alert" className="text-xs text-[var(--color-state-alert)]">{errors.startsAt}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedEnd" required>종료일</Label>
              <Input
                id="schedEnd"
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                aria-invalid={errors.endsAt ? "true" : undefined}
              />
              {errors.endsAt && (
                <p role="alert" className="text-xs text-[var(--color-state-alert)]">{errors.endsAt}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedNotes">메모</Label>
            <Textarea
              id="schedNotes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <div>
              {state.mode === "edit" && (
                <Button type="button" variant="ghost" onClick={handleDelete} disabled={pending}>
                  <Trash2 className="text-[var(--color-state-alert)]" /> 삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function toKstDateInput(input: Date | string): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateInput: string, days: number): string {
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) return dateInput;
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function toCalendarExclusiveEnd(inclusiveEndDate: string): string {
  return addDays(inclusiveEndDate, 1);
}

function fromCalendarExclusiveEnd(exclusiveEnd: Date, start: Date): string {
  const startDate = toKstDateInput(start);
  const inclusiveEndDate = addDays(toKstDateInput(exclusiveEnd), -1);
  return inclusiveEndDate < startDate ? startDate : inclusiveEndDate;
}

function dateOnlyStart(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00+09:00`);
}

function dateOnlyEndExclusive(inclusiveEndDate: string): Date {
  return new Date(`${toCalendarExclusiveEnd(inclusiveEndDate)}T00:00:00+09:00`);
}
