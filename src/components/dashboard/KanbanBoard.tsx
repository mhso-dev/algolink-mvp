// @MX:NOTE: SPEC-DASHBOARD-001 §M4 — 칸반 보드 (5컬럼).
// @MX:NOTE: SPEC-MOBILE-001 §M4 — 모바일(<sm) 가로 scroll-snap, 태블릿(sm~lg-1) 2-col grid, 데스크탑(lg+) 5-col grid.
import { KanbanColumn } from "./KanbanColumn";
import { cn } from "@/lib/utils";
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
    <div
      className={cn(
        "min-w-0",
        // mobile (<sm): 가로 scroll-snap
        "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2",
        // tablet (sm~lg-1): 2-col grid
        "sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:pb-0 sm:snap-none",
        // desktop (lg+): 5-col grid
        "lg:grid-cols-5",
      )}
    >
      {DASHBOARD_COLUMNS.map((label) => (
        <div
          key={label}
          className="snap-start shrink-0 min-w-[280px] sm:min-w-0 sm:shrink"
        >
          <KanbanColumn
            label={label}
            rows={columns.get(label) ?? []}
            isActive={!isAnyFilterActive || activeSet.has(label)}
            isAnyFilterActive={isAnyFilterActive}
          />
        </div>
      ))}
    </div>
  );
}
