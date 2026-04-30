// SPEC-CONFIRM-001 §M3 — 응답 도메인 query 모듈 (server-only).
// RLS는 user-scoped Supabase client만 사용 (SUPABASE_SERVICE_ROLE_KEY 미사용).

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { ResponseStatus } from "../types";

export interface ExistingResponseRow {
  id: string;
  status: ResponseStatus;
  conditional_note: string | null;
  responded_at: string;
  source_kind: string;
  project_id: string | null;
  proposal_inquiry_id: string | null;
  instructor_id: string;
}

/**
 * 강사 본인 instructor_id 조회 (auth.uid() → instructors.user_id).
 * 응답 Server Action에서 self instructor_id 확정용.
 */
export async function getSelfInstructorId(userId: string): Promise<string | null> {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("instructors")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();
  if (error || !data) return null;
  return data.id;
}

/**
 * 특정 (project, instructor) 조합의 기존 응답 조회.
 * REQ-CONFIRM-EFFECTS-008 (HIGH-2) — first-response vs downgrade 분기 결정용.
 */
export async function getExistingResponseForProject(
  projectId: string,
  instructorId: string,
): Promise<ExistingResponseRow | null> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("instructor_responses")
    .select(
      "id, status, conditional_note, responded_at, source_kind, project_id, proposal_inquiry_id, instructor_id",
    )
    .eq("project_id", projectId)
    .eq("instructor_id", instructorId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ExistingResponseRow;
}

/**
 * 특정 (proposal_inquiry, instructor) 조합의 기존 응답 조회.
 */
export async function getExistingResponseForInquiry(
  inquiryId: string,
  instructorId: string,
): Promise<ExistingResponseRow | null> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("instructor_responses")
    .select(
      "id, status, conditional_note, responded_at, source_kind, project_id, proposal_inquiry_id, instructor_id",
    )
    .eq("proposal_inquiry_id", inquiryId)
    .eq("instructor_id", instructorId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ExistingResponseRow;
}

export interface AssignmentRequestRow {
  id: string; // project id
  title: string;
  status: string;
  instructor_id: string | null;
  operator_id: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  client_company_name: string | null;
  request_created_at: string | null;
  response_status: ResponseStatus | null;
  response_responded_at: string | null;
  response_conditional_note: string | null;
}

/**
 * 강사 본인의 정식 배정 요청 inbox.
 * RLS가 instructor 본인 row만 반환하도록 자동 필터.
 */
export async function getMyAssignmentRequests(
  instructorId: string,
): Promise<AssignmentRequestRow[]> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("projects")
    .select(
      `id, title, status, instructor_id, operator_id, education_start_at, education_end_at,
       business_amount_krw,
       clients:client_id ( company_name )`,
    )
    .eq("instructor_id", instructorId)
    .in("status", ["assignment_review", "assignment_confirmed"])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[getMyAssignmentRequests] projects select failed", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.id);

  // 응답 조회 (LEFT JOIN 대체 — RLS user-scoped 일관 처리).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: respData } = await (supabase as any)
    .from("instructor_responses")
    .select("project_id, status, responded_at, conditional_note")
    .eq("instructor_id", instructorId)
    .in("project_id", projectIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respRows = (respData ?? []) as any[];

  // 최신 assignment_request notification 조회.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifData } = await (supabase as any)
    .from("notifications")
    .select("source_id, created_at")
    .eq("type", "assignment_request")
    .in("source_id", projectIds)
    .order("created_at", { ascending: false });
  const notifMap = new Map<string, string>();
  for (const n of (notifData ?? []) as Array<{ source_id: string | null; created_at: string }>) {
    if (typeof n.source_id === "string" && !notifMap.has(n.source_id)) {
      notifMap.set(n.source_id, n.created_at);
    }
  }

  return rows.map((p) => {
    const resp = respRows.find((r) => r.project_id === p.id);
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      instructor_id: p.instructor_id,
      operator_id: p.operator_id,
      education_start_at: p.education_start_at,
      education_end_at: p.education_end_at,
      business_amount_krw: p.business_amount_krw ?? 0,
      client_company_name: p.clients?.company_name ?? null,
      request_created_at: notifMap.get(p.id) ?? null,
      response_status: (resp?.status as ResponseStatus | undefined) ?? null,
      response_responded_at: resp?.responded_at ?? null,
      response_conditional_note: resp?.conditional_note ?? null,
    };
  });
}

export interface InquiryRow {
  id: string;
  proposal_id: string | null;
  status: string;
  operator_id: string | null;
  proposed_time_slot_start: string | null;
  proposed_time_slot_end: string | null;
  question_note: string | null;
  created_at: string;
  response_status: ResponseStatus | null;
  response_responded_at: string | null;
  response_conditional_note: string | null;
}

/**
 * 강사 본인의 사전 가용성 문의 inbox.
 */
export async function getMyInquiries(instructorId: string): Promise<InquiryRow[]> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("proposal_inquiries")
    .select(
      "id, proposal_id, status, operator_id, proposed_time_slot_start, proposed_time_slot_end, question_note, created_at",
    )
    .eq("instructor_id", instructorId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyInquiries] proposal_inquiries select failed", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const inquiryIds = rows.map((r) => r.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: respData } = await (supabase as any)
    .from("instructor_responses")
    .select("proposal_inquiry_id, status, responded_at, conditional_note")
    .eq("instructor_id", instructorId)
    .in("proposal_inquiry_id", inquiryIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respRows = (respData ?? []) as any[];

  return rows.map((q) => {
    const resp = respRows.find((r) => r.proposal_inquiry_id === q.id);
    return {
      id: q.id,
      proposal_id: q.proposal_id,
      status: q.status,
      operator_id: q.operator_id,
      proposed_time_slot_start: q.proposed_time_slot_start,
      proposed_time_slot_end: q.proposed_time_slot_end,
      question_note: q.question_note,
      created_at: q.created_at,
      response_status: (resp?.status as ResponseStatus | undefined) ?? null,
      response_responded_at: resp?.responded_at ?? null,
      response_conditional_note: resp?.conditional_note ?? null,
    };
  });
}
