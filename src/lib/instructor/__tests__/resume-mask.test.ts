// SPEC-ME-001 §2.2 REQ-ME-RESUME-007 — 마스킹 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maskResidentNumber,
  maskPhone,
  maskEmail,
  maskBankAccount,
  maskBusinessNumber,
  maskAddress,
} from "../resume-mask";

// ---------- 주민등록번호 ----------

test("maskResidentNumber: dash 포함 13자리 → 앞6 + 뒤마스킹", () => {
  assert.equal(maskResidentNumber("900101-1234567"), "900101-*******");
});

test("maskResidentNumber: dash 없는 13자리 → 동일 결과", () => {
  assert.equal(maskResidentNumber("9001011234567"), "900101-*******");
});

test("maskResidentNumber: 빈 값 / null → 빈 문자열", () => {
  assert.equal(maskResidentNumber(""), "");
  assert.equal(maskResidentNumber(null), "");
  assert.equal(maskResidentNumber(undefined), "");
});

test("maskResidentNumber: 잘못된 길이 → 빈 문자열 (no throw)", () => {
  assert.equal(maskResidentNumber("12345"), "");
  assert.equal(maskResidentNumber("12345678901234"), "");
});

// ---------- 휴대폰 ----------

test("maskPhone: 11자리 dash 포함 → 가운데 4자리 마스킹", () => {
  assert.equal(maskPhone("010-1234-5678"), "010-****-5678");
});

test("maskPhone: 11자리 dash 없음 → 동일 결과", () => {
  assert.equal(maskPhone("01012345678"), "010-****-5678");
});

test("maskPhone: 10자리 (구 번호) → 가운데 3자리 마스킹", () => {
  assert.equal(maskPhone("010-123-4567"), "010-***-4567");
});

test("maskPhone: 빈 값 → 빈 문자열", () => {
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
});

test("maskPhone: 알 수 없는 길이 → 빈 문자열", () => {
  assert.equal(maskPhone("123"), "");
});

// ---------- 이메일 ----------

test("maskEmail: 일반 이메일 → 앞 2자 + *** + @domain", () => {
  assert.equal(maskEmail("instructor.a@algolink.test"), "in***@algolink.test");
});

test("maskEmail: local 1자 (graceful) → 1자만 노출", () => {
  assert.equal(maskEmail("a@x.com"), "a***@x.com");
});

test("maskEmail: local 2자 → 2자 모두 노출", () => {
  assert.equal(maskEmail("ab@x.com"), "ab***@x.com");
});

test("maskEmail: 빈 값 / @ 없음 / 시작 @ → 빈 문자열", () => {
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail("noatsign"), "");
  assert.equal(maskEmail("@nolocal.com"), "");
});

// ---------- 계좌번호 ----------

test("maskBankAccount: 12자리 → 앞4 + 마스킹 + 뒤4", () => {
  assert.equal(maskBankAccount("100212345678"), "1002-****-5678");
});

test("maskBankAccount: dash/공백 포함 → 동일 결과", () => {
  assert.equal(maskBankAccount("1002-1234-5678"), "1002-****-5678");
  assert.equal(maskBankAccount("1002 1234 5678"), "1002-****-5678");
});

test("maskBankAccount: 14자리 (가운데 6자리) → 가운데 6 마스킹", () => {
  assert.equal(maskBankAccount("10021234567890"), "1002-******-7890");
});

test("maskBankAccount: 빈 값 / 8자리 미만 → 빈 문자열", () => {
  assert.equal(maskBankAccount(""), "");
  assert.equal(maskBankAccount("1234567"), "");
  assert.equal(maskBankAccount(null), "");
});

// ---------- 사업자등록번호 ----------

test("maskBusinessNumber: 10자리 → 앞3 + 마스킹", () => {
  assert.equal(maskBusinessNumber("123-45-67890"), "123-**-*****");
  assert.equal(maskBusinessNumber("1234567890"), "123-**-*****");
});

test("maskBusinessNumber: 잘못된 길이 → 빈 문자열", () => {
  assert.equal(maskBusinessNumber("12345"), "");
  assert.equal(maskBusinessNumber(""), "");
});

// ---------- 주소 ----------

test("maskAddress: 시/구/상세 → 시/구만 노출", () => {
  assert.equal(maskAddress("서울특별시 강남구 테헤란로 123"), "서울특별시 강남구 ***");
});

test("maskAddress: 2-token (시 + 구) → 그대로 + ***", () => {
  assert.equal(maskAddress("서울특별시 강남구"), "서울특별시 강남구 ***");
});

test("maskAddress: 1-token → 그 값 + ***", () => {
  assert.equal(maskAddress("서울"), "서울 ***");
});

test("maskAddress: 빈 값 → 빈 문자열", () => {
  assert.equal(maskAddress(""), "");
  assert.equal(maskAddress("   "), "");
  assert.equal(maskAddress(null), "");
});
