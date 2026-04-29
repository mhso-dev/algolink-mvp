-- SPEC-PAYOUT-002 §M1 — lecture_sessions 신규 엔티티
-- REQ-PAYOUT002-SESSIONS-001/002/006/008, REQ-PAYOUT002-RLS-001
--
-- 가역(safe). DOWN: DROP TABLE lecture_sessions CASCADE; DROP TYPE lecture_session_status;
-- (단 후속 마이그레이션 settlement_sessions 가 의존하므로 함께 롤백 필요)

-- ===========================================
-- 1. enum: lecture_session_status
-- ===========================================
CREATE TYPE "public"."lecture_session_status" AS ENUM (
  'planned',
  'completed',
  'canceled',
  'rescheduled'
);

-- ===========================================
-- 2. table: lecture_sessions
-- ===========================================
-- REQ-PAYOUT002-SESSIONS-001:
--   - hours numeric(4,1) CHECK (hours > 0 AND hours <= 24) (MEDIUM-4)
--   - original_session_id self-FK ON DELETE RESTRICT (LOW-7 — 감사 추적 보존)
--   - instructor_id nullable (배정 전 INSERT 허용)
CREATE TABLE "lecture_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "instructor_id" uuid REFERENCES "instructors"("id") ON DELETE RESTRICT,
  "date" date NOT NULL,
  "hours" numeric(4,1) NOT NULL,
  "status" "public"."lecture_session_status" NOT NULL DEFAULT 'planned',
  "original_session_id" uuid REFERENCES "lecture_sessions"("id") ON DELETE RESTRICT,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  -- REQ-PAYOUT002-SESSIONS-001 / -008 — DB-level defense-in-depth.
  CONSTRAINT "lecture_sessions_hours_range_check"
    CHECK ("hours" > 0 AND "hours" <= 24)
);

-- ===========================================
-- 3. indexes
-- ===========================================
CREATE INDEX "idx_lecture_sessions_project_date"
  ON "lecture_sessions"("project_id", "date");
CREATE INDEX "idx_lecture_sessions_instructor_date"
  ON "lecture_sessions"("instructor_id", "date");
CREATE INDEX "idx_lecture_sessions_deleted"
  ON "lecture_sessions"("deleted_at");
CREATE INDEX "idx_lecture_sessions_original"
  ON "lecture_sessions"("original_session_id")
  WHERE "original_session_id" IS NOT NULL;

-- ===========================================
-- 4. RLS — REQ-PAYOUT002-RLS-001
-- ===========================================
ALTER TABLE "lecture_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lecture_sessions" FORCE ROW LEVEL SECURITY;

-- (a) admin: 모든 권한
CREATE POLICY "lecture_sessions_admin_all" ON "lecture_sessions"
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- (b) operator: SELECT/INSERT/UPDATE 허용 (DELETE는 admin만)
CREATE POLICY "lecture_sessions_operator_select" ON "lecture_sessions"
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY "lecture_sessions_operator_insert" ON "lecture_sessions"
  FOR INSERT TO authenticated
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY "lecture_sessions_operator_update" ON "lecture_sessions"
  FOR UPDATE TO authenticated
  USING (app.is_operator_or_admin())
  WITH CHECK (app.is_operator_or_admin());

-- (c) instructor: 본인 instructor_id 행만 SELECT
CREATE POLICY "lecture_sessions_instructor_self_select" ON "lecture_sessions"
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND "instructor_id" IS NOT NULL
    AND "instructor_id" IN (
      SELECT "id" FROM "instructors" WHERE "user_id" = auth.uid()
    )
  );

-- ===========================================
-- 5. updated_at 트리거 (기존 app.touch_updated_at 함수 재사용)
-- 20260427000050_triggers.sql 의 헬퍼와 동일 패턴.
-- 트리거 명명 규약: trg_<table>_updated_at
-- ===========================================
DROP TRIGGER IF EXISTS "trg_lecture_sessions_updated_at" ON "lecture_sessions";
CREATE TRIGGER "trg_lecture_sessions_updated_at"
  BEFORE UPDATE ON "lecture_sessions"
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
