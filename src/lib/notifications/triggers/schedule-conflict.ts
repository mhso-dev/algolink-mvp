// SPEC-NOTIFY-001 §M3 — schedule_conflict 트리거.
// @MX:NOTE: 강사 schedule_items insert/update 직후 동일 강사 시간대 겹침 검사 → 담당 operator에게 emit.

import { emitNotification } from "../emit";
import type { EmitResult } from "../emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface ScheduleRange {
  start: string; // ISO
  end: string; // ISO
}

interface ProjectRow {
  id: string;
  title: string | null;
  operator_id: string | null;
  status: string;
  education_start_at: string | null;
  education_end_at: string | null;
}

interface InstructorRow {
  id: string;
  name_kr: string | null;
}

const ACTIVE_STATUSES = [
  "assignment_review",
  "assignment_confirmed",
  "education_in_progress",
];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export async function checkScheduleConflict(
  supabase: SupaLike,
  instructorId: string,
  range: ScheduleRange,
): Promise<EmitResult | null> {
  // 강사가 배정된 활성 프로젝트 조회
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, title, operator_id, status, education_start_at, education_end_at")
    .eq("instructor_id", instructorId)
    .in("status", ACTIVE_STATUSES);

  if (pErr) {
    console.warn("[notify.trigger] schedule-conflict project query failed", pErr);
    return null;
  }

  const projectRows = (projects ?? []) as ProjectRow[];
  // 시간 겹침 검사
  const conflict = projectRows.find(
    (p) =>
      p.education_start_at &&
      p.education_end_at &&
      overlaps(p.education_start_at, p.education_end_at, range.start, range.end),
  );

  if (!conflict || !conflict.operator_id) return null;

  // 강사 이름 조회 (best-effort)
  let instructorName = "강사";
  const { data: ins } = await supabase
    .from("instructors")
    .select("id, name_kr")
    .eq("id", instructorId)
    .maybeSingle();
  if (ins) instructorName = (ins as InstructorRow).name_kr ?? instructorName;

  const startDate = range.start.slice(0, 10);
  const r = await emitNotification(supabase, {
    recipientId: conflict.operator_id,
    type: "schedule_conflict",
    title: "강사 일정 충돌",
    body: `강사 ${instructorName}의 일정이 활성 프로젝트 「${conflict.title ?? "제목 없음"}」와 겹칩니다.`,
    linkUrl: `/projects/${conflict.id}`,
    dedupKey: `conflict:instructor:${instructorId}:${startDate}`,
    logContext: `recipient_id=${conflict.operator_id} instructor_id=${instructorId} project_id=${conflict.id}`,
  });
  return r;
}
