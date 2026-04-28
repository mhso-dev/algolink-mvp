// SPEC-ADMIN-001 §3.2 — list-query 파서 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_USERS_PAGE_SIZE,
  parseAdminUserListQuery,
  serializeAdminUserListQuery,
} from "../list-query";

test("parseAdminUserListQuery: 기본값", () => {
  const q = parseAdminUserListQuery({});
  assert.equal(q.q, null);
  assert.equal(q.role, null);
  assert.equal(q.isActive, null);
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, ADMIN_USERS_PAGE_SIZE);
});

test("parseAdminUserListQuery: role 유효성", () => {
  assert.equal(parseAdminUserListQuery({ role: "instructor" }).role, "instructor");
  assert.equal(parseAdminUserListQuery({ role: "owner" }).role, null);
});

test("parseAdminUserListQuery: is_active false/true/잘못된 값", () => {
  assert.equal(parseAdminUserListQuery({ is_active: "false" }).isActive, false);
  assert.equal(parseAdminUserListQuery({ is_active: "true" }).isActive, true);
  assert.equal(parseAdminUserListQuery({ is_active: "yes" }).isActive, null);
  // camelCase alias
  assert.equal(parseAdminUserListQuery({ isActive: "false" }).isActive, false);
});

test("parseAdminUserListQuery: q 공백 제거", () => {
  assert.equal(parseAdminUserListQuery({ q: "  kim  " }).q, "kim");
  assert.equal(parseAdminUserListQuery({ q: "   " }).q, null);
});

test("parseAdminUserListQuery: page 정수/하한", () => {
  assert.equal(parseAdminUserListQuery({ page: "3" }).page, 3);
  assert.equal(parseAdminUserListQuery({ page: "0" }).page, 1);
  assert.equal(parseAdminUserListQuery({ page: "abc" }).page, 1);
});

test("serializeAdminUserListQuery: 기본값 omit", () => {
  assert.equal(serializeAdminUserListQuery({}), "");
});

test("serializeAdminUserListQuery: 모든 필드", () => {
  const s = serializeAdminUserListQuery({
    q: "kim",
    role: "instructor",
    isActive: false,
    page: 2,
  });
  const parsed = new URLSearchParams(s);
  assert.equal(parsed.get("q"), "kim");
  assert.equal(parsed.get("role"), "instructor");
  assert.equal(parsed.get("is_active"), "false");
  assert.equal(parsed.get("page"), "2");
});
