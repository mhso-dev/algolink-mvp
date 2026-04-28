// SPEC-PAYOUT-001 §M3 — sanitizePayload (GENERATED 컬럼 보호) 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePayload, SETTLEMENT_UPDATABLE_COLUMNS } from "../queries";

test("sanitizePayload: GENERATED 컬럼 profit_krw 자동 제거", () => {
  const out = sanitizePayload({
    status: "paid",
    profit_krw: 9_999_999,
    withholding_tax_amount_krw: 9_999_999,
    notes: "test",
  });
  assert.equal("profit_krw" in out, false);
  assert.equal("withholding_tax_amount_krw" in out, false);
  assert.equal(out.status, "paid");
  assert.equal(out.notes, "test");
});

test("sanitizePayload: 화이트리스트에 없는 키 제거 (id, created_at 등)", () => {
  const out = sanitizePayload({
    id: "uuid-x",
    created_at: "now",
    created_by: "user-x",
    status: "requested",
  });
  assert.equal("id" in out, false);
  assert.equal("created_at" in out, false);
  assert.equal("created_by" in out, false);
  assert.equal(out.status, "requested");
});

test("SETTLEMENT_UPDATABLE_COLUMNS: GENERATED 컬럼 미포함", () => {
  const cols = new Set<string>(SETTLEMENT_UPDATABLE_COLUMNS);
  assert.equal(cols.has("profit_krw"), false);
  assert.equal(cols.has("withholding_tax_amount_krw"), false);
});

test("SETTLEMENT_UPDATABLE_COLUMNS: 핵심 mutable 컬럼 포함", () => {
  const cols = new Set<string>(SETTLEMENT_UPDATABLE_COLUMNS);
  assert.equal(cols.has("status"), true);
  assert.equal(cols.has("payment_received_at"), true);
  assert.equal(cols.has("withholding_tax_rate"), true);
  assert.equal(cols.has("notes"), true);
});
