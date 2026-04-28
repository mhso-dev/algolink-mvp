// SPEC-ME-001 §2.5 REQ-ME-CAL-008 — 일정 충돌 감지 (표시용 비차단 경고).
// @MX:NOTE: DB EXCLUSION constraint와 별개로 UI 표시용 충돌 검사.

export interface ScheduleSpan {
  id: string;
  scheduleKind: "system_lecture" | "personal" | "unavailable";
  startsAt: Date;
  endsAt: Date;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingIds: string[];
}

/** 두 시간 범위가 겹치는지 (open interval, end exclusive) */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * 신규/편집 일정이 기존 일정들과 충돌하는지 검사.
 * personal 일정은 검사 제외 (REQ-ME-CAL-008).
 * unavailable → system_lecture와의 겹침만 보고.
 */
export function detectConflicts(
  candidate: { scheduleKind: "personal" | "unavailable"; startsAt: Date; endsAt: Date; id?: string },
  existing: ScheduleSpan[],
): ConflictResult {
  if (candidate.scheduleKind === "personal") {
    return { hasConflict: false, conflictingIds: [] };
  }
  const conflicts: string[] = [];
  for (const e of existing) {
    if (e.id === candidate.id) continue;
    if (e.scheduleKind !== "system_lecture") continue;
    if (rangesOverlap(candidate.startsAt, candidate.endsAt, e.startsAt, e.endsAt)) {
      conflicts.push(e.id);
    }
  }
  return { hasConflict: conflicts.length > 0, conflictingIds: conflicts };
}
