import "server-only";

// 레거시 외부 API(`requireUser`, `SessionUser`, `extractDisplayName`)를 유지하면서
// 내부 구현은 SPEC-AUTH-001 §2.2의 `getCurrentUser()`(JWKS 검증) 위에서 동작하도록 재구성한다.
// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-001/002, §2.6 REQ-AUTH-ROLE-007.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/server";
import type { UserRole } from "@/auth/roles";
import type { AppRole } from "@/lib/role";

// @MX:ANCHOR: SessionUser 형태가 변경됨 — Supabase User 객체 wrapping 제거
// @MX:REASON: getClaims()는 User 객체를 반환하지 않음. id/email/role/displayName 평탄 구조로 단순화.
// @MX:SPEC: SPEC-AUTH-001 §2.5
export type SessionUser = {
  id: string;
  email: string;
  role: AppRole;
  displayName: string;
};

/**
 * 이메일에서 사용자 표시 이름을 도출한다.
 * JWT claims에는 user_metadata가 없으므로 email 기반으로 단순화.
 * 빈 이메일이면 한국어 fallback을 반환한다.
 */
export function extractDisplayName(email: string | null | undefined): string {
  if (!email) return "(이름 없음)";
  return email;
}

/**
 * UserRole을 AppRole로 매핑한다.
 * 유효한 JWT 사용자는 항상 3개 known role 중 하나를 가지므로 'unknown'은 발생하지 않는다.
 */
function toAppRole(role: UserRole): AppRole {
  return role;
}

// @MX:ANCHOR: 레거시 외부 API. 모든 (app) 라우트가 이 함수를 호출함 (fan_in >= 15).
// @MX:REASON: SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-001 핵심 진입점. signature 변경 시 광범위한 영향.
// @MX:SPEC: SPEC-AUTH-001 §2.5
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    // 레거시 contract: next 파라미터 없이 단순히 /login으로 redirect.
    // proxy.ts(미들웨어)가 1차 방어선이며 next 파라미터는 거기서 부여한다.
    redirect("/login");
  }
  return {
    id: user.id,
    email: user.email,
    role: toAppRole(user.role),
    displayName: extractDisplayName(user.email),
  };
}
