// SPEC-PAYOUT-002 §M2 REQ-PAYOUT002-CALC-001 ~ -005
// 정수 산술(integer arithmetic) 채택 — IEEE-754 부동소수점 drift 차단.
//
// 산식:
//   feePerHour    = floor((rate × Math.round(pct × 100)) / 10000)
//   totalHours    = SUM(hours WHERE status='completed' AND deleted_at=null)
//   businessAmount= floor(rate × totalHours)
//   instructorFee = floor(feePerHour × totalHours)
//
// floor 적용: monetary safety — 강사에게 1원 단위 과지급 차단, 고객사에 1원 단위 과청구 차단.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateInstructorFeePerHour,
  calculateTotalBilledHours,
  calculateBusinessAmount,
  calculateInstructorFee,
} from "../calculator";

// =============================================================================
// REQ-PAYOUT002-CALC-005 (a) — 표준 정상 케이스
// =============================================================================
test("calculateInstructorFeePerHour: (100000, 70) → 70000", () => {
  // floor((100000 × 7000) / 10000) = floor(70000) = 70000
  assert.equal(calculateInstructorFeePerHour(100_000, 70), 70_000);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (b) — 정수 산술이 부동소수점과 동일 결과
// =============================================================================
test("calculateInstructorFeePerHour: (80000, 66.67) → 53336", () => {
  // floor((80000 × 6667) / 10000) = floor(53336) = 53336
  assert.equal(calculateInstructorFeePerHour(80_000, 66.67), 53_336);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (d) — share_pct=0 edge
// =============================================================================
test("calculateInstructorFeePerHour: (100000, 0) → 0", () => {
  assert.equal(calculateInstructorFeePerHour(100_000, 0), 0);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (e) — hourly_rate=0 edge
// =============================================================================
test("calculateInstructorFeePerHour: (0, 70) → 0", () => {
  assert.equal(calculateInstructorFeePerHour(0, 70), 0);
});

// =============================================================================
// share_pct=100 edge (cascade 검증)
// =============================================================================
test("calculateInstructorFeePerHour: (100000, 100) → 100000", () => {
  assert.equal(calculateInstructorFeePerHour(100_000, 100), 100_000);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (f) — IEEE-754 drift 회귀 케이스 [GATEKEEPER]
// =============================================================================
test("calculateInstructorFeePerHour: (1000, 32.3) → 323 (정수 산술 게이트키퍼)", () => {
  // 부동소수점 식 floor(1000 × 32.3 / 100) = 322 (drift)
  // 정수 산술 식  floor((1000 × 3230) / 10000) = 323 (정확)
  // 본 SPEC은 정수 산술을 채택했으므로 323이어야 한다.
  // 이 테스트가 322를 산출하면 floating-point 산식이 잠입한 것이므로 즉시 FAIL.
  assert.equal(calculateInstructorFeePerHour(1000, 32.3), 323);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (h) — Math.round(33.33 × 100) 정수 변환 정확성
// =============================================================================
test("calculateInstructorFeePerHour: (*, 33.33) integer 변환 정확성", () => {
  // Math.round(33.33 × 100) === 3333 (numeric(5,2) 입력의 정확한 정수화)
  assert.equal(Math.round(33.33 * 100), 3333);
  // (60000, 33.33) → floor((60000 × 3333) / 10000) = floor(19998) = 19998
  assert.equal(calculateInstructorFeePerHour(60_000, 33.33), 19_998);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (c) — totalBilledHours: completed만 합산
// =============================================================================
test("calculateTotalBilledHours: completed만 합산 (planned/canceled/rescheduled 제외)", () => {
  const sessions = [
    { status: "completed", hours: 2.0, deleted_at: null },
    { status: "completed", hours: 1.5, deleted_at: null },
    { status: "planned", hours: 1.0, deleted_at: null },
    { status: "canceled", hours: 1.0, deleted_at: null },
    { status: "rescheduled", hours: 2.0, deleted_at: null },
  ] as const;
  assert.equal(calculateTotalBilledHours(sessions), 3.5);
});

test("calculateTotalBilledHours: deleted_at !== null인 completed는 제외", () => {
  const sessions = [
    { status: "completed", hours: 2.0, deleted_at: null },
    { status: "completed", hours: 1.0, deleted_at: "2026-04-29T00:00:00Z" }, // soft deleted
  ] as const;
  assert.equal(calculateTotalBilledHours(sessions), 2.0);
});

test("calculateTotalBilledHours: 빈 배열 → 0", () => {
  assert.equal(calculateTotalBilledHours([]), 0);
});

test("calculateTotalBilledHours: hours를 string으로 받아도 합산 (numeric(4,1) → string)", () => {
  // Drizzle/Postgres가 numeric을 string으로 직렬화할 수 있음
  const sessions = [
    { status: "completed", hours: "2.0" as unknown as number, deleted_at: null },
    { status: "completed", hours: "1.5" as unknown as number, deleted_at: null },
  ] as const;
  assert.equal(calculateTotalBilledHours(sessions), 3.5);
});

// =============================================================================
// calculateBusinessAmount — floor(rate × totalHours)
// =============================================================================
test("calculateBusinessAmount: (100000, 8.0) → 800000", () => {
  assert.equal(calculateBusinessAmount(100_000, 8.0), 800_000);
});

test("calculateBusinessAmount: floor 적용 — (100000, 4.5) → 450000", () => {
  // floor(100000 × 4.5) = floor(450000) = 450000 (정확)
  assert.equal(calculateBusinessAmount(100_000, 4.5), 450_000);
});

test("calculateBusinessAmount: 0 입력 → 0", () => {
  assert.equal(calculateBusinessAmount(0, 8.0), 0);
  assert.equal(calculateBusinessAmount(100_000, 0), 0);
});

// =============================================================================
// calculateInstructorFee — floor(feePerHour × totalHours)
// =============================================================================
test("calculateInstructorFee: (70000, 8.0) → 560000", () => {
  assert.equal(calculateInstructorFee(70_000, 8.0), 560_000);
});

// =============================================================================
// REQ-PAYOUT002-CALC-005 (g) — cascade: (80000, 66.67, 4.5)
// =============================================================================
test("calculateInstructorFee: (53336, 4.5) → 240012 (cascade)", () => {
  // feePerHour=53336 (calculateInstructorFeePerHour(80000, 66.67))
  // floor(53336 × 4.5) = floor(240012.0) = 240012 (53336이 짝수 → .5 분모 소거)
  assert.equal(calculateInstructorFee(53_336, 4.5), 240_012);
});

test("calculateInstructorFee: (16665, 4.5) → 74992 (홀수 × .5 floor)", () => {
  // feePerHour=16665 (calculateInstructorFeePerHour(50000, 33.33))
  // floor(16665 × 4.5) = floor(74992.5) = 74992 (홀수 × .5는 floor로 절단)
  assert.equal(calculateInstructorFee(16_665, 4.5), 74_992);
});

// =============================================================================
// 통합 cascade 검증 — (80000, 66.67, 4.5) end-to-end
// =============================================================================
test("cascade: (80000, 66.67, 4.5) → fee_per_hour=53336, business=360000, fee=240012", () => {
  const feePerHour = calculateInstructorFeePerHour(80_000, 66.67);
  assert.equal(feePerHour, 53_336);
  assert.equal(calculateBusinessAmount(80_000, 4.5), 360_000);
  assert.equal(calculateInstructorFee(feePerHour, 4.5), 240_012);
});

// =============================================================================
// 모든 결과는 정수 (Number.isInteger)
// =============================================================================
test("모든 calculator 결과는 정수 (Number.isInteger)", () => {
  assert.ok(Number.isInteger(calculateInstructorFeePerHour(100_000, 70)));
  assert.ok(Number.isInteger(calculateInstructorFeePerHour(1000, 32.3)));
  assert.ok(Number.isInteger(calculateInstructorFeePerHour(60_000, 33.33)));
  assert.ok(Number.isInteger(calculateBusinessAmount(100_000, 4.5)));
  assert.ok(Number.isInteger(calculateInstructorFee(53_336, 4.5)));
  assert.ok(Number.isInteger(calculateInstructorFee(16_665, 4.5)));
});
