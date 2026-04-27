-- SPEC-DB-001 M4/M5 — 트리거 정의.
-- 1. updated_at 자동 갱신 (모든 핵심 테이블)
-- 2. project_status_history 자동 기록 (REQ-DB001-PROJECT-STATUS-HISTORY)
-- 3. settlement_status_history 자동 기록 (REQ-DB001-SETTLEMENT-STATUS-HISTORY)
-- 4. instructor_skills leaf node 검증 (REQ-DB001-SKILL-LEAF)

-- ===========================================
-- updated_at 자동 갱신 헬퍼
-- ===========================================
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 적용 대상 테이블 — updated_at 컬럼 보유 테이블만.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'instructors', 'clients', 'projects', 'schedule_items',
    'settlements', 'notes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I;
       CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON %1$I
         FOR EACH ROW
         EXECUTE FUNCTION app.touch_updated_at();',
      tbl
    );
  END LOOP;
END $$;

-- ===========================================
-- project status 변경 이력 자동 기록
-- REQ-DB001-PROJECT-STATUS-HISTORY
-- ===========================================
CREATE OR REPLACE FUNCTION app.log_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO project_status_history (project_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_status_history ON projects;
CREATE TRIGGER trg_projects_status_history
  AFTER UPDATE OF status ON projects
  FOR EACH ROW
  EXECUTE FUNCTION app.log_project_status_change();

-- ===========================================
-- settlement status 변경 이력 자동 기록
-- REQ-DB001-SETTLEMENT-STATUS-HISTORY
-- ===========================================
CREATE OR REPLACE FUNCTION app.log_settlement_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO settlement_status_history (settlement_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlements_status_history ON settlements;
CREATE TRIGGER trg_settlements_status_history
  AFTER UPDATE OF status ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION app.log_settlement_status_change();

-- ===========================================
-- instructor_skills leaf node 검증
-- REQ-DB001-SKILL-LEAF — 자식이 있는 카테고리는 매핑 불가 (가장 세분화된 노드만)
-- ===========================================
CREATE OR REPLACE FUNCTION app.assert_skill_is_leaf()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_children boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM skill_categories WHERE parent_id = NEW.skill_id
  ) INTO has_children;

  IF has_children THEN
    RAISE EXCEPTION 'instructor_skills.skill_id must reference a leaf skill_category (no children)'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_skills_leaf_check ON instructor_skills;
CREATE TRIGGER trg_instructor_skills_leaf_check
  BEFORE INSERT OR UPDATE ON instructor_skills
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_skill_is_leaf();

-- ===========================================
-- users.id ↔ auth.users.id FK (Supabase 통합)
-- 마이그레이션 시점에 auth 스키마가 존재하면 적용 (로컬 Supabase 환경 가정).
-- ===========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    BEGIN
      ALTER TABLE users
        ADD CONSTRAINT users_id_fkey
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
