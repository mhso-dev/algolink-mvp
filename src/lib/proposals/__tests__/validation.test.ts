// SPEC-PROPOSAL-001 §M2 — Zod schema 검증 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inquiryDispatchSchema,
  proposalCreateSchema,
  convertProposalSchema,
} from "../validation";
import { PROPOSAL_ERRORS } from "../errors";

// v4 UUIDs (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y in [89ab])
const VALID_UUID = "11111111-2222-4333-8444-555555555555";
const VALID_UUID_2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("proposalCreateSchema: 정상 입력 PASS", () => {
  const result = proposalCreateSchema.safeParse({
    title: "2026년 5월 데이터 분석 강의 제안",
    clientId: VALID_UUID,
    proposedPeriodStart: "2026-05-15",
    proposedPeriodEnd: "2026-05-30",
    proposedBusinessAmountKrw: 5000000,
    proposedHourlyRateKrw: 200000,
    notes: "테스트 메모",
    requiredSkillIds: [VALID_UUID_2],
  });
  assert.equal(result.success, true);
});

test("proposalCreateSchema: 제목 누락 거부 (TITLE_REQUIRED)", () => {
  const result = proposalCreateSchema.safeParse({
    title: "",
    clientId: VALID_UUID,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const titleErr = result.error.issues.find((i) =>
      i.path.includes("title"),
    );
    assert.ok(titleErr);
    assert.equal(titleErr!.message, PROPOSAL_ERRORS.TITLE_REQUIRED);
  }
});

test("proposalCreateSchema: 제목 200자 초과 거부 (TITLE_TOO_LONG)", () => {
  const result = proposalCreateSchema.safeParse({
    title: "a".repeat(201),
    clientId: VALID_UUID,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const titleErr = result.error.issues.find((i) =>
      i.path.includes("title"),
    );
    assert.ok(titleErr);
    assert.equal(titleErr!.message, PROPOSAL_ERRORS.TITLE_TOO_LONG);
  }
});

test("proposalCreateSchema: 종료일 < 시작일 거부 (END_BEFORE_START)", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: VALID_UUID,
    proposedPeriodStart: "2026-05-30",
    proposedPeriodEnd: "2026-05-15",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const periodErr = result.error.issues.find((i) =>
      i.path.includes("proposedPeriodEnd"),
    );
    assert.ok(periodErr);
    assert.equal(periodErr!.message, PROPOSAL_ERRORS.END_BEFORE_START);
  }
});

test("proposalCreateSchema: 종료일 == 시작일 허용", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: VALID_UUID,
    proposedPeriodStart: "2026-05-15",
    proposedPeriodEnd: "2026-05-15",
  });
  assert.equal(result.success, true);
});

test("proposalCreateSchema: clientId 비-UUID 거부", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: "not-a-uuid",
  });
  assert.equal(result.success, false);
});

test("proposalCreateSchema: 기간 미입력 시 PASS (optional)", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: VALID_UUID,
  });
  assert.equal(result.success, true);
});

test("proposalCreateSchema: requiredSkillIds 빈 배열 default", () => {
  const result = proposalCreateSchema.safeParse({
    title: "테스트",
    clientId: VALID_UUID,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.requiredSkillIds, []);
  }
});

test("inquiryDispatchSchema: 정상 입력 PASS", () => {
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: [VALID_UUID_2],
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T18:00:00.000Z",
    questionNote: "강의 가능?",
  });
  assert.equal(result.success, true);
});

test("inquiryDispatchSchema: date-only same-day time slot PASS", () => {
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: [VALID_UUID_2],
    proposedTimeSlotStart: "2026-05-15",
    proposedTimeSlotEnd: "2026-05-15",
    questionNote: "강의 가능?",
  });
  assert.equal(result.success, true);
});

test("inquiryDispatchSchema: instructorIds 빈 배열 거부", () => {
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: [],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const err = result.error.issues.find((i) =>
      i.path.includes("instructorIds"),
    );
    assert.ok(err);
    assert.equal(err!.message, PROPOSAL_ERRORS.INQUIRY_NO_INSTRUCTORS);
  }
});

test("inquiryDispatchSchema: 50명 초과 거부", () => {
  const ids = Array.from({ length: 51 }, () => VALID_UUID_2);
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: ids,
  });
  assert.equal(result.success, false);
});

test("inquiryDispatchSchema: time-slot null 허용", () => {
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: [VALID_UUID_2],
    proposedTimeSlotStart: null,
    proposedTimeSlotEnd: null,
    questionNote: null,
  });
  assert.equal(result.success, true);
});

test("inquiryDispatchSchema: proposedTimeSlotEnd < proposedTimeSlotStart 거부", () => {
  const result = inquiryDispatchSchema.safeParse({
    proposalId: VALID_UUID,
    instructorIds: [VALID_UUID_2],
    proposedTimeSlotStart: "2026-05-15T18:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T09:00:00.000Z",
  });
  assert.equal(result.success, false);
});

test("convertProposalSchema: 정상 UUID PASS", () => {
  const result = convertProposalSchema.safeParse({
    proposalId: VALID_UUID,
  });
  assert.equal(result.success, true);
});

test("convertProposalSchema: 비-UUID 거부", () => {
  const result = convertProposalSchema.safeParse({
    proposalId: "not-uuid",
  });
  assert.equal(result.success, false);
});
