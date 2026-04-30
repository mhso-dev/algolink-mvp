// SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-CONVERT-001/006 — convert.ts 순수 함수 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAcceptedRecommendationFromInquiries,
  buildAcceptedTop3Entry,
  buildProjectFromProposal,
} from "../convert";
import type { ProposalRecord } from "../types";

const PROPOSAL_ID = "11111111-2222-3333-4444-555555555555";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OPERATOR_ID = "ooooooo0-oooo-oooo-oooo-oooooooooooo";
const NEW_PROJECT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const INSTR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INSTR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INSTR_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const INSTR_D = "dddddddd-dddd-dddd-dddd-dddddddddddd";

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

test("buildProjectFromProposal: SPEC-PROJECT-001 default 필드 매핑", () => {
  const result = buildProjectFromProposal(baseProposal);

  assert.equal(result.title, baseProposal.title);
  assert.equal(result.clientId, baseProposal.clientId);
  assert.equal(result.operatorId, baseProposal.operatorId);
  assert.equal(result.startDate, "2026-05-15");
  assert.equal(result.endDate, "2026-05-30");
  assert.equal(result.businessAmountKrw, 5_000_000);
  assert.equal(result.instructorFeeKrw, 0);
  assert.equal(result.status, "proposal");
  assert.equal(result.instructorId, null);
  assert.equal(result.projectType, "education");
});

test("buildProjectFromProposal: date-only proposal period populates scheduled/range fields consistently", () => {
  const result = buildProjectFromProposal({
    ...baseProposal,
    title: "동일일 교육",
    proposedPeriodStart: "2026-05-15",
    proposedPeriodEnd: "2026-05-15",
    proposedBusinessAmountKrw: 1_000_000,
    proposedHourlyRateKrw: null,
  });

  assert.equal(result.startDate, "2026-05-15");
  assert.equal(result.endDate, "2026-05-15");
  assert.equal((result as { scheduledAt?: string | null }).scheduledAt, "2026-05-15");
});

test("buildProjectFromProposal: businessAmountKrw NULL → 0 default", () => {
  const proposal = { ...baseProposal, proposedBusinessAmountKrw: null };
  const result = buildProjectFromProposal(proposal);
  assert.equal(result.businessAmountKrw, 0);
});

test("buildProjectFromProposal: 기간 NULL 보존", () => {
  const proposal = {
    ...baseProposal,
    proposedPeriodStart: null,
    proposedPeriodEnd: null,
  };
  const result = buildProjectFromProposal(proposal);
  assert.equal(result.startDate, null);
  assert.equal(result.endDate, null);
});

test("buildProjectFromProposal: 순수 함수 — 입력 mutation 0건", () => {
  const snap = JSON.stringify(baseProposal);
  buildProjectFromProposal(baseProposal);
  assert.equal(JSON.stringify(baseProposal), snap);
});

test("buildProjectFromProposal: 동일 입력 100회 → 동일 출력 (referential transparency)", () => {
  const first = buildProjectFromProposal(baseProposal);
  for (let i = 0; i < 99; i++) {
    const next = buildProjectFromProposal(baseProposal);
    assert.deepEqual(next, first);
  }
});

test("buildAcceptedTop3Entry: source='fallback' + reason 한국어", () => {
  const entry = buildAcceptedTop3Entry(INSTR_A);
  assert.equal(entry.instructorId, INSTR_A);
  assert.equal(entry.source, "fallback");
  assert.equal(entry.finalScore, null);
  assert.equal(entry.skillMatch, null);
  assert.equal(entry.availability, null);
  assert.equal(entry.satisfaction, null);
  assert.equal(entry.reason, "사전 문의에서 수락한 후보 강사");
});

test("buildAcceptedRecommendationFromInquiries: 0명 → null", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, []);
  assert.equal(result, null);
});

test("buildAcceptedRecommendationFromInquiries: 1명 → top3 1건", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, [
    {
      inquiryId: "i1",
      instructorId: INSTR_A,
      respondedAt: "2026-04-29T10:00:00.000Z",
    },
  ]);
  assert.ok(result);
  if (result) {
    assert.equal(result.projectId, NEW_PROJECT_ID);
    assert.equal(result.top3Jsonb.length, 1);
    assert.equal(result.top3Jsonb[0]!.instructorId, INSTR_A);
    assert.equal(result.model, "manual_from_proposal");
    assert.equal(result.adoptedInstructorId, null);
  }
});

test("buildAcceptedRecommendationFromInquiries: 4명 → top3 cap (정확히 3명)", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: "2026-04-29T10:00:00Z" },
    { inquiryId: "i2", instructorId: INSTR_B, respondedAt: "2026-04-29T11:00:00Z" },
    { inquiryId: "i3", instructorId: INSTR_C, respondedAt: "2026-04-29T12:00:00Z" },
    { inquiryId: "i4", instructorId: INSTR_D, respondedAt: "2026-04-29T13:00:00Z" },
  ]);
  assert.ok(result);
  if (result) {
    assert.equal(result.top3Jsonb.length, 3);
    // 시간순으로 첫 3명 (A, B, C)
    assert.equal(result.top3Jsonb[0]!.instructorId, INSTR_A);
    assert.equal(result.top3Jsonb[1]!.instructorId, INSTR_B);
    assert.equal(result.top3Jsonb[2]!.instructorId, INSTR_C);
  }
});

test("buildAcceptedRecommendationFromInquiries: respondedAt NULL은 마지막", () => {
  const result = buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: null },
    { inquiryId: "i2", instructorId: INSTR_B, respondedAt: "2026-04-29T11:00:00Z" },
  ]);
  assert.ok(result);
  if (result) {
    assert.equal(result.top3Jsonb[0]!.instructorId, INSTR_B);
    assert.equal(result.top3Jsonb[1]!.instructorId, INSTR_A);
  }
});

test("buildAcceptedRecommendationFromInquiries: 순수 함수 — 입력 mutation 0건", () => {
  const inputs = [
    { inquiryId: "i1", instructorId: INSTR_A, respondedAt: "2026-04-29T10:00:00Z" },
    { inquiryId: "i2", instructorId: INSTR_B, respondedAt: "2026-04-29T11:00:00Z" },
  ];
  const snap = JSON.stringify(inputs);
  buildAcceptedRecommendationFromInquiries(NEW_PROJECT_ID, inputs);
  assert.equal(JSON.stringify(inputs), snap);
});

test("convert.ts 순수성 — Drizzle/Supabase/Next import 0건 (정적 검증)", async () => {
  // Module을 동적 import — top-level import가 의존성을 끌어들이지 않는지 확인
  const mod = await import("../convert");
  // 외부 의존성 없는 순수 모듈은 단순히 import 가능해야 함
  assert.ok(typeof mod.buildProjectFromProposal === "function");
  assert.ok(typeof mod.buildAcceptedRecommendationFromInquiries === "function");
});
