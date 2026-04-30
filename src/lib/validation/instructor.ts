// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-002 — 강사 입력 검증.
import { z } from "zod";

// zod v4 의 z.string().uuid() 는 RFC 4122 version/variant 비트를 강제 검증한다.
// 시드/synthetic UUID (예: 20000000-0000-0000-0000-000000000001) 는 PostgreSQL
// uuid 컬럼은 허용하지만 zod v4 strict UUID 는 거부한다. 형태만 검증한다.
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    { message: "UUID 형식이 아닙니다." },
  );

/**
 * 한국 주민등록번호 체크섬 검증.
 * 가중치: [2,3,4,5,6,7,8,9,2,3,4,5]
 * 마지막 자리 = (11 - sum % 11) % 10
 */
export function validateRrnChecksum(rrn: string): boolean {
  const digits = rrn.replace(/\D/g, "");
  if (digits.length !== 13) return false;
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]!, 10) * weights[i]!;
  }
  const expected = (11 - (sum % 11)) % 10;
  return expected === parseInt(digits[12]!, 10);
}

/**
 * 한국 사업자등록번호 체크섬 (10자리).
 * 가중치: [1,3,7,1,3,7,1,3,5]
 * 9번째 자리에 5를 곱한 값 / 10의 몫을 가산.
 */
export function validateBrnChecksum(brn: string): boolean {
  const digits = brn.replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]!, 10) * weights[i]!;
  }
  sum += Math.floor((parseInt(digits[8]!, 10) * 5) / 10);
  const expected = (10 - (sum % 10)) % 10;
  return expected === parseInt(digits[9]!, 10);
}

// ---------- 이력서 섹션 schema (간소화) ----------

const dateOpt = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "YYYY-MM 형식").or(z.literal("")).optional();

export const educationInputSchema = z.object({
  school: z.string().min(1, "학교명을 입력해주세요."),
  major: z.string().optional(),
  degree: z.string().optional(),
  startDate: dateOpt,
  endDate: dateOpt,
  description: z.string().optional(),
});

export const workExperienceInputSchema = z.object({
  company: z.string().min(1, "회사명을 입력해주세요."),
  position: z.string().optional(),
  startDate: dateOpt,
  endDate: dateOpt,
  description: z.string().optional(),
});

export const certificationInputSchema = z.object({
  name: z.string().min(1, "자격증명을 입력해주세요."),
  issuer: z.string().optional(),
  issuedDate: dateOpt,
  expiresDate: dateOpt,
  description: z.string().optional(),
});

export const teachingExperienceInputSchema = z.object({
  title: z.string().min(1, "강의명을 입력해주세요."),
  organization: z.string().optional(),
  startDate: dateOpt,
  endDate: dateOpt,
  description: z.string().optional(),
});

export const instructorProjectInputSchema = z.object({
  title: z.string().min(1, "프로젝트명을 입력해주세요."),
  role: z.string().optional(),
  startDate: dateOpt,
  endDate: dateOpt,
  description: z.string().optional(),
});

export const publicationInputSchema = z.object({
  title: z.string().min(1, "도서명을 입력해주세요."),
  publisher: z.string().optional(),
  publishedDate: dateOpt,
  isbn: z.string().optional(),
  description: z.string().optional(),
});

export const otherActivityInputSchema = z.object({
  title: z.string().min(1, "활동명을 입력해주세요."),
  category: z.string().optional(),
  activityDate: dateOpt,
  description: z.string().optional(),
});

export const basicInfoInputSchema = z.object({
  nameKr: z.string().min(1, "이름(한글)을 입력해주세요.").max(100),
  nameHanja: z.string().max(50).optional().or(z.literal("")),
  nameEn: z.string().max(100).optional().or(z.literal("")),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")
    .optional()
    .or(z.literal("")),
  email: z.string().email("올바른 이메일 형식을 입력해주세요.").optional().or(z.literal("")),
  phone: z
    .string()
    .regex(/^[0-9\-+()\s]{6,20}$/, "올바른 전화번호 형식")
    .optional()
    .or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
});

// SPEC-SKILL-ABSTRACT-001: proficiency 제거. 보유=1/미보유=0 binary 매칭.
// selected=true → INSERT, selected=false → DELETE (full-replace 패턴).
export const skillUpdateInputSchema = z.object({
  skillId: uuidLike,
  selected: z.boolean(),
});

/**
 * SPEC-SKILL-ABSTRACT-001 §3.2 — full-replace upsert 입력.
 * 강사가 9개 chip 중 N개를 선택 후 저장 시 사용.
 */
export const skillsBulkInputSchema = z.object({
  skillIds: z.array(uuidLike).max(9, "최대 9개까지 선택 가능합니다."),
});

// ---------- 일정 schema ----------

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseScheduleBoundary(value: string, boundary: "start" | "end"): Date {
  if (DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return new Date(Number.NaN);
    // Date-only personal/unavailable schedules are all-day ranges. Keep the
    // user-facing end date inclusive by storing it as exclusive next-day 00:00.
    const offsetDays = boundary === "end" ? 1 : 0;
    return new Date(Date.UTC(year, month - 1, day + offsetDays));
  }
  return new Date(value);
}

export function normalizeScheduleDateRange(input: {
  startsAt: string;
  endsAt: string;
}): { startsAt: Date; endsAt: Date } | null {
  const startsAt = parseScheduleBoundary(input.startsAt, "start");
  const endsAt = parseScheduleBoundary(input.endsAt, "end");
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return null;
  }
  return { startsAt, endsAt };
}

export const scheduleInputSchema = z
  .object({
    scheduleKind: z.enum(["personal", "unavailable"]),
    title: z.string().optional(),
    startsAt: z.string().min(1, "시작 시각을 입력해주세요."),
    endsAt: z.string().min(1, "종료 시각을 입력해주세요."),
    notes: z.string().optional(),
  })
  .refine(
    (d) => {
      const range = normalizeScheduleDateRange(d);
      return Boolean(range && range.startsAt < range.endsAt);
    },
    { path: ["endsAt"], message: "종료일은 시작일보다 빠를 수 없습니다." },
  )
  .refine(
    (d) => {
      const range = normalizeScheduleDateRange(d);
      const s = range?.startsAt.getTime() ?? Number.NaN;
      const now = Date.now();
      const TWO_YEARS = 1000 * 60 * 60 * 24 * 365 * 2;
      return Math.abs(s - now) <= TWO_YEARS;
    },
    { path: ["startsAt"], message: "현재로부터 ±2년 이내만 입력 가능합니다." },
  );

// ---------- 지급 정보 schema ----------

export const payoutInputSchema = z.object({
  residentNumber: z
    .string()
    .regex(/^\d{6}-?\d{7}$/, "주민등록번호 형식이 올바르지 않습니다.")
    .refine(validateRrnChecksum, "주민등록번호 체크섬이 일치하지 않습니다."),
  bankName: z.string().min(1, "거래은행을 입력해주세요."),
  bankAccount: z
    .string()
    .regex(/^[\d-]{5,20}$/, "계좌번호는 숫자/하이픈 5–20자입니다."),
  accountHolder: z.string().min(1, "예금주를 입력해주세요."),
  businessNumber: z
    .string()
    .regex(/^\d{3}-?\d{2}-?\d{5}$/)
    .refine(validateBrnChecksum, "사업자등록번호 체크섬이 일치하지 않습니다.")
    .optional()
    .or(z.literal("")),
  withholdingTaxRate: z.enum(["0", "3.30", "8.80"], {
    message: "원천세율은 0 / 3.30 / 8.80 중 하나여야 합니다.",
  }),
});

export type EducationInput = z.infer<typeof educationInputSchema>;
export type WorkExperienceInput = z.infer<typeof workExperienceInputSchema>;
export type CertificationInput = z.infer<typeof certificationInputSchema>;
export type TeachingExperienceInput = z.infer<typeof teachingExperienceInputSchema>;
export type InstructorProjectInput = z.infer<typeof instructorProjectInputSchema>;
export type PublicationInput = z.infer<typeof publicationInputSchema>;
export type OtherActivityInput = z.infer<typeof otherActivityInputSchema>;
export type BasicInfoInput = z.infer<typeof basicInfoInputSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type PayoutInput = z.infer<typeof payoutInputSchema>;
export type SkillUpdateInput = z.infer<typeof skillUpdateInputSchema>;
export type SkillsBulkInput = z.infer<typeof skillsBulkInputSchema>;
// SPEC-INSTRUCTOR-001 §2.3 REQ-INSTRUCTOR-CREATE-002 — 강사 등록 zod 스키마.
// SPEC-INSTRUCTOR-001 §2.1 REQ-INSTRUCTOR-LIST — 리스트 필터 zod 스키마.

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
  skillIds: z.array(uuidLike).default([]),
});

export type InstructorCreateInput = z.infer<typeof instructorCreateSchema>;

export const instructorListFilterSchema = z
  .object({
    name: z.string().trim().optional(),
    skillIds: z.array(uuidLike).optional(),
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
