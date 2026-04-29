// SPEC-PAYOUT-002 §M3 REQ-PAYOUT002-SESSIONS-005, REQ-PAYOUT002-EXCEPT-005 단위 테스트.
// 4×4=16 조합 중 ALLOW 3건 (planned → completed/canceled/rescheduled), REJECT 13건.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_SESSION_TRANSITIONS,
  allSessionTransitionPairs,
  validateSessionTransition,
} from "../status-machine";
import { SESSION_ERRORS } from "../errors";
import {
  LECTURE_SESSION_STATUSES,
  type LectureSessionStatus,
} from "../types";

const ALLOWED_PAIRS: Array<[LectureSessionStatus, LectureSessionStatus]> = [
  ["planned", "completed"],
  ["planned", "canceled"],
  ["planned", "rescheduled"],
];

test("LECTURE_SESSION_STATUSES = 4종 enum 일치", () => {
  assert.deepEqual([...LECTURE_SESSION_STATUSES], [
    "planned",
    "completed",
    "canceled",
    "rescheduled",
  ]);
});

test("ALLOWED_SESSION_TRANSITIONS: 정확히 3건만 허용 (planned 출발)", () => {
  const total = Object.values(ALLOWED_SESSION_TRANSITIONS).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  assert.equal(total, 3);
  assert.deepEqual([...ALLOWED_SESSION_TRANSITIONS.planned].sort(), [
    "canceled",
    "completed",
    "rescheduled",
  ]);
  assert.equal(ALLOWED_SESSION_TRANSITIONS.completed.length, 0);
  assert.equal(ALLOWED_SESSION_TRANSITIONS.canceled.length, 0);
  assert.equal(ALLOWED_SESSION_TRANSITIONS.rescheduled.length, 0);
});

test("validateSessionTransition: 허용 3건 (ok=true)", () => {
  for (const [from, to] of ALLOWED_PAIRS) {
    const r = validateSessionTransition(from, to);
    assert.equal(r.ok, true, `${from}→${to} 는 허용되어야 함`);
  }
});

test("validateSessionTransition: completed 출발 4건 모두 STATUS_FROZEN", () => {
  for (const to of LECTURE_SESSION_STATUSES) {
    const r = validateSessionTransition("completed", to);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, SESSION_ERRORS.STATUS_FROZEN);
  }
});

test("validateSessionTransition: canceled 출발 4건 모두 STATUS_FROZEN", () => {
  for (const to of LECTURE_SESSION_STATUSES) {
    const r = validateSessionTransition("canceled", to);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, SESSION_ERRORS.STATUS_FROZEN);
  }
});

test("validateSessionTransition: rescheduled 출발 4건 모두 STATUS_FROZEN", () => {
  for (const to of LECTURE_SESSION_STATUSES) {
    const r = validateSessionTransition("rescheduled", to);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, SESSION_ERRORS.STATUS_FROZEN);
  }
});

test("validateSessionTransition: planned → planned 자기 전환 거부", () => {
  const r = validateSessionTransition("planned", "planned");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, SESSION_ERRORS.STATUS_FROZEN);
});

test("validateSessionTransition: 16조합 매트릭스 — ALLOW 3건 / REJECT 13건", () => {
  const all = allSessionTransitionPairs();
  assert.equal(all.length, 16);
  let allowCount = 0;
  let rejectCount = 0;
  for (const [from, to] of all) {
    const r = validateSessionTransition(from, to);
    if (r.ok) allowCount++;
    else rejectCount++;
  }
  assert.equal(allowCount, 3);
  assert.equal(rejectCount, 13);
});

// REQ-PAYOUT002-EXCEPT-005 — Scenario 12
test("Scenario 12: completed → planned/canceled 시도 거부", () => {
  assert.equal(validateSessionTransition("completed", "planned").ok, false);
  assert.equal(validateSessionTransition("completed", "canceled").ok, false);
});

test("Scenario 12: canceled → planned 시도 거부", () => {
  assert.equal(validateSessionTransition("canceled", "planned").ok, false);
});

test("Scenario 12: rescheduled → completed 시도 거부", () => {
  assert.equal(validateSessionTransition("rescheduled", "completed").ok, false);
});
