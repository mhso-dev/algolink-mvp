// SPEC-INSTRUCTOR-001 §2.3 — 신규 강사 등록 페이지.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getAllSkillCategories } from "@/lib/instructor/queries";
import { InstructorForm } from "@/components/instructor/instructor-form";
import { createInstructorAndInvite } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewInstructorPage() {
  await requireUser();
  const skills = await getAllSkillCategories();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
          <Link href="/instructors" aria-label="강사 목록으로">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">강사 등록</h1>
      </header>

      <p className="text-sm text-[var(--color-text-muted)]">
        등록한 강사에게 초대 메일이 즉시 발송됩니다. 초대 발송에 실패하면 강사
        레코드는 자동으로 롤백됩니다.
      </p>

      <InstructorForm skills={skills} action={createInstructorAndInvite} />
    </div>
  );
}
