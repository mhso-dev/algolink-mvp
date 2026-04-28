// SPEC-ME-001 §2.7 — 거래은행/계좌/예금주 bundle 직렬화 단위 테스트.
// payout-queries 는 server-only 모듈이므로 본 테스트는 pure 함수만 import 한다.
import { test } from "node:test";
import assert from "node:assert/strict";

// pure helper 만 별도 import (server-only 모듈은 jest mock 환경 없이 import 시 throw).
// 따라서 함수 본체를 본 테스트에서 동일 로직으로 재구현하지 않고, 직접 분리 import 한다.
import { packBankBundle, unpackBankBundle } from "../payout-bank-bundle";

test("packBankBundle: trim + JSON 직렬화", () => {
  const out = packBankBundle("  국민은행 ", "1002-1234-5678", " 홍길동 ");
  const parsed = JSON.parse(out) as { b: string; a: string; h: string };
  assert.equal(parsed.b, "국민은행");
  assert.equal(parsed.a, "1002-1234-5678");
  assert.equal(parsed.h, "홍길동");
});

test("unpackBankBundle: 정상 JSON → 3-필드 분리", () => {
  const r = unpackBankBundle('{"b":"신한은행","a":"110-123-456789","h":"김강사"}');
  assert.equal(r.b, "신한은행");
  assert.equal(r.a, "110-123-456789");
  assert.equal(r.h, "김강사");
});

test("unpackBankBundle: null/빈 입력 → 빈 bundle", () => {
  assert.deepEqual(unpackBankBundle(null), { b: "", a: "", h: "" });
  assert.deepEqual(unpackBankBundle(""), { b: "", a: "", h: "" });
});

test("unpackBankBundle: 깨진 JSON → 계좌번호로 fallback (legacy 호환)", () => {
  const r = unpackBankBundle("1002-1234-5678");
  assert.equal(r.b, "");
  assert.equal(r.a, "1002-1234-5678");
  assert.equal(r.h, "");
});

test("unpackBankBundle: JSON 이지만 형 불일치 → 빈 문자열 채움", () => {
  const r = unpackBankBundle('{"b":123,"a":null,"h":true}');
  assert.equal(r.b, "");
  assert.equal(r.a, "");
  assert.equal(r.h, "");
});
