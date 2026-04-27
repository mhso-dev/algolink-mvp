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
export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "[auth.admin] NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "[auth.admin] SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
