// Supabase 에러 → 한국어 사용자 메시지 매핑.
// SPEC-AUTH-001 §2.11 REQ-AUTH-ERROR-001/002/004.
// pure module — 클라이언트/서버 양쪽 사용 가능.

const MSG_INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";
const MSG_RATE_LIMIT = "잠시 후 다시 시도해주세요.";
const MSG_SESSION_EXPIRED = "세션이 만료되었습니다. 다시 로그인해주세요.";
const MSG_INVITE_INVALID =
  "초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요.";
const MSG_PASSWORD_POLICY =
  "비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.";
const MSG_NETWORK = "네트워크 연결을 확인하고 다시 시도해주세요.";
const MSG_FALLBACK = "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

export const AUTH_MSG = {
  passwordResetEmailSent: "이메일을 발송했습니다. 받은편지함을 확인하세요.",
  passwordResetCompleted:
    "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
} as const;

interface MaybeAuthError {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  name?: unknown;
}

function asRecord(value: unknown): MaybeAuthError | null {
  if (typeof value !== "object" || value === null) return null;
  return value as MaybeAuthError;
}

export function mapAuthError(error: unknown): string {
  // 네트워크 오류 (TypeError + fetch 실패 패턴)
  if (error instanceof TypeError) {
    const m = error.message?.toLowerCase() ?? "";
    if (
      m.includes("fetch") ||
      m.includes("network") ||
      m.includes("failed to fetch")
    ) {
      return MSG_NETWORK;
    }
  }

  const rec = asRecord(error);
  if (!rec) {
    console.error("[auth.errors] unmapped:", error);
    return MSG_FALLBACK;
  }

  const code =
    typeof rec.code === "string" ? rec.code.toLowerCase() : undefined;
  const message =
    typeof rec.message === "string" ? rec.message.toLowerCase() : "";
  const status = typeof rec.status === "number" ? rec.status : undefined;
  const name = typeof rec.name === "string" ? rec.name.toLowerCase() : "";

  // Rate limit (status 429 또는 명시적 코드)
  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    message.includes("rate limit")
  ) {
    return MSG_RATE_LIMIT;
  }

  // 자격 증명 실패 (이메일 enumeration 방지로 단일 메시지)
  if (
    code === "invalid_credentials" ||
    code === "invalid_login_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return MSG_INVALID_CREDENTIALS;
  }

  // 세션 만료 / refresh token 누락
  if (
    code === "session_expired" ||
    code === "refresh_token_not_found" ||
    code === "session_not_found" ||
    message.includes("refresh token") ||
    message.includes("session expired")
  ) {
    return MSG_SESSION_EXPIRED;
  }

  // 초대/OTP 토큰 만료/사용됨
  if (
    code === "otp_expired" ||
    code === "invalid_otp" ||
    code === "token_expired" ||
    code === "token_already_used" ||
    message.includes("otp") ||
    message.includes("token has expired") ||
    message.includes("invalid token")
  ) {
    return MSG_INVITE_INVALID;
  }

  // 비밀번호 정책 위반
  if (
    code === "weak_password" ||
    code === "password_too_short" ||
    message.includes("password") &&
      (message.includes("weak") ||
        message.includes("short") ||
        message.includes("at least") ||
        message.includes("policy"))
  ) {
    return MSG_PASSWORD_POLICY;
  }

  // 네트워크 (AbortError, NetworkError 등)
  if (
    name === "aborterror" ||
    name === "networkerror" ||
    message.includes("network") ||
    message.includes("fetch")
  ) {
    return MSG_NETWORK;
  }

  // 매핑되지 않은 에러는 로그에 남기고 fallback 반환
  console.error("[auth.errors] unmapped:", error);
  return MSG_FALLBACK;
}
