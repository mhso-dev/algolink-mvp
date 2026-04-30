// @MX:ANCHOR: SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-CONVERT-001/006 — Won → Project 도메인 변환 (순수 함수).
// @MX:REASON: 변환 Server Action이 본 모듈 호출. fan_in 높음. SPEC-PROJECT-001 schema 호환 필수.
// @MX:WARN: 사이드 이펙트 0건 — 트랜잭션/INSERT는 호출 측 Server Action 책임.
// @MX:REASON: REQ-PROPOSAL-CONVERT-006 — convert.ts 순수성. Drizzle/Supabase/Next 의존 0건.
// @MX:SPEC: SPEC-PROPOSAL-001
import type {
  AcceptedInquiryRecord,
  AcceptedTop3Entry,
  ProjectInsertPayload,
  ProposalRecord,
  RecommendationInsertPayload,
} from "./types";

/**
 * 제안서 → projects INSERT 페이로드 매핑 (REQ-PROPOSAL-CONVERT-001 Step 3 / REQ-CONVERT-005).
 *
 * SPEC-PROJECT-001 schema 변경 0건 보장:
 * - status='proposal' (13단계 enum의 시작점)
 * - instructor_id=NULL (배정 전)
 * - project_type='education' (default)
 * - business_amount_krw = proposal.proposedBusinessAmountKrw ?? 0
 * - instructor_fee_krw = 0 (시간 추정 미지원, 운영자가 후속 입력)
 *
 * 순수 함수 — Drizzle/Supabase 의존 0건.
 */
export function buildProjectFromProposal(
  proposal: ProposalRecord,
): ProjectInsertPayload {
  return {
    title: proposal.title,
    clientId: proposal.clientId,
    operatorId: proposal.operatorId,
    scheduledAt: proposal.proposedPeriodStart ?? null,
    startDate: proposal.proposedPeriodStart ?? null,
    endDate: proposal.proposedPeriodEnd ?? null,
    businessAmountKrw: proposal.proposedBusinessAmountKrw ?? 0,
    instructorFeeKrw: 0,
    status: "proposal",
    instructorId: null,
    projectType: "education",
  };
}

/** Top3 entry 1건 빌더 (SPEC-RECOMMEND-001 source 유니언 호환). */
export function buildAcceptedTop3Entry(instructorId: string): AcceptedTop3Entry {
  return {
    instructorId,
    finalScore: null,
    skillMatch: null,
    availability: null,
    satisfaction: null,
    reason: "사전 문의에서 수락한 후보 강사",
    source: "fallback",
  };
}

/**
 * accepted 강사 N명 → ai_instructor_recommendations INSERT 페이로드 (REQ-PROPOSAL-CONVERT-001 Step 5).
 *
 * 0명일 때는 null 반환 — 호출 측이 Step 5 INSERT 자체를 skip해야 함 (REQ-CONVERT-005).
 *
 * top3는 최대 3명까지 (capped at 3). 순서: respondedAt ASC NULLS LAST → instructorId.
 *
 * 순수 함수 — Drizzle/Supabase 의존 0건.
 */
export function buildAcceptedRecommendationFromInquiries(
  newProjectId: string,
  acceptedInquiries: readonly AcceptedInquiryRecord[],
): RecommendationInsertPayload | null {
  if (acceptedInquiries.length === 0) {
    return null;
  }

  // respondedAt ASC NULLS LAST → instructorId 정렬 후 top3 cap
  const sorted = [...acceptedInquiries].sort((a, b) => {
    const ar = a.respondedAt ?? null;
    const br = b.respondedAt ?? null;
    if (ar === null && br === null) {
      return a.instructorId.localeCompare(b.instructorId);
    }
    if (ar === null) return 1; // null 마지막
    if (br === null) return -1;
    if (ar !== br) return ar < br ? -1 : 1;
    return a.instructorId.localeCompare(b.instructorId);
  });

  const top3 = sorted.slice(0, 3).map((entry) =>
    buildAcceptedTop3Entry(entry.instructorId),
  );

  return {
    projectId: newProjectId,
    top3Jsonb: top3,
    model: "manual_from_proposal",
    adoptedInstructorId: null,
  };
}
