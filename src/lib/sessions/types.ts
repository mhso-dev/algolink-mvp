// SPEC-PAYOUT-002 §M3 — lecture_sessions 도메인 타입 단일 출처.
// REQ-PAYOUT002-SESSIONS-001/002

/** 4-state 강의 세션 상태 (REQ-PAYOUT002-SESSIONS-002). */
export const LECTURE_SESSION_STATUSES = [
  "planned",
  "completed",
  "canceled",
  "rescheduled",
] as const;
export type LectureSessionStatus = (typeof LECTURE_SESSION_STATUSES)[number];

/** 한국어 라벨 (UI 배지/badge 텍스트). */
export const LECTURE_SESSION_STATUS_LABEL: Record<LectureSessionStatus, string> = {
  planned: "예정",
  completed: "완료",
  canceled: "취소",
  rescheduled: "일정변경",
};

/** Badge variant 매핑 (semantic UI palette). */
export function lectureSessionStatusBadgeVariant(
  status: LectureSessionStatus | string,
): "info" | "settled" | "alert" | "pending" | "secondary" {
  return (
    {
      planned: "info",
      completed: "settled",
      canceled: "alert",
      rescheduled: "pending",
    } as const
  )[status as LectureSessionStatus] ?? "secondary";
}

/**
 * lecture_sessions DB 행 직렬화 타입.
 * Drizzle/Postgres가 `numeric`을 string으로 직렬화하므로 hours는 number | string 모두 허용.
 */
export interface LectureSession {
  id: string;
  project_id: string;
  instructor_id: string | null;
  date: string; // YYYY-MM-DD
  hours: number | string;
  status: LectureSessionStatus;
  original_session_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** 폼 제출용 INSERT/UPDATE 페이로드. status는 default 'planned'. */
export interface SessionInput {
  /** 기존 행 매칭용. 없으면 INSERT, 있으면 UPDATE. */
  id?: string;
  project_id: string;
  instructor_id: string | null;
  date: string; // YYYY-MM-DD
  hours: number;
  status?: LectureSessionStatus;
  original_session_id?: string | null;
  notes?: string | null;
}
