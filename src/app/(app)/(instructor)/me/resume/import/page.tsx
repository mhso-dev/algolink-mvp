// SPEC-ME-001 §2.3 REQ-ME-AI-001 ~ -009 — AI 이력서 파싱 진입점.
// 실제 파싱은 ResumeImportClient에서 수행. Claude API 부재 시 fallback 안내.
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { ResumeImportClient } from "@/components/instructor/resume-import-client";

export const dynamic = "force-dynamic";

export default async function ResumeImportPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-[var(--color-primary)]" />
          이력서 자동 채움
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          PDF·DOCX·TXT 이력서를 업로드하면 AI가 양식을 자동으로 채워드립니다.
          AI 파싱이 실패해도 항상 직접 입력으로 진행할 수 있습니다.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">파일 업로드</CardTitle>
          <CardDescription>최대 10MB · 개인정보 번호는 사전에 마스킹된 후 전송됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeImportClient />
        </CardContent>
      </Card>
    </div>
  );
}
