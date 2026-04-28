---
id: SPEC-E2E-002
version: 1.0.0
status: completed
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-E2E-002: Phase 2 골든패스 E2E 회귀 스위트 (4종)

## HISTORY

- 2026-04-28: 초안 작성 (Phase 2 SPEC 4개 도메인 — CLIENT / PAYOUT / ADMIN / NOTIFY — 의 골든패스 회귀 정의)
- 2026-04-28: 구현 완료 (4 spec 파일 생성, CLIENT PASS, PAYOUT/ADMIN/NOTIFY는 시드/env 부재로 명시 skip — REQ-E2E2-007 정상 동작). draft → completed.

## 개요 (Overview)

Algolink MVP Phase 2에서 출시된 4개 도메인(고객사 관리, 정산 상태 머신, 관리자 회원/권한, 알림 센터)에 대해 Playwright 기반 E2E 골든패스 회귀 스위트를 정의한다. SPEC-E2E-001과 동일한 패턴(페르소나 storageState 재사용, 시드 의존, Chromium 헤드리스, trace/screenshot/video 산출물)을 적용하며, 신규 spec 파일 4개를 `tests/e2e/` 하위에 작성한다.

## 배경 (Background)

- Phase 2 SPEC 4종 — SPEC-CLIENT-001(고객사+담당자), SPEC-PAYOUT-001(정산 상태 머신), SPEC-ADMIN-001(회원/권한+매출매입), SPEC-NOTIFY-001(알림 센터+트리거 4종) — 이 모두 main에 머지되어 README 진행 상태에 반영되어 있다.
- `playwright.config.ts`는 이미 5개 project(`setup`, `anon`, `instructor`, `operator`, `admin`)를 갖추고 있으며, 페르소나 grep 태그(`@operator`, `@admin`, `@instructor`)로 시나리오를 라우팅한다.
- 시드 데이터는 `supabase/migrations/20260427000070_seed.sql`에 정의되어 있으며, 페르소나 계정은 `tests/e2e/helpers/personas.ts`와 `tests/e2e/helpers/seed-users.ts` 단일 진실 공급원을 통해 주입된다.
- SPEC-E2E-001로 검증된 골든패스 패턴(시드 재사용, `test.skip(true, "사유")` 허용, 결정성 prefix)을 그대로 따르며, Phase 2 신규 도메인 4종을 동일 수준으로 회귀 보장한다.

## 요구사항 (EARS Requirements)

### REQ-E2E2-001 (Event-driven) — CLIENT 골든패스

**WHEN** operator 페르소나가 고객사 관리 화면에서 신규 고객사를 등록한다,
**THEN** the system SHALL exercise the following sequence:

- (a) operator로 인증된 세션에서 `/clients` 라우트에 진입한다
- (b) "신규 등록" 액션으로 회사명(타임스탬프 prefix로 결정성 확보) + 담당자 1명(이름, 이메일, 연락처)을 입력한다
- (c) 사업자등록증 업로드 입력은 선택(optional). 시드/픽스처가 없으면 스킵, 있으면 업로드 어설트
- (d) 저장 후 고객사 목록으로 돌아와 회사명으로 검색한다
- (e) 검색 결과 행에 방금 등록한 회사명이 정확히 한 개 매치되어 노출된다

대상 SPEC: SPEC-CLIENT-001
파일: `tests/e2e/phase2-client.spec.ts`

### REQ-E2E2-002 (Event-driven) — PAYOUT 상태 머신 골든패스

**WHEN** operator 페르소나가 거래(transaction) 정산 상태를 진행시킨다,
**THEN** the system SHALL exercise the following sequence:

- (a) operator로 인증된 세션에서 `/transactions` 라우트에 진입한다
- (b) 시드로 존재하는 `pending` 상태의 행을 식별한다 (시드 부재 시 `test.skip(true, "pending 거래 시드 부재")`)
- (c) "정산요청" 액션을 실행한다 → 상태가 `pending` → `requested`로 전환됨을 행 또는 상세에서 확인한다
- (d) "입금확인" 액션을 실행한다 → 상태가 `requested` → `paid`로 전환됨을 확인한다
- (e) 매출/매입 집계 위젯(또는 KPI 영역)에 해당 거래 금액이 반영되어 합계 또는 카운트가 변동했음을 어설트한다

대상 SPEC: SPEC-PAYOUT-001
파일: `tests/e2e/phase2-payout.spec.ts`

### REQ-E2E2-003 (Event-driven) — ADMIN 회원 비활성화 골든패스

**WHEN** admin 페르소나가 특정 operator 계정을 비활성화한다,
**THEN** the system SHALL exercise the following sequence:

- (a) admin으로 인증된 세션에서 `/admin/users` 라우트에 진입한다
- (b) 시드의 보조 operator 계정(예: `operator2@algolink.local` 또는 시드에 존재하는 임의 비-주요 operator)을 식별한다 (부재 시 `test.skip(true, "비활성화 대상 operator 시드 부재")`)
- (c) 해당 행에서 비활성화 토글 또는 액션을 실행하고, 행 상태가 "비활성"으로 표시됨을 확인한다
- (d) anon project 컨텍스트(또는 storageState 클리어 후)에서 해당 계정 자격 증명으로 로그인 시도한다
- (e) `/login?error=deactivated`(또는 동등한 에러 쿼리/메시지)로 리다이렉트되거나 로그인 거부 메시지가 노출된다
- (f) 테스트 종료 시 cleanup hook으로 비활성화 상태를 원복한다 (다음 테스트 격리)

대상 SPEC: SPEC-ADMIN-001
파일: `tests/e2e/phase2-admin.spec.ts`

### REQ-E2E2-004 (Event-driven) — NOTIFY 정산요청 트리거 골든패스

**WHEN** operator 페르소나가 정산요청 트리거를 발생시킨다,
**THEN** the system SHALL exercise the following sequence:

- (a) operator로 인증된 세션에서 `/transactions` 라우트에 진입한다
- (b) 시드의 `pending` 거래 1건에 대해 정산요청 액션을 실행한다 (REQ-E2E2-002와 동일 트리거지만 알림 측면 검증)
- (c) 헤더의 NotificationBell 컴포넌트에서 안읽음(unread) 카운트가 1 이상으로 증가했거나, 트리거 직후 1을 더한 값이 표시됨을 어설트한다
- (d) NotificationBell dropdown을 열어 가장 최근 알림 항목을 클릭한다
- (e) 클릭 후 (i) 안읽음 카운트가 감소했거나 (ii) DB의 `notifications.read_at`이 NULL이 아닌 값으로 업데이트됨을 어설트한다 — UI 카운트 감소가 우선, DB 검증은 fallback
- (f) cleanup hook으로 트리거 거래의 정산 상태를 원복하거나 새로 생성한 알림 행을 삭제한다 (다음 테스트 격리)

대상 SPEC: SPEC-NOTIFY-001
파일: `tests/e2e/phase2-notify.spec.ts`

### REQ-E2E2-005 (Ubiquitous) — 시드/헬퍼 단일 진실 공급원

The system SHALL reuse `tests/e2e/helpers/personas.ts`와 `tests/e2e/helpers/seed-users.ts`를 통한 자격 증명 주입 패턴을 따른다. spec 파일 내부에서 사용자 생성을 인라인으로 수행하지 않는다.

- 페르소나 계정: `admin@algolink.local`, `operator@algolink.local`, `instructor1@algolink.local` (env override 우선, fallback `personas.ts`)
- 추가 시드 데이터(거래, 알림, 보조 operator 등) 의존이 필요한 경우 `supabase/migrations/20260427000070_seed.sql`을 참조한다

### REQ-E2E2-006 (Ubiquitous) — 헤드리스 + 산출물

All Phase 2 scenarios SHALL run headless and emit Playwright trace + screenshot + video on failure. 본 동작은 `playwright.config.ts`에 이미 구성되어 있으며 본 SPEC은 설정을 변경하지 않는다.

### REQ-E2E2-007 (Unwanted) — 시드 부재 시 차단 금지

**IF** 필수 시드 데이터(예: `pending` 거래 행, 보조 operator 계정)가 부재하다,
**THEN** the system SHALL skip the affected test via `test.skip(true, "<사유 명기>")` and SHALL NOT block the CI run.

- 정당한 skip은 LESSON-002(미구현 플레이스홀더 금지) 위반이 아니다 — skip 사유를 명시 문자열로 기록하여 무엇이 부족한지 즉시 식별 가능해야 한다
- 보호적 fallback(예: 인라인 시드 생성, mock data 주입)은 금지

### REQ-E2E2-008 (Unwanted) — 인증/가드 회귀 0

The Phase 2 suite SHALL NOT introduce 인증/가드 회귀. 모든 시나리오는 적절한 페르소나 storageState로 시작하며, 미인증 또는 잘못된 역할에서의 보호 라우트 접근 검증은 SPEC-E2E-001 `auth.spec.ts`로 위임한다(중복 작성 금지).

- LESSON-003(인증/가드 회귀 즉시 테스트) 준수: 비활성화 후 로그인 시도 시퀀스(REQ-E2E2-003)가 인증 가드의 핵심 회귀 신호 역할을 한다

## 비기능 요구사항 (Non-Functional Requirements)

- **언어**: 시나리오 본문 주석은 한국어 또는 영어 모두 허용. `test()` describe/title은 영어, 페르소나 grep 태그(`@operator`, `@admin`)를 포함한다.
- **결정성(determinism)**: 신규 생성하는 데이터(고객사 회사명 등)는 `E2E-${Date.now()}-` 같은 타임스탬프 prefix를 사용한다. 테스트별 cleanup hook으로 부수효과를 정리한다.
- **격리**: 4개 spec 파일은 서로의 데이터에 의존하지 않는다 (병렬 실행 시 충돌 없음). `playwright.config.ts`의 `workers: 1` 설정에 의존하지 않는 독립성을 권장.
- **성능**: 4개 시나리오 합계 워커 1개 기준 합리적 시간 내(< 5분) 완료한다.
- **라이브러리**: Playwright 외 신규 라이브러리(예: faker, axios) 도입 금지. 기존 헬퍼만 사용한다.

## 제외 (Exclusions — What NOT to Build)

- `playwright.config.ts` 변경은 본 SPEC 범위 밖이다 (이미 5 project + grep 태그 구성 완료).
- 시드 데이터/시더(`scripts/seed.ts`, `supabase/migrations/`) 변경은 본 SPEC 범위 밖이다 — 의존만 한다.
- SPEC-E2E-001이 다루는 Phase 1 시나리오(auth, dashboard, instructor, project, me-resume, me-payouts) 중복 작성 금지.
- 알림 트리거 4종 전체(정산요청, 입금확인, 강사배정, 회원가입) 회귀는 본 SPEC 범위 밖이며, REQ-E2E2-004는 그 중 가장 핵심 트리거 1종(정산요청)만 다룬다. 나머지 3종은 후속 SPEC 또는 단위 테스트로 위임한다.
- 모바일/크로스 브라우저(WebKit, Firefox) 매트릭스 확장은 본 SPEC 범위 밖이다 (Chromium 골든패스만).
- 시각적 회귀(visual regression, snapshot diff)는 본 SPEC 범위 밖이다.
- 신규 헬퍼 라이브러리 도입 금지. 필요한 경우 기존 `tests/e2e/helpers/`에 함수 추가만 허용한다.

## 의존성 (Dependencies)

- **선행 머지 필수**: SPEC-CLIENT-001, SPEC-PAYOUT-001, SPEC-ADMIN-001, SPEC-NOTIFY-001 (모두 main 반영 완료, README 기준)
- **시드 의존**: `supabase/migrations/20260427000070_seed.sql` — 페르소나 계정, `pending` 거래, 보조 operator(부재 시 skip)
- **헬퍼 의존**: `tests/e2e/helpers/personas.ts`, `tests/e2e/helpers/seed-users.ts`
- **선행 SPEC**: SPEC-E2E-001 (동일 패턴, 헬퍼 재사용)

## 참조

- 기존 spec 파일 패턴: `tests/e2e/auth.spec.ts`, `tests/e2e/projects.spec.ts`, `tests/e2e/me-payouts.spec.ts`
- 시드: `supabase/migrations/20260427000070_seed.sql`
- 헬퍼: `tests/e2e/helpers/personas.ts`, `tests/e2e/helpers/seed-users.ts`
- 설정: `playwright.config.ts` (5 project + grep 태그 구성)
- Phase 2 종결 보고서: `.moai/reports/phase2-closure-2026-04-28.md` (커밋 `d45dc63`)
