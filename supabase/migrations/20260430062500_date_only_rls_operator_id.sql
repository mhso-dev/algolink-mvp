-- Task 1 date-only/data/RLS hardening.
-- Safe, additive migration: no timestamp column type changes and no destructive data rewrites.

-- proposal_inquiries: persist owning operator for direct RLS and notifications.
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES users(id);

UPDATE proposal_inquiries pi
SET operator_id = p.operator_id
FROM proposals p
WHERE pi.proposal_id = p.id
  AND pi.operator_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_inquiries_operator
  ON proposal_inquiries(operator_id);

-- Replace broad operator/admin proposal_inquiries policy with operator ownership + admin all.
DROP POLICY IF EXISTS proposal_inquiries_operator_rw ON proposal_inquiries;
DROP POLICY IF EXISTS proposal_inquiries_admin_all ON proposal_inquiries;
DROP POLICY IF EXISTS proposal_inquiries_operator_select ON proposal_inquiries;
DROP POLICY IF EXISTS proposal_inquiries_operator_insert ON proposal_inquiries;
DROP POLICY IF EXISTS proposal_inquiries_operator_update ON proposal_inquiries;

CREATE POLICY proposal_inquiries_admin_all ON proposal_inquiries
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY proposal_inquiries_operator_select ON proposal_inquiries
  FOR SELECT TO authenticated
  USING (app.current_role() = 'operator' AND operator_id = auth.uid());

CREATE POLICY proposal_inquiries_operator_insert ON proposal_inquiries
  FOR INSERT TO authenticated
  WITH CHECK (app.current_role() = 'operator' AND operator_id = auth.uid());

CREATE POLICY proposal_inquiries_operator_update ON proposal_inquiries
  FOR UPDATE TO authenticated
  USING (app.current_role() = 'operator' AND operator_id = auth.uid())
  WITH CHECK (app.current_role() = 'operator' AND operator_id = auth.uid());

-- Instructor self-service schedules need UPDATE/DELETE for personal unavailable blocks only.
DROP POLICY IF EXISTS schedule_items_self_personal_update ON schedule_items;
DROP POLICY IF EXISTS schedule_items_self_personal_delete ON schedule_items;

CREATE POLICY schedule_items_self_personal_update ON schedule_items
  FOR UPDATE TO authenticated
  USING (
    app.is_instructor()
    AND schedule_kind = 'personal'
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  )
  WITH CHECK (
    app.is_instructor()
    AND schedule_kind = 'personal'
    AND project_id IS NULL
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY schedule_items_self_personal_delete ON schedule_items
  FOR DELETE TO authenticated
  USING (
    app.is_instructor()
    AND schedule_kind = 'personal'
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

COMMENT ON COLUMN proposal_inquiries.operator_id IS
  'Owning operator copied from proposals.operator_id for proposal inquiry RLS and notification routing.';
