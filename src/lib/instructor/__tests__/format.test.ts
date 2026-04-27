// SPEC-INSTRUCTOR-001 §2.6 — KRW + KST 포맷 단위 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAvgScore,
  formatKrw,
  formatKstDate,
  formatKstDateTime,
} from "../format";

test("formatKrw: 12_000_000 → '12,000,000원'", () => {
  assert.equal(formatKrw(12_000_000), "12,000,000원");
});

test("formatKrw: 0 → '0원'", () => {
  assert.equal(formatKrw(0), "0원");
});

test("formatKrw: null/undefined → '0원'", () => {
  assert.equal(formatKrw(null), "0원");
  assert.equal(formatKrw(undefined), "0원");
});

test("formatKstDate: UTC 자정 직전 → 다음날 KST", () => {
  // 2026-03-14T18:00:00Z = 2026-03-15 03:00 KST
  const d = new Date("2026-03-14T18:00:00Z");
  assert.equal(formatKstDate(d), "2026-03-15");
});

test("formatKstDate: null → 빈 문자열", () => {
  assert.equal(formatKstDate(null), "");
});

test("formatKstDateTime: 2026-04-27 14:32 KST 패턴", () => {
  // 2026-04-27T05:32:00Z = 2026-04-27 14:32 KST
  const d = new Date("2026-04-27T05:32:00Z");
  assert.equal(formatKstDateTime(d), "2026-04-27 14:32");
});

test("formatAvgScore: null 또는 0 review → '-'", () => {
  assert.equal(formatAvgScore(null, 0), "-");
  assert.equal(formatAvgScore(4.5, 0), "-");
});

test("formatAvgScore: 4.567 + 5건 → '4.6 (5)'", () => {
  assert.equal(formatAvgScore(4.567, 5), "4.6 (5)");
});
