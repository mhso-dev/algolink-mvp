-- SPEC-PAYOUT-002 §M1 — project_status enum에 'instructor_withdrawn' 값 추가
-- REQ-PAYOUT002-EXCEPT-007 협응 (userStepFromEnum '강사매칭' 매핑)
--
-- ⚠️ 비가역(one-way) 마이그레이션 ⚠️
-- PostgreSQL은 ALTER TYPE ... DROP VALUE 미지원 → post-deploy rollback 경로 없음.
-- production 적용 전 staging dry-run 필수 (SPEC §4.2 + plan.md M1 acceptance gate).
-- 만약 production rollback이 필요하면:
--   1. 모든 instructor_withdrawn 행을 다른 status로 마이그레이션
--   2. 백업 복원
--   3. DROP TYPE project_status CASCADE; CREATE TYPE project_status AS ENUM(...12개 기존 값...);
--   4. 모든 의존 컬럼/인덱스 재생성

ALTER TYPE "public"."project_status"
  ADD VALUE IF NOT EXISTS 'instructor_withdrawn';
