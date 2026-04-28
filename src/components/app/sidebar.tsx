"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/nav";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface SidebarProps {
  sections: NavSection[];
  collapsed?: boolean;
  /**
   * SPEC-MOBILE-001 §M2: Sheet drawer 내부 등 viewport 분기와 무관하게
   * 항상 표시해야 할 때 true. 기본 false → AppShell 직접 사용 시
   * `hidden lg:flex`로 모바일에서 자동 미렌더된다.
   */
  forceVisible?: boolean;
}

export function Sidebar({ sections, collapsed = false, forceVisible = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "flex-col bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] transition-[width] duration-150",
          forceVisible ? "flex" : "hidden lg:flex",
          collapsed ? "w-[var(--layout-sidebar-width-collapsed)]" : "w-[var(--layout-sidebar-width)]",
        )}
        style={{
          width: collapsed
            ? "var(--layout-sidebar-width-collapsed)"
            : "var(--layout-sidebar-width)",
        }}
        aria-label="주 네비게이션"
      >
        {/* Logo */}
        <div className="flex h-[var(--layout-topbar-height)] items-center gap-2 border-b border-white/10 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-primary)]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight">Algolink</span>
          )}
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto py-4">
          {sections.map((section, idx) => (
            <div key={section.title} className={cn(idx > 0 && "mt-6")}>
              {!collapsed && (
                <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  {section.title}
                </div>
              )}
              <ul className="space-y-0.5 px-2">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const linkInner = (
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-white/10 text-white font-medium"
                          : "text-white/70 hover:bg-white/5 hover:text-white",
                        collapsed && "justify-center",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className="ml-auto rounded-full bg-[var(--color-state-alert)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{linkInner}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        linkInner
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 text-[11px] text-white/40">
          {!collapsed ? "v0.1.0 · MVP" : "v0.1"}
        </div>
      </aside>
    </TooltipProvider>
  );
}
