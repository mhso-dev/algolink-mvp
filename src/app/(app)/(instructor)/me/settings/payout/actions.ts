"use server";

// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-003/004/007 — 강사 본인 지급 정보 저장 Server Action.
// @MX:WARN: 평문 PII 는 본 함수 scope 안에서만 살아있다 — 반환값/로그/캐시에 절대 포함 금지.
// @MX:REASON: 개인정보보호법 제29조 (안전성 확보 조치) — 평문 영속화 시 회사 책임.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { encryptPayoutField } from "@/lib/instructor/pii-encrypt";
import { packBankBundle } from "@/lib/instructor/payout-queries";
import { payoutInputSchema } from "@/lib/validation/instructor";

export interface PayoutActionResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const NOT_INSTRUCTOR: PayoutActionResult = {
  ok: false,
  message: "강사 권한이 필요합니다.",
};

export async function savePayoutInfoAction(formData: FormData): Promise<PayoutActionResult> {
  const me = await ensureInstructorRow();
  if (!me) return NOT_INSTRUCTOR;

  const raw = {
    residentNumber: String(formData.get("residentNumber") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
    bankAccount: String(formData.get("bankAccount") ?? "").trim(),
    accountHolder: String(formData.get("accountHolder") ?? "").trim(),
    businessNumber: String(formData.get("businessNumber") ?? "").trim(),
    withholdingTaxRate: String(formData.get("withholdingTaxRate") ?? "3.30"),
  };

  // REQ-ME-PAYOUT-005: 마스킹된 값을 그대로 재제출하면 거부.
  if (raw.residentNumber.includes("*") || raw.bankAccount.includes("*") || raw.businessNumber.includes("*")) {
    return {
      ok: false,
      message: "마스킹된 기존 값은 그대로 저장할 수 없습니다. 새 값을 입력해주세요.",
    };
  }

  const parsed = payoutInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map((p) => String(p)).join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "입력값을 확인해주세요.", fieldErrors };
  }

  const supabase = createClient(await cookies());

  // 1. 평문 → enc bytea 변환 (각 필드 RPC 호출).
  let residentEnc: Uint8Array | null;
  let bankEnc: Uint8Array | null;
  let businessEnc: Uint8Array | null;
  let rateEnc: Uint8Array | null;

  try {
    const bankBundle = packBankBundle(parsed.data.bankName, parsed.data.bankAccount, parsed.data.accountHolder);
    [residentEnc, bankEnc, businessEnc, rateEnc] = await Promise.all([
      encryptPayoutField(supabase, parsed.data.residentNumber),
      encryptPayoutField(supabase, bankBundle),
      encryptPayoutField(
        supabase,
        parsed.data.businessNumber && parsed.data.businessNumber.length > 0 ? parsed.data.businessNumber : null,
      ),
      encryptPayoutField(supabase, parsed.data.withholdingTaxRate),
    ]);
  } catch (e) {
    return {
      ok: false,
      message: (e as Error).message || "암호화에 실패했습니다.",
    };
  }

  // 2. instructors row UPDATE.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("instructors")
    .update({
      resident_number_enc: residentEnc ? toPgByteaParam(residentEnc) : null,
      bank_account_enc: bankEnc ? toPgByteaParam(bankEnc) : null,
      business_number_enc: businessEnc ? toPgByteaParam(businessEnc) : null,
      withholding_tax_rate_enc: rateEnc ? toPgByteaParam(rateEnc) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", me.instructorId);

  if (error) {
    return {
      ok: false,
      message: `저장 실패: ${error.message}`,
    };
  }

  revalidatePath("/me/settings/payout");
  revalidatePath("/me/settings");
  return { ok: true, message: "저장되었습니다." };
}

/** Uint8Array → Postgres bytea hex literal (`\x...`) — Supabase JS update 용. */
function toPgByteaParam(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes).toString("hex")}`;
}
