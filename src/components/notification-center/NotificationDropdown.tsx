"use client";

// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-BELL-001~006 / REQ-NOTIFY-A11Y-001~002.
// 헤더 종 아이콘 + dropdown — 안읽음 카운트 배지 + 최근 10건.

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { NotificationRow } from "@/lib/notifications/types";
import { NotificationItem } from "./NotificationItem";

export interface NotificationDropdownProps {
  unreadCount: number;
  recent: NotificationRow[];
}

export function NotificationDropdown({
  unreadCount,
  recent,
}: NotificationDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const display = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `알림, 안읽음 ${unreadCount}건`
              : "알림"
          }
          aria-expanded={open}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {display && (
            <span
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-state-alert)] px-1 text-[9px] font-bold text-white"
              aria-hidden
            >
              {display}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0" role="menu">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
          <span className="text-sm font-semibold">알림</span>
          {unreadCount > 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              안읽음 {unreadCount}건
            </span>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
            새 알림이 없습니다.
          </div>
        ) : (
          <>
            <div className="max-h-96 overflow-y-auto py-1">
              {recent.map((r) => (
                <NotificationItem
                  key={r.id}
                  row={r}
                  variant="menu"
                  onAfterClick={() => setOpen(false)}
                />
              ))}
            </div>
            <div className="border-t border-[var(--color-border)] px-3 py-2 text-center">
              <Link
                href="/notifications"
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                onClick={() => setOpen(false)}
              >
                모두 보기
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
