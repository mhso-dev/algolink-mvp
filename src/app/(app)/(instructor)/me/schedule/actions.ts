"use server";

// SPEC-ME-001 §2.5 REQ-ME-CAL-004 ~ -009 — 강사 본인 일정 Server Actions.
// @MX:ANCHOR: schedule_kind ∈ {personal, unavailable}만 INSERT/UPDATE/DELETE 허용.
// @MX:REASON: system_lecture는 프로젝트 워크플로우가 자동 생성. 강사 직접 변경 금지.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { scheduleInputSchema, type ScheduleInput } from "@/lib/validation/instructor";

export interface ScheduleActionResult {
  ok: boolean;
  message?: string;
  data?: { id: string };
  fieldErrors?: Record<string, string>;
}

const PERMISSION_DENIED = {
  ok: false as const,
  message: "본인 일정만 수정할 수 있습니다.",
};

const SYSTEM_LECTURE_FORBIDDEN = {
  ok: false as const,
  message: "확정된 강의 일정은 직접 변경할 수 없습니다.",
};

function fieldErrorsFromZod(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map((p) => String(p)).join(".") || "_form";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

async function loadScheduleOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
): Promise<{ instructorId: string; kind: string } | null> {
  const { data } = await supabase
    .from("schedule_items")
    .select("instructor_id, schedule_kind")
    .eq("id", id)
    .limit(1);
  const row = data?.[0] as { instructor_id: string; schedule_kind: string } | undefined;
  if (!row) return null;
  return { instructorId: row.instructor_id, kind: row.schedule_kind };
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return { ok: false, message: "강사 권한이 필요합니다." };
  const r = scheduleInputSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  }
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("schedule_items")
    .insert({
      instructor_id: ctx.instructorId,
      schedule_kind: r.data.scheduleKind,
      title: r.data.title || (r.data.scheduleKind === "unavailable" ? "강의 불가" : "개인 일정"),
      starts_at: new Date(r.data.startsAt).toISOString(),
      ends_at: new Date(r.data.endsAt).toISOString(),
      notes: r.data.notes || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[createSchedule] failed", error);
    return { ok: false, message: "일정 저장에 실패했습니다." };
  }
  revalidatePath("/me/schedule");
  revalidatePath("/me");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<ScheduleActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return { ok: false, message: "강사 권한이 필요합니다." };
  const r = scheduleInputSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  }
  const supabase = createClient(await cookies());
  const owner = await loadScheduleOwner(supabase, id);
  if (!owner) return { ok: false, message: "일정을 찾을 수 없습니다." };
  if (owner.instructorId !== ctx.instructorId) return PERMISSION_DENIED;
  if (owner.kind === "system_lecture") return SYSTEM_LECTURE_FORBIDDEN;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("schedule_items")
    .update({
      schedule_kind: r.data.scheduleKind,
      title: r.data.title || (r.data.scheduleKind === "unavailable" ? "강의 불가" : "개인 일정"),
      starts_at: new Date(r.data.startsAt).toISOString(),
      ends_at: new Date(r.data.endsAt).toISOString(),
      notes: r.data.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("[updateSchedule] failed", error);
    return { ok: false, message: "수정에 실패했습니다." };
  }
  revalidatePath("/me/schedule");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<ScheduleActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return { ok: false, message: "강사 권한이 필요합니다." };
  const supabase = createClient(await cookies());
  const owner = await loadScheduleOwner(supabase, id);
  if (!owner) return { ok: false, message: "일정을 찾을 수 없습니다." };
  if (owner.instructorId !== ctx.instructorId) return PERMISSION_DENIED;
  if (owner.kind === "system_lecture") return SYSTEM_LECTURE_FORBIDDEN;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("schedule_items").delete().eq("id", id);
  if (error) {
    console.error("[deleteSchedule] failed", error);
    return { ok: false, message: "삭제에 실패했습니다." };
  }
  revalidatePath("/me/schedule");
  revalidatePath("/me");
  return { ok: true };
}
