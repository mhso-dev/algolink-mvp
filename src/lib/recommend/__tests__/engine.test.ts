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

// SPEC-SKILL-ABSTRACT-001: proficiency 필드 제거 — binary 매칭.
const candidates: CandidateInput[] = [
  {
    instructorId: "ins-A",
    displayName: "강사 A",
    // 2/2 매칭 → skillMatch = 1.0
    skills: [{ skillId: SK_PY }, { skillId: SK_DJ }],
    schedules: [],
    reviews: { meanScore: 4.6, count: 8 },
  },
  {
    instructorId: "ins-B",
    displayName: "강사 B",
    // 1/2 매칭 → skillMatch = 0.5
    skills: [{ skillId: SK_PY }],
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

// ---------------------------------------------------------------------------
// SPEC-RECOMMEND-001 — engine 측면 회귀 가드 (REQ-RECOMMEND-004 / 001)
// ---------------------------------------------------------------------------

test("generateRecommendations: reasonGen=null 시 model=null + 모든 source='fallback'", async () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-004 — runRecommendationAction 이 항상 null 을 전달.
  // 명시적 null 케이스에서 result.model === null + 모든 source === "fallback" 보장.
  const result = await generateRecommendations(project, candidates, null, 3);
  assert.equal(result.model, null);
  assert.ok(result.candidates.length > 0);
  assert.ok(
    result.candidates.every((c) => c.source === "fallback"),
    `모든 후보 source 가 'fallback' 이어야 한다. 실제: ${result.candidates.map((c) => c.source).join(",")}`,
  );
});

test("generateRecommendations: tier sort 결과가 candidates 배열 순서로 유지", async () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-001 — engine 레벨에서도 score.ts tier sort 가
  // 결과 배열 순서로 보존되어야 한다. 입력 순서 [avail=0/score=0.7, avail=1/score=0.6]
  // → 출력 순서 [avail=1/score=0.6, avail=0/score=0.7] (tier-1 우선).
  const SK_PY_LOCAL = "skill-python";
  const SK_DJ_LOCAL = "skill-django";
  const localCandidates: CandidateInput[] = [
    {
      instructorId: "ins-A",
      displayName: "A",
      // 2/2 매칭 → skillMatch = 1.0
      skills: [{ skillId: SK_PY_LOCAL }, { skillId: SK_DJ_LOCAL }],
      schedules: [
        {
          kind: "unavailable",
          startsAt: new Date("2026-05-12"),
          endsAt: new Date("2026-05-13"),
        },
      ],
      // availability = 0 (오버랩)
      reviews: { meanScore: 5, count: 3 }, // satisfaction = 1.0
      // finalScore = 0.5*1.0 + 0.3*0 + 0.2*1.0 = 0.7
    },
    {
      instructorId: "ins-B",
      displayName: "B",
      // 1/2 매칭 → skillMatch = 0.5
      skills: [{ skillId: SK_PY_LOCAL }],
      schedules: [],
      // availability = 1
      reviews: { meanScore: 3, count: 2 }, // satisfaction = 0.5
      // finalScore = 0.5*0.5 + 0.3*1 + 0.2*0.5 = 0.65
    },
  ];
  const result = await generateRecommendations(project, localCandidates, null, 3);
  assert.equal(result.candidates.length, 2);
  // tier-1 우선 → availability=1 인 ins-B 가 candidates[0].
  assert.equal(result.candidates[0].instructorId, "ins-B");
  assert.equal(result.candidates[0].availability, 1);
  assert.equal(result.candidates[1].instructorId, "ins-A");
  assert.equal(result.candidates[1].availability, 0);
});
