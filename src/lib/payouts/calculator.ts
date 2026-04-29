// @MX:ANCHOR: SPEC-PAYOUT-002 §M2 REQ-PAYOUT002-CALC-001 ~ -005 — 정산 산식 순수 함수.
// @MX:REASON: 모든 settlement INSERT 경로의 source-of-truth. fan_in 매우 높음 (generate.ts + UI 미리보기 + 테스트).
// @MX:WARN: floor only, never round — monetary safety. Math.round는 share_pct 정수화에만 예외 사용.
// @MX:REASON: 부동소수점 round는 강사에게 1원 단위 과지급 또는 고객사에 과청구를 일으킬 수 있다.
//
// 정수 산술(integer arithmetic) 채택 사유 (HIGH-1):
//   - 부동소수점 식 floor(rate × pct / 100)은 일부 (rate, pct) 조합에서 1원 단위 drift 발생
//     (예: (1000, 32.3) → FP=322 vs 정수=323)
//   - share_pct는 numeric(5,2) (최대 2 decimals)이라는 DB 제약을 활용해 Math.round(pct × 100)으로 정수화
//   - 이후 곱셈/나눗셈은 정수 연산 — V8 정수 산술로 표현 가능한 모든 입력에 대해 deterministic 보장
//
// DB invariants enforced upstream:
//   - hourly_rate_krw: bigint, >= 0  (REQ-PAYOUT002-PROJECT-FIELDS-001)
//   - share_pct: numeric(5,2), 0..100, max 2 decimals  (REQ-PAYOUT002-PROJECT-FIELDS-001 / -005)
//   - hours: numeric(4,1), > 0 AND <= 24, multiple of 0.5  (REQ-PAYOUT002-SESSIONS-001 / -003 / -008)

import type { LectureSessionStatus } from "../sessions/types";

/**
 * 강사 시간당 정산액 계산 (정수 산술).
 *
 * 산식: `floor((hourlyRateKrw × Math.round(sharePct × 100)) / 10000)`
 *
 * - `Math.round(sharePct × 100)`은 share_pct(numeric(5,2))를 정수 "cents-of-percent"로 변환 (예: 66.67 → 6667)
 * - 이후 정수 산술만 사용 — IEEE-754 drift 차단
 * - 결과는 항상 정수 KRW (floor 적용)
 *
 * @param hourlyRateKrw - 시간당 사업비 (KRW, >= 0)
 * @param sharePct - 강사 분배율 (%, 0..100, 최대 2 decimals)
 * @returns 강사 시간당 정산액 (KRW, 정수)
 */
export function calculateInstructorFeePerHour(
  hourlyRateKrw: number,
  sharePct: number,
): number {
  // share_pct → 정수 "cents-of-percent" (예: 66.67 → 6667)
  const sharePctInt = Math.round(sharePct * 100);
  // 정수 산술: rate × sharePctInt / 10000 = rate × pct / 100 (정확)
  return Math.floor((hourlyRateKrw * sharePctInt) / 10000);
}

/**
 * `completed` 상태이며 `deleted_at IS NULL`인 세션의 시수 합계.
 *
 * - `planned`, `canceled`, `rescheduled`는 제외
 * - soft-deleted (`deleted_at !== null`)도 제외
 *
 * @param sessions - lecture_sessions 행 (status + hours + deleted_at 필드 필요)
 * @returns 청구 대상 시수 합계 (numeric)
 */
export function calculateTotalBilledHours(
  sessions: ReadonlyArray<{
    readonly status: LectureSessionStatus | string;
    readonly hours: number | string;
    readonly deleted_at: string | null;
  }>,
): number {
  return sessions
    .filter((s) => s.status === "completed" && s.deleted_at === null)
    .reduce((sum, s) => {
      // Drizzle/Postgres가 numeric을 string으로 직렬화할 수 있으므로 Number 변환
      const h = typeof s.hours === "string" ? Number(s.hours) : s.hours;
      return sum + (Number.isFinite(h) ? h : 0);
    }, 0);
}

/**
 * 사업비 총액 계산.
 *
 * 산식: `floor(hourlyRateKrw × totalHours)`
 *
 * floor 적용 사유: `totalHours`가 `.5`로 끝나고 `hourlyRateKrw`가 홀수이면 분모가 fractional이 되어 1원 단위
 * 과청구가 발생할 수 있다 — floor로 절단하여 monetary safety 보장.
 *
 * @param hourlyRateKrw - 시간당 사업비 (KRW)
 * @param totalHours - 청구 대상 시수 합계
 * @returns 사업비 총액 (KRW, 정수)
 */
export function calculateBusinessAmount(
  hourlyRateKrw: number,
  totalHours: number,
): number {
  return Math.floor(hourlyRateKrw * totalHours);
}

/**
 * 강사 정산액 총액 계산.
 *
 * 산식: `floor(feePerHour × totalHours)`
 *
 * floor 적용 사유: `feePerHour`가 홀수이고 `totalHours`가 `.5`로 끝나면 분모가 fractional이 되어 1원 단위 과지급이
 * 발생할 수 있다 — floor로 절단하여 monetary safety 보장.
 *
 * @param feePerHour - 강사 시간당 정산액 (calculateInstructorFeePerHour 결과)
 * @param totalHours - 청구 대상 시수 합계
 * @returns 강사 정산액 총액 (KRW, 정수)
 */
export function calculateInstructorFee(
  feePerHour: number,
  totalHours: number,
): number {
  return Math.floor(feePerHour * totalHours);
}
