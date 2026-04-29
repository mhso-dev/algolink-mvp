-- SPEC-RECEIPT-001 M1 — settlements_withholding_rate_check CHECK 제약 RECREATE
-- @MX:NOTE: REQ-RECEIPT-FLOW-002 — DROP + ADD 패턴으로 client_direct disjunct 추가.
-- @MX:REASON: 기존 CHECK은 corporate=0 OR government IN (3.30, 8.80)만 허용 → client_direct 행 INSERT 불가.

ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_withholding_rate_check;

ALTER TABLE settlements ADD CONSTRAINT settlements_withholding_rate_check CHECK (
  (settlement_flow = 'corporate' AND withholding_tax_rate = 0)
  OR
  (settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))
  OR
  (settlement_flow = 'client_direct' AND withholding_tax_rate IN (3.30, 8.80))
);
