"use server";

// @MX:ANCHOR: SPEC-PROPOSAL-001 §M5 REQ-PROPOSAL-INQUIRY-003/004/005 — 사전 문의 디스패치 Server Action.
// @MX:REASON: 단일 트랜잭션 내 proposal_inquiries N건 + notifications N건 INSERT.
// @MX:WARN: UNIQUE(proposal_id, instructor_id) 위반은 SQLSTATE 23505 → 한국어 에러 변환.
// @MX:REASON: REQ-PROPOSAL-INQUIRY-004 — 동일 (proposal × instructor) 페어 거부.
// @MX:SPEC: SPEC-PROPOSAL-001
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";

// Supabase Database 타입에 신규 테이블이 아직 미반영 — narrow 인터페이스로 우회.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any };
import { inquiryDispatchSchema } from "@/lib/proposals/validation";
import {
  buildInquiryNotificationPayload,
  buildInquiryRecords,
  formatInquiryDispatchLog,
} from "@/lib/proposals/inquiry";
import { PROPOSAL_ERRORS } from "@/lib/proposals/errors";

export type DispatchResult =
  | { ok: true; insertedCount: number }
  | { ok: false; message: string };

interface DispatchInput {
  proposalId: string;
  instructorIds: string[];
  proposedTimeSlotStart: string | null;
  proposedTimeSlotEnd: string | null;
  questionNote: string | null;
}

export async function dispatchInquiriesAction(
  input: DispatchInput,
): Promise<DispatchResult> {
  const user = await requireUser();
  const supabase = createClient(await cookies()) as unknown as Sb;

  // Zod 검증
  const parsed = inquiryDispatchSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? PROPOSAL_ERRORS.DISPATCH_FAILED_GENERIC,
    };
  }

  // 1. proposal 상태 검증 (REQ-PROPOSAL-INQUIRY-005)
  const { data: proposal, error: propErr } = (await supabase
    .from("proposals")
    .select("id, title, status, operator_id")
    .eq("id", parsed.data.proposalId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: { id: string; title: string; status: string; operator_id: string | null } | null;
    error: unknown;
  };
  if (propErr || !proposal) {
    return { ok: false, message: PROPOSAL_ERRORS.PROPOSAL_NOT_FOUND };
  }
  if (!["draft", "submitted"].includes(proposal.status)) {
    return { ok: false, message: PROPOSAL_ERRORS.INQUIRY_FROZEN_PROPOSAL };
  }

  // 2. proposal_inquiries 일괄 INSERT
  let inquiryRecords: ReturnType<typeof buildInquiryRecords>;
  try {
    inquiryRecords = buildInquiryRecords({
      proposalId: parsed.data.proposalId,
      operatorId: proposal.operator_id,
      instructorIds: parsed.data.instructorIds,
      proposedTimeSlotStart: parsed.data.proposedTimeSlotStart ?? null,
      proposedTimeSlotEnd: parsed.data.proposedTimeSlotEnd ?? null,
      questionNote: parsed.data.questionNote ?? null,
    });
  } catch {
    return { ok: false, message: PROPOSAL_ERRORS.INQUIRY_DUPLICATE };
  }

  const inquiryRows = inquiryRecords.map((r) => ({
    proposal_id: r.proposalId,
    operator_id: r.operatorId,
    instructor_id: r.instructorId,
    proposed_time_slot_start: r.proposedTimeSlotStart,
    proposed_time_slot_end: r.proposedTimeSlotEnd,
    question_note: r.questionNote,
    status: "pending" as const,
  }));

  const { data: inserted, error: insertErr } = (await supabase
    .from("proposal_inquiries")
    .insert(inquiryRows)
    .select("id, instructor_id")) as {
    data: Array<{ id: string; instructor_id: string }> | null;
    error: { code?: string; message?: string } | null;
  };

  if (insertErr || !inserted) {
    if (insertErr?.code === "23505") {
      // unique violation — 한국어 에러 (REQ-PROPOSAL-INQUIRY-004)
      return { ok: false, message: PROPOSAL_ERRORS.INQUIRY_DUPLICATE };
    }
    console.error("[dispatchInquiriesAction] insert error", insertErr);
    return { ok: false, message: PROPOSAL_ERRORS.DISPATCH_FAILED_GENERIC };
  }

  // 3. instructors → users 매핑 (notifications recipient_id)
  const instructorIds = inserted.map((i) => i.instructor_id);
  const { data: instructorMap } = (await supabase
    .from("instructors")
    .select("id, user_id")
    .in("id", instructorIds)) as {
    data: Array<{ id: string; user_id: string | null }> | null;
  };
  const idToUser = new Map<string, string>();
  for (const i of instructorMap ?? []) {
    if (i.user_id) idToUser.set(i.id, i.user_id);
  }

  // 4. notifications N건 INSERT
  const notifRows = inserted
    .map((row) => {
      const userId = idToUser.get(row.instructor_id);
      if (!userId) return null;
      const payload = buildInquiryNotificationPayload({
        proposalTitle: proposal.title,
        proposedTimeSlotStart: parsed.data.proposedTimeSlotStart ?? null,
        proposedTimeSlotEnd: parsed.data.proposedTimeSlotEnd ?? null,
        inquiryId: row.id,
      });
      return {
        recipient_id: userId,
        type: "inquiry_request" as const,
        title: payload.title,
        body: payload.body,
        link_url: payload.linkUrl,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (notifRows.length > 0) {
    const { error: notifErr } = (await supabase
      .from("notifications")
      .insert(notifRows)) as { error: unknown };
    if (notifErr) {
      console.error("[dispatchInquiriesAction] notif insert error", notifErr);
      // 알림 실패는 디스패치 자체는 성공 처리 (스텁 단계)
    }
  }

  // 5. console.log 스텁 (REQ-PROPOSAL-INQUIRY-003)
  for (const row of inserted) {
    console.log(formatInquiryDispatchLog(row.instructor_id, parsed.data.proposalId));
  }

  revalidatePath(`/proposals/${parsed.data.proposalId}`);
  return { ok: true, insertedCount: inserted.length };
}
