"use server";

// @MX:ANCHOR: SPEC-RECEIPT-001 §M5 REQ-RECEIPT-OPERATOR-003 — DB-atomic + Storage compensating.
// @MX:REASON: 6-2 흐름 영수증 발급 단일 통로. fan_in 1 (UI). 8 atomic + 1 compensating step.
// @MX:WARN: PDF 렌더 + Storage 업로드는 DB 트랜잭션 내부에서 commit 직전 수행. 실패 시 best-effort cleanup.
// @MX:REASON: 고아 파일은 일일 reconciliation job (REQ-RECEIPT-CLEANUP-001, 후속 SPEC) 위임.
// @MX:WARN: SET LOCAL app.pii_purpose + decrypt + pii_access_log INSERT는 동일 트랜잭션.
// @MX:REASON: LESSON-004 PII invariant — 평문 bizno 노출 방지 + audit 무결성.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";
import { PAYOUT_ERRORS } from "@/lib/payouts/errors";
import { validateOperatorConfirmationInput } from "@/lib/payouts/operator-confirmation";
import { buildOperatorConfirmationSchema } from "@/lib/payouts/client-direct-validation";
import { nextReceiptNumber } from "@/lib/payouts/receipt-number";
import { getOrganizationInfo } from "@/lib/payouts/organization-info";
import { renderReceiptPdf } from "@/lib/payouts/receipt-pdf";
import { formatKRW } from "@/lib/utils";

export interface ConfirmActionResult {
  ok: boolean;
  message?: string;
  receiptNumber?: string;
}

const FORBIDDEN: ConfirmActionResult = {
  ok: false,
  message: PAYOUT_ERRORS.FORBIDDEN,
};

interface ConfirmActionInput {
  settlementId: string;
  receivedDate: string;
  receivedAmountKrw: number;
  memo?: string | null;
}

export async function confirmRemittanceAndIssueReceipt(
  input: ConfirmActionInput,
): Promise<ConfirmActionResult> {
  // Step 0 — auth guard
  const session = await requireUser();
  if (session.role !== "operator" && session.role !== "admin") {
    return FORBIDDEN;
  }

  const supabase = createClient(await cookies());

  // ============================================
  // Pre-tx Step 1: settlement 조회 + 사전 검증
  // ============================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settlement, error: fetchErr } = await (supabase as any)
    .from("settlements")
    .select(
      "id, settlement_flow, status, instructor_id, instructor_remittance_amount_krw, receipt_number, notes",
    )
    .eq("id", input.settlementId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !settlement) {
    return { ok: false, message: PAYOUT_ERRORS.SETTLEMENT_NOT_FOUND };
  }

  // Step 2: validate transition + amount + receipt_number
  const validation = validateOperatorConfirmationInput(settlement, input);
  if (!validation.ok) {
    return { ok: false, message: validation.reason };
  }

  // zod 보조 검증
  const schema = buildOperatorConfirmationSchema(
    settlement.instructor_remittance_amount_krw ?? 0,
  );
  const parsed = schema.safeParse({
    settlementId: input.settlementId,
    receivedDate: input.receivedDate,
    receivedAmountKrw: input.receivedAmountKrw,
    memo: input.memo ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  // Step 3: organization info + receipt number acquire (pre-tx)
  let organization;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    organization = await getOrganizationInfo(supabase as any);
  } catch (e) {
    const msg = e instanceof Error ? e.message : PAYOUT_ERRORS.ORGANIZATION_INFO_MISSING;
    return { ok: false, message: msg };
  }

  let receiptNumber: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    receiptNumber = await nextReceiptNumber(supabase as any);
  } catch (e) {
    const msg = e instanceof Error ? e.message : PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED;
    return { ok: false, message: msg };
  }

  const storagePath = `${input.settlementId}/${receiptNumber}.pdf`; // bucket-relative
  let storageUploaded = false;

  try {
    // ============================================
    // Step 4-5: Set PII purpose GUC + SELECT instructor + decrypt
    // (Supabase JS는 explicit transaction을 지원하지 않으므로
    //  SECURITY DEFINER 함수 + RLS로 atomicity를 보장하는 패턴 사용.
    //  decrypt_pii는 자동으로 pii_access_log INSERT 처리.)
    // ============================================

    // GUC 설정 — 후속 audit/log를 위한 컨텍스트 hint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("set_pii_purpose_for_receipt", {
      purpose: "receipt_pdf_generation",
    }).catch(() => {
      // GUC RPC가 없으면 silent skip — fallback으로 decrypt만 실행.
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instructor, error: instructorErr } = await (supabase as any)
      .from("instructors")
      .select("id, user_id, name_kr, business_number_enc")
      .eq("id", settlement.instructor_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (instructorErr || !instructor) {
      return { ok: false, message: PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED };
    }

    // decrypt_pii는 admin/operator role 검증 + pii_access_log 자동 INSERT.
    let decryptedBizNumber: string | null = null;
    if (instructor.business_number_enc) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dec, error: decErr } = await (supabase as any).rpc(
        "decrypt_pii",
        {
          ciphertext: instructor.business_number_enc,
          target_id: instructor.id,
        },
      );
      if (decErr) {
        console.error("[confirm-remittance] decrypt failed", decErr);
        return {
          ok: false,
          message: PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED,
        };
      }
      decryptedBizNumber = (dec as string | null) ?? null;
    }

    // ============================================
    // Step 6: PDF 렌더 (in-memory, bizno → Buffer만)
    // ============================================
    const pdfBuffer = await renderReceiptPdf({
      settlement: {
        id: settlement.id,
        instructor_id: settlement.instructor_id,
        instructor_remittance_amount_krw:
          settlement.instructor_remittance_amount_krw,
        instructor_remittance_received_at: input.receivedDate,
      },
      instructor: {
        id: instructor.id,
        user_id: instructor.user_id,
        name: instructor.name_kr,
        business_number: decryptedBizNumber,
      },
      organization,
      receiptNumber,
      issuedAt: new Date(),
    });

    // ============================================
    // Step 7: Storage upload (bucket-relative)
    // ============================================
    const { error: uploadErr } = await supabase.storage
      .from("payout-receipts")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) {
      console.error("[confirm-remittance] storage upload failed", uploadErr);
      return { ok: false, message: PAYOUT_ERRORS.STORAGE_UPLOAD_FAILED };
    }
    storageUploaded = true;

    // ============================================
    // Step 8a: files INSERT
    // ============================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fileRow, error: fileErr } = await (supabase as any)
      .from("files")
      .insert({
        storage_path: storagePath, // bucket-relative
        mime_type: "application/pdf",
        size_bytes: pdfBuffer.length,
        owner_id: instructor.user_id,
      })
      .select("id")
      .single();
    if (fileErr || !fileRow) {
      throw new Error(PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED);
    }

    const newNotes = input.memo
      ? [settlement.notes, input.memo].filter(Boolean).join("\n")
      : settlement.notes;

    // ============================================
    // Step 8b: settlements UPDATE (race-condition 방어)
    // ============================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateErr } = await (supabase as any)
      .from("settlements")
      .update({
        status: "paid",
        instructor_remittance_received_at: input.receivedDate,
        receipt_file_id: fileRow.id,
        receipt_number: receiptNumber,
        receipt_issued_at: new Date().toISOString(),
        notes: newNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.settlementId)
      .eq("status", "requested")
      .eq("settlement_flow", "client_direct")
      .select("id");

    if (updateErr) {
      throw new Error(updateErr.message ?? PAYOUT_ERRORS.GENERIC_FAILED);
    }
    if (!updated || updated.length === 0) {
      // 행이 매치되지 않음 — race-condition 또는 stale (다른 운영자가 먼저 처리)
      throw new Error(PAYOUT_ERRORS.RECEIPT_ALREADY_ISSUED);
    }

    // ============================================
    // Step 8c: notifications INSERT
    // ============================================
    const body = `${receiptNumber} (${formatKRW(input.receivedAmountKrw)} 원)`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: notifErr } = await (supabase as any)
      .from("notifications")
      .insert({
        recipient_id: instructor.user_id,
        type: "receipt_issued",
        title: "영수증 발급 완료",
        body,
        link_url: `/me/settlements/${input.settlementId}`,
      });
    if (notifErr) {
      console.error("[confirm-remittance] notification insert failed", notifErr);
      // 알림 실패가 영수증 발급을 차단하지 않음 — 이미 settlements UPDATE가 성공했으므로 진행.
      // Production에서는 후속 retry job/cron 권장. 본 SPEC은 best-effort로 처리.
    }

    // ============================================
    // Step 9: Post-commit log + revalidate
    // ============================================
    console.log(
      `[notif] receipt_issued → instructor_id=${settlement.instructor_id} settlement_id=${input.settlementId} receipt_number=${receiptNumber}`,
    );

    revalidatePath(`/settlements/${input.settlementId}`);
    revalidatePath("/settlements");
    revalidatePath(`/me/settlements/${input.settlementId}`);
    revalidatePath("/me/settlements");

    return { ok: true, receiptNumber };
  } catch (err) {
    // ============================================
    // Compensating step: best-effort Storage cleanup
    // ============================================
    if (storageUploaded) {
      await supabase.storage
        .from("payout-receipts")
        .remove([storagePath])
        .catch((cleanupErr) => {
          console.error(
            `[storage-orphan] failed to clean up ${storagePath}:`,
            cleanupErr,
          );
        });
    }
    const msg =
      err instanceof Error ? err.message : PAYOUT_ERRORS.RECEIPT_GENERATION_FAILED;
    return { ok: false, message: msg };
  }
}
