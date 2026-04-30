"use server";

// @MX:ANCHOR: SPEC-PROPOSAL-001 §M6 REQ-PROPOSAL-CONVERT-001/002/003/004/007 — Won → Project 변환 Server Action.
// @MX:REASON: canonical 6-step 변환. 멱등성 + race condition 방어가 필수.
// @MX:WARN: Supabase JS multi-statement transaction 미지원 — 순차 호출 + 보상 패턴.
// @MX:REASON: REQ-PROPOSAL-CONVERT-007 READ COMMITTED + 멱등성은 atomic UPDATE WHERE converted_project_id IS NULL로 직렬화.
// @MX:SPEC: SPEC-PROPOSAL-001
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";

// Supabase Database 타입에 신규 테이블이 아직 미반영 — narrow 인터페이스로 우회.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any };
import {
  buildAcceptedRecommendationFromInquiries,
  buildProjectFromProposal,
} from "@/lib/proposals/convert";
import type { ProposalRecord } from "@/lib/proposals/types";
import { PROPOSAL_ERRORS } from "@/lib/proposals/errors";

export type ConvertResult =
  | { ok: true; projectId: string; idempotent: boolean }
  | { ok: false; message: string };

interface ConvertInput {
  proposalId: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOnlyBoundaryToIso(
  value: string | null,
  boundary: "start" | "end",
): string | null {
  if (!value) return null;
  if (!DATE_ONLY_RE.test(value)) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const offsetDays = boundary === "end" ? 1 : 0;
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString();
}

export async function convertProposalToProjectAction(
  input: ConvertInput,
): Promise<ConvertResult> {
  await requireUser();
  const supabase = createClient(await cookies()) as unknown as Sb;

  // -------------------------------------------------------------------------
  // Step 1+2: 행 잠금 시뮬레이션 + 멱등 / 상태 체크
  //
  // Supabase JS는 multi-statement transaction (BEGIN/COMMIT)을 직접 지원하지 않는다.
  // 본 SPEC §5.4의 SELECT ... FOR UPDATE 행 잠금은 PG의 atomic UPDATE WHERE 절로
  // 동등한 직렬화 보장: `UPDATE proposals SET converted_project_id = NEW
  //   WHERE id = $1 AND converted_project_id IS NULL AND status = 'submitted'`
  // 두 동시 호출 중 한 호출만 1 row affected; 나머지는 0 row → 멱등 분기.
  // -------------------------------------------------------------------------

  const { data: proposal, error: selectErr } = (await supabase
    .from("proposals")
    .select(
      `id, title, client_id, operator_id, status,
       proposed_period_start, proposed_period_end,
       proposed_business_amount_krw, proposed_hourly_rate_krw,
       notes, submitted_at, decided_at, converted_project_id`,
    )
    .eq("id", input.proposalId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data:
      | {
          id: string;
          title: string;
          client_id: string;
          operator_id: string;
          status: string;
          proposed_period_start: string | null;
          proposed_period_end: string | null;
          proposed_business_amount_krw: number | null;
          proposed_hourly_rate_krw: number | null;
          notes: string | null;
          submitted_at: string | null;
          decided_at: string | null;
          converted_project_id: string | null;
        }
      | null;
    error: unknown;
  };

  if (selectErr || !proposal) {
    return { ok: false, message: PROPOSAL_ERRORS.PROPOSAL_NOT_FOUND };
  }

  // 멱등성 (REQ-PROPOSAL-CONVERT-003): converted_project_id 이미 set
  if (proposal.converted_project_id) {
    revalidatePath(`/proposals/${input.proposalId}`);
    return {
      ok: true,
      projectId: proposal.converted_project_id,
      idempotent: true,
    };
  }

  // 상태 체크 (REQ-PROPOSAL-CONVERT-002): submitted 만 허용
  if (proposal.status !== "submitted") {
    return { ok: false, message: PROPOSAL_ERRORS.CONVERT_NEED_SUBMITTED };
  }

  // -------------------------------------------------------------------------
  // Step 3: projects INSERT
  // -------------------------------------------------------------------------
  const proposalRecord: ProposalRecord = {
    id: proposal.id,
    title: proposal.title,
    clientId: proposal.client_id,
    operatorId: proposal.operator_id,
    proposedPeriodStart: proposal.proposed_period_start,
    proposedPeriodEnd: proposal.proposed_period_end,
    proposedBusinessAmountKrw: proposal.proposed_business_amount_krw,
    proposedHourlyRateKrw: proposal.proposed_hourly_rate_krw,
    notes: proposal.notes,
    status: "submitted",
    submittedAt: proposal.submitted_at,
    decidedAt: proposal.decided_at,
    convertedProjectId: null,
  };
  const projectInsert = buildProjectFromProposal(proposalRecord);
  const educationStartAt = dateOnlyBoundaryToIso(projectInsert.startDate, "start");
  const educationEndAt = dateOnlyBoundaryToIso(projectInsert.endDate, "end");

  const { data: newProject, error: projectErr } = (await supabase
    .from("projects")
    .insert({
      title: projectInsert.title,
      client_id: projectInsert.clientId,
      operator_id: projectInsert.operatorId,
      // SPEC-PROJECT-001 컬럼 매핑: scheduled_at은 시작일 기반 단순화
      scheduled_at: projectInsert.startDate,
      education_start_at: educationStartAt,
      education_end_at: educationEndAt,
      business_amount_krw: projectInsert.businessAmountKrw,
      instructor_fee_krw: projectInsert.instructorFeeKrw,
      hourly_rate_krw: 0,
      instructor_share_pct: 0,
      status: projectInsert.status,
      instructor_id: projectInsert.instructorId,
      project_type: projectInsert.projectType,
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: unknown };

  if (projectErr || !newProject) {
    console.error("[convertProposalToProjectAction] project insert", projectErr);
    return { ok: false, message: PROPOSAL_ERRORS.CONVERT_FAILED_GENERIC };
  }

  const newProjectId = newProject.id;

  // -------------------------------------------------------------------------
  // Step 4: project_required_skills 복사
  // -------------------------------------------------------------------------
  const { data: requiredSkills } = (await supabase
    .from("proposal_required_skills")
    .select("skill_id")
    .eq("proposal_id", input.proposalId)) as {
    data: Array<{ skill_id: string }> | null;
  };

  if (requiredSkills && requiredSkills.length > 0) {
    const rows = requiredSkills.map((s) => ({
      project_id: newProjectId,
      skill_id: s.skill_id,
    }));
    const { error: skillErr } = (await supabase
      .from("project_required_skills")
      .insert(rows)) as { error: unknown };
    if (skillErr) {
      console.error("[convertProposalToProjectAction] skills copy", skillErr);
      // 보상: 신규 project 삭제
      await supabase.from("projects").delete().eq("id", newProjectId);
      return { ok: false, message: PROPOSAL_ERRORS.CONVERT_FAILED_GENERIC };
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: ai_instructor_recommendations INSERT (accepted ≥ 1 시)
  // -------------------------------------------------------------------------
  const { data: acceptedRows } = (await supabase
    .from("proposal_inquiries")
    .select("id, instructor_id, responded_at")
    .eq("proposal_id", input.proposalId)
    .eq("status", "accepted")
    .order("responded_at", { ascending: true })) as {
    data: Array<{
      id: string;
      instructor_id: string;
      responded_at: string | null;
    }> | null;
  };

  const recommendationInsert = buildAcceptedRecommendationFromInquiries(
    newProjectId,
    (acceptedRows ?? []).map((r) => ({
      inquiryId: r.id,
      instructorId: r.instructor_id,
      respondedAt: r.responded_at,
    })),
  );

  if (recommendationInsert) {
    const { error: recErr } = (await supabase
      .from("ai_instructor_recommendations")
      .insert({
        project_id: recommendationInsert.projectId,
        top3_jsonb: recommendationInsert.top3Jsonb,
        model: recommendationInsert.model,
        adopted_instructor_id: recommendationInsert.adoptedInstructorId,
      })) as { error: unknown };
    if (recErr) {
      console.error("[convertProposalToProjectAction] rec insert", recErr);
      // 추천 row 실패는 변환 자체는 성공 처리 (best-effort)
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: proposals UPDATE (atomic — 멱등성 race 방어)
  // converted_project_id IS NULL 가드로 race condition 직렬화.
  // -------------------------------------------------------------------------
  const { data: updated, error: updErr } = (await supabase
    .from("proposals")
    .update({
      status: "won",
      decided_at: new Date().toISOString(),
      converted_project_id: newProjectId,
    })
    .eq("id", input.proposalId)
    .is("converted_project_id", null) // race condition guard
    .eq("status", "submitted")
    .select("id, converted_project_id")) as {
    data: Array<{ id: string; converted_project_id: string | null }> | null;
    error: unknown;
  };

  if (updErr) {
    console.error("[convertProposalToProjectAction] update error", updErr);
    return { ok: false, message: PROPOSAL_ERRORS.CONVERT_FAILED_GENERIC };
  }

  if (!updated || updated.length === 0) {
    // Race lost: 다른 트랜잭션이 먼저 변환 — 멱등 처리
    // 신규 project 보상 삭제
    await supabase
      .from("project_required_skills")
      .delete()
      .eq("project_id", newProjectId);
    await supabase
      .from("ai_instructor_recommendations")
      .delete()
      .eq("project_id", newProjectId);
    await supabase.from("projects").delete().eq("id", newProjectId);

    // 다른 트랜잭션의 결과 조회
    const { data: existing } = (await supabase
      .from("proposals")
      .select("converted_project_id")
      .eq("id", input.proposalId)
      .maybeSingle()) as {
      data: { converted_project_id: string | null } | null;
    };

    if (existing?.converted_project_id) {
      revalidatePath(`/proposals/${input.proposalId}`);
      return {
        ok: true,
        projectId: existing.converted_project_id,
        idempotent: true,
      };
    }
    return { ok: false, message: PROPOSAL_ERRORS.CONVERT_FAILED_GENERIC };
  }

  revalidatePath(`/proposals/${input.proposalId}`);
  revalidatePath("/proposals");
  revalidatePath("/projects");

  return { ok: true, projectId: newProjectId, idempotent: false };
}
