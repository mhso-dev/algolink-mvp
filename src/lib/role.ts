/**
 * 클라이언트·서버 양측에서 안전하게 import 가능한 역할 유틸리티.
 * server-only 모듈(next/headers 등)은 절대 import하지 않는다.
 */

import type { User } from "@supabase/supabase-js";

export type AppRole = "instructor" | "operator" | "admin" | "unknown";

export function extractRole(user: User | null): AppRole {
  if (!user) return "unknown";
  const raw =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined) ??
    "unknown";
  if (raw === "instructor" || raw === "operator" || raw === "admin") return raw;
  return "unknown";
}

export function roleLabel(role: AppRole): string {
  return (
    {
      instructor: "강사",
      operator: "담당자",
      admin: "관리자",
      unknown: "권한 미확인",
    } as const
  )[role];
}

export function canAccess(role: AppRole, path: string): boolean {
  if (role === "admin") return true;
  if (role === "operator") return !path.startsWith("/admin");
  if (role === "instructor") return path === "/" || path.startsWith("/me");
  return path === "/" || path === "/login";
}
