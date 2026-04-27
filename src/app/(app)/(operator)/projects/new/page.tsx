import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects/project-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [clientsRes, instructorsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .returns<{ id: string; company_name: string | null }[]>(),
    supabase
      .from("instructors_safe")
      .select("id, name_kr")
      .returns<{ id: string; name_kr: string | null }[]>(),
  ]);

  const clients = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.company_name ?? "(이름 없음)",
  }));
  const instructors = (instructorsRes.data ?? []).map((i) => ({
    id: i.id,
    name: i.name_kr ?? "(이름 미공개)",
  }));

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
              의뢰 내용을 입력하면 AI가 적합한 강사를 추천해 드려요.
            </p>
          </div>
        </div>
      </header>

      <ProjectForm clients={clients} instructors={instructors} />
    </div>
  );
}
