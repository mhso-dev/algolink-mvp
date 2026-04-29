-- SPEC-CONFIRM-001 §M1 REQ-CONFIRM-RESPONSES-001/002/005/006 — 강사 응답 통합 모델.
-- HIGH-1 fix: source_id 단일 컬럼 → project_id + proposal_inquiry_id 두 nullable FK + CHECK XOR + per-source partial UNIQUE.
-- MEDIUM-5 fix: status enum {pending, accepted, declined, conditional} → {accepted, declined, conditional} (no DEFAULT).
-- HIGH-3 fix: notifications 테이블 partial UNIQUE는 별도 마이그레이션(20260429170020).
--
-- @MX:ANCHOR: SPEC-CONFIRM-001 instructor_responses — 강사 응답 라이프사이클 단일 진입점.
-- @MX:REASON: 모든 응답 흐름(/me/inquiries, /me/assignments)이 본 테이블 통과. fan_in 매우 높음.

-- =============================================================================
-- proposal_inquiries 테이블 stub (SPEC-PROPOSAL-001 미머지 상태 대응)
-- HIGH-1 risk fix: SPEC-PROPOSAL-001이 머지되면 본 stub은 SPEC-PROPOSAL-001 마이그레이션이 정식
-- 정의로 대체. 본 SPEC은 FK 제약 + 최소 컬럼만 유지하여 instructor_responses FK가 깨지지 않도록 함.
-- SPEC-PROPOSAL-001 머지 후에는 ALTER TABLE 형식의 후속 보강이 발생할 수 있다.
-- =============================================================================
CREATE TABLE IF NOT EXISTS proposal_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'conditional')),
  created_by_user_id uuid,
  requested_start timestamptz,
  requested_end timestamptz,
  skill_stack text[],
  operator_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_inquiries_instructor_status
  ON proposal_inquiries (instructor_id, status);

ALTER TABLE proposal_inquiries ENABLE ROW LEVEL SECURITY;

-- proposal_inquiries RLS — 강사 본인 row 외 접근 차단 + 운영자/관리자 read.
DROP POLICY IF EXISTS proposal_inquiries_self_select ON proposal_inquiries;
CREATE POLICY proposal_inquiries_self_select ON proposal_inquiries
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS proposal_inquiries_self_update ON proposal_inquiries;
CREATE POLICY proposal_inquiries_self_update ON proposal_inquiries
  FOR UPDATE TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  )
  WITH CHECK (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS proposal_inquiries_operator_rw ON proposal_inquiries;
CREATE POLICY proposal_inquiries_operator_rw ON proposal_inquiries
  FOR ALL TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

-- BEFORE UPDATE trigger (LESSON-001 pattern)
DROP TRIGGER IF EXISTS trg_proposal_inquiries_updated_at ON proposal_inquiries;
CREATE TRIGGER trg_proposal_inquiries_updated_at
  BEFORE UPDATE ON proposal_inquiries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- =============================================================================
-- instructor_responses — 통합 응답 모델 (HIGH-1 + MEDIUM-5)
-- =============================================================================
CREATE TABLE IF NOT EXISTS instructor_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('proposal_inquiry', 'assignment_request')),
  -- HIGH-1 fix: 두 nullable FK + CHECK XOR
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  proposal_inquiry_id uuid REFERENCES proposal_inquiries(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  -- MEDIUM-5 fix: 'pending' 제거, NO DEFAULT
  status text NOT NULL CHECK (status IN ('accepted', 'declined', 'conditional')),
  conditional_note text,
  responded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- HIGH-1 fix: source_kind ↔ FK 컬럼 일관성 강제
  CONSTRAINT instructor_responses_source_xor CHECK (
    (source_kind = 'assignment_request' AND project_id IS NOT NULL AND proposal_inquiry_id IS NULL) OR
    (source_kind = 'proposal_inquiry' AND project_id IS NULL AND proposal_inquiry_id IS NOT NULL)
  )
);

-- HIGH-1 fix: 두 partial UNIQUE 인덱스 (per-source idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_instructor_responses_assignment
  ON instructor_responses (project_id, instructor_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_instructor_responses_inquiry
  ON instructor_responses (proposal_inquiry_id, instructor_id)
  WHERE proposal_inquiry_id IS NOT NULL;

-- 인덱스 (REQ-CONFIRM-RESPONSES-002): /me/inquiries, /me/assignments 인박스 조회용
CREATE INDEX IF NOT EXISTS idx_instructor_responses_by_instructor
  ON instructor_responses (instructor_id, status);

-- =============================================================================
-- RLS — instructor self-only (REQ-CONFIRM-RESPONSES-005)
-- =============================================================================
ALTER TABLE instructor_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_responses_self_only ON instructor_responses;
CREATE POLICY instructor_responses_self_only ON instructor_responses
  FOR ALL TO authenticated
  USING (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  )
  WITH CHECK (
    app.is_instructor()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- 운영자/관리자는 전체 select (감사 + 알림 후속 처리용 — defense in depth: 응답 수정 차단)
DROP POLICY IF EXISTS instructor_responses_operator_select ON instructor_responses;
CREATE POLICY instructor_responses_operator_select ON instructor_responses
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

-- =============================================================================
-- BEFORE UPDATE trigger — REQ-CONFIRM-RESPONSES-006 (MEDIUM-6)
-- LESSON-001 pattern: app.touch_updated_at() + trg_<table>_updated_at convention
-- =============================================================================
DROP TRIGGER IF EXISTS trg_instructor_responses_updated_at ON instructor_responses;
CREATE TRIGGER trg_instructor_responses_updated_at
  BEFORE UPDATE ON instructor_responses
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- 별칭 — SPEC-CONFIRM-001 spec.md REQ-CONFIRM-RESPONSES-006 명세상 trigger 이름은
-- `set_updated_at_instructor_responses`이지만 본 프로젝트는 `trg_<table>_updated_at` convention.
-- spec.md amendment에서 plan 명세 수정. trigger 동작은 동일.

COMMENT ON TABLE instructor_responses IS
  'SPEC-CONFIRM-001 §M1 — 강사 응답 통합 모델. source_kind discriminator + 두 nullable FK + CHECK XOR.';
