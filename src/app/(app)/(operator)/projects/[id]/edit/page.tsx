// SPEC-PROJECT-001 §2.4 — 프로젝트 수정 페이지 (MVP placeholder).
// 본 SPEC 범위에서는 수정 흐름의 zod 스키마 + 동시성 보호 토큰만 노출.
// 풀 기능 수정 UI 는 후속 SPEC.

import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/projects";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ProjectRow {
  id: string;
  title: string;
  status: ProjectStatus;
  notes: string | null;
  business_amount_krw: number;
  instructor_fee_krw: number;
  updated_at: string;
}

export default async function EditProjectPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, status, notes, business_amount_krw, instructor_fee_krw, updated_at")
    .eq("id", id)
    .maybeSingle<ProjectRow>();

  if (!project) notFound();

  const lockedDueToTaskDone = project.status === "task_done";

  return (
    <div className="mx-auto max-w-[800px] px-6 py-6 flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>제목:</strong> {project.title}
          </p>
          <p>
            <strong>비고:</strong> {project.notes ?? "—"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            동시성 토큰 (expected_updated_at): {project.updated_at}
          </p>
          {lockedDueToTaskDone && (
            <p
              role="alert"
              className="text-sm text-[var(--color-state-alert)] mt-2"
            >
              과업 종료 상태에서는 수정이 잠겨 있습니다. (관리자 되돌리기 필요)
            </p>
          )}
          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            상세 수정 UI 는 후속 SPEC 에서 제공됩니다. 현재는 상세 페이지의 상태 전환과 추천/배정만 사용 가능합니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
