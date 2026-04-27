# Algolink

AI Agentic Platform — 한국 교육 컨설팅 워크플로우 MVP.

## 기술 스택

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4
- Supabase (Postgres 16, Auth, Storage)
- Drizzle ORM + Drizzle Kit
- pnpm

## 개발 환경 준비

```bash
# 의존성 설치
pnpm install

# 환경변수 설정 — .env.local 파일 생성
cp .env.example .env.local
# 필수 값:
#   DATABASE_URL=postgresql://...
#   SUPABASE_URL=...
#   SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   PII_ENCRYPTION_KEY=...   # pgcrypto symmetric key (32+ byte 권장)

# Supabase 로컬 실행 (선택)
pnpm supabase:start
pnpm supabase:reset

# DB 검증 스크립트 (SPEC-DB-001 acceptance)
pnpm db:verify

# 개발 서버
pnpm dev
```

## 디렉토리 구조

- `src/app/` — Next.js App Router 페이지
- `src/db/` — Drizzle 스키마, enums, client (SPEC-DB-001)
- `supabase/migrations/` — SQL 마이그레이션 (RLS, pgcrypto, EXCLUSION, seed)
- `scripts/` — 검증 및 운영 스크립트
- `.moai/specs/SPEC-*/` — SPEC 문서 (요구사항, 계획, 수용 기준)

## SPEC 추적

- **SPEC-DB-001** — 초기 데이터베이스 스키마 (진행 중)
