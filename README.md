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

## 테스트

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint
pnpm test:unit       # node:test 기반 단위 테스트 (332 tests)
pnpm e2e             # Playwright E2E (Phase 1 SPEC 시나리오)
```

## 디렉토리 구조

- `src/app/` — Next.js App Router ((auth) / (app)/(instructor|operator|admin) route groups)
- `src/auth/` — Supabase Auth 도메인 레이어 (roles, guards, errors, events) — SPEC-AUTH-001
- `src/utils/supabase/` — `@supabase/ssr` SDK 어댑터 (server/client/middleware)
- `src/lib/` — 도메인 쿼리/유틸 (dashboard, instructor, projects, recommend, ai)
- `src/db/` — Drizzle 스키마, enums, client — SPEC-DB-001
- `supabase/migrations/` — SQL 마이그레이션 (RLS, pgcrypto, auth hook, invitations, audit)
- `e2e/` — Playwright E2E 시나리오 (auth + dashboard + instructor + project + me)
- `scripts/` — 검증 및 운영 스크립트 (`pnpm auth:bootstrap-admin`, `pnpm db:verify`)
- `docs/` — 운영 문서 (`auth-architecture.md`, `auth-bootstrap.md`)
- `.moai/specs/SPEC-*/` — SPEC 문서 (요구사항, 계획, 수용 기준)

## SPEC 추적 (Phase 1)

| SPEC | 영역 | 상태 |
|---|---|---|
| SPEC-DB-001 | 초기 데이터베이스 스키마 (Drizzle + RLS) | 완료 |
| SPEC-AUTH-001 | Supabase Auth + 역할 기반 라우팅 + custom_access_token_hook | 완료 |
| SPEC-LAYOUT-001 | 역할별 레이아웃 셸 (instructor/operator/admin) | 완료 |
| SPEC-DASHBOARD-001 | Operator 대시보드 KPI | 완료 |
| SPEC-INSTRUCTOR-001 | 강사 등록/이력서/매칭 | 완료 |
| SPEC-PROJECT-001 | 프로젝트 CRUD + KPI rank | 완료 |
| SPEC-ME-001 | 마이페이지 (지급 정보 pgcrypto 암호화) | 완료 |
| SPEC-PROJECT-SEARCH-001 | 프로젝트 리스트 다중 컬럼 검색 (title + clients.company_name + notes) | 완료 |
| SPEC-E2E-001 | Phase 1 골든패스 E2E 회귀 스위트 (Playwright) | 완료 |

## SPEC 추적 (Phase 2)

| SPEC | 영역 | 상태 |
|---|---|---|
| SPEC-CLIENT-001 | 고객사 관리 (F-204) — 등록/조회/메모/사업자등록증 업로드 | 완료 |
| SPEC-PAYOUT-001 | 정산 관리 (F-205) — 4-state 머신 + 세율 검증 + 매입매출 | 완료 |
| SPEC-ADMIN-001 | 회원·권한 (F-301) + 매출매입 집계 (F-302) — users.is_active 도입 | 완료 |

## 코드 컨텍스트 (@MX 태그)

핵심 invariant와 회귀 위험은 코드에 직접 `@MX:ANCHOR` / `@MX:WARN` 으로 고정.
규약: `.claude/rules/moai/workflow/mx-tag-protocol.md`
