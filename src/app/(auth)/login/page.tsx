// /login 페이지 — 서버 컴포넌트. 폼 자체는 클라이언트 컴포넌트(LoginForm)에 위임.
// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001/002/003.

import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
};

interface PageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawNext = sp.next;
  const next = Array.isArray(rawNext) ? rawNext[0] ?? "" : rawNext ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
          로그인
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          이메일과 비밀번호를 입력해 주세요.
        </p>
      </header>

      <LoginForm next={next} />
    </div>
  );
}
