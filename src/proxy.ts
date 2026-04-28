// Next.js 16+의 미들웨어 진입점은 `proxy.ts` (구 `middleware.ts` 대체). SPEC-AUTH-001 §2.5.
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-001 — 미인증 통과 허용 prefix.
const PUBLIC_PATHS: readonly string[] = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/api/auth",
];

function isPublicPath(pathname: string): boolean {
  for (const p of PUBLIC_PATHS) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { response, claims, isActive } = await updateSession(request);

  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return response;
  }

  if (claims === null) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + search);
    const redirectResponse = NextResponse.redirect(url);
    // updateSession이 갱신한 쿠키를 redirect 응답에도 attach.
    response.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  // SPEC-ADMIN-001 EARS B-9: 비활성 사용자(`users.is_active=false`) 즉시 차단.
  // null/true는 통과; 명시적 false만 거부 (회귀 회피).
  if (isActive === false) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("error", "deactivated");
    const redirectResponse = NextResponse.redirect(url);
    // 세션 쿠키를 만료시켜 강제 로그아웃 효과를 함께 제공.
    response.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, "", { maxAge: 0, path: "/" });
    });
    return redirectResponse;
  }

  // 인증 통과: 정확한 role 가드는 (instructor)/(operator)/(admin) layout이 수행.
  return response;
}

export const config = {
  matcher: [
    /*
     * 다음을 제외한 모든 경로 매칭:
     * - _next/static, _next/image (정적 파일)
     * - favicon.ico
     * - 이미지 확장자
     * - /api/health, /api/auth/callback (Supabase OTP 콜백)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
