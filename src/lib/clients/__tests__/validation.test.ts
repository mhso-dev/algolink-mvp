// SPEC-CLIENT-001 §2.1 — Zod 검증 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createClientSchema,
  validateFileMeta,
  FILE_MAX_SIZE_BYTES,
} from "../validation";
import { CLIENT_ERRORS } from "../errors";

test("createClientSchema: 회사명 비어있으면 에러", () => {
  const r = createClientSchema.safeParse({
    companyName: "",
    contacts: [{ name: "홍길동" }],
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const messages = r.error.issues.map((i) => i.message);
    assert.ok(messages.includes(CLIENT_ERRORS.COMPANY_NAME_REQUIRED));
  }
});

test("createClientSchema: 담당자 0명이면 에러", () => {
  const r = createClientSchema.safeParse({
    companyName: "알고링크",
    contacts: [],
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const messages = r.error.issues.map((i) => i.message);
    assert.ok(messages.includes(CLIENT_ERRORS.CONTACTS_MIN_ONE));
  }
});

test("createClientSchema: 담당자 이메일 형식 오류", () => {
  const r = createClientSchema.safeParse({
    companyName: "알고링크",
    contacts: [{ name: "홍길동", email: "invalid-email" }],
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const messages = r.error.issues.map((i) => i.message);
    assert.ok(messages.includes(CLIENT_ERRORS.CONTACT_EMAIL_INVALID));
  }
});

test("createClientSchema: 메모 500자 초과 시 에러", () => {
  const r = createClientSchema.safeParse({
    companyName: "알고링크",
    handoverMemo: "가".repeat(501),
    contacts: [{ name: "홍길동" }],
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const messages = r.error.issues.map((i) => i.message);
    assert.ok(messages.includes(CLIENT_ERRORS.HANDOVER_MEMO_TOO_LONG));
  }
});

test("createClientSchema: 정상 입력 통과 + 빈 이메일은 null로 정규화", () => {
  const r = createClientSchema.safeParse({
    companyName: "알고링크 주식회사",
    address: "서울시 강남구",
    handoverMemo: "메모",
    contacts: [{ name: "홍길동", email: "", phone: "010-1234-5678" }],
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.companyName, "알고링크 주식회사");
    assert.equal(r.data.contacts[0].email, null);
    assert.equal(r.data.contacts[0].phone, "010-1234-5678");
  }
});

test("validateFileMeta: 6MB 거부", () => {
  const result = validateFileMeta({
    type: "application/pdf",
    size: 6 * 1024 * 1024,
  });
  assert.equal(result, CLIENT_ERRORS.FILE_TOO_LARGE);
});

test("validateFileMeta: 5MB 정확히는 통과", () => {
  const result = validateFileMeta({
    type: "application/pdf",
    size: FILE_MAX_SIZE_BYTES,
  });
  assert.equal(result, null);
});

test("validateFileMeta: text/csv 거부", () => {
  const result = validateFileMeta({ type: "text/csv", size: 1024 });
  assert.equal(result, CLIENT_ERRORS.FILE_MIME_INVALID);
});

test("validateFileMeta: PDF 2MB 통과", () => {
  const result = validateFileMeta({
    type: "application/pdf",
    size: 2 * 1024 * 1024,
  });
  assert.equal(result, null);
});

test("validateFileMeta: image/png 통과", () => {
  const result = validateFileMeta({ type: "image/png", size: 1024 });
  assert.equal(result, null);
});
