// SPEC-CONFIRM-001 §M2 — notification mapping pure unit tests (REQ-CONFIRM-NOTIFY-002).
// LOW-7 fix: 6 매핑 케이스 (2 source_kind × 3 non-pending status).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapResponseToNotificationType } from "../notification-mapping";

test("매핑 1: assignment_request × accepted → assignment_accepted", () => {
  assert.equal(
    mapResponseToNotificationType("assignment_request", "accepted"),
    "assignment_accepted",
  );
});

test("매핑 2: assignment_request × declined → assignment_declined", () => {
  assert.equal(
    mapResponseToNotificationType("assignment_request", "declined"),
    "assignment_declined",
  );
});

test("매핑 3: assignment_request × conditional → assignment_declined (§5.4 통합)", () => {
  assert.equal(
    mapResponseToNotificationType("assignment_request", "conditional"),
    "assignment_declined",
  );
});

test("매핑 4: proposal_inquiry × accepted → inquiry_accepted", () => {
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "accepted"),
    "inquiry_accepted",
  );
});

test("매핑 5: proposal_inquiry × declined → inquiry_declined", () => {
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "declined"),
    "inquiry_declined",
  );
});

test("매핑 6: proposal_inquiry × conditional → inquiry_conditional", () => {
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "conditional"),
    "inquiry_conditional",
  );
});
