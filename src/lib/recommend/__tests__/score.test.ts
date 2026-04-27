// SPEC-PROJECT-001 §5.4 — 추천 점수 함수 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAvailability,
  computeFinalScore,
  computeSatisfaction,
  computeSkillMatch,
  rankTopN,
  scoreCandidate,
} from "../score";
import { SATISFACTION_PRIOR, type CandidateInput, type ProjectInput } from "../types";

const SK_PY = "skill-python";
const SK_DJ = "skill-django";
const SK_TS = "skill-typescript";

const projectA: ProjectInput = {
  projectId: "p1",
  startAt: new Date("2026-05-10T00:00:00Z"),
  endAt: new Date("2026-05-14T00:00:00Z"),
  requiredSkillIds: [SK_PY, SK_DJ],
};

test("computeSkillMatch: 2/2 매칭 (expert+advanced)", () => {
  const r = computeSkillMatch(
    [SK_PY, SK_DJ],
    [
      { skillId: SK_PY, proficiency: "expert" },
      { skillId: SK_DJ, proficiency: "advanced" },
    ],
  );
  // (1.0 + 0.9) / 2 = 0.95
  assert.ok(Math.abs(r.score - 0.95) < 1e-9);
  assert.deepEqual(r.matchedSkillIds.sort(), [SK_DJ, SK_PY].sort());
});

test("computeSkillMatch: 1/2 매칭 (beginner)", () => {
  const r = computeSkillMatch(
    [SK_PY, SK_DJ],
    [{ skillId: SK_PY, proficiency: "beginner" }],
  );
  // 0.4 / 2 = 0.2
  assert.ok(Math.abs(r.score - 0.2) < 1e-9);
});

test("computeSkillMatch: 0/2 매칭 → 0", () => {
  const r = computeSkillMatch(
    [SK_PY, SK_DJ],
    [{ skillId: SK_TS, proficiency: "expert" }],
  );
  assert.equal(r.score, 0);
});

test("computeAvailability: 일정 없음 → 1", () => {
  const v = computeAvailability(
    [],
    new Date("2026-05-10"),
    new Date("2026-05-14"),
  );
  assert.equal(v, 1);
});

test("computeAvailability: unavailable 오버랩 → 0", () => {
  const v = computeAvailability(
    [
      {
        kind: "unavailable",
        startsAt: new Date("2026-05-12"),
        endsAt: new Date("2026-05-13"),
      },
    ],
    new Date("2026-05-10"),
    new Date("2026-05-14"),
  );
  assert.equal(v, 0);
});

test("computeAvailability: system_lecture 오버랩 → 0", () => {
  const v = computeAvailability(
    [
      {
        kind: "system_lecture",
        startsAt: new Date("2026-05-13T09:00:00Z"),
        endsAt: new Date("2026-05-13T18:00:00Z"),
      },
    ],
    new Date("2026-05-10"),
    new Date("2026-05-14"),
  );
  assert.equal(v, 0);
});

test("computeAvailability: personal 일정은 무시 → 1", () => {
  const v = computeAvailability(
    [
      {
        kind: "personal",
        startsAt: new Date("2026-05-12"),
        endsAt: new Date("2026-05-13"),
      },
    ],
    new Date("2026-05-10"),
    new Date("2026-05-14"),
  );
  assert.equal(v, 1);
});

test("computeAvailability: 기간 외 일정 → 1", () => {
  const v = computeAvailability(
    [
      {
        kind: "unavailable",
        startsAt: new Date("2026-04-01"),
        endsAt: new Date("2026-04-02"),
      },
    ],
    new Date("2026-05-10"),
    new Date("2026-05-14"),
  );
  assert.equal(v, 1);
});

test("computeSatisfaction: 리뷰 0건 → SATISFACTION_PRIOR (0.6)", () => {
  assert.equal(
    computeSatisfaction({ meanScore: null, count: 0 }),
    SATISFACTION_PRIOR,
  );
});

test("computeSatisfaction: mean 5 → 1.0, mean 1 → 0", () => {
  assert.equal(computeSatisfaction({ meanScore: 5, count: 3 }), 1);
  assert.equal(computeSatisfaction({ meanScore: 1, count: 3 }), 0);
});

test("computeSatisfaction: mean 4.6 → 0.9", () => {
  assert.ok(
    Math.abs(computeSatisfaction({ meanScore: 4.6, count: 8 }) - 0.9) < 1e-9,
  );
});

test("computeFinalScore: 가중치 0.5/0.3/0.2 검증", () => {
  // skillMatch=0.95, availability=1, satisfaction=0.9
  // 0.5*0.95 + 0.3*1 + 0.2*0.9 = 0.475 + 0.3 + 0.18 = 0.955
  const v = computeFinalScore(0.95, 1, 0.9);
  assert.ok(Math.abs(v - 0.955) < 1e-9);
});

test("scoreCandidate: 종합 점수 검증 (강사 A 시나리오)", () => {
  const cand: CandidateInput = {
    instructorId: "ins-A",
    displayName: "강사 A",
    skills: [
      { skillId: SK_PY, proficiency: "expert" },
      { skillId: SK_DJ, proficiency: "advanced" },
    ],
    schedules: [],
    reviews: { meanScore: 4.6, count: 8 },
  };
  const s = scoreCandidate(projectA, cand);
  assert.ok(Math.abs(s.skillMatch - 0.95) < 1e-9);
  assert.equal(s.availability, 1);
  assert.ok(Math.abs(s.satisfaction - 0.9) < 1e-9);
  assert.ok(Math.abs(s.finalScore - 0.955) < 1e-9);
});

test("rankTopN: 4명 → Top-3, skillMatch=0 후보 제외", () => {
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-A",
      displayName: "A",
      skills: [
        { skillId: SK_PY, proficiency: "expert" },
        { skillId: SK_DJ, proficiency: "advanced" },
      ],
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
    {
      instructorId: "ins-B",
      displayName: "B",
      skills: [{ skillId: SK_PY, proficiency: "advanced" }],
      schedules: [],
      reviews: { meanScore: 4.2, count: 5 },
    },
    {
      instructorId: "ins-C",
      displayName: "C",
      skills: [{ skillId: SK_TS, proficiency: "expert" }], // skillMatch = 0 → 제외
      schedules: [],
      reviews: { meanScore: null, count: 0 },
    },
    {
      instructorId: "ins-D",
      displayName: "D",
      skills: [{ skillId: SK_PY, proficiency: "beginner" }],
      schedules: [],
      reviews: { meanScore: 3.0, count: 2 },
    },
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].instructorId, "ins-A");
  assert.equal(top[1].instructorId, "ins-B");
  assert.equal(top[2].instructorId, "ins-D");
  // C 는 제외
  assert.ok(!top.some((t) => t.instructorId === "ins-C"));
});

test("rankTopN: 동점 시 instructorId 사전순 stable sort", () => {
  const baseSkills = [
    { skillId: SK_PY, proficiency: "expert" as const },
    { skillId: SK_DJ, proficiency: "advanced" as const },
  ];
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-Z",
      displayName: "Z",
      skills: baseSkills,
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
    {
      instructorId: "ins-A",
      displayName: "A",
      skills: baseSkills,
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.equal(top[0].instructorId, "ins-A");
  assert.equal(top[1].instructorId, "ins-Z");
});

test("rankTopN: 후보가 N 미만일 때 가능한 만큼 반환", () => {
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-A",
      displayName: "A",
      skills: [{ skillId: SK_PY, proficiency: "expert" }],
      schedules: [],
      reviews: { meanScore: 5, count: 1 },
    },
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.equal(top.length, 1);
});
