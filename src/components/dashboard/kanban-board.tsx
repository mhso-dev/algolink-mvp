"use client";

import * as React from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, User as UserIcon, MoreVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  KANBAN_COLUMNS,
  COLUMN_LABELS,
  STATUS_LABELS,
  columnBadgeVariant,
  statusToColumn,
  type KanbanColumnKey,
  type ProjectStatus,
} from "@/lib/projects";
import { formatKRW } from "@/lib/utils";

export interface KanbanProject {
  id: string;
  title: string;
  status: ProjectStatus;
  scheduledAt: string | null;
  educationStartAt: string | null;
  educationEndAt: string | null;
  businessAmountKrw: number;
  instructorName: string | null;
  clientName: string | null;
  operatorName: string | null;
}

interface KanbanBoardProps {
  projects: KanbanProject[];
}

export function KanbanBoard({ projects }: KanbanBoardProps) {
  const grouped = React.useMemo(() => {
    const map: Record<KanbanColumnKey, KanbanProject[]> = {
      request: [],
      proposed: [],
      confirmed: [],
      in_progress: [],
      completed: [],
    };
    for (const p of projects) {
      map[statusToColumn(p.status)].push(p);
    }
    return map;
  }, [projects]);

  return (
    <div className="grid grid-cols-5 gap-4 min-w-[1100px]">
      {KANBAN_COLUMNS.map((col) => {
        const items = grouped[col];
        return (
          <section
            key={col}
            className="flex flex-col rounded-lg bg-[var(--color-neutral-100)] dark:bg-[var(--color-neutral-900)] p-3"
            aria-label={COLUMN_LABELS[col]}
          >
            <header className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-2">
                <Badge variant={columnBadgeVariant(col)}>{COLUMN_LABELS[col]}</Badge>
                <span className="text-xs font-semibold text-[var(--color-text-muted)] font-tabular">
                  {items.length}
                </span>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="컬럼 옵션">
                <MoreVertical />
              </Button>
            </header>

            <div className="flex flex-col gap-2 min-h-[60px]">
              {items.length === 0 ? (
                <EmptyColumn />
              ) : (
                items.map((p) => <KanbanCard key={p.id} project={p} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({ project: p }: { project: KanbanProject }) {
  const dateLabel = formatDateRange(p.educationStartAt, p.educationEndAt) ??
    (p.scheduledAt ? format(new Date(p.scheduledAt), "yyyy.MM.dd", { locale: ko }) : "일정 미정");

  return (
    <Card className="cursor-pointer p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Badge variant={columnBadgeVariant(statusToColumn(p.status))} className="text-[10px] py-0">
              {STATUS_LABELS[p.status]}
            </Badge>
          </div>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1">{p.title}</h3>
          {p.clientName && (
            <p className="text-xs text-[var(--color-text-muted)] line-clamp-1 mb-2">
              {p.clientName}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="font-tabular">{dateLabel}</span>
        </div>
        {p.instructorName && (
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{p.instructorName}</span>
          </div>
        )}
        {p.businessAmountKrw > 0 && (
          <div className="font-tabular text-[var(--color-text)] font-medium pt-1">
            {formatKRW(p.businessAmountKrw, { sign: true })}
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyColumn() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-xs text-[var(--color-text-subtle)]">현재 항목이 없어요.</p>
    </div>
  );
}

function formatDateRange(startISO: string | null, endISO: string | null): string | null {
  if (!startISO) return null;
  const start = new Date(startISO);
  const startLabel = format(start, "yyyy.MM.dd", { locale: ko });
  if (!endISO) return startLabel;
  const end = new Date(endISO);
  const endLabel = format(end, "MM.dd", { locale: ko });
  if (start.getTime() === end.getTime()) return startLabel;
  return `${startLabel} ~ ${endLabel}`;
}
