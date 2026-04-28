// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-003/004/005/008 — pgcrypto 기반 PII 암호화/복호화 wrapper.
// @MX:WARN: 평문 PII 는 본 모듈 외부로 절대 누출되어선 안 됨.
// @MX:REASON: 개인정보보호법 위반 — 평문 저장/로깅 시 회사 책임.
// @MX:ANCHOR: 강사 본인 지급 정보 R/W 진입점. 암호화는 RPC encrypt_payout_field, 복호화는 decrypt_payout_field.
// @MX:REASON: fan_in 기대 >= 3 (form action, masked-display loader, settlement export).
//
// 본 모듈은 SupabaseClient 를 외부에서 주입받으므로 next/cookies 의존이 없다.
// 따라서 'server-only' 마커는 생략하고, 실제 호출은 server action / page loader 에서만 이루어진다.

import type { SupabaseClient } from "@supabase/supabase-js";

const KEY_LABEL_DEFAULT = "default" as const;

/**
 * 평문 → bytea(Uint8Array) 암호화 (RPC `app.encrypt_payout_field`).
 *
 * - 빈 문자열/undefined 는 null 로 취급, RPC 호출 없이 null 반환.
 * - pgcrypto 미설치 / RPC 미배포 시 한국어 에러 메시지를 throw.
 */
export async function encryptPayoutField(
  supabase: SupabaseClient,
  plaintext: string | null | undefined,
): Promise<Uint8Array | null> {
  if (plaintext == null || plaintext.length === 0) {
    return null;
  }

  const { data, error } = await supabase.rpc("encrypt_payout_field", {
    plaintext,
    key_label: KEY_LABEL_DEFAULT,
  });

  if (error) {
    throw new Error(translateRpcError(error.message, "암호화"));
  }
  if (data == null) {
    return null;
  }
  return toUint8Array(data);
}

/**
 * bytea(Uint8Array) → 평문 복호화 (RPC `app.decrypt_payout_field`).
 *
 * - 본인 row 만 허용. owner_instructor_id 가 caller(auth.uid()) 와 다르면 RPC 가 거부.
 * - 평문은 즉시 마스킹 후 반환할 것 — DOM/로그/캐시에 평문 노출 금지.
 */
export async function decryptPayoutField(
  supabase: SupabaseClient,
  ciphertext: Uint8Array | string | null | undefined,
  ownerInstructorId: string,
): Promise<string | null> {
  if (ciphertext == null) {
    return null;
  }

  const ciphertextParam = normalizeCiphertextParam(ciphertext);
  if (ciphertextParam == null) {
    return null;
  }

  const { data, error } = await supabase.rpc("decrypt_payout_field", {
    ciphertext: ciphertextParam,
    owner_instructor_id: ownerInstructorId,
    key_label: KEY_LABEL_DEFAULT,
  });

  if (error) {
    throw new Error(translateRpcError(error.message, "복호화"));
  }
  if (data == null) {
    return null;
  }
  if (typeof data !== "string") {
    throw new Error("PII 복호화 결과 형식 오류");
  }
  return data;
}

// ---------- 변환 helpers ----------

/** Supabase 가 bytea 결과를 hex(`\x...`) 또는 base64 문자열로 반환하는 두 케이스 모두 처리. */
function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
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
  throw new Error("encrypt_payout_field RPC 응답 형식 오류");
}

/** RPC 입력에 들어갈 ciphertext 정규화 (항상 `\x` hex 표기). */
function normalizeCiphertextParam(value: Uint8Array | string): string | null {
  if (typeof value === "string") {
    if (value.length === 0) return null;
    if (value.startsWith("\\x")) return value;
    const buf = Buffer.from(value, "base64");
    if (buf.length === 0) return null;
    return `\\x${buf.toString("hex")}`;
  }
  if (value.byteLength === 0) return null;
  return `\\x${Buffer.from(value).toString("hex")}`;
}

/** RPC 에러 메시지를 한국어 사용자 메시지로 변환. */
function translateRpcError(message: string, op: "암호화" | "복호화"): string {
  const m = message.toLowerCase();
  if (m.includes("function") && m.includes("does not exist")) {
    return `PII ${op} RPC가 DB에 배포되어 있지 않습니다. supabase migration을 적용해주세요.`;
  }
  if (m.includes("pgcrypto") || m.includes("pgp_sym_encrypt") || m.includes("pgp_sym_decrypt")) {
    return `pgcrypto 확장이 설치되어 있지 않습니다. CREATE EXTENSION pgcrypto 를 먼저 적용하세요.`;
  }
  if (m.includes("permission denied")) {
    return `PII ${op} 권한이 없습니다. 본인 row만 ${op}할 수 있습니다.`;
  }
  if (m.includes("authentication required")) {
    return `세션이 만료되었습니다. 다시 로그인해주세요.`;
  }
  if (m.includes("pii_encryption_key")) {
    return `서버 암호화 키가 설정되어 있지 않습니다 (app.pii_encryption_key 누락).`;
  }
  return `PII ${op} 실패: ${message}`;
}

// ---------- backward-compat aliases ----------

/** @deprecated encryptPayoutField 사용. */
export const encryptPii = encryptPayoutField;
/** @deprecated decryptPayoutField 사용 — owner_instructor_id 인자 추가됨. */
export const decryptPii = decryptPayoutField;
