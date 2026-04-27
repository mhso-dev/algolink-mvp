// @MX:NOTE: SPEC-DASHBOARD-001 §M4 — 칸반 카드 (제목/고객사/일정/전환 버튼).
import Link from "next/link";
import { CalendarDays, User as UserIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatKstDateRange } from "@/lib/dashboard/format";
import {
  nextColumnLabel,
  nextStatus,
  transitionButtonLabel,
} from "@/lib/dashboard/transitions";
import type { ProjectKanbanRow } from "@/lib/dashboard/types";
import { StatusTransitionButton } from "./StatusTransitionButton";

export function ProjectCard({ row }: { row: ProjectKanbanRow }) {
  const next = nextStatus(row.status);
  const buttonLabel = transitionButtonLabel(row.status);
  const nextCol = nextColumnLabel(row.status);
  const showButton = next !== null && nextCol !== null && buttonLabel !== null;

  const dateLabel = formatKstDateRange(row.startDate, row.endDate);

  return (
    <Card className="flex flex-col gap-2 p-3 transition-shadow hover:shadow-md">
      <Link
        href={`/projects/${row.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-sm"
      >
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{row.title}</h3>
        {row.clientName && (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-muted)]">
            {row.clientName}
          </p>
        )}
      </Link>

      <div className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          <span className="font-tabular">{dateLabel}</span>
        </div>
        {row.instructorName && (
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="line-clamp-1">{row.instructorName}</span>
          </div>
        )}
      </div>

      {showButton && next && (
        <div className="pt-1">
          <StatusTransitionButton
            projectId={row.id}
            fromStatus={row.status}
            toStatus={next}
            toLabel={buttonLabel}
          />
        </div>
      )}
    </Card>
  );
}
