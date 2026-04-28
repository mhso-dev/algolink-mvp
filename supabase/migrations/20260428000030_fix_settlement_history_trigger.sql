-- Phase 2 e2e 종결 hotfix — settlement status history trigger SECURITY DEFINER.
--
-- 문제:
--   `app.log_settlement_status_change()` 트리거 함수가 SECURITY INVOKER 로 실행되어
--   operator 가 settlements.status 를 UPDATE 할 때 system audit 로그 INSERT 가
--   `settlement_status_history` RLS 정책(operator: SELECT 만 허용)에 의해 차단된다.
--
-- 결과 (재현):
--   `new row violates row-level security policy for table "settlement_status_history"`
--   → 정산 요청 / 입금 확인 / 보류 / 재요청 모든 상태 전환이 silent failure (UPDATE 롤백).
--
-- 수정:
--   SECURITY DEFINER 부여 — 함수 소유자(postgres) 권한으로 audit 로그 INSERT.
--   `auth.uid()` 는 현재 세션 컨텍스트에서 그대로 평가되므로 changed_by 의 추적성은 보존된다.
--
-- 안전성:
--   - settlements UPDATE 자체는 settlements RLS 정책으로 여전히 보호됨.
--   - 본 함수는 트리거에서만 호출되므로 직접 호출 경로 없음.
--   - audit 로그는 system-managed (사용자가 임의 INSERT 불가) — RLS 정책 의도와 부합.
--
-- 관련 SPEC: SPEC-PAYOUT-001 §M5, SPEC-SEED-002 (e2e closure 의존), SPEC-E2E-002.

CREATE OR REPLACE FUNCTION app.log_settlement_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, app, pg_temp
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO settlement_status_history (settlement_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;
