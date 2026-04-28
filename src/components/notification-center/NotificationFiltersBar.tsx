"use client";

// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-LIST-003 — 타입/읽음 필터 바.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  NOTIFICATION_TYPE_LABEL,
} from "@/lib/notifications/constants";
import { NOTIFICATION_TYPES, type NotificationType, type ReadFilter } from "@/lib/notifications/types";

export function NotificationFiltersBar({
  current,
}: {
  current: { types: NotificationType[]; read: ReadFilter };
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const apply = (next: { types?: NotificationType[]; read?: ReadFilter }) => {
    const params = new URLSearchParams(sp?.toString());
    const types = next.types ?? current.types;
    const read = next.read ?? current.read;
    if (types.length > 0) params.set("type", types.join(","));
    else params.delete("type");
    if (read !== "all") params.set("read", read);
    else params.delete("read");
    params.delete("page");
    router.push(`/notifications?${params.toString()}`);
  };

  const toggleType = (t: NotificationType) => {
    const next = current.types.includes(t)
      ? current.types.filter((x) => x !== t)
      : [...current.types, t];
    apply({ types: next });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
        타입
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NOTIFICATION_TYPES.map((t) => {
          const active = current.types.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
              }`}
            >
              {NOTIFICATION_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
        상태
      </div>
      <div className="flex gap-1.5">
        {(["all", "unread", "read"] as const).map((r) => {
          const active = current.read === r;
          const label = r === "all" ? "전체" : r === "unread" ? "안읽음" : "읽음";
          return (
            <button
              key={r}
              type="button"
              onClick={() => apply({ read: r })}
              aria-pressed={active}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
