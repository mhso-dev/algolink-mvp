// SPEC-CONFIRM-001 §M3 — Server Action 입력 zod schema.
// REQ-CONFIRM-RESPONSES-004 — conditional_note 5자 이상 강제.

import { z } from "zod";

const responseStatusSchema = z.enum(["accepted", "declined", "conditional"]);

const conditionalNoteSchema = z
  .string()
  .min(5, "조건부 응답에는 5자 이상의 메모를 입력해주세요.")
  .max(2000); // 최대 2000자 (운영 안전).

/**
 * respondToAssignment 입력 schema.
 * status === 'conditional'이면 conditionalNote 필수 (refine).
 */
export const respondToAssignmentInputSchema = z
  .object({
    projectId: z.string().uuid(),
    status: responseStatusSchema,
    conditionalNote: conditionalNoteSchema.optional().or(z.literal("")).nullable(),
  })
  .refine(
    (v) =>
      v.status !== "conditional" ||
      (typeof v.conditionalNote === "string" &&
        v.conditionalNote.length >= 5),
    {
      message: "조건부 응답에는 5자 이상의 메모를 입력해주세요.",
      path: ["conditionalNote"],
    },
  );

export const respondToInquiryInputSchema = z
  .object({
    inquiryId: z.string().uuid(),
    status: responseStatusSchema,
    conditionalNote: conditionalNoteSchema.optional().or(z.literal("")).nullable(),
  })
  .refine(
    (v) =>
      v.status !== "conditional" ||
      (typeof v.conditionalNote === "string" &&
        v.conditionalNote.length >= 5),
    {
      message: "조건부 응답에는 5자 이상의 메모를 입력해주세요.",
      path: ["conditionalNote"],
    },
  );

export type RespondToAssignmentInput = z.infer<
  typeof respondToAssignmentInputSchema
>;
export type RespondToInquiryInput = z.infer<typeof respondToInquiryInputSchema>;
