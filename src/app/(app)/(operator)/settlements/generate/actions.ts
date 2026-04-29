// SPEC-PAYOUT-002 §M5 REQ-PAYOUT002-GENERATE-003 — operator 정산 일괄 생성 Server Action.
// REQ-PAYOUT002-RLS-003/-004 — user-scoped Supabase server client + role guard.

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  generateSettlementsForPeriod,
  type GenerateInput,
} from "@/lib/payouts/generate";
import { SETTLEMENT_FLOWS, type SettlementFlow } from "@/lib/payouts/types";

const periodSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  project_ids: z.array(z.string()).optional(),
  flow_overrides: z
    .record(z.string(), z.enum(SETTLEMENT_FLOWS))
    .optional(),
  tax_rate_overrides: z.record(z.string(), z.number()).optional(),
});

export interface GenerateActionState {
  ok: boolean;
  error?: string;
  createdCount?: number;
  linkedCount?: number;
  redirectTo?: string;
}

/**
 * 정산 일괄 생성 Server Action (REQ-PAYOUT002-GENERATE-003 / -007).
 *
 * 흐름:
 *   1) requireRole(['operator', 'admin']) — RLS 가드 (silent redirect)
 *   2) zod 입력 검증 → invalid면 한국어 에러 반환
 *   3) generateSettlementsForPeriod 호출
 *   4) 성공 시 revalidate + redirect to /settlements?period=...
 */
export async function generateSettlementsAction(
  _prev: GenerateActionState | undefined,
  formData: FormData,
): Promise<GenerateActionState> {
  await requireRole(["operator", "admin"]);

  const raw = {
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    project_ids: formData.getAll("project_ids").filter((v): v is string => typeof v === "string"),
    flow_overrides: parseRecord(formData, "flow_overrides_") as
      | Record<string, SettlementFlow>
      | undefined,
    tax_rate_overrides: parseNumberRecord(formData, "tax_rate_overrides_"),
  };

  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }

  const supabase = createClient(await cookies());
  const input: GenerateInput = {
    periodStart: parsed.data.period_start,
    periodEnd: parsed.data.period_end,
    projectIds: parsed.data.project_ids?.length ? parsed.data.project_ids : undefined,
    flowOverrides: parsed.data.flow_overrides,
    taxRateOverrides: parsed.data.tax_rate_overrides,
  };

  const result = await generateSettlementsForPeriod(supabase, input);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "정산 생성 중 오류가 발생했습니다.",
    };
  }

  // SPEC-PAYOUT-001 리스트 페이지로 리다이렉트 (REQ-GENERATE-007)
  const periodParam = parsed.data.period_start.slice(0, 7); // YYYY-MM
  revalidatePath("/settlements");
  redirect(`/settlements?period=${periodParam}`);
}

function parseRecord(formData: FormData, prefix: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === "string" && value.length > 0) {
      out[key.slice(prefix.length)] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseNumberRecord(
  formData: FormData,
  prefix: string,
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === "string" && value.length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key.slice(prefix.length)] = n;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
