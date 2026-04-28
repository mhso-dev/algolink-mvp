-- Post-reset recovery: restore service_role default privileges on public schema.
-- After `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` the Supabase initial
-- ALTER DEFAULT PRIVILEGES that auto-grant new public tables to service_role were
-- wiped together with the schema. This script re-applies the equivalent grants so
-- the application's service-role client (createServiceSupabase) can INSERT into
-- audit / log / mutation tables (auth_events, user_invitations, etc.).
--
-- Idempotent: safe to re-run.

-- Schema-level usage (no-op if already granted).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role needs full access to all current public tables/sequences/functions
-- (bypasses RLS, used for admin/audit/encryption helpers).
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Default privileges so future tables created by postgres in public also auto-grant
-- to service_role (matching Supabase's stock setup).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- Same default privileges for the postgres role (default owner) so subsequent
-- migrations creating tables in public propagate ownership/grants correctly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;
