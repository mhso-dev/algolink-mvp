// `?next=` 쿼리 파라미터 검증 — open redirect 방지 + 역할 권한 체크.
// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-003.
// 클라이언트/서버 양쪽 사용 가능.

import { roleHomePath, rolePathPrefixes, type UserRole } from "./roles";

const AUTH_PAGES: ReadonlySet<string> = new Set<string>([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
]);

/**
 * 안전한 `next` 경로를 반환한다. 검증에 실패하면 fallback (또는 role home)을 반환.
 *
 * 검증 규칙:
 * 1. null/empty/undefined → fallback
 * 2. protocol-relative (`//evil.com`) 거부
 * 3. 절대 외부 URL (`https://...`) 거부 — 단일 `/`로 시작해야 함
 * 4. 역할이 접근 불가능한 경로 거부 (prefix-match)
 * 5. auth 페이지 자체로의 redirect 거부
 */
export function safeNextPath(
  rawNext: string | null | undefined,
  role: UserRole,
  fallback?: string,
): string {
  const fb = fallback ?? roleHomePath(role);

  if (rawNext == null || rawNext === "") return fb;

  // 단일 `/`로 시작해야 함; 두 번째 문자가 `/`이면 protocol-relative이므로 거부
  if (rawNext[0] !== "/" || rawNext[1] === "/") return fb;

  // path 부분만 추출 (쿼리/해시 제거 후 prefix 검증)
  const pathOnly = rawNext.split(/[?#]/, 1)[0] ?? rawNext;

  // auth 페이지로의 redirect 거부 (정확 매칭 또는 prefix 매칭)
  for (const authPath of AUTH_PAGES) {
    if (pathOnly === authPath || pathOnly.startsWith(authPath + "/")) {
      return fb;
    }
  }

  // 역할별 허용 prefix 검증
  const prefixes = rolePathPrefixes(role);
  const allowed = prefixes.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(prefix + "/"),
  );
  if (!allowed) return fb;

  return rawNext;
}
