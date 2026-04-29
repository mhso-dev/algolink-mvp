-- SPEC-PROPOSAL-001 §M1 — proposals 테이블 + proposal_status enum + proposal_required_skills junction.
-- @MX:ANCHOR: 제안서 도메인 단일 진입점 (영업 상위 단계 — 알고링크 → 고객사 제안서 제출).
-- @MX:REASON: 모든 영업 흐름(/proposals, dispatch, convert)이 본 테이블 통과. fan_in 매우 높음.
-- @MX:WARN: status 변경은 status-machine.ts validateProposalTransition 통과 필수.
-- @MX:REASON: draft → submitted/withdrawn, submitted → won/lost/withdrawn 외 모든 전환 거부.

-- pg_trgm 확장 — title ILIKE 검색용 GIN 인덱스 (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- proposal_status enum (REQ-PROPOSAL-ENTITY-002)
-- 정확히 5개 값: draft, submitted, won, lost, withdrawn
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
    CREATE TYPE proposal_status AS ENUM ('draft', 'submitted', 'won', 'lost', 'withdrawn');
  END IF;
END $$;

-- =============================================================================
-- proposals 테이블 (REQ-PROPOSAL-ENTITY-001)
-- =============================================================================
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES users(id),
  proposed_period_start date,
  proposed_period_end date,
  proposed_business_amount_krw bigint,
  proposed_hourly_rate_krw bigint,
  notes text,
  status proposal_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  converted_project_id uuid REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT proposals_period_check CHECK (
    proposed_period_end IS NULL
    OR proposed_period_start IS NULL
    OR proposed_period_end >= proposed_period_start
  )
);

CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_operator ON proposals(operator_id);
CREATE INDEX IF NOT EXISTS idx_proposals_title_trgm
  ON proposals USING gin (title gin_trgm_ops);

-- BEFORE UPDATE trigger (LESSON-001 pattern)
DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- =============================================================================
-- proposal_required_skills junction (REQ-PROPOSAL-ENTITY-003)
-- =============================================================================
CREATE TABLE IF NOT EXISTS proposal_required_skills (
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill_categories(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_required_skills_skill
  ON proposal_required_skills(skill_id);

COMMENT ON TABLE proposals IS
  'SPEC-PROPOSAL-001 §M1 — 제안서 엔티티 (영업 상위 단계). status workflow: draft → submitted → won|lost|withdrawn.';

COMMENT ON TABLE proposal_required_skills IS
  'SPEC-PROPOSAL-001 §M1 — 제안서 ↔ 필요 기술 N:M junction (project_required_skills 패턴 mirror).';
