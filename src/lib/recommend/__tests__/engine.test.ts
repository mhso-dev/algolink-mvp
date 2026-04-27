// SPEC-PROJECT-001 — 추천 엔진 (사유 생성 + 폴백) 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackReason, generateRecommendations, type ReasonGenerator } from "../engine";
import type { CandidateInput, ProjectInput } from "../types";

const SK_PY = "skill-python";
const SK_DJ = "skill-django";

const project: ProjectInput = {
  projectId: "proj-1",
  startAt: new Date("2026-05-10T00:00:00Z"),
  endAt: new Date("2026-05-14T00:00:00Z"),
  requiredSkillIds: [SK_PY, SK_DJ],
};

const candidates: CandidateInput[] = [
  {
    instructorId: "ins-A",
    displayName: "강사 A",
    skills: [
      { skillId: SK_PY, proficiency: "expert" },
      { skillId: SK_DJ, proficiency: "advanced" },
    ],
    schedules: [],
    reviews: { meanScore: 4.6, count: 8 },
  },
  {
    instructorId: "ins-B",
    displayName: "강사 B",
    skills: [{ skillId: SK_PY, proficiency: "advanced" }],
    schedules: [],
    reviews: { meanScore: 4.2, count: 5 },
  },
];

test("fallbackReason: 매칭 1/2, 만족도 4.2, 일정 OK", () => {
  const txt = fallbackReason(
    {
      instructorId: "ins-B",
      displayName: "B",
      skillMatch: 0.45,
      availability: 1,
      satisfaction: 0.8,
      finalScore: 0.685,
      matchedSkillIds: [SK_PY],
    },
    2,
    4.2,
  );
  assert.match(txt, /기술스택 1\/2건 일치/);
  assert.match(txt, /만족도 4\.2\/5/);
  assert.match(txt, /가용 일정 OK/);
});

test("fallbackReason: 일정 충돌 시 메시지", () => {
  const txt = fallbackReason(
    {
      instructorId: "ins-X",
      displayName: "X",
      skillMatch: 0.5,
      availability: 0,
      satisfaction: 0.6,
      finalScore: 0.4,
      matchedSkillIds: [SK_PY],
    },
    2,
    null,
  );
  assert.match(txt, /일정 충돌 가능/);
  assert.match(txt, /리뷰 없음/);
});

test("generateRecommendations: ReasonGenerator 없을 때 fallback 사용", async () => {
  const result = await generateRecommendations(project, candidates, null, 3);
  assert.equal(result.candidates.length, 2);
  for (const c of result.candidates) {
    assert.equal(c.source, "fallback");
    assert.ok(c.reason.length > 0);
  }
  assert.equal(result.model, null);
});

test("generateRecommendations: ReasonGenerator 정상 동작 시 source='claude'", async () => {
  const mockGen: ReasonGenerator = {
    modelName: "mock-claude",
    async generate({ topCandidates }) {
      const m = new Map<string, string>();
      for (const c of topCandidates) {
        m.set(c.instructorId, `테스트 사유 (${c.instructorId})`);
      }
      return m;
    },
  };
  const result = await generateRecommendations(project, candidates, mockGen, 3);
  assert.equal(result.model, "mock-claude");
  for (const c of result.candidates) {
    assert.equal(c.source, "claude");
    assert.match(c.reason, /테스트 사유/);
  }
});

test("generateRecommendations: ReasonGenerator throw 시 fallback 으로 강등", async () => {
  const failingGen: ReasonGenerator = {
    modelName: "mock-claude",
    async generate() {
      throw new Error("simulated 401");
    },
  };
  const result = await generateRecommendations(project, candidates, failingGen, 3);
  assert.equal(result.model, null);
  for (const c of result.candidates) {
    assert.equal(c.source, "fallback");
  }
});

test("generateRecommendations: ReasonGenerator 가 일부 후보를 누락 → 전체 fallback", async () => {
  const partialGen: ReasonGenerator = {
    modelName: "mock-claude",
    async generate({ topCandidates }) {
      const m = new Map<string, string>();
      // 첫번째 후보만 반환
      m.set(topCandidates[0].instructorId, "정상 사유 텍스트입니다.");
      return m;
    },
  };
  const result = await generateRecommendations(project, candidates, partialGen, 3);
  assert.equal(result.model, null);
  for (const c of result.candidates) {
    assert.equal(c.source, "fallback");
  }
});

test("generateRecommendations: 후보 0명일 때 빈 결과 반환", async () => {
  const result = await generateRecommendations(project, [], null, 3);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.projectId, "proj-1");
});
