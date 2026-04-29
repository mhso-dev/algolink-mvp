-- SPEC-PROPOSAL-001 §M1 — proposal_inquiries 테이블 확장 (CONFIRM-001 stub → 정식 정의).
-- HIGH-1 fix: SPEC-CONFIRM-001 PR #23이 proposal_inquiries stub을 임시 생성했고, 본 SPEC이 정식 정의.
-- 기존 stub은 instructor_responses.proposal_inquiry_id FK를 위해 (id, instructor_id) 컬럼만 보유.
-- 본 마이그레이션은 ALTER TABLE로 SPEC §2.4 / §5.1 컬럼을 보강하며, 기존 FK 보존.
--
-- @MX:ANCHOR: 사전 강사 문의 단일 진입점. dispatch + 응답 보드 + 시그널 view 모두 본 테이블 참조.
-- @MX:REASON: fan_in 매우 높음 (CONFIRM-001 instructor_responses, dispatch action, response board, signal view).
-- @MX:WARN: 기존 stub 행 (CONFIRM-001 머지 후 0건 가정)이 있을 경우 NOT NULL ALTER가 실패할 수 있음.
-- @MX:REASON: 정상 운영 흐름에서 stub은 빈 테이블 (CONFIRM-001은 정의만 추가). 신규 컬럼은 ADD COLUMN IF NOT EXISTS + 기본값 NULL로 안전.

-- =============================================================================
-- inquiry_status enum (REQ-PROPOSAL-INQUIRY-002)
-- 정확히 4개 값: pending, accepted, declined, conditional
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inquiry_status') THEN
    CREATE TYPE inquiry_status AS ENUM ('pending', 'accepted', 'declined', 'conditional');
  END IF;
END $$;

-- =============================================================================
-- proposal_inquiries 테이블 보강 (stub → SPEC §5.1 정식 정의)
-- =============================================================================

-- 신규 컬럼 추가 (ADD COLUMN IF NOT EXISTS — idempotent)
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS proposal_id uuid;

-- proposal_id FK 제약 (proposal_inquiries → proposals(id), CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'proposal_inquiries'
      AND constraint_name = 'proposal_inquiries_proposal_id_fkey'
  ) THEN
    ALTER TABLE proposal_inquiries
      ADD CONSTRAINT proposal_inquiries_proposal_id_fkey
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
  END IF;
END $$;

-- SPEC §5.1 컬럼 추가
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS proposed_time_slot_start timestamptz;
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS proposed_time_slot_end timestamptz;
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS question_note text;
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS conditional_note text;
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS responded_by_user_id uuid REFERENCES users(id);

-- status 컬럼 enum 변환 (기존: text CHECK; 신규: inquiry_status enum)
-- 1. 신규 enum 컬럼 추가
ALTER TABLE proposal_inquiries
  ADD COLUMN IF NOT EXISTS status_enum inquiry_status;

-- 2. 기존 status text 값 → status_enum 복사 (idempotent)
UPDATE proposal_inquiries
  SET status_enum = status::inquiry_status
  WHERE status_enum IS NULL AND status IS NOT NULL;

-- 3. 기존 text status 컬럼 DROP (CASCADE: CHECK 제약도 함께 제거)
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS status CASCADE;

-- 4. 신규 enum 컬럼을 status로 rename
ALTER TABLE proposal_inquiries RENAME COLUMN status_enum TO status;

-- 5. NOT NULL + DEFAULT 적용
ALTER TABLE proposal_inquiries
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending'::inquiry_status;

-- 6. 사용하지 않는 stub 컬럼 DROP (created_by_user_id, requested_start, requested_end, skill_stack, operator_memo)
-- 이들은 SPEC §5.1에 없음. CONFIRM-001 stub의 잔재.
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS created_by_user_id;
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS requested_start;
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS requested_end;
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS skill_stack;
ALTER TABLE proposal_inquiries DROP COLUMN IF EXISTS operator_memo;

-- UNIQUE(proposal_id, instructor_id) — REQ-PROPOSAL-INQUIRY-001 / REQ-PROPOSAL-INQUIRY-004
-- proposal_id NOT NULL 제약은 stub 행(0건 가정) 정리 후 적용 — 운영에서는 빈 테이블 가정.
-- 단, stub 행이 있다면 unique 위반을 회피하기 위해 partial unique 사용.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_proposal_inquiries_proposal_instructor
  ON proposal_inquiries (proposal_id, instructor_id)
  WHERE proposal_id IS NOT NULL;

-- 인덱스 (REQ-PROPOSAL-INQUIRY-001)
DROP INDEX IF EXISTS idx_proposal_inquiries_instructor_status;
CREATE INDEX IF NOT EXISTS idx_proposal_inquiries_instructor_status
  ON proposal_inquiries(instructor_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_inquiries_proposal_status
  ON proposal_inquiries(proposal_id, status)
  WHERE proposal_id IS NOT NULL;

COMMENT ON TABLE proposal_inquiries IS
  'SPEC-PROPOSAL-001 §M1 — 제안서 사전 강사 문의 (디스패치 → 응답 → 변환 흐름). CONFIRM-001 stub 보강 완료.';
