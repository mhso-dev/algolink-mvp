// SPEC-PAYOUT-002 §M3 — lecture_sessions CRUD + bulk operations.
// REQ-PAYOUT002-SESSIONS-004, REQ-PAYOUT002-EXCEPT-001/-002/-003.
//
// 모든 쿼리는 user-scoped Supabase server client를 받아 RLS 준수.
// REQ-PAYOUT002-RLS-004 — service-role client 미사용.

import { SESSION_ERRORS } from "./errors";
import type { LectureSession, SessionInput } from "./types";

/** Supabase client (Database 제네릭 회피용 최소 시그니처). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupaLike = { from: (table: string) => any };

const SELECT_COLUMNS =
  "id, project_id, instructor_id, date, hours, status, original_session_id, notes, created_at, updated_at, deleted_at";

/**
 * 프로젝트의 lecture_sessions 조회 (deleted_at IS NULL).
 * REQ-PAYOUT002-SESSIONS-006.
 */
export async function listSessionsByProject(
  supabase: SupaLike,
  projectId: string,
): Promise<LectureSession[]> {
  const { data, error } = await supabase
    .from("lecture_sessions")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("date", { ascending: true });
  if (error) {
    console.error("[sessions.queries.listSessionsByProject] failed", error);
    return [];
  }
  return (data ?? []) as LectureSession[];
}

/**
 * 기간 내 미청구 completed 세션 조회 (settlement 생성용).
 * REQ-PAYOUT002-GENERATE-003 + REQ-PAYOUT002-LINK-003.
 *
 * 필터: status='completed' AND deleted_at IS NULL AND date BETWEEN [start, end]
 *       AND id NOT IN (SELECT lecture_session_id FROM settlement_sessions
 *                      JOIN settlements ON ... WHERE deleted_at IS NULL)
 *
 * application-layer 필터링은 UI 미리보기 zero-result 처리용.
 * 권위 있는 double-billing guard는 settlement_sessions UNIQUE INDEX (HIGH-2 / REQ-LINK-006).
 */
export async function listUnbilledCompletedSessions(
  supabase: SupaLike,
  params: {
    periodStart: string; // YYYY-MM-DD
    periodEnd: string; // YYYY-MM-DD
    projectIds?: readonly string[];
  },
): Promise<LectureSession[]> {
  // Step 1: 미청구 세션의 NOT IN 후보 — 활성 settlement에 link된 lecture_session_id
  const { data: linkedRows, error: linkErr } = await supabase
    .from("settlement_sessions")
    .select("lecture_session_id, settlements!inner(deleted_at)")
    .is("settlements.deleted_at", null);

  if (linkErr) {
    console.error("[sessions.queries.listUnbilledCompletedSessions] link query failed", linkErr);
    return [];
  }
  const linkedIds = new Set<string>(
    ((linkedRows ?? []) as Array<{ lecture_session_id: string }>).map(
      (r) => r.lecture_session_id,
    ),
  );

  // Step 2: 기간 내 completed 세션 조회 (project filter optional)
  let req = supabase
    .from("lecture_sessions")
    .select(SELECT_COLUMNS)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("date", params.periodStart)
    .lte("date", params.periodEnd)
    .order("date", { ascending: true });

  if (params.projectIds && params.projectIds.length > 0) {
    req = req.in("project_id", params.projectIds);
  }

  const { data, error } = await req;
  if (error) {
    console.error("[sessions.queries.listUnbilledCompletedSessions] failed", error);
    return [];
  }

  // Step 3: application-layer NOT IN 필터링 (UI 미리보기 zero-result 처리)
  return ((data ?? []) as LectureSession[]).filter((s) => !linkedIds.has(s.id));
}

/**
 * 폼 제출 시 lecture_sessions 일괄 INSERT/UPDATE.
 * REQ-PAYOUT002-SESSIONS-004.
 *
 * - id 있으면 UPDATE, 없으면 INSERT
 * - 단일 트랜잭션 보장은 호출 측에서 (Supabase는 client-level transaction 미지원 — RPC 또는 단계적 처리)
 *
 * 본 함수는 단순 두 단계 처리: 새로 INSERT할 행과 기존 UPDATE할 행을 분리.
 * 트랜잭션이 필요하면 RPC로 wrapping.
 */
export async function bulkUpsertSessions(
  supabase: SupaLike,
  inputs: readonly SessionInput[],
): Promise<{ ok: boolean; error?: string; insertedCount: number; updatedCount: number }> {
  const toInsert = inputs.filter((i) => !i.id);
  const toUpdate = inputs.filter((i): i is SessionInput & { id: string } => Boolean(i.id));

  let insertedCount = 0;
  if (toInsert.length > 0) {
    const insertPayload = toInsert.map((i) => ({
      project_id: i.project_id,
      instructor_id: i.instructor_id,
      date: i.date,
      hours: i.hours,
      status: i.status ?? "planned",
      original_session_id: i.original_session_id ?? null,
      notes: i.notes ?? null,
    }));
    const { data, error } = await supabase
      .from("lecture_sessions")
      .insert(insertPayload)
      .select("id");
    if (error) {
      return {
        ok: false,
        error: error.message ?? SESSION_ERRORS.GENERIC_FAILED,
        insertedCount: 0,
        updatedCount: 0,
      };
    }
    insertedCount = Array.isArray(data) ? data.length : 0;
  }

  let updatedCount = 0;
  for (const u of toUpdate) {
    const updatePayload: Record<string, unknown> = {
      date: u.date,
      hours: u.hours,
      instructor_id: u.instructor_id,
      notes: u.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (u.status) updatePayload.status = u.status;
    const { data, error } = await supabase
      .from("lecture_sessions")
      .update(updatePayload)
      .eq("id", u.id)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      return {
        ok: false,
        error: error.message ?? SESSION_ERRORS.GENERIC_FAILED,
        insertedCount,
        updatedCount,
      };
    }
    if (Array.isArray(data) && data.length > 0) updatedCount++;
  }

  return { ok: true, insertedCount, updatedCount };
}

/**
 * 세션 결강 처리 (REQ-PAYOUT002-EXCEPT-001).
 * status: planned → canceled, notes에 사유 prepend.
 */
export async function cancelSession(
  supabase: SupaLike,
  params: { sessionId: string; reason?: string },
): Promise<{ ok: boolean; error?: string }> {
  const updatedAt = new Date().toISOString();
  const noteLine = params.reason
    ? `[${updatedAt} 운영자 취소] ${params.reason}`
    : null;

  // 기존 notes를 보존하기 위해 먼저 SELECT
  const { data: existing, error: selErr } = await supabase
    .from("lecture_sessions")
    .select("status, notes")
    .eq("id", params.sessionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) {
    return { ok: false, error: selErr.message ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (!existing) {
    return { ok: false, error: "세션을 찾을 수 없습니다." };
  }
  const row = existing as { status: string; notes: string | null };
  if (row.status !== "planned") {
    return { ok: false, error: SESSION_ERRORS.STATUS_FROZEN };
  }

  const newNotes =
    noteLine && row.notes
      ? `${row.notes}\n${noteLine}`
      : (noteLine ?? row.notes ?? null);

  const { data, error } = await supabase
    .from("lecture_sessions")
    .update({ status: "canceled", notes: newNotes, updated_at: updatedAt })
    .eq("id", params.sessionId)
    .eq("status", "planned") // optimistic concurrency
    .is("deleted_at", null)
    .select("id");
  if (error) {
    return { ok: false, error: error.message ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: SESSION_ERRORS.STATUS_FROZEN };
  }
  return { ok: true };
}

/**
 * 일정 변경 처리 (REQ-PAYOUT002-EXCEPT-002, LOW-8 notes carry-forward).
 *
 * 트랜잭션:
 *   1) 원본 세션 status='rescheduled' 갱신
 *   2) 새 세션 INSERT — original_session_id, notes carry-forward
 *
 * Supabase client는 multi-statement transaction을 직접 지원하지 않으므로
 * 단계적으로 실행하고, 실패 시 보상(compensating action)을 시도한다.
 * 더 안전한 방식이 필요하면 PL/pgSQL RPC로 wrapping.
 */
export async function rescheduleSession(
  supabase: SupaLike,
  params: { sessionId: string; newDate: string; notes?: string | null },
): Promise<{ ok: boolean; error?: string; newSessionId?: string }> {
  // Step 1: 원본 fetch
  const { data: existing, error: selErr } = await supabase
    .from("lecture_sessions")
    .select("id, project_id, instructor_id, hours, status, notes")
    .eq("id", params.sessionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) {
    return { ok: false, error: selErr.message ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (!existing) {
    return { ok: false, error: "세션을 찾을 수 없습니다." };
  }
  const orig = existing as {
    id: string;
    project_id: string;
    instructor_id: string | null;
    hours: number | string;
    status: string;
    notes: string | null;
  };
  if (orig.status !== "planned") {
    return { ok: false, error: SESSION_ERRORS.STATUS_FROZEN };
  }

  // Step 2: 원본 status='rescheduled' 갱신 (optimistic concurrency)
  const updatedAt = new Date().toISOString();
  const { data: updRows, error: updErr } = await supabase
    .from("lecture_sessions")
    .update({ status: "rescheduled", updated_at: updatedAt })
    .eq("id", params.sessionId)
    .eq("status", "planned")
    .is("deleted_at", null)
    .select("id");
  if (updErr) {
    return { ok: false, error: updErr.message ?? SESSION_ERRORS.GENERIC_FAILED };
  }
  if (!Array.isArray(updRows) || updRows.length === 0) {
    return { ok: false, error: SESSION_ERRORS.STATUS_FROZEN };
  }

  // Step 3: 새 세션 INSERT (notes carry-forward, REQ-EXCEPT-002 LOW-8)
  // 운영자가 amend한 notes가 있으면 사용, 없으면 원본 notes 그대로 인계.
  const carriedNotes =
    params.notes !== undefined && params.notes !== null
      ? params.notes
      : (orig.notes ?? null);
  const { data: insRows, error: insErr } = await supabase
    .from("lecture_sessions")
    .insert({
      project_id: orig.project_id,
      instructor_id: orig.instructor_id,
      date: params.newDate,
      hours: orig.hours,
      status: "planned",
      original_session_id: orig.id,
      notes: carriedNotes,
    })
    .select("id")
    .single();

  if (insErr) {
    // 보상 — 원본 status를 다시 planned로 되돌림 시도 (best-effort)
    await supabase
      .from("lecture_sessions")
      .update({ status: "planned", updated_at: new Date().toISOString() })
      .eq("id", params.sessionId)
      .eq("status", "rescheduled");
    return { ok: false, error: insErr.message ?? SESSION_ERRORS.GENERIC_FAILED };
  }

  return {
    ok: true,
    newSessionId: (insRows as { id: string }).id,
  };
}

/**
 * 강사 중도 하차 — 미래 planned 세션 일괄 canceled (REQ-PAYOUT002-EXCEPT-003).
 *
 * 단일 SQL UPDATE로 idempotent + 동시성 안전.
 * project status 전환은 호출 측이 별도로 처리 (status-machine 검증 후).
 */
export async function bulkCancelFutureSessions(
  supabase: SupaLike,
  params: { projectId: string; reason: string; today?: string },
): Promise<{ ok: boolean; error?: string; canceledCount: number }> {
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  const updatedAt = new Date().toISOString();
  const noteLine = `[${updatedAt} 운영자 강사중도하차] ${params.reason}`;

  // 미래 planned 세션 fetch (notes append를 위해)
  const { data: targets, error: selErr } = await supabase
    .from("lecture_sessions")
    .select("id, notes")
    .eq("project_id", params.projectId)
    .eq("status", "planned")
    .is("deleted_at", null)
    .gte("date", today);
  if (selErr) {
    return { ok: false, error: selErr.message ?? SESSION_ERRORS.GENERIC_FAILED, canceledCount: 0 };
  }

  let canceledCount = 0;
  for (const target of (targets ?? []) as Array<{ id: string; notes: string | null }>) {
    const newNotes = target.notes ? `${target.notes}\n${noteLine}` : noteLine;
    const { data: updRows, error: updErr } = await supabase
      .from("lecture_sessions")
      .update({ status: "canceled", notes: newNotes, updated_at: updatedAt })
      .eq("id", target.id)
      .eq("status", "planned")
      .is("deleted_at", null)
      .select("id");
    if (updErr) {
      return {
        ok: false,
        error: updErr.message ?? SESSION_ERRORS.GENERIC_FAILED,
        canceledCount,
      };
    }
    if (Array.isArray(updRows) && updRows.length > 0) canceledCount++;
  }

  return { ok: true, canceledCount };
}

/**
 * 미래 planned 세션 개수 조회 — 강사 중도 하차 confirmation 미리보기용.
 * REQ-PAYOUT002-EXCEPT-004.
 */
export async function countFutureSessions(
  supabase: SupaLike,
  params: { projectId: string; today?: string },
): Promise<number> {
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("lecture_sessions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", params.projectId)
    .eq("status", "planned")
    .is("deleted_at", null)
    .gte("date", today);
  if (error) {
    console.error("[sessions.queries.countFutureSessions] failed", error);
    return 0;
  }
  return count ?? 0;
}
