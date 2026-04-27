-- 로컬 개발 전용: pgcrypto 키 + auth 사용자 사전 생성.
-- 절대 운영에 적용하지 말 것.
--
-- 본 파일은 supabase config.toml [db.seed] sql_paths 에 등록되어
-- `supabase db reset` 시 마이그레이션 적용 직후에 실행된다.
--
-- ⚠️ 마이그레이션 70(`20260427000070_seed.sql`)의 public.users INSERT는
--    auth.users(id) FK 를 요구하므로, 본 파일이 마이그레이션 70 이후에 실행되면
--    FK 위반이 발생한다. 따라서 마이그레이션 70 자체에서 auth 사용자를 사전 생성한다
--    (마이그레이션 70 상단 PRE-SEED 블록 참조).
--    본 파일은 멱등성 보장(ON CONFLICT DO NOTHING)으로 추가 안전망 역할.

-- 1) PII 키 주입
--    PG17 부터 일반 role 의 ALTER DATABASE SET <custom guc> 가 거부되므로
--    role 수준 default 로 주입한다 (postgres role 이 connection 시작 시 자동 SET).
--    운영에서는 connection-level 에서 애플리케이션이 set_config 로 주입한다.
DO $key$
BEGIN
  EXECUTE 'ALTER ROLE postgres IN DATABASE postgres SET app.pii_encryption_key = ''dev-only-32byte-secret-XXXXXXXXXXXX''';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'cannot set app.pii_encryption_key at role level — connection-level set_config required';
END
$key$;

-- 2) auth.users 멱등 seed (마이그레이션 70 PRE-SEED 와 동일한 행을 재확인)
--    비밀번호: 'algolink-dev-1234' (bcrypt). magic link / password 둘 다 가능.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000aaaa',
    'authenticated', 'authenticated',
    'admin@algolink.local',
    crypt('algolink-dev-1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb,
    NOW(), NOW(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000bbbb',
    'authenticated', 'authenticated',
    'operator@algolink.local',
    crypt('algolink-dev-1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"operator"}'::jsonb,
    NOW(), NOW(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-00000000cccc',
    'authenticated', 'authenticated',
    'instructor1@algolink.local',
    crypt('algolink-dev-1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"instructor"}'::jsonb,
    NOW(), NOW(),
    '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- 3) auth.identities — 이메일 로그인이 동작하려면 identity 행이 필요하다.
--    provider_id = email, identity_data 에 email 포함.
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000aaaa',
    'admin@algolink.local',
    'email',
    jsonb_build_object('sub', '00000000-0000-0000-0000-00000000aaaa', 'email', 'admin@algolink.local', 'email_verified', true, 'phone_verified', false),
    NOW(), NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000bbbb',
    'operator@algolink.local',
    'email',
    jsonb_build_object('sub', '00000000-0000-0000-0000-00000000bbbb', 'email', 'operator@algolink.local', 'email_verified', true, 'phone_verified', false),
    NOW(), NOW(), NOW()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000cccc',
    'instructor1@algolink.local',
    'email',
    jsonb_build_object('sub', '00000000-0000-0000-0000-00000000cccc', 'email', 'instructor1@algolink.local', 'email_verified', true, 'phone_verified', false),
    NOW(), NOW(), NOW()
  )
ON CONFLICT (provider_id, provider) DO NOTHING;
