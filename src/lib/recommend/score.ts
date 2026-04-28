// @MX:ANCHOR: SPEC-PROJECT-001 §5.4 REQ-PROJECT-RECOMMEND-002 — Top-3 추천 점수 함수.
// @MX:REASON: KPI(1순위 채택률 ≥ 60%)의 핵심 입력. 가중치 변경은 SPEC 개정 필요.
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001

import {
  SATISFACTION_PRIOR,
  WEIGHTS,
  type CandidateInput,
  type CandidateScore,
  type InstructorReviewStats,
  type InstructorScheduleInput,
  type InstructorSkillInput,
  type ProjectInput,
} from "./types";

/**
 * skillMatch ∈ [0, 1]
 * = (강사 보유 카테고리 ∩ required) 카디널리티 / required_skill_count.
 *
 * SPEC-SKILL-ABSTRACT-001: 보유=1/미보유=0 binary 매칭. proficiency 가중치 사용 안 함.
 * 강사가 동일 카테고리를 중복 보유할 수 없으므로(DB PK 제약), 분자가 분모를 초과하지 않음.
 */
export function computeSkillMatch(
  required: readonly string[],
  instructorSkills: readonly InstructorSkillInput[],
): { score: number; matchedSkillIds: string[] } {
  if (required.length === 0) {
    return { score: 0, matchedSkillIds: [] };
  }
  const ownedIds = new Set<string>();
  for (const s of instructorSkills) ownedIds.add(s.skillId);

  const matched: string[] = [];
  for (const reqId of required) {
    if (ownedIds.has(reqId)) {
      matched.push(reqId);
    }
  }
  return { score: matched.length / required.length, matchedSkillIds: matched };
}

/**
 * availability ∈ {0, 1} — binary.
 * system_lecture / unavailable 일정이 프로젝트 기간과 겹치면 0, 아니면 1.
 * personal 일정은 무시 (강사가 임의 추가).
 */
export function computeAvailability(
  scheduleItems: readonly InstructorScheduleInput[],
  projectStart: Date,
  projectEnd: Date,
): 0 | 1 {
  for (const item of scheduleItems) {
    if (item.kind === "personal") continue;
    // overlap: a.start < b.end && a.end > b.start
    if (item.startsAt < projectEnd && item.endsAt > projectStart) {
      return 0;
    }
  }
  return 1;
}

/**
 * satisfaction ∈ [0, 1].
 * 리뷰 0건 → SATISFACTION_PRIOR (cold start).
 * 리뷰 ≥ 1 → (mean - 1) / 4.
 */
export function computeSatisfaction(stats: InstructorReviewStats): number {
  if (stats.count === 0 || stats.meanScore === null) return SATISFACTION_PRIOR;
  const normalized = (stats.meanScore - 1) / 4;
  return Math.max(0, Math.min(1, normalized));
}

/** 가중합 — finalScore = 0.5*skill + 0.3*availability + 0.2*satisfaction. */
export function computeFinalScore(
  skillMatch: number,
  availability: 0 | 1,
  satisfaction: number,
): number {
  return (
    WEIGHTS.skill * skillMatch +
    WEIGHTS.availability * availability +
    WEIGHTS.satisfaction * satisfaction
  );
}

/** 단일 후보 채점. */
export function scoreCandidate(
  project: ProjectInput,
  candidate: CandidateInput,
): CandidateScore {
  const { score: skillMatch, matchedSkillIds } = computeSkillMatch(
    project.requiredSkillIds,
    candidate.skills,
  );
  const availability = computeAvailability(
    candidate.schedules,
    project.startAt,
    project.endAt,
  );
  const satisfaction = computeSatisfaction(candidate.reviews);
  const finalScore = computeFinalScore(skillMatch, availability, satisfaction);
  return {
    instructorId: candidate.instructorId,
    displayName: candidate.displayName,
    skillMatch,
    availability,
    satisfaction,
    finalScore,
    matchedSkillIds,
  };
}

// @MX:ANCHOR: SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-001/002/003 — 3-tier 안정 정렬.
// @MX:REASON: KPI(1순위 채택률 ≥ 60%) 분자가 top3_jsonb[0]에 의존하므로 정렬 결정성 필수.
// @MX:SPEC: SPEC-RECOMMEND-001
// @MX:SPEC: SPEC-PROJECT-001 (가중치 FROZEN — REQ-RECOMMEND-007 보존)
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
/**
 * 후보 리스트 → Top-N (3-tier 안정 정렬, skillMatch=0 후보 제외).
 * 정렬 키 (SPEC-RECOMMEND-001 REQ-RECOMMEND-001):
 *   tier-1: availability desc (1 우선, 0 후순위)
 *   tier-2: finalScore desc  (가중합 점수 큰 순)
 *   tier-3: instructorId asc (결정성 tiebreak — REQ-RECOMMEND-003)
 * skillMatch === 0 후보는 제외 (REQ-RECOMMEND-002).
 */
export function rankTopN(
  project: ProjectInput,
  candidates: readonly CandidateInput[],
  n: number,
): CandidateScore[] {
  const scored = candidates
    .map((c) => scoreCandidate(project, c))
    .filter((s) => s.skillMatch > 0);

  scored.sort((a, b) => {
    // tier-1: availability desc (1 before 0)
    if (b.availability !== a.availability) return b.availability - a.availability;
    // tier-2: finalScore desc
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    // tier-3: instructorId asc (deterministic tiebreak)
    return a.instructorId.localeCompare(b.instructorId);
  });

  return scored.slice(0, n);
}
