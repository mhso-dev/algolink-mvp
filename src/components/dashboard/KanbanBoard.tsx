// @MX:NOTE: SPEC-DASHBOARD-001 §M4 — 칸반 보드 (5컬럼).
import { KanbanColumn } from "./KanbanColumn";
import {
  DASHBOARD_COLUMNS,
  type DashboardColumnLabel,
  type ProjectKanbanRow,
} from "@/lib/dashboard/types";

interface KanbanBoardProps {
  columns: Map<DashboardColumnLabel, ProjectKanbanRow[]>;
  activeColumns: readonly DashboardColumnLabel[];
}

export function KanbanBoard({ columns, activeColumns }: KanbanBoardProps) {
  const activeSet = new Set(activeColumns);
  const isAnyFilterActive = activeSet.size > 0;
  return (
    <div className="grid gap-3 lg:grid-cols-5 sm:grid-cols-2 grid-cols-1 min-w-0">
      {DASHBOARD_COLUMNS.map((label) => (
        <KanbanColumn
          key={label}
          label={label}
          rows={columns.get(label) ?? []}
          isActive={!isAnyFilterActive || activeSet.has(label)}
          isAnyFilterActive={isAnyFilterActive}
        />
      ))}
    </div>
  );
}
