// SPEC-PAYOUT-002 §M6 — REQ-PAYOUT002-EXCEPT-007 Scenario 18 자동화.
// instructor_withdrawn → '강사매칭' user-step 매핑 + exhaustiveness 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  userStepFromEnum,
  defaultEnumForUserStep,
  ALLOWED_TRANSITIONS,
  validateTransition,
} from "../status-machine";
import type { ProjectStatus } from "../../projects";

// =============================================================================
// Scenario 18 — instructor_withdrawn → '강사매칭'
// =============================================================================

test("Scenario 18: userStepFromEnum('instructor_withdrawn') === '강사매칭'", () => {
  assert.equal(userStepFromEnum("instructor_withdrawn"), "강사매칭");
});

test("Scenario 18: defaultEnumForUserStep('강사매칭') === 'lecture_requested' (forward default 보존)", () => {
  assert.equal(defaultEnumForUserStep("강사매칭"), "lecture_requested");
});

test("Scenario 18: 14-case 매핑 매트릭스 — 모두 매핑됨 (exhaustiveness)", () => {
  const allStatuses: ProjectStatus[] = [
    "proposal",
    "contract_confirmed",
    "lecture_requested",
    "instructor_sourcing",
    "assignment_review",
    "assignment_confirmed",
    "education_confirmed",
    "recruiting",
    "progress_confirmed",
    "in_progress",
    "education_done",
    "settlement_in_progress",
    "task_done",
    "instructor_withdrawn",
  ];
  for (const s of allStatuses) {
    const step = userStepFromEnum(s);
    assert.ok(
      ["의뢰", "강사매칭", "요청", "컨펌", "진행", "종료", "정산"].includes(step),
      `${s} → ${step} should be a valid user step`,
    );
  }
});

test("Scenario 18: instructor_withdrawn에서 lecture_requested로 전환 허용 (재배정 forward)", () => {
  const r = validateTransition("instructor_withdrawn", "lecture_requested", {
    instructorId: null,
  });
  assert.equal(r.ok, true);
});

test("Scenario 18: instructor_withdrawn에서 instructor_sourcing으로 전환 허용", () => {
  const r = validateTransition("instructor_withdrawn", "instructor_sourcing", {
    instructorId: null,
  });
  assert.equal(r.ok, true);
});

test("Scenario 18: instructor_withdrawn에서 assignment_confirmed 직접 전환 거부", () => {
  const r = validateTransition("instructor_withdrawn", "assignment_confirmed", {
    instructorId: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(r.ok, false);
});

test("Scenario 18: 워크플로우 단계에서 instructor_withdrawn으로 회귀 허용 (lecture_requested → withdrawn)", () => {
  const r = validateTransition("lecture_requested", "instructor_withdrawn", {
    instructorId: null,
  });
  assert.equal(r.ok, true);
});

test("Scenario 18: education_done에서 instructor_withdrawn 회귀 거부 (강의 끝난 후엔 settlement만)", () => {
  // education_done은 강의 종료 → settlement_in_progress 전환만 허용
  const r = validateTransition("education_done", "instructor_withdrawn", {
    instructorId: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(r.ok, false);
});

test("Scenario 18: ALLOWED_TRANSITIONS에 instructor_withdrawn key 존재", () => {
  assert.ok("instructor_withdrawn" in ALLOWED_TRANSITIONS);
  assert.deepEqual(
    [...ALLOWED_TRANSITIONS.instructor_withdrawn].sort(),
    ["instructor_sourcing", "lecture_requested"],
  );
});
