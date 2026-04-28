"use server";

// SPEC-PAYOUT-001 §2.3 REQ-PAYOUT-STATUS-005 — 입금확인 Server Action.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  PAYOUT_ERRORS,
  validateTransition,
  getSettlement,
  markPaid as markPaidQuery,
} from "@/lib/payouts";

export interface MarkPaidResult {
  ok: boolean;
  error?: string;
}

export async function markPaid(settlementId: string): Promise<MarkPaidResult> {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const settlement = await getSettlement(supabase, settlementId);
  if (!settlement) return { ok: false, error: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };

  const verdict = validateTransition(settlement.status, "paid");
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const updated = await markPaidQuery(supabase, settlementId);
  if (!updated.ok) {
    return { ok: false, error: updated.error ?? PAYOUT_ERRORS.GENERIC_FAILED };
  }

  revalidatePath("/settlements");
  revalidatePath(`/settlements/${settlementId}`);
  return { ok: true };
}
