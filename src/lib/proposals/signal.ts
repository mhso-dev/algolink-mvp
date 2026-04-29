// @MX:NOTE: SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-SIGNAL-001/004 — instructor_inquiry_history 시그널 헬퍼.
// @MX:REASON: SPEC-RECOMMEND-001 score.ts 변경 0건. 본 헬퍼는 ad-hoc 분석용. REQ-PROPOSAL-SIGNAL-004: runRecommendationAction에서 호출 안 함.
// @MX:WARN: 본 모듈은 server-only — Server Component / Server Action / Route Handler에서만 호출.
// @MX:REASON: Drizzle db 클라이언트 직접 참조 — 클라이언트 번들 노출 시 DB 접속 정보 유출 위험.
// @MX:SPEC: SPEC-PROPOSAL-001
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * 강사별 사전 문의 accepted 카운트 (지정 윈도우 일수 내).
 *
 * @param instructorId 강사 ID
 * @param windowDays 윈도우 일수 (기본 90)
 * @returns 90일(또는 지정) 내 accepted 카운트
 */
export async function selectInstructorPriorAcceptedCount(
  instructorId: string,
  windowDays: number = 90,
): Promise<number> {
  const rows = await db.execute<{ count: string | number }>(sql`
    SELECT COUNT(*)::text AS count
      FROM proposal_inquiries
      WHERE instructor_id = ${instructorId}
        AND status = 'accepted'
        AND responded_at > now() - (${windowDays}::int * interval '1 day')
  `);
  const first = Array.isArray(rows) ? rows[0] : (rows as unknown as { rows?: { count: string | number }[] }).rows?.[0];
  if (!first) return 0;
  const count = typeof first.count === "number" ? first.count : Number(first.count);
  return Number.isFinite(count) ? count : 0;
}

/**
 * 강사별 시그널 view row (REQ-PROPOSAL-SIGNAL-001).
 */
export interface InstructorInquirySignal {
  instructorId: string;
  priorAcceptedCount90d: number;
  priorDeclinedCount90d: number;
  priorPendingCount: number;
  lastRespondedAt: string | null;
}

export async function selectInstructorInquirySignal(
  instructorId: string,
): Promise<InstructorInquirySignal | null> {
  const rows = await db.execute<{
    instructor_id: string;
    prior_accepted_count_90d: string | number;
    prior_declined_count_90d: string | number;
    prior_pending_count: string | number;
    last_responded_at: string | null;
  }>(sql`
    SELECT instructor_id,
           prior_accepted_count_90d,
           prior_declined_count_90d,
           prior_pending_count,
           last_responded_at
      FROM instructor_inquiry_history
      WHERE instructor_id = ${instructorId}
      LIMIT 1
  `);
  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows?: typeof rows }).rows ?? [];
  const row = list[0];
  if (!row) return null;
  return {
    instructorId: row.instructor_id,
    priorAcceptedCount90d: Number(row.prior_accepted_count_90d) || 0,
    priorDeclinedCount90d: Number(row.prior_declined_count_90d) || 0,
    priorPendingCount: Number(row.prior_pending_count) || 0,
    lastRespondedAt: row.last_responded_at ?? null,
  };
}
