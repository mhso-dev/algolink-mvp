// SPEC-PROJECT-001 §2.2 — 신규 프로젝트 등록 페이지.
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 추상 카테고리 로딩(tier 필터 제거).

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCreateForm } from "@/components/projects/project-create-form";
import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getAllSkillCategories } from "@/lib/instructor/skill-queries";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [{ data: clientsRaw }, skillCategories] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .returns<{ id: string; company_name: string | null }[]>(),
    getAllSkillCategories(),
  ]);

  const clients = (clientsRaw ?? []).map((c) => ({
    id: c.id,
    name: c.company_name ?? "(이름 없음)",
  }));

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/projects" aria-label="프로젝트 목록으로 돌아가기">
              <ChevronLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">새 교육 프로젝트</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              의뢰 내용을 입력하고 등록하세요. 상세 페이지에서 강사 추천을 실행할 수 있습니다.
            </p>
          </div>
        </div>
      </header>

      <ProjectCreateForm clients={clients} skills={skillCategories} />
    </Container>
  );
}
