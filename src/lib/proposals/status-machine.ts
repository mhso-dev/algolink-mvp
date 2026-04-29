// @MX:ANCHOR: SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-ENTITY-004 — 제안서 상태 전환 그래프.
// @MX:REASON: 모든 상태 전환이 본 모듈 통과. 위반 시 영업 KPI / 변환 흐름 무결성 손상.
// @MX:SPEC: SPEC-PROPOSAL-001
import {
  PROPOSAL_STATUSES,
  isFrozenProposalStatus,
  type ProposalStatus,
} from "./types";

/**
 * 제안서 상태 전환 그래프 (REQ-PROPOSAL-ENTITY-004).
 *
 * - draft → submitted (operator-driven, sets submitted_at = now())
 * - draft → withdrawn (operator-driven, sets decided_at = now())
 * - submitted → won (convert action — sets decided_at + converted_project_id)
 * - submitted → lost (operator-driven, sets decided_at = now())
 * - submitted → withdrawn (operator-driven, sets decided_at = now())
 * - won/lost/withdrawn → frozen (no transitions)
 */
export const ALLOWED_PROPOSAL_TRANSITIONS: Record<
  ProposalStatus,
  readonly ProposalStatus[]
> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["won", "lost", "withdrawn"],
  won: [],
  lost: [],
  withdrawn: [],
} as const;

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 전환 검증 (REQ-PROPOSAL-ENTITY-004 / REQ-PROPOSAL-ENTITY-005).
 * 동일 상태로의 전환(`from === to`)도 거부 — UPDATE no-op이 아닌 명시적 의도 표현 강제.
 */
export function validateProposalTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): ValidationResult {
  if (from === to) {
    return { ok: false, reason: "허용되지 않은 상태 전환입니다." };
  }
  const allowed = ALLOWED_PROPOSAL_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: "허용되지 않은 상태 전환입니다." };
  }
  return { ok: true };
}

/**
 * 자동 timestamp 결정 (REQ-PROPOSAL-ENTITY-004 §5.2).
 * 호출 측은 본 함수 결과로 UPDATE payload 구성.
 */
export function timestampUpdatesForTransition(
  to: ProposalStatus,
  now: Date,
): {
  submittedAt?: Date;
  decidedAt?: Date;
} {
  const updates: { submittedAt?: Date; decidedAt?: Date } = {};
  if (to === "submitted") {
    updates.submittedAt = now;
  }
  if (to === "won" || to === "lost" || to === "withdrawn") {
    updates.decidedAt = now;
  }
  return updates;
}

/** Frozen guard — REQ-PROPOSAL-ENTITY-005 (UPDATE 거부) 호출 측 helper. */
export function rejectIfFrozen(status: ProposalStatus): ValidationResult {
  if (isFrozenProposalStatus(status)) {
    return { ok: false, reason: "확정된 제안서는 수정할 수 없습니다." };
  }
  return { ok: true };
}

/** PROPOSAL_STATUSES re-export for callers. */
export { PROPOSAL_STATUSES };
