// SPEC-CONFIRM-001 §M2 — state-machine pure unit tests (REQ-CONFIRM-RESPONSES-003 / WINDOW).
// Runs via: tsx --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_WINDOW_HOURS,
  isWithinChangeWindow,
  validateStatusTransition,
} from "../state-machine";

test("CHANGE_WINDOW_HOURS === 1", () => {
  assert.equal(CHANGE_WINDOW_HOURS, 1);
});

// =============================================================================
// validateStatusTransition — REQ-CONFIRM-RESPONSES-003
// =============================================================================

test("validateStatusTransition: null → accepted OK (first response)", () => {
  const r = validateStatusTransition(null, "accepted");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: null → declined OK (first response)", () => {
  const r = validateStatusTransition(null, "declined");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: null → conditional OK (first response)", () => {
  const r = validateStatusTransition(null, "conditional");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: accepted → declined OK (다운그레이드)", () => {
  const r = validateStatusTransition("accepted", "declined");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: accepted → conditional OK", () => {
  const r = validateStatusTransition("accepted", "conditional");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: declined → accepted OK (변경)", () => {
  const r = validateStatusTransition("declined", "accepted");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: declined → conditional OK", () => {
  const r = validateStatusTransition("declined", "conditional");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: conditional → accepted OK", () => {
  const r = validateStatusTransition("conditional", "accepted");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: conditional → declined OK", () => {
  const r = validateStatusTransition("conditional", "declined");
  assert.equal(r.ok, true);
});

test("validateStatusTransition: 동일 상태 거부", () => {
  const r1 = validateStatusTransition("accepted", "accepted");
  assert.equal(r1.ok, false);
  const r2 = validateStatusTransition("declined", "declined");
  assert.equal(r2.ok, false);
  const r3 = validateStatusTransition("conditional", "conditional");
  assert.equal(r3.ok, false);
});

// =============================================================================
// isWithinChangeWindow — REQ-CONFIRM-RESPONSE-WINDOW-001/002
// =============================================================================

test("isWithinChangeWindow: null → 항상 true (미응답 = 윈도 자유)", () => {
  assert.equal(isWithinChangeWindow(null), true);
});

test("isWithinChangeWindow: 0초 경과 → true", () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  assert.equal(isWithinChangeWindow(respondedAt, now), true);
});

test("isWithinChangeWindow: 정확히 1시간 = true (포함)", () => {
  const now = new Date("2026-04-29T11:00:00Z");
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  assert.equal(isWithinChangeWindow(respondedAt, now), true);
});

test("isWithinChangeWindow: 59분 59초 → true", () => {
  const now = new Date("2026-04-29T10:59:59Z");
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  assert.equal(isWithinChangeWindow(respondedAt, now), true);
});

test("isWithinChangeWindow: 1시간 1초 → false (윈도 만료)", () => {
  const now = new Date("2026-04-29T11:00:01Z");
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  assert.equal(isWithinChangeWindow(respondedAt, now), false);
});

test("isWithinChangeWindow: 1시간 30분 → false", () => {
  const now = new Date("2026-04-29T11:30:00Z");
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  assert.equal(isWithinChangeWindow(respondedAt, now), false);
});
