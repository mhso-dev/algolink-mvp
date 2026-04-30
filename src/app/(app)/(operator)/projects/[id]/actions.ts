"use server";

// SPEC-PROJECT-001 §2.5/§2.6/§2.7 — 상세 페이지 Server Actions:
// - runRecommendation
// - assignInstructor
// - transitionStatus

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import {
  generateRecommendations,
  type CandidateInput,
  type ProjectInput,
  type RecommendationCandidate,
} from "@/lib/recommend";
import { validateTransition } from "@/lib/projects/status-machine";
import { PROJECT_ERRORS } from "@/lib/projects/errors";
import type { ProjectStatus } from "@/lib/projects";
import { emitNotification } from "@/lib/notifications/emit";
import { checkLowSatisfaction } from "@/lib/notifications/triggers/low-satisfaction";
import { checkScheduleConflict } from "@/lib/notifications/triggers/schedule-conflict";

interface ProjectRow {
  id: string;
  status: ProjectStatus;
  instructor_id: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  updated_at: string;
}

interface RequiredSkillRow {
  skill_id: string;
}

interface InstructorRow {
  id: string;
  name_kr: string | null;
}

// SPEC-SKILL-ABSTRACT-001: proficiency 컬럼 제거.
interface InstructorSkillRow {
  instructor_id: string;
  skill_id: string;
}

interface ScheduleRow {
  instructor_id: string;
  schedule_kind: "system_lecture" | "personal" | "unavailable";
  starts_at: string;
  ends_at: string;
}

interface ReviewRow {
  instructor_id: string;
  score: number;
}

export interface RecommendActionResult {
  ok: boolean;
  message?: string;
  candidates?: RecommendationCandidate[];
  recommendationId?: string;
  model?: string | null;
}

async function ensureOperator() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, error: "권한이 없습니다.", user: null } as const;
  }
  return { ok: true, error: null, user } as const;
}

// @MX:NOTE: SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-004/005 — Claude 사유 생성기 호출 비활성.
// @MX:REASON: AI 사유 비용/지연 vs KPI 가치 미검증 단계. 룰 기반 폴백을 단일 노출 경로로 사용.
// @MX:SPEC: SPEC-RECOMMEND-001
/** Top-3 추천 실행 + ai_instructor_recommendations INSERT. */
export async function runRecommendationAction(
  projectId: string,
): Promise<RecommendActionResult> {
  const auth = await ensureOperator();
  if (!auth.ok) return { ok: false, message: auth.error ?? "권한 없음" };

  const supabase = createClient(await cookies());

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select(
      "id, status, instructor_id, education_start_at, education_end_at, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();
  if (pErr || !project) {
    return { ok: false, message: PROJECT_ERRORS.PROJECT_NOT_FOUND };
  }

  const startAt = project.education_start_at
    ? new Date(project.education_start_at)
    : new Date();
  const endAt = project.education_end_at
    ? new Date(project.education_end_at)
    : new Date(startAt.getTime() + 24 * 3600 * 1000);

  // required_skill_ids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: skillRowsRaw } = await (supabase as any)
    .from("project_required_skills")
    .select("skill_id")
    .eq("project_id", projectId);
  const requiredSkillIds: string[] = (
    (skillRowsRaw ?? []) as RequiredSkillRow[]
  ).map((r) => r.skill_id);

  // 후보 강사 — required_skill 매칭 강사 set
  let candidateIds: string[] = [];
  if (requiredSkillIds.length > 0) {
    const { data: matchRows } = await supabase
      .from("instructor_skills")
      .select("instructor_id, skill_id")
      .in("skill_id", requiredSkillIds)
      .returns<InstructorSkillRow[]>();
    candidateIds = Array.from(
      new Set((matchRows ?? []).map((r) => r.instructor_id)),
    );
  }

  let candidates: CandidateInput[] = [];
  if (candidateIds.length > 0) {
    const [{ data: instructors }, { data: allSkills }, { data: schedules }, { data: reviews }] =
      await Promise.all([
        supabase
          .from("instructors_safe")
          .select("id, name_kr")
          .in("id", candidateIds)
          .returns<InstructorRow[]>(),
        supabase
          .from("instructor_skills")
          .select("instructor_id, skill_id")
          .in("instructor_id", candidateIds)
          .returns<InstructorSkillRow[]>(),
        supabase
          .from("schedule_items")
          .select("instructor_id, schedule_kind, starts_at, ends_at")
          .in("instructor_id", candidateIds)
          .returns<ScheduleRow[]>(),
        supabase
          .from("satisfaction_reviews")
          .select("instructor_id, score")
          .in("instructor_id", candidateIds)
          .returns<ReviewRow[]>(),
      ]);

    // SPEC-SKILL-ABSTRACT-001: proficiency 필드 제거 — binary 매칭.
    const skillsByInstructor = new Map<string, { skillId: string }[]>();
    for (const s of allSkills ?? []) {
      const list = skillsByInstructor.get(s.instructor_id) ?? [];
      list.push({ skillId: s.skill_id });
      skillsByInstructor.set(s.instructor_id, list);
    }

    const schedulesByInstructor = new Map<
      string,
      { kind: ScheduleRow["schedule_kind"]; startsAt: Date; endsAt: Date }[]
    >();
    for (const s of schedules ?? []) {
      const list = schedulesByInstructor.get(s.instructor_id) ?? [];
      list.push({
        kind: s.schedule_kind,
        startsAt: new Date(s.starts_at),
        endsAt: new Date(s.ends_at),
      });
      schedulesByInstructor.set(s.instructor_id, list);
    }

    const reviewsByInstructor = new Map<string, { sum: number; count: number }>();
    for (const r of reviews ?? []) {
      const cur = reviewsByInstructor.get(r.instructor_id) ?? { sum: 0, count: 0 };
      cur.sum += r.score;
      cur.count += 1;
      reviewsByInstructor.set(r.instructor_id, cur);
    }

    candidates = (instructors ?? []).map((ins) => {
      const stats = reviewsByInstructor.get(ins.id);
      return {
        instructorId: ins.id,
        displayName: ins.name_kr ?? "(이름 미공개)",
        skills: skillsByInstructor.get(ins.id) ?? [],
        schedules: schedulesByInstructor.get(ins.id) ?? [],
        reviews: {
          meanScore: stats && stats.count > 0 ? stats.sum / stats.count : null,
          count: stats?.count ?? 0,
        },
      };
    });
  }

  const projectInput: ProjectInput = {
    projectId,
    startAt,
    endAt,
    requiredSkillIds,
  };

  // SPEC-RECOMMEND-001 REQ-RECOMMEND-004 — reasonGen=null 직접 전달 (AI 사유 비활성).
  const result = await generateRecommendations(
    projectInput,
    candidates,
    null,
    3,
  );

  // INSERT ai_instructor_recommendations — supabase types Insert never → 캐스트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (supabase as any)
    .from("ai_instructor_recommendations")
    .insert({
      project_id: projectId,
      top3_jsonb: result.candidates as unknown as object,
      model: result.model ?? "fallback",
    })
    .select("id")
    .single();

  if (insErr) {
    console.warn("[runRecommendation] INSERT failed", insErr);
  }

  revalidatePath(`/projects/${projectId}`);

  return {
    ok: true,
    candidates: result.candidates,
    recommendationId:
      ((inserted as { id?: string } | null)?.id) ?? undefined,
    model: result.model,
  };
}

export interface AssignActionResult {
  ok: boolean;
  message?: string;
}

export async function softDeleteProjectAction(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await ensureOperator();
  if (!auth.ok) return { ok: false, error: auth.error ?? "권한 없음" };

  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("projects")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .is("deleted_at", null);

  if (error) {
    console.error("[softDeleteProject] failed", error);
    return { ok: false, error: "프로젝트 삭제에 실패했습니다." };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** 1-클릭 배정 요청 — projects.instructor_id + adopted_instructor_id + notification INSERT. */
export async function assignInstructorAction(input: {
  projectId: string;
  instructorId: string;
  recommendationId: string | null;
  force?: boolean;
}): Promise<AssignActionResult> {
  const auth = await ensureOperator();
  if (!auth.ok) return { ok: false, message: auth.error ?? "권한 없음" };

  const supabase = createClient(await cookies());

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, title, status, instructor_id, education_start_at, education_end_at",
    )
    .eq("id", input.projectId)
    .maybeSingle<ProjectRow & { title: string }>();
  if (!project) return { ok: false, message: PROJECT_ERRORS.PROJECT_NOT_FOUND };

  // 추천 결과 검증 (force 가 아니면 Top-3 에 반드시 포함) + KPI 로깅용 rank 산출.
  // SPEC-PROJECT-001 §1.4 / EC-13 — top3_jsonb->0 (rank 1) 매칭이 KPI 분자.
  let acceptedRank: number | null = null;
  if (!input.force) {
    const { data: rec } = await supabase
      .from("ai_instructor_recommendations")
      .select("id, top3_jsonb")
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; top3_jsonb: unknown }>();

    const top3 = Array.isArray(rec?.top3_jsonb)
      ? (rec!.top3_jsonb as { instructorId?: string }[])
      : [];
    const idx = top3.findIndex((c) => c.instructorId === input.instructorId);
    if (idx < 0) {
      return { ok: false, message: PROJECT_ERRORS.ASSIGN_NOT_IN_TOP3 };
    }
    acceptedRank = idx + 1; // 1-based rank for KPI 로깅 (1순위/2순위/3순위).
  }

  // instructor → user_id 매핑 (notification recipient 결정)
  const { data: instructor } = await supabase
    .from("instructors")
    .select("id, user_id, name_kr")
    .eq("id", input.instructorId)
    .maybeSingle<{ id: string; user_id: string | null; name_kr: string | null }>();

  // 트랜잭션 — Supabase JS 는 multi-statement transaction 미지원.
  // 보수적으로 순차 호출 + 실패 시 보상 UPDATE. 실제 정합성은 RPC 로 강화 가능.
  const newStatus: ProjectStatus =
    project.status === "lecture_requested" ||
    project.status === "instructor_sourcing"
      ? "assignment_review"
      : project.status;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any)
    .from("projects")
    .update({
      instructor_id: input.instructorId,
      status: newStatus,
    })
    .eq("id", input.projectId);
  if (upErr) {
    console.error("[assignInstructor] projects update failed", upErr);
    return { ok: false, message: PROJECT_ERRORS.ASSIGN_FAILED_GENERIC };
  }

  // adopted_instructor_id 갱신
  if (input.recommendationId && !input.force) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("ai_instructor_recommendations")
      .update({ adopted_instructor_id: input.instructorId })
      .eq("id", input.recommendationId);
  }

  // notifications INSERT — SPEC-NOTIFY-001 §M4: emit 헬퍼 사용. 콘솔 로그 형식 보존.
  if (instructor?.user_id) {
    const r = await emitNotification(supabase, {
      recipientId: instructor.user_id,
      type: "assignment_request",
      title: `[배정 요청] ${project.title}`,
      body: `프로젝트: ${project.title}\n시작: ${project.education_start_at ?? "-"}\n종료: ${project.education_end_at ?? "-"}`,
      linkUrl: "/me",
      logContext: `instructor_id=${input.instructorId} project_id=${input.projectId} rank=${acceptedRank ?? "force"}`,
    });
    if (!r.ok) {
      // 실패 시 보상 — 변경 롤백 (Best effort)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("projects")
        .update({
          instructor_id: project.instructor_id,
          status: project.status,
        })
        .eq("id", input.projectId);
      return { ok: false, message: PROJECT_ERRORS.ASSIGN_FAILED_GENERIC };
    }
  }

  // SPEC-NOTIFY-001 §M4 — 트리거 호출 (silent failure, parent action 중단 금지).
  try {
    await checkLowSatisfaction(
      supabase,
      input.instructorId,
      auth.user!.id,
      input.projectId,
    );
    if (project.education_start_at && project.education_end_at) {
      await checkScheduleConflict(supabase, input.instructorId, {
        start: project.education_start_at,
        end: project.education_end_at,
      });
    }
  } catch (e) {
    console.warn("[notify.trigger] post-assign trigger failed", e);
  }

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export interface TransitionActionResult {
  ok: boolean;
  message?: string;
}

/** 상태 전환 — validateTransition 통과 시 UPDATE. */
export async function transitionStatusAction(input: {
  projectId: string;
  to: ProjectStatus;
  force?: boolean;
}): Promise<TransitionActionResult> {
  const auth = await ensureOperator();
  if (!auth.ok) return { ok: false, message: auth.error ?? "권한 없음" };

  const supabase = createClient(await cookies());
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, instructor_id")
    .eq("id", input.projectId)
    .maybeSingle<ProjectRow>();
  if (!project) return { ok: false, message: PROJECT_ERRORS.PROJECT_NOT_FOUND };

  if (!input.force) {
    const verdict = validateTransition(project.status, input.to, {
      instructorId: project.instructor_id,
    });
    if (!verdict.ok) {
      return { ok: false, message: verdict.reason };
    }
  } else {
    if (auth.user?.role !== "admin") {
      return { ok: false, message: "force 전환은 관리자만 가능합니다." };
    }
    console.warn(
      `[admin-override] status transition forced: ${project.status} -> ${input.to} (project=${input.projectId})`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("projects")
    .update({ status: input.to })
    .eq("id", input.projectId);
  if (error) {
    console.error("[transitionStatus] update failed", error);
    return { ok: false, message: "상태 변경에 실패했습니다." };
  }

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}
