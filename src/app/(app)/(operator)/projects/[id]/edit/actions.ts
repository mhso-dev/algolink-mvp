"use server";

// SPEC-PROJECT-001 §2.4 REQ-PROJECT-EDIT-001~004 — 프로젝트 수정 Server Action.
// SPEC-PAYOUT-002 §M6 REQ-EXCEPT-001/-002/-003 — 결강/일정 변경/강사 중도 하차 액션.
// 동시성 제어: expected_updated_at 비교 → mismatch 시 STALE_UPDATE 에러.
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-PAYOUT-002
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — required_skills full-replace (DELETE all + INSERT skillIds).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { updateProjectSchema } from "@/lib/validation/project";
import { PROJECT_ERRORS } from "@/lib/projects/errors";
import {
  cancelSession,
  rescheduleSession,
  bulkCancelFutureSessions,
} from "@/lib/sessions/queries";
import {
  rescheduleInputSchema,
  withdrawInstructorInputSchema,
} from "@/lib/sessions/validation";
import { SESSION_ERRORS } from "@/lib/sessions/errors";

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

// @MX:ANCHOR: SPEC-PROJECT-001 §2.4 — 프로젝트 수정 진입점 (동시성 토큰 + skill full-replace).
// @MX:REASON: project_required_skills DELETE + INSERT pattern. STALE_UPDATE 동시성 보장.
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
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
    // SPEC-PAYOUT-002 §M4 — 시급 + 분배율 (REQ-PROJECT-FIELDS-001/-004)
    hourlyRateKrw: formData.get("hourlyRateKrw"),
    instructorSharePct: formData.get("instructorSharePct"),
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
    // SPEC-PAYOUT-002 §M4 — 시급 + 분배율 (REQ-PROJECT-FIELDS-004)
    hourly_rate_krw: data.hourlyRateKrw,
    instructor_share_pct: data.instructorSharePct,
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

// =============================================================================
// SPEC-PAYOUT-002 §M6 — 결강 / 일정 변경 / 강사 중도 하차 액션
// =============================================================================

export interface SessionActionState {
  ok: boolean;
  error?: string;
}

// @MX:NOTE: SPEC-PAYOUT-002 §M6 — 결강 처리 진입점. planned → canceled + notes 사유 저장.
// @MX:SPEC: SPEC-PAYOUT-002
/**
 * 결강 처리 (REQ-PAYOUT002-EXCEPT-001).
 * planned → canceled, notes에 사유 prepend.
 */
export async function cancelSessionAction(
  _prev: SessionActionState | undefined,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다." };
  }
  const sessionId = String(formData.get("session_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const reason = (formData.get("reason") ?? "") as string;
  if (!sessionId) {
    return { ok: false, error: "세션 ID가 필요합니다." };
  }

  const supabase = createClient(await cookies());
  const r = await cancelSession(supabase, {
    sessionId,
    reason: reason || undefined,
  });
  if (!r.ok) {
    return { ok: false, error: r.error ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (projectId) {
    revalidatePath(`/projects/${projectId}/edit`);
    revalidatePath(`/projects/${projectId}`);
  }
  return { ok: true };
}

// @MX:NOTE: SPEC-PAYOUT-002 §M6 — 일정 변경 진입점. 원본 rescheduled + 신규 row INSERT (original_session_id 연결).
// @MX:SPEC: SPEC-PAYOUT-002
/**
 * 일정 변경 처리 (REQ-PAYOUT002-EXCEPT-002).
 * 원본 → rescheduled, 새 row INSERT (notes carry-forward LOW-8).
 */
export async function rescheduleSessionAction(
  _prev: SessionActionState | undefined,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다." };
  }
  const projectId = String(formData.get("project_id") ?? "");

  const parsed = rescheduleInputSchema.safeParse({
    session_id: formData.get("session_id"),
    new_date: formData.get("new_date"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());
  const r = await rescheduleSession(supabase, {
    sessionId: parsed.data.session_id,
    newDate: parsed.data.new_date,
    notes: parsed.data.notes ?? null,
  });
  if (!r.ok) {
    return { ok: false, error: r.error ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (projectId) {
    revalidatePath(`/projects/${projectId}/edit`);
    revalidatePath(`/projects/${projectId}`);
  }
  return { ok: true };
}

// @MX:NOTE: SPEC-PAYOUT-002 §M6 — 강사 중도 하차 진입점. 미래 planned 일괄 canceled + project status → instructor_withdrawn.
// @MX:WARN: 2-step 쓰기 (세션 bulk cancel → project status 전환). 세션 cancel 성공 후 status 업데이트 실패 시 부분 상태 가능.
// @MX:REASON: Supabase Server Action 단일 트랜잭션 미지원. 실패 시 운영자에게 에러 반환 — 재시도 안전(idempotent).
// @MX:SPEC: SPEC-PAYOUT-002
/**
 * 강사 중도 하차 처리 (REQ-PAYOUT002-EXCEPT-003).
 * 미래 planned → canceled 일괄 + project status → instructor_withdrawn.
 */
export async function withdrawInstructorAction(
  _prev: SessionActionState | undefined,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다." };
  }

  const parsed = withdrawInstructorInputSchema.safeParse({
    project_id: formData.get("project_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());

  // Step 1: 미래 planned 세션 일괄 canceled
  const cancelResult = await bulkCancelFutureSessions(supabase, {
    projectId: parsed.data.project_id,
    reason: parsed.data.reason,
  });
  if (!cancelResult.ok) {
    return {
      ok: false,
      error: cancelResult.error ?? SESSION_ERRORS.GENERIC_FAILED,
    };
  }

  // Step 2: project status → instructor_withdrawn
  // status-machine은 ALLOWED_TRANSITIONS에 따라 graph 외 전환을 거부 (강사 배정 단계 기준).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: stErr } = await (supabase as any)
    .from("projects")
    .update({
      status: "instructor_withdrawn",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.project_id);
  if (stErr) {
    console.error("[projects/edit] withdraw status update failed", stErr);
    return {
      ok: false,
      error: "프로젝트 상태 전환에 실패했습니다.",
    };
  }

  revalidatePath(`/projects/${parsed.data.project_id}/edit`);
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}
