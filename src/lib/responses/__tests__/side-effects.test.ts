// SPEC-CONFIRM-001 §M2 — side-effects pure unit tests (REQ-CONFIRM-EFFECTS-001/002/006/008).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAssignmentAcceptanceEffects,
  computeAssignmentDowngradeEffects,
  computeInquiryAcceptanceEffects,
  NOTIFICATION_BODY_MAX_LENGTH,
  truncateForNotificationBody,
} from "../side-effects";

// =============================================================================
// computeAssignmentAcceptanceEffects — REQ-CONFIRM-EFFECTS-001/006
// =============================================================================

test("computeAssignmentAcceptanceEffects: 정상 — schedule_items 1행 + nextStatus assignment_confirmed", () => {
  const educationStartAt = new Date("2026-06-01T00:00:00Z");
  const educationEndAt = new Date("2026-06-03T09:00:00Z");
  const project = {
    id: "p1",
    status: "assignment_review",
    educationStartAt,
    educationEndAt,
    operatorId: "u-op",
  };
  const r = computeAssignmentAcceptanceEffects(project, "ia");
  assert.equal(r.scheduleItems.length, 1);
  assert.equal(r.scheduleItems[0].instructorId, "ia");
  assert.equal(r.scheduleItems[0].projectId, "p1");
  assert.equal(r.scheduleItems[0].scheduleKind, "system_lecture");
  assert.equal(r.scheduleItems[0].startsAt.toISOString(), "2026-05-31T15:00:00.000Z");
  assert.equal(r.scheduleItems[0].endsAt.toISOString(), "2026-06-03T15:00:00.000Z");
  assert.equal(r.nextStatus, "assignment_confirmed");
  assert.equal(r.scheduleSkippedReason, null);
});

test("computeAssignmentAcceptanceEffects: 같은 날짜 start/end → KST 1일 all-day 일정", () => {
  const project = {
    id: "p1",
    status: "assignment_review",
    educationStartAt: new Date("2026-06-01T00:00:00Z"),
    educationEndAt: new Date("2026-06-01T00:00:00Z"),
    operatorId: "u-op",
  };
  const r = computeAssignmentAcceptanceEffects(project, "ia");
  assert.equal(r.scheduleItems.length, 1);
  assert.equal(r.scheduleItems[0].startsAt.toISOString(), "2026-05-31T15:00:00.000Z");
  assert.equal(r.scheduleItems[0].endsAt.toISOString(), "2026-06-01T15:00:00.000Z");
});

test("computeAssignmentAcceptanceEffects: education_start_at null → schedule skip + 경고 사유", () => {
  const r = computeAssignmentAcceptanceEffects(
    {
      id: "p2",
      status: "assignment_review",
      educationStartAt: null,
      educationEndAt: new Date(),
      operatorId: "u-op",
    },
    "ia",
  );
  assert.equal(r.scheduleItems.length, 0);
  assert.equal(r.nextStatus, "assignment_confirmed");
  assert.equal(r.scheduleSkippedReason, "education_dates_missing");
});

test("computeAssignmentAcceptanceEffects: education_end_at null → schedule skip", () => {
  const r = computeAssignmentAcceptanceEffects(
    {
      id: "p3",
      status: "assignment_review",
      educationStartAt: new Date(),
      educationEndAt: null,
      operatorId: "u-op",
    },
    "ib",
  );
  assert.equal(r.scheduleItems.length, 0);
  assert.equal(r.scheduleSkippedReason, "education_dates_missing");
});

// =============================================================================
// computeInquiryAcceptanceEffects — REQ-CONFIRM-EFFECTS-002
// =============================================================================

test("computeInquiryAcceptanceEffects: schedule 미생성 + status='accepted' 반환", () => {
  const r = computeInquiryAcceptanceEffects({
    id: "pi1",
    status: "pending",
    createdByUserId: "u-op",
  });
  assert.equal(r.inquiryStatus, "accepted");
});

// =============================================================================
// computeAssignmentDowngradeEffects — REQ-CONFIRM-EFFECTS-008 (HIGH-2)
// =============================================================================

test("computeAssignmentDowngradeEffects: instructor_id NULL + status assignment_review + DELETE 필터", () => {
  const r = computeAssignmentDowngradeEffects("p1", "ia");
  assert.equal(r.nextInstructorId, null);
  assert.equal(r.nextStatus, "assignment_review");
  assert.deepEqual(r.scheduleDeleteFilter, {
    projectId: "p1",
    instructorId: "ia",
    scheduleKind: "system_lecture",
  });
});

// =============================================================================
// truncation (LOW-8)
// =============================================================================

test("NOTIFICATION_BODY_MAX_LENGTH === 1000", () => {
  assert.equal(NOTIFICATION_BODY_MAX_LENGTH, 1000);
});

test("truncateForNotificationBody: 1000자 이하 그대로", () => {
  const text = "안녕하세요";
  assert.equal(truncateForNotificationBody(text), text);
});

test("truncateForNotificationBody: 1000자 정확히 그대로", () => {
  const text = "a".repeat(1000);
  assert.equal(truncateForNotificationBody(text), text);
});

test("truncateForNotificationBody: 1001자 → 1000자 + …(생략)", () => {
  const text = "a".repeat(1001);
  const out = truncateForNotificationBody(text);
  assert.equal(out.length, 1000 + "…(생략)".length);
  assert.ok(out.endsWith("…(생략)"));
});
