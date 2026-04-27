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

  const [{ data: client }, { data: instructor }, { data: latestRec }] =
    await Promise.all([
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
        .limit(1)
        .maybeSingle<{
          id: string;
          top3_jsonb: unknown;
          model: string;
          created_at: string;
          adopted_instructor_id: string | null;
        }>(),
    ]);

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
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
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
    </div>
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
