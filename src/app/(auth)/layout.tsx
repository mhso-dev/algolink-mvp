// (auth) 라우트 그룹 공통 레이아웃 — 미인증 상태 사용자에게만 노출되는
// /login, /forgot-password, /reset-password, /accept-invite 등을 감싼다.
// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-006 (이미 인증된 사용자 → 역할 home으로 redirect),
// §2.9 REQ-AUTH-A11Y-001 (스크린리더 친화 구조).

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/auth/server";
import { roleHomePath } from "@/auth/roles";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) {
    // 이미 로그인한 사용자가 /login 등에 접근하면 자기 역할 home으로 보냄 (EC-4).
    redirect(roleHomePath(user.role));
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-background)] px-4 py-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <span className="text-lg font-bold tracking-tight text-[var(--color-text)]">
            Algolink
          </span>
        </div>
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          {children}
        </section>
      </div>
    </main>
  );
}
