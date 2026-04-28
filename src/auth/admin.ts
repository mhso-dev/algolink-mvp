import "server-only";

// Service role Supabase 클라이언트.
// 초대 발급, auth_events 기록, admin bootstrap 등 RLS를 우회해야 하는 서버 측 작업에만 사용.
// SPEC-AUTH-001 §2.2 REQ-AUTH-SESSION-006, §2.8 REQ-AUTH-SECURITY-004.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/db/supabase-types";

/**
 * Service role 키로 인증된 Supabase 클라이언트를 생성한다.
 * 쿠키 / 세션을 다루지 않으며, 절대 클라이언트 번들로 노출되어선 안 된다.
 */
// @MX:ANCHOR: [AUTO] createServiceSupabase — RLS 우회 service-role 클라이언트 팩토리
// @MX:REASON: fan_in 5, 초대 발급/auth_events/instructor 링크 등 권한 상승 경로에서 사용. 클라이언트 번들 노출 시 보안 사고 직결.
// @MX:SPEC: SPEC-AUTH-001 §2.8 REQ-AUTH-SECURITY-004
export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 신규 secret key (sb_secret_*) — 레거시 service_role JWT 대체.
  // Supabase 2026 Q1 retro: legacy service_role 키는 2026 후반 제거 예정.
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error(
      "[auth.admin] NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다.",
    );
  }
  if (!secretKey) {
    throw new Error(
      "[auth.admin] SUPABASE_SECRET_KEY 환경변수가 설정되지 않았습니다.",
    );
  }

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
