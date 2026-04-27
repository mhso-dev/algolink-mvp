// @MX:NOTE: SPEC-DASHBOARD-001 §M7 — 알림 미리보기 (placeholder + helper text).
import Link from "next/link";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NotificationPreview as NotificationPreviewData } from "@/lib/dashboard/types";

interface NotificationPreviewProps {
  preview: NotificationPreviewData;
}

const ROWS: { kind: keyof Omit<NotificationPreviewData, "updatedAt">; label: string }[] = [
  { kind: "unanswered", label: "미응답 배정 요청" },
  { kind: "conflict", label: "일정 충돌" },
  { kind: "deadline", label: "D-Day 경고" },
];

export function NotificationPreview({ preview }: NotificationPreviewProps) {
  const isPlaceholder = preview.updatedAt === null;
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-center gap-2 pb-1">
        <Bell className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
        <h2 className="text-sm font-semibold">알림 미리보기</h2>
      </div>
      <ul className="flex flex-col gap-1.5">
        {ROWS.map((row) => (
          <li key={row.kind}>
            <Link
              href="/notifications"
              className="flex items-center justify-between rounded-sm px-1 py-0.5 text-sm hover:bg-[var(--color-neutral-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label={`${row.label} ${preview[row.kind]}건`}
            >
              <span className="text-[var(--color-text)]">{row.label}</span>
              <span className="font-tabular text-[var(--color-text-muted)]">
                {preview[row.kind]}건
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {isPlaceholder && (
        <p className="pt-1 text-xs text-[var(--color-text-subtle)]">
          알림 시스템 활성화 후 사용 가능합니다.
        </p>
      )}
    </Card>
  );
}
