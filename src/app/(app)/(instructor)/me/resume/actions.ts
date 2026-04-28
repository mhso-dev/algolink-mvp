"use server";

// SPEC-ME-001 §2.2 REQ-ME-RESUME-001 ~ -009 — 이력서 7-section CRUD Server Actions.
// @MX:ANCHOR: 강사 self-write 진입점 (fan_in >= 17 → 17 액션).
// @MX:REASON: 모든 액션이 ensureInstructorRow + zod 검증을 거친다. 권한 우회 시 즉시 차단.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  ensureInstructorRow,
  assertOwnership,
  type ResumeSection,
} from "@/lib/instructor/me-queries";
import {
  educationInputSchema,
  workExperienceInputSchema,
  certificationInputSchema,
  teachingExperienceInputSchema,
  instructorProjectInputSchema,
  publicationInputSchema,
  otherActivityInputSchema,
  basicInfoInputSchema,
  skillUpdateInputSchema,
  type EducationInput,
  type WorkExperienceInput,
  type CertificationInput,
  type TeachingExperienceInput,
  type InstructorProjectInput,
  type PublicationInput,
  type OtherActivityInput,
  type BasicInfoInput,
  type SkillUpdateInput,
} from "@/lib/validation/instructor";

export interface ActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

const PERMISSION_DENIED = {
  ok: false as const,
  message: "본인 이력서만 수정할 수 있습니다.",
};

const NOT_INSTRUCTOR = {
  ok: false as const,
  message: "강사 권한이 필요합니다.",
};

function fieldErrorsFromZod(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map((p) => String(p)).join(".") || "_form";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

// ---------- 기본정보 (instructors row) ----------

export async function updateBasicInfo(input: BasicInfoInput): Promise<ActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const r = basicInfoInputSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  }
  const supabase = createClient(await cookies());
  const payload: Record<string, unknown> = {
    name_kr: r.data.nameKr,
    name_en: r.data.nameEn || null,
    name_hanja: r.data.nameHanja || null,
    birth_date: r.data.birthDate || null,
    email: r.data.email || null,
    phone: r.data.phone || null,
    address: r.data.address || null,
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("instructors")
    .update(payload)
    .eq("id", ctx.instructorId);
  if (error) {
    console.error("[updateBasicInfo] failed", error);
    return { ok: false, message: "저장에 실패했습니다." };
  }
  revalidatePath("/me/resume");
  return { ok: true };
}

// ---------- 학력 (educations) ----------

async function genericInsert<T>(
  table: ResumeSection,
  payload: T,
  pathToRevalidate = "/me/resume",
): Promise<ActionResult<{ id: string }>> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(table)
    .insert({ ...payload, instructor_id: ctx.instructorId })
    .select("id")
    .single();
  if (error || !data) {
    console.error(`[insert ${table}] failed`, error);
    return { ok: false, message: "저장에 실패했습니다." };
  }
  revalidatePath(pathToRevalidate);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

async function genericUpdate(
  table: ResumeSection,
  id: string,
  payload: Record<string, unknown>,
  pathToRevalidate = "/me/resume",
): Promise<ActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const supabase = createClient(await cookies());
  const owned = await assertOwnership(supabase, table, id, ctx.instructorId);
  if (!owned) return PERMISSION_DENIED;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from(table).update(payload).eq("id", id);
  if (error) {
    console.error(`[update ${table}] failed`, error);
    return { ok: false, message: "수정에 실패했습니다." };
  }
  revalidatePath(pathToRevalidate);
  return { ok: true };
}

async function genericDelete(
  table: ResumeSection,
  id: string,
  pathToRevalidate = "/me/resume",
): Promise<ActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const supabase = createClient(await cookies());
  const owned = await assertOwnership(supabase, table, id, ctx.instructorId);
  if (!owned) return PERMISSION_DENIED;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from(table).delete().eq("id", id);
  if (error) {
    console.error(`[delete ${table}] failed`, error);
    return { ok: false, message: "삭제에 실패했습니다." };
  }
  revalidatePath(pathToRevalidate);
  return { ok: true };
}

// ---------- 학력 ----------

export async function addEducation(input: EducationInput) {
  const r = educationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("educations", {
    school: r.data.school,
    major: r.data.major || null,
    degree: r.data.degree || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function updateEducation(id: string, input: EducationInput) {
  const r = educationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("educations", id, {
    school: r.data.school,
    major: r.data.major || null,
    degree: r.data.degree || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function deleteEducation(id: string) {
  return genericDelete("educations", id);
}

// ---------- 경력 (work_experiences) ----------

export async function addWorkExperience(input: WorkExperienceInput) {
  const r = workExperienceInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("work_experiences", {
    company: r.data.company,
    position: r.data.position || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function updateWorkExperience(id: string, input: WorkExperienceInput) {
  const r = workExperienceInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("work_experiences", id, {
    company: r.data.company,
    position: r.data.position || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function deleteWorkExperience(id: string) {
  return genericDelete("work_experiences", id);
}

// ---------- 강의이력 (teaching_experiences) ----------

export async function addLectureHistory(input: TeachingExperienceInput) {
  const r = teachingExperienceInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("teaching_experiences", {
    title: r.data.title,
    organization: r.data.organization || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function updateLectureHistory(id: string, input: TeachingExperienceInput) {
  const r = teachingExperienceInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("teaching_experiences", id, {
    title: r.data.title,
    organization: r.data.organization || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function deleteLectureHistory(id: string) {
  return genericDelete("teaching_experiences", id);
}

// ---------- 자격 (certifications) ----------

export async function addCertification(input: CertificationInput) {
  const r = certificationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("certifications", {
    name: r.data.name,
    issuer: r.data.issuer || null,
    issued_date: r.data.issuedDate || null,
    expires_date: r.data.expiresDate || null,
    description: r.data.description || null,
  });
}

export async function updateCertification(id: string, input: CertificationInput) {
  const r = certificationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("certifications", id, {
    name: r.data.name,
    issuer: r.data.issuer || null,
    issued_date: r.data.issuedDate || null,
    expires_date: r.data.expiresDate || null,
    description: r.data.description || null,
  });
}

export async function deleteCertification(id: string) {
  return genericDelete("certifications", id);
}

// ---------- 저서 (publications) ----------

export async function addPublication(input: PublicationInput) {
  const r = publicationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("publications", {
    title: r.data.title,
    publisher: r.data.publisher || null,
    published_date: r.data.publishedDate || null,
    isbn: r.data.isbn || null,
    description: r.data.description || null,
  });
}

export async function updatePublication(id: string, input: PublicationInput) {
  const r = publicationInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("publications", id, {
    title: r.data.title,
    publisher: r.data.publisher || null,
    published_date: r.data.publishedDate || null,
    isbn: r.data.isbn || null,
    description: r.data.description || null,
  });
}

export async function deletePublication(id: string) {
  return genericDelete("publications", id);
}

// ---------- 프로젝트 (instructor_projects) ----------

export async function addInstructorProject(input: InstructorProjectInput) {
  const r = instructorProjectInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("instructor_projects", {
    title: r.data.title,
    role: r.data.role || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function updateInstructorProject(id: string, input: InstructorProjectInput) {
  const r = instructorProjectInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("instructor_projects", id, {
    title: r.data.title,
    role: r.data.role || null,
    start_date: r.data.startDate || null,
    end_date: r.data.endDate || null,
    description: r.data.description || null,
  });
}

export async function deleteInstructorProject(id: string) {
  return genericDelete("instructor_projects", id);
}

// ---------- 기타 활동 (other_activities) ----------

export async function addOtherActivity(input: OtherActivityInput) {
  const r = otherActivityInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericInsert("other_activities", {
    title: r.data.title,
    category: r.data.category || null,
    activity_date: r.data.activityDate || null,
    description: r.data.description || null,
  });
}

export async function updateOtherActivity(id: string, input: OtherActivityInput) {
  const r = otherActivityInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  return genericUpdate("other_activities", id, {
    title: r.data.title,
    category: r.data.category || null,
    activity_date: r.data.activityDate || null,
    description: r.data.description || null,
  });
}

export async function deleteOtherActivity(id: string) {
  return genericDelete("other_activities", id);
}

// ---------- 강의가능 기술스택 (instructor_skills) ----------
// SPEC-SKILL-ABSTRACT-001 §3.2 — proficiency 제거 + full-replace upsert.

// @MX:ANCHOR: SPEC-SKILL-ABSTRACT-001 — 단일 chip 토글 server action.
// @MX:REASON: SkillsPicker가 chip 클릭 시마다 호출. selected=true → INSERT, selected=false → DELETE.
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
export async function updateSkill(input: SkillUpdateInput): Promise<ActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const r = skillUpdateInputSchema.safeParse(input);
  if (!r.success) return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
  const supabase = createClient(await cookies());

  if (!r.data.selected) {
    // DELETE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("instructor_skills")
      .delete()
      .eq("instructor_id", ctx.instructorId)
      .eq("skill_id", r.data.skillId);
    if (error) {
      console.error("[deleteSkill] failed", error);
      return { ok: false, message: "삭제에 실패했습니다." };
    }
  } else {
    // INSERT (proficiency 컬럼 부재)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("instructor_skills")
      .upsert(
        {
          instructor_id: ctx.instructorId,
          skill_id: r.data.skillId,
        },
        { onConflict: "instructor_id,skill_id" },
      );
    if (error) {
      console.error("[upsertSkill] failed", error);
      return { ok: false, message: "저장에 실패했습니다." };
    }
  }
  revalidatePath("/me/resume");
  return { ok: true };
}

// updateSkills: 일괄 (전체 교체)
// SPEC-SKILL-ABSTRACT-001 §3.2 REQ-SKILL-INSTRUCTOR-MAP-003 — full-replace upsert pattern.
export async function updateSkills(
  inputs: SkillUpdateInput[],
): Promise<ActionResult<{ updated: number }>> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return NOT_INSTRUCTOR;
  const validated: SkillUpdateInput[] = [];
  for (const it of inputs) {
    const r = skillUpdateInputSchema.safeParse(it);
    if (!r.success) {
      return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors: fieldErrorsFromZod(r.error.issues) };
    }
    validated.push(r.data);
  }
  const supabase = createClient(await cookies());
  const toDelete = validated.filter((v) => !v.selected).map((v) => v.skillId);
  const toInsert = validated.filter((v) => v.selected);
  if (toDelete.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("instructor_skills")
      .delete()
      .eq("instructor_id", ctx.instructorId)
      .in("skill_id", toDelete);
  }
  if (toInsert.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("instructor_skills")
      .upsert(
        toInsert.map((v) => ({
          instructor_id: ctx.instructorId,
          skill_id: v.skillId,
        })),
        { onConflict: "instructor_id,skill_id" },
      );
    if (error) {
      console.error("[updateSkills] failed", error);
      return { ok: false, message: "저장에 실패했습니다." };
    }
  }
  revalidatePath("/me/resume");
  return { ok: true, data: { updated: validated.length } };
}
