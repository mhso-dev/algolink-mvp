// SPEC-PAYOUT-001 §M2 — zod 스키마 (cross-field 세율 검증).
// @MX:NOTE: GENERATED 컬럼(profit_krw / withholding_tax_amount_krw)은 본 스키마에 등장하지 않는다.
//           form / Server Action 페이로드 빌더는 이 스키마만 통과하므로 GENERATED 보호가 자동 강제된다.

import { z } from "zod";
import { PAYOUT_ERRORS } from "./errors";
import {
  GOVERNMENT_TAX_RATES,
  CORPORATE_TAX_RATE,
} from "./constants";
import { SETTLEMENT_FLOWS, SETTLEMENT_STATUSES } from "./types";

/** 정산 행 수정 폼 스키마 — corporate/government 화이트리스트 사전 차단. */
export const settlementUpdateSchema = z
  .object({
    settlement_flow: z.enum(SETTLEMENT_FLOWS),
    withholding_tax_rate: z.coerce.number().min(0).max(100),
    business_amount_krw: z.coerce.number().int().min(0),
    instructor_fee_krw: z.coerce.number().int().min(0),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.settlement_flow === "corporate" &&
      Math.abs(data.withholding_tax_rate - CORPORATE_TAX_RATE) >= 1e-9
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: PAYOUT_ERRORS.TAX_RATE_CORPORATE_NONZERO,
        path: ["withholding_tax_rate"],
      });
    }
    if (data.settlement_flow === "government") {
      const matches = GOVERNMENT_TAX_RATES.some(
        (allowed) => Math.abs(data.withholding_tax_rate - allowed) < 1e-9,
      );
      if (!matches) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: PAYOUT_ERRORS.TAX_RATE_GOVERNMENT_INVALID,
          path: ["withholding_tax_rate"],
        });
      }
    }
  });

export type SettlementUpdateInput = z.infer<typeof settlementUpdateSchema>;

/** 상태 전환 입력 스키마. */
export const statusTransitionSchema = z.object({
  settlementId: z.string().uuid(),
  to: z.enum(SETTLEMENT_STATUSES),
});

export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
