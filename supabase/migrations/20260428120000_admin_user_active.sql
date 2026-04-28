-- SPEC-ADMIN-001: users.is_active 컬럼 도입 (admin이 비활성화 가능)
-- F-301: admin이 사용자를 비활성화하면 다음 로그인부터 미들웨어가 차단한다.
-- DEFAULT true 이므로 기존 사용자는 모두 활성 상태로 초기화 (메타데이터 변경, 무중단).

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 부분 인덱스: 비활성 사용자만 색인 (대다수가 활성이므로 작은 인덱스로 유지).
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = false;

COMMENT ON COLUMN users.is_active IS 'admin이 비활성화 가능. false면 다음 로그인부터 미들웨어가 차단.';
