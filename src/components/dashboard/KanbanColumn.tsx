// @MX:NOTE: SPEC-DASHBOARD-001 §M4 — 칸반 컬럼 (라벨 + 카드 리스트 + 100+ 링크).
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./ProjectCard";
import { EmptyState } from "./EmptyState";
import type { DashboardColumnLabel, ProjectKanbanRow } from "@/lib/dashboard/types";

const COLUMN_HARD_LIMIT = 100;

interface KanbanColumnProps {
  label: DashboardColumnLabel;
  rows: ProjectKanbanRow[];
  isActive: boolean;
  isAnyFilterActive: boolean;
}

export function KanbanColumn({ label, rows, isActive, isAnyFilterActive }: KanbanColumnProps) {
  const visible = rows.slice(0, COLUMN_HARD_LIMIT);
  const overflow = rows.length > COLUMN_HARD_LIMIT;

  return (
    <section
      aria-label={`${label} 컬럼 (${rows.length}건)`}
      className={cn(
        "flex flex-col rounded-lg bg-[var(--color-neutral-100)] dark:bg-[var(--color-neutral-900)] p-3",
        isAnyFilterActive && !isActive && "opacity-40",
      )}
    >
      <header className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{label}</Badge>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] font-tabular">
            {rows.length}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2 min-h-[60px]">
        {visible.length === 0 ? (
          <EmptyState message="이 상태의 프로젝트가 없습니다." />
        ) : (
          visible.map((r) => <ProjectCard key={r.id} row={r} />)
        )}
        {overflow && (
          <Link
            href={`/projects?status=${encodeURIComponent(label)}`}
            className="mt-2 text-center text-xs font-medium text-[var(--color-primary)] underline"
          >
            100+개 — 전체 보기
          </Link>
        )}
      </div>
    </section>
  );
}
