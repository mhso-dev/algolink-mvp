"use server";

// 로그인 / 로그아웃 Server Action.
// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001..006, §2.8 REQ-AUTH-SECURITY-007,
// §2.10 REQ-AUTH-OBS-001..003, §2.11 REQ-AUTH-ERROR-001/002.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loginSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/auth/errors";
import { logAuthEvent } from "@/auth/events";
import { getCurrentUser, getServerSupabase } from "@/auth/server";
import { roleHomePath } from "@/auth/roles";
import { safeNextPath } from "@/auth/next-param";

export interface LoginActionResult {
  error?: string;
}

// 자격 증명 실패시 사용하는 통일 메시지 (REQ-AUTH-LOGIN-004 enumeration 방지).
const MSG_INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

// @MX:ANCHOR: [AUTO] 로그인 진입점 — login-form.tsx + 향후 보호 페이지에서 호출.
// @MX:REASON: 자격 증명 검증/이벤트 로깅/역할 기반 redirect를 모두 책임지는 단일 진입점.
// @MX:SPEC: SPEC-AUTH-001 REQ-AUTH-LOGIN-001..006
export async function login(
  formData: FormData,
): Promise<LoginActionResult> {
  const rawEmail = String(formData.get("email") ?? "").trim();
  const rawPassword = String(formData.get("password") ?? "");
  const rawNext = formData.get("next");
  const nextParam = typeof rawNext === "string" ? rawNext : null;

  // 1) 입력 형태 검증 — 어떤 필드가 잘못됐는지 노출하지 않고 단일 메시지 반환.
  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });
  if (!parsed.success) {
    return { error: MSG_INVALID_CREDENTIALS };
  }

  // 2) Supabase 자격 증명 검증.
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data?.user) {
    // 실패 이벤트 — 이메일은 기록하되 metadata에 비밀번호/토큰류는 절대 넣지 않음.
    await logAuthEvent("login_failure", {
      email: parsed.data.email,
      metadata: {
        code:
          (error as { code?: string } | null)?.code ?? null,
        status:
          (error as { status?: number } | null)?.status ?? null,
      },
    });
    // 429는 별도 메시지, 나머지는 enumeration 방지 통일 메시지.
    const status = (error as { status?: number } | null)?.status;
    if (status === 429) {
      return { error: mapAuthError(error) };
    }
    return { error: MSG_INVALID_CREDENTIALS };
  }

  // 3) 성공 이벤트 + 역할 조회.
  await logAuthEvent("login_success", {
    userId: data.user.id,
    email: parsed.data.email,
  });

  // 쿠키가 방금 세팅됐으므로 다음 SSR 요청 컨텍스트에서 claims를 읽을 수 있다.
  const current = await getCurrentUser();
  const role = current?.role ?? null;

  // 4) redirect 대상 결정.
  // - 역할이 있으면 safeNextPath로 검증, 없으면 안전한 기본값(/dashboard)로 폴백.
  //   /dashboard는 operator/admin home이며 instructor가 접근 시 (app)/dashboard
  //   layout 가드에서 다시 instructor home으로 보내므로 최악의 경우에도 안전.
  const target =
    role !== null
      ? safeNextPath(nextParam, role, roleHomePath(role))
      : "/dashboard";

  revalidatePath("/", "layout");
  // redirect()는 control-flow exception을 던지므로 try/catch 바깥에서 호출.
  redirect(target);
}

// @MX:ANCHOR: [AUTO] 로그아웃 진입점 — topbar의 프로필 메뉴에서 호출.
// @MX:REASON: 세션 종료/이벤트 로깅/리다이렉트를 한 곳에서 관리해야 하며 fan_in >= 2.
// @MX:SPEC: SPEC-AUTH-001 REQ-AUTH-LOGIN-005/006
export async function signOut(): Promise<void> {
  // 1) 로깅용으로 현재 사용자 id를 best-effort 캡처.
  const current = await getCurrentUser();
  const userId = current?.id;

  // 2) 세션 종료.
  try {
    const supabase = await getServerSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    // signOut 실패는 사용자에게 영향이 없도록 무시하되 로그만 남긴다.
    console.error("[auth.signOut] supabase signOut failed:", err);
  }

  // 3) 감사 로그.
  await logAuthEvent("logout", { userId });

  revalidatePath("/", "layout");
  redirect("/login");
}
