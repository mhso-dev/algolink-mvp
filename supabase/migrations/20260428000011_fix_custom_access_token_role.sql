-- SPEC-AUTH-001 — Custom Access Token Hook 회귀 수정.
--
-- 문제:
--   기존 hook(20260427000080)은 claims.role(top-level)을 'admin'/'operator'/'instructor'
--   로 덮어썼다. PostgREST는 JWT의 top-level `role` claim을 보고 PostgreSQL DB role을
--   결정하기 위해 SET ROLE을 시도하므로, 'operator' 등은 DB role로 존재하지 않아
--   모든 RLS 쿼리가 `role "operator" does not exist`로 실패한다.
--
-- 결과적으로 인증 후에도 instructors/projects/clients 등 RLS 보호 테이블이 빈 결과를
-- 반환했다(operator 대시보드 KPI = 0건, 강사 리스트 0명, 프로젝트 0건).
--
-- 수정:
--   비즈니스 role 정보는 claims.app_metadata.role 에만 주입한다. top-level
--   claims.role 은 GoTrue/PostgREST 기본값('authenticated')을 보존하여 PostgREST가
--   정상 DB role로 SET ROLE 할 수 있도록 한다.
--
--   RLS 헬퍼 app.current_role()(20260427000020)은 이미
--     coalesce(auth.jwt()->>'role', auth.jwt()->'app_metadata'->>'role', '')
--   순으로 두 경로 모두 읽으므로, app_metadata 경로만으로도 정상 동작한다.
--   다만 1차 경로가 'authenticated'를 반환하면 fallback이 발화하지 않으므로
--   순서를 뒤집어 app_metadata.role 을 우선시한다.
--
-- REQ: SPEC-AUTH-001 REQ-AUTH-ROLE-002..006

-- @MX:ANCHOR: custom_access_token_hook — JWT 발급 시마다 호출되는 RLS 1차 신뢰 경계.
-- @MX:REASON: Supabase Auth가 access_token을 발급할 때 매번 호출. claims에 무엇을 넣느냐가 모든 RLS 정책의 신뢰 기반.
-- @MX:WARN: jsonb_set으로 claims.role(top-level)을 덮어쓰지 말 것.
-- @MX:REASON: top-level role은 PostgREST 전용 (authenticated/anon/service_role). 여기에 비즈니스 role을 넣으면 SET ROLE 폭발하여 dashboard/instructors/projects 모두 0건으로 회귀. 비즈니스 role은 claims.app_metadata.role에만 주입한다.
-- @MX:SPEC: SPEC-AUTH-001 §5.1
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     uuid;
  v_role        public.user_role;
  v_claims      jsonb;
  v_app_meta    jsonb;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  IF v_user_id IS NULL THEN
    RETURN event;
  END IF;

  SELECT u.role
    INTO v_role
    FROM public.users u
   WHERE u.id = v_user_id;

  IF v_role IS NULL THEN
    RETURN event;
  END IF;

  v_claims   := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  -- claims.app_metadata.role 만 갱신. claims.role(top-level)은 절대 덮어쓰지 않는다.
  -- (PostgREST DB role 영역 — 'instructor'/'operator'/'admin'은 DB role로 존재하지 않음.)
  v_app_meta := jsonb_set(v_app_meta, '{role}', to_jsonb(v_role::text), true);
  v_claims   := jsonb_set(v_claims,   '{app_metadata}', v_app_meta,     true);

  RETURN jsonb_set(event, '{claims}', v_claims, true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'custom_access_token_hook failed for user_id=%: %', v_user_id, SQLERRM;
    RETURN event;
END;
$$;

-- authenticated/anon role이 app schema의 헬퍼 함수(app.is_instructor 등)를 호출할 수
-- 있도록 USAGE 권한 부여. SECURITY DEFINER 함수라도 schema USAGE 권한이 없으면
-- 호출 자체가 'permission denied for schema app'으로 막힌다.
GRANT USAGE ON SCHEMA app TO authenticated, anon;

-- RLS 헬퍼: app_metadata.role 우선, top-level role 폴백.
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (auth.jwt() ->> 'role'),
    ''
  );
$$;
