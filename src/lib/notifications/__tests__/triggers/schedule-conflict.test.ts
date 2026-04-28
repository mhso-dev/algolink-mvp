// SPEC-NOTIFY-001 §M3 — schedule_conflict 트리거 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScheduleConflict } from "../../triggers/schedule-conflict";
import { buildTriggerSupa } from "./_supa";

const INSTRUCTOR = "11111111-1111-4111-8111-111111111111";
const OPERATOR = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

test("checkScheduleConflict: 강사 활성 프로젝트와 시간 겹침 → emit 1건", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: PROJECT,
        title: "P",
        operator_id: OPERATOR,
        instructor_id: INSTRUCTOR,
        status: "assignment_confirmed",
        education_start_at: "2026-05-10T09:00:00Z",
        education_end_at: "2026-05-10T12:00:00Z",
      },
    ],
    instructors: [{ id: INSTRUCTOR, name_kr: "H" }],
    notifications: [],
  });
  const r = await checkScheduleConflict(supa, INSTRUCTOR, {
    start: "2026-05-10T10:00:00Z",
    end: "2026-05-10T11:00:00Z",
  });
  assert.ok(r);
  assert.equal(r?.ok, true);
  assert.equal(supa.inserts.notifications.length, 1);
  assert.equal(supa.inserts.notifications[0].type, "schedule_conflict");
  assert.equal(supa.inserts.notifications[0].recipient_id, OPERATOR);
});

test("checkScheduleConflict: 시간 겹치지 않음 → null", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: PROJECT,
        title: "P",
        operator_id: OPERATOR,
        instructor_id: INSTRUCTOR,
        status: "assignment_confirmed",
        education_start_at: "2026-05-10T09:00:00Z",
        education_end_at: "2026-05-10T12:00:00Z",
      },
    ],
    instructors: [{ id: INSTRUCTOR, name_kr: "H" }],
    notifications: [],
  });
  const r = await checkScheduleConflict(supa, INSTRUCTOR, {
    start: "2026-05-11T10:00:00Z",
    end: "2026-05-11T11:00:00Z",
  });
  assert.equal(r, null);
});

test("checkScheduleConflict: 강사 활성 프로젝트 없음 → null", async () => {
  const supa = buildTriggerSupa({
    projects: [],
    instructors: [{ id: INSTRUCTOR, name_kr: "H" }],
    notifications: [],
  });
  const r = await checkScheduleConflict(supa, INSTRUCTOR, {
    start: "2026-05-10T10:00:00Z",
    end: "2026-05-10T11:00:00Z",
  });
  assert.equal(r, null);
});

test("checkScheduleConflict: 비활성 status (education_done) → null", async () => {
  const supa = buildTriggerSupa({
    projects: [
      {
        id: PROJECT,
        title: "P",
        operator_id: OPERATOR,
        instructor_id: INSTRUCTOR,
        status: "education_done",
        education_start_at: "2026-05-10T09:00:00Z",
        education_end_at: "2026-05-10T12:00:00Z",
      },
    ],
    instructors: [],
    notifications: [],
  });
  const r = await checkScheduleConflict(supa, INSTRUCTOR, {
    start: "2026-05-10T10:00:00Z",
    end: "2026-05-10T11:00:00Z",
  });
  assert.equal(r, null);
});
