// @MX:ANCHOR: SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-INQUIRY-003 — 사전 강사 문의 도메인 빌더.
// @MX:REASON: dispatch Server Action이 본 모듈 호출. fan_in 높음.
// @MX:WARN: 중복 (proposalId, instructorId) 검출은 본 함수에서 1차, DB unique 제약이 2차.
// @MX:REASON: 클라이언트 측 단일 호출 내 중복도 거부 — Server Action 진입 전 정상화.
// @MX:SPEC: SPEC-PROPOSAL-001
import type {
  InquiryDispatchInput,
  InquiryRecordToInsert,
} from "./types";

/**
 * 디스패치 입력 → DB INSERT 페이로드 N개 생성 (REQ-PROPOSAL-INQUIRY-003).
 *
 * 순수 함수 — Drizzle/Supabase 의존 0건. 사이드 이펙트 0건.
 *
 * @throws Error("instructorIds duplicate detected") — 같은 호출 내 중복 ID 검출 시.
 *   호출 측이 catch하여 한국어 에러로 변환.
 */
export function buildInquiryRecords(
  input: InquiryDispatchInput,
): InquiryRecordToInsert[] {
  const { proposalId, operatorId, instructorIds, proposedTimeSlotStart, proposedTimeSlotEnd, questionNote } = input;

  // 클라이언트 측 중복 검출 (DB UNIQUE 제약 보다 일찍)
  const seen = new Set<string>();
  for (const id of instructorIds) {
    if (seen.has(id)) {
      throw new Error("instructorIds duplicate detected");
    }
    seen.add(id);
  }

  return instructorIds.map((instructorId) => ({
    proposalId,
    operatorId: operatorId ?? null,
    instructorId,
    proposedTimeSlotStart: proposedTimeSlotStart ?? null,
    proposedTimeSlotEnd: proposedTimeSlotEnd ?? null,
    questionNote: questionNote ?? null,
  }));
}

/** notification 본문 빌더 (REQ-PROPOSAL-INQUIRY-003). 한국어. */
export function buildInquiryNotificationPayload(args: {
  proposalTitle: string;
  proposedTimeSlotStart: string | null;
  proposedTimeSlotEnd: string | null;
  inquiryId: string;
}): { title: string; body: string; linkUrl: string } {
  const { proposalTitle, proposedTimeSlotStart, proposedTimeSlotEnd, inquiryId } = args;
  let body: string;
  if (proposedTimeSlotStart && proposedTimeSlotEnd) {
    body = `${proposalTitle} 강의 가능 여부 사전 문의 (${proposedTimeSlotStart} ~ ${proposedTimeSlotEnd})`;
  } else {
    body = `${proposalTitle} 강의 가능 여부 사전 문의`;
  }
  return {
    title: `${proposalTitle} 강의 가능 여부 사전 문의`,
    body,
    linkUrl: `/me/inquiries/${inquiryId}`,
  };
}

/** console.log 디스패치 메시지 빌더 (REQ-PROPOSAL-INQUIRY-003). */
export function formatInquiryDispatchLog(
  instructorId: string,
  proposalId: string,
): string {
  return `[notif] inquiry_request → instructor_id=${instructorId} proposal_id=${proposalId}`;
}
