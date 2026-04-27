/**
 * 프로젝트 워크플로우 13 단계를 칸반 5 컬럼으로 그룹핑.
 * @MX:NOTE: SPEC-DB-001 §2.6 project_status enum 기반.
 */

export type ProjectStatus =
  | "proposal"
  | "contract_confirmed"
  | "lecture_requested"
  | "instructor_sourcing"
  | "assignment_review"
  | "assignment_confirmed"
  | "education_confirmed"
  | "recruiting"
  | "progress_confirmed"
  | "in_progress"
  | "education_done"
  | "settlement_in_progress"
  | "task_done";

export type KanbanColumnKey =
  | "request"
  | "proposed"
  | "confirmed"
  | "in_progress"
  | "completed";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  proposal: "사업제안",
  contract_confirmed: "사업확정",
  lecture_requested: "강의요청",
  instructor_sourcing: "강사섭외",
  assignment_review: "배정검토",
  assignment_confirmed: "배정확정",
  education_confirmed: "교육확정",
  recruiting: "모집중",
  progress_confirmed: "진행확정",
  in_progress: "진행중",
  education_done: "교육종료",
  settlement_in_progress: "정산진행",
  task_done: "과업종료",
};

export const COLUMN_LABELS: Record<KanbanColumnKey, string> = {
  request: "과정의뢰",
  proposed: "강사제안",
  confirmed: "배정확정",
  in_progress: "교육중",
  completed: "교육종료",
};

export const KANBAN_COLUMNS: KanbanColumnKey[] = [
  "request",
  "proposed",
  "confirmed",
  "in_progress",
  "completed",
];

const STATUS_TO_COLUMN: Record<ProjectStatus, KanbanColumnKey> = {
  proposal: "request",
  contract_confirmed: "request",
  lecture_requested: "request",
  instructor_sourcing: "proposed",
  assignment_review: "proposed",
  assignment_confirmed: "confirmed",
  education_confirmed: "confirmed",
  recruiting: "confirmed",
  progress_confirmed: "in_progress",
  in_progress: "in_progress",
  education_done: "completed",
  settlement_in_progress: "completed",
  task_done: "completed",
};

export function statusToColumn(status: ProjectStatus): KanbanColumnKey {
  return STATUS_TO_COLUMN[status];
}

/** 컬럼 → Badge variant 매핑 (badge.tsx variants와 일치) */
export function columnBadgeVariant(column: KanbanColumnKey):
  | "request"
  | "proposed"
  | "confirmed"
  | "in-progress"
  | "completed" {
  return column === "in_progress" ? "in-progress" : column;
}

export function statusBadgeVariant(status: ProjectStatus) {
  return columnBadgeVariant(statusToColumn(status));
}

/** 정산 흐름 표시 한글 */
export const SETTLEMENT_FLOW_LABEL: Record<string, string> = {
  corporate: "기업교육 (고객→알고링크→강사)",
  government: "정부교육 (고객→강사→알고링크)",
};

/** 정산 상태 한글 */
export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  pending: "정산 전",
  requested: "정산 요청",
  paid: "정산 완료",
  held: "보류",
};

export function settlementStatusBadgeVariant(status: string) {
  return (
    {
      pending: "pending",
      requested: "info",
      paid: "settled",
      held: "alert",
    } as const
  )[status as keyof typeof SETTLEMENT_STATUS_LABEL] ?? "secondary";
}
