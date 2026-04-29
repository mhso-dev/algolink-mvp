-- SPEC-RECEIPT-001 M1 — organization_info singleton 테이블
-- @MX:ANCHOR: REQ-RECEIPT-PDF-003 — 알고링크 사업자 정보 단일 소스.
-- @MX:REASON: 영수증 PDF 발급 시 알고링크 정보가 모든 영수증에서 일관되어야 함.

CREATE TABLE IF NOT EXISTS organization_info (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL,
  business_number text NOT NULL,
  representative text NOT NULL,
  address text NOT NULL,
  contact text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_info ENABLE ROW LEVEL SECURITY;

-- admin은 RW
DROP POLICY IF EXISTS org_info_admin_all ON organization_info;
CREATE POLICY org_info_admin_all ON organization_info FOR ALL TO authenticated
USING (app.current_user_role() = 'admin')
WITH CHECK (app.current_user_role() = 'admin');

-- operator + admin은 SELECT
DROP POLICY IF EXISTS org_info_operator_select ON organization_info;
CREATE POLICY org_info_operator_select ON organization_info FOR SELECT TO authenticated
USING (app.current_user_role() IN ('operator', 'admin'));

-- service_role 전체 (영수증 발급 시 server-side에서 fallback 활용)
DROP POLICY IF EXISTS org_info_service_all ON organization_info;
CREATE POLICY org_info_service_all ON organization_info FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- placeholder seed (TBD 행) — 운영 환경에서는 admin이 직접 UPDATE
INSERT INTO organization_info (id, name, business_number, representative, address, contact)
VALUES (1, '주식회사 알고링크', '000-00-00000', '대표자명', '서울특별시 (TBD)', '02-0000-0000')
ON CONFLICT (id) DO NOTHING;
