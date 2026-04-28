// SPEC-ADMIN-001 §3.3 — Period.toRange 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPeriodKind, toRange } from "../period";

test("isPeriodKind", () => {
  assert.equal(isPeriodKind("month"), true);
  assert.equal(isPeriodKind("quarter"), true);
  assert.equal(isPeriodKind("year"), true);
  assert.equal(isPeriodKind("week"), false);
  assert.equal(isPeriodKind(null), false);
});

test("toRange month: 4월 → [4월 1일, 5월 1일)", () => {
  const r = toRange({ kind: "month", anchor: new Date(Date.UTC(2026, 3, 15)) });
  assert.equal(r.from.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-05-01T00:00:00.000Z");
});

test("toRange quarter: 4월(Q2) → [4월 1일, 7월 1일)", () => {
  const r = toRange({ kind: "quarter", anchor: new Date(Date.UTC(2026, 3, 15)) });
  assert.equal(r.from.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("toRange quarter: 1월(Q1) → [1월 1일, 4월 1일)", () => {
  const r = toRange({ kind: "quarter", anchor: new Date(Date.UTC(2026, 0, 5)) });
  assert.equal(r.from.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-04-01T00:00:00.000Z");
});

test("toRange year: → [1월 1일, 다음해 1월 1일)", () => {
  const r = toRange({ kind: "year", anchor: new Date(Date.UTC(2026, 6, 15)) });
  assert.equal(r.from.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(r.to.toISOString(), "2027-01-01T00:00:00.000Z");
});
