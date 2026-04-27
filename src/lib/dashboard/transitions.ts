// @MX:NOTE: SPEC-DASHBOARD-001 §M1 — 상태 전환 도메인 규칙.
// @MX:SPEC: SPEC-DASHBOARD-001
import type { ProjectStatus } from "@/lib/projects";
import type { DashboardColumnLabel } from "./types";
import {
  DASHBOARD_COLUMNS,
  STATUS_COLUMN_MAP,
  statusToDashboardColumn,
} from "./types";

/**
 * 컬럼 단위 forward 경로: 의뢰 → 강사매칭 → 컨펌 → 진행 → 정산.
 * 같은 컬럼 내 다음 enum 또는 다음 컬럼의 첫 enum으로 전이 가능.
 */
export const STATUS_FORWARD_PATH: readonly ProjectStatus[] = (() => {
  const flat: ProjectStatus[] = [];
  for (const col of DASHBOARD_COLUMNS) {
    flat.push(...STATUS_COLUMN_MAP[col]);
  }
  return flat;
})();

const FORWARD_INDEX: Map<ProjectStatus, number> = new Map(
  STATUS_FORWARD_PATH.map((s, i) => [s, i]),
);

/**
 * 다음 단계 status — 같은 컬럼 안의 다음 enum, 또는 컬럼 경계를 넘어 다음 컬럼의 첫 enum.
 * 마지막 status(`task_done`)는 null.
 */
export function nextStatus(from: ProjectStatus): ProjectStatus | null {
  const idx = FORWARD_INDEX.get(from);
  if (idx === undefined) return null;
  if (idx + 1 >= STATUS_FORWARD_PATH.length) return null;
  return STATUS_FORWARD_PATH[idx + 1];
}

/**
 * 다음 컬럼 라벨 (현재가 정산 컬럼이면 null).
 */
export function nextColumnLabel(from: ProjectStatus): DashboardColumnLabel | null {
  const next = nextStatus(from);
  if (!next) return null;
  const currentCol = statusToDashboardColumn(from);
  const nextCol = statusToDashboardColumn(next);
  // 같은 컬럼 안에서의 전이는 라벨이 동일 — 다음 컬럼이 다를 때만 의미 있는 라벨 반환.
  return nextCol !== currentCol ? nextCol : currentCol;
}

/**
 * forward 1단계 전이만 허용. 역방향 / skip / 동일 enum 모두 거부.
 */
export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  const next = nextStatus(from);
  if (next === null) return false;
  return next === to;
}

/**
 * 다음 컬럼으로 전이할 때 노출할 버튼 라벨. 같은 컬럼 안 전이면 다음 enum 라벨로 fallback.
 */
export function transitionButtonLabel(from: ProjectStatus): string | null {
  const nextCol = nextColumnLabel(from);
  if (!nextCol) return null;
  const currentCol = statusToDashboardColumn(from);
  if (nextCol !== currentCol) {
    return `${nextCol}으로`;
  }
  return "다음 단계로";
}
