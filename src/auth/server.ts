import "server-only";

// 서버 컴포넌트 / Server Action에서 사용하는 인증 헬퍼.
// SPEC-AUTH-001 §2.2 REQ-AUTH-SESSION-002/003.

import { cookies } from "next/headers";
import { createClient as createSsrServerClient } from "@/utils/supabase/server";
import { isValidRole, type UserRole } from "./roles";

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * 현재 요청의 인증 사용자 정보를 반환한다.
 *
 * - `supabase.auth.getClaims()`를 사용 (JWKS 서명 검증; SPEC §2.2 REQ-AUTH-SESSION-002).
 * - role은 SPEC §5.1에 따라 `claims.role` 우선, 없으면 `claims.app_metadata.role`을 본다.
 * - claims 부재, 에러, 잘못된 role → null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const supabase = createSsrServerClient(cookieStore);

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) return null;

  const email = typeof claims.email === "string" ? claims.email : "";

  // 우선순위: app_metadata.role(비즈니스 role) → top-level claims.role 폴백.
  // claims.role(top-level)은 PostgREST의 DB role 결정 필드(authenticated/anon/service_role)
  // 영역이라 'instructor'/'operator'/'admin'을 거기에 넣으면 PostgREST가
  // 'role does not exist'로 폭발한다. SPEC-AUTH-001 §5.1 — app_metadata.role을
  // 1차 신뢰 경계로 사용한다.
  const appMeta =
    typeof claims.app_metadata === "object" && claims.app_metadata !== null
      ? (claims.app_metadata as Record<string, unknown>)
      : null;
  const metaRole = appMeta?.role;
  const topLevelRole = claims.role;
  const candidate = isValidRole(metaRole) ? metaRole : topLevelRole;

  if (!isValidRole(candidate)) return null;

  return { id: sub, email, role: candidate };
}

/**
 * SSR Supabase 클라이언트의 thin wrapper.
 * 호출자가 `@/utils/supabase/server`를 직접 import하지 않도록 한 단계 추상화.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createSsrServerClient(cookieStore);
}
