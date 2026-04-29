"use server";

// @MX:WARN: SPEC-CONFIRM-001 §M3 — `respondToAssignment` 5-step 보상 트랜잭션.
// @MX:REASON: accepted → declined/conditional 다운그레이드 시 (1) instructor_responses UPDATE
//   (2) projects.status 역방향 전환 (3) schedule_items 하드 DELETE (4) notifications INSERT
//   (5) console.warn 감사 로그 — 중간 실패 시 부분 commit 위험. Supabase JS 단일 트랜잭션 미지원.
// @MX:SPEC: SPEC-CONFIRM-001
//
// REQ-CONFIRM-EFFECTS-001/003/008 — first-response + downgrade 보상 트랜잭션.
// HIGH-2 통합: AMEND-001 ALLOWED_TRANSITIONS 확장 적용 → bypass 함수 미사용 정식 validateTransition.
// HIGH-3 통합: notifications partial UNIQUE → ON CONFLICT DO NOTHING으로 정확히-1 INSERT.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import { validateTransition } from "@/lib/projects/status-machine";
import {
  RESPONSE_ERRORS,
  computeAssignmentAcceptanceEffects,
  computeAssignmentDowngradeEffects,
  isWithinChangeWindow,
  mapResponseToNotificationType,
  respondToAssignmentInputSchema,
  truncateForNotificationBody,
  validateStatusTransition,
  type ResponseActionResult,
  type ResponseStatus,
} from "@/lib/responses";
import {
  getExistingResponseForProject,
  getSelfInstructorId,
} from "@/lib/responses/queries";

const NOTIF_LOG_PREFIX = "[notif]";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  instructor_id: string | null;
  operator_id: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
}

/**
 * 정식 배정 요청 응답 — 첫 응답 / 다운그레이드 보상 분기를 단일 트랜잭션으로 처리.
 *
 * 트랜잭션 step:
 * - First response (기존 응답 row 부재):
 *   1) validateTransition (accepted only)
 *   2) UPSERT instructor_responses
 *   3) (accepted) UPDATE projects + INSERT schedule_items
 *   4) INSERT notifications (ON CONFLICT DO NOTHING)
 *
 * - Downgrade (accepted → declined/conditional, 1시간 윈도 내):
 *   1) validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null }) — AMEND-001 정식 경로
 *   2) UPDATE instructor_responses
 *   3) UPDATE projects (instructor_id=NULL, status=assignment_review) — TOCTOU guard
 *   4) DELETE schedule_items
 *   5) INSERT new notifications
 *   6) console.warn audit
 */
export async function respondToAssignment(input: {
  projectId: string;
  status: ResponseStatus;
  conditionalNote?: string | null;
}): Promise<ResponseActionResult> {
  // 1. 권한 + zod
  const user = await requireRole("instructor");
  const parsed = respondToAssignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue?.message ?? RESPONSE_ERRORS.VALIDATION,
    };
  }
  const { projectId, status, conditionalNote } = parsed.data;

  // 2. self instructor_id 확정
  const instructorId = await getSelfInstructorId(user.id);
  if (!instructorId) {
    return { ok: false, reason: RESPONSE_ERRORS.UNAUTHORIZED };
  }

  const supabase = createClient(await cookies());

  // 3. project 조회 + 사전 검증
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projectData, error: pErr } = await (supabase as any)
    .from("projects")
    .select(
      "id, title, status, instructor_id, operator_id, education_start_at, education_end_at, business_amount_krw",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (pErr || !projectData) {
    return { ok: false, reason: RESPONSE_ERRORS.NOT_FOUND };
  }
  const project = projectData as ProjectRow;

  if (project.instructor_id && project.instructor_id !== instructorId) {
    return { ok: false, reason: RESPONSE_ERRORS.REASSIGNED_AWAY };
  }

  // 4. 기존 응답 확인 (first vs downgrade 분기)
  const existing = await getExistingResponseForProject(projectId, instructorId);
  const fromStatus = existing?.status ?? null;
  const respondedAt = existing?.responded_at
    ? new Date(existing.responded_at)
    : null;

  // 4-1. status transition 검증
  const transition = validateStatusTransition(fromStatus, status);
  if (!transition.ok) {
    return { ok: false, reason: transition.reason };
  }

  // 4-2. 윈도 검증 (변경 시도 시)
  if (existing && !isWithinChangeWindow(respondedAt)) {
    return { ok: false, reason: RESPONSE_ERRORS.WINDOW_EXPIRED };
  }

  // 5. 분기별 처리
  const isFirstResponse = existing === null;
  const isDowngrade =
    !!existing &&
    fromStatus === "accepted" &&
    (status === "declined" || status === "conditional");

  if (status === "accepted" && isFirstResponse) {
    return await acceptFirstResponse({
      project,
      instructorId,
      conditionalNote,
    });
  }

  if (isFirstResponse && status !== "accepted") {
    return await rejectOrConditionalFirstResponse({
      project,
      instructorId,
      status,
      conditionalNote: conditionalNote ?? null,
    });
  }

  if (isDowngrade) {
    return await downgradeResponse({
      project,
      instructorId,
      status,
      conditionalNote: conditionalNote ?? null,
    });
  }

  // 그 외 변경 (declined ↔ conditional, declined → accepted, etc.)
  return await updateResponseInPlace({
    project,
    instructorId,
    status,
    conditionalNote: conditionalNote ?? null,
  });
}

// =============================================================================
// 분기 helper — 트랜잭션 경계는 Supabase JS multi-statement transaction 미지원으로
// 보수적 순차 호출 + 실패 시 보상 UPDATE 패턴 사용 (SPEC-PROJECT-001 일관).
// =============================================================================

interface AssignContext {
  project: ProjectRow;
  instructorId: string;
  status?: ResponseStatus;
  conditionalNote?: string | null;
}

/** 첫 응답: status='accepted' — REQ-CONFIRM-EFFECTS-001 + MEDIUM-4 */
async function acceptFirstResponse(
  ctx: Omit<AssignContext, "status">,
): Promise<ResponseActionResult> {
  const { project, instructorId, conditionalNote } = ctx;

  // MEDIUM-4: validateTransition 호출 (raw UPDATE 직전).
  const verdict = validateTransition(
    project.status as Parameters<typeof validateTransition>[0],
    "assignment_confirmed",
    { instructorId },
  );
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason };
  }

  const supabase = createClient(await cookies());

  // 부수효과 산출
  const effects = computeAssignmentAcceptanceEffects(
    {
      id: project.id,
      status: project.status,
      educationStartAt: project.education_start_at
        ? new Date(project.education_start_at)
        : null,
      educationEndAt: project.education_end_at
        ? new Date(project.education_end_at)
        : null,
      operatorId: project.operator_id,
    },
    instructorId,
  );

  // 1. instructor_responses INSERT (UPSERT — partial UNIQUE on (project_id, instructor_id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supabase as any)
    .from("instructor_responses")
    .insert({
      source_kind: "assignment_request",
      project_id: project.id,
      proposal_inquiry_id: null,
      instructor_id: instructorId,
      status: "accepted",
      conditional_note: conditionalNote ?? null,
    });
  if (insErr) {
    console.error("[respondToAssignment] insert response failed", insErr);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  // 2. projects UPDATE (TOCTOU guard via WHERE status='assignment_review')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: pErr } = await (supabase as any)
    .from("projects")
    .update({
      instructor_id: instructorId,
      status: "assignment_confirmed",
    })
    .eq("id", project.id)
    .eq("status", "assignment_review");
  if (pErr) {
    console.error("[respondToAssignment] update projects failed", pErr);
    // 보상: instructor_responses 삭제
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("instructor_responses")
      .delete()
      .eq("project_id", project.id)
      .eq("instructor_id", instructorId);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  // 3. schedule_items INSERT (REQ-CONFIRM-EFFECTS-006: dates null이면 skip)
  for (const draft of effects.scheduleItems) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: schedErr } = await (supabase as any)
      .from("schedule_items")
      .insert({
        instructor_id: draft.instructorId,
        project_id: draft.projectId,
        schedule_kind: draft.scheduleKind,
        starts_at: draft.startsAt.toISOString(),
        ends_at: draft.endsAt.toISOString(),
      });
    if (schedErr) {
      // EXCLUSION 충돌 등 — 전체 롤백 (REQ-CONFIRM-EFFECTS-005)
      console.error("[respondToAssignment] schedule conflict", schedErr);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("projects")
        .update({
          instructor_id: project.instructor_id,
          status: project.status,
        })
        .eq("id", project.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("instructor_responses")
        .delete()
        .eq("project_id", project.id)
        .eq("instructor_id", instructorId);
      return { ok: false, reason: RESPONSE_ERRORS.SCHEDULE_CONFLICT };
    }
  }

  // 4. notifications INSERT (HIGH-3: partial UNIQUE → ON CONFLICT DO NOTHING via upsert)
  await insertNotificationIdempotent({
    recipientId: project.operator_id,
    notifType: mapResponseToNotificationType("assignment_request", "accepted"),
    sourceKind: "assignment_request",
    sourceId: project.id,
    title: `강사 응답: ${project.title} 수락`,
    body: buildAcceptedBody({
      projectTitle: project.title,
      conditionalNote: null,
    }),
    linkUrl: `/projects/${project.id}`,
    logContext: `operator_id=${project.operator_id ?? "unknown"} source_id=${project.id}`,
  });

  if (effects.scheduleSkippedReason) {
    console.warn(
      `[respondToAssignment] schedule_items skipped — ${effects.scheduleSkippedReason} project_id=${project.id}`,
    );
  }

  revalidatePath("/me/assignments");
  revalidatePath(`/projects/${project.id}`);
  return { ok: true };
}

/** 첫 응답: status='declined' | 'conditional' — REQ-CONFIRM-EFFECTS-003 */
async function rejectOrConditionalFirstResponse(ctx: AssignContext): Promise<ResponseActionResult> {
  const { project, instructorId, status, conditionalNote } = ctx;
  if (!status) return { ok: false, reason: RESPONSE_ERRORS.VALIDATION };

  const supabase = createClient(await cookies());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supabase as any)
    .from("instructor_responses")
    .insert({
      source_kind: "assignment_request",
      project_id: project.id,
      proposal_inquiry_id: null,
      instructor_id: instructorId,
      status,
      conditional_note: conditionalNote ?? null,
    });
  if (insErr) {
    console.error("[respondToAssignment.first-decline] insert failed", insErr);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  await insertNotificationIdempotent({
    recipientId: project.operator_id,
    notifType: mapResponseToNotificationType("assignment_request", status),
    sourceKind: "assignment_request",
    sourceId: project.id,
    title: `강사 응답: ${project.title} ${status === "declined" ? "거절" : "조건부"}`,
    body: buildRejectionBody({
      projectTitle: project.title,
      status,
      conditionalNote: conditionalNote ?? null,
    }),
    linkUrl: `/projects/${project.id}`,
    logContext: `operator_id=${project.operator_id ?? "unknown"} source_id=${project.id}`,
  });

  revalidatePath("/me/assignments");
  return { ok: true };
}

/** 다운그레이드: accepted → declined/conditional (1시간 윈도 내) — REQ-CONFIRM-EFFECTS-008 (HIGH-2) */
async function downgradeResponse(ctx: AssignContext): Promise<ResponseActionResult> {
  const { project, instructorId, status, conditionalNote } = ctx;
  if (!status) return { ok: false, reason: RESPONSE_ERRORS.VALIDATION };

  // AMEND-001: ALLOWED_TRANSITIONS 확장으로 정식 경로 통과 (bypass 함수 미사용).
  const verdict = validateTransition(
    "assignment_confirmed",
    "assignment_review",
    { instructorId: null },
  );
  if (!verdict.ok) {
    // 본 경로는 AMEND-001 적용 후 절대 도달하지 않음. 안전망.
    console.error(
      `[respondToAssignment.downgrade] AMEND-001 미적용 의심: ${verdict.reason}`,
    );
    return { ok: false, reason: RESPONSE_ERRORS.PROJECT_TRANSITION_BLOCKED };
  }

  const supabase = createClient(await cookies());

  const dgEffects = computeAssignmentDowngradeEffects(project.id, instructorId);

  // step 1: instructor_responses UPDATE (BEFORE UPDATE trigger가 updated_at 갱신)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: respErr } = await (supabase as any)
    .from("instructor_responses")
    .update({
      status,
      conditional_note: conditionalNote ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("project_id", project.id)
    .eq("instructor_id", instructorId);
  if (respErr) {
    console.error("[respondToAssignment.downgrade] response update failed", respErr);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  // step 2: projects reset (TOCTOU guard)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: pErr } = await (supabase as any)
    .from("projects")
    .update({
      instructor_id: dgEffects.nextInstructorId,
      status: dgEffects.nextStatus,
    })
    .eq("id", project.id)
    .eq("status", "assignment_confirmed");
  if (pErr) {
    console.error("[respondToAssignment.downgrade] projects reset failed", pErr);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  // step 3: schedule_items DELETE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: schedErr } = await (supabase as any)
    .from("schedule_items")
    .delete()
    .eq("project_id", dgEffects.scheduleDeleteFilter.projectId)
    .eq("instructor_id", dgEffects.scheduleDeleteFilter.instructorId)
    .eq("schedule_kind", dgEffects.scheduleDeleteFilter.scheduleKind);
  if (schedErr) {
    console.error("[respondToAssignment.downgrade] schedule delete failed", schedErr);
    // 비차단 — 트랜잭션 commit 진행
  }

  // step 4: 새 notifications INSERT
  await insertNotificationIdempotent({
    recipientId: project.operator_id,
    notifType: mapResponseToNotificationType("assignment_request", status),
    sourceKind: "assignment_request",
    sourceId: project.id,
    title: `강사 응답 변경: ${project.title} ${status === "declined" ? "거절" : "조건부"}`,
    body: buildRejectionBody({
      projectTitle: project.title,
      status,
      conditionalNote: conditionalNote ?? null,
    }),
    linkUrl: `/projects/${project.id}`,
    logContext: `operator_id=${project.operator_id ?? "unknown"} source_id=${project.id}`,
  });

  // step 5: console.warn audit (REQ-CONFIRM-EFFECTS-008)
  console.warn(
    `[response:downgrade] project_id=${project.id} instructor_id=${instructorId} from=accepted to=${status}`,
  );

  revalidatePath("/me/assignments");
  revalidatePath(`/projects/${project.id}`);
  return { ok: true };
}

/** 기타 변경: declined ↔ conditional, declined → accepted (drum) */
async function updateResponseInPlace(ctx: AssignContext): Promise<ResponseActionResult> {
  const { project, instructorId, status, conditionalNote } = ctx;
  if (!status) return { ok: false, reason: RESPONSE_ERRORS.VALIDATION };

  // declined → accepted는 새 schedule 생성 + projects forward 전환 필요
  // (현 SPEC 범위에서는 단순화: 다운그레이드 + accepted 전환은 forward edge로 처리)
  if (status === "accepted") {
    // forward edge: declined/conditional → accepted
    // 기존 응답 row는 존재하므로 status만 UPDATE + accept 부수효과 재적용
    return await acceptFirstResponse({
      project,
      instructorId,
      conditionalNote,
    });
  }

  // declined ↔ conditional 단순 변경 (projects, schedule_items 무변경)
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: respErr } = await (supabase as any)
    .from("instructor_responses")
    .update({
      status,
      conditional_note: conditionalNote ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("project_id", project.id)
    .eq("instructor_id", instructorId);
  if (respErr) {
    console.error("[respondToAssignment.update] failed", respErr);
    return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
  }

  await insertNotificationIdempotent({
    recipientId: project.operator_id,
    notifType: mapResponseToNotificationType("assignment_request", status),
    sourceKind: "assignment_request",
    sourceId: project.id,
    title: `강사 응답 변경: ${project.title}`,
    body: buildRejectionBody({
      projectTitle: project.title,
      status,
      conditionalNote: conditionalNote ?? null,
    }),
    linkUrl: `/projects/${project.id}`,
    logContext: `operator_id=${project.operator_id ?? "unknown"} source_id=${project.id}`,
  });

  revalidatePath("/me/assignments");
  return { ok: true };
}

// =============================================================================
// notification helper — HIGH-3: partial UNIQUE → ON CONFLICT DO NOTHING via upsert
// =============================================================================

async function insertNotificationIdempotent(args: {
  recipientId: string | null;
  notifType:
    | "assignment_accepted"
    | "assignment_declined"
    | "inquiry_accepted"
    | "inquiry_declined"
    | "inquiry_conditional";
  sourceKind: "assignment_request" | "proposal_inquiry";
  sourceId: string;
  title: string;
  body: string;
  linkUrl: string;
  logContext: string;
}): Promise<void> {
  const {
    recipientId,
    notifType,
    sourceKind,
    sourceId,
    title,
    body,
    linkUrl,
    logContext,
  } = args;

  if (!recipientId) {
    console.warn(
      `[notif:skip] ${notifType} → recipient unresolved source_id=${sourceId}`,
    );
    return;
  }

  const supabase = createClient(await cookies());

  // partial UNIQUE on (recipient_id, source_kind, source_id, type).
  // ON CONFLICT (recipient_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL
  //   AND source_id IS NOT NULL DO NOTHING.
  // supabase-js .upsert에서 onConflict 표현은 partial UNIQUE도 사용 가능.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("notifications").upsert(
    {
      recipient_id: recipientId,
      type: notifType,
      title,
      body: truncateForNotificationBody(body),
      link_url: linkUrl,
      source_kind: sourceKind,
      source_id: sourceId,
    },
    {
      onConflict: "recipient_id,source_kind,source_id,type",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    console.error("[notif] insert failed", { type: notifType, error });
    return;
  }

  console.log(`${NOTIF_LOG_PREFIX} ${notifType} → ${logContext}`);
}

// =============================================================================
// body builder
// =============================================================================

function buildAcceptedBody(args: {
  projectTitle: string;
  conditionalNote: string | null;
}): string {
  return `프로젝트 "${args.projectTitle}" 배정 요청을 수락하였습니다.`;
}

function buildRejectionBody(args: {
  projectTitle: string;
  status: ResponseStatus;
  conditionalNote: string | null;
}): string {
  const head =
    args.status === "declined"
      ? `프로젝트 "${args.projectTitle}" 배정 요청을 거절하였습니다.`
      : `[조건부] 프로젝트 "${args.projectTitle}" 배정 요청에 조건부 응답하였습니다.`;
  if (args.conditionalNote) {
    return `${head}\n${args.conditionalNote}`;
  }
  return head;
}
