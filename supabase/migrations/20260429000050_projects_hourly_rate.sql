-- SPEC-PAYOUT-002 §M1 — projects 신규 컬럼 (hourly_rate_krw + instructor_share_pct)
-- REQ-PAYOUT002-PROJECT-FIELDS-001/002
--
-- 가역(safe). DOWN: ALTER TABLE projects DROP COLUMN ...
-- 다만 운영자가 입력한 시급/분배율 값은 영구 손실 — 롤백 전 백업 권장.

ALTER TABLE "projects"
  ADD COLUMN "hourly_rate_krw" bigint NOT NULL DEFAULT 0,
  ADD COLUMN "instructor_share_pct" numeric(5,2) NOT NULL DEFAULT 0;

-- CHECK constraints (REQ-PAYOUT002-PROJECT-FIELDS-001)
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_hourly_rate_krw_check"
    CHECK ("hourly_rate_krw" >= 0),
  ADD CONSTRAINT "projects_instructor_share_pct_check"
    CHECK ("instructor_share_pct" >= 0 AND "instructor_share_pct" <= 100);

-- 데이터 이행 가이드 (REQ-PAYOUT002-PROJECT-FIELDS-002):
-- 기존 projects 행은 hourly_rate_krw=0 / instructor_share_pct=0으로 시작.
-- 운영자는 /projects/[id]/edit에서 값을 입력해야 정산 generate가 정상 산출됨.
-- business_amount_krw / instructor_fee_krw 컬럼은 SPEC-PAYOUT-001과의 backward compat을 위해 보존.
COMMENT ON COLUMN "projects"."hourly_rate_krw" IS
  'SPEC-PAYOUT-002 시간당 사업비 (KRW). 운영자가 등록 시 입력. 0이면 정산 산식 결과 0.';
COMMENT ON COLUMN "projects"."instructor_share_pct" IS
  'SPEC-PAYOUT-002 강사 분배율 (%, numeric(5,2)). 0~100 범위.';
