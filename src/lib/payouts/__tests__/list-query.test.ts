// SPEC-PAYOUT-001 §2.1 — list-query 파서 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePayoutsQuery,
  parsePeriod,
  periodToUtcRange,
  computePayoutPagination,
  serializePayoutsQuery,
} from "../list-query";

const UUID_A = "11111111-1111-4111-8111-111111111111";

test("parsePayoutsQuery: 기본값", () => {
  const q = parsePayoutsQuery({});
  assert.deepEqual(q.status, []);
  assert.equal(q.flow, null);
  assert.equal(q.instructorId, null);
  assert.equal(q.period, null);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 20);
});

test("parsePayoutsQuery: status multi (CSV) + 알 수 없는 값 무시", () => {
  const q = parsePayoutsQuery({ status: "pending,requested,UNKNOWN" });
  assert.deepEqual(q.status.sort(), ["pending", "requested"].sort());
});

test("parsePayoutsQuery: flow whitelist", () => {
  assert.equal(parsePayoutsQuery({ flow: "corporate" }).flow, "corporate");
  assert.equal(parsePayoutsQuery({ flow: "government" }).flow, "government");
  assert.equal(parsePayoutsQuery({ flow: "INVALID" }).flow, null);
});

test("parsePayoutsQuery: instructor_id UUID 검증", () => {
  assert.equal(
    parsePayoutsQuery({ instructor_id: UUID_A }).instructorId,
    UUID_A,
  );
  assert.equal(parsePayoutsQuery({ instructor_id: "not-uuid" }).instructorId, null);
});

test("parsePeriod: month / quarter / year 인식, 기타는 null", () => {
  assert.deepEqual(parsePeriod("2026-05"), { kind: "month", raw: "2026-05" });
  assert.deepEqual(parsePeriod("2026-Q2"), { kind: "quarter", raw: "2026-Q2" });
  assert.deepEqual(parsePeriod("2026"), { kind: "year", raw: "2026" });
  assert.equal(parsePeriod("invalid"), null);
  assert.equal(parsePeriod("2026-13"), null);
});

test("periodToUtcRange: 2026-05 → KST 00:00 경계", () => {
  const r = periodToUtcRange({ kind: "month", raw: "2026-05" });
  // 2026-05-01 KST 00:00 = 2026-04-30 15:00 UTC
  assert.equal(r.startIso, "2026-04-30T15:00:00.000Z");
  // 2026-06-01 KST 00:00 = 2026-05-31 15:00 UTC
  assert.equal(r.endIso, "2026-05-31T15:00:00.000Z");
});

test("periodToUtcRange: 2026-Q2 → 4-6월", () => {
  const r = periodToUtcRange({ kind: "quarter", raw: "2026-Q2" });
  assert.equal(r.startIso, "2026-03-31T15:00:00.000Z");
  assert.equal(r.endIso, "2026-06-30T15:00:00.000Z");
});

test("periodToUtcRange: 2026 → 1월~다음해 1월 경계", () => {
  const r = periodToUtcRange({ kind: "year", raw: "2026" });
  assert.equal(r.startIso, "2025-12-31T15:00:00.000Z");
  assert.equal(r.endIso, "2026-12-31T15:00:00.000Z");
});

test("computePayoutPagination: total=0 → totalPages=1", () => {
  const p = computePayoutPagination(0, 1);
  assert.equal(p.totalPages, 1);
  assert.equal(p.needsRedirect, false);
});

test("computePayoutPagination: page over-flow → needsRedirect=true", () => {
  const p = computePayoutPagination(25, 999, 20);
  assert.equal(p.totalPages, 2);
  assert.equal(p.needsRedirect, true);
  assert.equal(p.page, 2); // 마지막 유효 페이지
});

test("serializePayoutsQuery: 기본값은 omit", () => {
  assert.equal(serializePayoutsQuery({ page: 1 }), "");
  assert.equal(
    serializePayoutsQuery({ status: ["pending", "requested"], page: 2 }),
    "status=pending%2Crequested&page=2",
  );
});
