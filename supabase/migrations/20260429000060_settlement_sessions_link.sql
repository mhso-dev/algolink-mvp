-- SPEC-PAYOUT-002 §M1 — settlement_sessions junction (이중 청구 방지)
-- REQ-PAYOUT002-LINK-001/002/004/005/006, REQ-PAYOUT002-RLS-002
--
-- 가역(safe). DOWN: DROP TABLE settlement_sessions CASCADE;

-- ===========================================
-- 1. junction table
-- ===========================================
CREATE TABLE "settlement_sessions" (
  "settlement_id" uuid NOT NULL REFERENCES "settlements"("id") ON DELETE CASCADE,
  "lecture_session_id" uuid NOT NULL REFERENCES "lecture_sessions"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("settlement_id", "lecture_session_id")
);

-- ===========================================
-- 2. UNIQUE INDEX on lecture_session_id (HIGH-2 / REQ-LINK-002 / -006)
-- ===========================================
-- 단일 컬럼 UNIQUE — concurrent generate 시 같은 lecture_session이 두 settlement에 link되는
-- race-condition을 DB layer에서 차단. 두 번째 INSERT는 SQLSTATE 23505로 거부됨.
-- application-layer NOT IN 필터는 UI 미리보기 zero-result 처리용으로 보존하지만,
-- 권위 있는(authoritative) double-billing guard는 본 UNIQUE INDEX다.
CREATE UNIQUE INDEX "settlement_sessions_lecture_session_unique"
  ON "settlement_sessions"("lecture_session_id");

-- 보조 인덱스 (settlement_id 단일 키 lookup 가속)
CREATE INDEX "idx_settlement_sessions_settlement"
  ON "settlement_sessions"("settlement_id");

-- ===========================================
-- 3. RLS — REQ-PAYOUT002-RLS-002
-- ===========================================
ALTER TABLE "settlement_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_sessions" FORCE ROW LEVEL SECURITY;

-- (a) admin: 모든 권한
CREATE POLICY "settlement_sessions_admin_all" ON "settlement_sessions"
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- (b) operator: SELECT/INSERT/DELETE
CREATE POLICY "settlement_sessions_operator_select" ON "settlement_sessions"
  FOR SELECT TO authenticated
  USING (app.is_operator_or_admin());

CREATE POLICY "settlement_sessions_operator_insert" ON "settlement_sessions"
  FOR INSERT TO authenticated
  WITH CHECK (app.is_operator_or_admin());

CREATE POLICY "settlement_sessions_operator_delete" ON "settlement_sessions"
  FOR DELETE TO authenticated
  USING (app.is_operator_or_admin());

-- (c) instructor: 본인 settlement에 link된 row만 SELECT (Scenario 15)
CREATE POLICY "settlement_sessions_instructor_self_select" ON "settlement_sessions"
  FOR SELECT TO authenticated
  USING (
    app.is_instructor()
    AND "settlement_id" IN (
      SELECT "id" FROM "settlements"
      WHERE "instructor_id" IN (
        SELECT "id" FROM "instructors" WHERE "user_id" = auth.uid()
      )
    )
  );
