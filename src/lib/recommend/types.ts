// @MX:NOTE: SPEC-PROJECT-001 §2.6 — 추천 엔진 도메인 타입.
// React/Next/Supabase/Anthropic 의존성 없음 (REQ-PROJECT-RECOMMEND-008 순수성).
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — proficiency 제거, binary 매칭 단순화.

export interface InstructorSkillInput {
  skillId: string;
}

export interface InstructorScheduleInput {
  /** SPEC-DB-001 schedule_kind. system_lecture/unavailable 만 충돌 검사 대상. */
  kind: "system_lecture" | "personal" | "unavailable";
  startsAt: Date;
  endsAt: Date;
}

export interface InstructorReviewStats {
  meanScore: number | null; // 1..5 또는 null (리뷰 0건)
  count: number;
}

export interface CandidateInput {
  instructorId: string;
  displayName: string;
  skills: InstructorSkillInput[];
  schedules: InstructorScheduleInput[];
  reviews: InstructorReviewStats;
}

export interface ProjectInput {
  projectId: string;
  startAt: Date;
  endAt: Date;
  requiredSkillIds: string[];
}

export interface CandidateScore {
  instructorId: string;
  displayName: string;
  skillMatch: number; // [0, 1]
  availability: 0 | 1;
  satisfaction: number; // [0, 1]
  finalScore: number;
  matchedSkillIds: string[];
}

export interface RecommendationCandidate extends CandidateScore {
  reason: string;
  source: "claude" | "fallback";
}

export interface RecommendationResult {
  projectId: string;
  candidates: RecommendationCandidate[]; // 0..3
  model: string | null;
  generatedAt: string; // ISO
}

/** 점수 계산 가중치 (FROZEN — SPEC-PROJECT-001 §5.4). */
export const WEIGHTS = {
  skill: 0.5,
  availability: 0.3,
  satisfaction: 0.2,
} as const;

/** 리뷰 0건 강사의 만족도 prior (cold-start). */
export const SATISFACTION_PRIOR = 0.6;
