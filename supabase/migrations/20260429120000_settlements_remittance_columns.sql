-- SPEC-RECEIPT-001 M1 — settlements 6개 nullable 컬럼 추가
-- @MX:NOTE: REQ-RECEIPT-COLUMNS-001/002.
-- @MX:REASON: 6-2 흐름의 강사 송금/영수증 데이터 추적.

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS instructor_remittance_amount_krw bigint;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS instructor_remittance_received_at timestamptz;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS client_payout_amount_krw bigint;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS receipt_file_id uuid REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS receipt_issued_at timestamptz;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS receipt_number text;

-- UNIQUE 제약 (NULL 다중 허용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_receipt_number
  ON settlements(receipt_number) WHERE receipt_number IS NOT NULL;

-- 영수증 번호 형식 검증 (RCP-YYYY-NNNN, 4-digit)
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_receipt_number_format_check;
ALTER TABLE settlements ADD CONSTRAINT settlements_receipt_number_format_check CHECK (
  receipt_number IS NULL
  OR receipt_number ~ '^RCP-\d{4}-\d{4}$'
);

-- @MX:NOTE: receipt_file_id의 ON DELETE SET NULL은 영수증 파일 삭제 시 정산 행은 유지 + 참조만 끊음.
