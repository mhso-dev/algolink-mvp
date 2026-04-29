// SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-INQUIRY-003 — buildInquiryRecords 순수 함수 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInquiryNotificationPayload,
  buildInquiryRecords,
  formatInquiryDispatchLog,
} from "../inquiry";

const PROPOSAL_ID = "11111111-2222-3333-4444-555555555555";
const INSTR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INSTR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INSTR_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";

test("buildInquiryRecords: N=3 정상 생성", () => {
  const records = buildInquiryRecords({
    proposalId: PROPOSAL_ID,
    instructorIds: [INSTR_A, INSTR_B, INSTR_C],
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T18:00:00.000Z",
    questionNote: "강의 가능?",
  });

  assert.equal(records.length, 3);
  assert.equal(records[0]!.proposalId, PROPOSAL_ID);
  assert.equal(records[0]!.instructorId, INSTR_A);
  assert.equal(records[0]!.proposedTimeSlotStart, "2026-05-15T09:00:00.000Z");
  assert.equal(records[0]!.proposedTimeSlotEnd, "2026-05-15T18:00:00.000Z");
  assert.equal(records[0]!.questionNote, "강의 가능?");
  assert.equal(records[2]!.instructorId, INSTR_C);
});

test("buildInquiryRecords: time-slot null 허용", () => {
  const records = buildInquiryRecords({
    proposalId: PROPOSAL_ID,
    instructorIds: [INSTR_A],
    proposedTimeSlotStart: null,
    proposedTimeSlotEnd: null,
    questionNote: null,
  });
  assert.equal(records[0]!.proposedTimeSlotStart, null);
  assert.equal(records[0]!.proposedTimeSlotEnd, null);
  assert.equal(records[0]!.questionNote, null);
});

test("buildInquiryRecords: 중복 instructorId 검출 → throw", () => {
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

test("buildInquiryRecords: 빈 배열 → 빈 결과", () => {
  const records = buildInquiryRecords({
    proposalId: PROPOSAL_ID,
    instructorIds: [],
    proposedTimeSlotStart: null,
    proposedTimeSlotEnd: null,
    questionNote: null,
  });
  assert.equal(records.length, 0);
});

test("buildInquiryRecords: 순수 함수 — 입력 mutation 0건", () => {
  const ids = [INSTR_A, INSTR_B];
  const idsSnapshot = [...ids];
  buildInquiryRecords({
    proposalId: PROPOSAL_ID,
    instructorIds: ids,
    proposedTimeSlotStart: null,
    proposedTimeSlotEnd: null,
    questionNote: null,
  });
  assert.deepEqual(ids, idsSnapshot);
});

test("buildInquiryRecords: 동일 입력 100회 → 동일 출력 (referential transparency)", () => {
  const input = {
    proposalId: PROPOSAL_ID,
    instructorIds: [INSTR_A, INSTR_B],
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: null,
    questionNote: "test",
  };
  const first = buildInquiryRecords(input);
  for (let i = 0; i < 99; i++) {
    const next = buildInquiryRecords(input);
    assert.deepEqual(next, first);
  }
});

test("buildInquiryNotificationPayload: title/body/linkUrl 한국어", () => {
  const inquiryId = "fffffff0-1111-2222-3333-444444444444";
  const payload = buildInquiryNotificationPayload({
    proposalTitle: "데이터 분석 강의",
    proposedTimeSlotStart: "2026-05-15T09:00:00.000Z",
    proposedTimeSlotEnd: "2026-05-15T18:00:00.000Z",
    inquiryId,
  });
  assert.match(payload.title, /데이터 분석 강의/);
  assert.match(payload.title, /사전 문의/);
  assert.match(payload.body, /데이터 분석 강의/);
  assert.equal(payload.linkUrl, `/me/inquiries/${inquiryId}`);
});

test("buildInquiryNotificationPayload: time-slot null 시 단축 body", () => {
  const inquiryId = "fffffff0-1111-2222-3333-444444444444";
  const payload = buildInquiryNotificationPayload({
    proposalTitle: "테스트",
    proposedTimeSlotStart: null,
    proposedTimeSlotEnd: null,
    inquiryId,
  });
  assert.equal(payload.body, "테스트 강의 가능 여부 사전 문의");
});

test("formatInquiryDispatchLog: 표준 포맷 (REQ-PROPOSAL-INQUIRY-003)", () => {
  const log = formatInquiryDispatchLog(INSTR_A, PROPOSAL_ID);
  assert.equal(
    log,
    `[notif] inquiry_request → instructor_id=${INSTR_A} proposal_id=${PROPOSAL_ID}`,
  );
});
