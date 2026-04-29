-- SPEC-CONFIRM-001 §M1 REQ-CONFIRM-NOTIFY-002 (HIGH-3 fix) — 알림 idempotency 강화.
-- notifications 테이블에 source_kind text NULL + source_id uuid NULL 컬럼 추가 + partial UNIQUE 인덱스.
-- 동일 (recipient_user_id, source_kind, source_id, type) 조합 동시 INSERT 시 정확히 1행 commit.
--
-- @MX:NOTE: 본 마이그레이션의 partial UNIQUE 인덱스는 source_kind/source_id 모두 NOT NULL인 경우에만
-- 동작한다. SPEC-PROJECT-001 v0.x 시점에 INSERT된 기존 notifications 행(source_kind=NULL)은 영향
-- 받지 않으므로 backfill 없이 안전하게 적용 가능.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS source_kind text NULL,
  ADD COLUMN IF NOT EXISTS source_id uuid NULL;

-- partial UNIQUE 인덱스 — SPEC-CONFIRM-001 INSERT만 진입.
-- 본 SPEC notif INSERT 시 ON CONFLICT (recipient_id, source_kind, source_id, type)
-- WHERE source_kind IS NOT NULL AND source_id IS NOT NULL DO NOTHING으로 정확히 1행 보장.
--
-- IMPORTANT: 본 프로젝트의 notifications 테이블은 recipient_user_id 대신 recipient_id 컬럼을 사용한다
-- (drizzle schema 참조). spec.md의 recipient_user_id 표기는 schema migration 작성 시 recipient_id로
-- 매핑한다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
  ON notifications (recipient_id, source_kind, source_id, type)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;

COMMENT ON COLUMN notifications.source_kind IS
  'SPEC-CONFIRM-001: discriminator for source entity (assignment_request | proposal_inquiry).';
COMMENT ON COLUMN notifications.source_id IS
  'SPEC-CONFIRM-001: source entity UUID (project_id or proposal_inquiry_id).';
