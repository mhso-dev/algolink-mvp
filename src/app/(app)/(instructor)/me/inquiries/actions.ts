"use server";

// @MX:NOTE: SPEC-CONFIRM-001 §M3 — `respondToInquiry` — 사전 가용성 문의 응답.
// @MX:SPEC: SPEC-CONFIRM-001
// REQ-CONFIRM-EFFECTS-002 — 사전 가용성 문의 수락 흐름 (schedule 미생성).
// proposal_inquiries.status 역방향 전환(accepted → pending) 포함.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  RESPONSE_ERRORS,
  isWithinChangeWindow,
  mapResponseToNotificationType,
  respondToInquiryInputSchema,
  truncateForNotificationBody,
  validateStatusTransition,
  type ResponseActionResult,
  type ResponseStatus,
} from "@/lib/responses";
import {
  getExistingResponseForInquiry,
  getSelfInstructorId,
} from "@/lib/responses/queries";

const NOTIF_LOG_PREFIX = "[notif]";

interface InquiryRow {
  id: string;
  proposal_id: string | null;
  status: string;
  operator_id: string | null;
  instructor_id: string;
}

/**
 * 사전 가용성 문의 응답 — schedule_items 미생성 (수주 미확정 단계).
 */
export async function respondToInquiry(input: {
  inquiryId: string;
  status: ResponseStatus;
  conditionalNote?: string | null;
}): Promise<ResponseActionResult> {
  const user = await requireRole("instructor");
  const parsed = respondToInquiryInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: issue?.message ?? RESPONSE_ERRORS.VALIDATION,
    };
  }
  const { inquiryId, status, conditionalNote } = parsed.data;

  const instructorId = await getSelfInstructorId(user.id);
  if (!instructorId) {
    return { ok: false, reason: RESPONSE_ERRORS.UNAUTHORIZED };
  }

  const supabase = createClient(await cookies());

  // proposal_inquiries 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inquiryData, error: iErr } = await (supabase as any)
    .from("proposal_inquiries")
    .select("id, proposal_id, status, operator_id, instructor_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (iErr || !inquiryData) {
    return { ok: false, reason: RESPONSE_ERRORS.NOT_FOUND };
  }
  const inquiry = inquiryData as InquiryRow;
  if (inquiry.instructor_id !== instructorId) {
    return { ok: false, reason: RESPONSE_ERRORS.NOT_OWN_RESPONSE };
  }

  // 기존 응답
  const existing = await getExistingResponseForInquiry(inquiryId, instructorId);
  const fromStatus = existing?.status ?? null;
  const respondedAt = existing?.responded_at
    ? new Date(existing.responded_at)
    : null;

  const transition = validateStatusTransition(fromStatus, status);
  if (!transition.ok) {
    return { ok: false, reason: transition.reason };
  }
  if (existing && !isWithinChangeWindow(respondedAt)) {
    return { ok: false, reason: RESPONSE_ERRORS.WINDOW_EXPIRED };
  }

  // INSERT or UPDATE (idempotent via partial UNIQUE)
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("instructor_responses")
      .update({
        status,
        conditional_note: conditionalNote ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq("proposal_inquiry_id", inquiryId)
      .eq("instructor_id", instructorId);
    if (error) {
      console.error("[respondToInquiry] update failed", error);
      return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("instructor_responses").insert({
      source_kind: "proposal_inquiry",
      project_id: null,
      proposal_inquiry_id: inquiryId,
      instructor_id: instructorId,
      status,
      conditional_note: conditionalNote ?? null,
    });
    if (error) {
      console.error("[respondToInquiry] insert failed", error);
      return { ok: false, reason: RESPONSE_ERRORS.GENERIC_FAILURE };
    }
  }

  // proposal_inquiries.status UPDATE
  let nextInquiryStatus: string;
  if (status === "accepted") nextInquiryStatus = "accepted";
  else if (status === "declined") nextInquiryStatus = "declined";
  else nextInquiryStatus = "conditional";

  // 다운그레이드(accepted → declined/conditional) 시 'pending'으로 복구
  if (existing && existing.status === "accepted" && status !== "accepted") {
    nextInquiryStatus = "pending";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: piErr } = await (supabase as any)
    .from("proposal_inquiries")
    .update({ status: nextInquiryStatus })
    .eq("id", inquiryId);
  if (piErr) {
    console.error("[respondToInquiry] proposal_inquiries update failed", piErr);
    // 비차단 — 응답 자체는 commit 보존
  }

  // notifications INSERT (HIGH-3 idempotency)
  await insertNotificationIdempotent({
    recipientId: inquiry.operator_id,
    notifType: mapResponseToNotificationType("proposal_inquiry", status),
    sourceKind: "proposal_inquiry",
    sourceId: inquiryId,
    title: `강사 응답: 사전 문의 ${
      status === "accepted" ? "수락" : status === "declined" ? "거절" : "조건부"
    }`,
    body: buildInquiryBody({ status, conditionalNote: conditionalNote ?? null }),
    linkUrl: inquiry.proposal_id ? `/proposals/${inquiry.proposal_id}` : "/proposals",
    logContext: `operator_id=${inquiry.operator_id ?? "unknown"} proposal_id=${inquiry.proposal_id ?? "unknown"} source_id=${inquiryId}`,
  });

  // accept→decline 다운그레이드 audit
  if (existing && existing.status === "accepted" && status !== "accepted") {
    console.warn(
      `[response:downgrade] proposal_inquiry_id=${inquiryId} instructor_id=${instructorId} from=accepted to=${status}`,
    );
  }

  revalidatePath("/me/inquiries");
  return { ok: true };
}

async function insertNotificationIdempotent(args: {
  recipientId: string | null;
  notifType:
    | "assignment_accepted"
    | "assignment_declined"
    | "inquiry_accepted"
    | "inquiry_declined"
    | "inquiry_conditional";
  sourceKind: "assignment_request" | "proposal_inquiry";
  sourceId: string;
  title: string;
  body: string;
  linkUrl: string;
  logContext: string;
}): Promise<void> {
  const {
    recipientId,
    notifType,
    sourceKind,
    sourceId,
    title,
    body,
    linkUrl,
    logContext,
  } = args;

  if (!recipientId) {
    console.warn(
      `[notif:skip] ${notifType} → recipient unresolved source_id=${sourceId}`,
    );
    return;
  }

  const supabase = createClient(await cookies());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("notifications").upsert(
    {
      recipient_id: recipientId,
      type: notifType,
      title,
      body: truncateForNotificationBody(body),
      link_url: linkUrl,
      source_kind: sourceKind,
      source_id: sourceId,
    },
    {
      onConflict: "recipient_id,source_kind,source_id,type",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    console.error("[notif] insert failed", { type: notifType, error });
    return;
  }
  console.log(`${NOTIF_LOG_PREFIX} ${notifType} → ${logContext}`);
}

function buildInquiryBody(args: {
  status: ResponseStatus;
  conditionalNote: string | null;
}): string {
  if (args.status === "accepted") return "강사가 사전 문의를 수락하였습니다.";
  if (args.status === "declined") return "강사가 사전 문의를 거절하였습니다.";
  // conditional
  const head = "[조건부] 강사가 사전 문의에 조건부 응답하였습니다.";
  if (args.conditionalNote) return `${head}\n${args.conditionalNote}`;
  return head;
}
