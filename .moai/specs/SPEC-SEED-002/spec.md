---
id: SPEC-SEED-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
related: [SPEC-DB-001, SPEC-E2E-002, SPEC-ADMIN-001]
---

# SPEC-SEED-002 — Phase 2 e2e 시드 보강 (operator2 + pending settlements)

## HISTORY

- 2026-04-28 (v0.1.0): 초기 draft 작성. Phase 2 회귀 보고서(.moai/reports/phase2-e2e-closure-2026-04-28.md)에서 식별된 3건의 SKIP(`tests/e2e/phase2-{payout,notify,admin}.spec.ts`)을 PASS로 전환하기 위한 add-only 시드 보강 SPEC.

---

## 1. 배경 (Why)

Phase 2 회귀 종결 보고서에 따르면, 현재 Supabase 로컬 시드(`supabase/migrations/20260427000070_seed.sql`)는 다음 한계를 갖는다.

- pending 상태 정산이 **2건**만 존재하여, 동시 시나리오(payout/notify/admin가 각자 1건씩 점유)에서 데이터 부족으로 인한 SKIP이 발생한다.
- operator 페르소나가 단일(`operator@algolink.local`)이어서, "두 명의 운영자"가 필요한 시나리오(예: 알림 동기화·이중 승인·감사 로그 분리)를 기술적으로 검증할 수 없다.
- 이 두 한계 때문에 `tests/e2e/phase2-payout.spec.ts`, `tests/e2e/phase2-notify.spec.ts`, `tests/e2e/phase2-admin.spec.ts`의 일부 케이스가 SKIP 처리되어 회귀 커버리지에 구멍이 남아 있다.

기존 070 시드 파일은 다른 SPEC(SPEC-DB-001 외)이 의존하는 **불변 자산(immutable)** 이므로 직접 수정할 수 없다. 따라서 add-only 마이그레이션으로 시드를 보강하여 회귀 커버리지를 100%로 회복하는 것이 본 SPEC의 목표다.

## 2. 목적 (Goal)

- Phase 2 회귀 테스트의 3건 SKIP을 **3건 PASS**로 전환한다.
- `operator@algolink.local`(주 운영자 페르소나)의 자격증명·식별자·역할을 **절대 변경하지 않는다**.
- 시드 보강은 add-only 마이그레이션으로 idempotent하게 적용한다(재실행 시 상태 분기 없음).

## 3. 범위 (Scope)

### 3.1 In Scope

- 신규 add-only 마이그레이션 `supabase/migrations/{date}_e2e_seed_phase2.sql` 추가
  - 보조 운영자 `operator2@algolink.local` 시드(auth.users + auth.identities + public.users)
  - 추가 pending 정산 시드(전체 pending 정산 ≥ 3건이 되도록 보강)
- `scripts/seed-users.ts`에 `operator2` 엔트리 추가(인증 사용자 생성용)
- `.env.example`에 `SEED_OPERATOR2_EMAIL`, `SEED_OPERATOR2_PASSWORD` 항목 추가
- `tests/e2e/helpers/seed-users.ts`의 `SEED_USERS` 객체에 `operator2` 필드 추가(env override 패턴 준수)
- `db:verify` AC 2건 신규 추가
  - `AC-SEED002-PENDING-COUNT`: settlements where status='pending' >= 3
  - `AC-SEED002-OPERATOR2`: users where email='operator2@algolink.local' AND role='operator' = 1

### 3.2 Out of Scope (See §6 Exclusions)

## 4. 요구사항 (EARS Requirements)

### REQ-SEED002-001 (Ubiquitous)

The system **shall** provide an auxiliary operator account (`operator2@algolink.local`, id `00000000-0000-0000-0000-00000000bbb2`) so that tests requiring two distinct operator personas can run against the local Supabase stack.

### REQ-SEED002-002 (Event-Driven)

**When** Supabase migrations are applied (via `npx supabase db reset` or `npx supabase migration up`), **then** the `public.settlements` table **shall** contain at least 3 rows with `status = 'pending'` available for Phase 2 e2e regression scenarios.

### REQ-SEED002-003 (Ubiquitous)

The seed reinforcement migration **shall** be idempotent — re-running the migration (or running `supabase db reset` repeatedly) **shall not** produce duplicate rows, foreign-key violations, or state divergence. All `INSERT` statements **shall** use `ON CONFLICT DO NOTHING` (or an equivalent guard) keyed by primary key or natural unique key.

### REQ-SEED002-004 (Constraint / Unwanted)

The seed reinforcement **shall not** modify the credentials, identifiers, role, or row data of `operator@algolink.local`, **and shall not** modify the existing seed file `supabase/migrations/20260427000070_seed.sql`. Any change to these is forbidden under this SPEC.

### REQ-SEED002-005 (Event-Driven)

**When** an e2e test (or `scripts/seed-users.ts`) needs the password for `operator2`, **then** the value **shall** be sourced from the environment variable `SEED_OPERATOR2_PASSWORD`, falling back to the default `DevOperator2!2026` when the variable is absent. The same env-override pattern **shall** apply to the email via `SEED_OPERATOR2_EMAIL`.

## 5. 제약 (Constraints)

- **불변 자산 보호**: `supabase/migrations/20260427000070_seed.sql`은 절대 수정 금지(SPEC-DB-001 의존성).
- **주 운영자 보호**: `operator@algolink.local` 행(auth.users / auth.identities / public.users)은 어떤 SQL에서도 `UPDATE`/`DELETE` 대상이 되어선 안 된다.
- **고정 식별자**: `operator2`의 UUID는 `00000000-0000-0000-0000-00000000bbb2`로 고정한다(테스트 결정성 확보).
- **add-only 원칙**: 본 SPEC의 모든 변경은 신규 마이그레이션 파일과 신규 코드 라인의 추가로만 구성된다.
- **언어**: 마이그레이션 SQL 코멘트와 코드 코멘트는 한국어, 식별자는 영어.
- **의존성**: 기존 `client_*`, `instructor_*`, `project_*` 시드 행에 의존하므로, 070 시드가 먼저 적용된 상태를 가정해야 한다(파일명 정렬상 070 < 신규 파일이 되도록 날짜 prefix 선택).

## 6. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음을 **포함하지 않는다**.

1. **신규 페르소나 페이지/UI 변경**: operator2를 위한 별도 화면이나 권한 매트릭스 변경은 대상이 아니다(역할은 기존 `operator`를 그대로 사용).
2. **기존 070 시드 파일 수정**: 070 시드의 어떤 행도 추가/삭제/변경하지 않는다.
3. **operator 주 페르소나 자격증명 변경**: `operator@algolink.local`의 비밀번호/UUID/role을 변경하지 않는다.
4. **신규 비즈니스 로직**: settlements 상태 머신, 알림 트리거, 매출 집계 로직 변경은 본 SPEC에서 다루지 않는다(SPEC-PAYOUT-001/SPEC-NOTIFY-001/SPEC-ADMIN-001 영역).
5. **운영(prod/staging) 시드**: 본 SPEC은 로컬 dev 스택 한정이며, 운영 환경 데이터 시딩은 별도 SPEC에서 처리한다.
6. **테스트 코드 본문 수정**: `phase2-*.spec.ts`의 SKIP을 PASS로 만들기 위한 시나리오 수정은 SPEC-E2E-002의 책임이다. 본 SPEC은 그 전제 조건(데이터·페르소나)만 마련한다.
7. **실패 자동 복구**: 마이그레이션 실패 시의 자동 롤백 스크립트는 작성하지 않는다(idempotent 설계로 재실행이 곧 복구).

## 7. 인수 기준 요약 (See `acceptance.md` for details)

- `AC-SEED002-PENDING-COUNT`: pending 정산 ≥ 3건
- `AC-SEED002-OPERATOR2-EXISTS`: operator2 행 정확히 1건
- `AC-SEED002-IDEMPOTENT`: `db:reset` 2회 실행 후에도 행 수 동일
- `AC-SEED002-OPERATOR-PRIMARY-INTACT`: operator 주 페르소나 행 변동 없음
- `AC-SEED002-ENV-FALLBACK`: env 미설정 시 기본값으로 동작

## 8. 관련 SPEC

- **SPEC-DB-001**: 로컬 Supabase 스택의 정합성 보장(본 SPEC의 토대).
- **SPEC-E2E-002**: 본 SPEC의 시드 보강을 활용해 SKIP을 PASS로 전환하는 후속 작업.
- **SPEC-ADMIN-001**: operator 페르소나의 권한·매출매입 집계 사용처.
- **SPEC-PAYOUT-001 / SPEC-NOTIFY-001**: pending 정산 데이터 소비처.

## 9. 위험 (Risks)

| 위험 | 영향 | 완화 |
|---|---|---|
| 새 마이그레이션 파일명이 070보다 사전순으로 앞서면 070의 외래키 의존이 깨짐 | 마이그레이션 실패 | 파일명 prefix를 `20260428` 이후로 강제 |
| `auth.identities`의 `provider_id` UNIQUE 제약 충돌 | 시드 실패 | `ON CONFLICT (provider, provider_id) DO NOTHING` 적용 |
| operator2 UUID가 다른 테스트의 mock UUID와 충돌 | 테스트 비결정성 | `bbb2` suffix는 현 코드베이스에서 미사용임을 grep으로 확인 후 픽스 |
| pending 정산 추가가 매출 집계 합계 단언을 깨뜨림 | admin 회귀 실패 | acceptance.md AC-SEED002-PENDING-COUNT는 `>= 3`로 하한만 단언, admin 합계 단언은 SPEC-ADMIN-001 측에서 본 SPEC 도입 후 재baselining |
