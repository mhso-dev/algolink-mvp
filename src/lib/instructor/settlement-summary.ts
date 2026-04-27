// SPEC-ME-001 §2.6 REQ-ME-SET-004 — 정산 합계 계산.
// product.md §6 회계 정확성 — 단위 테스트 100% 필수.
// @MX:ANCHOR: 강사 대시보드 위젯 + /me/settlements summary band의 단일 진실 공급원.
// @MX:REASON: 금액 오차는 회계 사고. 모든 호출자가 동일 함수 사용해야 함. fan_in 기대 >= 3.
// @MX:WARN: 모든 합계는 BigInt로 처리. 누적 1조원대 가능.
// @MX:REASON: JS Number 정밀도(2^53)는 9천조까지지만 곱셈 중간값 안전 마진 위해 BigInt 일관 적용.

export type SettlementStatus = "pending" | "requested" | "paid" | "held";
export type SettlementFlow = "corporate" | "government";

export interface SettlementInput {
  status: SettlementStatus;
  settlementFlow: SettlementFlow;
  /** 강사료 (KRW 원 단위). 음수 거부. */
  instructorFeeKrw: number | bigint | string;
  /** 원천세율. corporate=0, government ∈ {3.30, 8.80}. */
  withholdingTaxRate: number | string;
}

export interface SettlementSummary {
  totalFeeKrw: bigint;
  totalWithholdingKrw: bigint;
  totalNetKrw: bigint;
  /** 미정산 (status ∈ {pending, requested}) 의 세후 합계. */
  unsettledNetKrw: bigint;
  count: number;
}

/**
 * 단일 row의 원천세 계산 (SPEC-DB-001 settlements generated column과 동일):
 *   floor(instructor_fee_krw * withholding_tax_rate / 100)
 */
export function computeWithholding(input: SettlementInput): bigint {
  const fee = toBigInt(input.instructorFeeKrw);
  if (fee < BigInt(0)) {
    throw new Error("instructorFeeKrw는 음수일 수 없습니다.");
  }
  // BigInt(0)는 음수 비교용. 함수 내부 상수.
  const rate = parseRate(input.withholdingTaxRate);
  if (rate < 0) {
    throw new Error("withholdingTaxRate는 음수일 수 없습니다.");
  }
  if (input.settlementFlow === "corporate" && rate !== 0) {
    throw new Error("corporate 흐름의 withholdingTaxRate는 0이어야 합니다.");
  }
  if (input.settlementFlow === "government" && rate !== 3.3 && rate !== 8.8) {
    throw new Error("government 흐름의 withholdingTaxRate는 3.30 또는 8.80이어야 합니다.");
  }
  // rate를 정수 basis(× 100)로 환산 후 10000으로 나눔. floor by integer division.
  const rateScaled = BigInt(Math.round(rate * 100)); // 3.30 → 330
  return (fee * rateScaled) / BigInt(10000);
}

/** 단일 row의 세후 지급액. */
export function computeNet(input: SettlementInput): bigint {
  const fee = toBigInt(input.instructorFeeKrw);
  return fee - computeWithholding(input);
}

/** settlements 배열의 합계 계산. 빈 배열 → 모든 합계 BigInt(0). */
export function summarizeSettlements(rows: readonly SettlementInput[]): SettlementSummary {
  let totalFee = BigInt(0);
  let totalWithholding = BigInt(0);
  let unsettledNet = BigInt(0);

  for (const row of rows) {
    const fee = toBigInt(row.instructorFeeKrw);
    const wh = computeWithholding(row);
    totalFee += fee;
    totalWithholding += wh;
    if (row.status === "pending" || row.status === "requested") {
      unsettledNet += fee - wh;
    }
  }

  return {
    totalFeeKrw: totalFee,
    totalWithholdingKrw: totalWithholding,
    totalNetKrw: totalFee - totalWithholding,
    unsettledNetKrw: unsettledNet,
    count: rows.length,
  };
}

// ---------- 내부 helper ----------

function toBigInt(value: number | bigint | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("금액은 유한한 숫자여야 합니다.");
    }
    if (!Number.isInteger(value)) {
      throw new Error("금액은 정수(원 단위)여야 합니다.");
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`금액 문자열 형식 오류: ${value}`);
  }
  return BigInt(value);
}

function parseRate(value: number | string): number {
  if (typeof value === "number") return value;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    throw new Error(`원천세율 형식 오류: ${value}`);
  }
  return n;
}
