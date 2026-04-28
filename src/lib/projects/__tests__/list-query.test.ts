// SPEC-PROJECT-001 §2.1 — list-query 파서 + 페이지네이션 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_PAGE_SIZE,
  parseProjectListQuery,
  serializeProjectListQuery,
  computePagination,
} from "../list-query";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

test("parseProjectListQuery: 기본값", () => {
  const q = parseProjectListQuery({});
  assert.equal(q.q, null);
  assert.deepEqual(q.status, []);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, PROJECT_PAGE_SIZE);
  assert.equal(q.sort, "scheduled_at");
  assert.equal(q.order, "desc");
});

test("parseProjectListQuery: status multi (CSV)", () => {
  const q = parseProjectListQuery({ status: "in_progress,proposal,UNKNOWN" });
  assert.deepEqual(q.status.sort(), ["in_progress", "proposal"].sort());
});

test("parseProjectListQuery: status multi (배열)", () => {
  const q = parseProjectListQuery({ status: ["proposal", "task_done"] });
  assert.deepEqual(q.status.sort(), ["proposal", "task_done"].sort());
});

test("parseProjectListQuery: operatorId/clientId UUID 검증", () => {
  const q = parseProjectListQuery({
    operatorId: UUID_A,
    clientId: "not-a-uuid",
  });
  assert.equal(q.operatorId, UUID_A);
  assert.equal(q.clientId, null);
});

test("parseProjectListQuery: startFrom/startTo ISO date 검증", () => {
  const ok = parseProjectListQuery({ startFrom: "2026-01-01", startTo: "2026-12-31" });
  assert.equal(ok.startFrom, "2026-01-01");
  assert.equal(ok.startTo, "2026-12-31");

  const bad = parseProjectListQuery({ startFrom: "2026/01/01", startTo: "abc" });
  assert.equal(bad.startFrom, null);
  assert.equal(bad.startTo, null);
});

test("parseProjectListQuery: page 음수/NaN 은 1 로", () => {
  assert.equal(parseProjectListQuery({ page: "-3" }).page, 1);
  assert.equal(parseProjectListQuery({ page: "abc" }).page, 1);
  assert.equal(parseProjectListQuery({ page: "5" }).page, 5);
});

test("parseProjectListQuery: sort/order 화이트리스트", () => {
  const q = parseProjectListQuery({ sort: "education_start_at", order: "asc" });
  assert.equal(q.sort, "education_start_at");
  assert.equal(q.order, "asc");
  // invalid sort → default
  assert.equal(parseProjectListQuery({ sort: "drop_table" }).sort, "scheduled_at");
});

test("serializeProjectListQuery: 기본 값 omit", () => {
  const s = serializeProjectListQuery({ page: 1, sort: "scheduled_at", order: "desc" });
  assert.equal(s, "");
});

test("serializeProjectListQuery: 모든 필터", () => {
  const s = serializeProjectListQuery({
    q: "ai",
    status: ["proposal", "in_progress"],
    operatorId: UUID_A,
    clientId: UUID_B,
    startFrom: "2026-01-01",
    startTo: "2026-12-31",
    sort: "status",
    order: "asc",
    page: 3,
  });
  const parsed = new URLSearchParams(s);
  assert.equal(parsed.get("q"), "ai");
  assert.equal(parsed.get("status"), "proposal,in_progress");
  assert.equal(parsed.get("operatorId"), UUID_A);
  assert.equal(parsed.get("clientId"), UUID_B);
  assert.equal(parsed.get("page"), "3");
  assert.equal(parsed.get("sort"), "status");
  assert.equal(parsed.get("order"), "asc");
});

test("parse → serialize → parse 라운드트립 안정성", () => {
  const original = parseProjectListQuery({
    q: "강의",
    status: "in_progress,proposal",
    operatorId: UUID_A,
    page: "2",
    sort: "education_start_at",
    order: "asc",
  });
  const serialized = serializeProjectListQuery(original);
  const params = Object.fromEntries(new URLSearchParams(serialized));
  const reparsed = parseProjectListQuery(params);
  assert.equal(reparsed.q, original.q);
  assert.equal(reparsed.page, original.page);
  assert.equal(reparsed.sort, original.sort);
  assert.equal(reparsed.order, original.order);
  assert.deepEqual(reparsed.status.sort(), original.status.sort());
});

test("computePagination: total 0 → totalPages 1, isFirst+isLast", () => {
  const p = computePagination(0, 1);
  assert.equal(p.totalPages, 1);
  assert.equal(p.isFirst, true);
  assert.equal(p.isLast, true);
  assert.equal(p.needsRedirect, false);
  assert.equal(p.rangeStart, 0);
  assert.equal(p.rangeEnd, 0);
});

test("computePagination: 100건 / 20 = 5페이지", () => {
  const p = computePagination(100, 1);
  assert.equal(p.totalPages, 5);
  assert.equal(p.rangeEnd, 20);
});

test("computePagination: page 초과 시 needsRedirect", () => {
  const p = computePagination(20, 99);
  assert.equal(p.needsRedirect, true);
  assert.equal(p.page, 1); // safe clamp
});

test("computePagination: 마지막 페이지 부분 채움", () => {
  const p = computePagination(45, 3);
  assert.equal(p.totalPages, 3);
  assert.equal(p.rangeStart, 40);
  assert.equal(p.rangeEnd, 45);
  assert.equal(p.isLast, true);
});

test("computePagination: 경계 — page 0 → safePage 1", () => {
  const p = computePagination(20, 0);
  assert.equal(p.page, 1);
});
