-- SPEC-RECEIPT-001 M1 — settlement_flow enum에 client_direct 추가 + CHECK 제약 확장
-- @MX:NOTE: REQ-RECEIPT-FLOW-001/002/003.
-- @MX:REASON: 6-2 흐름(고객 직접 정산) 추가 — 원천세율 3.30/8.80 허용.

ALTER TYPE settlement_flow ADD VALUE IF NOT EXISTS 'client_direct';

-- ALTER TYPE ... ADD VALUE는 트랜잭션 외부에서 실행되어야 다음 사용 가능.
-- 별도 마이그레이션으로 분리할 수도 있으나 supabase migration up은 각 파일을 별도 트랜잭션으로 실행하므로 안전.
