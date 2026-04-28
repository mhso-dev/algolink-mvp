// SPEC-ADMIN-001 EARS C-8, C-9, C-10 — queries.ts SQL 의도 보존 회귀 테스트.
// queries.ts는 server-only이므로 import 시 인스턴스가 만들어지면 안 됨 → 파일을 텍스트로 읽어
// SQL 핵심 절(GENERATED 컬럼 SUM, paid 필터, deleted_at IS NULL)이 유지되는지 grep 검사한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUERIES = readFileSync(resolve(HERE, "../queries.ts"), "utf8");

test("C-9: sumRevenue는 deleted_at IS NULL + business_amount_krw SUM", () => {
  assert.match(QUERIES, /SUM\(business_amount_krw\)/);
  assert.match(QUERIES, /deleted_at IS NULL/);
});

test("C-8: sumCost는 status = 'paid' 필터 + instructor_fee_krw SUM", () => {
  assert.match(QUERIES, /status = 'paid'/);
  assert.match(QUERIES, /SUM\(instructor_fee_krw\)/);
});

test("C-10: sumMargin은 GENERATED margin_krw SUM (직접 산술 없음)", () => {
  assert.match(QUERIES, /SUM\(margin_krw\)/);
  // business_amount_krw - instructor_fee_krw 형태의 직접 산술이 nowhere
  assert.equal(
    /business_amount_krw\s*-\s*instructor_fee_krw/.test(QUERIES),
    false,
    "마진은 GENERATED 컬럼 SUM만 사용해야 한다 (산술 우회 금지)",
  );
});

test("C-6: getTopInstructors는 profit_krw GENERATED 컬럼 SUM", () => {
  assert.match(QUERIES, /SUM\(s\.profit_krw\)/);
});

test("C-4: getMonthlyTrend는 generate_series로 빈 월을 0으로 채움", () => {
  assert.match(QUERIES, /generate_series/);
  assert.match(QUERIES, /LEFT JOIN/);
});
