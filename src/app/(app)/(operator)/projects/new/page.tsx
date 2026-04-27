// SPEC-PROJECT-001 §2.2 — 신규 프로젝트 등록 페이지.

import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectCreateForm } from "@/components/projects/project-create-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface SkillRow {
  id: string;
  name: string;
  tier: "large" | "medium" | "small";
}

export default async function NewProjectPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [{ data: clientsRaw }, { data: skillsRaw }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .returns<{ id: string; company_name: string | null }[]>(),
    supabase
      .from("skill_categories")
      .select("id, name, tier")
      .returns<SkillRow[]>(),
  ]);

  const clients = (clientsRaw ?? []).map((c) => ({
    id: c.id,
    name: c.company_name ?? "(이름 없음)",
  }));

  // leaf-only 노출: small tier 만 사용. (3-tier 정합성은 SPEC-DB-001 trigger 가 강제)
  const skills = (skillsRaw ?? [])
    .filter((s) => s.tier === "small")
    .map((s) => ({ id: s.id, label: s.name }));

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
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
              의뢰 내용을 입력하고 등록하세요. 상세 페이지에서 AI 추천을 실행할 수 있습니다.
            </p>
          </div>
        </div>
      </header>

      <ProjectCreateForm clients={clients} skills={skills} />
    </div>
  );
}
