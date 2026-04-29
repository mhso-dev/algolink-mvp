// SPEC-PROPOSAL-001 §M3 REQ-PROPOSAL-LIST-* — list-query 순수 함수 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPOSAL_PAGE_SIZE,
  buildProposalPageMeta,
  buildProposalSearchPattern,
  parseProposalsQuery,
} from "../list-query";

test("PROPOSAL_PAGE_SIZE = 20 (REQ-PROPOSAL-LIST-001)", () => {
  assert.equal(PROPOSAL_PAGE_SIZE, 20);
});

test("parseProposalsQuery: 빈 쿼리 → 기본값", () => {
  const q = parseProposalsQuery({});
  assert.equal(q.q, null);
  assert.deepEqual(q.statuses, []);
  assert.equal(q.clientId, null);
  assert.equal(q.periodFrom, null);
  assert.equal(q.periodTo, null);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, 20);
});

test("parseProposalsQuery: q 정규화 + trim + cap 100자", () => {
  const q = parseProposalsQuery({ q: "  알고  " });
  assert.equal(q.q, "알고");

  const long = "a".repeat(150);
  const q2 = parseProposalsQuery({ q: long });
  assert.equal(q2.q!.length, 100);
});

test("parseProposalsQuery: status multi-select (comma-separated)", () => {
  const q = parseProposalsQuery({ status: "draft,submitted" });
  assert.deepEqual([...q.statuses], ["draft", "submitted"]);
});

test("parseProposalsQuery: 유효하지 않은 status 값 무시", () => {
  const q = parseProposalsQuery({ status: "draft,invalid_value,won" });
  assert.deepEqual([...q.statuses], ["draft", "won"]);
});

test("parseProposalsQuery: client_id UUID 검증", () => {
  const q1 = parseProposalsQuery({
    client_id: "11111111-2222-4333-8444-555555555555",
  });
  assert.equal(q1.clientId, "11111111-2222-4333-8444-555555555555");

  const q2 = parseProposalsQuery({ client_id: "not-uuid" });
  assert.equal(q2.clientId, null);
});

test("parseProposalsQuery: period_from/to ISO 8601 검증", () => {
  const q = parseProposalsQuery({
    period_from: "2026-05-01",
    period_to: "2026-05-31",
  });
  assert.equal(q.periodFrom, "2026-05-01");
  assert.equal(q.periodTo, "2026-05-31");

  const q2 = parseProposalsQuery({ period_from: "invalid" });
  assert.equal(q2.periodFrom, null);
});

test("parseProposalsQuery: page 음수/0 → 1", () => {
  assert.equal(parseProposalsQuery({ page: "0" }).page, 1);
  assert.equal(parseProposalsQuery({ page: "-5" }).page, 1);
  assert.equal(parseProposalsQuery({ page: "abc" }).page, 1);
  assert.equal(parseProposalsQuery({ page: "5" }).page, 5);
});

test("parseProposalsQuery: 배열 값 → 첫 번째만", () => {
  const q = parseProposalsQuery({ q: ["first", "second"] });
  assert.equal(q.q, "first");
});

test("buildProposalPageMeta: 0건 → totalPages=0 + isLast=true", () => {
  const meta = buildProposalPageMeta(0, 1);
  assert.equal(meta.total, 0);
  assert.equal(meta.totalPages, 0);
  assert.equal(meta.isLast, true);
  assert.equal(meta.rangeStart, 0);
  assert.equal(meta.rangeEnd, 0);
});

test("buildProposalPageMeta: 49건 + 페이지 1 → 1~20", () => {
  const meta = buildProposalPageMeta(49, 1);
  assert.equal(meta.totalPages, 3);
  assert.equal(meta.rangeStart, 1);
  assert.equal(meta.rangeEnd, 20);
  assert.equal(meta.isFirst, true);
  assert.equal(meta.isLast, false);
  assert.equal(meta.needsRedirect, false);
});

test("buildProposalPageMeta: 49건 + 페이지 3 → 41~49 (마지막 페이지)", () => {
  const meta = buildProposalPageMeta(49, 3);
  assert.equal(meta.rangeStart, 41);
  assert.equal(meta.rangeEnd, 49);
  assert.equal(meta.isLast, true);
  assert.equal(meta.needsRedirect, false);
});

test("buildProposalPageMeta: 페이지 초과 → needsRedirect (REQ-PROPOSAL-LIST-005)", () => {
  const meta = buildProposalPageMeta(49, 999);
  assert.equal(meta.needsRedirect, true);
  assert.equal(meta.page, 3); // 마지막 valid 페이지로 클램프
});

test("buildProposalSearchPattern: null → null", () => {
  assert.equal(buildProposalSearchPattern(null), null);
  assert.equal(buildProposalSearchPattern(""), null);
  assert.equal(buildProposalSearchPattern("   "), null);
});

test("buildProposalSearchPattern: 일반 문자열 → %escaped%", () => {
  assert.equal(buildProposalSearchPattern("알고"), "%알고%");
  assert.equal(buildProposalSearchPattern("  알고  "), "%알고%");
});

test("buildProposalSearchPattern: ILIKE 메타문자 escape", () => {
  // %, _, \ 모두 escape
  assert.equal(buildProposalSearchPattern("50%"), "%50\\%%");
  assert.equal(buildProposalSearchPattern("a_b"), "%a\\_b%");
  assert.equal(buildProposalSearchPattern("c\\d"), "%c\\\\d%");
});

test("buildProposalSearchPattern: 100자 cap", () => {
  const long = "a".repeat(150);
  const pattern = buildProposalSearchPattern(long);
  // %...% 두 자가 추가되므로 길이는 100+2 = 102
  assert.equal(pattern!.length, 102);
});
