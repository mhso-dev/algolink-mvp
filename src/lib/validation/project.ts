// SPEC-PROJECT-001 §2.2 REQ-PROJECT-CREATE-002 — 프로젝트 등록/수정 zod 스키마.
// 한국어 에러 메시지는 errors.ts 단일 출처로 통합 (REQ-PROJECT-ERROR).

import { z } from "zod";

const isoDateLike = z.preprocess(
  (v) => (typeof v === "string" && v.length > 0 ? new Date(v) : undefined),
  z.date({ error: "유효한 날짜를 입력해야 합니다." }),
);

const optionalNonNegativeInt = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "string") return Number.parseInt(v, 10);
    return v;
  },
  z
    .number({ error: "숫자를 입력해야 합니다." })
    .int()
    .min(0, { message: "0 이상의 정수여야 합니다." }),
);

export const createProjectSchema = z
  .object({
    title: z
      .string()
      .min(1, { message: "제목은 필수입니다." })
      .max(200, { message: "제목은 200자 이하여야 합니다." }),
    clientId: z.string().uuid({ message: "고객사를 선택해야 합니다." }),
    projectType: z.enum(["education", "material_development"]).default("education"),
    startAt: isoDateLike.optional(),
    endAt: isoDateLike.optional(),
    requiredSkillIds: z.array(z.string().uuid()).default([]),
    businessAmountKrw: optionalNonNegativeInt,
    instructorFeeKrw: optionalNonNegativeInt,
    notes: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt && data.endAt <= data.startAt) {
      ctx.addIssue({
        code: "custom",
        message: "종료일은 시작일보다 늦어야 합니다.",
        path: ["endAt"],
      });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.and(
  z.object({
    expectedUpdatedAt: z.string().min(1, { message: "동시성 토큰이 필요합니다." }),
  }),
);

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
