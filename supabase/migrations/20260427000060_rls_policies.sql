-- SPEC-DB-001 §2.1 + §3.2 — Row Level Security 일괄 적용.
-- REQ-DB001-RLS, REQ-DB001-RLS-ROLE, REQ-DB001-RLS-INSTRUCTOR, REQ-DB001-RLS-OPERATOR, REQ-DB001-RLS-DENY.
--
-- 정책 패턴:
--   - admin: 모든 테이블 ALL 허용
--   - operator: 강사·고객사·프로젝트·정산 SELECT/INSERT/UPDATE 허용 (DELETE는 admin만)
--   - instructor: 본인 소유 + 본인이 배정된 프로젝트의 audience='instructor' 메모/일정만
--   - 정의되지 않은 역할 또는 미인증: default deny (정책 매칭 없음)
--
-- app.current_role()은 000020_pgcrypto_functions.sql에서 정의됨.

-- ===========================================
-- 모든 public 테이블 RLS 활성화 (default deny)
-- ===========================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'files', 'pii_access_log',
    'instructors', 'educations', 'certifications', 'work_experiences',
    'teaching_experiences', 'instructor_projects', 'other_activities', 'publications',
    'skill_categories', 'instructor_skills',
    'clients', 'client_contacts',
    'projects', 'project_status_history',
    'schedule_items',
    'settlements', 'settlement_status_history',
    'notes', 'notes_attachments', 'comments',
    'notifications',
    'ai_resume_parses', 'ai_satisfaction_summaries', 'ai_instructor_recommendations',
    'satisfaction_reviews'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- ===========================================
-- 역할 헬퍼 — 한 곳에서 정의해 모든 정책에서 재사용
-- ===========================================
-- (app.current_role()은 이미 정의됨)
CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_role() = 'admin'
$$;

CREATE OR REPLACE FUNCTION app.is_operator_or_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_role() IN ('admin', 'operator')
$$;

CREATE OR REPLACE FUNCTION app.is_instructor()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_role() = 'instructor'
$$;

GRANT EXECUTE ON FUNCTION app.is_admin()              TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.is_operator_or_admin()  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION app.is_instructor()         TO authenticated, anon, service_role;

-- ===========================================
-- users
-- ===========================================
CREATE POLICY users_admin_all ON users
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY users_operator_select ON users
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY users_self_select ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_self_update ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()));

-- ===========================================
-- files (REQ-DB001-FILES-RLS)
-- 본인 소유 + admin/operator만 SELECT.
-- ===========================================
CREATE POLICY files_admin_all ON files
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY files_operator_rw ON files
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY files_operator_insert ON files
  FOR INSERT TO authenticated
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY files_operator_update ON files
  FOR UPDATE TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY files_owner_select ON files
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- ===========================================
-- pii_access_log (admin만 조회)
-- ===========================================
CREATE POLICY pii_access_log_admin ON pii_access_log
  FOR SELECT TO authenticated
  USING (app.is_admin());

-- INSERT는 SECURITY DEFINER 함수 (app.decrypt_pii) 경유로만 발생 → 명시적 정책 없음.

-- ===========================================
-- instructors (REQ-DB001-RLS-INSTRUCTOR + REQ-DB001-RLS-OPERATOR)
-- ===========================================
CREATE POLICY instructors_admin_all ON instructors
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY instructors_operator_select ON instructors
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY instructors_operator_insert ON instructors
  FOR INSERT TO authenticated
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY instructors_operator_update ON instructors
  FOR UPDATE TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY instructors_self_select ON instructors
  FOR SELECT TO authenticated
  USING (app.is_instructor() AND user_id = auth.uid());

CREATE POLICY instructors_self_update ON instructors
  FOR UPDATE TO authenticated
  USING (app.is_instructor() AND user_id = auth.uid())
  WITH CHECK (app.is_instructor() AND user_id = auth.uid());

-- ===========================================
-- 강사 sub-domain (educations, certifications, ...)
-- 본인 또는 admin/operator
-- ===========================================
DO $$
DECLARE
  sub_table text;
  sub_tables text[] := ARRAY[
    'educations', 'certifications', 'work_experiences',
    'teaching_experiences', 'instructor_projects', 'other_activities', 'publications'
  ];
BEGIN
  FOREACH sub_table IN ARRAY sub_tables LOOP
    EXECUTE format($p$
      CREATE POLICY %1$s_admin_all ON %1$I
        FOR ALL TO authenticated
        USING (app.is_admin())
        WITH CHECK (app.is_admin());
      CREATE POLICY %1$s_operator_rw ON %1$I
        FOR SELECT TO authenticated
        USING (app.is_operator_or_admin());
      CREATE POLICY %1$s_operator_write ON %1$I
        FOR INSERT TO authenticated
        WITH CHECK (app.is_operator_or_admin());
      CREATE POLICY %1$s_operator_update ON %1$I
        FOR UPDATE TO authenticated
        USING (app.is_operator_or_admin())
        WITH CHECK (app.is_operator_or_admin());
      CREATE POLICY %1$s_self_select ON %1$I
        FOR SELECT TO authenticated
        USING (
          app.is_instructor()
          AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
        );
      CREATE POLICY %1$s_self_write ON %1$I
        FOR INSERT TO authenticated
        WITH CHECK (
          app.is_instructor()
          AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
        );
      CREATE POLICY %1$s_self_update ON %1$I
        FOR UPDATE TO authenticated
        USING (
          app.is_instructor()
          AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
        );
    $p$, sub_table);
  END LOOP;
END $$;

-- ===========================================
-- skill_categories (read-only for all authenticated, write admin only)
-- ===========================================
CREATE POLICY skill_categories_read ON skill_categories
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY skill_categories_admin_write ON skill_categories
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- ===========================================
-- instructor_skills
-- ===========================================
CREATE POLICY instructor_skills_admin_all ON instructor_skills
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY instructor_skills_operator_rw ON instructor_skills
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY instructor_skills_operator_write ON instructor_skills
  FOR INSERT TO authenticated
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY instructor_skills_operator_delete ON instructor_skills
  FOR DELETE TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY instructor_skills_self_select ON instructor_skills
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- ===========================================
-- clients, client_contacts (operator/admin만)
-- ===========================================
CREATE POLICY clients_admin_all ON clients
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY clients_operator_rw ON clients
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY clients_operator_write ON clients
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY clients_operator_update ON clients
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());

CREATE POLICY client_contacts_admin_all ON client_contacts
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY client_contacts_operator_rw ON client_contacts
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY client_contacts_operator_write ON client_contacts
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY client_contacts_operator_update ON client_contacts
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());

-- ===========================================
-- projects + project_status_history
-- 강사는 본인 배정 프로젝트만 조회.
-- ===========================================
CREATE POLICY projects_admin_all ON projects
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY projects_operator_rw ON projects
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY projects_operator_write ON projects
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY projects_operator_update ON projects
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());
CREATE POLICY projects_assigned_instructor ON projects
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY project_status_history_admin_all ON project_status_history
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY project_status_history_operator_rw ON project_status_history
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
-- INSERT는 트리거 (auth 컨텍스트와 무관)에서 발생 → 정책 불필요.
CREATE POLICY project_status_history_assigned_instructor ON project_status_history
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND project_id IN (
      SELECT p.id FROM projects p
      JOIN instructors i ON i.id = p.instructor_id
      WHERE i.user_id = auth.uid()
    )
  );

-- ===========================================
-- schedule_items
-- 강사는 본인 일정만 RW.
-- ===========================================
CREATE POLICY schedule_items_admin_all ON schedule_items
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY schedule_items_operator_rw ON schedule_items
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY schedule_items_operator_write ON schedule_items
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY schedule_items_operator_update ON schedule_items
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());
CREATE POLICY schedule_items_self_select ON schedule_items
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );
CREATE POLICY schedule_items_self_personal ON schedule_items
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_instructor()
    AND schedule_kind = 'personal'
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- ===========================================
-- settlements + history
-- ===========================================
CREATE POLICY settlements_admin_all ON settlements
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY settlements_operator_rw ON settlements
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY settlements_operator_write ON settlements
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY settlements_operator_update ON settlements
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());
CREATE POLICY settlements_self_select ON settlements
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY settlement_status_history_admin_all ON settlement_status_history
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY settlement_status_history_operator_rw ON settlement_status_history
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());

-- ===========================================
-- notes, notes_attachments, comments
-- REQ-DB001-NOTES-RLS-INSTRUCTOR — instructor는 audience='instructor'만.
-- ===========================================
CREATE POLICY notes_admin_all ON notes
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY notes_operator_rw ON notes
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY notes_operator_write ON notes
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY notes_operator_update ON notes
  FOR UPDATE TO authenticated USING (app.is_operator_or_admin()) WITH CHECK (app.is_operator_or_admin());
CREATE POLICY notes_instructor_audience ON notes
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND audience = 'instructor'
    AND (
      (entity_type = 'instructor' AND entity_id IN (SELECT id FROM instructors WHERE user_id = auth.uid()))
      OR
      (entity_type = 'project' AND entity_id IN (
        SELECT p.id FROM projects p
        JOIN instructors i ON i.id = p.instructor_id
        WHERE i.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY notes_attachments_admin_all ON notes_attachments
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY notes_attachments_operator_rw ON notes_attachments
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());

CREATE POLICY comments_admin_all ON comments
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY comments_operator_rw ON comments
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY comments_operator_write ON comments
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());

-- ===========================================
-- notifications — 본인 알림만
-- ===========================================
CREATE POLICY notifications_admin_all ON notifications
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY notifications_operator_insert ON notifications
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());
CREATE POLICY notifications_recipient_select ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY notifications_recipient_update ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ===========================================
-- AI artifacts — 운영자/관리자 RW.
-- 강사는 본인 관련 산출물 SELECT.
-- ===========================================
CREATE POLICY ai_resume_parses_admin_all ON ai_resume_parses
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY ai_resume_parses_operator_rw ON ai_resume_parses
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY ai_resume_parses_operator_write ON ai_resume_parses
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());

CREATE POLICY ai_satisfaction_summaries_admin_all ON ai_satisfaction_summaries
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY ai_satisfaction_summaries_operator_rw ON ai_satisfaction_summaries
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY ai_satisfaction_summaries_operator_write ON ai_satisfaction_summaries
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());

CREATE POLICY ai_recommendations_admin_all ON ai_instructor_recommendations
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY ai_recommendations_operator_rw ON ai_instructor_recommendations
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY ai_recommendations_operator_write ON ai_instructor_recommendations
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());

-- ===========================================
-- satisfaction_reviews
-- ===========================================
CREATE POLICY satisfaction_reviews_admin_all ON satisfaction_reviews
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY satisfaction_reviews_operator_rw ON satisfaction_reviews
  FOR SELECT TO authenticated USING (app.is_operator_or_admin());
CREATE POLICY satisfaction_reviews_operator_write ON satisfaction_reviews
  FOR INSERT TO authenticated WITH CHECK (app.is_operator_or_admin());

-- ===========================================
-- 안전망 view: instructors_safe (PII 컬럼 제외)
-- 운영자 UI에서 raw bytea 노출 방지를 위해 사용 권장.
-- ===========================================
CREATE OR REPLACE VIEW instructors_safe AS
SELECT
  id, user_id, name_kr, name_hanja, name_en, birth_date,
  address, email, phone,
  photo_file_id, photo_storage_path,
  deleted_at, created_at, updated_at, created_by
FROM instructors;

GRANT SELECT ON instructors_safe TO authenticated;
