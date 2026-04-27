import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAuthError, AUTH_MSG } from "../errors";

const MSG_INVALID = "이메일 또는 비밀번호가 올바르지 않습니다.";
const MSG_RATE = "잠시 후 다시 시도해주세요.";
const MSG_SESSION = "세션이 만료되었습니다. 다시 로그인해주세요.";
const MSG_INVITE =
  "초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요.";
const MSG_POLICY =
  "비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.";
const MSG_NETWORK = "네트워크 연결을 확인하고 다시 시도해주세요.";
const MSG_FALLBACK = "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

// console.error mute (unmapped fallback test에서 시끄러워지는 것 방지)
const originalError = console.error;
console.error = () => {};
process.on("exit", () => {
  console.error = originalError;
});

test("invalid_credentials → 자격 증명 메시지", () => {
  assert.equal(
    mapAuthError({ code: "invalid_credentials", message: "x" }),
    MSG_INVALID,
  );
  assert.equal(
    mapAuthError({ code: "invalid_login_credentials" }),
    MSG_INVALID,
  );
  assert.equal(
    mapAuthError({ message: "Invalid login credentials" }),
    MSG_INVALID,
  );
});

test("rate limit (429 또는 명시적 코드)", () => {
  assert.equal(mapAuthError({ status: 429 }), MSG_RATE);
  assert.equal(
    mapAuthError({ code: "over_request_rate_limit" }),
    MSG_RATE,
  );
  assert.equal(
    mapAuthError({ code: "over_email_send_rate_limit" }),
    MSG_RATE,
  );
});

test("세션 만료 코드", () => {
  assert.equal(mapAuthError({ code: "session_expired" }), MSG_SESSION);
  assert.equal(mapAuthError({ code: "refresh_token_not_found" }), MSG_SESSION);
});

test("초대/OTP 토큰 만료/사용됨", () => {
  assert.equal(mapAuthError({ code: "otp_expired" }), MSG_INVITE);
  assert.equal(mapAuthError({ code: "invalid_otp" }), MSG_INVITE);
  assert.equal(mapAuthError({ code: "token_expired" }), MSG_INVITE);
});

test("비밀번호 정책 위반", () => {
  assert.equal(mapAuthError({ code: "weak_password" }), MSG_POLICY);
  assert.equal(
    mapAuthError({ message: "Password is too weak" }),
    MSG_POLICY,
  );
});

test("네트워크 TypeError", () => {
  const err = new TypeError("Failed to fetch");
  assert.equal(mapAuthError(err), MSG_NETWORK);
});

test("매핑되지 않은 코드 → fallback", () => {
  assert.equal(mapAuthError({ code: "totally_unknown_xyz" }), MSG_FALLBACK);
  assert.equal(mapAuthError(null), MSG_FALLBACK);
  assert.equal(mapAuthError("string error"), MSG_FALLBACK);
});

test("AUTH_MSG flow text 상수", () => {
  assert.equal(
    AUTH_MSG.passwordResetEmailSent,
    "이메일을 발송했습니다. 받은편지함을 확인하세요.",
  );
  assert.equal(
    AUTH_MSG.passwordResetCompleted,
    "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
  );
});
