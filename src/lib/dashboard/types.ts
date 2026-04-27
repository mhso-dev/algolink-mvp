// @MX:ANCHOR: SPEC-DASHBOARD-001 §M1 — 대시보드 도메인 타입 + STATUS_COLUMN_MAP 단일 출처.
// @MX:REASON: SQL aggregate / 칸반 UI / 상태 전환 로직이 모두 본 매핑을 사용 (fan_in >= 4).
// @MX:SPEC: SPEC-DASHBOARD-001
import type { ProjectStatus } from "@/lib/projects";

/**
 * 대시보드 칸반 5개 컬럼 라벨 (SPEC-DASHBOARD-001 §1.2).
 * 13단계 워크플로우(SPEC-DB-001)를 5개 운영 컬럼으로 묶는다.
 */
export type DashboardColumnLabel =
  | "의뢰"
  | "강사매칭"
  | "컨펌"
  | "진행"
  | "정산";

/**
 * 좌→우 라이프사이클 순서로 고정.
 */
export const DASHBOARD_COLUMNS: readonly DashboardColumnLabel[] = [
  "의뢰",
  "강사매칭",
  "컨펌",
  "진행",
  "정산",
] as const;

/**
 * UI 컬럼 → Postgres project_status enum 묶음.
 * 단일 출처(Single Source of Truth) — SQL filter / UI grouping / 상태 전환에서 모두 참조.
 */
export const STATUS_COLUMN_MAP: Record<DashboardColumnLabel, readonly ProjectStatus[]> = {
  의뢰: ["proposal", "contract_confirmed", "lecture_requested"],
  강사매칭: ["instructor_sourcing", "assignment_review"],
  컨펌: ["assignment_confirmed", "education_confirmed", "recruiting"],
  진행: ["progress_confirmed", "in_progress"],
  정산: ["education_done", "settlement_in_progress", "task_done"],
} as const;

/**
 * status → 컬럼 라벨 역매핑. UI에서 카드를 그룹화할 때 사용.
 */
const STATUS_TO_COLUMN: Map<ProjectStatus, DashboardColumnLabel> = (() => {
  const m = new Map<ProjectStatus, DashboardColumnLabel>();
  for (const col of DASHBOARD_COLUMNS) {
    for (const s of STATUS_COLUMN_MAP[col]) {
      m.set(s, col);
    }
  }
  return m;
})();

export function statusToDashboardColumn(status: ProjectStatus): DashboardColumnLabel {
  const col = STATUS_TO_COLUMN.get(status);
  if (!col) {
    // 정의되지 않은 enum: 기본 '의뢰'로 처리 (런타임 안전).
    return "의뢰";
  }
  return col;
}

/**
 * 알 수 없는 status 라벨 입력을 silently ignore 하기 위한 가드.
 */
export function isDashboardColumnLabel(value: unknown): value is DashboardColumnLabel {
  return typeof value === "string" && (DASHBOARD_COLUMNS as readonly string[]).includes(value);
}

// -------- KPI 타입 --------

export interface KpiSummary {
  /** 의뢰/계약확정/강의요청 합계 */
  requestCount: number;
  /** 배정확정 단계(컨펌 컬럼 묶음 첫 enum) 건수 */
  confirmedCount: number;
  /** 진행 컬럼(진행확정+진행중) 건수 */
  inProgressCount: number;
  /** 미정산 합계 (paid 외 amount_total 합) */
  unsettledTotal: number;
}

// -------- 칸반 행 --------

export interface ProjectKanbanRow {
  id: string;
  title: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  scheduledAt: string | null;
  clientId: string | null;
  clientName: string | null;
  instructorName: string | null;
  businessAmountKrw: number;
}

// -------- 캘린더 이벤트 --------

export interface ScheduleEvent {
  id: string;
  instructorId: string;
  instructorName: string;
  projectId: string | null;
  projectTitle: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

// -------- 알림 미리보기 (SPEC-NOTIF-001 인터페이스 lock) --------

export interface NotificationPreview {
  unanswered: number;
  conflict: number;
  deadline: number;
  /** SPEC-NOTIF-001 활성화 여부 판정 (null = placeholder mode) */
  updatedAt: string | null;
}

// -------- 강사 색상 팔레트 (8색 사이클, 결정성) --------

export const INSTRUCTOR_COLOR_PALETTE: readonly string[] = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
] as const;

/**
 * 강사 ID → 색상 결정성 매핑 (REQ-DASH-CALENDAR-003).
 * 같은 ID는 항상 같은 색을 반환한다.
 */
export function colorForInstructor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return INSTRUCTOR_COLOR_PALETTE[h % INSTRUCTOR_COLOR_PALETTE.length];
}
