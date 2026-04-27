"use server";

// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-001/002/006/007.
// 운영자/관리자 초대 발급·취소 Server Actions.
// 가드는 (operator)/layout.tsx의 requireRole에서 선행 처리되며,
// admin 역할 초대는 RLS 정책(`invited_role <> 'admin' OR is_admin()`)에서 추가 검증된다.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceSupabase } from "@/auth/admin";
import { logAuthEvent } from "@/auth/events";
import { mapAuthError } from "@/auth/errors";
import { inviteSchema } from "@/lib/validation/auth";

const INVITE_PATH = "/operator/invite";

export async function inviteUser(
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    invited_role: formData.get("invited_role"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());
  const { data: userData } = await supabase.auth.getUser();
  const inviterId = userData.user?.id;
  if (!inviterId) {
    return { error: "인증이 만료되었습니다. 다시 로그인해주세요." };
  }

  // 1. user_invitations INSERT — 인증된 클라이언트로 호출하여 RLS가 적용되도록 한다.
  //    RLS WITH CHECK: invited_by = auth.uid() AND (invited_role <> 'admin' OR is_admin()).
  // @MX:NOTE: user_invitations 타입 미생성 — `as any` 캐스팅 (auth/events.ts와 동일).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (supabase as any)
    .from("user_invitations")
    .insert({
      email: parsed.data.email,
      invited_role: parsed.data.invited_role,
      invited_by: inviterId,
    });
  if (insertErr) {
    return { error: mapAuthError(insertErr) };
  }

  // 2. Supabase Auth 초대 메일 발송 (service role 필요).
  const admin = createServiceSupabase();
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      // raw_user_meta_data — 정보용일 뿐, 신뢰 출처는 public.user_invitations.
      data: { invited_role: parsed.data.invited_role },
    },
  );
  if (sendErr) {
    // 메일 발송 실패 시 초대 행을 롤백하여 orphan 방지.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("user_invitations")
      .delete()
      .eq("email", parsed.data.email)
      .is("accepted_at", null)
      .is("revoked_at", null);
    return { error: mapAuthError(sendErr) };
  }

  await logAuthEvent("invitation_issued", {
    userId: inviterId,
    email: parsed.data.email,
    metadata: { invited_role: parsed.data.invited_role },
  });

  revalidatePath(INVITE_PATH);
  return { success: "초대를 발송했습니다." };
}

export async function revokeInvitation(
  invitationId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = createClient(await cookies());
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "인증이 만료되었습니다. 다시 로그인해주세요." };
  }

  const admin = createServiceSupabase();

  // 1. 초대 조회 — 발송된 auth.users 레코드까지 정리하기 위해 auth_user_id 확인.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRaw, error: lookupErr } = await (admin as any)
    .from("user_invitations")
    .select("id, email, auth_user_id, invited_by, accepted_at")
    .eq("id", invitationId)
    .single();

  const inv = invRaw as
    | {
        id: string;
        email: string;
        auth_user_id: string | null;
        invited_by: string;
        accepted_at: string | null;
      }
    | null;

  if (lookupErr || !inv) {
    return { error: "초대를 찾을 수 없습니다." };
  }

  // 이미 수락된 초대는 revoke 불가 (정책에 따라 사용자 계정 삭제는 별도 흐름).
  if (inv.accepted_at) {
    return { error: "이미 수락된 초대는 취소할 수 없습니다." };
  }

  // 2. 초대로 생성된 auth.users 행이 있다면 best-effort로 삭제 (REQ-AUTH-INVITE-006).
  if (inv.auth_user_id) {
    const { error: deleteErr } = await admin.auth.admin.deleteUser(
      inv.auth_user_id,
    );
    if (deleteErr) {
      // 삭제 실패는 치명적이지 않음 — revoked_at 표시는 진행한다.
      console.error("[invite.revoke] auth user delete failed:", deleteErr);
    }
  }

  // 3. revoked_at 업데이트 — RLS 정책(invited_by = auth.uid() OR is_admin())이 검증한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from("user_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateErr) {
    return { error: mapAuthError(updateErr) };
  }

  await logAuthEvent("invitation_revoked", {
    userId: userData.user.id,
    email: inv.email,
    metadata: { invitation_id: inv.id },
  });

  revalidatePath(INVITE_PATH);
  return { success: "초대를 취소했습니다." };
}
