"use server";
// SPEC-ADMIN-001 §3.2 F-301 — is_active 토글 Server Action.
// 가드: requireRole(['admin']) + 본인 비활성화 차단(B-8, B-10).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth/guards";
import { setUserActive } from "@/lib/admin/users/queries";

export interface SetActiveActionState {
  ok: boolean;
  message: string | null;
}

export async function setUserActiveAction(
  prev: SetActiveActionState,
  formData: FormData,
): Promise<SetActiveActionState> {
  const actor = await requireRole(["admin"]);

  const targetUserId = formData.get("targetUserId");
  const nextActiveRaw = formData.get("nextActive");

  if (typeof targetUserId !== "string" || typeof nextActiveRaw !== "string") {
    return { ok: false, message: "잘못된 폼 데이터입니다." };
  }
  if (nextActiveRaw !== "true" && nextActiveRaw !== "false") {
    return { ok: false, message: "잘못된 값입니다." };
  }

  const result = await setUserActive({
    actorId: actor.id,
    targetUserId,
    nextActive: nextActiveRaw === "true",
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(`/admin/users/${targetUserId}`);
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: result.after ? "활성화되었습니다." : "비활성화되었습니다.",
  };
}
