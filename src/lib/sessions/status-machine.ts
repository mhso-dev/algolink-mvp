// @MX:ANCHOR: SPEC-PAYOUT-002 §M3 REQ-PAYOUT002-SESSIONS-005 — lecture_session 상태 전환 검증.
// @MX:REASON: completed/canceled/rescheduled 세션은 freeze. 위반 시 정산 무결성 손상.
// @MX:SPEC: SPEC-PAYOUT-002

import { SESSION_ERRORS } from "./errors";
import {
  LECTURE_SESSION_STATUSES,
  type LectureSessionStatus,
} from "./types";

/**
 * 허용된 상태 전환 그래프 (REQ-PAYOUT002-SESSIONS-005, REQ-PAYOUT002-EXCEPT-005).
 *
 * - `planned`만 다른 상태로 전환 가능
 * - `completed` / `canceled` / `rescheduled`는 모두 동결 (freeze)
 *
 * 4-state × 4-state = 16조합 중 3조합만 ALLOW, 나머지 13조합은 REJECT.
 */
export const ALLOWED_SESSION_TRANSITIONS: Record<
  LectureSessionStatus,
  readonly LectureSessionStatus[]
> = {
  planned: ["completed", "canceled", "rescheduled"],
  completed: [], // freeze
  canceled: [], // freeze
  rescheduled: [], // freeze
};

export type SessionTransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 상태 전환 사전 검증.
 *
 * - 같은 상태로의 전환 → 거부
 * - graph 외 전환 → STATUS_FROZEN 거부
 *
 * @param from - 현재 상태
 * @param to   - 변경하려는 상태
 */
export function validateSessionTransition(
  from: LectureSessionStatus,
  to: LectureSessionStatus,
): SessionTransitionResult {
  if (from === to) {
    return { ok: false, reason: SESSION_ERRORS.STATUS_FROZEN };
  }
  const allowed = ALLOWED_SESSION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: SESSION_ERRORS.STATUS_FROZEN };
  }
  return { ok: true };
}

/** 모든 가능한 (from, to) 페어 — 단위 테스트의 16조합 검증용. */
export function allSessionTransitionPairs(): Array<
  [LectureSessionStatus, LectureSessionStatus]
> {
  const pairs: Array<[LectureSessionStatus, LectureSessionStatus]> = [];
  for (const from of LECTURE_SESSION_STATUSES) {
    for (const to of LECTURE_SESSION_STATUSES) {
      pairs.push([from, to]);
    }
  }
  return pairs;
}
