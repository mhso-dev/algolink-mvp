"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, LogOut, Settings, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppRole } from "@/lib/role";
import { roleLabel } from "@/lib/role";
import { logout } from "@/app/login/actions";

interface TopBarProps {
  user: { email: string; displayName: string };
  role: AppRole;
  unreadNotifications?: number;
}

export function TopBar({ user, role, unreadNotifications = 0 }: TopBarProps) {
  const initial = user.displayName.trim().slice(0, 1) || "?";
  const router = useRouter();

  const handleLogout = React.useCallback(() => {
    React.startTransition(async () => {
      await logout();
      router.refresh();
    });
  }, [router]);

  return (
    <header
      className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4"
      style={{ height: "var(--layout-topbar-height)" }}
    >
      {/* 검색 */}
      <div className="relative flex-1 max-w-md">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="강사·프로젝트·고객사 검색  (⌘K)"
          className="pl-8 h-9"
          aria-label="검색"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* 알림 */}
        <Button variant="ghost" size="icon" aria-label="알림 보기">
          <div className="relative">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-state-alert)] px-0.5 text-[9px] font-bold text-white"
                aria-label={`읽지 않은 알림 ${unreadNotifications}건`}
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </div>
        </Button>

        {/* 프로필 드롭다운 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-[var(--color-neutral-100)] dark:hover:bg-[var(--color-neutral-800)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label="프로필 메뉴 열기"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:flex flex-col items-start text-left leading-tight">
                <span className="text-xs font-medium text-[var(--color-text)]">
                  {user.displayName}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {roleLabel(role)}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium normal-case tracking-normal text-[var(--color-text)]">
                  {user.displayName}
                </span>
                <span className="text-xs normal-case tracking-normal text-[var(--color-text-muted)]">
                  {user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon className="h-4 w-4" /> 프로필
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="h-4 w-4" /> 설정
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-[var(--color-state-alert)]">
              <LogOut className="h-4 w-4" /> 로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
