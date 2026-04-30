// @MX:NOTE: SPEC-CONFIRM-001 §M2 REQ-CONFIRM-EFFECTS-004 — 부수효과 산출 pure functions.
// @MX:SPEC: SPEC-CONFIRM-001
// pure functions only — IO 없음. 순서 결정 + draft 생성만.

import type {
  AssignmentAcceptanceEffects,
  AssignmentDowngradeEffects,
  InquiryAcceptanceEffects,
  InquirySnapshot,
  ProjectSnapshot,
  ScheduleItemDraft,
} from "./types";

/**
 * REQ-CONFIRM-EFFECTS-001 + REQ-CONFIRM-EFFECTS-006 — 정식 배정 수락 부수효과 산출.
 *
 * - 정상: schedule_items 1행 (system_lecture, education_start/end_at 사용) + nextStatus = 'assignment_confirmed'
 * - REQ-CONFIRM-EFFECTS-006: education_start_at 또는 education_end_at이 null이면 schedule 생성 보류
 *   (응답은 정상 저장 + 비차단 경고 표시).
 *
 * @param project 프로젝트 스냅샷 (id, status, education_*).
 * @param instructorId 응답 강사 ID.
 */
export function computeAssignmentAcceptanceEffects(
  project: ProjectSnapshot,
  instructorId: string,
): AssignmentAcceptanceEffects {
  const { educationStartAt, educationEndAt } = project;

  if (!educationStartAt || !educationEndAt) {
    return {
      scheduleItems: [],
      nextStatus: "assignment_confirmed",
      scheduleSkippedReason: "education_dates_missing",
    };
  }

  const range = canonicalProjectDateRange(educationStartAt, educationEndAt);
  const scheduleItem: ScheduleItemDraft = {
    instructorId,
    projectId: project.id,
    scheduleKind: "system_lecture",
    startsAt: range.startsAt,
    endsAt: range.endsAt,
  };

  return {
    scheduleItems: [scheduleItem],
    nextStatus: "assignment_confirmed",
    scheduleSkippedReason: null,
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * assignment acceptance creates system_lecture schedule items from project
 * date-only ranges. Treat project education_start/end as inclusive KST dates
 * and persist schedule_items as [start day 00:00 KST, day after end 00:00 KST).
 */
export function canonicalProjectDateRange(
  educationStartAt: Date,
  educationEndAt: Date,
): { startsAt: Date; endsAt: Date } {
  const startsAt = startOfKstDay(educationStartAt);
  const endDayStart = startOfKstDay(educationEndAt);
  const endsAt = new Date(endDayStart.getTime() + DAY_MS);

  if (endsAt <= startsAt) {
    return { startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS) };
  }
  return { startsAt, endsAt };
}

function startOfKstDay(input: Date): Date {
  const kst = new Date(input.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
      KST_OFFSET_MS,
  );
}

/**
 * REQ-CONFIRM-EFFECTS-002 — 사전 가용성 문의 수락 부수효과.
 * schedule_items 미생성 (수주 미확정 단계).
 */
export function computeInquiryAcceptanceEffects(
  _inquiry: InquirySnapshot,
): InquiryAcceptanceEffects {
  return { inquiryStatus: "accepted" };
}

/**
 * REQ-CONFIRM-EFFECTS-008 (HIGH-2) — 1시간 윈도 내 accepted → declined/conditional 보상 산출.
 *
 * - projects.instructor_id = NULL (clear)
 * - projects.status = 'assignment_review' (backward edge — SPEC-PROJECT-AMEND-001 정식 경로)
 * - schedule_items DELETE 필터 (직전 accept이 INSERT한 system_lecture 행)
 *
 * 본 함수는 산출만 수행. 실제 DB UPDATE/DELETE는 Server Action 트랜잭션이 수행.
 */
export function computeAssignmentDowngradeEffects(
  projectId: string,
  instructorId: string,
): AssignmentDowngradeEffects {
  return {
    nextInstructorId: null,
    nextStatus: "assignment_review",
    scheduleDeleteFilter: {
      projectId,
      instructorId,
      scheduleKind: "system_lecture",
    },
  };
}

/**
 * 알림 body truncation (LOW-8: 1000자).
 * conditional_note가 1000자를 초과하면 끝에 `…(생략)` 추가.
 */
export const NOTIFICATION_BODY_MAX_LENGTH = 1000;

export function truncateForNotificationBody(text: string): string {
  if (text.length <= NOTIFICATION_BODY_MAX_LENGTH) return text;
  return `${text.slice(0, NOTIFICATION_BODY_MAX_LENGTH)}…(생략)`;
}
