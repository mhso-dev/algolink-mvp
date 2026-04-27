import { cookies } from "next/headers";
import Link from "next/link";
import { Plus, LayoutDashboard, CalendarDays } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import {
  KanbanBoard,
  type KanbanProject,
} from "@/components/dashboard/kanban-board";
import { requireUser } from "@/lib/auth";
import type { ProjectStatus } from "@/lib/projects";
import { statusToColumn } from "@/lib/projects";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  title: string;
  status: ProjectStatus;
  scheduled_at: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  instructor_id: string | null;
  client_id: string;
};

type SettlementRow = { id: string; status: string };

export default async function DashboardPage() {
  const session = await requireUser();
  const supabase = createClient(await cookies());

  const [projectsRes, settlementsRes, instructorsRes, clientsRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, status, scheduled_at, education_start_at, education_end_at, business_amount_krw, instructor_id, client_id",
      )
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .returns<ProjectRow[]>(),
    supabase.from("settlements").select("id, status").returns<SettlementRow[]>(),
    supabase
      .from("instructors_safe")
      .select("id, name_kr")
      .returns<{ id: string; name_kr: string | null }[]>(),
    supabase
      .from("clients")
      .select("id, company_name")
      .returns<{ id: string; company_name: string | null }[]>(),
  ]);

  const projects = projectsRes.data ?? [];
  const settlements = settlementsRes.data ?? [];
  const instructorMap = new Map((instructorsRes.data ?? []).map((i) => [i.id, i.name_kr]));
  const clientMap = new Map((clientsRes.data ?? []).map((c) => [c.id, c.company_name]));

  const kanbanProjects: KanbanProject[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    scheduledAt: p.scheduled_at,
    educationStartAt: p.education_start_at,
    educationEndAt: p.education_end_at,
    businessAmountKrw: p.business_amount_krw,
    instructorName: p.instructor_id ? instructorMap.get(p.instructor_id) ?? null : null,
    clientName: clientMap.get(p.client_id) ?? null,
    operatorName: null,
  }));

  const pendingSettlements = settlements.filter(
    (s) => s.status === "pending" || s.status === "requested",
  ).length;
  const pendingAssignments = projects.filter(
    (p) => statusToColumn(p.status) === "request",
  ).length;
  const alerts = 0;

  const fetchError = projectsRes.error?.message ?? settlementsRes.error?.message;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-[var(--color-primary)]" />
            대시보드
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            안녕하세요, {session.displayName}님. 오늘 처리할 업무를 한눈에 확인하세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus /> 새 프로젝트
          </Link>
        </Button>
      </div>

      <KpiCards
        pendingSettlements={pendingSettlements}
        pendingAssignments={pendingAssignments}
        alerts={alerts}
      />

      {fetchError && (
        <Card className="border-[var(--color-state-alert)] p-4">
          <p className="text-sm text-[var(--color-state-alert)]">데이터 조회 오류: {fetchError}</p>
        </Card>
      )}

      <Tabs defaultValue="board" className="flex flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="board">
            <LayoutDashboard className="h-3.5 w-3.5" /> 진행현황
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <CalendarDays className="h-3.5 w-3.5" /> 교육 일정
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          {projects.length === 0 ? (
            <EmptyBoard />
          ) : (
            <div className="overflow-x-auto pb-4">
              <KanbanBoard projects={kanbanProjects} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelinePlaceholder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyBoard() {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-lg font-semibold mb-2">아직 등록된 프로젝트가 없어요</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        의뢰가 들어오면 새 프로젝트로 등록해 보세요. AI가 강사를 추천해드릴게요.
      </p>
      <Button asChild>
        <Link href="/projects/new">
          <Plus /> 새 프로젝트 등록
        </Link>
      </Button>
    </Card>
  );
}

function TimelinePlaceholder() {
  return (
    <Card className="p-8 text-center">
      <CalendarDays className="h-10 w-10 mx-auto mb-3 text-[var(--color-text-subtle)]" />
      <h3 className="font-semibold mb-1">교육 일정 타임라인</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        진행 중·예정 교육을 간트차트로 보여드릴게요. (다음 단계에서 구현)
      </p>
    </Card>
  );
}
