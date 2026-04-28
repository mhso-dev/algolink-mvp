// SPEC-INSTRUCTOR-001 §5.5 + SPEC-AUTH-001 v1.1 — instructors.user_id 자동 매핑 단위 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideUserIdMapping,
  linkInstructorUser,
  type AdminUpdateClient,
} from "../link-user";

// ---------- decideUserIdMapping ----------

test("decideUserIdMapping: instructor 역할 + 정상 입력 → update", () => {
  const decision = decideUserIdMapping({
    email: "kim@example.com",
    authUserId: "auth-123",
    role: "instructor",
  });
  assert.deepEqual(decision, {
    action: "update",
    email: "kim@example.com",
    authUserId: "auth-123",
  });
});

test("decideUserIdMapping: operator/admin 역할 → skip(non_instructor_role)", () => {
  for (const role of ["operator", "admin", "client"]) {
    const decision = decideUserIdMapping({
      email: "x@example.com",
      authUserId: "auth-1",
      role,
    });
    assert.deepEqual(decision, {
      action: "skip",
      reason: "non_instructor_role",
    });
  }
});

test("decideUserIdMapping: email 누락 → skip(missing_email)", () => {
  const decision = decideUserIdMapping({
    email: "",
    authUserId: "auth-1",
    role: "instructor",
  });
  assert.deepEqual(decision, { action: "skip", reason: "missing_email" });
});

test("decideUserIdMapping: authUserId 누락 → skip(missing_user_id)", () => {
  const decision = decideUserIdMapping({
    email: "x@example.com",
    authUserId: "",
    role: "instructor",
  });
  assert.deepEqual(decision, { action: "skip", reason: "missing_user_id" });
});

// ---------- linkInstructorUser ----------

function makeClient(
  impl: AdminUpdateClient["updateInstructorUserIdByEmail"],
): AdminUpdateClient & { calls: Array<{ email: string; authUserId: string }> } {
  const calls: Array<{ email: string; authUserId: string }> = [];
  return {
    calls,
    updateInstructorUserIdByEmail: async (email, authUserId) => {
      calls.push({ email, authUserId });
      return impl(email, authUserId);
    },
  };
}

test("linkInstructorUser: instructor → UPDATE 호출 + matched 반환", async () => {
  const client = makeClient(async () => ({ matched: 1, error: null }));
  const result = await linkInstructorUser(
    { email: "kim@example.com", authUserId: "auth-9", role: "instructor" },
    client,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matched, 1);
  }
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    email: "kim@example.com",
    authUserId: "auth-9",
  });
});

test("linkInstructorUser: operator → UPDATE 미호출 + skip 보고", async () => {
  const client = makeClient(async () => ({ matched: 0, error: null }));
  const result = await linkInstructorUser(
    { email: "ops@example.com", authUserId: "auth-1", role: "operator" },
    client,
  );
  assert.equal(result.ok, true);
  assert.equal(client.calls.length, 0);
  if (result.ok && result.matched === 0) {
    assert.equal(result.skipped?.action, "skip");
    assert.equal(result.skipped?.reason, "non_instructor_role");
  }
});

test("linkInstructorUser: 매칭 0건도 ok=true (강사 행이 미리 삭제된 경우)", async () => {
  const client = makeClient(async () => ({ matched: 0, error: null }));
  const result = await linkInstructorUser(
    { email: "ghost@example.com", authUserId: "auth-2", role: "instructor" },
    client,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matched, 0);
  }
});

test("linkInstructorUser: DB error → ok=false + error 메시지", async () => {
  const client = makeClient(async () => ({
    matched: 0,
    error: "permission denied",
  }));
  const result = await linkInstructorUser(
    { email: "x@example.com", authUserId: "auth-3", role: "instructor" },
    client,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "permission denied");
  }
});

test("linkInstructorUser: 멱등 — 같은 입력 두 번 호출 시 두 번째도 안전", async () => {
  let callCount = 0;
  const client = makeClient(async () => {
    callCount += 1;
    // 첫 호출은 매칭, 두 번째는 user_id IS NULL 조건으로 0건 매칭.
    return { matched: callCount === 1 ? 1 : 0, error: null };
  });
  const input = {
    email: "kim@example.com",
    authUserId: "auth-9",
    role: "instructor",
  };
  const r1 = await linkInstructorUser(input, client);
  const r2 = await linkInstructorUser(input, client);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  if (r1.ok) assert.equal(r1.matched, 1);
  if (r2.ok) assert.equal(r2.matched, 0);
});
