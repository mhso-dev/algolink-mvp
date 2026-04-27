// @MX:ANCHOR: SPEC-PROJECT-001 §5.4 REQ-PROJECT-RECOMMEND-002 — Top-3 추천 점수 함수.
// @MX:REASON: KPI(1순위 채택률 ≥ 60%)의 핵심 입력. 가중치 변경은 SPEC 개정 필요.
// @MX:SPEC: SPEC-PROJECT-001

import {
  PROFICIENCY_WEIGHT,
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
 * = Σ(matched proficiency_weight) / required_skill_count.
 * 미매칭 skill 은 0 기여. 매칭은 강사가 보유한 proficiency 가중치를 사용.
 */
export function computeSkillMatch(
  required: readonly string[],
  instructorSkills: readonly InstructorSkillInput[],
): { score: number; matchedSkillIds: string[] } {
  if (required.length === 0) {
    return { score: 0, matchedSkillIds: [] };
  }
  const ownedById = new Map<string, InstructorSkillInput>();
  for (const s of instructorSkills) ownedById.set(s.skillId, s);

  const matched: string[] = [];
  let sum = 0;
  for (const reqId of required) {
    const owned = ownedById.get(reqId);
    if (owned) {
      matched.push(reqId);
      sum += PROFICIENCY_WEIGHT[owned.proficiency];
    }
  }
  return { score: sum / required.length, matchedSkillIds: matched };
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

/**
 * 후보 리스트 → 점수 내림차순 Top-N (안정 정렬: 동점 시 instructorId 사전순).
 * skillMatch === 0 후보는 제외 (REQ-PROJECT-RECOMMEND-007).
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
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.instructorId.localeCompare(b.instructorId);
  });

  return scored.slice(0, n);
}
