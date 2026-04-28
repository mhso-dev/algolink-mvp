// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-002 — 강사 입력 검증.
import { z } from "zod";

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

export const skillUpdateInputSchema = z.object({
  skillId: z.string().uuid(),
  proficiency: z.enum(["beginner", "intermediate", "advanced", "expert"]).nullable(),
});

// ---------- 일정 schema ----------

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
      const s = new Date(d.startsAt).getTime();
      const e = new Date(d.endsAt).getTime();
      return Number.isFinite(s) && Number.isFinite(e) && s < e;
    },
    { path: ["endsAt"], message: "종료 시각은 시작 시각보다 뒤여야 합니다." },
  )
  .refine(
    (d) => {
      const s = new Date(d.startsAt).getTime();
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
