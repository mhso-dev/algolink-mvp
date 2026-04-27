// SPEC-DASHBOARD-001 §M2 — 포맷 헬퍼 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDDay,
  formatKrw,
  formatKstDate,
  formatKstDateRange,
  formatKstTime,
} from "../format";

test("formatKrw: 천 단위 + 통화 기호", () => {
  assert.equal(formatKrw(12_400_000), "₩12,400,000");
  assert.equal(formatKrw(0), "₩0");
});

test("formatKstDate: UTC 입력을 KST 일자로 변환 (+9시간)", () => {
  // 2026-04-27T00:00:00Z == KST 2026-04-27 09:00 → 일자 04-27 (월)
  assert.equal(formatKstDate("2026-04-27T00:00:00Z"), "2026-04-27 (월)");
  // 2026-04-26T16:00:00Z == KST 2026-04-27 01:00 → 04-27
  assert.equal(formatKstDate("2026-04-26T16:00:00Z"), "2026-04-27 (월)");
  // 2026-04-26T14:00:00Z == KST 2026-04-26 23:00 → 04-26 (일)
  assert.equal(formatKstDate("2026-04-26T14:00:00Z"), "2026-04-26 (일)");
});

test("formatKstTime: 오전/오후 표시", () => {
  // 2026-05-10T01:00:00Z → KST 10:00
  assert.equal(formatKstTime("2026-05-10T01:00:00Z"), "오전 10:00");
  // 2026-05-10T05:30:00Z → KST 14:30
  assert.equal(formatKstTime("2026-05-10T05:30:00Z"), "오후 02:30");
  // 2026-05-10T03:00:00Z → KST 12:00 (정오)
  assert.equal(formatKstTime("2026-05-10T03:00:00Z"), "오후 12:00");
});

test("formatKstDateRange: 동일 일자는 단일 표기", () => {
  const v = formatKstDateRange("2026-05-10T00:00:00Z", "2026-05-10T08:00:00Z");
  assert.equal(v, "2026-05-10 (일)");
});

test("formatKstDateRange: 다른 일자는 ~ 구분", () => {
  const v = formatKstDateRange("2026-05-10T00:00:00Z", "2026-05-12T08:00:00Z");
  assert.equal(v, "2026-05-10 (일) ~ 05-12");
});

test("formatKstDateRange: start만 있으면 단일 일자", () => {
  assert.equal(formatKstDateRange("2026-05-10T00:00:00Z", null), "2026-05-10 (일)");
});

test("formatKstDateRange: start/end 모두 없으면 안내문", () => {
  assert.equal(formatKstDateRange(null, null), "일정 미정");
});

test("formatDDay: 같은 날 = D-Day", () => {
  const ref = new Date("2026-05-10T03:00:00Z"); // KST 12:00
  assert.equal(formatDDay("2026-05-10T05:00:00Z", ref), "D-Day");
});

test("formatDDay: 미래 = D-N", () => {
  const ref = new Date("2026-05-10T03:00:00Z"); // KST 12:00 5/10
  assert.equal(formatDDay("2026-05-13T03:00:00Z", ref), "D-3");
});

test("formatDDay: 과거 = D+N", () => {
  const ref = new Date("2026-05-10T03:00:00Z");
  assert.equal(formatDDay("2026-05-08T03:00:00Z", ref), "D+2");
});
