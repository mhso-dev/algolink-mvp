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
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-003 — tier-3 (instructorId asc) 검증.
  // 두 후보 모두 schedule=[] → availability=1 (tier-1 동률),
  // 동일 skills+reviews → finalScore 동률 (tier-2 동률) → tier-3 instructorId asc 가 결정.
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

// ---------------------------------------------------------------------------
// SPEC-RECOMMEND-001 — 3-tier 안정 정렬 (REQ-RECOMMEND-001/002/003)
// 신규 비교자: availability desc → finalScore desc → instructorId asc
// ---------------------------------------------------------------------------

test("rankTopN: tier-1 (availability) 우선 정렬", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-001 — tier-1 availability 가 최상위 키.
  // ins-A: 스킬/만족도 우수하나 일정 충돌 (availability=0, finalScore=0.7)
  // ins-B: 스킬/만족도 보통이나 일정 OK (availability=1, finalScore=0.6)
  // 기존 정책(단일 키 finalScore desc): ins-A 1순위.
  // 신규 정책(tier-1 availability desc 우선): ins-B 1순위.
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-A",
      displayName: "A",
      skills: [
        { skillId: SK_PY, proficiency: "expert" }, // 1.0
        { skillId: SK_DJ, proficiency: "expert" }, // 1.0
      ],
      // (1.0 + 1.0) / 2 = 1.0 skillMatch
      schedules: [
        {
          kind: "unavailable",
          startsAt: new Date("2026-05-12"),
          endsAt: new Date("2026-05-13"),
        },
      ],
      // unavailable overlaps project → availability=0
      reviews: { meanScore: 5, count: 3 }, // satisfaction = (5-1)/4 = 1.0
    },
    // finalScore = 0.5*1.0 + 0.3*0 + 0.2*1.0 = 0.7
    {
      instructorId: "ins-B",
      displayName: "B",
      skills: [
        { skillId: SK_PY, proficiency: "beginner" }, // 0.4
        { skillId: SK_DJ, proficiency: "beginner" }, // 0.4
      ],
      // (0.4 + 0.4) / 2 = 0.4 skillMatch
      schedules: [],
      // availability = 1
      reviews: { meanScore: 3, count: 2 }, // satisfaction = (3-1)/4 = 0.5
    },
    // finalScore = 0.5*0.4 + 0.3*1 + 0.2*0.5 = 0.2 + 0.3 + 0.1 = 0.6
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.equal(top.length, 2);
  // tier-1 으로 availability=1 인 ins-B 가 1순위.
  assert.equal(top[0].instructorId, "ins-B");
  assert.equal(top[0].availability, 1);
  // ins-A 는 availability=0 후순위.
  assert.equal(top[1].instructorId, "ins-A");
  assert.equal(top[1].availability, 0);
  // ins-A 의 finalScore 가 ins-B 보다 큼에도 후순위인 것이 핵심.
  assert.ok(top[1].finalScore > top[0].finalScore);
});

test("rankTopN: tier-2 (finalScore) — availability 동일 시", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-001 — tier-1 동률 시 tier-2 finalScore 적용.
  // 두 후보 모두 schedule=[] → availability=1 (tier-1 동률).
  // ins-A: finalScore 0.955, ins-C: finalScore 0.5.
  // 입력 순서를 점수 낮은 후보 먼저 두어 정렬이 실제로 동작하는지 확인.
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-C",
      displayName: "C",
      skills: [{ skillId: SK_PY, proficiency: "beginner" }],
      // skillMatch = 0.4 / 2 = 0.2
      schedules: [],
      reviews: { meanScore: 3, count: 2 },
      // satisfaction = 0.5 → finalScore = 0.5*0.2 + 0.3*1 + 0.2*0.5 = 0.5
    },
    {
      instructorId: "ins-A",
      displayName: "A",
      skills: [
        { skillId: SK_PY, proficiency: "expert" },
        { skillId: SK_DJ, proficiency: "advanced" },
      ],
      // skillMatch = (1.0 + 0.9) / 2 = 0.95
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
      // satisfaction = 0.9 → finalScore = 0.5*0.95 + 0.3*1 + 0.2*0.9 = 0.955
    },
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.equal(top[0].instructorId, "ins-A");
  assert.equal(top[1].instructorId, "ins-C");
  assert.ok(top[0].finalScore > top[1].finalScore);
});

test("rankTopN: 3-tier 통합 시나리오 — 3명 동일 (availability, finalScore)", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-003 — 3명 후보가 (availability, finalScore) 모두 동률일 때
  // tier-3 instructorId asc 로 결정. 입력 순서를 무작위로 두어 실제 정렬을 검증.
  const baseSkills = [
    { skillId: SK_PY, proficiency: "expert" as const },
    { skillId: SK_DJ, proficiency: "advanced" as const },
  ];
  const cands: CandidateInput[] = [
    {
      instructorId: "ins-C",
      displayName: "C",
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
    {
      instructorId: "ins-B",
      displayName: "B",
      skills: baseSkills,
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
  ];
  const top = rankTopN(projectA, cands, 3);
  assert.deepEqual(
    top.map((t) => t.instructorId),
    ["ins-A", "ins-B", "ins-C"],
  );
  // 모든 후보 (availability, finalScore) 동률.
  assert.ok(top.every((t) => t.availability === 1));
  assert.ok(top.every((t) => Math.abs(t.finalScore - top[0].finalScore) < 1e-9));
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
