// SPEC-NOTIFY-001 §M3 — in-memory rate-limit (lazy 트리거 5분 쿨다운).
// 서버리스 cold start마다 reset되지만 DB dedup 가드가 중복 INSERT 방지.

const lastCheck = new Map<string, number>();

/** 동일 (userId, scope) 조합에 대해 windowMinutes 내 재실행 차단. true 반환 시 실행 가능. */
export function shouldRunCheck(
  userId: string,
  scope: string,
  windowMinutes: number,
): boolean {
  const key = `${userId}::${scope}`;
  const now = Date.now();
  const last = lastCheck.get(key);
  if (last && now - last < windowMinutes * 60 * 1000) {
    return false;
  }
  lastCheck.set(key, now);
  return true;
}

/** 테스트용 — 모든 cooldown 초기화. */
export function resetRateLimit(): void {
  lastCheck.clear();
}
