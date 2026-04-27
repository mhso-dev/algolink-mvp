"use server";

// SPEC-PROJECT-001 §2.2 REQ-PROJECT-CREATE-001~005 — 프로젝트 신규 등록 Server Action.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { createProjectSchema } from "@/lib/validation/project";
import { PROJECT_ERRORS } from "@/lib/projects/errors";

export interface CreateProjectFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  projectId?: string;
}

export async function createProjectAction(
  _prev: CreateProjectFormState | undefined,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, message: "권한이 없습니다." };
  }

  const requiredSkillIdsRaw = formData.getAll("requiredSkillIds[]");
  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId"),
    projectType: formData.get("projectType") ?? "education",
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    requiredSkillIds: requiredSkillIdsRaw
      .map((v) => (typeof v === "string" ? v : ""))
      .filter(Boolean),
    businessAmountKrw: formData.get("businessAmountKrw"),
    instructorFeeKrw: formData.get("instructorFeeKrw"),
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "입력 값을 확인해 주세요.", fieldErrors };
  }

  const data = parsed.data;
  const supabase = createClient(await cookies());

  const insertPayload = {
    title: data.title,
    client_id: data.clientId,
    project_type: data.projectType,
    operator_id: user.id,
    education_start_at: data.startAt ? data.startAt.toISOString() : null,
    education_end_at: data.endAt ? data.endAt.toISOString() : null,
    business_amount_krw: data.businessAmountKrw,
    instructor_fee_krw: data.instructorFeeKrw,
    notes: data.notes ?? null,
    status: "proposal" as const,
  };

  // supabase types Insert 가 never 로 생성됨(autogen 미반영) → 기존 invite/actions 와 동일하게 캐스트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase as any)
    .from("projects")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[projects/new] insert failed", error);
    return { ok: false, message: PROJECT_ERRORS.CREATE_FAILED_GENERIC };
  }

  const projectId = (inserted as { id: string } | null)?.id;
  if (!projectId) {
    return { ok: false, message: PROJECT_ERRORS.CREATE_FAILED_GENERIC };
  }

  if (data.requiredSkillIds.length > 0) {
    // project_required_skills 는 신규 테이블 — 자동 생성된 supabase types 외 → 캐스트.
    const skillRows = data.requiredSkillIds.map((sid) => ({
      project_id: projectId,
      skill_id: sid,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: skErr } = await (supabase as any)
      .from("project_required_skills")
      .insert(skillRows);
    if (skErr) {
      console.warn("[projects/new] required skills insert failed", skErr);
      // 프로젝트는 생성됨 — 부분 성공으로 처리.
    }
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}
