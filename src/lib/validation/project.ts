// SPEC-PROJECT-001 §2.2 REQ-PROJECT-CREATE-002 — 프로젝트 등록/수정 zod 스키마.
// 한국어 에러 메시지는 errors.ts 단일 출처로 통합 (REQ-PROJECT-ERROR).

import { z } from "zod";

// zod v4 의 z.string().uuid() 는 RFC 4122 version/variant 비트를 강제 검증한다.
// 시드 UUID (예: 20000000-0000-0000-0000-000000000001) 는 PostgreSQL uuid 컬럼은
// 허용하지만 zod v4 strict UUID 는 거부한다. 형태만 검증한다.
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    { message: "UUID 형식이 아닙니다." },
  );

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function coerceDateLike(v: unknown, boundary: "start" | "end"): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  if (DATE_ONLY_RE.test(v)) {
    const [year, month, day] = v.split("-").map(Number);
    if (!year || !month || !day) return new Date(Number.NaN);
    // Date-only 교육 기간은 inclusive end date를 허용한다. DB timestamp range는
    // [start, end) 로 다루기 위해 종료일만 다음 날 00:00 UTC로 정규화한다.
    const offsetDays = boundary === "end" ? 1 : 0;
    return new Date(Date.UTC(year, month - 1, day + offsetDays));
  }
  return new Date(v);
}

const isoDateLike = (boundary: "start" | "end") =>
  z.preprocess(
    (v) => coerceDateLike(v, boundary),
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

// SPEC-PAYOUT-002 §M4 REQ-PAYOUT002-PROJECT-FIELDS-001/-005 — 시급 + 분배율 검증.
const optionalSharePct = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "string") return Number(v);
    return v;
  },
  z
    .number({ error: "강사 분배율은 숫자여야 합니다." })
    .min(0, { message: "강사 분배율은 0~100 사이여야 합니다." })
    .max(100, { message: "강사 분배율은 0~100 사이여야 합니다." }),
);

export const createProjectSchema = z
  .object({
    title: z
      .string()
      .min(1, { message: "제목은 필수입니다." })
      .max(200, { message: "제목은 200자 이하여야 합니다." }),
    clientId: uuidLike.refine((v) => v.length > 0, {
      message: "고객사를 선택해야 합니다.",
    }),
    projectType: z.enum(["education", "material_development"]).default("education"),
    startAt: isoDateLike("start").optional(),
    endAt: isoDateLike("end").optional(),
    // SPEC-SKILL-ABSTRACT-001: required_skills는 9개 추상 카테고리 중 선택.
    requiredSkillIds: z.array(uuidLike).max(9, "최대 9개까지 선택 가능합니다.").default([]),
    businessAmountKrw: optionalNonNegativeInt,
    instructorFeeKrw: optionalNonNegativeInt,
    // SPEC-PAYOUT-002 — 시간당 사업비 + 강사 분배율 (REQ-PROJECT-FIELDS-001/-005).
    hourlyRateKrw: optionalNonNegativeInt,
    instructorSharePct: optionalSharePct,
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
