// SPEC-RECEIPT-001 §M2 — client_direct 흐름 zod 사전 검증.
// REQ-RECEIPT-INSTRUCTOR-003 (강사 송금 등록) + REQ-RECEIPT-OPERATOR-003 Step 2 (운영자 수취 확인).
// @MX:NOTE: 두 schema는 expected amount를 closure로 받아 cross-field 비교.
// @MX:REASON: 정산 행 instructor_remittance_amount_krw는 schema 내부에서 알 수 없으므로 builder 패턴.

import { z } from "zod";
import { PAYOUT_ERRORS } from "./errors";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 강사 송금 등록 schema 빌더.
 * @param expectedAmountKrw - settlements.instructor_remittance_amount_krw
 */
export function buildInstructorRemittanceSchema(expectedAmountKrw: number) {
  return z
    .object({
      settlementId: z.string().regex(UUID_REGEX),
      remittanceDate: z.string().regex(ISO_DATE_REGEX),
      remittanceAmountKrw: z.coerce.number().int().min(0),
    })
    .superRefine((data, ctx) => {
      if (data.remittanceAmountKrw !== expectedAmountKrw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH,
          path: ["remittanceAmountKrw"],
        });
      }
    });
}

export type InstructorRemittanceInput = z.infer<
  ReturnType<typeof buildInstructorRemittanceSchema>
>;

/**
 * 운영자 수취 확인 schema 빌더.
 * @param expectedAmountKrw - settlements.instructor_remittance_amount_krw
 */
export function buildOperatorConfirmationSchema(expectedAmountKrw: number) {
  return z
    .object({
      settlementId: z.string().regex(UUID_REGEX),
      receivedDate: z.string().regex(ISO_DATE_REGEX),
      receivedAmountKrw: z.coerce.number().int().min(0),
      memo: z.string().max(2000).optional().nullable(),
    })
    .superRefine((data, ctx) => {
      if (data.receivedAmountKrw !== expectedAmountKrw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: PAYOUT_ERRORS.REMITTANCE_AMOUNT_MISMATCH,
          path: ["receivedAmountKrw"],
        });
      }
    });
}

export type OperatorConfirmationInput = z.infer<
  ReturnType<typeof buildOperatorConfirmationSchema>
>;
