-- SPEC-PROJECT-001 REQ-PROJECT-ASSIGN-004: notification_type 에 assignment_request 추가.
-- ALTER TYPE ADD VALUE IF NOT EXISTS 는 Postgres 14+ 에서 idempotent 동작.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'assignment_request';
