// SPEC-CONFIRM-001 §M1 — 강사 응답 도메인 타입.
// pure types only — Drizzle / Supabase / React 의존성 없음.

/** 응답 source 종류 — 사전 가용성 문의 vs 정식 배정 요청. */
export type ResponseSourceKind = "proposal_inquiry" | "assignment_request";

/** 응답 상태 (MEDIUM-5: 'pending' 제거, row 부재로 표현). */
export type ResponseStatus = "accepted" | "declined" | "conditional";

/** UI 표시용 확장 — 미응답(row 부재)을 null로 표현. */
export type ResponseStatusOrPending = ResponseStatus | null;

/** instructor_responses 1행 (애플리케이션 도메인 모델). */
export interface InstructorResponse {
  id: string;
  sourceKind: ResponseSourceKind;
  projectId: string | null;
  proposalInquiryId: string | null;
  instructorId: string;
  status: ResponseStatus;
  conditionalNote: string | null;
  respondedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** 응답 생성/수정 입력 (Server Action 입력). */
export interface RespondInput {
  status: ResponseStatus;
  conditionalNote?: string | null;
}

/** 응답 부수효과 결과 (computeAssignmentAcceptanceEffects 등). */
export interface ScheduleItemDraft {
  instructorId: string;
  projectId: string;
  scheduleKind: "system_lecture";
  startsAt: Date;
  endsAt: Date;
}

export interface ProjectSnapshot {
  id: string;
  status: string; // ProjectStatus enum (string으로 단순화 — 파일 분리 의존성 회피)
  educationStartAt: Date | null;
  educationEndAt: Date | null;
  operatorId: string | null;
}

export interface InquirySnapshot {
  id: string;
  status: string;
  createdByUserId: string | null;
}

export interface AssignmentAcceptanceEffects {
  scheduleItems: ScheduleItemDraft[];
  nextStatus: "assignment_confirmed" | "assignment_review";
  /** schedule_items 생성 보류 사유(REQ-CONFIRM-EFFECTS-006). */
  scheduleSkippedReason: "education_dates_missing" | null;
}

export interface InquiryAcceptanceEffects {
  inquiryStatus: "accepted";
}

/** REQ-CONFIRM-EFFECTS-008 reverse compensation 산출. */
export interface AssignmentDowngradeEffects {
  /** 보상 후 projects.instructor_id (NULL 강제). */
  nextInstructorId: null;
  /** 보상 후 projects.status. */
  nextStatus: "assignment_review";
  /** 직전 accept이 INSERT한 schedule_items 삭제 대상 필터. */
  scheduleDeleteFilter: {
    projectId: string;
    instructorId: string;
    scheduleKind: "system_lecture";
  };
}

/** Server Action 결과 단일 진입 형식. */
export type ResponseActionResult =
  | { ok: true }
  | { ok: false; reason: string };
