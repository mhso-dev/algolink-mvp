-- SPEC-RECEIPT-001 M1 — notification_type enum에 receipt_issued 추가
-- @MX:NOTE: REQ-RECEIPT-NOTIFY-001.
-- @MX:REASON: 영수증 발급 완료 시 강사 인앱 알림 type 값.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';
