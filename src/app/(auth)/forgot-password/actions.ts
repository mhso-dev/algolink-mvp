"use server";

// SPEC-AUTH-001 §2.3 REQ-AUTH-PASSWORD-003, §2.10 REQ-AUTH-OBS-002,
// §2.6 REQ-AUTH-SECURITY-007 (이메일 enumeration 방지),
// §2.11 REQ-AUTH-ERROR-002 (rate-limit 한국어 매핑).

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { logAuthEvent } from "@/auth/events";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { AUTH_MSG, mapAuthError } from "@/auth/errors";

export async function requestPasswordReset(
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    // enumeration 방지를 위해 파싱 실패도 단일 메시지로.
    return { error: "유효한 이메일 주소를 입력해주세요." };
  }
  const email = parsed.data.email;

  const supabase = createClient(await cookies());
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = `${appUrl}/api/auth/callback?next=/reset-password`;

  // Supabase resetPasswordForEmail은 미가입 이메일과 가입 이메일을 응답으로 구분하지
  // 않는다 (의도된 anti-enumeration 동작). 이를 신뢰하고 항상 동일한 성공 메시지를 반환.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // 결과와 무관하게 시도를 기록 (REQ-AUTH-OBS-002 password_reset_requested).
  await logAuthEvent("password_reset_requested", {
    email,
    metadata: {
      redirectTo,
      error_code:
        error && typeof error === "object" && "code" in error
          ? ((error as { code?: unknown }).code ?? null)
          : null,
    },
  });

  // Rate-limit만 사용자에게 노출 (REQ-AUTH-ERROR-002). 그 외 모든 결과는 통일된 성공.
  if (error) {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;
    const code =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    if (status === 429 || code === "over_email_send_rate_limit") {
      return { error: mapAuthError(error) };
    }
  }

  // 통일된 성공 메시지 — 실제 전송 / 미가입 이메일 silent skip 양쪽을 모두 커버.
  return { success: AUTH_MSG.passwordResetEmailSent };
}
