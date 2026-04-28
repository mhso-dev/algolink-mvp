"use server";

// SPEC-PROJECT-001 §2.4 REQ-PROJECT-EDIT-001~004 — 프로젝트 수정 Server Action.
// 동시성 제어: expected_updated_at 비교 → mismatch 시 STALE_UPDATE 에러.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { updateProjectSchema } from "@/lib/validation/project";
import { PROJECT_ERRORS } from "@/lib/projects/errors";

export interface UpdateProjectFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** STALE_UPDATE 시 최신 updated_at 으로 갱신 → 폼 hidden field 재사용. */
  freshUpdatedAt?: string;
}

interface ProjectStaleRow {
  id: string;
  updated_at: string;
  status: string;
}

export async function updateProjectAction(
  _prev: UpdateProjectFormState | undefined,
  formData: FormData,
): Promise<UpdateProjectFormState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, message: "권한이 없습니다." };
  }

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    return { ok: false, message: PROJECT_ERRORS.PROJECT_NOT_FOUND };
  }

  const requiredSkillIdsRaw = formData.getAll("requiredSkillIds[]");
  const parsed = updateProjectSchema.safeParse({
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
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
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

  // 사전 검증: 현재 row 존재 + task_done 잠금 (REQ-PROJECT-EDIT-004)
  const { data: current, error: rErr } = await supabase
    .from("projects")
    .select("id, updated_at, status")
    .eq("id", projectId)
    .maybeSingle<ProjectStaleRow>();

  if (rErr || !current) {
    return { ok: false, message: PROJECT_ERRORS.PROJECT_NOT_FOUND };
  }

  // task_done 잠금 — admin 만 우회 가능 (REQ-PROJECT-EDIT-004)
  if (current.status === "task_done" && user.role !== "admin") {
    return {
      ok: false,
      message: "정산 완료된 프로젝트는 관리자만 수정할 수 있습니다.",
      freshUpdatedAt: current.updated_at,
    };
  }

  const updatePayload = {
    title: data.title,
    client_id: data.clientId,
    project_type: data.projectType,
    education_start_at: data.startAt ? data.startAt.toISOString() : null,
    education_end_at: data.endAt ? data.endAt.toISOString() : null,
    business_amount_krw: data.businessAmountKrw,
    instructor_fee_krw: data.instructorFeeKrw,
    notes: data.notes ?? null,
  };

  // 동시성 제어: WHERE updated_at = expected. affected rows = 0 → stale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: uErr } = await (supabase as any)
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId)
    .eq("updated_at", data.expectedUpdatedAt)
    .select("id, updated_at")
    .maybeSingle();

  if (uErr) {
    console.error("[projects/edit] update failed", uErr);
    return { ok: false, message: "수정에 실패했습니다." };
  }

  if (!updated) {
    // affected rows = 0 → stale
    return {
      ok: false,
      message: PROJECT_ERRORS.STALE_UPDATE,
      freshUpdatedAt: current.updated_at,
    };
  }

  // required_skill_ids 동기화 — 단순 전체 교체.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("project_required_skills")
    .delete()
    .eq("project_id", projectId);
  if (data.requiredSkillIds.length > 0) {
    const skillRows = data.requiredSkillIds.map((sid) => ({
      project_id: projectId,
      skill_id: sid,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: skErr } = await (supabase as any)
      .from("project_required_skills")
      .insert(skillRows);
    if (skErr) {
      console.warn("[projects/edit] required skills sync failed", skErr);
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}
