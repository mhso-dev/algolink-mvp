"use client";

// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-LIST-002 / REQ-NOTIFY-A11Y-002.
// 단일 알림 항목 — 클릭 시 markRead Server Action + link_url 라우팅.

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_BADGE_CLASS,
} from "@/lib/notifications/constants";
import type { NotificationRow } from "@/lib/notifications/types";
import { formatRelativeKo, formatAbsoluteKstShort } from "./format-time";
import { markReadAction } from "@/app/(app)/notifications/actions";

export interface NotificationItemProps {
  row: NotificationRow;
  /** 항목 클릭 후 추가 콜백 (드롭다운 닫기 등). */
  onAfterClick?: () => void;
  variant?: "list" | "menu";
}

export function NotificationItem({
  row,
  onAfterClick,
  variant = "list",
}: NotificationItemProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handleClick = React.useCallback(() => {
    startTransition(async () => {
      if (!row.read_at) {
        await markReadAction(row.id);
      }
      onAfterClick?.();
      if (row.link_url) {
        router.push(row.link_url);
      } else {
        router.refresh();
      }
    });
  }, [row.id, row.read_at, row.link_url, router, onAfterClick]);

  const isMenu = variant === "menu";
  const baseCls = isMenu
    ? "flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-[var(--color-neutral-100)]"
    : "flex w-full flex-col gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left hover:bg-[var(--color-neutral-50)]";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      role={isMenu ? "menuitem" : undefined}
      aria-label={`${NOTIFICATION_TYPE_LABEL[row.type]} - ${row.title}`}
      className={`${baseCls} disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${NOTIFICATION_TYPE_BADGE_CLASS[row.type]}`}
        >
          {NOTIFICATION_TYPE_LABEL[row.type]}
        </span>
        {!row.read_at && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-state-alert)]"
            aria-label="안 읽음"
          />
        )}
        <time
          className="ml-auto text-xs text-[var(--color-text-muted)]"
          dateTime={row.created_at}
          title={formatAbsoluteKstShort(row.created_at)}
        >
          {formatRelativeKo(row.created_at)}
        </time>
      </div>
      <div className="text-sm font-medium text-[var(--color-text)]">
        {row.title}
      </div>
      {row.body && (
        <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">
          {row.body}
        </div>
      )}
    </button>
  );
}
