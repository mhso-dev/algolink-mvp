// SPEC-PROJECT-001 §2.5 — status machine pure unit tests.
// SPEC-PROJECT-AMEND-001 — assignment_confirmed → assignment_review backward edge tests.
// Runs via: tsx --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TRANSITIONS,
  USER_STEPS,
  defaultEnumForUserStep,
  userStepFromEnum,
  validateTransition,
} from "../status-machine";
import type { ProjectStatus } from "../../projects";

const ALL_STATUSES: ProjectStatus[] = [
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
];

test("USER_STEPS 는 7단계 고정", () => {
  assert.deepEqual(
    [...USER_STEPS],
    ["의뢰", "강사매칭", "요청", "컨펌", "진행", "종료", "정산"],
  );
});

test("userStepFromEnum: 13개 enum 모두 매핑 (exhaustive)", () => {
  for (const s of ALL_STATUSES) {
    const step = userStepFromEnum(s);
    assert.ok(
      USER_STEPS.includes(step),
      `${s} -> ${step} (must be one of USER_STEPS)`,
    );
  }
});

test("userStepFromEnum: 대표 매핑 검증", () => {
  assert.equal(userStepFromEnum("proposal"), "의뢰");
  assert.equal(userStepFromEnum("contract_confirmed"), "의뢰");
  assert.equal(userStepFromEnum("instructor_sourcing"), "강사매칭");
  assert.equal(userStepFromEnum("assignment_review"), "요청");
  assert.equal(userStepFromEnum("assignment_confirmed"), "컨펌");
  assert.equal(userStepFromEnum("in_progress"), "진행");
  assert.equal(userStepFromEnum("education_done"), "종료");
  assert.equal(userStepFromEnum("task_done"), "정산");
});

test("defaultEnumForUserStep: 의뢰 → proposal", () => {
  assert.equal(defaultEnumForUserStep("의뢰"), "proposal");
  assert.equal(defaultEnumForUserStep("정산"), "settlement_in_progress");
  assert.equal(defaultEnumForUserStep("컨펌"), "assignment_confirmed");
});

test("validateTransition: graph 외 전환 거부", () => {
  const r = validateTransition("proposal", "in_progress", { instructorId: "x" });
  assert.equal(r.ok, false);
});

test("validateTransition: 강사 미배정에서 컨펌 단계 진입 차단 (REQ-PROJECT-STATUS-003)", () => {
  // 그래프상 lecture_requested -> assignment_review 만 허용. 직접 assignment_confirmed 시도.
  const r = validateTransition("assignment_review", "assignment_confirmed", {
    instructorId: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /강사를 배정/);
  }
});

test("validateTransition: 강사 배정 후 컨펌 OK", () => {
  const r = validateTransition("assignment_review", "assignment_confirmed", {
    instructorId: "uuid-A",
  });
  assert.equal(r.ok, true);
});

test("validateTransition: education_done → settlement_in_progress OK", () => {
  const r = validateTransition("education_done", "settlement_in_progress", {
    instructorId: "x",
  });
  assert.equal(r.ok, true);
});

test("validateTransition: in_progress 에서 settlement_in_progress 차단", () => {
  // 그래프 상 in_progress -> education_done 만 허용.
  const r = validateTransition("in_progress", "settlement_in_progress", {
    instructorId: "x",
  });
  assert.equal(r.ok, false);
});

test("validateTransition: 정상 흐름 proposal → contract_confirmed", () => {
  const r = validateTransition("proposal", "contract_confirmed", {
    instructorId: null,
  });
  assert.equal(r.ok, true);
});

test("validateTransition: 동일 상태 거부", () => {
  const r = validateTransition("proposal", "proposal", { instructorId: null });
  assert.equal(r.ok, false);
});

// =============================================================================
// SPEC-PROJECT-AMEND-001 — assignment_confirmed → assignment_review backward edge
// SPEC-CONFIRM-001 §HIGH-2 (REQ-CONFIRM-EFFECTS-008) reverse compensation 정식 경로.
// =============================================================================

test("AMEND-001 REQ-AMEND-TESTS-001-A: assignment_confirmed → assignment_review (instructorId=null) OK", () => {
  const r = validateTransition("assignment_confirmed", "assignment_review", {
    instructorId: null,
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 REQ-AMEND-TESTS-001-B: assignment_confirmed → assignment_review (instructorId=uuid) OK — REQ-PROJECT-STATUS-003 가드는 to=assignment_confirmed에만 적용", () => {
  const r = validateTransition("assignment_confirmed", "assignment_review", {
    instructorId: "instructor-uuid-123",
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 REQ-AMEND-TESTS-001-C: assignment_review → assignment_review 자기참조 거부", () => {
  const r = validateTransition("assignment_review", "assignment_review", {
    instructorId: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /동일한 단계로 전환할 수 없습니다/);
  }
});

test("AMEND-001 REQ-AMEND-TESTS-001-D: ALLOWED_TRANSITIONS.assignment_confirmed.length === 4 + includes 'assignment_review'", () => {
  assert.equal(ALLOWED_TRANSITIONS.assignment_confirmed.length, 4);
  assert.ok(
    ALLOWED_TRANSITIONS.assignment_confirmed.includes("assignment_review"),
    "assignment_review must be present in ALLOWED_TRANSITIONS.assignment_confirmed",
  );
});

test("AMEND-001 회귀 가드: forward edge assignment_review → assignment_confirmed OK (강사 배정 시)", () => {
  const r = validateTransition("assignment_review", "assignment_confirmed", {
    instructorId: "uuid-A",
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 회귀 가드: assignment_confirmed → education_confirmed OK (다른 forward edge 보존)", () => {
  const r = validateTransition("assignment_confirmed", "education_confirmed", {
    instructorId: "uuid-A",
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 회귀 가드: assignment_confirmed → recruiting OK (다른 forward edge 보존)", () => {
  const r = validateTransition("assignment_confirmed", "recruiting", {
    instructorId: "uuid-A",
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 회귀 가드: assignment_confirmed → instructor_withdrawn OK (regression entry 보존)", () => {
  const r = validateTransition("assignment_confirmed", "instructor_withdrawn", {
    instructorId: "uuid-A",
  });
  assert.equal(r.ok, true);
});

test("AMEND-001 회귀 가드: ALLOWED_TRANSITIONS exhaustiveness 14 keys", () => {
  const expectedKeys: ProjectStatus[] = [
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
  for (const k of expectedKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, k),
      `ALLOWED_TRANSITIONS must contain key ${k}`,
    );
    assert.ok(Array.isArray(ALLOWED_TRANSITIONS[k]));
  }
  assert.equal(Object.keys(ALLOWED_TRANSITIONS).length, 14);
});
