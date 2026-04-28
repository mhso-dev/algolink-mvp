"use server";

// SPEC-INSTRUCTOR-001 §2.3 REQ-INSTRUCTOR-CREATE-001~006 — 강사 등록 + 초대.
// @MX:SPEC: SPEC-INSTRUCTOR-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — proficiency 인자 부재. binary instructor_skills INSERT.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceSupabase } from "@/auth/admin";
import { logAuthEvent } from "@/auth/events";
import { mapAuthError } from "@/auth/errors";
import { instructorCreateSchema } from "@/lib/validation/instructor";

export type CreateInstructorResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// @MX:ANCHOR: SPEC-INSTRUCTOR-001 §2.3 — 강사 등록 + 초대 메일 진입점.
// @MX:REASON: instructors INSERT + instructor_skills INSERT + invitation 3-step. 부분 실패 시 보상 트랜잭션.
// @MX:SPEC: SPEC-INSTRUCTOR-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
export async function createInstructorAndInvite(
  formData: FormData,
): Promise<CreateInstructorResult> {
  const skillIdsRaw = formData.getAll("skillIds");
  const parsed = instructorCreateSchema.safeParse({
    nameKr: formData.get("nameKr"),
    nameEn: formData.get("nameEn") ?? "",
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    skillIds: skillIdsRaw.filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());
  const { data: userData } = await supabase.auth.getUser();
  const inviterId = userData.user?.id;
  if (!inviterId) {
    return { ok: false, error: "인증이 만료되었습니다. 다시 로그인해주세요." };
  }

  // 1. 이메일 중복 체크 — instructors 측만 검사 (auth.users는 invite 측에서 거부됨).
  const { data: dup } = await supabase
    .from("instructors_safe")
    .select("id")
    .eq("email", parsed.data.email)
    .is("deleted_at", null)
    .limit(1);
  if (dup && dup.length > 0) {
    return { ok: false, error: "이미 등록된 이메일입니다." };
  }

  // 2. INSERT instructors. Supabase 생성 타입의 relationship 모호성으로 `as any` 캐스팅.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: createdRaw, error: insertErr } = await (supabase as any)
    .from("instructors")
    .insert({
      name_kr: parsed.data.nameKr,
      name_en: parsed.data.nameEn ?? null,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      created_by: inviterId,
    })
    .select("id")
    .single();

  if (insertErr || !createdRaw) {
    return { ok: false, error: mapAuthError(insertErr) };
  }
  const instructorId = (createdRaw as { id: string }).id;

  // SPEC-SKILL-ABSTRACT-001: proficiency 컬럼 제거 — binary 매칭.
  // 3. INSERT instructor_skills (best-effort; 부분 실패 시 운영 점검).
  if (parsed.data.skillIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("instructor_skills").insert(
      parsed.data.skillIds.map((skillId) => ({
        instructor_id: instructorId,
        skill_id: skillId,
      })),
    );
  }

  // 4. 초대 발송 (service role).
  const admin = createServiceSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: invInsertErr } = await (supabase as any)
    .from("user_invitations")
    .insert({
      email: parsed.data.email,
      invited_role: "instructor",
      invited_by: inviterId,
    });
  if (invInsertErr) {
    // rollback instructor row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("instructors").delete().eq("id", instructorId);
    return { ok: false, error: mapAuthError(invInsertErr) };
  }

  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: {
        invited_role: "instructor",
        instructor_id: instructorId,
      },
    },
  );
  if (sendErr) {
    // 초대 메일 실패 → user_invitations 행 + instructors 행 모두 rollback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("user_invitations")
      .delete()
      .eq("email", parsed.data.email)
      .is("accepted_at", null)
      .is("revoked_at", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("instructors").delete().eq("id", instructorId);
    return {
      ok: false,
      error: "초대 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  await logAuthEvent("invitation_issued", {
    userId: inviterId,
    email: parsed.data.email,
    metadata: { invited_role: "instructor", instructor_id: instructorId },
  });

  revalidatePath("/instructors");
  redirect(`/instructors/${instructorId}`);
}
