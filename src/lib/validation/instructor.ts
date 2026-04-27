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
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type PayoutInput = z.infer<typeof payoutInputSchema>;
