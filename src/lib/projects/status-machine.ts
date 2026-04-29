// @MX:ANCHOR: SPEC-PROJECT-001 §2.5 REQ-PROJECT-STATUS-001/002 — 7단계 사용자 흐름 매핑 + 전환 그래프.
// @MX:REASON: 모든 상태 전환이 본 모듈 통과. 위반 시 KPI/감사 무결성 손상.
// @MX:SPEC: SPEC-PROJECT-001

import type { ProjectStatus } from "../projects";

/** 7단계 사용자 흐름 (UI 표시용). */
export const USER_STEPS = [
  "의뢰",
  "강사매칭",
  "요청",
  "컨펌",
  "진행",
  "종료",
  "정산",
] as const;
export type UserStep = (typeof USER_STEPS)[number];

/**
 * 14단계 enum → 7단계 user step 매핑 (REQ-PROJECT-STATUS-001).
 *
 * SPEC-PAYOUT-002 §M6 REQ-PAYOUT002-EXCEPT-007 — `instructor_withdrawn` → '강사매칭'.
 * 강사 중도 하차 시 프로젝트 워크플로우는 강사 재배정 단계로 회귀한다.
 * `defaultEnumForUserStep('강사매칭')`은 forward-flow 기본값(`lecture_requested`)을 보존하므로
 * `instructor_withdrawn`은 regression 진입점일 뿐 default가 되지 않는다.
 */
export function userStepFromEnum(status: ProjectStatus): UserStep {
  switch (status) {
    case "proposal":
    case "contract_confirmed":
      return "의뢰";
    case "lecture_requested":
    case "instructor_sourcing":
    case "instructor_withdrawn": // SPEC-PAYOUT-002 REQ-EXCEPT-007 — 강사 중도 하차는 재배정 대기 (강사매칭 단계)
      return "강사매칭";
    case "assignment_review":
      return "요청";
    case "assignment_confirmed":
    case "education_confirmed":
    case "recruiting":
      return "컨펌";
    case "progress_confirmed":
    case "in_progress":
      return "진행";
    case "education_done":
      return "종료";
    case "settlement_in_progress":
    case "task_done":
      return "정산";
    default: {
      // exhaustiveness check — never assign이 통과하면 14개 case 모두 cover.
      const _exhaustive: never = status;
      throw new Error(`Unhandled project status: ${String(_exhaustive)}`);
    }
  }
}

/** user step → canonical enum (다음 단계로 이동 시 기본값). */
export function defaultEnumForUserStep(step: UserStep): ProjectStatus {
  switch (step) {
    case "의뢰":
      return "proposal";
    case "강사매칭":
      return "lecture_requested";
    case "요청":
      return "assignment_review";
    case "컨펌":
      return "assignment_confirmed";
    case "진행":
      return "progress_confirmed";
    case "종료":
      return "education_done";
    case "정산":
      return "settlement_in_progress";
    default: {
      const _exhaustive: never = step;
      throw new Error(`Unhandled user step: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 허용된 상태 전환 그래프 (REQ-PROJECT-STATUS-002).
 * 자유 전환을 막아 워크플로우 무결성을 강제한다.
 *
 * SPEC-PAYOUT-002 §M6 — `instructor_withdrawn`은 강사 재배정 단계로의 regression entry이며,
 * 다른 status에서 자유롭게 전환되지 않는다. 진입은 `withdrawInstructorAction` Server Action으로만,
 * 회복은 다시 `lecture_requested`/`instructor_sourcing`로의 forward 전환만 허용.
 */
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  proposal: ["contract_confirmed", "lecture_requested"],
  contract_confirmed: ["lecture_requested"],
  lecture_requested: ["instructor_sourcing", "assignment_review", "instructor_withdrawn"],
  instructor_sourcing: ["assignment_review", "instructor_withdrawn"],
  assignment_review: ["assignment_confirmed", "instructor_withdrawn"],
  assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn"],
  education_confirmed: ["recruiting", "progress_confirmed", "instructor_withdrawn"],
  recruiting: ["progress_confirmed", "instructor_withdrawn"],
  progress_confirmed: ["in_progress", "instructor_withdrawn"],
  in_progress: ["education_done", "instructor_withdrawn"],
  education_done: ["settlement_in_progress"],
  settlement_in_progress: ["task_done"],
  task_done: [],
  // SPEC-PAYOUT-002 §M6 — 강사 재배정 시 강사매칭 단계로 forward
  instructor_withdrawn: ["lecture_requested", "instructor_sourcing"],
};

/** validateTransition 입력 — 강사 배정 여부 등 사이드 컨텍스트. */
export interface TransitionContext {
  instructorId: string | null;
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 상태 전환 사전 검증 (REQ-PROJECT-STATUS-002~004).
 *
 * - graph 외 전환은 거부
 * - 강사 미배정 시 컨펌 단계 진입 차단
 * - settlement_in_progress 는 education_done 에서만 진입 가능 (graph 로 표현됨)
 */
export function validateTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: TransitionContext,
): TransitionResult {
  if (from === to) {
    return { ok: false, reason: "현재 상태와 동일한 단계로 전환할 수 없습니다." };
  }

  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: "허용되지 않은 상태 전환입니다.",
    };
  }

  // REQ-PROJECT-STATUS-003: 강사 미배정이면 assignment_confirmed 차단.
  if (to === "assignment_confirmed" && !ctx.instructorId) {
    return {
      ok: false,
      reason: "강사를 배정해야 컨펌 단계로 이동할 수 있습니다.",
    };
  }

  // REQ-PROJECT-STATUS-004: 정산 시작은 education_done 에서만.
  if (to === "settlement_in_progress" && from !== "education_done") {
    return {
      ok: false,
      reason: "강의 종료 후에만 정산을 시작할 수 있습니다.",
    };
  }

  return { ok: true };
}
