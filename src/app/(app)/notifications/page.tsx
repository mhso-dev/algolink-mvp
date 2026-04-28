// SPEC-NOTIFY-001 §M5 REQ-NOTIFY-LIST-001~008 — 전체 알림 페이지.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { listMyNotifications } from "@/lib/notifications/queries";
import { parseListFilters } from "@/lib/notifications/list-query";
import { NotificationFiltersBar } from "@/components/notification-center/NotificationFiltersBar";
import { NotificationItem } from "@/components/notification-center/NotificationItem";
import { MarkAllReadButton } from "@/components/notification-center/MarkAllReadButton";
import { Pagination } from "@/components/notification-center/Pagination";
import { buildListQueryString } from "@/lib/notifications/list-query";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseListFilters(sp);

  const supabase = createClient(await cookies());
  const result = await listMyNotifications(supabase, {
    userId: user.id,
    types: filters.types,
    read: filters.read,
    page: filters.page,
  });

  // REQ-NOTIFY-LIST-007: 페이지 초과 → 마지막 valid 페이지로 redirect.
  if (result.totalPages > 0 && filters.page > result.totalPages) {
    const fixed = { ...filters, page: result.totalPages };
    redirect(`/notifications${buildListQueryString(fixed)}`);
  }

  const empty = result.items.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-[var(--color-primary)]" />
            알림
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            배정 요청·일정 변경·정산 안내·이슈 사항을 모아 보여드려요.
          </p>
        </div>
        <MarkAllReadButton disabled={empty} />
      </header>

      <NotificationFiltersBar
        current={{ types: filters.types, read: filters.read }}
      />

      {empty ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-10 w-10 mx-auto mb-3 text-[var(--color-text-subtle)]" />
            <p className="font-medium mb-1">
              {filters.read === "unread"
                ? "모든 알림을 확인했어요"
                : "알림이 없습니다"}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              새 알림이 도착하면 여기에 표시됩니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section
          role="list"
          aria-label="알림 목록"
          className="flex flex-col gap-2"
        >
          {result.items.map((row) => (
            <NotificationItem key={row.id} row={row} />
          ))}
        </section>
      )}

      <Pagination page={result.page} totalPages={result.totalPages} />
    </div>
  );
}
