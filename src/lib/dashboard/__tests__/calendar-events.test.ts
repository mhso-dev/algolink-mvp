// SPEC-DASHBOARD-001 §M6 — 캘린더 격자/그룹/월 이동 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentMonthKst,
  daysInMonthKst,
  groupEventsByDay,
  shiftMonth,
  startOfMonthKst,
  startOfNextMonthKst,
} from "../calendar-events";
import type { ScheduleEvent } from "../types";

test("startOfMonthKst: KST 1일 00:00 == UTC 전날 15:00", () => {
  const d = startOfMonthKst(2026, 4); // 2026-05-01 KST
  assert.equal(d.toISOString(), "2026-04-30T15:00:00.000Z");
});

test("startOfNextMonthKst: 12월 → 다음해 1월", () => {
  const d = startOfNextMonthKst(2026, 11);
  // 2027-01-01 00:00 KST == 2026-12-31 15:00 UTC
  assert.equal(d.toISOString(), "2026-12-31T15:00:00.000Z");
});

test("daysInMonthKst: 2월 윤년/평년", () => {
  assert.equal(daysInMonthKst(2024, 1), 29);
  assert.equal(daysInMonthKst(2026, 1), 28);
  assert.equal(daysInMonthKst(2026, 0), 31);
});

test("currentMonthKst: 주어진 시각의 KST 월 반환", () => {
  // UTC 2026-04-27T16:00:00Z → KST 2026-04-28 01:00 → April(3)
  const m = currentMonthKst(new Date("2026-04-27T16:00:00Z"));
  assert.deepEqual(m, { year: 2026, monthIndex0: 3 });
});

test("shiftMonth: 음수 이동", () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, monthIndex0: 11 });
  assert.deepEqual(shiftMonth(2026, 5, -6), { year: 2025, monthIndex0: 11 });
});

test("shiftMonth: 양수 이동", () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, monthIndex0: 0 });
  assert.deepEqual(shiftMonth(2026, 0, 13), { year: 2027, monthIndex0: 1 });
});

test("groupEventsByDay: 시작일 KST 기준으로 묶음", () => {
  const events: ScheduleEvent[] = [
    {
      id: "1",
      instructorId: "i1",
      instructorName: "강사1",
      projectId: "p1",
      projectTitle: "K8s",
      startsAt: "2026-05-10T01:00:00Z", // KST 10:00, 5/10
      endsAt: "2026-05-10T03:00:00Z",
    },
    {
      id: "2",
      instructorId: "i1",
      instructorName: "강사1",
      projectId: "p1",
      projectTitle: "K8s",
      startsAt: "2026-05-10T15:30:00Z", // KST 5/11 00:30
      endsAt: "2026-05-10T16:00:00Z",
    },
    {
      id: "3",
      instructorId: "i2",
      instructorName: "강사2",
      projectId: "p2",
      projectTitle: "Docker",
      startsAt: "2026-05-10T05:00:00Z", // KST 14:00, 5/10
      endsAt: "2026-05-10T07:00:00Z",
    },
  ];
  const m = groupEventsByDay(events);
  assert.equal(m.get(10)?.length, 2);
  assert.equal(m.get(11)?.length, 1);
});
