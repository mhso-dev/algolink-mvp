// SPEC-PROPOSAL-001 §M2 — Zod 스키마 (제안서 / 디스패치 / 변환).
// 한국어 에러는 PROPOSAL_ERRORS 참조.
import { z } from "zod";
import { PROPOSAL_ERRORS } from "./errors";
import { INQUIRY_STATUSES } from "./types";

/** ISO date 문자열 (YYYY-MM-DD). 빈 문자열은 null로 변환. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 형식으로 입력해주세요." })
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v))
  .nullable();

const krwBigint = z
  .number()
  .int({ message: "정수만 입력 가능합니다." })
  .min(0, { message: "0 이상의 값을 입력해주세요." })
  .or(z.literal(""))
  .transform((v) => {
    if (v === "" || v === undefined || v === null) return null;
    return typeof v === "number" ? v : Number(v);
  })
  .nullable();

/** 제안서 등록/수정 입력 스키마 (REQ-PROPOSAL-ENTITY-001/006/007). */
export const proposalCreateSchema = z
  .object({
    title: z
      .string()
      .min(1, { message: PROPOSAL_ERRORS.TITLE_REQUIRED })
      .max(200, { message: PROPOSAL_ERRORS.TITLE_TOO_LONG }),
    clientId: z
      .string()
      .uuid({ message: PROPOSAL_ERRORS.CLIENT_REQUIRED }),
    proposedPeriodStart: isoDate.optional().nullable(),
    proposedPeriodEnd: isoDate.optional().nullable(),
    proposedBusinessAmountKrw: krwBigint.optional().nullable(),
    proposedHourlyRateKrw: krwBigint.optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    requiredSkillIds: z
      .array(z.string().uuid())
      .default([]),
  })
  .refine(
    (data) => {
      if (!data.proposedPeriodStart || !data.proposedPeriodEnd) return true;
      // ISO date 문자열 비교
      return data.proposedPeriodEnd >= data.proposedPeriodStart;
    },
    {
      message: PROPOSAL_ERRORS.END_BEFORE_START,
      path: ["proposedPeriodEnd"],
    },
  );

export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;

/** 제안서 수정 입력 — 모든 필드 optional + expected_updated_at (낙관적 동시성). */
export const proposalUpdateSchema = proposalCreateSchema.safeExtend({
  expectedUpdatedAt: z.string().datetime().optional(),
});

export type ProposalUpdateInput = z.infer<typeof proposalUpdateSchema>;

/** 디스패치 입력 (REQ-PROPOSAL-INQUIRY-003). */
export const inquiryDispatchSchema = z.object({
  proposalId: z.string().uuid(),
  instructorIds: z
    .array(z.string().uuid())
    .min(1, { message: PROPOSAL_ERRORS.INQUIRY_NO_INSTRUCTORS })
    .max(50, { message: "최대 50명까지 선택할 수 있습니다." }),
  proposedTimeSlotStart: z.string().datetime().nullable().optional(),
  proposedTimeSlotEnd: z.string().datetime().nullable().optional(),
  questionNote: z.string().max(2000).nullable().optional(),
});

export type InquiryDispatchInputZ = z.infer<typeof inquiryDispatchSchema>;

/** 변환 입력 (REQ-PROPOSAL-CONVERT-001). */
export const convertProposalSchema = z.object({
  proposalId: z.string().uuid(),
});

export type ConvertProposalInput = z.infer<typeof convertProposalSchema>;

/** Inquiry status enum schema (서버 응답 검증용). */
export const inquiryStatusSchema = z.enum(INQUIRY_STATUSES);
