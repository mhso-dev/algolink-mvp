// 사용자 역할 enum과 역할별 home/허용 경로 매핑.
// 클라이언트와 서버 양쪽에서 사용 가능 (server-only 지시어 없음).
// SPEC-AUTH-001 §2.6 REQ-AUTH-ROLE-007.

export type UserRole = "instructor" | "operator" | "admin";

export const ROLE_HOME: Record<UserRole, string> = {
  instructor: "/me/dashboard",
  operator: "/dashboard",
  admin: "/dashboard",
};

const VALID_ROLES: ReadonlySet<string> = new Set<string>([
  "instructor",
  "operator",
  "admin",
]);

export function roleHomePath(role: UserRole): string {
  return ROLE_HOME[role];
}

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.has(value);
}

const INSTRUCTOR_PREFIXES = [
  "/me",
  "/api/me",
  "/notifications",
  "/settings/profile",
] as const;

const OPERATOR_PREFIXES = [
  "/dashboard",
  "/projects",
  "/instructors",
  "/clients",
  "/settlements",
  "/operator",
  "/notifications",
  "/settings/profile",
] as const;

const ADMIN_PREFIXES = [...OPERATOR_PREFIXES, "/admin"] as const;

/**
 * 주어진 역할이 접근 허용된 경로 prefix 목록.
 * `safeNextPath`와 layout 가드에서 prefix-match 검증에 사용한다.
 * SPEC-AUTH-001 §2.5 REQ-AUTH-GUARD-003/004/005.
 */
export function rolePathPrefixes(role: UserRole): readonly string[] {
  switch (role) {
    case "instructor":
      return INSTRUCTOR_PREFIXES;
    case "operator":
      return OPERATOR_PREFIXES;
    case "admin":
      return ADMIN_PREFIXES;
  }
}
