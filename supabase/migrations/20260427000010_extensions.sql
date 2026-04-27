-- SPEC-DB-001 M1 — PostgreSQL 확장 활성화.
-- pgcrypto: PII 암호화 (pgp_sym_encrypt/decrypt).
-- btree_gist: schedule_items EXCLUSION constraint에서 uuid 동등 비교 + tstzrange &&.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
