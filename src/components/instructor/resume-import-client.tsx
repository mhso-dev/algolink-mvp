"use client";

// SPEC-ME-001 §2.3 REQ-ME-AI-001 ~ -009 — AI 이력서 파싱 클라이언트.
// 파일 업로드 → parseResume Server Action → 결과 review → applyParsedResume.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { parseResume, applyParsedResume, type ApplyMapping } from "@/app/(app)/(instructor)/me/resume/import/actions";
import type { ParsedResume } from "@/lib/instructor/resume-parser";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const ALL_SECTIONS: Array<{ key: keyof ApplyMapping; label: string; getCount: (p: ParsedResume) => number }> = [
  { key: "educations", label: "학력", getCount: (p) => p.educations.length },
  { key: "workExperiences", label: "경력", getCount: (p) => p.workExperiences.length },
  { key: "teachingExperiences", label: "강의이력", getCount: (p) => p.teachingExperiences.length },
  { key: "certifications", label: "자격", getCount: (p) => p.certifications.length },
  { key: "publications", label: "저서", getCount: (p) => p.publications.length },
  { key: "instructorProjects", label: "프로젝트", getCount: (p) => p.projects.length },
  { key: "otherActivities", label: "기타활동", getCount: (p) => p.otherActivities.length },
];

export function ResumeImportClient() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [parsing, startParsing] = React.useTransition();
  const [parsed, setParsed] = React.useState<ParsedResume | null>(null);
  const [cached, setCached] = React.useState<boolean>(false);
  const [mapping, setMapping] = React.useState<ApplyMapping>({
    educations: true,
    workExperiences: true,
    teachingExperiences: true,
    certifications: true,
    publications: true,
    instructorProjects: true,
    otherActivities: true,
  });
  const [applying, startApplying] = React.useTransition();

  function handleFile(f: File) {
    setError(null);
    setParsed(null);
    if (f.size > MAX_BYTES) {
      setError("파일 크기가 10 MB를 초과합니다.");
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setError("지원하지 않는 파일 형식입니다. PDF, DOCX, TXT만 가능합니다.");
      return;
    }
    setFile(f);
  }

  function handleParse() {
    if (!file) return;
    setError(null);
    startParsing(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await parseResume(fd);
      if (!r.ok || !r.parsed) {
        setError(r.message ?? "AI 파싱에 실패했습니다. 직접 입력해주세요.");
        return;
      }
      setParsed(r.parsed);
      setCached(!!r.cached);
      toast.success(r.cached ? "캐시된 파싱 결과를 불러왔습니다." : "AI 파싱이 완료되었습니다.");
    });
  }

  function handleApply() {
    if (!parsed) return;
    startApplying(async () => {
      const r = await applyParsedResume(parsed, mapping);
      if (!r.ok) {
        toast.error(r.message ?? "적용에 실패했습니다.");
        return;
      }
      const total = Object.values(r.inserted ?? {}).reduce((a, b) => a + Math.max(0, b), 0);
      toast.success(`이력서에 ${total}건이 추가되었습니다.`);
      router.push("/me/resume");
    });
  }

  if (parsed) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-[var(--color-state-info)] bg-[var(--color-state-info-muted)]/40 p-3 text-sm"
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--color-state-info)] mt-0.5" />
          <div>
            <p className="font-medium">{cached ? "캐시된 결과를 불러왔습니다." : "AI가 이력서를 파싱했습니다."}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              아래 섹션에서 적용할 항목을 선택한 뒤 [이력서에 추가]를 눌러주세요. 기존 항목은 보존됩니다.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {ALL_SECTIONS.map((s) => {
            const count = s.getCount(parsed);
            const disabled = count === 0;
            return (
              <li key={s.key} className="flex items-center justify-between gap-3 p-3">
                <Label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={mapping[s.key] && !disabled}
                    disabled={disabled}
                    onCheckedChange={(c) => setMapping((m) => ({ ...m, [s.key]: c === true }))}
                  />
                  <span className="font-medium">{s.label}</span>
                </Label>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {disabled ? "추출 항목 없음" : `${count}건 추출`}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2">
          <Button type="button" onClick={handleApply} disabled={applying}>
            <Sparkles /> {applying ? "추가 중..." : "이력서에 추가"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/me/resume">건너뛰기</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="resume-file"
        className="rounded-md border-2 border-dashed border-[var(--color-border-strong)] p-8 text-center cursor-pointer hover:bg-[var(--color-neutral-50)] transition-colors"
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-[var(--color-text-subtle)]" />
        <p className="text-sm font-medium">파일을 클릭하거나 드래그하여 업로드</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">PDF / DOCX / TXT · 최대 10MB</p>
        <input
          id="resume-file"
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {file && (
        <div className="flex items-center gap-2 text-sm rounded-md border border-[var(--color-border)] p-3">
          <FileText className="h-4 w-4 text-[var(--color-primary)]" />
          <span className="flex-1 truncate">{file.name}</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-sm rounded-md border border-[var(--color-state-alert)] bg-[var(--color-state-alert-muted)]/40 p-3"
        >
          <AlertCircle className="h-4 w-4 text-[var(--color-state-alert)] mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" disabled={!file || parsing} onClick={handleParse}>
          {parsing ? "파싱 중..." : "AI 파싱 시작"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/me/resume">직접 입력</Link>
        </Button>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        AI 파싱이 실패해도 [직접 입력] 버튼으로 항상 수동 작성이 가능합니다. PDF/DOCX는 텍스트 추출 한계로
        TXT 변환을 권장합니다.
      </p>
    </div>
  );
}
