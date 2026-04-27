-- SPEC-AUTH-001 M4 — 초대 테이블 (REQ-AUTH-INVITE-001 ~ REQ-AUTH-INVITE-007).
-- auth.users.raw_user_meta_data는 사용자 수정 가능하므로 invited_role의
-- 신뢰 가능한 출처로 별도 테이블 운영 (spec §5.5 신뢰 모델).

CREATE TABLE public.user_invitations (
  id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text             NOT NULL,
  invited_role  public.user_role NOT NULL,
  invited_by    uuid             NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  auth_user_id  uuid             REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at    timestamptz      NOT NULL DEFAULT (now() + interval '24 hours'),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT user_invitations_status_exclusive
    CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

-- 동일 이메일에 대해 미수락+미취소 초대는 1건만 허용 (중복 발급 방지).
CREATE UNIQUE INDEX idx_user_invitations_email_pending
  ON public.user_invitations (email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_user_invitations_invited_by
  ON public.user_invitations (invited_by);

CREATE INDEX idx_user_invitations_auth_user_id
  ON public.user_invitations (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ===========================================
-- RLS — SPEC-DB-001 패턴 (FORCE RLS 포함) 준수.
-- ===========================================
ALTER TABLE public.user_invitations ENABLE  ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations FORCE   ROW LEVEL SECURITY;

-- admin: 전체 RW.
CREATE POLICY user_invitations_admin_all ON public.user_invitations
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- operator/admin: 모든 초대 조회 가능 (대시보드 리스트).
CREATE POLICY user_invitations_operator_select ON public.user_invitations
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

-- operator/admin: 본인 명의로만 초대 발급. admin role 초대는 admin만.
-- (REQ-AUTH-INVITE-001 — admin 초대는 admin만 가능)
CREATE POLICY user_invitations_operator_insert ON public.user_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_operator_or_admin()
    AND invited_by = auth.uid()
    AND (invited_role <> 'admin' OR app.is_admin())
  );

-- operator/admin: 본인이 발급한 초대만 수정 (revoke 등).
CREATE POLICY user_invitations_operator_update ON public.user_invitations
  FOR UPDATE TO authenticated
  USING (app.is_operator_or_admin() AND invited_by = auth.uid())
  WITH CHECK (app.is_operator_or_admin() AND invited_by = auth.uid());

-- DELETE 정책 없음 — revoked_at 기반 soft-delete.

GRANT SELECT, INSERT, UPDATE ON public.user_invitations TO authenticated;
