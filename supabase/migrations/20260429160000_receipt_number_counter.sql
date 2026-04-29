-- SPEC-RECEIPT-001 M1 — receipt_counters 테이블 + 영수증 번호 atomic 발급 함수
-- @MX:ANCHOR: REQ-RECEIPT-COLUMNS-002 — 동시성 안전 + 연도별 reset.
-- @MX:REASON: INSERT ... ON CONFLICT DO UPDATE ... RETURNING은 row-level lock으로 atomicity 보장.
-- @MX:WARN: 본 테이블은 직접 INSERT/UPDATE 금지 — 반드시 app.next_receipt_number() 함수 경유.
-- @MX:REASON: 직접 조작 시 카운터 일관성 깨짐.

CREATE TABLE IF NOT EXISTS app.receipt_counters (
  year integer PRIMARY KEY,
  counter bigint NOT NULL DEFAULT 0
);

ALTER TABLE app.receipt_counters ENABLE ROW LEVEL SECURITY;
-- No policies — default deny. SECURITY DEFINER function만 접근.

CREATE OR REPLACE FUNCTION app.next_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  cur_year integer;
  cur_counter bigint;
BEGIN
  cur_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Seoul')::integer;

  -- atomic upsert: 신규 연도면 1, 기존 연도면 +1, RETURNING으로 새 값 획득
  INSERT INTO app.receipt_counters(year, counter)
  VALUES (cur_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET counter = app.receipt_counters.counter + 1
  RETURNING counter INTO cur_counter;

  RETURN 'RCP-' || cur_year::text || '-' || LPAD(cur_counter::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO authenticated;
GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO service_role;

COMMENT ON FUNCTION app.next_receipt_number() IS
  'SPEC-RECEIPT-001: atomic per-year receipt number generator. Returns RCP-YYYY-NNNN (4-digit zero-pad).';
