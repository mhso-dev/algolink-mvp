---
id: SPEC-DB-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
priority: low
related: [SPEC-DB-001, SPEC-SEED-002]
---

# SPEC-DB-002 Implementation Plan

## 1. 구현 개요 (Implementation Overview)

`scripts/db-verify.ts` 에 "Pending Migrations" 검사 단계를 신규 추가한다. 검사는 (a) `supabase/migrations/` 디렉토리의 SQL 파일 timestamp 목록, (b) `supabase_migrations.schema_migrations.version` 테이블의 적용 timestamp 목록을 수집하고, 두 집합의 차집합(파일 - 적용)이 비어있지 않으면 FAIL 로 처리한다. schema_migrations 테이블이 부재한 환경에서는 skip 처리하여 false-positive 를 회피한다.

## 2. 기술 접근 (Technical Approach)

### 2.1 데이터 소스

- **파일 측**: `fs.readdirSync('supabase/migrations')` 결과에서 정규식 `^(\d{14})_.*\.sql$` 매칭 timestamp 추출.
- **DB 측**: 기존 db-verify.ts 의 Supabase / pg 클라이언트로 `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` 조회.
- **존재 체크**: `SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_table`.

### 2.2 흐름

1. `to_regclass` 결과가 NULL → skip 메시지 출력 후 검사 종료 (다른 AC 영향 없음).
2. 파일 timestamp 집합 `F` 와 적용 timestamp 집합 `A` 수집.
3. `pending = F \ A` 계산.
4. `pending.size === 0` → AC-DB002-MIG-PENDING PASS.
5. `pending.size >= 1` → AC FAIL, stderr 에 누락 목록 출력, `process.exit(1)`.

### 2.3 출력 포맷

```
[AC-DB002-MIG-PENDING] Checking pending migrations...
  Filesystem: 12 migration files
  Applied:    11 entries in schema_migrations
  Pending:    1 file(s)
    - 20260428120000_admin_user_active.sql
[AC-DB002-MIG-PENDING] FAIL — apply pending migrations and re-run.
```

skip 케이스:

```
[AC-DB002-MIG-PENDING] Skipped (schema_migrations table not found — likely cloud DB).
```

## 3. 마일스톤 (Milestones, Priority-based)

### Milestone M1 (Priority: High) — schema_migrations 존재 여부 사전 체크

- 산출물: `to_regclass` 쿼리 헬퍼 함수
- 검증: skip 분기가 정상 동작하며 다른 AC 결과 미영향 확인
- 의존: 없음

### Milestone M2 (Priority: High) — 파일 vs 적용 차집합 계산

- 산출물: 파일 timestamp 추출 함수 + DB 적용 목록 조회 + 차집합 로직
- 검증: 단위 테스트(또는 dry-run) 로 파일 5개 / 적용 4개 시 차집합 1개 검출 확인
- 의존: M1

### Milestone M3 (Priority: High) — AC 출력 통합

- 산출물: db-verify.ts 의 AC 카운터에 AC-DB002-MIG-PENDING 항목 추가, PASS/FAIL/SKIP 분기 출력
- 검증: 정상 시 19/19, FAIL 시 18/19 + 누락 timestamp stderr 출력
- 의존: M2

### Milestone M4 (Priority: Medium) — 1건 누락 시뮬레이션 검증

- 산출물: 로컬에서 마지막 마이그레이션을 의도적으로 미적용한 상태에서 db:verify 실행, FAIL 동작 검증
- 검증: AC-DB002-MIG-PENDING-FAIL 시나리오 통과
- 의존: M3

### Milestone M5 (Priority: Low) — 종결 보고

- 산출물: SPEC-DB-002 종결 메모(또는 reports 갱신) + auto-memory 갱신
- 검증: status: completed, sync 완료
- 의존: M4

## 4. 위험 및 완화 (Risks & Mitigation)

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| Supabase CLI 버전 차이로 schema_migrations 스키마/컬럼 명이 다른 경우 | 검사 동작 불능 | `to_regclass` 사전 체크 + `version` 컬럼 SELECT 시 실패 catch → skip 으로 폴백 |
| 클라우드 환경에서 권한 부족으로 schema_migrations 조회 실패 | 정상 환경에서 FAIL 오탐 | 권한 오류 catch → skip 처리, stdout 경고 메시지 |
| 파일명 규칙 외 파일(README, .keep 등) 혼입 | 차집합 오탐 | 정규식 매칭 실패 항목은 무시 |
| timestamp 정렬/포맷 불일치 (예: 14자리 vs 17자리) | 동일 마이그레이션을 다르게 인식 | 14자리 정규식으로 통일, 추출 후 문자열 비교 |
| 후속 hook 통합 SPEC 미수립 시 동일 사고 재현 가능 | 중복 사고 | 본 SPEC 종결 보고에서 후속 SPEC 추적 ID 명시 |

## 5. 검증 전략 (Verification Strategy)

- M2 산출 후: 인메모리 시뮬레이션으로 차집합 로직 단위 검증.
- M3 산출 후: `pnpm db:verify` 실행, 정상 케이스 19/19 PASS 확인.
- M4: 로컬 DB 에서 최신 마이그레이션을 임시로 미적용 상태로 두고 `pnpm db:verify` 가 18/19 + stderr 출력 후 exit 1 종료하는지 확인.
- 클라우드 시뮬레이션: schema_migrations 부재 시나리오 (예: `DROP SCHEMA supabase_migrations CASCADE` 후 재실행) → skip 메시지 확인 후 다른 AC 결과 무변화 검증.

## 6. 구현 노트 (Implementation Notes)

- 신규 라이브러리 도입 금지. `node:fs`, 기존 Supabase 클라이언트만 사용.
- AC 카운터 증가에 따라 reports/문서의 "18/18" 표기 영역(특히 `.moai/reports/phase2-e2e-closure-2026-04-28.md` 후속 보고)이 자연스럽게 19/19 로 변경됨을 인지.
- 후속 SPEC (예: SPEC-DB-003 "dev/e2e startup 가드") 와 검사 로직 재사용을 고려해, 차집합 함수는 export 가능한 형태로 작성하는 것을 권고 (의무는 아님 — 실제 구조 결정은 Run 단계에서).
