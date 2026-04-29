// SPEC-PAYOUT-002 §M3 REQ-PAYOUT002-SESSIONS-003/-008 — zod 스키마 (defense-in-depth).
//
// zod 거부 → DB CHECK 거부 두 layer로 hours 입력을 가드한다.
// hours 제약: > 0 AND <= 24 AND 0.5 단위 (numeric(4,1)).

import { z } from "zod";
import { LECTURE_SESSION_STATUSES } from "./types";
import { SESSION_ERRORS } from "./errors";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * hours 검증 — REQ-PAYOUT002-SESSIONS-003 / -008.
 *
 * - 0 < hours <= 24
 * - 0.5 단위 (1.3, 1.25 등 거부)
 *
 * `superRefine`으로 우선순위 명확히: positive → max → step.
 * 입력 (1.3) → step error, (25) → max error, (0) → positive error.
 */
export const hoursSchema = z.coerce
  .number({ message: SESSION_ERRORS.HOURS_NOT_POSITIVE })
  .superRefine((value, ctx) => {
    if (!Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: SESSION_ERRORS.HOURS_NOT_POSITIVE,
      });
      return;
    }
    if (value > 24) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: SESSION_ERRORS.HOURS_OVER_24,
      });
      return;
    }
    // 0.5 단위 검증: hours × 2가 정수여야 함
    // floating-point safety: × 2 후 정수 비교 — (1.3 × 2 = 2.6, 정수 아님)
    if (!Number.isInteger(value * 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: SESSION_ERRORS.HOURS_NOT_HALF_STEP,
      });
    }
  });

/** lecture_sessions 폼 입력 단일 행 스키마. */
export const sessionInputSchema = z.object({
  id: z.string().regex(UUID_REGEX).optional(),
  project_id: z.string().regex(UUID_REGEX),
  instructor_id: z.string().regex(UUID_REGEX).nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다."),
  hours: hoursSchema,
  status: z.enum(LECTURE_SESSION_STATUSES).optional(),
  original_session_id: z.string().regex(UUID_REGEX).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type SessionInputValidated = z.infer<typeof sessionInputSchema>;

/**
 * `instructor_share_pct` 검증 — REQ-PAYOUT002-PROJECT-FIELDS-005.
 *
 * 0 <= pct <= 100 (numeric(5,2), 최대 2 decimals).
 */
export const sharePctSchema = z.coerce
  .number({ message: SESSION_ERRORS.SHARE_PCT_OUT_OF_RANGE })
  .min(0, { message: SESSION_ERRORS.SHARE_PCT_OUT_OF_RANGE })
  .max(100, { message: SESSION_ERRORS.SHARE_PCT_OUT_OF_RANGE });

/** `hourly_rate_krw` 검증 — REQ-PAYOUT002-PROJECT-FIELDS-001. */
export const hourlyRateSchema = z.coerce
  .number({ message: "시간당 사업비는 숫자여야 합니다." })
  .int({ message: "시간당 사업비는 정수여야 합니다." })
  .min(0, { message: "시간당 사업비는 0 이상이어야 합니다." });

/** reschedule action 입력. */
export const rescheduleInputSchema = z.object({
  session_id: z.string().regex(UUID_REGEX),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional().nullable(),
});

export type RescheduleInput = z.infer<typeof rescheduleInputSchema>;

/** instructor withdrawal action 입력. */
export const withdrawInstructorInputSchema = z.object({
  project_id: z.string().regex(UUID_REGEX),
  reason: z.string().min(1, "사유를 입력해주세요.").max(2000),
});

export type WithdrawInstructorInput = z.infer<
  typeof withdrawInstructorInputSchema
>;
