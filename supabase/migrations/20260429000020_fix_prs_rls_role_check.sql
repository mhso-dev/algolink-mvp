-- Hotfix: project_required_skills.prs_operator_admin_all 정책 권한 체크 버그 수정.
--
-- 발견 시점: 2026-04-29 SPEC-SKILL-ABSTRACT-001 production 검증 중.
-- 도입 시점: SPEC-PROJECT-001 commit 72b0f64 (_20260427000090_project_required_skills.sql).
--
-- 버그 원인:
--   기존 정책의 USING/WITH CHECK 절이 다음과 같이 작성됨 ─
--     coalesce((auth.jwt() ->> 'role'),
--              (auth.jwt() -> 'app_metadata' ->> 'role')) IN ('operator', 'admin')
--   PostgREST가 발급하는 JWT의 top-level 'role' 클레임은 항상 DB role 'authenticated'
--   이므로, COALESCE의 첫 번째 인자가 비어있지 않은 'authenticated' 문자열로 해석되어
--   IN ('operator', 'admin') 비교는 영구적으로 false 가 된다.
--   → 운영자/관리자 세션이 project_required_skills INSERT/SELECT 모두 차단되어
--     추천 엔진의 requiredSkillIds = [] 가 되어 candidate 검색이 SKIP 된다.
--
-- 수정 방법:
--   _20260427000060_rls_policies.sql 에 이미 정의된 헬퍼 함수
--   app.is_operator_or_admin() 를 사용한다 (다른 정책들과 동일 패턴).
--   헬퍼는 app.current_role() (custom_access_token_hook 가공된 role 클레임)을 사용하므로
--   안전하게 admin/operator 매칭이 가능하다.

DROP POLICY IF EXISTS prs_operator_admin_all ON public.project_required_skills;

CREATE POLICY prs_operator_admin_all
  ON public.project_required_skills
  FOR ALL
  TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

COMMENT ON POLICY prs_operator_admin_all ON public.project_required_skills IS
  'SPEC-SKILL-ABSTRACT-001 production 검증 중 발견된 RLS 버그 수정. 헬퍼 app.is_operator_or_admin() 사용으로 다른 정책들과 패턴 통일. 본 SPEC-PROJECT-001 잠재 버그를 _20260429000020_ 핫픽스로 정정.';
