-- SPEC-DB-001 M1 — PII 암호화/복호화 + 접근 로그.
-- REQ-DB001-PII, REQ-DB001-PII-KEY, REQ-DB001-PII-DECRYPT, REQ-DB001-PII-LOG.
--
-- 키 관리: 애플리케이션이 매 connection 시작 시 다음을 실행한다:
--   SELECT set_config('app.pii_encryption_key', current_setting('PII_ENCRYPTION_KEY'), true);
-- 또는 DB 수준에서:
--   ALTER DATABASE postgres SET app.pii_encryption_key = '...';

CREATE SCHEMA IF NOT EXISTS app;

-- ===========================================
-- PII 접근 로그 (먼저 생성 — decrypt_pii가 INSERT 함)
-- ===========================================
CREATE TABLE IF NOT EXISTS pii_access_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id   uuid,
  target_instructor_id uuid,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_caller       ON pii_access_log(caller_id);
CREATE INDEX IF NOT EXISTS idx_pii_access_log_target       ON pii_access_log(target_instructor_id);
CREATE INDEX IF NOT EXISTS idx_pii_access_log_accessed_at  ON pii_access_log(accessed_at DESC);

-- ===========================================
-- 현재 사용자 역할 헬퍼 (JWT claim → 'admin'|'operator'|'instructor')
-- RLS 정책에서 광범위하게 사용.
-- ===========================================
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'role'),
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  );
$$;

-- ===========================================
-- PII 암호화: plaintext → bytea
-- NULL 입력은 NULL 반환 (체이닝 안전).
-- ===========================================
CREATE OR REPLACE FUNCTION app.encrypt_pii(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF plaintext IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;

-- ===========================================
-- PII 복호화: bytea → plaintext (admin/operator만 허용 + 접근 로그 기록)
-- REQ-DB001-PII-DECRYPT, REQ-DB001-PII-LOG.
-- ===========================================
CREATE OR REPLACE FUNCTION app.decrypt_pii(ciphertext bytea, target_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_role text;
BEGIN
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;

  v_role := app.current_role();
  IF v_role NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'permission denied for PII decryption (role=%)', v_role
      USING ERRCODE = '42501';
  END IF;

  -- 접근 로그 기록 (auth.uid()가 NULL이어도 기록 허용 — caller_id nullable).
  INSERT INTO pii_access_log (caller_id, target_instructor_id)
  VALUES (auth.uid(), target_id);

  RETURN pgp_sym_decrypt(
    ciphertext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;

-- 함수 실행 권한 — authenticated 사용자만 (anon 차단).
REVOKE ALL ON FUNCTION app.encrypt_pii(text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION app.decrypt_pii(bytea, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_role()            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.encrypt_pii(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.decrypt_pii(bytea, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_role()            TO authenticated, anon, service_role;
