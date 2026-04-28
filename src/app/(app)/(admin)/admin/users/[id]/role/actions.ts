"use server";
// SPEC-ADMIN-001 §3.2 F-301 — 역할 변경 Server Action.
// 가드: requireRole(['admin']) + Zod refine 본인 lockout 차단(B-6, B-10).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/guards";
import { updateUserRole } from "@/lib/admin/users/queries";
import {
  ADMIN_USER_ROLES,
  type AdminUserRole,
} from "@/lib/admin/users/validation";

export interface UpdateRoleActionState {
  ok: boolean;
  message: string | null;
}

export async function updateUserRoleAction(
  prev: UpdateRoleActionState,
  formData: FormData,
): Promise<UpdateRoleActionState> {
  // 가드: admin만 호출 가능. (instructor/operator는 redirect.)
  const actor = await requireRole(["admin"]);

  const targetUserId = formData.get("targetUserId");
  const newRole = formData.get("newRole");

  if (typeof targetUserId !== "string" || typeof newRole !== "string") {
    return { ok: false, message: "잘못된 폼 데이터입니다." };
  }
  if (!(ADMIN_USER_ROLES as readonly string[]).includes(newRole)) {
    return { ok: false, message: "허용되지 않은 역할입니다." };
  }

  const result = await updateUserRole({
    actorId: actor.id,
    targetUserId,
    newRole: newRole as AdminUserRole,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(`/admin/users/${targetUserId}`);
  revalidatePath("/admin/users");
  return { ok: true, message: "역할이 변경되었습니다." };
}
