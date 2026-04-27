-- SPEC-PROJECT-001 §5.2 옵션 A: required_skill_ids junction 테이블.
-- 강사 추천 엔진의 candidate 쿼리가 일반 join + 인덱스로 동작하도록 함.

CREATE TABLE IF NOT EXISTS public.project_required_skills (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES public.skill_categories(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_project_required_skills_skill
  ON public.project_required_skills (skill_id);

-- leaf 검증 트리거 (instructor_skills 패턴과 동일)
CREATE OR REPLACE FUNCTION public.project_required_skills_leaf_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.skill_categories WHERE parent_id = NEW.skill_id
  ) THEN
    RAISE EXCEPTION 'skill_id must reference a leaf skill category (no children)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_required_skills_leaf_check
  ON public.project_required_skills;
CREATE TRIGGER trg_project_required_skills_leaf_check
  BEFORE INSERT OR UPDATE ON public.project_required_skills
  FOR EACH ROW EXECUTE FUNCTION public.project_required_skills_leaf_check();

-- RLS: operator/admin 전부 허용, instructor는 본인 배정 프로젝트의 row 만 SELECT.
ALTER TABLE public.project_required_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prs_operator_admin_all ON public.project_required_skills;
CREATE POLICY prs_operator_admin_all
  ON public.project_required_skills
  FOR ALL
  TO authenticated
  USING (
    coalesce((auth.jwt() ->> 'role'),
             (auth.jwt() -> 'app_metadata' ->> 'role')) IN ('operator', 'admin')
  )
  WITH CHECK (
    coalesce((auth.jwt() ->> 'role'),
             (auth.jwt() -> 'app_metadata' ->> 'role')) IN ('operator', 'admin')
  );

DROP POLICY IF EXISTS prs_instructor_own_select ON public.project_required_skills;
CREATE POLICY prs_instructor_own_select
  ON public.project_required_skills
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.instructors i ON i.id = p.instructor_id
      WHERE p.id = project_required_skills.project_id
        AND i.user_id = auth.uid()
    )
  );
