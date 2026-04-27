// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-003/004 — pgcrypto 기반 PII 암호화/복호화 wrapper.
// @MX:WARN: 평문 PII는 본 모듈 외부로 절대 누출되어선 안 됨.
// @MX:REASON: 개인정보보호법 위반 — 평문 저장/로깅 시 회사 책임.
// @MX:NOTE: SPEC-DB-001의 pgcrypto helper RPC 부재 시 service role + pgp_sym_encrypt 우회 (REQ-ME-PAYOUT-008).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PII 평문 → bytea 암호문 변환 (Server Action 전용).
 *
 * 우선순위:
 *  1. SPEC-DB-001이 노출한 RPC `app.encrypt_pii(text)` (authenticated GRANT).
 *  2. 부재 시 service role client에서 raw SQL `pgp_sym_encrypt(plaintext, key)` 실행.
 *
 * 본 MVP는 RPC 부재 가정으로 service role 우회를 기본 경로로 사용한다.
 * 실제 운영에서는 Supabase의 `Vault` 시크릿 또는 환경변수 기반 키 주입이 필요하다.
 */
export async function encryptPii(
  supabaseAdmin: SupabaseClient,
  plaintext: string,
): Promise<Uint8Array> {
  // 우선 RPC 시도 — 실패하면 raw SQL fallback.
  const { data, error } = await supabaseAdmin.rpc("encrypt_pii", { plaintext });
  if (!error && data) {
    return toUint8Array(data);
  }
  // Fallback: pgp_sym_encrypt 직접 호출.
  // @MX:WARN: 키는 process.env.PGCRYPTO_KEY로 주입. 누설 시 모든 PII 평문 복원 가능.
  const key = process.env.PGCRYPTO_KEY;
  if (!key) {
    throw new Error("PGCRYPTO_KEY 환경 변수가 설정되어 있지 않습니다.");
  }
  // service role으로 단일 row select via SQL.
  // postgres-js 직접 사용은 본 모듈 외부에 위임 (queries layer).
  // 본 모듈은 placeholder — 실제 구현은 SPEC-DB-002에서 RPC가 정착될 때 단순화.
  throw new Error(
    "encrypt_pii RPC가 SPEC-DB-001에 노출되지 않았습니다. SPEC-DB-002로 위임이 필요합니다.",
  );
}

/** bytea → 평문 — 본 모듈 외부로 평문이 빠져나가지 않도록 즉시 마스킹할 것. */
export async function decryptPii(
  supabaseAdmin: SupabaseClient,
  ciphertext: Uint8Array,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("decrypt_pii", {
    ciphertext: toBase64(ciphertext),
  });
  if (error) {
    throw new Error(`PII 복호화 실패: ${error.message}`);
  }
  if (typeof data !== "string") {
    throw new Error("PII 복호화 결과 형식 오류");
  }
  return data;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    // Supabase는 bytea를 hex 문자열 (`\x...`) 또는 base64로 반환할 수 있다.
    if (value.startsWith("\\x")) {
      const hex = value.slice(2);
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  throw new Error("encrypt_pii RPC 응답 형식 오류");
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
