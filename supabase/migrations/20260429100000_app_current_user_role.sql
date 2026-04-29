-- SPEC-RECEIPT-001 M1 — app.current_user_role() RLS helper
-- @MX:NOTE: 프로젝트 표준 RLS helper — auth.jwt()->>'role' 의존 제거.
-- @MX:REASON: JWT custom hook 미설정 환경에서 안전하게 role 검증 가능.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION app.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION app.current_user_role() TO service_role;
