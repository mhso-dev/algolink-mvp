// SPEC-RECOMMEND-001 REQ-RECOMMEND-006(5) — RECOMMENDATION_DISCLAIMER 문구 단일 출처 검증.
//
// AI 한정 어휘를 제거하면서도 "최종 배정은 담당자가 결정한다" 캐비엣을 보존하는지 검증한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_ERRORS } from "../errors";

test("PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER 문구 검증", () => {
  // SPEC-RECOMMEND-001 — "AI 추천" → "강사 추천" 으로 어휘 변경.
  // "최종 배정은 담당자가 결정합니다." 캐비엣은 보존.
  assert.equal(
    PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER,
    "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.",
  );
  // 부정 검증: AI 어휘 부재.
  assert.ok(
    !PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER.includes("AI"),
    `disclaimer 에 "AI" 어휘가 남아 있으면 안 된다. 실제: "${PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER}"`,
  );
  // 긍정 검증: 캐비엣 보존.
  assert.ok(
    PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER.includes("최종 배정은 담당자가 결정"),
    `disclaimer 에 "최종 배정은 담당자가 결정" 캐비엣이 보존되어야 한다.`,
  );
});
