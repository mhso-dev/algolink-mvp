-- SPEC-AUTH-001 M4 — Custom Access Token Hook (REQ-AUTH-ROLE-002 ~ REQ-AUTH-ROLE-006).
-- 액세스 토큰 발급 시 public.users.role을 읽어 claims.role 및 claims.app_metadata.role에 동시 주입.
-- SPEC-DB-001의 app.current_role()이 두 경로 모두 읽도록 설계되어 있음 (000020 참조).

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
  -- 페일세이프: 어떤 예외가 발생하든 원본 event를 그대로 반환해
  -- 인증 자체가 차단되지 않도록 한다 (REQ-AUTH-ROLE-006, plan.md R11).
  v_user_id := (event ->> 'user_id')::uuid;

  IF v_user_id IS NULL THEN
    RETURN event;
  END IF;

  SELECT u.role
    INTO v_role
    FROM public.users u
   WHERE u.id = v_user_id;

  -- users row 미존재 (초대 수락 race condition) → 원본 event 반환.
  IF v_role IS NULL THEN
    RETURN event;
  END IF;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  -- claims.app_metadata.role 갱신 (기존 키 보존).
  v_app_meta := jsonb_set(v_app_meta, '{role}', to_jsonb(v_role::text), true);

  -- claims.role (top-level) + claims.app_metadata 동시 갱신.
  v_claims := jsonb_set(v_claims, '{role}',         to_jsonb(v_role::text), true);
  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_meta,             true);

  RETURN jsonb_set(event, '{claims}', v_claims, true);

EXCEPTION
  WHEN OTHERS THEN
    -- Postgres 로그에는 흔적을 남기되 인증 흐름은 계속 (role claim만 누락).
    RAISE WARNING 'custom_access_token_hook failed for user_id=%: %', v_user_id, SQLERRM;
    RETURN event;
END;
$$;

-- 권한: supabase_auth_admin만 실행 가능 (REQ-AUTH-ROLE-004).
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Hook이 public.users를 읽을 수 있도록 최소 권한 부여 (id, role 컬럼만).
GRANT SELECT (id, role) ON public.users TO supabase_auth_admin;
