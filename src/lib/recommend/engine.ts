// @MX:ANCHOR: SPEC-PROJECT-001 §5.3 REQ-PROJECT-RECOMMEND-001/003/004 — Top-3 + 사유 생성 + 폴백.
// @MX:REASON: 추천 결과의 단일 entry point. AI 실패 시에도 폴백으로 결과를 보장한다.
// @MX:NOTE: SPEC-RECOMMEND-001 — runRecommendationAction 이 reasonGen=null 전달 → 항상 fallback 분기.
// @MX:SPEC: SPEC-RECOMMEND-001

import { rankTopN } from "./score";
import type {
  CandidateInput,
  CandidateScore,
  ProjectInput,
  RecommendationCandidate,
  RecommendationResult,
} from "./types";

/**
 * Claude 등 외부 사유 생성기 인터페이스.
 * 실패 시 throw 또는 reject 하면 자동으로 fallback 으로 전환된다.
 */
export interface ReasonGenerator {
  modelName: string;
  generate(args: {
    project: ProjectInput;
    topCandidates: CandidateScore[];
  }): Promise<Map<string, string>>; // instructorId → reason
}

/** 룰 기반 사유 템플릿 (REQ-PROJECT-RECOMMEND-004). */
export function fallbackReason(
  candidate: CandidateScore,
  totalRequired: number,
  reviewMean: number | null,
): string {
  const matched = candidate.matchedSkillIds.length;
  const meanText =
    reviewMean === null ? "리뷰 없음" : `만족도 ${reviewMean.toFixed(1)}/5`;
  const availText =
    candidate.availability === 1 ? ", 가용 일정 OK" : ", 일정 충돌 가능";
  return `기술스택 ${matched}/${totalRequired}건 일치, ${meanText}${availText}`;
}

/**
 * 추천 엔진 main entry.
 * 1. rankTopN 으로 Top-N 산출
 * 2. ReasonGenerator (있다면) 호출
 * 3. 실패 시 fallback 사유 생성
 */
export async function generateRecommendations(
  project: ProjectInput,
  candidates: readonly CandidateInput[],
  reasonGen: ReasonGenerator | null,
  topN = 3,
): Promise<RecommendationResult> {
  const top = rankTopN(project, candidates, topN);
  const meansById = new Map<string, number | null>();
  for (const c of candidates) {
    meansById.set(c.instructorId, c.reviews.count === 0 ? null : c.reviews.meanScore);
  }

  let reasons: Map<string, string> | null = null;
  let usedModel: string | null = null;

  if (reasonGen && top.length > 0) {
    try {
      reasons = await reasonGen.generate({ project, topCandidates: top });
      usedModel = reasonGen.modelName;
      // 응답이 모든 후보를 포함하지 않으면 부분 폴백
      for (const t of top) {
        const r = reasons.get(t.instructorId);
        if (!r || r.length < 5) {
          // 부족 → 전체 폴백 처리 (단순화)
          throw new Error("incomplete reason map");
        }
      }
    } catch (err) {
      console.warn(
        "[recommendation] Claude reason generation failed, falling back to rule-based reason",
        err instanceof Error ? err.message : err,
      );
      reasons = null;
      usedModel = null;
    }
  }

  const enriched: RecommendationCandidate[] = top.map((c) => {
    if (reasons) {
      const r = reasons.get(c.instructorId);
      if (r) {
        return { ...c, reason: r, source: "claude" };
      }
    }
    return {
      ...c,
      reason: fallbackReason(c, project.requiredSkillIds.length, meansById.get(c.instructorId) ?? null),
      source: "fallback",
    };
  });

  return {
    projectId: project.projectId,
    candidates: enriched,
    model: usedModel,
    generatedAt: new Date().toISOString(),
  };
}
