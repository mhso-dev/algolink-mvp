"use server";

// SPEC-AUTH-001 §2.3 REQ-AUTH-PASSWORD-005, §2.10 REQ-AUTH-OBS-002
// (password_reset_completed), §2.11 REQ-AUTH-ERROR-002.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { logAuthEvent } from "@/auth/events";
import { setPasswordSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/auth/errors";

export async function resetPassword(
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "비밀번호 형식이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { error: "재설정 세션이 유효하지 않습니다. 다시 요청해주세요." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateErr) {
    return { error: mapAuthError(updateErr) };
  }

  await logAuthEvent("password_reset_completed", {
    userId: userData.user.id,
    email: userData.user.email ?? "",
  });

  // 새 비밀번호로 재로그인하도록 세션 종료 (REQ-AUTH-PASSWORD-005).
  await supabase.auth.signOut();

  // /login 에서 toast 노출용 query param.
  redirect(`/login?reset=1`);
}
