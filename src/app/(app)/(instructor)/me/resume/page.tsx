// SPEC-ME-001 §2.2 REQ-ME-RESUME — 강사 본인 이력서 관리 (Server Action 연결).
import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow, getMyBasicInfo, getMyResumeSections } from "@/lib/instructor/me-queries";
import { MeResumeForm } from "@/components/instructor/me-resume-form";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const session = await requireUser();
  if (session.role !== "instructor") {
    redirect("/dashboard");
  }
  const ctx = await ensureInstructorRow();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center text-sm text-[var(--color-text-muted)]">
        강사 프로필 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.
      </div>
    );
  }
  const [basicInfo, sections] = await Promise.all([
    getMyBasicInfo(ctx.instructorId),
    getMyResumeSections(ctx.instructorId),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-[var(--color-primary)]" />
          이력서
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {session.displayName}님의 이력서. 변경사항은 즉시 저장됩니다.
        </p>
      </header>

      <MeResumeForm
        basicInfo={
          basicInfo ?? {
            nameKr: "",
            nameHanja: "",
            nameEn: "",
            birthDate: "",
            email: "",
            phone: "",
            address: "",
          }
        }
        sections={{
          educations: sections.educations.map((r) => ({ ...r, id: String(r.id) })),
          workExperiences: sections.workExperiences.map((r) => ({ ...r, id: String(r.id) })),
          teachingExperiences: sections.teachingExperiences.map((r) => ({ ...r, id: String(r.id) })),
          certifications: sections.certifications.map((r) => ({ ...r, id: String(r.id) })),
          publications: sections.publications.map((r) => ({ ...r, id: String(r.id) })),
          instructorProjects: sections.instructorProjects.map((r) => ({ ...r, id: String(r.id) })),
          otherActivities: sections.otherActivities.map((r) => ({ ...r, id: String(r.id) })),
        }}
      />
    </div>
  );
}
