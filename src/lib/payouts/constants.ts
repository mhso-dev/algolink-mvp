// SPEC-PAYOUT-001 §M2 — 도메인 상수.
// CHECK 제약 (settlements_withholding_rate_check) 과 정확히 일치해야 함.

/** 정부 정산에서 허용되는 원천세율 (DB CHECK 제약과 동일). */
export const GOVERNMENT_TAX_RATES = [3.3, 8.8] as const;

/** 기업 정산은 원천세율이 정확히 0이어야 한다. */
export const CORPORATE_TAX_RATE = 0 as const;

/** 정산 리스트 페이지당 row 수. */
export const SETTLEMENT_PAGE_SIZE = 20 as const;

/** 메일 스텁 콘솔 로그 prefix. SPEC-NOTIFY-001 어댑터 hook 식별자. */
export const NOTIF_LOG_PREFIX = "[notif]" as const;
