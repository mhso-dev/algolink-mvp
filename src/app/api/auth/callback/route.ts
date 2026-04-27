// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-003 / §2.3 REQ-AUTH-PASSWORD-004.
// OTP 통합 dispatcher — invite/recovery 양쪽을 동일하게 처리하고 다음 단계로 redirect.
// proxy.ts의 `/api/auth` PUBLIC prefix에 포함되어 미인증 상태로도 접근 가능.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { mapAuthError } from "@/auth/errors";

type OtpType = "invite" | "recovery";

function isOtpType(value: string | null): value is OtpType {
  return value === "invite" || value === "recovery";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  if (!tokenHash || !isOtpType(type)) {
    // 잘못된 호출 — 로그인 화면으로 안전하게 fallback.
    return NextResponse.redirect(
      new URL("/login?error=invalid-callback", request.url),
    );
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const errorParam = encodeURIComponent(mapAuthError(error));
    const target = type === "invite" ? "/accept-invite" : "/forgot-password";
    return NextResponse.redirect(
      new URL(`${target}?error=${errorParam}`, request.url),
    );
  }

  // verifyOtp 성공 — 다음 단계로 redirect.
  // next param이 있으면 사용, 없으면 type별 기본 경로.
  const target =
    next && next !== "/"
      ? next
      : type === "invite"
        ? "/accept-invite/set-password"
        : "/reset-password";

  return NextResponse.redirect(new URL(target, request.url));
}
