// SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-ENTITY-004/005 — status machine pure unit tests.
// Runs via: tsx --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_PROPOSAL_TRANSITIONS,
  PROPOSAL_STATUSES,
  rejectIfFrozen,
  timestampUpdatesForTransition,
  validateProposalTransition,
} from "../status-machine";
import type { ProposalStatus } from "../types";
import { isFrozenProposalStatus } from "../types";

const ALL: ProposalStatus[] = [
  "draft",
  "submitted",
  "won",
  "lost",
  "withdrawn",
];

test("PROPOSAL_STATUSES 는 정확히 5개 (REQ-PROPOSAL-ENTITY-002)", () => {
  assert.deepEqual([...PROPOSAL_STATUSES], [
    "draft",
    "submitted",
    "won",
    "lost",
    "withdrawn",
  ]);
});

test("ALLOWED_PROPOSAL_TRANSITIONS — draft에서 허용된 전환 (submitted, withdrawn)", () => {
  assert.deepEqual([...ALLOWED_PROPOSAL_TRANSITIONS.draft], [
    "submitted",
    "withdrawn",
  ]);
});

test("ALLOWED_PROPOSAL_TRANSITIONS — submitted에서 허용된 전환 (won, lost, withdrawn)", () => {
  assert.deepEqual([...ALLOWED_PROPOSAL_TRANSITIONS.submitted], [
    "won",
    "lost",
    "withdrawn",
  ]);
});

test("ALLOWED_PROPOSAL_TRANSITIONS — won/lost/withdrawn은 frozen (전환 0건)", () => {
  assert.deepEqual([...ALLOWED_PROPOSAL_TRANSITIONS.won], []);
  assert.deepEqual([...ALLOWED_PROPOSAL_TRANSITIONS.lost], []);
  assert.deepEqual([...ALLOWED_PROPOSAL_TRANSITIONS.withdrawn], []);
});

test("validateProposalTransition: 허용 전환 PASS", () => {
  assert.deepEqual(validateProposalTransition("draft", "submitted"), { ok: true });
  assert.deepEqual(validateProposalTransition("draft", "withdrawn"), { ok: true });
  assert.deepEqual(validateProposalTransition("submitted", "won"), { ok: true });
  assert.deepEqual(validateProposalTransition("submitted", "lost"), { ok: true });
  assert.deepEqual(validateProposalTransition("submitted", "withdrawn"), { ok: true });
});

test("validateProposalTransition: 동일 상태 전환 거부", () => {
  for (const s of ALL) {
    const result = validateProposalTransition(s, s);
    assert.equal(result.ok, false);
  }
});

test("validateProposalTransition: frozen → * 모두 거부", () => {
  const frozen: ProposalStatus[] = ["won", "lost", "withdrawn"];
  for (const f of frozen) {
    for (const to of ALL) {
      if (f === to) continue;
      const result = validateProposalTransition(f, to);
      assert.equal(result.ok, false, `${f} → ${to} 는 거부되어야 함`);
    }
  }
});

test("validateProposalTransition: submitted → draft 거부 (역방향)", () => {
  assert.equal(validateProposalTransition("submitted", "draft").ok, false);
});

test("validateProposalTransition: draft → won/lost 거부 (제출 건너뜀)", () => {
  assert.equal(validateProposalTransition("draft", "won").ok, false);
  assert.equal(validateProposalTransition("draft", "lost").ok, false);
});

test("validateProposalTransition: 거부 사유는 한국어 표준", () => {
  const result = validateProposalTransition("won", "draft");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "허용되지 않은 상태 전환입니다.");
  }
});

test("timestampUpdatesForTransition: submitted 진입 → submittedAt set", () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const updates = timestampUpdatesForTransition("submitted", now);
  assert.equal(updates.submittedAt, now);
  assert.equal(updates.decidedAt, undefined);
});

test("timestampUpdatesForTransition: won/lost/withdrawn 진입 → decidedAt set", () => {
  const now = new Date("2026-04-29T10:00:00Z");
  const wonUpd = timestampUpdatesForTransition("won", now);
  assert.equal(wonUpd.decidedAt, now);
  const lostUpd = timestampUpdatesForTransition("lost", now);
  assert.equal(lostUpd.decidedAt, now);
  const wdUpd = timestampUpdatesForTransition("withdrawn", now);
  assert.equal(wdUpd.decidedAt, now);
});

test("timestampUpdatesForTransition: draft 진입 → 둘 다 미설정", () => {
  const now = new Date();
  const updates = timestampUpdatesForTransition("draft", now);
  assert.equal(updates.submittedAt, undefined);
  assert.equal(updates.decidedAt, undefined);
});

test("rejectIfFrozen: frozen 상태는 거부 + 한국어 에러", () => {
  for (const s of ["won", "lost", "withdrawn"] as const) {
    const result = rejectIfFrozen(s);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "확정된 제안서는 수정할 수 없습니다.");
    }
  }
});

test("rejectIfFrozen: draft/submitted 는 OK", () => {
  assert.deepEqual(rejectIfFrozen("draft"), { ok: true });
  assert.deepEqual(rejectIfFrozen("submitted"), { ok: true });
});

test("isFrozenProposalStatus: type guard 동작", () => {
  assert.equal(isFrozenProposalStatus("draft"), false);
  assert.equal(isFrozenProposalStatus("submitted"), false);
  assert.equal(isFrozenProposalStatus("won"), true);
  assert.equal(isFrozenProposalStatus("lost"), true);
  assert.equal(isFrozenProposalStatus("withdrawn"), true);
});

// Exhaustive transition matrix
test("validateProposalTransition: 5×5 = 25 케이스 exhaustive 검증", () => {
  // ok 5개: draft→submitted, draft→withdrawn, submitted→won, submitted→lost, submitted→withdrawn
  let okCount = 0;
  let rejectCount = 0;
  for (const from of ALL) {
    for (const to of ALL) {
      const result = validateProposalTransition(from, to);
      if (result.ok) okCount++;
      else rejectCount++;
    }
  }
  assert.equal(okCount, 5, "허용 전환 정확히 5건");
  assert.equal(rejectCount, 20, "거부 전환 정확히 20건 (25 - 5)");
});
