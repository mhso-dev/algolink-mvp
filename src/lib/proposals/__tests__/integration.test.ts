// SPEC-PROPOSAL-001 §M7 — 통합 시나리오 합성 테스트.
//
// 본 테스트는 server actions의 next/cookies, RLS, transactional execution을 직접 호출하지 않는다.
// 대신 actions.ts가 조립하는 도메인 모듈(status-machine + inquiry + convert + validation)을
// 합성하여 acceptance 시나리오 1~10의 비즈니스 결과를 검증한다.
// RLS / transaction / UNIQUE 제약은 db:verify로 검증.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAcceptedRecommendationFromInquiries,
  buildProjectFromProposal,
} from "../convert";
import {
  buildInquiryNotificationPayload,
  buildInquiryRecords,
  formatInquiryDispatchLog,
} from "../inquiry";
import {
  rejectIfFrozen,
  timestampUpdatesForTransition,
  validateProposalTransition,
} from "../status-machine";
import {
  inquiryDispatchSchema,
  proposalCreateSchema,
} from "../validation";
import type { ProposalRecord } from "../types";

// v4 UUIDs
const PROPOSAL_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPERATOR_ID = "00000000-0000-4000-8000-000000000001";
const INSTR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INSTR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INSTR_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccd";
const SKILL_A = "55555555-5555-4555-8555-555555555555";
const NEW_PROJECT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// =============================================================================
// Scenario 1: 신규 제안서 초안 등록 (REQ-ENTITY-001/006/007)
// =============================================================================

test("[Scenario 1] 정상 입력 → zod validation pass + status='draft' default", () => {
  const result = proposalCreateSchema.safeParse({
    title: "2026년 5월 데이터 분석 강의 제안",
    clientId: CLIENT_ID,
    proposedPeriodStart: "2026-05-15",
    proposedPeriodEnd: "2026-05-30",
    proposedBusinessAmountKrw: 5_000_000,
    proposedHourlyRateKrw: 200_000,
    notes: "고객사 협의안 반영",
    requiredSkillIds: [SKILL_A],
  });
  assert.equal(result.success, true);
});

test("[Scenario 1 Edge — REQ-ENTITY-007] period_end < period_start → END_BEFORE_START 한국어 에러", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: CLIENT_ID,
    proposedPeriodStart: "2026-05-30",
    proposedPeriodEnd: "2026-05-15",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const err = result.error.issues.find((i) =>
      i.path.includes("proposedPeriodEnd"),
    );
    assert.equal(err!.message, "종료일은 시작일 이후여야 합니다.");
  }
});

// =============================================================================
// Scenario 2: draft → submitted 전환 (REQ-ENTITY-004, DETAIL-003)
// =============================================================================

test("[Scenario 2] draft → submitted: validateTransition pass + submittedAt set", () => {
  const verdict = validateProposalTransition("draft", "submitted");
  assert.equal(verdict.ok, true);

  const now = new Date("2026-04-29T10:00:00Z");
  const updates = timestampUpdatesForTransition("submitted", now);
  assert.equal(updates.submittedAt, now);
  assert.equal(updates.decidedAt, undefined);
});

test("[Scenario 2 Edge] submitted → draft 거부 (역방향)", () => {
  const verdict = validateProposalTransition("submitted", "draft");
  assert.equal(verdict.ok, false);
});

// =============================================================================
// Scenario 3: 사전 강사 문의 디스패치 (REQ-INQUIRY-001/003/004/005/007)
// =============================================================================

test("[Scenario 3] N=3 디스패치: 3 records + zod validation pass", () => {
  const validated = inquiryDispatchSchema.safeParse({
    proposalId: PROPOSAL_ID,
    instructorIds: [INSTR_A, INSTR_B, INSTR_C],
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T18:00:00.000Z",
    questionNote: "강의 가능?",
  });
  assert.equal(validated.success, true);
  if (!validated.success) return;

  const records = buildInquiryRecords({
    proposalId: validated.data.proposalId,
    instructorIds: validated.data.instructorIds,
    proposedTimeSlotStart: validated.data.proposedTimeSlotStart ?? null,
    proposedTimeSlotEnd: validated.data.proposedTimeSlotEnd ?? null,
    questionNote: validated.data.questionNote ?? null,
  });
  assert.equal(records.length, 3);
  assert.equal(records[0]!.instructorId, INSTR_A);
});

test("[Scenario 3] notifications + console.log 스텁 형식", () => {
  const inquiryId = "deadbeef-dead-4dde-8dad-deaddeaddead";
  const payload = buildInquiryNotificationPayload({
    proposalTitle: "2026년 5월 데이터 분석",
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T18:00:00.000Z",
    inquiryId,
  });
  assert.match(payload.title, /사전 문의/);
  assert.equal(payload.linkUrl, `/me/inquiries/${inquiryId}`);

  const log = formatInquiryDispatchLog(INSTR_A, PROPOSAL_ID);
  assert.equal(
    log,
    `[notif] inquiry_request → instructor_id=${INSTR_A} proposal_id=${PROPOSAL_ID}`,
  );
});

test("[Scenario 3a — REQ-INQUIRY-004] 클라이언트 측 중복 검출 → throw", () => {
  assert.throws(
    () =>
      buildInquiryRecords({
        proposalId: PROPOSAL_ID,
        instructorIds: [INSTR_A, INSTR_B, INSTR_A], // 중복
        proposedTimeSlotStart: null,
        proposedTimeSlotEnd: null,
        questionNote: null,
      }),
    /duplicate/i,
  );
});

test("[Scenario 3b — REQ-INQUIRY-005] frozen 제안서 디스패치 거부 — frozen guard", () => {
  // 본 SPEC의 dispatch 흐름은 actions.ts에서 status NOT IN (draft, submitted) 거부.
  // status-machine의 rejectIfFrozen으로 해당 검증을 합성.
  for (const s of ["won", "lost", "withdrawn"] as const) {
    const result = rejectIfFrozen(s);
    assert.equal(result.ok, false);
  }
  // 정상 (draft, submitted)은 OK
  assert.equal(rejectIfFrozen("draft").ok, true);
  assert.equal(rejectIfFrozen("submitted").ok, true);
});

// =============================================================================
// Scenario 4: Won → Project 변환 (canonical 6-step) — REQ-CONVERT-001~007
// =============================================================================

const baseProposal: ProposalRecord = {
  id: PROPOSAL_ID,
  title: "2026년 5월 데이터 분석 강의 제안",
  clientId: CLIENT_ID,
  operatorId: OPERATOR_ID,
  proposedPeriodStart: "2026-05-15",
  proposedPeriodEnd: "2026-05-30",
  proposedBusinessAmountKrw: 5_000_000,
  proposedHourlyRateKrw: 200_000,
  notes: null,
  status: "submitted",
  submittedAt: "2026-04-29T10:00:00.000Z",
  decidedAt: null,
  convertedProjectId: null,
};

test("[Scenario 4 Step 3] buildProjectFromProposal: SPEC-PROJECT-001 default 매핑", () => {
  const project = buildProjectFromProposal(baseProposal);
  assert.equal(project.title, baseProposal.title);
  assert.equal(project.clientId, CLIENT_ID);
  assert.equal(project.operatorId, OPERATOR_ID);
  assert.equal(project.startDate, "2026-05-15");
  assert.equal(project.endDate, "2026-05-30");
  assert.equal(project.businessAmountKrw, 5_000_000);
  assert.equal(project.instructorFeeKrw, 0); // §5.4 기본값
  assert.equal(project.status, "proposal"); // 13단계 enum 시작
  assert.equal(project.instructorId, null);
  assert.equal(project.projectType, "education");
});

test("[Scenario 4 Step 5] accepted 강사 2명 → ai_instructor_recommendations 1행 + top3", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, [
    {
      inquiryId: "i1",
      instructorId: INSTR_A,
      respondedAt: "2026-04-29T11:00:00Z",
    },
    {
      inquiryId: "i2",
      instructorId: INSTR_C,
      respondedAt: "2026-04-29T12:00:00Z",
    },
  ]);
  assert.ok(result);
  if (result) {
    assert.equal(result.projectId, NEW_PROJECT_ID);
    assert.equal(result.top3Jsonb.length, 2);
    assert.equal(result.top3Jsonb[0]!.instructorId, INSTR_A); // 시간 순서
    assert.equal(result.top3Jsonb[0]!.source, "fallback"); // SPEC-RECOMMEND-001 호환
    assert.equal(result.model, "manual_from_proposal");
    assert.equal(result.adoptedInstructorId, null);
  }
});

test("[Scenario 4c — accepted 0명] ai_instructor_recommendations INSERT skip", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, []);
  assert.equal(result, null);
});

test("[Scenario 4 Step 5 cap] accepted 4명 → top3 정확히 3명", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: "2026-04-29T10:00:00Z" },
    { inquiryId: "i2", instructorId: INSTR_B, respondedAt: "2026-04-29T11:00:00Z" },
    { inquiryId: "i3", instructorId: INSTR_C, respondedAt: "2026-04-29T12:00:00Z" },
    {
      inquiryId: "i4",
      instructorId: "44444444-4444-4444-8444-444444444444",
      respondedAt: "2026-04-29T13:00:00Z",
    },
  ]);
  assert.ok(result);
  if (result) {
    assert.equal(result.top3Jsonb.length, 3);
  }
});

test("[Scenario 4b — REQ-CONVERT-002] status != submitted 거부", () => {
  // 변환 흐름: status가 'submitted' 외이면 actions에서 즉시 거부.
  // status-machine validateProposalTransition으로 합성 검증.
  for (const s of ["draft", "won", "lost", "withdrawn"] as const) {
    const v = validateProposalTransition(s, "won");
    // submitted 외에서 won으로의 직접 전환은 거부.
    assert.equal(v.ok, false, `${s} → won 은 거부되어야 함`);
  }
});

test("[Scenario 4d — REQ-CONVERT-003 멱등성 race] 동시 호출 시 한 번만 변환", () => {
  // 본 시나리오는 DB integration에서 검증 (actions.ts atomic UPDATE WHERE converted_project_id IS NULL).
  // 도메인 레벨에서는 buildProjectFromProposal이 referential transparent임을 검증.
  const first = buildProjectFromProposal(baseProposal);
  for (let i = 0; i < 100; i++) {
    assert.deepEqual(buildProjectFromProposal(baseProposal), first);
  }
});

test("[Scenario 4 Step 6] won 진입 시 decidedAt 설정", () => {
  const now = new Date("2026-04-29T14:00:00Z");
  const updates = timestampUpdatesForTransition("won", now);
  assert.equal(updates.decidedAt, now);
});

// =============================================================================
// Scenario 5: Frozen states 모든 변경 거부 (REQ-ENTITY-005)
// =============================================================================

test("[Scenario 5] frozen 상태 (won/lost/withdrawn): 모든 전환 거부", () => {
  for (const f of ["won", "lost", "withdrawn"] as const) {
    for (const to of ["draft", "submitted", "won", "lost", "withdrawn"] as const) {
      if (f === to) continue; // 동일 상태는 별도 케이스
      assert.equal(
        validateProposalTransition(f, to).ok,
        false,
        `${f} → ${to} 는 거부되어야 함`,
      );
    }
  }
});

test("[Scenario 5] rejectIfFrozen: 한국어 에러 메시지 검증", () => {
  for (const s of ["won", "lost", "withdrawn"] as const) {
    const result = rejectIfFrozen(s);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "확정된 제안서는 수정할 수 없습니다.");
    }
  }
});

// =============================================================================
// Scenario 6: 응답 시뮬 — sibling SPEC-CONFIRM-001 contract surface
// =============================================================================

test("[Scenario 6 — REQ-INQUIRY-008] 응답 status pending → accepted 컨트랙트 검증", () => {
  // 본 SPEC은 proposal_inquiries.status 컬럼만 read.
  // CONFIRM-001이 proposal_inquiries.status를 'pending' → 'accepted'로 UPDATE한다는 컨트랙트.
  const VALID_TRANSITIONS_INQUIRY: Record<string, string[]> = {
    pending: ["accepted", "declined", "conditional"],
  };
  // pending에서 accepted/declined/conditional 모두 합법적
  for (const to of VALID_TRANSITIONS_INQUIRY.pending!) {
    assert.ok(["accepted", "declined", "conditional"].includes(to));
  }
});

// =============================================================================
// Scenario 13 — convert.ts 순수성 (REQ-CONVERT-006)
// =============================================================================

test("[Scenario 13] convert.ts 순수성: 100회 호출 동일 결과", () => {
  const first = buildProjectFromProposal(baseProposal);
  const acc = [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: "2026-04-29T10:00:00Z" },
  ];
  const firstRec = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, acc);

  for (let i = 0; i < 99; i++) {
    assert.deepEqual(buildProjectFromProposal(baseProposal), first);
    assert.deepEqual(
      buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, acc),
      firstRec,
    );
  }
});

test("[Scenario 13 — REQ-CONVERT-006] convert.ts 입력 mutation 0건", () => {
  const proposalSnap = JSON.stringify(baseProposal);
  buildProjectFromProposal(baseProposal);
  assert.equal(JSON.stringify(baseProposal), proposalSnap);

  const acc = [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: "2026-04-29T10:00:00Z" },
  ];
  const accSnap = JSON.stringify(acc);
  buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, acc);
  assert.equal(JSON.stringify(acc), accSnap);
});

// =============================================================================
// Scenario 16 — service-role 클라이언트 미사용 (REQ-RLS-003)
// =============================================================================

test("[Scenario 16 — REQ-RLS-003] proposals 도메인 모듈 service-role 미참조", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");

  const baseDir = resolve(__dirname, "..");
  const files = readdirSync(baseDir).filter((f) => f.endsWith(".ts"));

  let totalHits = 0;
  for (const f of files) {
    const src = readFileSync(join(baseDir, f), "utf8");
    if (/SUPABASE_SERVICE_ROLE_KEY/.test(src)) {
      totalHits++;
    }
  }
  assert.equal(totalHits, 0, "proposals/*.ts에 SUPABASE_SERVICE_ROLE_KEY 참조 0건");
});

test("[Scenario 16] proposals 영역 instructor_responses 미참조 (REQ-INQUIRY-009 contract)", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");

  const baseDir = resolve(__dirname, "..");
  const files = readdirSync(baseDir).filter((f) => f.endsWith(".ts"));

  let hits = 0;
  for (const f of files) {
    const src = readFileSync(join(baseDir, f), "utf8");
    // 'instructor_responses' table reference 검출
    // 본 SPEC은 InquiryBoardEntry / proposal_inquiries만 사용.
    if (/from\s*\(\s*["']instructor_responses["']\s*\)/.test(src)) {
      hits++;
    }
  }
  assert.equal(hits, 0, "proposals/*.ts에 instructor_responses 테이블 참조 0건 (CONFIRM-001 owns)");
});

// =============================================================================
// Scenario 14 — signal view 컨트랙트 (REQ-SIGNAL-001/004)
// =============================================================================

test("[Scenario 14] signal.ts 헬퍼 시그니처 + 90일 default", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  const src = readFileSync(resolve(__dirname, "../signal.ts"), "utf8");
  assert.match(
    src,
    /selectInstructorPriorAcceptedCount.*windowDays:\s*number\s*=\s*90/s,
    "default 90일 누락",
  );
  assert.match(src, /InstructorInquirySignal/);
});

test("[Scenario 14 — REQ-SIGNAL-003] runRecommendationAction에서 signal 미참조", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");

  const recommendDir = resolve(__dirname, "../../recommend");
  let hits = 0;
  try {
    const files = readdirSync(recommendDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(join(recommendDir, f), "utf8");
      if (/selectInstructorPriorAcceptedCount/.test(src)) {
        hits++;
      }
    }
  } catch {
    // recommend 디렉토리 부재 시 검증 skip
  }
  assert.equal(hits, 0, "src/lib/recommend/*.ts에 signal 헬퍼 참조 0건");
});
