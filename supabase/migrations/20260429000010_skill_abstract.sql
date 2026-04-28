-- SPEC-SKILL-ABSTRACT-001 — 강사 기술 분류를 9개 추상 카테고리로 단순화.
--
-- 변경 요약:
--   1. instructor_skills, project_required_skills 테이블 TRUNCATE (forward-only reset).
--   2. leaf-only enforcement 트리거 DROP.
--   3. skill_categories에서 tier, parent_id 컬럼 DROP.
--   4. instructor_skills에서 proficiency 컬럼 DROP.
--   5. proficiency, skill_tier pgEnum DROP.
--   6. tier/parent 인덱스 DROP.
--   7. skill_categories 9개 row 시드 (idempotent).
--   8. UNIQUE 제약 변경: (tier, parent_id, name) → (name).
--
-- FROZEN by spec.md (변경 금지):
--   - 9개 카테고리 이름·sort_order·UUID 정책
--   - proficiency 완전 제거
--   - 데이터 전체 초기화 (TRUNCATE)
--   - tier/parent_id 컬럼 자체 제거
--
-- forward-only: ai_instructor_recommendations row는 보존 (REQ-SKILL-MIGRATION-FORWARD-ONLY).

-- ===========================================
-- 단계 A: 종속 테이블 TRUNCATE (FK 위반 회피)
-- ===========================================
TRUNCATE TABLE instructor_skills RESTART IDENTITY;
TRUNCATE TABLE project_required_skills RESTART IDENTITY;

-- ===========================================
-- 단계 B: leaf-only enforcement 트리거 + 함수 DROP
-- ===========================================
DROP TRIGGER IF EXISTS trg_instructor_skills_leaf_check ON instructor_skills;
DROP FUNCTION IF EXISTS app.assert_skill_is_leaf();

DROP TRIGGER IF EXISTS trg_project_required_skills_leaf_check ON project_required_skills;
DROP FUNCTION IF EXISTS public.project_required_skills_leaf_check();

-- ===========================================
-- 단계 C: skill_categories에서 tier, parent_id 컬럼 DROP
-- (CASCADE는 자기참조 FK 처리. 인덱스/UNIQUE도 함께 제거됨)
-- ===========================================
ALTER TABLE skill_categories DROP CONSTRAINT IF EXISTS uq_skill_categories_tier_parent_name;
DROP INDEX IF EXISTS idx_skill_categories_tier;
DROP INDEX IF EXISTS idx_skill_categories_parent;

ALTER TABLE skill_categories DROP COLUMN IF EXISTS tier CASCADE;
ALTER TABLE skill_categories DROP COLUMN IF EXISTS parent_id CASCADE;

-- ===========================================
-- 단계 D: instructor_skills에서 proficiency 컬럼 DROP
-- ===========================================
ALTER TABLE instructor_skills DROP COLUMN IF EXISTS proficiency;

-- ===========================================
-- 단계 E: pgEnum 타입 DROP (CASCADE — 컬럼 의존이 있다면 모두 제거됨)
-- ===========================================
DROP TYPE IF EXISTS proficiency CASCADE;
DROP TYPE IF EXISTS skill_tier CASCADE;

-- ===========================================
-- 단계 F: 잔존 인덱스 정리 (방어적)
-- ===========================================
DROP INDEX IF EXISTS idx_skill_categories_tier;
DROP INDEX IF EXISTS idx_skill_categories_parent;

-- ===========================================
-- 단계 G: 기존 row 모두 삭제 후 9개 추상 카테고리 INSERT (idempotent)
-- UUID prefix `30` (기존 large(`10`)/medium(`11`)/small(`12`) prefix와 비충돌).
-- 강사 instructors 테이블도 `30` prefix를 쓰지만 다른 테이블이라 PK 충돌 없음.
-- ===========================================
DELETE FROM skill_categories;

INSERT INTO skill_categories (id, name, sort_order) VALUES
  ('30000000-0000-0000-0000-000000000001', '데이터 분석',     1),
  ('30000000-0000-0000-0000-000000000002', '데이터 사이언스', 2),
  ('30000000-0000-0000-0000-000000000003', 'AI·ML',           3),
  ('30000000-0000-0000-0000-000000000004', '백엔드',          4),
  ('30000000-0000-0000-0000-000000000005', '프론트엔드',      5),
  ('30000000-0000-0000-0000-000000000006', '풀스택',          6),
  ('30000000-0000-0000-0000-000000000007', '모바일',          7),
  ('30000000-0000-0000-0000-000000000008', '인프라·DevOps',   8),
  ('30000000-0000-0000-0000-000000000009', '클라우드',        9)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

-- ===========================================
-- 단계 H: UNIQUE 제약 갱신 — (name)
-- ===========================================
ALTER TABLE skill_categories DROP CONSTRAINT IF EXISTS uq_skill_categories_name;
ALTER TABLE skill_categories ADD CONSTRAINT uq_skill_categories_name UNIQUE (name);
