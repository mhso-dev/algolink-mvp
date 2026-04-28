// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-004/005 — 본인 지급 정보 read (마스킹된 형태로 form 초기화).
// @MX:NOTE: instructors_safe view 가 enc 컬럼을 노출하지 않으므로 raw instructors 직접 조회.
// @MX:NOTE: bank_account_enc 는 JSON `{b,a,h}` 구조로 bankName/bankAccount/accountHolder 를 함께 보관 — REQ-ME-PAYOUT-004 (평문 컬럼 금지).
// @MX:REASON: 신규 plaintext 컬럼 추가 없이 단일 enc 컬럼에 묶어 schema 변경 최소화.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { decryptPayoutField } from "./pii-encrypt";
import { unpackBankBundle } from "./payout-bank-bundle";
import {
  maskResidentNumber,
  maskBankAccount,
  maskBusinessNumber,
} from "./resume-mask";

// 단일 import 진입점 제공 — server action 등에서 한 곳으로 import 가능.
export { packBankBundle, unpackBankBundle } from "./payout-bank-bundle";

export interface MaskedPayout {
  hasResidentNumber: boolean;
  hasBankAccount: boolean;
  hasBusinessNumber: boolean;
  residentNumberMasked: string;
  bankName: string;
  bankAccountMasked: string;
  accountHolder: string;
  businessNumberMasked: string;
  withholdingTaxRate: string; // "0" | "3.30" | "8.80"
}

/**
 * 본인 지급 정보를 복호화 후 즉시 마스킹하여 반환.
 * 평문은 본 함수 내부에서만 존재하며 outside 노출 금지 (REQ-ME-PAYOUT-004).
 */
export async function getMyPayoutMasked(instructorId: string): Promise<MaskedPayout> {
  const supabase = createClient(await cookies());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("instructors")
    .select(
      "resident_number_enc, bank_account_enc, business_number_enc, withholding_tax_rate_enc",
    )
    .eq("id", instructorId)
    .limit(1);

  if (error || !data || data.length === 0) {
    return emptyPayout();
  }

  const row = data[0] as {
    resident_number_enc: string | null;
    bank_account_enc: string | null;
    business_number_enc: string | null;
    withholding_tax_rate_enc: string | null;
  };

  const [residentPlain, bankPlain, businessPlain, ratePlain] = await Promise.all([
    safeDecrypt(supabase, row.resident_number_enc, instructorId),
    safeDecrypt(supabase, row.bank_account_enc, instructorId),
    safeDecrypt(supabase, row.business_number_enc, instructorId),
    safeDecrypt(supabase, row.withholding_tax_rate_enc, instructorId),
  ]);

  const bank = unpackBankBundle(bankPlain);

  return {
    hasResidentNumber: !!residentPlain,
    hasBankAccount: !!bank.a,
    hasBusinessNumber: !!businessPlain,
    residentNumberMasked: maskResidentNumber(residentPlain),
    bankName: bank.b,
    bankAccountMasked: maskBankAccount(bank.a),
    accountHolder: bank.h,
    businessNumberMasked: maskBusinessNumber(businessPlain),
    withholdingTaxRate: normalizeRate(ratePlain),
  };
}

function emptyPayout(): MaskedPayout {
  return {
    hasResidentNumber: false,
    hasBankAccount: false,
    hasBusinessNumber: false,
    residentNumberMasked: "",
    bankName: "",
    bankAccountMasked: "",
    accountHolder: "",
    businessNumberMasked: "",
    withholdingTaxRate: "3.30",
  };
}

async function safeDecrypt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ciphertext: string | null,
  instructorId: string,
): Promise<string | null> {
  if (!ciphertext) return null;
  try {
    return await decryptPayoutField(supabase, ciphertext, instructorId);
  } catch (e) {
    console.error("[getMyPayoutMasked] decrypt failed", (e as Error).message);
    return null;
  }
}

function normalizeRate(value: string | null): string {
  if (!value) return "3.30";
  if (value === "0" || value === "3.30" || value === "8.80") return value;
  return "3.30";
}
