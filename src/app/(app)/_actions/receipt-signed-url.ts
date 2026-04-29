"use server";

// SPEC-RECEIPT-001 §M6 REQ-RECEIPT-RLS-005 — 영수증 PDF signed URL 생성 (1시간 만료).
// @MX:NOTE: server-side만 호출 가능. RLS가 owner_id 매칭을 검증.
// @MX:REASON: unsigned path 클라이언트 노출 차단 + 1시간 만료로 link rot 방어.

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";

interface SignedUrlResult {
  ok: boolean;
  url?: string;
  message?: string;
}

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

export async function getReceiptSignedUrl(
  storagePath: string,
): Promise<SignedUrlResult> {
  const session = await requireUser();
  if (!session) {
    return { ok: false, message: "로그인이 필요합니다." };
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.storage
    .from("payout-receipts")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[receipt-signed-url] create failed", error);
    return { ok: false, message: "다운로드 링크 생성에 실패했습니다." };
  }

  return { ok: true, url: data.signedUrl };
}
