// SPEC-ME-001 §2.2 REQ-ME-RESUME — 강사 본인 이력서 관리 (Server Action 연결).
import { FileText, Download, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow, getMyBasicInfo, getMyResumeSections } from "@/lib/instructor/me-queries";
import { getAllSkillCategories, getMySkills } from "@/lib/instructor/skill-queries";
import { MeResumeForm } from "@/components/instructor/me-resume-form";
import { SkillsPicker } from "@/components/instructor/skills-picker";

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
  const [basicInfo, sections, skillCategories, mySkills] = await Promise.all([
    getMyBasicInfo(ctx.instructorId),
    getMyResumeSections(ctx.instructorId),
    getAllSkillCategories(),
    getMySkills(ctx.instructorId),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--color-primary)]" />
            이력서
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {session.displayName}님의 이력서. 변경사항은 즉시 저장됩니다.
          </p>
        </div>
        {/* SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF — PDF 다운로드 (마스킹 ON / 원본). */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/me/resume/export?mask=true"
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            aria-label="개인정보 마스킹된 이력서 PDF 다운로드"
          >
            <ShieldCheck className="h-4 w-4" />
            PDF 다운로드 (마스킹)
          </Link>
          <Link
            href="/me/resume/export?mask=false"
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            aria-label="원본 이력서 PDF 다운로드 (본인용)"
          >
            <Download className="h-4 w-4" />
            PDF 다운로드 (원본)
          </Link>
        </div>
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

      <SkillsPicker categories={skillCategories} initialSelections={mySkills} />
    </div>
  );
}
