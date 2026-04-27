// /forgot-password 페이지 — 서버 컴포넌트.
// SPEC-AUTH-001 §2.3 REQ-AUTH-PASSWORD-003.

import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "비밀번호 재설정",
};

interface PageProps {
  searchParams: Promise<{ error?: string; sent?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialError = typeof params.error === "string" ? params.error : undefined;
  const sent = params.sent === "1";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
          비밀번호 재설정
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          가입하신 이메일로 재설정 링크를 보내드립니다.
        </p>
      </header>

      <ForgotPasswordForm initialError={initialError} sent={sent} />
    </div>
  );
}
