"use server";

// SPEC-RECEIPT-001 §M4 REQ-RECEIPT-INSTRUCTOR-004 — 강사 송금 등록 Server Action.
// @MX:ANCHOR: pending → requested 전환 + client_payout_amount_krw UPDATE + 첨부 파일 업로드.
// @MX:REASON: client_direct 흐름의 강사 측 단일 통로. fan_in 1 (UI form).
// @MX:WARN: instructor_remittance_amount_krw는 SPEC-PAYOUT-002 GENERATE가 owner. read-only 소비.
// @MX:REASON: PAYOUT-002 amendment 미적용 시 NULL → mismatch error로 차단.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import {
  validateInstructorRemittanceInput,
  computeClientPayoutAmount,
} from "@/lib/payouts/instructor-remittance";
import { buildInstructorRemittanceSchema } from "@/lib/payouts/client-direct-validation";
import { PAYOUT_ERRORS } from "@/lib/payouts/errors";

export interface RemittanceActionResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const NOT_INSTRUCTOR: RemittanceActionResult = {
  ok: false,
  message: "강사 권한이 필요합니다.",
};

const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
]);

export async function registerInstructorRemittance(
  formData: FormData,
): Promise<RemittanceActionResult> {
  const session = await requireUser();
  if (session.role !== "instructor") return NOT_INSTRUCTOR;

  const me = await ensureInstructorRow();
  if (!me) return NOT_INSTRUCTOR;

  const settlementId = String(formData.get("settlementId") ?? "").trim();
  const remittanceDate = String(formData.get("remittanceDate") ?? "").trim();
  const remittanceAmountKrw = Number(formData.get("remittanceAmountKrw") ?? 0);
  const evidenceFile = formData.get("evidenceFile");

  if (!settlementId || !remittanceDate || !Number.isFinite(remittanceAmountKrw)) {
    return { ok: false, message: "입력값을 확인해주세요." };
  }

  const supabase = createClient(await cookies());

  // 1. settlement 조회 (RLS — 본인 것만 SELECT 가능)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settlement, error: fetchErr } = await (supabase as any)
    .from("settlements")
    .select(
      "id, settlement_flow, status, instructor_id, instructor_remittance_amount_krw, instructor_fee_krw, withholding_tax_rate, withholding_tax_amount_krw",
    )
    .eq("id", settlementId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !settlement) {
    return { ok: false, message: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };
  }

  // 본인 강사 정산만 처리
  if (settlement.instructor_id !== me.instructorId) {
    return { ok: false, message: PAYOUT_ERRORS.FORBIDDEN };
  }

  // 2. 사전 검증 (status + flow + amount)
  const validation = validateInstructorRemittanceInput(settlement, {
    settlementId,
    remittanceDate,
    remittanceAmountKrw,
  });
  if (!validation.ok) {
    return { ok: false, message: validation.reason };
  }

  // 3. zod schema (보조 검증)
  const schema = buildInstructorRemittanceSchema(
    settlement.instructor_remittance_amount_krw ?? 0,
  );
  const parsed = schema.safeParse({
    settlementId,
    remittanceDate,
    remittanceAmountKrw,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  // 4. 첨부 파일 (선택)
  let evidenceFileId: string | null = null;
  if (evidenceFile && evidenceFile instanceof File && evidenceFile.size > 0) {
    if (evidenceFile.size > MAX_EVIDENCE_SIZE) {
      return {
        ok: false,
        message: "첨부 파일 크기는 10MB 이하여야 합니다.",
      };
    }
    if (!ALLOWED_EVIDENCE_TYPES.has(evidenceFile.type)) {
      return {
        ok: false,
        message: "PDF 또는 이미지(jpg/png) 파일만 업로드 가능합니다.",
      };
    }
    const ext = evidenceFile.name.split(".").pop()?.toLowerCase() ?? "bin";
    const uniqueId = crypto.randomUUID();
    const storagePath = `${settlementId}/${uniqueId}.${ext}`;
    const arrayBuffer = await evidenceFile.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadErr } = await supabase.storage
      .from("payout-evidence")
      .upload(storagePath, buffer, {
        contentType: evidenceFile.type,
      });
    if (uploadErr) {
      console.error("[remit] evidence upload failed", uploadErr);
      return { ok: false, message: "첨부 파일 업로드에 실패했습니다." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fileRow, error: fileErr } = await (supabase as any)
      .from("files")
      .insert({
        storage_path: storagePath,
        mime_type: evidenceFile.type,
        size_bytes: evidenceFile.size,
        owner_id: session.id,
      })
      .select("id")
      .single();
    if (fileErr || !fileRow) {
      // 보상 cleanup
      await supabase.storage.from("payout-evidence").remove([storagePath]);
      return { ok: false, message: "첨부 파일 메타 저장에 실패했습니다." };
    }
    evidenceFileId = fileRow.id as string;
  }

  // 5. settlements UPDATE (status pending → requested + client_payout_amount_krw)
  const clientPayoutAmount = computeClientPayoutAmount(settlement);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (supabase as any)
    .from("settlements")
    .update({
      status: "requested",
      client_payout_amount_krw: clientPayoutAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId)
    .eq("status", "pending")
    .eq("settlement_flow", "client_direct")
    .select("id");

  if (updateErr) {
    console.error("[remit] update failed", updateErr);
    return { ok: false, message: PAYOUT_ERRORS.GENERIC_FAILED };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, message: PAYOUT_ERRORS.STALE_TRANSITION };
  }

  // evidenceFileId는 현재 settlements와 직접 연결하지 않음 — files 행만 보관 (감사용).
  // 추후 SPEC에서 settlement_evidence_files junction 추가 가능.
  void evidenceFileId;

  revalidatePath("/me/settlements");
  revalidatePath(`/me/settlements/${settlementId}`);
  return { ok: true };
}
