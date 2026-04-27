import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/auth/server";
import { extractDisplayName } from "@/lib/auth";

// SPEC-AUTH-001 §2.7 REQ-AUTH-SHELL-001/002/003.
// (app) 그룹 진입 시 인증 가드 + AppShell 통합 + 에러 fallback.

// @MX:ANCHOR: 모든 (app) 라우트의 최상위 레이아웃 — defense-in-depth 2nd line
// @MX:REASON: proxy.ts(1st line) 우회 시에도 RSC 단계에서 인증 강제. 변경 시 전체 인증 보안에 영향.
// @MX:SPEC: SPEC-AUTH-001 §2.7
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    // REQ-AUTH-SHELL-003: 세션 조회 자체가 실패한 경우 (DB 다운 등)
    return (
      <div
        role="alert"
        className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-[var(--color-background)] p-6 text-center"
      >
        <p className="text-base text-[var(--color-foreground)]">
          세션 정보를 불러오는 중 오류가 발생했습니다. 다시 로그인해주세요.
        </p>
        <Link
          href="/login"
          className="text-sm text-[var(--color-primary)] underline"
        >
          로그인 페이지로 이동
        </Link>
      </div>
    );
  }

  if (!user) {
    // REQ-AUTH-SHELL-001: 미들웨어 우회 시에도 next 파라미터 보존하며 redirect.
    const h = await headers();
    const pathname = h.get("x-pathname") ?? h.get("x-invoke-path") ?? "";
    const next = pathname && pathname.length > 0
      ? `?next=${encodeURIComponent(pathname)}`
      : "";
    redirect(`/login${next}`);
  }

  return (
    <AppShell
      user={{
        email: user.email,
        displayName: extractDisplayName(user.email),
      }}
      role={user.role}
      unreadNotifications={0}
    >
      {children}
    </AppShell>
  );
}
