import "server-only";
// SPEC-ADMIN-001 §3.2 F-301 — admin 회원 리스트/상세/수정 쿼리.
// @MX:ANCHOR: admin 사용자 도메인 단일 진입점. fan_in 예상 ≥ 3 (list page, [id] page, server actions).
// @MX:REASON: 자가 lockout 검증 + audit 로그를 단일 함수에 묶어 가드 우회 차단.
// @MX:SPEC: SPEC-ADMIN-001 §3.2

import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import {
  setActiveInput,
  updateRoleInput,
  type AdminUserRole,
  type SetActiveInput,
  type UpdateRoleInput,
} from "./validation";
import { logActiveChange, logRoleChange } from "./audit";
import type { AdminUserListQuery } from "./list-query";

export interface AdminUserRow {
  id: string;
  email: string;
  nameKr: string;
  role: AdminUserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUserListResult {
  rows: AdminUserRow[];
  total: number;
}

/**
 * 회원 리스트 — role/is_active/email 부분검색 + 페이지네이션.
 * EARS B-1, B-2, B-3.
 */
export async function listUsers(query: AdminUserListQuery): Promise<AdminUserListResult> {
  const conditions = [] as ReturnType<typeof eq>[];

  if (query.role) {
    conditions.push(eq(users.role, query.role));
  }
  if (query.isActive !== null) {
    conditions.push(eq(users.isActive, query.isActive));
  }
  if (query.q) {
    // ILIKE 부분 검색 — email 기준. 메타문자는 단순 escape.
    const escaped = query.q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(ilike(users.email, `%${escaped}%`));
  }

  const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        nameKr: users.nameKr,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(whereExpr)
      .orderBy(desc(users.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereExpr),
  ]);

  return {
    rows: rows as AdminUserRow[],
    total: totalRows[0]?.count ?? 0,
  };
}

/** 단일 사용자 조회. 없으면 null. */
export async function getUserById(id: string): Promise<AdminUserRow | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      nameKr: users.nameKr,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return (rows[0] as AdminUserRow | undefined) ?? null;
}

export type UpdateUserRoleResult =
  | { ok: true; before: AdminUserRole; after: AdminUserRole }
  | { ok: false; error: "self_lockout" | "not_found" | "validation"; message: string };

/**
 * 사용자 역할 변경 — 자가 lockout 차단(B-6) + audit 로그(B-5).
 * @MX:ANCHOR: Server Action / 도메인 양쪽에서 호출 (fan_in 2 이상).
 * @MX:REASON: 본인 role 변경 거부는 본 함수에서 한 번 더 검증해야 가드 우회를 막을 수 있다.
 */
export async function updateUserRole(
  raw: UpdateRoleInput,
): Promise<UpdateUserRoleResult> {
  const parsed = updateRoleInput.safeParse(raw);
  if (!parsed.success) {
    const isSelf = raw.actorId === raw.targetUserId;
    return {
      ok: false,
      error: isSelf ? "self_lockout" : "validation",
      message: parsed.error.issues[0]?.message ?? "잘못된 입력입니다.",
    };
  }

  const target = await getUserById(parsed.data.targetUserId);
  if (!target) {
    return { ok: false, error: "not_found", message: "사용자를 찾을 수 없습니다." };
  }

  const before = target.role;
  const after = parsed.data.newRole;
  if (before === after) {
    return { ok: true, before, after };
  }

  await db
    .update(users)
    .set({ role: after, updatedAt: new Date() })
    .where(eq(users.id, parsed.data.targetUserId));

  logRoleChange({
    actorId: parsed.data.actorId,
    targetId: parsed.data.targetUserId,
    beforeRole: before,
    afterRole: after,
  });

  return { ok: true, before, after };
}

export type SetUserActiveResult =
  | { ok: true; before: boolean; after: boolean }
  | { ok: false; error: "self_lockout" | "not_found" | "validation"; message: string };

/**
 * 사용자 is_active 토글 — 본인 비활성화 차단(B-8) + audit 로그(B-7).
 */
export async function setUserActive(
  raw: SetActiveInput,
): Promise<SetUserActiveResult> {
  const parsed = setActiveInput.safeParse(raw);
  if (!parsed.success) {
    const isSelfDeactivate =
      raw.actorId === raw.targetUserId && raw.nextActive === false;
    return {
      ok: false,
      error: isSelfDeactivate ? "self_lockout" : "validation",
      message: parsed.error.issues[0]?.message ?? "잘못된 입력입니다.",
    };
  }

  const target = await getUserById(parsed.data.targetUserId);
  if (!target) {
    return { ok: false, error: "not_found", message: "사용자를 찾을 수 없습니다." };
  }

  const before = target.isActive;
  const after = parsed.data.nextActive;
  if (before === after) {
    return { ok: true, before, after };
  }

  await db
    .update(users)
    .set({ isActive: after, updatedAt: new Date() })
    .where(eq(users.id, parsed.data.targetUserId));

  logActiveChange({
    actorId: parsed.data.actorId,
    targetId: parsed.data.targetUserId,
    beforeActive: before,
    afterActive: after,
  });

  return { ok: true, before, after };
}
