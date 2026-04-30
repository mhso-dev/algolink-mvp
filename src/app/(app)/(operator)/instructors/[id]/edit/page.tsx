import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { InstructorForm } from "@/components/instructor/instructor-form";
import { getAllSkillCategories } from "@/lib/instructor/queries";
import { updateInstructorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const [{ data: instructor }, { data: skillRows }, skills] = await Promise.all([
    supabase
      .from("instructors_safe")
      .select("id, name_kr, name_en, email, phone")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<{
        id: string;
        name_kr: string | null;
        name_en: string | null;
        email: string | null;
        phone: string | null;
      }>(),
    supabase
      .from("instructor_skills")
      .select("skill_id")
      .eq("instructor_id", id)
      .returns<{ skill_id: string }[]>(),
    getAllSkillCategories(),
  ]);

  if (!instructor) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
          <Link href={`/instructors/${id}`} aria-label="강사 상세로">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">강사 수정</h1>
      </header>

      <InstructorForm
        skills={skills}
        action={updateInstructorAction}
        submitLabel="저장"
        initial={{
          instructorId: instructor.id,
          nameKr: instructor.name_kr ?? "",
          nameEn: instructor.name_en ?? "",
          email: instructor.email ?? "",
          phone: instructor.phone ?? "",
          skillIds: (skillRows ?? []).map((row) => row.skill_id),
        }}
      />
    </div>
  );
}
