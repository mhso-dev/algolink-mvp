---
id: SPEC-DB-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: low
issue_number: null
related: [SPEC-DB-001, SPEC-SEED-002]
---

# SPEC-DB-002: db:verify Pending Migrations 가드

## HISTORY

- 2026-04-28 (v0.1.0): 최초 초안 작성. Phase 2 종결 작업 중 `users.is_active` 컬럼 누락(20260428120000_admin_user_active.sql 미적용)이 `pnpm db:verify` 18/18 PASS 를 통과하고 `/admin/users` 접근 시점에 PG 42703 으로 폭발한 사건이 트리거.

## 1. 배경 (Background)

2026-04-28 Phase 2 종결 점검 과정에서, `supabase/migrations/20260428120000_admin_user_active.sql` 이 로컬 DB 에 미적용 상태였음에도 `pnpm db:verify` 가 18/18 PASS 를 반환했다. 이는 db:verify 가 "테이블/컬럼 존재 + RLS 정책 + 기본 시드" 만 검사하고, **마이그레이션 적용 일관성** 자체는 검증하지 않기 때문이다.

결과적으로 누락은 `/admin/users` 페이지 접근 → `users.is_active` 조회 → PostgreSQL 42703 (column does not exist) 시점에야 드러났다. 본 SPEC 은 db:verify 단계에서 **"파일은 존재하나 적용되지 않은 마이그레이션"** 을 즉시 검출하여 동일 사고를 차단하는 것을 목표로 한다.

관련 사건:
- `.moai/reports/phase2-e2e-closure-2026-04-28.md` 종결 보고서 §3 "회귀 위험 진단"
- LESSON-002 (auto-memory `lessons.md`) 미구현 플레이스홀더/누락 마이그레이션 방지 원칙

## 2. 목표 (Goals)

- `pnpm db:verify` 가 `supabase/migrations/` 디렉토리 파일과 `supabase_migrations.schema_migrations` 테이블 적용 목록을 비교한다.
- 차집합(파일 - 적용)이 1건 이상이면 db:verify 가 **즉시 FAIL** 처리되어 후속 단계(시드/E2E/배포)를 차단한다.
- 클라우드 DB 또는 schema_migrations 테이블이 부재한 환경에서는 검사를 skip 하여 false-positive 를 만들지 않는다.

## 3. 비목표 / Exclusions (What NOT to Build)

- [HARD] `pnpm dev` / `pnpm e2e` 시작 hook 에 동일 가드를 추가하는 작업은 본 SPEC 의 범위가 아니다 → 후속 SPEC 으로 분리.
- [HARD] 마이그레이션 자동 적용 (`supabase db reset`, `supabase migration up`) 은 본 SPEC 이 수행하지 않는다. 검출만 하고, 적용 여부 판단은 운영자 몫이다.
- [HARD] `down` 마이그레이션, 롤백 추적, 마이그레이션 해시 검증은 비목표.
- [HARD] CI 환경의 GitHub Actions 워크플로 변경은 본 SPEC 에 포함되지 않는다.

## 4. EARS Requirements

### REQ-DB002-001 (Event-Driven)

**WHEN** `pnpm db:verify` 가 실행되면 **THEN** 시스템은 `supabase/migrations/` 디렉토리의 SQL 파일 목록(파일명 timestamp 기준)과 `supabase_migrations.schema_migrations.version` 테이블의 적용 목록을 비교하여 차집합을 보고한다.

### REQ-DB002-002 (State-Driven / Constraint)

**IF** `supabase_migrations.schema_migrations` 테이블이 존재하지 않는 환경(클라우드 DB, 또는 Supabase CLI 가 아닌 일반 PostgreSQL) **THEN** 시스템은 본 검사를 skip 처리하고 stdout 에 "Pending Migrations check skipped (schema_migrations table not found)" 메시지를 출력한다.

### REQ-DB002-003 (Ubiquitous)

차집합(파일 timestamp - 적용 timestamp)이 1건 이상이면, db:verify 는 exit code 1 로 종료하고 stderr 에 누락된 timestamp 목록(파일명 포함)을 출력한다.

### REQ-DB002-004 (Event-Driven, AC 통합)

**WHEN** Pending Migrations 검사가 정상 수행되면 **THEN** 기존 AC 카운트에 1건이 추가되어 (예: 18 → 19) AC 출력 라인에 "AC-DB002-MIG-PENDING" 항목이 명시된다.

## 5. 기술 제약 (Technical Constraints)

- 대상 스크립트: `scripts/db-verify.ts` (TypeScript, Node 실행).
- DB 클라이언트: 기존 db-verify.ts 가 사용 중인 Supabase / pg 클라이언트를 재사용하며 신규 의존성 추가 금지.
- 파일 timestamp 추출: 파일명 패턴 `^(\d{14})_.*\.sql$` 의 첫 번째 캡처 그룹을 사용한다.
- schema_migrations 조회: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` (읽기 전용).
- skip 판정: `to_regclass('supabase_migrations.schema_migrations')` 가 NULL 인 경우.
- Exit code: 1건 이상 누락 시 `process.exit(1)`, skip 또는 0건 누락 시 정상 흐름 유지.

## 6. 성공 기준 (Success Criteria)

- 1건 이상 누락된 상태로 `pnpm db:verify` 실행 시 exit code 1 + 누락 timestamp stderr 출력이 검증된다.
- 모든 마이그레이션 적용된 상태에서 `pnpm db:verify` 가 19/19 PASS 로 종료한다.
- 클라우드 환경(또는 schema_migrations 부재 환경)에서 db:verify 가 정상 종료하며, 다른 18개 AC 결과에 영향을 주지 않는다.

## 7. 참조 (References)

- 트리거 사건: `.moai/reports/phase2-e2e-closure-2026-04-28.md`
- 선행 SPEC: `.moai/specs/SPEC-DB-001/spec.md` (db:verify 본체)
- 선행 SPEC: `.moai/specs/SPEC-SEED-002/spec.md` (seed 일관성)
- auto-memory: `lessons.md` LESSON-002

## 8. 도메인 전문가 자문 권고

- expert-backend: db-verify.ts 보강 시 Supabase 클라이언트 / pg 풀 재사용 패턴 검토 권고.
- expert-devops: 후속 SPEC (pnpm dev/e2e hook 통합) 시점에 자문 권고.
