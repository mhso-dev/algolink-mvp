// SPEC-RECOMMEND-001 — runRecommendationAction 통합 회귀 가드.
//
// 목적: actions.ts 가 (a) buildClaudeReasonGenerator import/호출을 더 이상 하지 않고
//      (b) generateRecommendations 의 세 번째 인자로 리터럴 null 을 전달함을 보장한다.
//
// actions.ts 는 next/headers / next/cache / supabase server client / getCurrentUser
// 의존성을 가지고 있어 직접 import 시 module evaluation 이 실패하므로,
// (1) 정적 소스 검사(fs.readFileSync 로 파일 내용을 읽어 substring/regex 검증)와
// (2) 도메인 합성(generateRecommendations 를 reasonGen=null 로 호출) 두 축으로 검증한다.
//
// 대응 EARS: REQ-RECOMMEND-004 (AI 사유 생성기 비활성), REQ-RECOMMEND-005 (model="fallback").

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateRecommendations } from "../engine";
import type { CandidateInput, ProjectInput } from "../types";

const ACTIONS_PATH = path.resolve(
  process.cwd(),
  "src/app/(app)/(operator)/projects/[id]/actions.ts",
);

test("actions.ts: buildClaudeReasonGenerator import/호출 없음 (정적 소스 검사)", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-004 — 추천 도메인의 Claude 사유 생성기 비활성.
  const source = fs.readFileSync(ACTIONS_PATH, "utf8");
  assert.ok(
    !source.includes("buildClaudeReasonGenerator"),
    `actions.ts 가 buildClaudeReasonGenerator 를 참조하면 안 된다. 발견 위치 인근:\n${
      source
        .split("\n")
        .map((l, i) => (l.includes("buildClaudeReasonGenerator") ? `${i + 1}: ${l}` : null))
        .filter(Boolean)
        .join("\n") || "(none)"
    }`,
  );
});

test("actions.ts: generateRecommendations 호출 시 세 번째 인자로 null 전달", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-004 — reasonGen 인자 = null 리터럴.
  // 공백/줄바꿈을 허용하는 regex 로 검증.
  const source = fs.readFileSync(ACTIONS_PATH, "utf8");
  const callPattern =
    /generateRecommendations\(\s*projectInput\s*,\s*candidates\s*,\s*null\s*,\s*3\s*,?\s*\)/;
  assert.ok(
    callPattern.test(source),
    `actions.ts 의 generateRecommendations 호출이 (projectInput, candidates, null, 3) 형태여야 한다.`,
  );
});

test("도메인 합성: generateRecommendations(_, _, null, 3) → 모든 source='fallback' + model=null", async () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-004 — actions.ts 가 의존하는 런타임 계약.
  // 실제 actions.ts 호출 경로는 supabase 의존성으로 직접 테스트 불가하므로
  // 동일 도메인 함수 호출을 통해 행동 계약만 검증한다.
  const project: ProjectInput = {
    projectId: "proj-action-test",
    startAt: new Date("2026-05-10T00:00:00Z"),
    endAt: new Date("2026-05-14T00:00:00Z"),
    requiredSkillIds: ["skill-python", "skill-django"],
  };
  // SPEC-SKILL-ABSTRACT-001: proficiency 필드 제거 — binary 매칭.
  const candidates: CandidateInput[] = [
    {
      instructorId: "ins-A",
      displayName: "강사 A",
      skills: [{ skillId: "skill-python" }, { skillId: "skill-django" }],
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
    {
      instructorId: "ins-B",
      displayName: "강사 B",
      skills: [{ skillId: "skill-python" }],
      schedules: [],
      reviews: { meanScore: 4.2, count: 5 },
    },
  ];
  const result = await generateRecommendations(project, candidates, null, 3);
  assert.equal(result.model, null);
  assert.ok(result.candidates.length > 0);
  assert.ok(
    result.candidates.every((c) => c.source === "fallback"),
    `reasonGen=null 이면 모든 후보 source 가 "fallback" 이어야 한다.`,
  );
  // result.model ?? "fallback" → "fallback" 으로 INSERT 되는 분기를 보장한다.
  const modelForInsert = result.model ?? "fallback";
  assert.equal(modelForInsert, "fallback");
});
