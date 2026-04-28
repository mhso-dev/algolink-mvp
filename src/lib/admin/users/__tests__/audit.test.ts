// SPEC-ADMIN-001 EARS B-5, B-7 — audit 로그 포맷.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logRoleChange, logActiveChange } from "../audit";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FIXED_AT = "2026-04-28T00:00:00.000Z";

test("logRoleChange: 구조화 entry 반환", () => {
  const e = logRoleChange({
    actorId: A,
    targetId: B,
    beforeRole: "instructor",
    afterRole: "operator",
    at: FIXED_AT,
  });
  assert.equal(e.kind, "role_change");
  assert.equal(e.actorId, A);
  assert.equal(e.targetId, B);
  assert.equal(e.beforeRole, "instructor");
  assert.equal(e.afterRole, "operator");
  assert.equal(e.at, FIXED_AT);
});

test("logRoleChange: at 미지정 시 ISO timestamp 자동 생성", () => {
  const e = logRoleChange({
    actorId: A,
    targetId: B,
    beforeRole: "operator",
    afterRole: "admin",
  });
  assert.match(e.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("logActiveChange: 구조화 entry 반환", () => {
  const e = logActiveChange({
    actorId: A,
    targetId: B,
    beforeActive: true,
    afterActive: false,
    at: FIXED_AT,
  });
  assert.equal(e.kind, "active_change");
  assert.equal(e.beforeActive, true);
  assert.equal(e.afterActive, false);
  assert.equal(e.at, FIXED_AT);
});
