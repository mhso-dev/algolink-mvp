// SPEC-NOTIFY-001 §M2 — list-query URL 파싱 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListFilters, buildListQueryString } from "../list-query";

test("parseListFilters: 빈 입력 → 기본값", () => {
  const f = parseListFilters({});
  assert.deepEqual(f, { types: [], read: "all", page: 1 });
});

test("parseListFilters: type CSV + read=unread + page=2", () => {
  const f = parseListFilters({
    type: "assignment_request,schedule_conflict",
    read: "unread",
    page: "2",
  });
  assert.deepEqual(f.types, ["assignment_request", "schedule_conflict"]);
  assert.equal(f.read, "unread");
  assert.equal(f.page, 2);
});

test("parseListFilters: 잘못된 type 값 무시", () => {
  const f = parseListFilters({ type: "assignment_request,not_a_type" });
  assert.deepEqual(f.types, ["assignment_request"]);
});

test("parseListFilters: 잘못된 read → all fallback", () => {
  const f = parseListFilters({ read: "weird" });
  assert.equal(f.read, "all");
});

test("parseListFilters: page 음수/0/NaN → 1 fallback", () => {
  assert.equal(parseListFilters({ page: "-1" }).page, 1);
  assert.equal(parseListFilters({ page: "0" }).page, 1);
  assert.equal(parseListFilters({ page: "abc" }).page, 1);
});

test("parseListFilters: 중복 type → 단일화", () => {
  const f = parseListFilters({ type: "assignment_request,assignment_request" });
  assert.deepEqual(f.types, ["assignment_request"]);
});

test("buildListQueryString: 모두 기본값 → 빈 문자열", () => {
  assert.equal(buildListQueryString({ types: [], read: "all", page: 1 }), "");
});

test("buildListQueryString: 필터 + page", () => {
  const s = buildListQueryString({
    types: ["assignment_request", "schedule_conflict"],
    read: "unread",
    page: 3,
  });
  assert.ok(s.startsWith("?"));
  assert.ok(s.includes("type=assignment_request%2Cschedule_conflict"));
  assert.ok(s.includes("read=unread"));
  assert.ok(s.includes("page=3"));
});
