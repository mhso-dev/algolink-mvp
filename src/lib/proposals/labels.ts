// SPEC-PROPOSAL-001 — 한국어 라벨 단일 출처.
import type { InquiryStatus, ProposalStatus } from "./types";

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "작성중",
  submitted: "제출됨",
  won: "수주",
  lost: "실주",
  withdrawn: "취소",
};

export const PROPOSAL_STATUS_BADGE_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "outline" | "alert" | "completed" | "proposed"
> = {
  draft: "outline",
  submitted: "proposed",
  won: "completed",
  lost: "alert",
  withdrawn: "outline",
};

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  pending: "대기 중",
  accepted: "수락",
  declined: "거절",
  conditional: "조건부",
};
