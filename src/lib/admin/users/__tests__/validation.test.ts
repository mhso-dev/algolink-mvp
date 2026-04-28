// SPEC-ADMIN-001 EARS B-6, B-8 — 자가 lockout 방지 검증.
import { test } from "node:test";
import assert from "node:assert/strict";
import { updateRoleInput, setActiveInput } from "../validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("updateRoleInput: 다른 사용자 role 변경 OK", () => {
  const r = updateRoleInput.safeParse({
    actorId: A,
    targetUserId: B,
    newRole: "operator",
  });
  assert.equal(r.success, true);
});

test("updateRoleInput: 본인 role 변경 거부 (B-6)", () => {
  const r = updateRoleInput.safeParse({
    actorId: A,
    targetUserId: A,
    newRole: "operator",
  });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.ok(
      r.error.issues.some((i) => i.message.includes("본인 계정의 역할")),
      "본인 lockout 메시지가 포함되어야 함",
    );
  }
});

test("updateRoleInput: 잘못된 role 거부", () => {
  const r = updateRoleInput.safeParse({
    actorId: A,
    targetUserId: B,
    newRole: "owner",
  });
  assert.equal(r.success, false);
});

test("updateRoleInput: 잘못된 UUID 거부", () => {
  const r = updateRoleInput.safeParse({
    actorId: "not-uuid",
    targetUserId: B,
    newRole: "operator",
  });
  assert.equal(r.success, false);
});

test("setActiveInput: 다른 사용자 비활성화 OK", () => {
  const r = setActiveInput.safeParse({
    actorId: A,
    targetUserId: B,
    nextActive: false,
  });
  assert.equal(r.success, true);
});

test("setActiveInput: 본인 비활성화 거부 (B-8)", () => {
  const r = setActiveInput.safeParse({
    actorId: A,
    targetUserId: A,
    nextActive: false,
  });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.ok(
      r.error.issues.some((i) => i.message.includes("본인 계정을 비활성화")),
    );
  }
});

test("setActiveInput: 본인 재활성화는 허용 (정의상 OK)", () => {
  const r = setActiveInput.safeParse({
    actorId: A,
    targetUserId: A,
    nextActive: true,
  });
  assert.equal(r.success, true);
});
