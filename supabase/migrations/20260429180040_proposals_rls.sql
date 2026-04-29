-- SPEC-PROPOSAL-001 §M1 / REQ-PROPOSAL-RLS-002 — RLS 정책 5종.
-- 1) proposals_operator_admin_all (FOR ALL, role IN operator/admin)
-- 2) proposal_required_skills_operator_admin_all (FOR ALL)
-- 3) proposal_inquiries_operator_admin_all (already created in 20260429170000_instructor_responses.sql as proposal_inquiries_operator_rw — coexist)
-- 4) proposal_inquiries_instructor_self_select (already in stub)
-- 5) proposal_inquiries_instructor_self_update (already in stub)

-- =============================================================================
-- proposals RLS
-- =============================================================================
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposals_operator_admin_all ON proposals;
CREATE POLICY proposals_operator_admin_all ON proposals
  FOR ALL TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

-- =============================================================================
-- proposal_required_skills RLS
-- =============================================================================
ALTER TABLE proposal_required_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_required_skills_operator_admin_all ON proposal_required_skills;
CREATE POLICY proposal_required_skills_operator_admin_all ON proposal_required_skills
  FOR ALL TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

-- proposal_inquiries RLS는 20260429170000_instructor_responses.sql에 이미 존재:
-- - proposal_inquiries_self_select (instructor self)
-- - proposal_inquiries_self_update (instructor self)
-- - proposal_inquiries_operator_rw (operator/admin FOR ALL)
-- 본 SPEC RLS-002 요구사항 모두 충족 — 신규 정책 추가 불필요.

COMMENT ON POLICY proposals_operator_admin_all ON proposals IS
  'SPEC-PROPOSAL-001 REQ-PROPOSAL-RLS-002: operator/admin only.';
