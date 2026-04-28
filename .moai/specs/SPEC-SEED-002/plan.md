---
spec_id: SPEC-SEED-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
---

# SPEC-SEED-002 — 구현 계획 (Plan)

## 1. 개요

본 계획은 SPEC-SEED-002(Phase 2 e2e 시드 보강)의 구현 절차를 마일스톤 단위로 정의한다. 시간 추정은 사용하지 않으며 우선순위 라벨(High / Medium / Low)과 마일스톤 순서로 표현한다.

원칙
- add-only: 기존 파일·행을 절대 수정·삭제하지 않는다.
- idempotent: 모든 INSERT는 `ON CONFLICT DO NOTHING`.
- decision-first: 각 마일스톤은 명확한 산출물(파일·라인 수준)을 갖는다.

## 2. 기술 접근 (Technical Approach)

### 2.1 마이그레이션 파일 명명

- 파일 경로: `supabase/migrations/20260428000010_e2e_seed_phase2.sql`
- 070 시드(`20260427000070_seed.sql`) 이후에 적용되도록 날짜 prefix를 `20260428…`로 고정한다.
- SQL 헤더 코멘트: SPEC-SEED-002 참조, "add-only / idempotent" 명시.

### 2.2 operator2 인증 시드 구조

070 시드에서 operator를 만드는 패턴(`auth.users` → `auth.identities` → `public.users`)을 그대로 따른다.
- `auth.users.id`: `00000000-0000-0000-0000-00000000bbb2` (고정)
- `auth.users.email`: `operator2@algolink.local`
- `auth.users.encrypted_password`: 070과 동일한 `crypt()`/`gen_salt('bf')` 패턴, 평문은 `DevOperator2!2026`
- `auth.identities`: `(provider='email', provider_id=email)`로 매핑, ON CONFLICT 가드
- `public.users`: `id = bbb2`, `role = 'operator'`, `name = 'Operator Two'` (또는 070 컨벤션과 일치)

### 2.3 pending 정산 보강 전략

070 시드의 pending 정산 2건 위에 1건을 추가하여 총 ≥ 3건이 되도록 한다.
- 신규 settlement 행은 기존 `client_*`, `instructor_*`, `project_*` UUID를 재사용한다(070과 충돌 없음).
- 신규 settlement UUID는 `00000000-0000-0000-0000-0000000sett01` 형태(혹은 비충돌 고정 UUID) 사용.
- buffer 마진을 위해 status='pending' 1건을 추가하되, 필요 시 해당 SPEC의 후속 마일스톤에서 더 늘릴 여지를 SQL 코멘트로 남긴다.
- 새 project 행 생성은 가급적 피하고, 기존 project를 재참조한다(스키마 외래키 안정).

### 2.4 코드 측 변경

- `scripts/seed-users.ts`
  - 기존 `SEED_USERS` 배열에 operator2 엔트리 추가
  - email/password는 `process.env.SEED_OPERATOR2_EMAIL`, `process.env.SEED_OPERATOR2_PASSWORD`로 참조하고 기본값(`operator2@algolink.local`, `DevOperator2!2026`) 폴백
  - 기존 admin/operator/instructor1 엔트리는 절대 수정하지 않음
- `.env.example`
  - 기존 `SEED_*` 블록 하단에 operator2 두 줄 추가
- `tests/e2e/helpers/seed-users.ts`
  - 기존 SEED_USERS 객체에 `operator2: { email: process.env.SEED_OPERATOR2_EMAIL ?? 'operator2@algolink.local', password: process.env.SEED_OPERATOR2_PASSWORD ?? 'DevOperator2!2026' }` 형태로 추가
- `tests/e2e/helpers/personas.ts`(필요 시): `operator2` 페르소나 정의 추가는 SPEC-E2E-002 책임이며 본 SPEC에서는 손대지 않는다(시드 헬퍼만 노출).

### 2.5 db:verify AC 추가

`scripts/db-verify.ts`(또는 동등한 검증 스크립트)에 다음 두 검증을 추가한다.
- `AC-SEED002-PENDING-COUNT`: `SELECT COUNT(*) FROM public.settlements WHERE status = 'pending'` ≥ 3
- `AC-SEED002-OPERATOR2`: `SELECT COUNT(*) FROM public.users WHERE email = 'operator2@algolink.local' AND role = 'operator'` = 1

기존 18/18 검증 결과에 2건이 추가되어 20/20 PASS가 되도록 한다.

## 3. 마일스톤 (Milestones)

> 시간 단위 추정 없음. 우선순위 라벨과 순서로 관리한다.

### M1 — Migration SQL skeleton (Priority: High)

- 산출물: `supabase/migrations/20260428000010_e2e_seed_phase2.sql` 파일 생성
- 내용: 헤더 코멘트(SPEC 참조, add-only 명시) + operator2의 `auth.users` / `auth.identities` / `public.users` INSERT (모두 `ON CONFLICT DO NOTHING`)
- 검증: `npx supabase db reset` 성공, `select id, email, role from public.users where email='operator2@algolink.local'` 1행 반환

### M2 — Pending settlement 행 추가 (Priority: High)

- 산출물: M1 파일에 settlements INSERT 추가
- 내용: status='pending'인 settlement 1건(또는 이상) 추가, 기존 client/instructor/project UUID 재사용
- 검증: `select count(*) from public.settlements where status='pending'` ≥ 3

### M3 — `scripts/seed-users.ts` + `.env.example` (Priority: High)

- 산출물:
  - `scripts/seed-users.ts`: SEED_USERS 배열에 operator2 엔트리 추가
  - `.env.example`: `SEED_OPERATOR2_EMAIL`, `SEED_OPERATOR2_PASSWORD` 두 줄 추가
- 검증: `pnpm seed:users` 실행 시 operator2 생성 로그 출력, 재실행 시 "이미 존재" 처리

### M4 — `tests/e2e/helpers/seed-users.ts` operator2 헬퍼 (Priority: Medium)

- 산출물: SEED_USERS 객체에 `operator2` 필드 추가
- 검증: TypeScript 컴파일 통과, env 미설정 시 기본값으로 resolve

### M5 — db:verify AC 추가 (Priority: Medium)

- 산출물: `scripts/db-verify.ts`(또는 동등 위치)에 2건 AC 추가
- 검증: `pnpm db:verify` 실행 시 20/20 PASS

### M6 — 종합 검증 (Priority: High, blocking)

- 절차:
  1. `npx supabase db reset` 실행 → 마이그레이션 적용 성공
  2. `pnpm db:verify` → 20/20 PASS
  3. `pnpm seed:users` → operator2 포함 4명 동기화
  4. `pnpm e2e --grep phase2` → SKIP 0건, 기존 PASS 회귀 없음
  5. 마지막으로 `npx supabase db reset` 재실행하여 idempotent 확인
- 산출물: 검증 로그 캡처(별도 보고서로 정리는 SPEC-E2E-002에서 처리)

## 4. 의존성 (Dependencies)

- 사전: SPEC-DB-001(로컬 Supabase 스택 정상화) 완료 — 충족됨(2026-04-27 PR #6, #7).
- 동시: 본 SPEC 완료 후 SPEC-E2E-002의 phase2 회귀 테스트가 SKIP 제거 작업을 진행할 수 있다.

## 5. 위험 및 대응 (Risks & Mitigations)

| 위험 | 가능성 | 영향 | 대응 |
|---|---|---|---|
| `auth.identities.provider_id` 충돌 | 낮음 | 마이그레이션 실패 | `ON CONFLICT (provider, provider_id) DO NOTHING` |
| 기존 admin 회귀 단언이 settlements 합계에 의존 | 중간 | admin 테스트 실패 | 상한이 아닌 하한 단언만 추가, 합계 단언은 SPEC-ADMIN-001 영역에서 재baselining |
| operator2 UUID 충돌 | 매우 낮음 | 시드 실패 | `bbb2` 미사용 grep 확인 후 고정 |
| 070 파일을 실수로 수정 | 매우 낮음 | SPEC 위반 | PR 단계에서 diff에 070 변경이 포함되면 즉시 reject(REQ-SEED002-004) |

## 6. Definition of Done

- M1~M5 산출물이 모두 코드베이스에 존재한다.
- M6 검증이 모두 통과한다.
- `acceptance.md`의 5개 AC가 모두 PASS다.
- 070 시드 파일과 operator 주 페르소나 행이 변경되지 않았음을 `git diff`로 재확인한다.

## 7. 후속 작업 (Out of this SPEC)

- SPEC-E2E-002: phase2 회귀 SKIP 3건을 PASS로 전환하는 테스트 코드 변경.
- SPEC-ADMIN-001: pending 정산 1건 증가에 따른 매출매입 집계 단언 재baselining(필요 시).
