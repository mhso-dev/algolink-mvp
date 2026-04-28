-- One-time cloud Supabase schema reset (SPEC-DEPLOY-001).
-- Used to align cloud DB with local migrations after refactoring drift.
-- Drops public schema and migration history; subsequent `supabase db push`
-- re-applies the canonical local migrations + seed.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
DROP SCHEMA IF EXISTS app CASCADE;
DELETE FROM supabase_migrations.schema_migrations;
-- Clean dev seed identities/users in auth schema by email (covers signup-created
-- variants with random UUIDs, not just the deterministic seed UUIDs).
DELETE FROM auth.identities
 WHERE user_id IN (
   SELECT id FROM auth.users WHERE email IN (
     'admin@algolink.local',
     'operator@algolink.local',
     'operator2@algolink.local',
     'instructor1@algolink.local',
     'instructor2@algolink.local',
     'instructor3@algolink.local'
   )
 );
DELETE FROM auth.users WHERE email IN (
  'admin@algolink.local',
  'operator@algolink.local',
  'operator2@algolink.local',
  'instructor1@algolink.local',
  'instructor2@algolink.local',
  'instructor3@algolink.local'
);
