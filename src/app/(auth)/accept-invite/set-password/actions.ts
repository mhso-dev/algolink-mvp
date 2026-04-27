"use server";

// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-004 / REQ-AUTH-INVITE-005.
// 초대 수락 시 비밀번호 설정 + public.users 행 생성 + 초대 마감 + 세션 갱신.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceSupabase } from "@/auth/admin";
import { logAuthEvent } from "@/auth/events";
import { roleHomePath, isValidRole, type UserRole } from "@/auth/roles";
import { mapAuthError } from "@/auth/errors";
import { setPasswordSchema } from "@/lib/validation/auth";

export async function acceptInvite(
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
    return {
      error:
        "초대 세션이 유효하지 않습니다. 운영자에게 재발급을 요청하세요.",
    };
  }
  const authUserId = userData.user.id;
  const email = userData.user.email ?? "";

  // 1. 비밀번호 업데이트.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateErr) {
    return { error: mapAuthError(updateErr) };
  }

  // 2. invited_role을 신뢰 가능한 출처(public.user_invitations)에서 조회.
  //    raw_user_meta_data는 사용자 수정 가능하므로 신뢰하지 않는다 (spec §5.5).
  const admin = createServiceSupabase();
  // @MX:NOTE: public.user_invitations는 마이그레이션 81에서 생성되며 supabase-types.ts 재생성 전이라
  //           `as any` 캐스팅이 필요하다 (auth_events.ts와 동일 패턴).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invitation, error: invErr } = await (admin as any)
    .from("user_invitations")
    .select("id, invited_role")
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const inv = invitation as { id: string; invited_role: string } | null;

  if (invErr || !inv || !isValidRole(inv.invited_role)) {
    return {
      error: "초대 정보를 찾을 수 없습니다. 운영자에게 재발급을 요청하세요.",
    };
  }
  const role = inv.invited_role as UserRole;

  // 3. public.users UPSERT — name_kr는 초대 시점에 알 수 없으므로 이메일 local-part로 초기화.
  //    custom_access_token_hook이 이 행에서 role을 읽어 JWT claim에 주입한다.
  const namePlaceholder = email.split("@")[0] || email || "사용자";
  const { error: usersErr } = await admin
    .from("users")
    .upsert(
      {
        id: authUserId,
        email,
        role,
        name_kr: namePlaceholder,
      },
      { onConflict: "id" },
    );
  if (usersErr) {
    return {
      error: "사용자 정보 저장에 실패했습니다. 운영자에게 문의하세요.",
    };
  }

  // 4. 초대 마감 (accepted_at + auth_user_id 기록).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("user_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      auth_user_id: authUserId,
    })
    .eq("id", inv.id);

  // 5. 감사 로그.
  await logAuthEvent("invitation_accepted", {
    userId: authUserId,
    email,
    metadata: { role },
  });

  // 6. 세션 갱신 — 새로 추가된 role claim이 즉시 반영되도록 강제 refresh.
  await supabase.auth.refreshSession();

  // 7. 역할 home으로 이동 (try/catch 바깥에서 redirect — Next.js 규약).
  redirect(roleHomePath(role));
}
