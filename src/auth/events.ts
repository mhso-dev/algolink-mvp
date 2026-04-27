import "server-only";

// `public.auth_events` 감사 로그 헬퍼.
// SPEC-AUTH-001 §2.10 REQ-AUTH-OBS-001/002/003/005.

import { headers } from "next/headers";
import { createServiceSupabase } from "./admin";

export type AuthEventType =
  | "login_success"
  | "login_failure"
  | "logout"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_changed"
  | "invitation_issued"
  | "invitation_accepted"
  | "invitation_revoked";

export interface AuthEventContext {
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY = /password|token|secret|key/i;

function redactMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

function firstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",", 1)[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * auth_events 테이블에 이벤트를 기록한다.
 * 실패는 절대 throw하지 않으며 (REQ-AUTH-OBS-005), 호출 측 인증 흐름을 중단시키지 않는다.
 */
export async function logAuthEvent(
  eventType: AuthEventType,
  ctx: AuthEventContext = {},
): Promise<void> {
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ipAddress = firstIp(h.get("x-forwarded-for"));
      userAgent = h.get("user-agent");
    } catch {
      // headers()는 일부 컨텍스트에서 throw 가능; IP/UA 없이 계속 진행.
    }

    const supabase = createServiceSupabase();
    const payload = {
      user_id: ctx.userId ?? null,
      email: ctx.email ?? null,
      event_type: eventType,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: redactMetadata(ctx.metadata),
    };

    // @MX:NOTE: 테이블은 마이그레이션 M5(20260427000082_auth_events.sql)에서 생성된다.
    // M3 시점에는 `from('auth_events' as any)` 캐스팅이 필요할 수 있으나
    // Database 타입 정의가 마이그레이션과 함께 갱신되면 캐스팅을 제거한다.
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("auth_events" as any)
      .insert(payload);

    if (error) {
      console.error("[auth.events] insert failed:", error);
    }
  } catch (err) {
    console.error("[auth.events] unexpected failure:", err);
  }
}
