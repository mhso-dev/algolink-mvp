-- SPEC-ME-001 §2.7 M7 — 강사 본인 지급 정보 암호화/복호화 RPC.
-- REQ-ME-PAYOUT-003, REQ-ME-PAYOUT-005, REQ-ME-PAYOUT-008.
--
-- 배경:
--   SPEC-DB-001의 `app.encrypt_pii(text)` 는 authenticated GRANT 되어 있으나,
--   `app.decrypt_pii(bytea, uuid)` 는 admin/operator 만 호출 가능(REQ-DB001-PII-DECRYPT).
--   강사 본인이 자기 row의 평문을 다시 보려면 별도 RPC가 필요하다 — 다음 함수들이
--   본인 instructor row 에 한해 평문을 반환한다 (RLS 우회는 SECURITY DEFINER + ownership 체크).
--
-- 키 관리:
--   기존 SPEC-DB-001과 동일한 `app.pii_encryption_key` GUC를 사용한다 (별도 키 분리하지 않음).
--   key_label 인자는 향후 멀티 키 지원을 위한 reserved parameter (현재는 'default'만 허용).

-- ===========================================
-- 강사 본인 → 평문 → bytea (encrypt)
-- 의미상 SPEC-DB-001 app.encrypt_pii 와 동일하나, key_label 파라미터로 향후 호환성 확보.
-- ===========================================
CREATE OR REPLACE FUNCTION app.encrypt_payout_field(plaintext text, key_label text DEFAULT 'default')
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF plaintext IS NULL OR length(plaintext) = 0 THEN
    RETURN NULL;
  END IF;

  IF key_label IS DISTINCT FROM 'default' THEN
    RAISE EXCEPTION 'unsupported key_label: % (only ''default'' is allowed in M7)', key_label
      USING ERRCODE = '22023';
  END IF;

  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;

-- ===========================================
-- 강사 본인 → bytea → 평문 (decrypt, 본인 row 만)
-- ownership 체크: caller(auth.uid()) 가 ciphertext 를 보유한 instructors.user_id 와 일치해야 함.
-- 호출처(Server Action) 에서 instructor_id 를 명시적으로 넘기게 하여 임의 ciphertext 디코딩 방지.
-- ===========================================
CREATE OR REPLACE FUNCTION app.decrypt_payout_field(
  ciphertext bytea,
  owner_instructor_id uuid,
  key_label text DEFAULT 'default'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_owner_user_id uuid;
  v_caller        uuid;
BEGIN
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;

  IF key_label IS DISTINCT FROM 'default' THEN
    RAISE EXCEPTION 'unsupported key_label: %', key_label
      USING ERRCODE = '22023';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_owner_user_id
  FROM public.instructors
  WHERE id = owner_instructor_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_owner_user_id IS NULL OR v_owner_user_id <> v_caller THEN
    -- 본인 row 가 아니면 거부 (admin/operator 는 SPEC-DB-001 app.decrypt_pii 사용).
    RAISE EXCEPTION 'permission denied: payout decrypt restricted to row owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN pgp_sym_decrypt(
    ciphertext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;

-- ===========================================
-- 권한 — authenticated 만. anon 차단.
-- ===========================================
REVOKE ALL ON FUNCTION app.encrypt_payout_field(text, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION app.decrypt_payout_field(bytea, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.encrypt_payout_field(text, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.decrypt_payout_field(bytea, uuid, text) TO authenticated, service_role;
