// SPEC-PAYOUT-001 §M2 — 상태머신 단위 테스트 (4×4=16 조합 + 한국어 reason).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TRANSITIONS,
  validateTransition,
  allTransitionPairs,
} from "../status-machine";
import { PAYOUT_ERRORS } from "../errors";
import { SETTLEMENT_STATUSES, type SettlementStatus } from "../types";

const ALLOWED_PAIRS: Array<[SettlementStatus, SettlementStatus]> = [
  ["pending", "requested"],
  ["pending", "held"],
  ["requested", "paid"],
  ["requested", "held"],
  ["held", "requested"],
];

test("SETTLEMENT_STATUSES = pending/requested/paid/held 4종", () => {
  assert.deepEqual([...SETTLEMENT_STATUSES], [
    "pending",
    "requested",
    "paid",
    "held",
  ]);
});

test("ALLOWED_TRANSITIONS: 정확히 5건만 허용", () => {
  const total = Object.values(ALLOWED_TRANSITIONS).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  assert.equal(total, 5);
});

test("validateTransition: 허용 5건 (ok=true)", () => {
  for (const [from, to] of ALLOWED_PAIRS) {
    const r = validateTransition(from, to);
    assert.equal(r.ok, true, `${from}→${to} 는 허용되어야 함`);
  }
});

test("validateTransition: paid 출발 4건 모두 STATUS_PAID_FROZEN", () => {
  for (const to of SETTLEMENT_STATUSES) {
    const r = validateTransition("paid", to);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, PAYOUT_ERRORS.STATUS_PAID_FROZEN);
    }
  }
});

test("validateTransition: held → paid 직접 전환 → STATUS_HELD_TO_PAID_BLOCKED", () => {
  const r = validateTransition("held", "paid");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, PAYOUT_ERRORS.STATUS_HELD_TO_PAID_BLOCKED);
  }
});

test("validateTransition: 차단 11건 모두 ok=false", () => {
  const allowedSet = new Set(
    ALLOWED_PAIRS.map(([f, t]) => `${f}->${t}`),
  );
  let blocked = 0;
  for (const { from, to } of allTransitionPairs()) {
    const key = `${from}->${to}`;
    const r = validateTransition(from, to);
    if (allowedSet.has(key)) {
      assert.equal(r.ok, true, `${key} 는 허용 목록`);
    } else {
      assert.equal(r.ok, false, `${key} 는 차단되어야 함`);
      blocked += 1;
    }
  }
  assert.equal(blocked, 11);
});

test("validateTransition: pending self-transition → INVALID_TRANSITION", () => {
  const r = validateTransition("pending", "pending");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
});

test("validateTransition: requested → pending (역행) → INVALID_TRANSITION", () => {
  const r = validateTransition("requested", "pending");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
});

test("validateTransition: held → pending → INVALID_TRANSITION", () => {
  const r = validateTransition("held", "pending");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, PAYOUT_ERRORS.STATUS_INVALID_TRANSITION);
});
