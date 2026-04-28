-- One-time: align cloud auth.users passwords with login-form.tsx DEV_TEST_ACCOUNTS
-- so the dev quick-login buttons work on the deployed Vercel preview/prod.
-- seed.sql originally used 'algolink-dev-1234' for admin/operator/instructor1; the
-- form has since standardized on Dev{Role}!2026. This script syncs cloud to form.
--
-- pgcrypto lives in `extensions` schema on Supabase Cloud, so explicitly qualify
-- crypt/gen_salt to avoid search_path issues.
UPDATE auth.users
   SET encrypted_password = extensions.crypt('DevAdmin!2026', extensions.gen_salt('bf'))
 WHERE email = 'admin@algolink.local';

UPDATE auth.users
   SET encrypted_password = extensions.crypt('DevOperator!2026', extensions.gen_salt('bf'))
 WHERE email = 'operator@algolink.local';

UPDATE auth.users
   SET encrypted_password = extensions.crypt('DevInstructor!2026', extensions.gen_salt('bf'))
 WHERE email = 'instructor1@algolink.local';

-- operator2 is already DevOperator2!2026 from 028_e2e_seed_phase2.sql; no-op for safety.
UPDATE auth.users
   SET encrypted_password = extensions.crypt('DevOperator2!2026', extensions.gen_salt('bf'))
 WHERE email = 'operator2@algolink.local';
