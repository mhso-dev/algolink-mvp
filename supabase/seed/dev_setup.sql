-- 로컬 개발 전용: pgcrypto 키 + auth 사용자 사전 생성.
-- 절대 운영에 적용하지 말 것.

-- 1) PII 키 주입 (DB 수준)
ALTER DATABASE postgres SET app.pii_encryption_key = 'dev-only-32byte-secret-XXXXXXXXXXXX';

-- 2) 샘플 auth 사용자 (admin/operator/instructor) — 비밀번호: 'algolink-dev-1234'
-- 비밀번호 해시는 supabase가 가입 시 생성. 로컬 dev에서는 빈 password로 magic link만 사용 권장.
-- 본 파일은 placeholder. 실제 사용자 생성은 supabase Studio 또는 supabase auth signup으로.
