// SPEC-ADMIN-001 §3.2 F-301 — 회원 리스트 URL 쿼리 파서.
// @MX:NOTE: searchParams ↔ AdminUserListQuery 순수 함수 변환.

import { ADMIN_USER_ROLES, type AdminUserRole } from "./validation";

export const ADMIN_USERS_PAGE_SIZE = 20;

export interface AdminUserListQuery {
  q: string | null;
  role: AdminUserRole | null;
  isActive: boolean | null; // null = no filter
  page: number;
  pageSize: number;
}

const ROLE_SET = new Set<string>(ADMIN_USER_ROLES);

export function parseAdminUserListQuery(
  raw: Record<string, string | string[] | undefined>,
): AdminUserListQuery {
  const getOne = (k: string): string | null => {
    const v = raw[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const qRaw = getOne("q");
  const q = qRaw && qRaw.trim().length > 0 ? qRaw.trim() : null;

  const roleRaw = getOne("role");
  const role = roleRaw && ROLE_SET.has(roleRaw) ? (roleRaw as AdminUserRole) : null;

  const activeRaw = getOne("is_active") ?? getOne("isActive");
  let isActive: boolean | null = null;
  if (activeRaw === "true") isActive = true;
  else if (activeRaw === "false") isActive = false;

  const pageRaw = Number.parseInt(getOne("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    q,
    role,
    isActive,
    page,
    pageSize: ADMIN_USERS_PAGE_SIZE,
  };
}

export function serializeAdminUserListQuery(q: Partial<AdminUserListQuery>): string {
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.role) params.set("role", q.role);
  if (q.isActive !== null && q.isActive !== undefined) {
    params.set("is_active", String(q.isActive));
  }
  if (q.page && q.page > 1) params.set("page", String(q.page));
  return params.toString();
}
