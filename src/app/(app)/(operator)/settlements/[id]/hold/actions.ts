"use server";

// SPEC-PAYOUT-001 §2.3 REQ-PAYOUT-STATUS-006 — 보류 토글 Server Action.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  PAYOUT_ERRORS,
  validateTransition,
  getSettlement,
  holdSettlement as holdQuery,
  resumeSettlement as resumeQuery,
} from "@/lib/payouts";

export interface HoldResult {
  ok: boolean;
  error?: string;
}

export async function holdSettlement(input: {
  settlementId: string;
  notes?: string;
}): Promise<HoldResult> {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const settlement = await getSettlement(supabase, input.settlementId);
  if (!settlement) return { ok: false, error: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };

  const verdict = validateTransition(settlement.status, "held");
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const updated = await holdQuery(supabase, {
    id: input.settlementId,
    from: settlement.status,
    notes: input.notes,
  });
  if (!updated.ok) {
    return { ok: false, error: updated.error ?? PAYOUT_ERRORS.GENERIC_FAILED };
  }

  revalidatePath("/settlements");
  revalidatePath(`/settlements/${input.settlementId}`);
  return { ok: true };
}

export async function resumeSettlement(
  settlementId: string,
): Promise<HoldResult> {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const settlement = await getSettlement(supabase, settlementId);
  if (!settlement) return { ok: false, error: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };

  const verdict = validateTransition(settlement.status, "requested");
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  const updated = await resumeQuery(supabase, settlementId);
  if (!updated.ok) {
    return { ok: false, error: updated.error ?? PAYOUT_ERRORS.GENERIC_FAILED };
  }

  revalidatePath("/settlements");
  revalidatePath(`/settlements/${settlementId}`);
  return { ok: true };
}
