"use client";

// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-LIST-004 — 알림 페이지네이션.

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const sp = useSearchParams();
  if (totalPages <= 1) return null;
  const buildHref = (p: number) => {
    const params = new URLSearchParams(sp?.toString());
    params.set("page", String(p));
    return `/notifications?${params.toString()}`;
  };
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  return (
    <nav
      aria-label="페이지네이션"
      className="flex items-center justify-center gap-1 py-2 text-sm"
    >
      <Link
        href={buildHref(prev)}
        aria-disabled={page === 1}
        className={`rounded border px-2 py-1 ${page === 1 ? "pointer-events-none opacity-50" : "hover:bg-[var(--color-neutral-100)]"}`}
      >
        이전
      </Link>
      <span className="px-3 text-[var(--color-text-muted)]">
        {page} / {totalPages}
      </span>
      <Link
        href={buildHref(next)}
        aria-disabled={page === totalPages}
        className={`rounded border px-2 py-1 ${page === totalPages ? "pointer-events-none opacity-50" : "hover:bg-[var(--color-neutral-100)]"}`}
      >
        다음
      </Link>
    </nav>
  );
}
