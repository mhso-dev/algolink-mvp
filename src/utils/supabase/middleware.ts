import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/db/supabase-types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export interface UpdateSessionResult {
  response: NextResponse;
  /** JWKS로 서명 검증된 access token claims. 미인증/오류 시 null. */
  claims: Record<string, unknown> | null;
  /**
   * SPEC-ADMIN-001 EARS B-9: 인증된 사용자의 `users.is_active` 값.
   * - claims가 null이면 null (확인 불필요).
   * - 사용자 row가 없거나 SELECT 실패 시 true (회귀 회피 — 기본 활성).
   * - 명시적으로 false인 경우만 차단 대상.
   */
  isActive: boolean | null;
}

/**
 * 모든 인증 필요 요청 진입 시 호출되는 세션 갱신 + claim 조회 헬퍼.
 *
 * 책임:
 *  1. `supabase.auth.getClaims()` 호출 → access token 갱신 + JWKS 서명 검증
 *     (SPEC-AUTH-001 §2.2 REQ-AUTH-SESSION-001/002).
 *  2. 갱신된 쿠키를 request + response 양쪽에 attach (RSC 동일 요청 내 사용 가능).
 *  3. 라우트 가드는 호출자(`src/proxy.ts`)에서 수행한다 — 본 함수는 가드를 결정하지 않는다.
 */
export const updateSession = async (
  request: NextRequest,
): Promise<UpdateSessionResult> => {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient<Database>(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }: CookieToSet) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // @MX:ANCHOR: getClaims()는 JWKS 서명 검증을 수행하므로 getUser()/getSession()보다 신뢰도가 높다.
  // @MX:REASON: SPEC-AUTH-001 §2.2 REQ-AUTH-SESSION-002 — RLS 보호의 1차 신뢰 경계.
  const { data, error } = await supabase.auth.getClaims();

  const claims =
    !error && data?.claims
      ? (data.claims as Record<string, unknown>)
      : null;

  // @MX:WARN: SPEC-ADMIN-001 EARS B-9 — 인증된 요청마다 users.is_active 1회 SELECT.
  // @MX:REASON: 비활성 사용자 차단을 미들웨어 단계에서 수행. 콜드 SELECT 1회 추가 비용.
  // 향후 access token hook에 is_active를 포함시키면 본 SELECT 제거 가능 (후속 SPEC).
  let isActive: boolean | null = null;
  if (claims) {
    const sub = typeof claims.sub === "string" ? claims.sub : null;
    if (sub) {
      try {
        const { data: row } = await supabase
          .from("users")
          .select("is_active")
          .eq("id", sub)
          .maybeSingle();
        // row가 없거나 컬럼 미수신 시 기본 활성 (true)으로 fallback — 회귀 회피.
        isActive = row && typeof (row as { is_active?: unknown }).is_active === "boolean"
          ? ((row as { is_active: boolean }).is_active)
          : true;
      } catch {
        isActive = true;
      }
    }
  }

  return { response: supabaseResponse, claims, isActive };
};
