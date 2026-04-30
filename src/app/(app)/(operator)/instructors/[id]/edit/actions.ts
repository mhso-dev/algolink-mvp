"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { instructorCreateSchema } from "@/lib/validation/instructor";

export type UpdateInstructorResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function normalizeSkillIds(formData: FormData): string[] {
  return formData
    .getAll("skillIds")
    .map((v) => (typeof v === "string" ? v : ""))
    .filter(Boolean);
}

export async function updateInstructorAction(
  formData: FormData,
): Promise<UpdateInstructorResult> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다." };
  }

  const instructorId = String(formData.get("instructorId") ?? "");
  if (!instructorId) {
    return { ok: false, error: "강사 ID가 필요합니다." };
  }

  const parsed = instructorCreateSchema.safeParse({
    nameKr: formData.get("nameKr"),
    nameEn: formData.get("nameEn") ?? "",
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    skillIds: normalizeSkillIds(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());

  const { data: dup } = await supabase
    .from("instructors_safe")
    .select("id")
    .eq("email", parsed.data.email)
    .is("deleted_at", null)
    .neq("id", instructorId)
    .limit(1);
  if (dup && dup.length > 0) {
    return { ok: false, error: "이미 등록된 이메일입니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from("instructors")
    .update({
      name_kr: parsed.data.nameKr,
      name_en: parsed.data.nameEn ?? null,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instructorId)
    .is("deleted_at", null);
  if (updateErr) {
    return { ok: false, error: "강사 수정에 실패했습니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("instructor_skills").delete().eq("instructor_id", instructorId);
  if (parsed.data.skillIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: skillErr } = await (supabase as any)
      .from("instructor_skills")
      .insert(
        parsed.data.skillIds.map((skillId) => ({
          instructor_id: instructorId,
          skill_id: skillId,
        })),
      );
    if (skillErr) {
      return { ok: false, error: "기술스택 저장에 실패했습니다." };
    }
  }

  revalidatePath(`/instructors/${instructorId}`);
  revalidatePath("/instructors");
  redirect(`/instructors/${instructorId}`);
}

export async function softDeleteInstructorAction(
  instructorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다." };
  }

  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("instructors")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", instructorId)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: "강사 삭제에 실패했습니다." };
  }

  revalidatePath("/instructors");
  revalidatePath(`/instructors/${instructorId}`);
  return { ok: true };
}
