// SPEC-NOTIFY-001 §M3 — assignment_overdue 트리거 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAssignmentOverdue } from "../../triggers/assignment-overdue";
import { buildTriggerSupa } from "./_supa";

const OPERATOR = "22222222-2222-4222-8222-222222222222";
const INSTRUCTOR = "11111111-1111-4111-8111-111111111111";

test("checkAssignmentOverdue: 24h 경과 + assignment_review + instructor 배정 → emit 1건", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: "p1",
        title: "Old",
        status: "assignment_review",
        instructor_id: INSTRUCTOR,
        operator_id: OPERATOR,
        updated_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
      },
    ],
    notifications: [],
  });
  const rs = await checkAssignmentOverdue(supa, { hoursThreshold: 24 });
  assert.equal(rs.length, 1);
  assert.equal(rs[0].ok, true);
  assert.equal(supa.inserts.notifications.length, 1);
  assert.equal(supa.inserts.notifications[0].recipient_id, OPERATOR);
});

test("checkAssignmentOverdue: 24h 미경과 → emit 0건", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: "p1",
        title: "X",
        status: "assignment_review",
        instructor_id: INSTRUCTOR,
        operator_id: OPERATOR,
        updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      },
    ],
    notifications: [],
  });
  const rs = await checkAssignmentOverdue(supa);
  assert.equal(rs.length, 0);
});

test("checkAssignmentOverdue: status = assignment_confirmed (응답 완료) → emit 0건", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: "p1",
        title: "X",
        status: "assignment_confirmed",
        instructor_id: INSTRUCTOR,
        operator_id: OPERATOR,
        updated_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      },
    ],
    notifications: [],
  });
  const rs = await checkAssignmentOverdue(supa);
  assert.equal(rs.length, 0);
});

test("checkAssignmentOverdue: 동일 project 24h 내 dedup → skip", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: "p1",
        title: "X",
        status: "assignment_review",
        instructor_id: INSTRUCTOR,
        operator_id: OPERATOR,
        updated_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
      },
    ],
    notifications: [
      {
        id: "n1",
        recipient_id: OPERATOR,
        type: "assignment_overdue",
        link_url: `/projects/p1`,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  const rs = await checkAssignmentOverdue(supa);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].ok, false);
  if (!rs[0].ok) assert.equal(rs[0].reason, "duplicate");
});
