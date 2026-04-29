-- SPEC-CONFIRM-001 §M1 REQ-CONFIRM-NOTIFY-001 — 5개 신규 notification_type enum value 추가.
-- ALTER TYPE ... ADD VALUE는 트랜잭션 외부에서 실행되어 다음 사용 가능.
-- supabase migration up은 각 파일을 별도 트랜잭션으로 실행하므로 안전.
-- ADD VALUE IF NOT EXISTS는 Postgres 14+ 에서 idempotent.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_declined';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_accepted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_declined';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_conditional';
