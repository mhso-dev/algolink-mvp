"use server";

// SPEC-PAYOUT-001 §2.5 REQ-PAYOUT-MAIL-001 — 1-클릭 정산 요청 Server Action.
// 흐름: requireRole → fetchSettlement → validateTransition → atomic UPDATE → mail-stub →
//       (실패 시) 보상 UPDATE 로 status 롤백 → revalidatePath.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  PAYOUT_ERRORS,
  validateTransition,
  getSettlement,
  transitionSettlementStatus,
  sendSettlementRequestStub,
} from "@/lib/payouts";

export interface RequestSettlementResult {
  ok: boolean;
  error?: string;
}

export async function requestSettlement(
  settlementId: string,
): Promise<RequestSettlementResult> {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const settlement = await getSettlement(supabase, settlementId);
  if (!settlement) return { ok: false, error: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };

  const verdict = validateTransition(settlement.status, "requested");
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  // 1) status atomic UPDATE — trigger 가 자동 history 기록.
  const updated = await transitionSettlementStatus(supabase, {
    id: settlementId,
    expectedFrom: settlement.status,
    to: "requested",
  });
  if (!updated.ok) {
    return { ok: false, error: updated.error ?? PAYOUT_ERRORS.GENERIC_FAILED };
  }

  // 2) project title 조회 (mail body 용).
  const { data: project } = await supabase
    .from("projects")
    .select("title")
    .eq("id", settlement.project_id)
    .maybeSingle();
  const projectTitle = (project as { title?: string } | null)?.title ?? "프로젝트";

  // 3) 알림 발송. 실패 시 status 롤백 (보상 UPDATE).
  const mail = await sendSettlementRequestStub(supabase, {
    settlementId,
    instructorId: settlement.instructor_id,
    projectTitle,
    amounts: {
      businessKrw: settlement.business_amount_krw,
      feeKrw: settlement.instructor_fee_krw,
      profitKrw: settlement.profit_krw ?? 0,
      taxKrw: settlement.withholding_tax_amount_krw ?? 0,
    },
  });
  if (!mail.ok) {
    // 보상 트랜잭션 — Supabase JS 는 multi-statement TX 미지원이므로 수동 롤백.
    await transitionSettlementStatus(supabase, {
      id: settlementId,
      expectedFrom: "requested",
      to: settlement.status,
    });
    return { ok: false, error: mail.error ?? PAYOUT_ERRORS.MAIL_STUB_FAILED };
  }

  revalidatePath("/settlements");
  revalidatePath(`/settlements/${settlementId}`);
  return { ok: true };
}
