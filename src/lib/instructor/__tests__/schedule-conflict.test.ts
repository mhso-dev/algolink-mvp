// SPEC-ME-001 §2.5 REQ-ME-CAL-008 — 일정 충돌 감지 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rangesOverlap, detectConflicts, type ScheduleSpan } from "../schedule-conflict";

const t = (s: string) => new Date(s);

test("rangesOverlap: 완전 겹침", () => {
  assert.equal(rangesOverlap(t("2026-05-01T10:00Z"), t("2026-05-01T12:00Z"), t("2026-05-01T10:30Z"), t("2026-05-01T11:30Z")), true);
});

test("rangesOverlap: 부분 겹침 (앞쪽)", () => {
  assert.equal(rangesOverlap(t("2026-05-01T10:00Z"), t("2026-05-01T12:00Z"), t("2026-05-01T11:00Z"), t("2026-05-01T13:00Z")), true);
});

test("rangesOverlap: 인접 (end = start) 겹침 아님", () => {
  assert.equal(rangesOverlap(t("2026-05-01T10:00Z"), t("2026-05-01T12:00Z"), t("2026-05-01T12:00Z"), t("2026-05-01T13:00Z")), false);
});

test("rangesOverlap: 완전 분리", () => {
  assert.equal(rangesOverlap(t("2026-05-01T10:00Z"), t("2026-05-01T11:00Z"), t("2026-05-01T13:00Z"), t("2026-05-01T14:00Z")), false);
});

const existingSystemLecture: ScheduleSpan = {
  id: "sl-1",
  scheduleKind: "system_lecture",
  startsAt: t("2026-05-10T09:00Z"),
  endsAt: t("2026-05-10T18:00Z"),
};
const existingUnavailable: ScheduleSpan = {
  id: "ua-1",
  scheduleKind: "unavailable",
  startsAt: t("2026-05-11T09:00Z"),
  endsAt: t("2026-05-11T12:00Z"),
};

test("detectConflicts: personal 일정은 검사 제외 (항상 false)", () => {
  const r = detectConflicts(
    { scheduleKind: "personal", startsAt: t("2026-05-10T10:00Z"), endsAt: t("2026-05-10T11:00Z") },
    [existingSystemLecture],
  );
  assert.equal(r.hasConflict, false);
  assert.deepEqual(r.conflictingIds, []);
});

test("detectConflicts: unavailable이 system_lecture와 겹치면 충돌", () => {
  const r = detectConflicts(
    { scheduleKind: "unavailable", startsAt: t("2026-05-10T10:00Z"), endsAt: t("2026-05-10T12:00Z") },
    [existingSystemLecture],
  );
  assert.equal(r.hasConflict, true);
  assert.deepEqual(r.conflictingIds, ["sl-1"]);
});

test("detectConflicts: unavailable이 다른 unavailable과 겹쳐도 충돌 아님 (system_lecture만)", () => {
  const r = detectConflicts(
    { scheduleKind: "unavailable", startsAt: t("2026-05-11T10:00Z"), endsAt: t("2026-05-11T11:00Z") },
    [existingUnavailable],
  );
  assert.equal(r.hasConflict, false);
});

test("detectConflicts: 동일 id는 자기 자신과 충돌하지 않음", () => {
  const r = detectConflicts(
    { id: "sl-1", scheduleKind: "unavailable", startsAt: t("2026-05-10T10:00Z"), endsAt: t("2026-05-10T11:00Z") },
    [existingSystemLecture],
  );
  assert.equal(r.hasConflict, false);
});

test("detectConflicts: 분리된 시간대는 충돌 없음", () => {
  const r = detectConflicts(
    { scheduleKind: "unavailable", startsAt: t("2026-05-12T10:00Z"), endsAt: t("2026-05-12T11:00Z") },
    [existingSystemLecture, existingUnavailable],
  );
  assert.equal(r.hasConflict, false);
  assert.deepEqual(r.conflictingIds, []);
});

test("detectConflicts: 빈 existing 배열", () => {
  const r = detectConflicts(
    { scheduleKind: "unavailable", startsAt: t("2026-05-12T10:00Z"), endsAt: t("2026-05-12T11:00Z") },
    [],
  );
  assert.equal(r.hasConflict, false);
});
