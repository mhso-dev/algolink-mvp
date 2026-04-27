import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../next-param";

test("null/empty/undefined → role home (fallback)", () => {
  assert.equal(safeNextPath(null, "instructor"), "/me/dashboard");
  assert.equal(safeNextPath(undefined, "operator"), "/dashboard");
  assert.equal(safeNextPath("", "admin"), "/dashboard");
});

test("explicit fallback 우선", () => {
  assert.equal(
    safeNextPath(null, "instructor", "/custom"),
    "/custom",
  );
});

test("protocol-relative URL 거부 (//evil.com)", () => {
  assert.equal(safeNextPath("//evil.com", "operator"), "/dashboard");
  assert.equal(
    safeNextPath("//evil.com/dashboard", "operator"),
    "/dashboard",
  );
});

test("절대 외부 URL 거부 (https://evil.com)", () => {
  assert.equal(
    safeNextPath("https://evil.com", "operator"),
    "/dashboard",
  );
  assert.equal(
    safeNextPath("http://evil.com/dashboard", "operator"),
    "/dashboard",
  );
});

test("instructor가 /dashboard로 가려고 하면 거부 (자기 home으로 fallback)", () => {
  assert.equal(safeNextPath("/dashboard", "instructor"), "/me/dashboard");
  assert.equal(safeNextPath("/admin/users", "instructor"), "/me/dashboard");
});

test("auth 페이지로의 redirect 거부", () => {
  assert.equal(safeNextPath("/login", "operator"), "/dashboard");
  assert.equal(safeNextPath("/forgot-password", "operator"), "/dashboard");
  assert.equal(
    safeNextPath("/accept-invite/set-password", "operator"),
    "/dashboard",
  );
  assert.equal(safeNextPath("/reset-password", "instructor"), "/me/dashboard");
});

test("instructor의 유효한 경로 통과", () => {
  assert.equal(safeNextPath("/me/resume", "instructor"), "/me/resume");
  assert.equal(safeNextPath("/me", "instructor"), "/me");
  assert.equal(
    safeNextPath("/notifications", "instructor"),
    "/notifications",
  );
});

test("operator의 유효한 경로 통과", () => {
  assert.equal(safeNextPath("/dashboard", "operator"), "/dashboard");
  assert.equal(
    safeNextPath("/projects/123",  "operator"),
    "/projects/123",
  );
});

test("admin은 /admin/* 접근 가능", () => {
  assert.equal(safeNextPath("/admin/users", "admin"), "/admin/users");
  assert.equal(safeNextPath("/dashboard", "admin"), "/dashboard");
});

test("operator는 /admin/* 접근 불가", () => {
  assert.equal(safeNextPath("/admin/users", "operator"), "/dashboard");
});

test("쿼리스트링/해시 포함 경로 prefix 검증", () => {
  assert.equal(
    safeNextPath("/me/resume?tab=edit", "instructor"),
    "/me/resume?tab=edit",
  );
  assert.equal(
    safeNextPath("/dashboard#top", "operator"),
    "/dashboard#top",
  );
});
