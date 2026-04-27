"use client";
// @MX:NOTE: SPEC-DASHBOARD-001 §M4 — URL search-param 동기화 멀티 필터.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_COLUMNS,
  isDashboardColumnLabel,
  type DashboardColumnLabel,
} from "@/lib/dashboard/types";

function parseStatus(param: string | null): DashboardColumnLabel[] {
  if (!param) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(isDashboardColumnLabel);
}

export function StatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = React.useMemo(
    () => new Set(parseStatus(searchParams.get("status"))),
    [searchParams],
  );

  const toggle = (col: DashboardColumnLabel) => {
    const next = new Set(active);
    if (next.has(col)) {
      next.delete(col);
    } else {
      next.add(col);
    }
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 0) {
      params.delete("status");
    } else {
      // 정렬 유지 (DASHBOARD_COLUMNS 순서)
      const ordered = DASHBOARD_COLUMNS.filter((c) => next.has(c));
      params.set("status", ordered.join(","));
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div role="group" aria-label="프로젝트 상태 필터" className="flex flex-wrap gap-2">
      {DASHBOARD_COLUMNS.map((col) => {
        const isActive = active.has(col);
        return (
          <button
            key={col}
            type="button"
            aria-pressed={isActive}
            onClick={() => toggle(col)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
              isActive
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-neutral-100)] dark:bg-transparent",
            )}
          >
            {col}
          </button>
        );
      })}
    </div>
  );
}
