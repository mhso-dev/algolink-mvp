// SPEC-CLIENT-001 §2.2 — list-query 파서 + 페이지 메타 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_PAGE_SIZE,
  parseClientsQuery,
  buildPageMeta,
  buildClientSearchPattern,
} from "../list-query";

test("parseClientsQuery: 기본값", () => {
  const q = parseClientsQuery({});
  assert.equal(q.q, null);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, CLIENT_PAGE_SIZE);
});

test("parseClientsQuery: q 와 page 정상 파싱", () => {
  const q = parseClientsQuery({ q: "알고", page: "3" });
  assert.equal(q.q, "알고");
  assert.equal(q.page, 3);
});

test("parseClientsQuery: page 음수/NaN/0 → 1", () => {
  assert.equal(parseClientsQuery({ page: "-5" }).page, 1);
  assert.equal(parseClientsQuery({ page: "abc" }).page, 1);
  assert.equal(parseClientsQuery({ page: "0" }).page, 1);
});

test("parseClientsQuery: 빈 q 는 null로 정규화", () => {
  assert.equal(parseClientsQuery({ q: "   " }).q, null);
  assert.equal(parseClientsQuery({ q: "" }).q, null);
});

test("parseClientsQuery: q는 100자로 절단", () => {
  const long = "가".repeat(150);
  const q = parseClientsQuery({ q: long });
  assert.equal(q.q?.length, 100);
});

test("parseClientsQuery: 배열은 첫 값 사용", () => {
  const q = parseClientsQuery({ q: ["foo", "bar"] });
  assert.equal(q.q, "foo");
});

test("buildPageMeta: 47건 page 1 → 1-20 / 47", () => {
  const m = buildPageMeta(47, 1, 20);
  assert.equal(m.total, 47);
  assert.equal(m.totalPages, 3);
  assert.equal(m.rangeStart, 1);
  assert.equal(m.rangeEnd, 20);
  assert.equal(m.isFirst, true);
  assert.equal(m.isLast, false);
});

test("buildPageMeta: 47건 page 3 → 41-47 / 47", () => {
  const m = buildPageMeta(47, 3, 20);
  assert.equal(m.totalPages, 3);
  assert.equal(m.rangeStart, 41);
  assert.equal(m.rangeEnd, 47);
  assert.equal(m.isLast, true);
});

test("buildPageMeta: 0건 → totalPages 0", () => {
  const m = buildPageMeta(0, 1, 20);
  assert.equal(m.total, 0);
  assert.equal(m.totalPages, 0);
  assert.equal(m.rangeStart, 0);
  assert.equal(m.rangeEnd, 0);
});

test("buildPageMeta: page > totalPages → needsRedirect true", () => {
  const m = buildPageMeta(10, 5, 20);
  assert.equal(m.needsRedirect, true);
  assert.equal(m.page, 1); // safePage clamped
});

test("buildClientSearchPattern: null/공백 → null", () => {
  assert.equal(buildClientSearchPattern(null), null);
  assert.equal(buildClientSearchPattern(""), null);
  assert.equal(buildClientSearchPattern("   "), null);
});

test("buildClientSearchPattern: 일반 입력 → %escaped%", () => {
  assert.equal(buildClientSearchPattern("알고"), "%알고%");
});

test("buildClientSearchPattern: %_\\ escape", () => {
  assert.equal(buildClientSearchPattern("a%b_c\\d"), "%a\\%b\\_c\\\\d%");
});
