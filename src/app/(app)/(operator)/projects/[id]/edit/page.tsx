// SPEC-PROJECT-001 §2.4 — 프로젝트 수정 페이지 (풀폼 + 동시성 토큰).
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 추상 카테고리 로딩(tier 필터 제거).

import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getCurrentUser } from "@/auth/server";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/projects";
import { ProjectEditForm } from "@/components/projects/project-edit-form";
import { getAllSkillCategories } from "@/lib/instructor/skill-queries";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ProjectRow {
  id: string;
  title: string;
  status: ProjectStatus;
  client_id: string;
  project_type: "education" | "material_development";
  education_start_at: string | null;
  education_end_at: string | null;
  notes: string | null;
  business_amount_krw: number;
  instructor_fee_krw: number;
  updated_at: string;
}

export default async function EditProjectPage({ params }: PageProps) {
  await requireUser();
  const user = await getCurrentUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const [{ data: project }, { data: clientsRaw }, skillCategories, { data: reqSkillsRaw }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, title, status, client_id, project_type, education_start_at, education_end_at, notes, business_amount_krw, instructor_fee_krw, updated_at",
        )
        .eq("id", id)
        .maybeSingle<ProjectRow>(),
      supabase
        .from("clients")
        .select("id, company_name")
        .returns<{ id: string; company_name: string | null }[]>(),
      getAllSkillCategories(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("project_required_skills")
        .select("skill_id")
        .eq("project_id", id),
    ]);

  if (!project) notFound();

  const lockedDueToTaskDone =
    project.status === "task_done" && user?.role !== "admin";

  const clients = (clientsRaw ?? []).map((c) => ({
    id: c.id,
    name: c.company_name ?? "(이름 없음)",
  }));
  const requiredSkillIds = ((reqSkillsRaw ?? []) as { skill_id: string }[]).map(
    (r) => r.skill_id,
  );

  const initial = {
    id: project.id,
    title: project.title,
    clientId: project.client_id,
    projectType: project.project_type,
    startAt: project.education_start_at,
    endAt: project.education_end_at,
    businessAmountKrw: project.business_amount_krw,
    instructorFeeKrw: project.instructor_fee_krw,
    notes: project.notes,
    updatedAt: project.updated_at,
    status: project.status,
    requiredSkillIds,
  };

  return (
    <Container variant="narrow" className="flex flex-col gap-4 py-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
          <Link href={`/projects/${id}`} aria-label="상세로 돌아가기">
            <ChevronLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">프로젝트 수정</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            현재 상태: {STATUS_LABELS[project.status]}
          </p>
        </div>
      </header>

      {lockedDueToTaskDone && (
        <p
          role="alert"
          className="text-sm text-[var(--color-state-alert)] bg-[var(--color-state-alert-muted)] rounded-md p-3"
        >
          정산 완료된 프로젝트는 관리자만 수정할 수 있습니다. 모든 필드가 잠겼습니다.
        </p>
      )}

      <ProjectEditForm
        project={initial}
        clients={clients}
        skills={skillCategories}
        locked={lockedDueToTaskDone}
      />
    </Container>
  );
}
