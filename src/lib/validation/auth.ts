// 인증 폼 검증용 zod 스키마.
// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001/002, §2.4 REQ-AUTH-PWPOLICY-001,
// §2.3 REQ-AUTH-INVITE-002.
// pure module — 클라이언트/서버 양쪽에서 사용 가능.

import { z } from "zod";

export const emailSchema = z
  .string()
  .email("유효한 이메일 주소를 입력해주세요.");

// 로그인: 비밀번호 정책은 가입/재설정에서만 적용. 로그인은 빈 값만 거부.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

// 비밀번호 정책: 12자 이상 + 대소문자/숫자/특수문자 중 3종 이상.
export const passwordSchema = z
  .string()
  .min(12, "비밀번호는 12자 이상이어야 합니다.")
  .refine(
    (v) => {
      const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) =>
        re.test(v),
      ).length;
      return classes >= 3;
    },
    "대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.",
  );

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "비밀번호가 일치하지 않습니다.",
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const inviteSchema = z.object({
  email: emailSchema,
  invited_role: z.enum(["instructor", "operator", "admin"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
