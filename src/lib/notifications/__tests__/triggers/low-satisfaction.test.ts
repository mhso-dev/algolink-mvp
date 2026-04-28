// SPEC-NOTIFY-001 §M3 — low_satisfaction 트리거 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLowSatisfaction } from "../../triggers/low-satisfaction";
import { buildTriggerSupa } from "./_supa";

const INSTRUCTOR = "11111111-1111-4111-8111-111111111111";
const OPERATOR = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

test("checkLowSatisfaction: 평균 2.5 (< 3.0) + 5건 → emit 1건", async () => {
  const supa = buildTriggerSupa({
    satisfaction_reviews: [
      { instructor_id: INSTRUCTOR, score: 3 },
      { instructor_id: INSTRUCTOR, score: 2 },
      { instructor_id: INSTRUCTOR, score: 3 },
      { instructor_id: INSTRUCTOR, score: 2 },
      { instructor_id: INSTRUCTOR, score: 2.5 },
    ],
    instructors: [{ id: INSTRUCTOR, name_kr: "홍길동" }],
    notifications: [],
  });
  const r = await checkLowSatisfaction(supa, INSTRUCTOR, OPERATOR, PROJECT, 3.0);
  assert.ok(r);
  assert.equal(r?.ok, true);
  assert.equal(supa.inserts.notifications.length, 1);
  assert.equal(supa.inserts.notifications[0].type, "low_satisfaction_assignment");
  assert.equal(supa.inserts.notifications[0].recipient_id, OPERATOR);
});

test("checkLowSatisfaction: 평균 3.5 → emit 0건 (null 반환)", async () => {
  const supa = buildTriggerSupa({
    satisfaction_reviews: [
      { instructor_id: INSTRUCTOR, score: 4 },
      { instructor_id: INSTRUCTOR, score: 3 },
    ],
    instructors: [{ id: INSTRUCTOR, name_kr: "X" }],
    notifications: [],
  });
  const r = await checkLowSatisfaction(supa, INSTRUCTOR, OPERATOR, PROJECT);
  assert.equal(r, null);
  assert.equal(supa.inserts.notifications?.length ?? 0, 0);
});

test("checkLowSatisfaction: 리뷰 0건 → emit 안 함 (prior 미적용)", async () => {
  const supa = buildTriggerSupa({
    satisfaction_reviews: [],
    instructors: [{ id: INSTRUCTOR, name_kr: "X" }],
    notifications: [],
  });
  const r = await checkLowSatisfaction(supa, INSTRUCTOR, OPERATOR, PROJECT);
  assert.equal(r, null);
});

test("checkLowSatisfaction: 24h 내 동일 (operator,project) → dedup으로 skip", async () => {
  const supa = buildTriggerSupa({
    satisfaction_reviews: [{ instructor_id: INSTRUCTOR, score: 1 }],
    instructors: [{ id: INSTRUCTOR, name_kr: "X" }],
    notifications: [
      {
        id: "x",
        recipient_id: OPERATOR,
        type: "low_satisfaction_assignment",
        link_url: `/projects/${PROJECT}`,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  const r = await checkLowSatisfaction(supa, INSTRUCTOR, OPERATOR, PROJECT);
  assert.ok(r);
  assert.equal(r?.ok, false);
  if (r && !r.ok) assert.equal(r.reason, "duplicate");
});
