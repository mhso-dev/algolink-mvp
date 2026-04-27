import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6 text-[var(--color-primary)]" />
          알림
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          배정 요청·일정 변경·정산 안내·이슈 사항을 모아 보여드려요.
        </p>
      </header>

      <Card>
        <CardContent className="py-16 text-center">
          <Bell className="h-10 w-10 mx-auto mb-3 text-[var(--color-text-subtle)]" />
          <p className="font-medium mb-1">모든 알림을 확인했어요</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            새 알림이 도착하면 여기에 표시됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
