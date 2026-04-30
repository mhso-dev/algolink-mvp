// SPEC-PROPOSAL-001 §M2 — 제안서 도메인 TypeScript 타입.
// 순수 인터페이스 — Drizzle/Supabase 의존 0건.

export const PROPOSAL_STATUSES = [
  "draft",
  "submitted",
  "won",
  "lost",
  "withdrawn",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const INQUIRY_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "conditional",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/** Frozen states — won/lost/withdrawn에서는 모든 변경 거부. */
export const FROZEN_PROPOSAL_STATUSES = [
  "won",
  "lost",
  "withdrawn",
] as const satisfies readonly ProposalStatus[];
export type FrozenProposalStatus = (typeof FROZEN_PROPOSAL_STATUSES)[number];

export function isFrozenProposalStatus(
  s: ProposalStatus,
): s is FrozenProposalStatus {
  return (FROZEN_PROPOSAL_STATUSES as readonly ProposalStatus[]).includes(s);
}

/** 도메인 입력 — DB row의 dehydrated 형식 (순수 함수에 전달). */
export interface ProposalRecord {
  id: string;
  title: string;
  clientId: string;
  operatorId: string;
  proposedPeriodStart: string | null; // ISO date
  proposedPeriodEnd: string | null;
  proposedBusinessAmountKrw: number | null;
  proposedHourlyRateKrw: number | null;
  notes: string | null;
  status: ProposalStatus;
  submittedAt: string | null; // ISO timestamp
  decidedAt: string | null;
  convertedProjectId: string | null;
}

/** 디스패치 입력. */
export interface InquiryDispatchInput {
  proposalId: string;
  operatorId?: string | null;
  instructorIds: readonly string[];
  proposedTimeSlotStart: string | null; // ISO timestamp
  proposedTimeSlotEnd: string | null;
  questionNote: string | null;
}

/** 디스패치 결과 (도메인 빌더 출력) — 순수 INSERT payload. */
export interface InquiryRecordToInsert {
  proposalId: string;
  operatorId?: string | null;
  instructorId: string;
  proposedTimeSlotStart: string | null;
  proposedTimeSlotEnd: string | null;
  questionNote: string | null;
}

/** 변환에 필요한 accepted 강사 정보. */
export interface AcceptedInquiryRecord {
  inquiryId: string;
  instructorId: string;
  respondedAt: string | null;
}

/** projects INSERT payload (SPEC-PROJECT-001 호환). */
export interface ProjectInsertPayload {
  title: string;
  clientId: string;
  operatorId: string;
  startDate: string | null; // ISO date — 매핑은 educationStartAt 등 별도
  endDate: string | null;
  businessAmountKrw: number;
  instructorFeeKrw: number;
  status: "proposal";
  instructorId: null;
  projectType: "education";
}

/** ai_instructor_recommendations INSERT payload (top3 capped at 3). */
export interface RecommendationInsertPayload {
  projectId: string; // 변환 직후의 신규 project id
  top3Jsonb: AcceptedTop3Entry[];
  model: "manual_from_proposal";
  adoptedInstructorId: null;
}

export interface AcceptedTop3Entry {
  instructorId: string;
  finalScore: null;
  skillMatch: null;
  availability: null;
  satisfaction: null;
  reason: "사전 문의에서 수락한 후보 강사";
  source: "fallback";
}
