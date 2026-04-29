// SPEC-PAYOUT-002 §M3 REQ-PAYOUT002-SESSIONS-003/-008, REQ-PAYOUT002-PROJECT-FIELDS-005 단위 테스트.
// Scenario 11 (hours 검증) + Scenario 13 (share_pct 검증) 자동화.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hoursSchema,
  sharePctSchema,
  hourlyRateSchema,
  sessionInputSchema,
  rescheduleInputSchema,
  withdrawInstructorInputSchema,
} from "../validation";
import { SESSION_ERRORS } from "../errors";

// =============================================================================
// hoursSchema — Scenario 11 (REQ-PAYOUT002-SESSIONS-003 / -008, MEDIUM-4)
// =============================================================================

test("hoursSchema: 0.5, 1.0, 2.0, 24 → 통과", () => {
  for (const valid of [0.5, 1.0, 1.5, 2.0, 4.5, 8.0, 24]) {
    const r = hoursSchema.safeParse(valid);
    assert.equal(r.success, true, `${valid} 는 통과해야 함`);
  }
});

test("hoursSchema: 1.3 → '0.5시간 단위' 거부 (Scenario 11 case A)", () => {
  const r = hoursSchema.safeParse(1.3);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_NOT_HALF_STEP);
  }
});

test("hoursSchema: 25 → '24시간 초과' 거부 (Scenario 11 case B)", () => {
  const r = hoursSchema.safeParse(25);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_OVER_24);
  }
});

test("hoursSchema: 0 → '0보다 커야' 거부 (Scenario 11 case C)", () => {
  const r = hoursSchema.safeParse(0);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_NOT_POSITIVE);
  }
});

test("hoursSchema: -1 → '0보다 커야' 거부 (Scenario 11 case D)", () => {
  const r = hoursSchema.safeParse(-1);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_NOT_POSITIVE);
  }
});

test("hoursSchema: 1.25 → '0.5시간 단위' 거부 (granularity)", () => {
  const r = hoursSchema.safeParse(1.25);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_NOT_HALF_STEP);
  }
});

test("hoursSchema: 1.5 → 통과 (boundary)", () => {
  assert.equal(hoursSchema.safeParse(1.5).success, true);
});

test("hoursSchema: 24 boundary → 통과", () => {
  assert.equal(hoursSchema.safeParse(24).success, true);
});

test("hoursSchema: 24.5 → '24시간 초과' 거부", () => {
  const r = hoursSchema.safeParse(24.5);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.HOURS_OVER_24);
  }
});

test("hoursSchema: string 입력 coerce — '2.5' → 2.5 통과", () => {
  // form data는 string으로 도달
  const r = hoursSchema.safeParse("2.5");
  assert.equal(r.success, true);
});

// =============================================================================
// sharePctSchema — Scenario 13 (REQ-PAYOUT002-PROJECT-FIELDS-005)
// =============================================================================

test("sharePctSchema: 0, 50, 70, 99.99, 100 → 통과", () => {
  for (const valid of [0, 50, 70, 99.99, 100]) {
    const r = sharePctSchema.safeParse(valid);
    assert.equal(r.success, true, `${valid} 는 통과해야 함`);
  }
});

test("sharePctSchema: 150 → '0~100 사이' 거부 (Scenario 13 case A)", () => {
  const r = sharePctSchema.safeParse(150);
  assert.equal(r.success, false);
  if (!r.success) {
    assert.equal(r.error.issues[0].message, SESSION_ERRORS.SHARE_PCT_OUT_OF_RANGE);
  }
});

test("sharePctSchema: -10 → '0~100 사이' 거부 (Scenario 13 case B)", () => {
  const r = sharePctSchema.safeParse(-10);
  assert.equal(r.success, false);
});

test("sharePctSchema: 100.01 → '0~100 사이' 거부 (Scenario 13 case C)", () => {
  const r = sharePctSchema.safeParse(100.01);
  assert.equal(r.success, false);
});

test("sharePctSchema: 99.99 → 통과 (Scenario 13 case D)", () => {
  assert.equal(sharePctSchema.safeParse(99.99).success, true);
});

// =============================================================================
// hourlyRateSchema — REQ-PAYOUT002-PROJECT-FIELDS-001
// =============================================================================

test("hourlyRateSchema: 0, 100000, 1000000 → 통과", () => {
  for (const valid of [0, 100_000, 1_000_000]) {
    assert.equal(hourlyRateSchema.safeParse(valid).success, true);
  }
});

test("hourlyRateSchema: -1 → 거부", () => {
  assert.equal(hourlyRateSchema.safeParse(-1).success, false);
});

test("hourlyRateSchema: 1.5 → 정수가 아님 거부", () => {
  assert.equal(hourlyRateSchema.safeParse(1.5).success, false);
});

// =============================================================================
// sessionInputSchema — 통합 폼 스키마
// =============================================================================

const VALID_UUID = "12345678-1234-1234-1234-123456789012";

test("sessionInputSchema: 정상 입력 통과", () => {
  const r = sessionInputSchema.safeParse({
    project_id: VALID_UUID,
    instructor_id: VALID_UUID,
    date: "2026-05-03",
    hours: 2.0,
  });
  assert.equal(r.success, true);
});

test("sessionInputSchema: instructor_id null 허용 (배정 전)", () => {
  const r = sessionInputSchema.safeParse({
    project_id: VALID_UUID,
    instructor_id: null,
    date: "2026-05-03",
    hours: 2.0,
  });
  assert.equal(r.success, true);
});

test("sessionInputSchema: 잘못된 date 형식 거부", () => {
  const r = sessionInputSchema.safeParse({
    project_id: VALID_UUID,
    instructor_id: null,
    date: "2026/05/03",
    hours: 2.0,
  });
  assert.equal(r.success, false);
});

test("sessionInputSchema: hours=1.3 거부 (cascade)", () => {
  const r = sessionInputSchema.safeParse({
    project_id: VALID_UUID,
    instructor_id: null,
    date: "2026-05-03",
    hours: 1.3,
  });
  assert.equal(r.success, false);
});

// =============================================================================
// rescheduleInputSchema
// =============================================================================

test("rescheduleInputSchema: 정상 입력 통과", () => {
  const r = rescheduleInputSchema.safeParse({
    session_id: VALID_UUID,
    new_date: "2026-05-20",
    notes: "강사 요청",
  });
  assert.equal(r.success, true);
});

test("rescheduleInputSchema: notes 생략 허용", () => {
  const r = rescheduleInputSchema.safeParse({
    session_id: VALID_UUID,
    new_date: "2026-05-20",
  });
  assert.equal(r.success, true);
});

// =============================================================================
// withdrawInstructorInputSchema
// =============================================================================

test("withdrawInstructorInputSchema: 정상 입력 통과", () => {
  const r = withdrawInstructorInputSchema.safeParse({
    project_id: VALID_UUID,
    reason: "강사 개인 사정",
  });
  assert.equal(r.success, true);
});

test("withdrawInstructorInputSchema: reason 빈 문자열 거부", () => {
  const r = withdrawInstructorInputSchema.safeParse({
    project_id: VALID_UUID,
    reason: "",
  });
  assert.equal(r.success, false);
});
