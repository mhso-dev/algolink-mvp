// @MX:ANCHOR: SPEC-DB-001 — Drizzle + Supabase 클라이언트 단일 진입점. fan_in 후속 SPEC 전반.
// @MX:REASON: 모든 서버 코드가 본 모듈에서 db/supabase 인스턴스를 가져온다.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (see .env.example)");
}

/**
 * postgres-js 연결 풀.
 * RLS를 위해 매 요청마다 set_config로 JWT를 주입할 수 있도록 prepared: false 권장.
 * pgcrypto 키도 SET LOCAL로 connection-level 주입 (애플리케이션 레이어 책임).
 */
const queryClient = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 신규 publishable key (sb_publishable_*) — 레거시 anon JWT 대체.
// Supabase 2026 Q1 retro: legacy anon/service_role JWT 는 2026 후반 제거 예정.
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * 클라이언트 사이드 Supabase 인스턴스 (publishable key).
 * 서버 사이드에서는 별도 SSR 헬퍼 (@supabase/ssr) 사용 권장.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null;

export { schema };
