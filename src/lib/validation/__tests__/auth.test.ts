// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001/002 / §2.4 REQ-AUTH-PWPOLICY-001
// Pure-zod schema unit tests (no live Supabase, no DOM).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  inviteSchema,
} from "../auth";

// ---------- emailSchema ----------

test("emailSchema accepts valid email", () => {
  const r = emailSchema.safeParse("user@algolink.com");
  assert.equal(r.success, true);
});

test("emailSchema rejects invalid email", () => {
  const r = emailSchema.safeParse("not-an-email");
  assert.equal(r.success, false);
});

// ---------- loginSchema ----------

test("loginSchema accepts a valid pair", () => {
  const r = loginSchema.safeParse({ email: "u@a.com", password: "x" });
  assert.equal(r.success, true);
});

test("loginSchema rejects empty password", () => {
  const r = loginSchema.safeParse({ email: "u@a.com", password: "" });
  assert.equal(r.success, false);
});

test("loginSchema does NOT enforce password policy (login allows any non-empty)", () => {
  // Login form must NOT block legacy weak passwords; policy applies on set/reset.
  const r = loginSchema.safeParse({ email: "u@a.com", password: "weak" });
  assert.equal(r.success, true);
});

// ---------- passwordSchema (12+ chars + 3 of 4 classes) ----------

test("passwordSchema accepts strong password (4 classes, 12+ chars)", () => {
  const r = passwordSchema.safeParse("Strong!Password2026");
  assert.equal(r.success, true);
});

test("passwordSchema accepts 3-class password (no special, but upper/lower/digit)", () => {
  const r = passwordSchema.safeParse("TwoClasses2026Long");
  assert.equal(r.success, true);
});

test("passwordSchema rejects too-short password", () => {
  const r = passwordSchema.safeParse("Short1!");
  assert.equal(r.success, false);
});

test("passwordSchema rejects 2-class password (lowercase + digits only)", () => {
  // 18 chars but only lowercase + digit = 2 classes → fail.
  const r = passwordSchema.safeParse("lowercaseonly12345");
  assert.equal(r.success, false);
});

test("passwordSchema rejects single-class password (lowercase only, length OK)", () => {
  const r = passwordSchema.safeParse("aaaaaaaaaaaaaaaaaa");
  assert.equal(r.success, false);
});

// ---------- setPasswordSchema ----------

test("setPasswordSchema accepts matching strong passwords", () => {
  const r = setPasswordSchema.safeParse({
    password: "Strong!Password2026",
    confirmPassword: "Strong!Password2026",
  });
  assert.equal(r.success, true);
});

test("setPasswordSchema rejects mismatched passwords", () => {
  const r = setPasswordSchema.safeParse({
    password: "Strong!Password2026",
    confirmPassword: "Strong!Password2027",
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const path = r.error.issues[0]?.path;
    assert.deepEqual(path, ["confirmPassword"]);
  }
});

// ---------- forgotPasswordSchema ----------

test("forgotPasswordSchema accepts a valid email", () => {
  const r = forgotPasswordSchema.safeParse({ email: "u@a.com" });
  assert.equal(r.success, true);
});

test("forgotPasswordSchema rejects empty payload", () => {
  const r = forgotPasswordSchema.safeParse({});
  assert.equal(r.success, false);
});

// ---------- inviteSchema ----------

test("inviteSchema accepts known invited_role values", () => {
  for (const role of ["instructor", "operator", "admin"] as const) {
    const r = inviteSchema.safeParse({ email: "u@a.com", invited_role: role });
    assert.equal(r.success, true, `role=${role}`);
  }
});

test("inviteSchema rejects unknown invited_role", () => {
  const r = inviteSchema.safeParse({
    email: "u@a.com",
    invited_role: "guest",
  });
  assert.equal(r.success, false);
});
