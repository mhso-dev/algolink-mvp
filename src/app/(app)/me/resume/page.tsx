import { FileText } from "lucide-react";
import { ResumeForm } from "@/components/resume/resume-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const session = await requireUser();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-[var(--color-primary)]" />
          이력서
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {session.displayName}님의 이력서. 작성한 내용은 자동 저장되며, 알고링크 강의 이력은 자동으로 추가됩니다.
        </p>
      </header>

      <ResumeForm />
    </div>
  );
}
