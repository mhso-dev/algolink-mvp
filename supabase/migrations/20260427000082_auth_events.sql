-- SPEC-AUTH-001 M4 — 인증 감사 로그 (REQ-AUTH-OBS-001 ~ REQ-AUTH-OBS-006).
-- 9종 이벤트만 허용. INSERT는 service role 또는 SECURITY DEFINER 함수 경유.

CREATE TABLE public.auth_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email       text,
  event_type  text        NOT NULL CHECK (event_type IN (
    'login_success',
    'login_failure',
    'logout',
    'password_reset_requested',
    'password_reset_completed',
    'password_changed',
    'invitation_issued',
    'invitation_accepted',
    'invitation_revoked'
  )),
  ip_address  inet,
  user_agent  text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_events_user_id    ON public.auth_events (user_id);
CREATE INDEX idx_auth_events_event_type ON public.auth_events (event_type);
CREATE INDEX idx_auth_events_created_at ON public.auth_events (created_at DESC);

-- ===========================================
-- RLS
-- ===========================================
ALTER TABLE public.auth_events ENABLE  ROW LEVEL SECURITY;
ALTER TABLE public.auth_events FORCE   ROW LEVEL SECURITY;

-- admin: 전체 SELECT.
CREATE POLICY auth_events_admin_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (app.is_admin());

-- 본인: 본인 이벤트만 SELECT (REQ-AUTH-OBS-004).
CREATE POLICY auth_events_self_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT 정책 부재 → authenticated/anon은 직접 INSERT 불가.
-- service role client (logAuthEvent helper) 또는 SECURITY DEFINER 함수만 기록.

GRANT SELECT ON public.auth_events TO authenticated;
-- INSERT/UPDATE/DELETE는 service_role에만 (Supabase 기본 grant + RLS bypass).
