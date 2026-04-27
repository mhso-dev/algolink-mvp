"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { Toaster } from "@/components/ui/sonner";
import { getNavSections } from "@/lib/nav";
import type { AppRole } from "@/lib/role";

interface AppShellProps {
  user: { email: string; displayName: string };
  role: AppRole;
  unreadNotifications?: number;
  children: React.ReactNode;
}

export function AppShell({
  user,
  role,
  unreadNotifications = 0,
  children,
}: AppShellProps) {
  const sections = React.useMemo(() => getNavSections(role), [role]);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar sections={sections} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={user} role={role} unreadNotifications={unreadNotifications} />
        <main className="flex-1 overflow-y-auto bg-[var(--color-background)]">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
