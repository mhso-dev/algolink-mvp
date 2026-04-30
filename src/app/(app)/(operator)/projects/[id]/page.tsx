// SPEC-PROJECT-001 §2.3 — 프로젝트 상세 페이지.

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatKRW } from "@/lib/utils";
import {
  STATUS_LABELS,
  statusBadgeVariant,
  type ProjectStatus,
} from "@/lib/projects";
import {
  USER_STEPS,
  userStepFromEnum,
} from "@/lib/projects/status-machine";
import { PROJECT_ERRORS } from "@/lib/projects/errors";
import { RecommendationPanel } from "@/components/projects/recommendation-panel";
import { StatusTransitionPanel } from "@/components/projects/status-transition-panel";
import { DeleteProjectButton } from "@/components/projects/DeleteProjectButton";
import {
  AssignmentHistoryList,
  type RecommendationHistoryEntry,
  type StatusHistoryEntry,
} from "@/components/projects/assignment-history-list";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

interface ProjectDetailRow {
  id: string;
  title: string;
  status: ProjectStatus;
  client_id: string;
  operator_id: string | null;
  instructor_id: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  instructor_fee_krw: number;
  margin_krw: number | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function formatKstDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/\./g, "-")
    .replace(/-\s/g, " ")
    .trim() + " KST";
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, title, status, client_id, operator_id, instructor_id, education_start_at, education_end_at, business_amount_krw, instructor_fee_krw, margin_krw, notes, deleted_at, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle<ProjectDetailRow>();

  if (!project || project.deleted_at) {
    notFound();
  }

  const [
    { data: client },
    { data: instructor },
    { data: allRecs },
    { data: statusRows },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("id", project.client_id)
      .maybeSingle<{ id: string; company_name: string | null }>(),
    project.instructor_id
      ? supabase
          .from("instructors_safe")
          .select("id, name_kr")
          .eq("id", project.instructor_id)
          .maybeSingle<{ id: string; name_kr: string | null }>()
      : Promise.resolve({ data: null }),
    supabase
      .from("ai_instructor_recommendations")
      .select("id, top3_jsonb, model, created_at, adopted_instructor_id")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          top3_jsonb: unknown;
          model: string;
          created_at: string;
          adopted_instructor_id: string | null;
        }[]
      >(),
    supabase
      .from("project_status_history")
      .select("id, from_status, to_status, changed_by, changed_at")
      .eq("project_id", id)
      .order("changed_at", { ascending: false })
      .limit(50)
      .returns<
        {
          id: string;
          from_status: ProjectStatus | null;
          to_status: ProjectStatus;
          changed_by: string | null;
          changed_at: string;
        }[]
      >(),
  ]);

  const recommendations = allRecs ?? [];
  const latestRec = recommendations[0] ?? null;

  // 이력 candidate 들의 instructor_id 모음 → 이름 한 번에 조회
  const candidateInstructorIds = new Set<string>();
  for (const rec of recommendations) {
    if (Array.isArray(rec.top3_jsonb)) {
      for (const c of rec.top3_jsonb as { instructorId?: string }[]) {
        if (c.instructorId) candidateInstructorIds.add(c.instructorId);
      }
    }
    if (rec.adopted_instructor_id) {
      candidateInstructorIds.add(rec.adopted_instructor_id);
    }
  }
  const changedByIds = Array.from(
    new Set(
      (statusRows ?? [])
        .map((r) => r.changed_by)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const [{ data: instructorNamesRaw }, { data: userNamesRaw }] = await Promise.all([
    candidateInstructorIds.size > 0
      ? supabase
          .from("instructors_safe")
          .select("id, name_kr")
          .in("id", Array.from(candidateInstructorIds))
          .returns<{ id: string; name_kr: string | null }[]>()
      : Promise.resolve({ data: [] as { id: string; name_kr: string | null }[] }),
    changedByIds.length > 0
      ? supabase
          .from("users")
          .select("id, name_kr")
          .in("id", changedByIds)
          .returns<{ id: string; name_kr: string | null }[]>()
      : Promise.resolve({ data: [] as { id: string; name_kr: string | null }[] }),
  ]);

  const instructorNameMap = new Map(
    (instructorNamesRaw ?? []).map((i) => [i.id, i.name_kr ?? "(이름 미공개)"]),
  );
  const userNameMap = new Map(
    (userNamesRaw ?? []).map((u) => [u.id, u.name_kr ?? null]),
  );

  // 추천 이력 변환
  const recommendationHistory: RecommendationHistoryEntry[] = recommendations.map(
    (rec) => {
      const candidates = Array.isArray(rec.top3_jsonb)
        ? (rec.top3_jsonb as Array<{
            instructorId: string;
            displayName?: string;
            finalScore: number;
          }>)
        : [];
      return {
        id: rec.id,
        createdAt: rec.created_at,
        model: rec.model,
        candidateCount: candidates.length,
        adoptedInstructorId: rec.adopted_instructor_id,
        adoptedDisplayName: rec.adopted_instructor_id
          ? instructorNameMap.get(rec.adopted_instructor_id) ?? null
          : null,
        topCandidates: candidates.map((c, idx) => ({
          instructorId: c.instructorId,
          displayName:
            c.displayName ??
            instructorNameMap.get(c.instructorId) ??
            c.instructorId.slice(0, 8),
          finalScore: c.finalScore,
          rank: idx + 1,
        })),
      };
    },
  );

  // 상태 변경 이력 변환
  const statusHistory: StatusHistoryEntry[] = (statusRows ?? []).map((r) => ({
    id: r.id,
    changedAt: r.changed_at,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    fromLabel: r.from_status ? STATUS_LABELS[r.from_status] : null,
    toLabel: STATUS_LABELS[r.to_status],
    changedByName: r.changed_by ? userNameMap.get(r.changed_by) ?? null : null,
  }));

  const currentStep = userStepFromEnum(project.status);
  const initialCandidates = Array.isArray(latestRec?.top3_jsonb)
    ? (latestRec!.top3_jsonb as Array<{
        instructorId: string;
        displayName: string;
        skillMatch: number;
        availability: 0 | 1;
        satisfaction: number;
        finalScore: number;
        matchedSkillIds: string[];
        reason: string;
        source: "claude" | "fallback";
      }>)
    : [];

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
            <Link href="/projects" aria-label="목록으로">
              <ChevronLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              고객사: {client?.company_name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant(project.status)}>
            {STATUS_LABELS[project.status]}
          </Badge>
          <Button asChild variant="outline">
            <Link href={`/projects/${id}/edit`}>수정</Link>
          </Button>
          <DeleteProjectButton projectId={id} title={project.title} />
        </div>
      </header>

      {/* 7단계 stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">진행 단계</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2" aria-label="프로젝트 진행 단계">
            {USER_STEPS.map((step) => {
              const active = step === currentStep;
              return (
                <li key={step}>
                  <span
                    aria-current={active ? "step" : undefined}
                    className={
                      active
                        ? "inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold bg-[var(--color-primary)] text-white"
                        : "inline-flex items-center px-3 py-1.5 rounded-md text-sm text-[var(--color-text-muted)] bg-[var(--color-neutral-100)] dark:bg-[var(--color-neutral-800)]"
                    }
                  >
                    {active && (
                      <span className="sr-only">현재 단계: </span>
                    )}
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <DetailRow label="프로젝트 ID" value={project.id} />
            <DetailRow
              label="시작"
              value={formatKstDateTime(project.education_start_at)}
            />
            <DetailRow
              label="종료"
              value={formatKstDateTime(project.education_end_at)}
            />
            <DetailRow
              label="배정 강사"
              value={
                instructor?.name_kr ??
                (project.instructor_id ? "(이름 미공개)" : "강사 미배정")
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">금액</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <DetailRow
              label="사업비"
              value={`₩${formatKRW(project.business_amount_krw)}`}
            />
            <DetailRow
              label="강사비"
              value={`₩${formatKRW(project.instructor_fee_krw)}`}
            />
            <DetailRow
              label="마진"
              value={`₩${formatKRW(project.margin_krw ?? project.business_amount_krw - project.instructor_fee_krw)}`}
            />
          </CardContent>
        </Card>
      </div>

      {/* 추천 섹션 */}
      <RecommendationPanel
        projectId={project.id}
        hasInstructor={Boolean(project.instructor_id)}
        initialCandidates={initialCandidates}
        recommendationId={latestRec?.id ?? null}
        adoptedInstructorId={latestRec?.adopted_instructor_id ?? null}
        disclaimer={PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER}
      />

      {/* 상태 전환 컨트롤 */}
      <StatusTransitionPanel
        projectId={project.id}
        currentStatus={project.status}
        hasInstructor={Boolean(project.instructor_id)}
      />

      {/* 배정 / 상태 이력 (REQ-PROJECT-DETAIL-006 / RECOMMEND-006) */}
      <AssignmentHistoryList
        recommendations={recommendationHistory}
        statusHistory={statusHistory}
      />
    </Container>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
