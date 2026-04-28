// SPEC-ME-001 §2.7 — 거래은행/계좌번호/예금주 → 단일 enc payload 직렬화 helper.
// pure module (서버/클라이언트 양쪽 import 가능, 단 평문은 서버에서만 다룬다).

export interface BankBundle {
  /** bankName */
  b: string;
  /** bankAccount */
  a: string;
  /** accountHolder */
  h: string;
}

/** 거래은행 + 계좌번호 + 예금주를 단일 JSON 문자열로 직렬화 (enc 입력용). */
export function packBankBundle(
  bankName: string,
  bankAccount: string,
  accountHolder: string,
): string {
  const bundle: BankBundle = {
    b: bankName.trim(),
    a: bankAccount.trim(),
    h: accountHolder.trim(),
  };
  return JSON.stringify(bundle);
}

/** decrypt 결과 문자열에서 BankBundle 안전 파싱. */
export function unpackBankBundle(plain: string | null | undefined): BankBundle {
  if (!plain) return { b: "", a: "", h: "" };
  try {
    const obj = JSON.parse(plain) as Partial<BankBundle>;
    return {
      b: typeof obj.b === "string" ? obj.b : "",
      a: typeof obj.a === "string" ? obj.a : "",
      h: typeof obj.h === "string" ? obj.h : "",
    };
  } catch {
    // legacy: 계좌번호 단독 저장된 경우 → 계좌번호로만 사용.
    return { b: "", a: plain, h: "" };
  }
}
