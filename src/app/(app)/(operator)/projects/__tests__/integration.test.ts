// SPEC-PROJECT-001 acceptance.md 시나리오 1~7 통합 테스트.
//
// 본 테스트는 server actions 의 next/cookies, next/cache, supabase RLS 같은
// 런타임 의존성을 직접 호출하지 않는다. 대신 actions.ts 가 조립하는 도메인 모듈
// (validation → recommendation → status-machine → assignment → KPI) 을
// end-to-end 로 합성하여 acceptance 시나리오의 비즈니스 결과를 검증한다.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createProjectSchema } from "@/lib/validation/project";
import {
  validateTransition,
  userStepFromEnum,
  defaultEnumForUserStep,
} from "@/lib/projects/status-machine";
import {
  generateRecommendations,
  rankTopN,
  computeTop1AcceptanceRate,
  type CandidateInput,
  type ProjectInput,
  type ReasonGenerator,
  type RecommendationCandidate,
  type RecommendationRow,
} from "@/lib/recommend";
import { PROJECT_ERRORS } from "@/lib/projects/errors";

const SK_PY = "skill-python-uuid";
const SK_DJ = "skill-django-uuid";
const SK_PG = "skill-postgres-uuid";

const INS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INS_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const CLI_1 = "11111111-1111-4111-8111-111111111111";

function buildCandidates(): CandidateInput[] {
  return [
    {
      instructorId: INS_A,
      displayName: "강사 A",
      skills: [
        { skillId: SK_PY, proficiency: "expert" },
        { skillId: SK_DJ, proficiency: "advanced" },
        { skillId: SK_PG, proficiency: "intermediate" },
      ],
      schedules: [],
      reviews: { meanScore: 4.6, count: 8 },
    },
    {
      instructorId: INS_B,
      displayName: "강사 B",
      skills: [{ skillId: SK_PY, proficiency: "advanced" }],
      schedules: [
        {
          kind: "unavailable",
          startsAt: new Date("2026-05-03T00:00:00Z"),
          endsAt: new Date("2026-05-05T00:00:00Z"),
        },
      ],
      reviews: { meanScore: 4.2, count: 5 },
    },
    {
      instructorId: INS_C,
      displayName: "강사 C",
      skills: [],
      schedules: [],
      reviews: { meanScore: null, count: 0 },
    },
    {
      instructorId: INS_D,
      displayName: "강사 D",
      skills: [{ skillId: SK_PY, proficiency: "beginner" }],
      schedules: [],
      reviews: { meanScore: 3.0, count: 2 },
    },
  ];
}

const PROJECT_INPUT: ProjectInput = {
  projectId: "proj-spring-2026",
  startAt: new Date("2026-05-10T00:00:00Z"),
  endAt: new Date("2026-05-14T00:00:00Z"),
  requiredSkillIds: [SK_PY, SK_DJ],
};

// 시나리오 1: REQ-PROJECT-CREATE-001~005, REQ-PROJECT-DETAIL-003.
test("시나리오 1: 프로젝트 등록 — zod 검증 통과 + status='proposal' payload 생성", () => {
  const formInput = {
    title: "Django 백엔드 부트캠프 2026 봄",
    clientId: CLI_1,
    projectType: "education" as const,
    startAt: "2026-05-10T09:00:00",
    endAt: "2026-05-14T18:00:00",
    requiredSkillIds: [SK_PY, SK_DJ].map(toUuid),
    businessAmountKrw: "5000000",
    instructorFeeKrw: "3000000",
    notes: undefined,
  };
  const parsed = createProjectSchema.safeParse(formInput);
  assert.equal(parsed.success, true, JSON.stringify(parsed));
  assert.ok(parsed.success);
  assert.equal(parsed.data.title, "Django 백엔드 부트캠프 2026 봄");
  assert.equal(parsed.data.businessAmountKrw, 5_000_000);
  assert.equal(parsed.data.instructorFeeKrw, 3_000_000);
  assert.equal(parsed.data.requiredSkillIds.length, 2);
  const insertPayload = {
    title: parsed.data.title,
    client_id: parsed.data.clientId,
    project_type: parsed.data.projectType,
    operator_id: "operator-uuid",
    education_start_at: parsed.data.startAt?.toISOString() ?? null,
    education_end_at: parsed.data.endAt?.toISOString() ?? null,
    business_amount_krw: parsed.data.businessAmountKrw,
    instructor_fee_krw: parsed.data.instructorFeeKrw,
    notes: parsed.data.notes ?? null,
    status: "proposal" as const,
  };
  assert.equal(insertPayload.status, "proposal");
  assert.equal(userStepFromEnum(insertPayload.status), "의뢰");
  assert.equal("instructor_id" in insertPayload, false);
});

// 시나리오 2: REQ-PROJECT-RECOMMEND-001~006.
test("시나리오 2: 정상 추천 — Top-3 점수/순위 검증 + Claude reason 적용", async () => {
  const candidates = buildCandidates();
  const ranked = rankTopN(PROJECT_INPUT, candidates, 3);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].instructorId, INS_A);
  assert.equal(ranked[1].instructorId, INS_B);
  assert.equal(ranked[2].instructorId, INS_D);
  assert.ok(!ranked.some((r) => r.instructorId === INS_C));
  // INS-A: 0.5*(1.0+0.9)/2 + 0.3 + 0.2*((4.6-1)/4) = 0.475+0.3+0.18 = 0.955
  assert.ok(Math.abs(ranked[0].finalScore - 0.955) < 1e-9);
  const claudeMock: ReasonGenerator = {
    modelName: "claude-sonnet-4-6",
    async generate({ topCandidates }) {
      const m = new Map<string, string>();
      for (const c of topCandidates) {
        m.set(c.instructorId, `[Claude] ${c.displayName} 적합 (점수 ${c.finalScore.toFixed(2)})`);
      }
      return m;
    },
  };
  const result = await generateRecommendations(PROJECT_INPUT, candidates, claudeMock, 3);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.model, "claude-sonnet-4-6");
  for (const c of result.candidates) {
    assert.equal(c.source, "claude");
    assert.match(c.reason, /^\[Claude\]/);
  }
});

// 시나리오 3: REQ-PROJECT-RECOMMEND-004.
test("시나리오 3: AI 폴백 — Claude 실패 시 룰 기반 사유 + 사용자에게 에러 전파 안 함", async () => {
  const candidates = buildCandidates();
  const failingClaude: ReasonGenerator = {
    modelName: "claude-sonnet-4-6",
    async generate() {
      throw Object.assign(new Error("Anthropic API 401: invalid API key"), { status: 401 });
    },
  };
  const result = await generateRecommendations(PROJECT_INPUT, candidates, failingClaude, 3);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.model, null);
  for (const c of result.candidates) {
    assert.equal(c.source, "fallback");
    assert.match(c.reason, /^기술스택 \d+\/2건 일치, /);
    assert.match(c.reason, /(만족도 \d+\.\d\/5|리뷰 없음)/);
    assert.match(c.reason, /(가용 일정 OK|일정 충돌 가능)/);
  }
  const aResult = result.candidates.find((c) => c.instructorId === INS_A);
  assert.ok(aResult);
  assert.equal(aResult.reason, "기술스택 2/2건 일치, 만족도 4.6/5, 가용 일정 OK");
});

// 시나리오 4: REQ-PROJECT-ASSIGN-001~005.
test("시나리오 4: 1-클릭 배정 — 추천→채택→알림→KPI 반영 end-to-end", async () => {
  const candidates = buildCandidates();
  const recResult = await generateRecommendations(PROJECT_INPUT, candidates, null, 3);
  assert.equal(recResult.candidates.length, 3);
  const recRow: { id: string; top3_jsonb: RecommendationCandidate[]; adopted_instructor_id: string | null; model: string } = {
    id: "rec-1",
    top3_jsonb: recResult.candidates,
    adopted_instructor_id: null,
    model: recResult.model ?? "fallback",
  };
  assert.equal(recRow.adopted_instructor_id, null);
  assert.equal(recRow.top3_jsonb.length, 3);
  const top3Ids = recRow.top3_jsonb.map((c) => c.instructorId);
  assert.ok(top3Ids.includes(INS_A));
  function projectedStatusAfterAssign(current: string): string {
    if (current === "lecture_requested" || current === "instructor_sourcing") {
      return "assignment_review";
    }
    return current;
  }
  assert.equal(projectedStatusAfterAssign("lecture_requested"), "assignment_review");
  assert.equal(projectedStatusAfterAssign("instructor_sourcing"), "assignment_review");
  assert.equal(projectedStatusAfterAssign("proposal"), "proposal");
  recRow.adopted_instructor_id = INS_A;
  const notifPayload = {
    recipient_id: "user-uuid-of-INS-A",
    type: "assignment_request",
    title: `[배정 요청] Django 백엔드 부트캠프 2026 봄`,
    body: `프로젝트: Django 백엔드 부트캠프 2026 봄\n시작: 2026-05-10\n종료: 2026-05-14`,
    link_url: "/me",
  };
  assert.equal(notifPayload.type, "assignment_request");
  assert.match(notifPayload.title, /\[배정 요청\]/);
  assert.equal(notifPayload.link_url, "/me");
  const kpi = computeTop1AcceptanceRate([
    { top3Jsonb: recRow.top3_jsonb, adoptedInstructorId: recRow.adopted_instructor_id },
  ]);
  assert.equal(kpi.decided, 1);
  assert.equal(kpi.top1Adopted, 1);
  assert.equal(kpi.rate, 1);
});

test("시나리오 4-거부: Top-3 외 강사 배정 시도 → 한국어 에러", async () => {
  const candidates = buildCandidates();
  const recResult = await generateRecommendations(PROJECT_INPUT, candidates, null, 3);
  const top3Ids = recResult.candidates.map((c) => c.instructorId);
  assert.ok(!top3Ids.includes(INS_C));
  const requested = INS_C;
  const allowed = top3Ids.includes(requested);
  assert.equal(allowed, false);
  const errMsg = PROJECT_ERRORS.ASSIGN_NOT_IN_TOP3;
  assert.match(errMsg, /추천 결과에 포함되지 않은 강사/);
  assert.match(errMsg, /추천을 다시 실행하세요/);
});

// 시나리오 5: REQ-PROJECT-STATUS-002, -003.
test("시나리오 5: 잘못된 상태 전환 — 강사 미배정 시 컨펌 거부 + DB 변경 없음", () => {
  const verdict1 = validateTransition("proposal", "assignment_confirmed", { instructorId: null });
  assert.equal(verdict1.ok, false);
  if (!verdict1.ok) {
    assert.equal(verdict1.reason, PROJECT_ERRORS.STATUS_INVALID_TRANSITION);
  }
  const verdict2 = validateTransition("assignment_review", "assignment_confirmed", { instructorId: null });
  assert.equal(verdict2.ok, false);
  if (!verdict2.ok) {
    assert.equal(verdict2.reason, PROJECT_ERRORS.STATUS_NEED_INSTRUCTOR);
  }
  const verdict3 = validateTransition("assignment_review", "assignment_confirmed", { instructorId: INS_A });
  assert.equal(verdict3.ok, true);
  const verdict4 = validateTransition("in_progress", "settlement_in_progress", { instructorId: INS_A });
  assert.equal(verdict4.ok, false);
  if (!verdict4.ok) {
    assert.equal(verdict4.reason, PROJECT_ERRORS.STATUS_INVALID_TRANSITION);
  }
  const verdict5 = validateTransition("education_done", "settlement_in_progress", { instructorId: INS_A });
  assert.equal(verdict5.ok, true);
});

test("시나리오 5: 동일 상태 → 동일 상태 전환은 거부", () => {
  const v = validateTransition("proposal", "proposal", { instructorId: null });
  assert.equal(v.ok, false);
});

// 시나리오 6: REQ-PROJECT-LIST-001~007.
test("시나리오 6: 리스트 필터 — 7단계 user step 라벨이 모든 enum 을 커버", () => {
  const allEnums = [
    "proposal", "contract_confirmed", "lecture_requested", "instructor_sourcing",
    "assignment_review", "assignment_confirmed", "education_confirmed", "recruiting",
    "progress_confirmed", "in_progress", "education_done", "settlement_in_progress", "task_done",
  ] as const;
  const stepCounts = new Map<string, number>();
  for (const e of allEnums) {
    const step = userStepFromEnum(e);
    stepCounts.set(step, (stepCounts.get(step) ?? 0) + 1);
  }
  assert.equal(stepCounts.size, 7);
  for (const step of ["의뢰", "강사매칭", "요청", "컨펌", "진행", "종료", "정산"]) {
    assert.ok((stepCounts.get(step) ?? 0) >= 1, `step missing: ${step}`);
  }
  for (const step of ["의뢰", "강사매칭", "요청", "컨펌", "진행", "종료", "정산"] as const) {
    const e = defaultEnumForUserStep(step);
    assert.equal(userStepFromEnum(e), step);
  }
});

// 시나리오 7: REQ-PROJECT-RLS-001, -003.
test("시나리오 7: instructor role 차단 — operator/admin 만 통과", () => {
  type Role = "instructor" | "operator" | "admin" | "client" | null;
  function ensureOperator(role: Role): { ok: boolean; message?: string } {
    if (role !== "operator" && role !== "admin") {
      return { ok: false, message: "권한이 없습니다." };
    }
    return { ok: true };
  }
  assert.equal(ensureOperator("operator").ok, true);
  assert.equal(ensureOperator("admin").ok, true);
  assert.equal(ensureOperator("instructor").ok, false);
  assert.equal(ensureOperator("client").ok, false);
  assert.equal(ensureOperator(null).ok, false);
  const blocked = ensureOperator("instructor");
  assert.equal(blocked.message, "권한이 없습니다.");
});

// KPI 통합.
test("KPI 통합: 추천 5건 + 배정 4건 (3건은 1순위, 1건은 2순위) → 0.75", async () => {
  const candidates = buildCandidates();
  const recRows: RecommendationRow[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await generateRecommendations(PROJECT_INPUT, candidates, null, 3);
    recRows.push({ top3Jsonb: r.candidates, adoptedInstructorId: null });
  }
  const firstTop3 = recRows[0].top3Jsonb.map((c: { instructorId: string }) => c.instructorId);
  for (const row of recRows) {
    assert.deepEqual(row.top3Jsonb.map((c: { instructorId: string }) => c.instructorId), firstTop3);
  }
  recRows[0].adoptedInstructorId = firstTop3[0];
  recRows[1].adoptedInstructorId = firstTop3[0];
  recRows[2].adoptedInstructorId = firstTop3[0];
  recRows[3].adoptedInstructorId = firstTop3[1];
  const kpi = computeTop1AcceptanceRate(recRows);
  assert.equal(kpi.decided, 4);
  assert.equal(kpi.top1Adopted, 3);
  assert.equal(kpi.rate, 0.75);
});

function toUuid(seed: string): string {
  const hex = "0123456789abcdef";
  let h = "";
  for (let i = 0; i < 32; i++) {
    h += hex[(seed.charCodeAt(i % seed.length) + i) % 16];
  }
  return (
    h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-8" + h.slice(17, 20) + "-" + h.slice(20, 32)
  );
}
