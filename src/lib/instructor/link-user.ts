// SPEC-INSTRUCTOR-001 §5.5 REQ-INSTRUCTOR-CREATE-007 + SPEC-AUTH-001 v1.1
// instructors.user_id 자동 매핑 — accept-invite/set-password 흐름에서 호출.
//
// 신뢰 모델:
// - email 은 Supabase invite 링크 클릭으로 검증된 신뢰 소스.
// - raw_user_meta_data 는 사용자 수정 가능하므로 사용 금지 (spec §5.5).
// - role === "instructor" 일 때만 매핑 시도 (다른 역할은 instructors 테이블과 무관).
//
// 멱등성:
// - WHERE user_id IS NULL 조건으로 이미 매핑된 행은 건드리지 않음.
// - 매칭 강사 0명이면 정상 (강사가 아닌 역할이거나 강사 행이 사전에 삭제됨).

export type LinkUserInput = {
  email: string;
  authUserId: string;
  role: string;
};

export type LinkUserDecision =
  | { action: "skip"; reason: "non_instructor_role" | "missing_email" | "missing_user_id" }
  | { action: "update"; email: string; authUserId: string };

/**
 * 매핑을 시도해야 하는지 결정한다.
 * 순수 함수 — 테스트 가능. DB 호출은 호출자에서.
 */
export function decideUserIdMapping(input: LinkUserInput): LinkUserDecision {
  if (!input.authUserId) {
    return { action: "skip", reason: "missing_user_id" };
  }
  if (!input.email) {
    return { action: "skip", reason: "missing_email" };
  }
  if (input.role !== "instructor") {
    return { action: "skip", reason: "non_instructor_role" };
  }
  return {
    action: "update",
    email: input.email,
    authUserId: input.authUserId,
  };
}

// 매핑 결과 (DB 호출 후 호출자가 보고).
export type LinkUserResult =
  | { ok: true; matched: number; skipped?: undefined }
  | { ok: true; matched: 0; skipped: LinkUserDecision & { action: "skip" } }
  | { ok: false; error: string };

/**
 * Admin client interface — DB UPDATE 만 추상화.
 * 실제 호출자는 createServiceSupabase() 결과를 그대로 전달.
 */
export type AdminUpdateClient = {
  updateInstructorUserIdByEmail: (
    email: string,
    authUserId: string,
  ) => Promise<{ matched: number; error: string | null }>;
};

/**
 * 결정 → DB UPDATE 호출 → 결과 보고.
 * Supabase 의존성을 호출자에서 주입받아 단위 테스트 가능.
 */
export async function linkInstructorUser(
  input: LinkUserInput,
  client: AdminUpdateClient,
): Promise<LinkUserResult> {
  const decision = decideUserIdMapping(input);
  if (decision.action === "skip") {
    return { ok: true, matched: 0, skipped: decision };
  }
  const { matched, error } = await client.updateInstructorUserIdByEmail(
    decision.email,
    decision.authUserId,
  );
  if (error) {
    return { ok: false, error };
  }
  return { ok: true, matched };
}
