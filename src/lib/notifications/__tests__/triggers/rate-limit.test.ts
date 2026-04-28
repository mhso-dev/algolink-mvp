// SPEC-NOTIFY-001 §M3 — rate-limit 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRunCheck, resetRateLimit } from "../../triggers/rate-limit";

test("shouldRunCheck: 첫 호출 → true", () => {
  resetRateLimit();
  assert.equal(shouldRunCheck("user-1", "scope", 5), true);
});

test("shouldRunCheck: window 내 재호출 → false", () => {
  resetRateLimit();
  assert.equal(shouldRunCheck("user-1", "scope", 5), true);
  assert.equal(shouldRunCheck("user-1", "scope", 5), false);
});

test("shouldRunCheck: 다른 user → 독립적으로 true", () => {
  resetRateLimit();
  shouldRunCheck("user-1", "scope", 5);
  assert.equal(shouldRunCheck("user-2", "scope", 5), true);
});

test("shouldRunCheck: 다른 scope → 독립적으로 true", () => {
  resetRateLimit();
  shouldRunCheck("user-1", "scope-a", 5);
  assert.equal(shouldRunCheck("user-1", "scope-b", 5), true);
});

test("shouldRunCheck: 0분 window → 항상 true", () => {
  resetRateLimit();
  assert.equal(shouldRunCheck("user-x", "s", 0), true);
  assert.equal(shouldRunCheck("user-x", "s", 0), true);
});
