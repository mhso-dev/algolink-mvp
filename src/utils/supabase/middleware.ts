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

  return { response: supabaseResponse, claims };
};
