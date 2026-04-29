-- SPEC-PROPOSAL-001 §M1 / REQ-PROPOSAL-INQUIRY-007 — notification_type enum에 'inquiry_request' 추가.
-- idempotent: ADD VALUE IF NOT EXISTS.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_request';
