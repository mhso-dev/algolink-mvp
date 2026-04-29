// @MX:NOTE: SPEC-DASHBOARD-001 — 운영자 메인 대시보드 (KPI + 칸반 + 알림 + 캘린더 링크).
import Link from "next/link";
import { CalendarDays, LayoutDashboard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { StatusFilter } from "@/components/dashboard/StatusFilter";
import { KanbanBoard } from "@/components/dashboard/KanbanBoard";
import { NotificationPreview } from "@/components/dashboard/NotificationPreview";
import { ErrorState } from "@/components/dashboard/ErrorState";
import { requireUser } from "@/lib/auth";
import {
  getKpiSummary,
  getProjectsByStatus,
  getRecentNotifications,
} from "@/lib/dashboard/queries";
import {
  DASHBOARD_COLUMNS,
  isDashboardColumnLabel,
  type DashboardColumnLabel,
} from "@/lib/dashboard/types";
import { Container } from "@/components/app/container";

export const revalidate = 30;

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function parseStatusParam(raw: string | undefined): DashboardColumnLabel[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(isDashboardColumnLabel);
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await requireUser();
  const sp = await searchParams;
  const active = parseStatusParam(sp.status);

  const [kpiResult, columnsResult, previewResult] = await Promise.allSettled([
    getKpiSummary(),
    getProjectsByStatus(active),
    getRecentNotifications(session.id, 5),
  ]);

  const kpi = kpiResult.status === "fulfilled" ? kpiResult.value : null;
  const columns =
    columnsResult.status === "fulfilled"
      ? columnsResult.value
      : new Map(DASHBOARD_COLUMNS.map((c) => [c, []]));
  const preview =
    previewResult.status === "fulfilled"
      ? previewResult.value
      : { unanswered: 0, conflict: 0, deadline: 0, updatedAt: null as string | null };

  const hasErrors =
    kpiResult.status === "rejected" ||
    columnsResult.status === "rejected" ||
    previewResult.status === "rejected";

  return (
    <Container variant="default" className="flex flex-col gap-6 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LayoutDashboard className="h-6 w-6 text-[var(--color-primary)]" aria-hidden />
            대시보드
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            안녕하세요, {session.displayName}님. 오늘 처리할 업무를 한눈에 확인하세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus aria-hidden /> 새 프로젝트
          </Link>
        </Button>
      </header>

      <KpiGrid summary={kpi} />

      {hasErrors && (
        <ErrorState
          title="일부 데이터를 불러오지 못했습니다."
          message="네트워크 또는 서버 일시 오류일 수 있습니다. 잠시 후 다시 시도해주세요."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusFilter />
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/calendar">
                <CalendarDays aria-hidden /> 강사 일정 보기
              </Link>
            </Button>
          </div>
          <KanbanBoard columns={columns} activeColumns={active} />
        </section>
        <NotificationPreview preview={preview} />
      </div>
    </Container>
  );
}
