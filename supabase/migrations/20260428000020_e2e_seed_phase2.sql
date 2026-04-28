-- SPEC-SEED-002 — Phase 2 E2E 시드 보강 (add-only / idempotent)
--
-- 목적:
--   Phase 2 E2E 회귀(SPEC-E2E-002)에서 SKIP 처리되던 PAYOUT/NOTIFY/ADMIN 시나리오를
--   PASS 로 전환하기 위한 시드 보강.
--
-- 추가 항목:
--   1. 보조 operator: operator2@algolink.local (auth.users + auth.identities + public.users)
--   2. pending settlement 행 +2 건 (총 ≥ 4건 확보, PAYOUT 1 + NOTIFY 1 + buffer 2)
--      - 신규 project 1건 추가하여 (project_id, instructor_id) 충돌 회피
--
-- 원칙:
--   - 070_seed.sql 의 어떤 행도 수정하지 않는다 (add-only).
--   - 모든 INSERT 는 ON CONFLICT DO NOTHING 으로 멱등성 보장.
--   - operator@algolink.local 의 자격 증명은 절대 변경하지 않는다.
--
-- 관련 SPEC: SPEC-SEED-002, SPEC-DB-001, SPEC-E2E-002, SPEC-ADMIN-001

-- 070 과 동일하게 PII 키가 미설정이면 dev placeholder 로 세팅 (멱등 보장).
DO $$
BEGIN
  PERFORM current_setting('app.pii_encryption_key', false);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.pii_encryption_key', 'dev-only-32byte-secret-XXXXXXXXXXXX', true);
END $$;

-- ===========================================
-- 1. 보조 operator (operator2@algolink.local)
--    auth.users → auth.identities → public.users 순서
-- ===========================================
DO $auth_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES
      (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-00000000bbb2',
        'authenticated', 'authenticated',
        'operator2@algolink.local',
        crypt('DevOperator2!2026', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"operator"}'::jsonb,
        NOW(), NOW(),
        '', '', '', ''
      )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES
      (
        gen_random_uuid(),
        '00000000-0000-0000-0000-00000000bbb2',
        'operator2@algolink.local',
        'email',
        jsonb_build_object('sub', '00000000-0000-0000-0000-00000000bbb2', 'email', 'operator2@algolink.local', 'email_verified', true, 'phone_verified', false),
        NOW(), NOW(), NOW()
      )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END IF;
END
$auth_seed$;

INSERT INTO users (id, role, name_kr, email) VALUES
  ('00000000-0000-0000-0000-00000000bbb2', 'operator', '운영자2', 'operator2@algolink.local')
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 2. 추가 프로젝트 2건 (corporate)
--    settlements 의 (project_id, instructor_id) 충돌 회피 + instructor_1 (user_id 연결됨) 재사용.
--    instructor_2/3 은 user_id=NULL 이므로 sendSettlementRequestStub 가 실패한다.
--    PAYOUT/NOTIFY e2e 시나리오의 mail 발송 의존을 만족시키려면 user_id 가 있는 instructor_1 사용.
-- ===========================================
INSERT INTO projects (id, title, project_type, status, client_id, operator_id, instructor_id,
                      business_amount_krw, instructor_fee_krw, settlement_flow_hint, created_by) VALUES
  ('40000000-0000-0000-0000-000000000003', '감마 사내 Python 교육 (corporate)', 'education', 'in_progress',
   '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000bbbb', '30000000-0000-0000-0000-000000000001',
   5000000, 3000000, 'corporate',
   '00000000-0000-0000-0000-00000000bbbb'),
  ('40000000-0000-0000-0000-000000000004', '델타 사내 Next.js 교육 (corporate)', 'education', 'in_progress',
   '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000bbbb', '30000000-0000-0000-0000-000000000001',
   3000000, 1800000, 'corporate',
   '00000000-0000-0000-0000-00000000bbbb')
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 3. 추가 pending 정산 2건 (총 pending ≥ 4)
--    instructor_1 (user_id=cccc 연결) 사용 → mail-stub 성공 보장.
--    PAYOUT 시나리오는 created_at desc 정렬 후 첫 행을 사용하므로,
--    여기서 추가한 settlement 가 070 의 settlement #1, #2 보다 먼저 표시된다.
-- ===========================================
INSERT INTO settlements (id, project_id, instructor_id, settlement_flow, status,
                         business_amount_krw, instructor_fee_krw, withholding_tax_rate, created_by) VALUES
  ('50000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
   'corporate', 'pending', 5000000, 3000000, 0,
   '00000000-0000-0000-0000-00000000bbbb'),
  ('50000000-0000-0000-0000-000000000004',
   '40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
   'corporate', 'pending', 3000000, 1800000, 0,
   '00000000-0000-0000-0000-00000000bbbb')
ON CONFLICT (id) DO NOTHING;
