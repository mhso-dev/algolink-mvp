// SPEC-INSTRUCTOR-001 §2.3 REQ-INSTRUCTOR-CREATE-002 — 강사 등록 zod 스키마.
// SPEC-INSTRUCTOR-001 §2.1 REQ-INSTRUCTOR-LIST — 리스트 필터 zod 스키마.

import { z } from "zod";

const phoneRegex = /^[0-9\-+()\s]{6,20}$/;

export const instructorCreateSchema = z.object({
  nameKr: z
    .string({ message: "이름을 입력해주세요." })
    .trim()
    .min(1, "이름을 입력해주세요.")
    .max(100, "이름은 100자 이하로 입력해주세요."),
  nameEn: z
    .union([
      z.literal("").transform(() => undefined),
      z
        .string()
        .trim()
        .max(100, "영문명은 100자 이하로 입력해주세요."),
    ])
    .optional(),
  email: z
    .string({ message: "올바른 이메일 형식을 입력해주세요." })
    .trim()
    .email("올바른 이메일 형식을 입력해주세요."),
  phone: z
    .union([
      z.literal("").transform(() => undefined),
      z
        .string()
        .trim()
        .regex(phoneRegex, "올바른 전화번호 형식을 입력해주세요."),
    ])
    .optional(),
  skillIds: z.array(z.string().uuid()).default([]),
});

export type InstructorCreateInput = z.infer<typeof instructorCreateSchema>;

export const instructorListFilterSchema = z
  .object({
    name: z.string().trim().optional(),
    skillIds: z.array(z.string().uuid()).optional(),
    scoreMin: z.coerce.number().min(0).max(5).optional(),
    scoreMax: z.coerce.number().min(0).max(5).optional(),
    sort: z
      .enum(["name_kr", "lecture_count", "avg_score", "last_lecture_date"])
      .optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (v) => {
      if (v.scoreMin === undefined || v.scoreMax === undefined) return true;
      return v.scoreMin <= v.scoreMax;
    },
    {
      path: ["scoreMin"],
      message: "최소 만족도는 최대 만족도보다 작거나 같아야 합니다.",
    },
  );

export type InstructorListFilterInput = z.infer<
  typeof instructorListFilterSchema
>;
