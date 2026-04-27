"use client";

// SPEC-ME-001 §2.3 REQ-ME-AI-006 — AI 파싱 실패 시 fallback UI.
// 본 MVP는 파일 업로드만 받고 실제 파싱은 Server Action으로 위임 (M6 후속 작업).
import * as React from "react";
import Link from "next/link";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function ResumeImportClient() {
  const [error, setError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);

  function handleFile(f: File) {
    setError(null);
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
          <span className="flex-1">{file.name}</span>
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
        <Button type="button" disabled={!file}>
          AI 파싱 시작 (준비 중 — SPEC-ME-001 M6 후속 작업)
        </Button>
        <Button asChild variant="outline">
          <Link href="/me/resume">직접 입력</Link>
        </Button>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        AI 파싱이 실패해도 위 [직접 입력] 버튼으로 항상 수동 작성이 가능합니다.
      </p>
    </div>
  );
}
