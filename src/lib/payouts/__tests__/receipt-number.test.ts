// SPEC-RECEIPT-001 §M2 — receipt-number 단위 테스트.
// REQ-RECEIPT-COLUMNS-002 (UNIQUE + format) + REQ-RECEIPT-OPERATOR-003 Step 3.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextReceiptNumber } from "../receipt-number";

const RECEIPT_REGEX = /^RCP-\d{4}-\d{4}$/;

// =============================================================================
// 단일 호출 — 형식 검증
// =============================================================================

test("nextReceiptNumber: RPC 호출 결과가 RCP-YYYY-NNNN 형식 매칭", async () => {
  const fakeSupabase = {
    rpc: async (_fn: string) => ({ data: "RCP-2026-0042", error: null }),
  };
  const result = await nextReceiptNumber(fakeSupabase);
  assert.match(result, RECEIPT_REGEX);
  assert.equal(result, "RCP-2026-0042");
});

test("nextReceiptNumber: 4-digit zero-pad 검증 (counter=1 → 0001)", async () => {
  const fakeSupabase = {
    rpc: async () => ({ data: "RCP-2026-0001", error: null }),
  };
  const result = await nextReceiptNumber(fakeSupabase);
  assert.match(result, RECEIPT_REGEX);
});

test("nextReceiptNumber: RPC 에러 발생 시 RECEIPT_GENERATION_FAILED throw", async () => {
  const fakeSupabase = {
    rpc: async () => ({ data: null, error: { message: "rpc failed" } }),
  };
  await assert.rejects(
    () => nextReceiptNumber(fakeSupabase),
    /영수증 생성/,
  );
});

test("nextReceiptNumber: data가 null/undefined일 때 RECEIPT_GENERATION_FAILED throw", async () => {
  const fakeSupabase = {
    rpc: async () => ({ data: null, error: null }),
  };
  await assert.rejects(
    () => nextReceiptNumber(fakeSupabase),
    /영수증 생성/,
  );
});

test("nextReceiptNumber: 형식이 RCP-YYYY-NNNN을 위반하면 RECEIPT_GENERATION_FAILED throw", async () => {
  const fakeSupabase = {
    rpc: async () => ({ data: "INVALID-FORMAT", error: null }),
  };
  await assert.rejects(
    () => nextReceiptNumber(fakeSupabase),
    /영수증 생성/,
  );
});

// =============================================================================
// 동시성 검증 — 병렬 5건 호출 시 모두 unique
// =============================================================================
//
// 각 호출이 별도의 RPC를 트리거하므로 mock에서 카운터를 증가시켜 검증.

test("nextReceiptNumber: 병렬 5건 호출 시 모두 unique (mock counter 검증)", async () => {
  let counter = 0;
  const fakeSupabase = {
    rpc: async () => {
      counter += 1;
      const padded = counter.toString().padStart(4, "0");
      return { data: `RCP-2026-${padded}`, error: null };
    },
  };

  const results = await Promise.all([
    nextReceiptNumber(fakeSupabase),
    nextReceiptNumber(fakeSupabase),
    nextReceiptNumber(fakeSupabase),
    nextReceiptNumber(fakeSupabase),
    nextReceiptNumber(fakeSupabase),
  ]);

  assert.equal(results.length, 5);
  const unique = new Set(results);
  assert.equal(unique.size, 5);
  for (const r of results) {
    assert.match(r, RECEIPT_REGEX);
  }
});
