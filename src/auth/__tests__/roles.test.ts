import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidRole,
  roleHomePath,
  rolePathPrefixes,
} from "../roles";

test("isValidRole: 유효한 역할은 true", () => {
  assert.equal(isValidRole("instructor"), true);
  assert.equal(isValidRole("operator"), true);
  assert.equal(isValidRole("admin"), true);
});

test("isValidRole: 그 외 값은 false", () => {
  assert.equal(isValidRole("foo"), false);
  assert.equal(isValidRole(null), false);
  assert.equal(isValidRole(undefined), false);
  assert.equal(isValidRole(123), false);
  assert.equal(isValidRole(""), false);
  assert.equal(isValidRole({}), false);
});

test("roleHomePath: 역할별 home 경로", () => {
  assert.equal(roleHomePath("instructor"), "/me/dashboard");
  assert.equal(roleHomePath("operator"), "/dashboard");
  assert.equal(roleHomePath("admin"), "/dashboard");
});

test("rolePathPrefixes: instructor는 /me 계열만", () => {
  const p = rolePathPrefixes("instructor");
  assert.ok(p.includes("/me"));
  assert.ok(p.includes("/api/me"));
  assert.ok(!p.includes("/dashboard"));
  assert.ok(!p.includes("/admin"));
});

test("rolePathPrefixes: operator는 /dashboard 계열, /admin 제외", () => {
  const p = rolePathPrefixes("operator");
  assert.ok(p.includes("/dashboard"));
  assert.ok(p.includes("/operator"));
  assert.ok(!p.includes("/admin"));
});

test("rolePathPrefixes: admin은 operator 경로 + /admin 포함", () => {
  const operator = rolePathPrefixes("operator");
  const admin = rolePathPrefixes("admin");
  for (const p of operator) {
    assert.ok(admin.includes(p), `admin은 operator의 ${p}를 포함해야 함`);
  }
  assert.ok(admin.includes("/admin"));
});
