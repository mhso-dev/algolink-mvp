// /reset-password 페이지 — 서버 컴포넌트.
// SPEC-AUTH-001 §2.3 REQ-AUTH-PASSWORD-004/005.

import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/auth/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "새 비밀번호 설정",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialError = typeof params.error === "string" ? params.error : undefined;

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
            새 비밀번호 설정
          </h1>
        </header>
        <p
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해주세요.
          </span>
        </p>
        <div className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
          >
            비밀번호 재설정 다시 요청하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
          새 비밀번호 설정
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          새로 사용할 비밀번호를 입력해 주세요.
        </p>
      </header>

      <ResetPasswordForm initialError={initialError} />
    </div>
  );
}
