import "server-only";

// 서버 layout / page / Server Action에서 인증·역할 가드를 강제하는 헬퍼.
// SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-001/002/006.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./server";
import { roleHomePath, type UserRole } from "./roles";

async function readPathname(): Promise<string> {
  try {
    const h = await headers();
    // 미들웨어가 `x-pathname` 헤더를 세팅했으면 우선 사용.
    const fromHeader = h.get("x-pathname") ?? h.get("x-invoke-path");
    if (fromHeader && fromHeader.length > 0) return fromHeader;
  } catch {
    // headers()는 RSC 외 컨텍스트에서 throw할 수 있음
  }
  return "/";
}

/**
 * 인증된 사용자만 통과시킨다. 미인증 시 `/login?next=...`로 silent redirect.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = await readPathname();
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}

/**
 * 지정한 역할만 통과시킨다. 다른 역할이면 자기 역할의 home으로 silent redirect.
 * 무한 redirect 방지: 이미 home에 있는 사용자가 home에서 차단되는 모순적 호출을 막기 위해
 * 현재 경로가 자기 home과 동일한 경우 throw하여 상위 error.tsx로 위임한다.
 */
export async function requireRole(
  allowed: UserRole | readonly UserRole[],
): Promise<CurrentUser> {
  const user = await requireUser();
  const allowedSet = Array.isArray(allowed)
    ? new Set<UserRole>(allowed as readonly UserRole[])
    : new Set<UserRole>([allowed as UserRole]);

  if (allowedSet.has(user.role)) {
    return user;
  }

  const home = roleHomePath(user.role);
  const currentPath = await readPathname();
  if (currentPath === home) {
    // home에서 자기 자신의 가드에 의해 거부되는 비정상 상황 — 무한 redirect 회피.
    throw new Error(
      `[auth.guards] role guard misconfiguration: ${user.role} blocked at own home (${home})`,
    );
  }

  redirect(home);
}
