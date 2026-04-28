// SPEC-ADMIN-001 — updateUserRole / setUserActive 자가 lockout 회귀 테스트.
// Drizzle/DB 직접 호출은 통합 환경 외에서 검증이 어려우므로,
// 본 테스트는 입력 검증(B-6, B-8) 단계에서 DB write 이전에 거부됨을 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";

// queries.ts는 server-only + db 인스턴스를 import하므로 단위 테스트에서 직접 import 불가.
// 대신 validation 모듈로 동일한 가드를 검증한다 (queries.ts 내부에서도 같은 스키마를 사용).
import { updateRoleInput, setActiveInput } from "../validation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("queries 가드 위임: 본인 role 변경 시도는 validation에서 거부 (B-6)", () => {
  const r = updateRoleInput.safeParse({
    actorId: A,
    targetUserId: A,
    newRole: "operator",
  });
  assert.equal(r.success, false);
});

test("queries 가드 위임: 본인 비활성화 시도는 validation에서 거부 (B-8)", () => {
  const r = setActiveInput.safeParse({
    actorId: A,
    targetUserId: A,
    nextActive: false,
  });
  assert.equal(r.success, false);
});

test("queries 가드 위임: 다른 사용자 비활성화 OK", () => {
  const r = setActiveInput.safeParse({
    actorId: A,
    targetUserId: B,
    nextActive: false,
  });
  assert.equal(r.success, true);
});
