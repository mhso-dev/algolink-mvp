/**
 * Playwright globalSetup — E2E 실행 전 settlements 상태를 pending 으로 리셋한다.
 *
 * 목적:
 *  - phase2-notify, phase2-payout 등이 pending → requested/paid 로 mutate 하므로
 *    재실행 시 pending 시드가 고갈되어 SKIP 또는 실패가 발생한다.
 *  - paid 동결 정책(SPEC-PAYOUT-001 §M5) 은 production 보호용이며, e2e 테스트 환경에서는
 *    settlement_status_history 를 삭제한 뒤 status 를 pending 으로 되돌려 멱등 시드를 보장한다.
 *
 * 의존:
 *  - .env.local 의 DATABASE_URL 이 로컬 supabase docker 를 가리킴.
 *  - pg 모듈은 dependencies 에 이미 존재 (Drizzle, supabase 가 transitively).
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import postgres from "postgres";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv();

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[e2e globalSetup] DATABASE_URL 미설정 — settlements reset 스킵");
    return;
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM settlement_status_history WHERE settlement_id IN (SELECT id FROM settlements)`;
      await tx`UPDATE settlements SET status='pending', payment_received_at=NULL, payout_sent_at=NULL WHERE status<>'pending'`;
      // 모든 알림을 read 상태로 정규화 — bell unread 카운트의 기준선을 0 으로 맞춘다.
      await tx`UPDATE notifications SET read_at=NOW() WHERE read_at IS NULL`;
    });
    const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM settlements WHERE status='pending'`;
    console.log(`[e2e globalSetup] settlements reset 완료 (pending=${rows[0]?.count ?? "?"})`);
  } catch (e) {
    console.error("[e2e globalSetup] reset 실패:", e);
    throw e;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
