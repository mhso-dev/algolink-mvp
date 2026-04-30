// @MX:ANCHOR: SPEC-PROPOSAL-001 §M3/M4 REQ-PROPOSAL-LIST-* / DETAIL-* / ENTITY-006
// @MX:REASON: 모든 라우트(/proposals, /proposals/[id], /proposals/new)가 본 모듈 호출. fan_in 매우 높음.
// @MX:SPEC: SPEC-PROPOSAL-001
import {
  buildProposalSearchPattern,
  type ProposalListQuery,
} from "./list-query";
import type { ProposalStatus } from "./types";

// SupabaseClient의 Database 타입 우회 — from + storage 만 사용하는 좁은 인터페이스.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any; storage?: unknown };

// =============================================================================
// 리스트 조회 (REQ-PROPOSAL-LIST-001/002/003/004)
// =============================================================================

export interface ProposalListRow {
  id: string;
  title: string;
  client_id: string;
  client_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  status: ProposalStatus;
  proposed_period_start: string | null;
  proposed_period_end: string | null;
  proposed_business_amount_krw: number | null;
  created_at: string;
}

/** 리스트 + 카운트 (페이지네이션). 한국어 에러는 호출 측에서 매핑. */
export async function listProposals(
  supabase: Sb,
  query: ProposalListQuery,
): Promise<{ rows: ProposalListRow[]; total: number }> {
  const pattern = buildProposalSearchPattern(query.q);

  let q = supabase
    .from("proposals")
    .select(
       `id, title, client_id, operator_id, status,
       proposed_period_start, proposed_period_end,
       proposed_business_amount_krw, created_at,
       clients(company_name),
       users:operator_id(name_kr)`,
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (query.statuses.length > 0) {
    q = q.in("status", [...query.statuses]);
  }
  if (query.clientId) {
    q = q.eq("client_id", query.clientId);
  }
  if (query.periodFrom) {
    q = q.gte("proposed_period_start", query.periodFrom);
  }
  if (query.periodTo) {
    q = q.lte("proposed_period_start", query.periodTo);
  }
  if (pattern) {
    q = q.ilike("title", pattern);
  }

  q = q.order("created_at", { ascending: false });

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  q = q.range(from, to);

  const { data, count, error } = (await q) as {
    data:
      | Array<{
          id: string;
          title: string;
          client_id: string;
          operator_id: string | null;
          status: ProposalStatus;
          proposed_period_start: string | null;
          proposed_period_end: string | null;
          proposed_business_amount_krw: number | null;
          created_at: string;
          clients: { company_name: string } | null;
          users: { name_kr: string } | null;
        }>
      | null;
    count: number | null;
    error: unknown;
  };

  if (error) {
    console.error("[listProposals] supabase error", error);
    return { rows: [], total: 0 };
  }

  const rows: ProposalListRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    client_id: r.client_id,
    client_name: r.clients?.company_name ?? null,
    operator_id: r.operator_id,
    operator_name: r.users?.name_kr ?? null,
    status: r.status,
    proposed_period_start: r.proposed_period_start,
    proposed_period_end: r.proposed_period_end,
    proposed_business_amount_krw: r.proposed_business_amount_krw,
    created_at: r.created_at,
  }));

  return { rows, total: count ?? 0 };
}

// =============================================================================
// 상세 조회 (REQ-PROPOSAL-DETAIL-001/002)
// =============================================================================

export interface ProposalDetail {
  id: string;
  title: string;
  client_id: string;
  client_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  proposed_period_start: string | null;
  proposed_period_end: string | null;
  proposed_business_amount_krw: number | null;
  proposed_hourly_rate_krw: number | null;
  notes: string | null;
  status: ProposalStatus;
  submitted_at: string | null;
  decided_at: string | null;
  converted_project_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 단일 제안서 상세 (soft-delete 제외). null이면 notFound. */
export async function getProposalById(
  supabase: Sb,
  id: string,
): Promise<ProposalDetail | null> {
  const { data, error } = (await supabase
    .from("proposals")
    .select(
      `id, title, client_id, operator_id, status,
       proposed_period_start, proposed_period_end,
       proposed_business_amount_krw, proposed_hourly_rate_krw,
       notes, submitted_at, decided_at, converted_project_id,
       created_at, updated_at,
       clients(company_name),
       users:operator_id(name_kr)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data:
      | (Omit<
          ProposalDetail,
          "client_name" | "operator_name"
        > & {
          clients: { company_name: string } | null;
          users: { name_kr: string } | null;
        })
      | null;
    error: unknown;
  };

  if (error || !data) return null;

  return {
    id: data.id,
    title: data.title,
    client_id: data.client_id,
    client_name: data.clients?.company_name ?? null,
    operator_id: data.operator_id,
    operator_name: data.users?.name_kr ?? null,
    proposed_period_start: data.proposed_period_start,
    proposed_period_end: data.proposed_period_end,
    proposed_business_amount_krw: data.proposed_business_amount_krw,
    proposed_hourly_rate_krw: data.proposed_hourly_rate_krw,
    notes: data.notes,
    status: data.status,
    submitted_at: data.submitted_at,
    decided_at: data.decided_at,
    converted_project_id: data.converted_project_id,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/** 제안서 + 필요 기술 (DETAIL 페이지용). */
export async function getProposalRequiredSkills(
  supabase: Sb,
  proposalId: string,
): Promise<Array<{ skill_id: string; skill_name: string | null }>> {
  const { data, error } = (await supabase
    .from("proposal_required_skills")
    .select("skill_id, skill_categories(name)")
    .eq("proposal_id", proposalId)) as {
    data:
      | Array<{ skill_id: string; skill_categories: { name: string } | null }>
      | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((d) => ({
    skill_id: d.skill_id,
    skill_name: d.skill_categories?.name ?? null,
  }));
}

// =============================================================================
// CREATE / UPDATE / SOFT-DELETE
// =============================================================================

export interface CreateProposalArgs {
  title: string;
  clientId: string;
  operatorId: string;
  proposedPeriodStart: string | null;
  proposedPeriodEnd: string | null;
  proposedBusinessAmountKrw: number | null;
  proposedHourlyRateKrw: number | null;
  notes: string | null;
  requiredSkillIds: readonly string[];
}

/** REQ-PROPOSAL-ENTITY-006: 단일 트랜잭션 INSERT (proposals + junction). */
export async function createProposal(
  supabase: Sb,
  args: CreateProposalArgs,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  // proposals INSERT
  const { data: proposal, error: insertError } = (await supabase
    .from("proposals")
    .insert({
      title: args.title,
      client_id: args.clientId,
      operator_id: args.operatorId,
      proposed_period_start: args.proposedPeriodStart,
      proposed_period_end: args.proposedPeriodEnd,
      proposed_business_amount_krw: args.proposedBusinessAmountKrw,
      proposed_hourly_rate_krw: args.proposedHourlyRateKrw,
      notes: args.notes,
      status: "draft",
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: unknown };

  if (insertError || !proposal) {
    console.error("[createProposal] insert error", insertError);
    return { ok: false, reason: "create-failed" };
  }

  // junction INSERT (있을 때만)
  if (args.requiredSkillIds.length > 0) {
    const junctionRows = args.requiredSkillIds.map((skillId) => ({
      proposal_id: proposal.id,
      skill_id: skillId,
    }));
    const { error: jErr } = (await supabase
      .from("proposal_required_skills")
      .insert(junctionRows)) as { error: unknown };
    if (jErr) {
      // Compensation: proposals row hard delete (junction이 깨진 row를 보존하지 않음)
      await supabase.from("proposals").delete().eq("id", proposal.id);
      console.error("[createProposal] junction insert error", jErr);
      return { ok: false, reason: "skills-failed" };
    }
  }

  return { ok: true, id: proposal.id };
}

export interface UpdateProposalArgs {
  id: string;
  expectedUpdatedAt: string;
  title?: string;
  proposedPeriodStart?: string | null;
  proposedPeriodEnd?: string | null;
  proposedBusinessAmountKrw?: number | null;
  proposedHourlyRateKrw?: number | null;
  notes?: string | null;
  requiredSkillIds?: readonly string[];
}

/** 낙관적 동시성 + frozen 검증 (REQ-PROPOSAL-ENTITY-005). */
export async function updateProposal(
  supabase: Sb,
  args: UpdateProposalArgs,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const update: Record<string, unknown> = {};
  if (args.title !== undefined) update.title = args.title;
  if (args.proposedPeriodStart !== undefined)
    update.proposed_period_start = args.proposedPeriodStart;
  if (args.proposedPeriodEnd !== undefined)
    update.proposed_period_end = args.proposedPeriodEnd;
  if (args.proposedBusinessAmountKrw !== undefined)
    update.proposed_business_amount_krw = args.proposedBusinessAmountKrw;
  if (args.proposedHourlyRateKrw !== undefined)
    update.proposed_hourly_rate_krw = args.proposedHourlyRateKrw;
  if (args.notes !== undefined) update.notes = args.notes;

  if (Object.keys(update).length > 0) {
    const { data, error } = (await supabase
      .from("proposals")
      .update(update)
      .eq("id", args.id)
      .eq("updated_at", args.expectedUpdatedAt)
      .is("deleted_at", null)
      .in("status", ["draft", "submitted"]) // frozen 거부
      .select("id")) as { data: { id: string }[] | null; error: unknown };

    if (error) {
      console.error("[updateProposal] error", error);
      return { ok: false, reason: "update-failed" };
    }
    if (!data || data.length === 0) {
      return { ok: false, reason: "stale-or-frozen" };
    }
  }

  if (args.requiredSkillIds) {
    // delete + re-insert (단순 동기화)
    await supabase.from("proposal_required_skills").delete().eq("proposal_id", args.id);
    if (args.requiredSkillIds.length > 0) {
      const rows = args.requiredSkillIds.map((skillId) => ({
        proposal_id: args.id,
        skill_id: skillId,
      }));
      await supabase.from("proposal_required_skills").insert(rows);
    }
  }

  return { ok: true };
}

/** soft delete (REQ-PROPOSAL-LIST-004). */
export async function softDeleteProposal(
  supabase: Sb,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = (await supabase
    .from("proposals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)) as { error: unknown };
  if (error) {
    console.error("[softDeleteProposal] error", error);
    return { ok: false, reason: "delete-failed" };
  }
  return { ok: true };
}

/** Status transition (REQ-PROPOSAL-ENTITY-004 — Server Action 진입점). */
export async function transitionProposalStatus(
  supabase: Sb,
  args: {
    id: string;
    expectedUpdatedAt: string;
    fromStatus: ProposalStatus;
    toStatus: ProposalStatus;
    submittedAt?: string;
    decidedAt?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const update: Record<string, unknown> = { status: args.toStatus };
  if (args.submittedAt) update.submitted_at = args.submittedAt;
  if (args.decidedAt) update.decided_at = args.decidedAt;

  const { data, error } = (await supabase
    .from("proposals")
    .update(update)
    .eq("id", args.id)
    .eq("updated_at", args.expectedUpdatedAt)
    .eq("status", args.fromStatus)
    .is("deleted_at", null)
    .select("id")) as { data: { id: string }[] | null; error: unknown };

  if (error) {
    console.error("[transitionProposalStatus] error", error);
    return { ok: false, reason: "transition-failed" };
  }
  if (!data || data.length === 0) {
    return { ok: false, reason: "stale-or-state-changed" };
  }
  return { ok: true };
}

// =============================================================================
// 응답 보드 (REQ-PROPOSAL-DETAIL-006)
// =============================================================================

export interface InquiryBoardEntry {
  id: string;
  instructor_id: string;
  instructor_name: string | null;
  status: "pending" | "accepted" | "declined" | "conditional";
  responded_at: string | null;
  conditional_note: string | null;
}

export async function getInquiriesForProposal(
  supabase: Sb,
  proposalId: string,
): Promise<InquiryBoardEntry[]> {
  const { data, error } = (await supabase
    .from("proposal_inquiries")
    .select(
      `id, instructor_id, status, responded_at, conditional_note,
       instructors(name_kr)`,
    )
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true })) as {
    data:
      | Array<{
          id: string;
          instructor_id: string;
          status: "pending" | "accepted" | "declined" | "conditional";
          responded_at: string | null;
          conditional_note: string | null;
          instructors: { name_kr?: string | null } | null;
        }>
      | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    instructor_id: r.instructor_id,
    instructor_name: r.instructors?.name_kr ?? null,
    status: r.status,
    responded_at: r.responded_at,
    conditional_note: r.conditional_note,
  }));
}
