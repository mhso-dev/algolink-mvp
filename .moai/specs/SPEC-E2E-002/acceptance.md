---
id: SPEC-E2E-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
---

# SPEC-E2E-002 인수 기준 (Acceptance Criteria)

## 인수 기준 목록 (Acceptance Criteria)

### AC-1: CLIENT 골든패스 — 등록 → 검색 → 매치

**Given** operator 페르소나로 인증된 storageState가 존재하고, `/clients` 라우트가 접근 가능하다
**When** 운영자가 `/clients`에서 신규 고객사를 등록한다 (회사명 `E2E-CLIENT-${ts}`, 담당자 1명: 이름/이메일/연락처). 사업자등록증 업로드 input이 존재하면 fixture 파일을 첨부하고, 부재하면 해당 단계만 스킵한다. 저장 후 목록에서 회사명으로 검색한다
**Then**
- 등록 직후 고객사 목록 화면으로 복귀하거나 상세 화면이 노출된다
- 회사명으로 검색한 결과 행에 방금 등록한 회사명이 정확히 한 번 매치되어 노출된다
- afterEach cleanup hook에서 prefix(`E2E-CLIENT-`)로 식별된 데이터를 정리하거나, 정리 API 부재 시 cleanup 실패를 로그하되 다음 테스트가 영향받지 않는다

REQ 매핑: REQ-E2E2-001, REQ-E2E2-005

### AC-2: PAYOUT 상태 머신 — pending → requested → paid + 매출매입 반영

**Given** operator 페르소나로 인증되어 있고, 시드에 최소 1건의 `pending` 상태 거래가 존재한다 (부재 시 본 AC는 명시 사유로 skip)
**When** 운영자가 `/transactions`에서 첫 `pending` 행에 대해 "정산요청" → "입금확인"을 순차 실행한다
**Then**
- "정산요청" 후 행 상태가 `requested`로 표시된다
- "입금확인" 후 행 상태가 `paid`로 표시된다
- 매출매입 집계 위젯(또는 KPI 영역)의 값이 시작 시점 캡처값과 비교하여 변동(증가 또는 카운트 +1)했음을 어설트한다
- afterEach cleanup hook에서 paid 거래를 pending으로 원복한다 (원복 API 부재 시 cleanup 실패를 로그하되 다음 테스트 격리는 시드 풀 재생성에 위임)

REQ 매핑: REQ-E2E2-002, REQ-E2E2-005, REQ-E2E2-007

### AC-3: ADMIN 회원 비활성화 → 로그인 거부

**Given** admin 페르소나로 인증되어 있고, 시드에 비활성화 대상으로 사용 가능한 보조 operator 계정이 존재한다 (부재 시 본 AC는 명시 사유로 skip)
**When** 관리자가 `/admin/users`에서 해당 보조 operator를 비활성화 토글한 후, 새 브라우저 컨텍스트(storageState 없음)에서 해당 계정 자격 증명으로 로그인 시도한다
**Then**
- `/admin/users` 행 상태가 "비활성"으로 표시된다
- 새 컨텍스트의 로그인 시도가 거부되고 `/login?error=deactivated` 또는 동등한 에러 쿼리/메시지가 노출된다 (LESSON-003: 인증/가드 회귀 즉시 검증 신호 역할)
- afterEach cleanup hook에서 admin 페르소나로 동일 계정을 다시 활성화한다 — cleanup 실패 시 명시 로그를 남기며 후속 테스트의 의존을 차단한다

REQ 매핑: REQ-E2E2-003, REQ-E2E2-005, REQ-E2E2-007, REQ-E2E2-008

### AC-4: NOTIFY 정산요청 트리거 → bell 카운트 → read_at 업데이트

**Given** operator 페르소나로 인증되어 있고, 시드에 최소 1건의 `pending` 거래가 존재하며 헤더 NotificationBell 컴포넌트가 마운트되어 있다 (시드 부재 시 명시 사유로 skip)
**When** 운영자가 `/transactions`에서 정산요청 트리거를 발생시키고, 헤더 NotificationBell dropdown을 열어 최상단 알림을 클릭한다
**Then**
- 트리거 직후 NotificationBell의 unread 카운트가 시작 시점 대비 1 이상 증가했거나, 트리거 발생을 보여주는 새 알림 항목이 dropdown 최상단에 노출된다
- 알림 클릭 후 (i) unread 카운트가 감소했거나 (ii) DB의 `notifications.read_at`이 NULL이 아닌 값으로 업데이트되었음이 SQL helper로 확인된다 (UI 검증 우선, DB fallback 허용)
- afterEach cleanup hook에서 정산 상태 원복 + 새로 생성된 알림 행 삭제 (cleanup 실패는 로그)

REQ 매핑: REQ-E2E2-004, REQ-E2E2-005, REQ-E2E2-007

### AC-5: 헤드리스 + 산출물

**Given** Phase 2 4개 spec 파일이 작성되어 있다
**When** 의도적으로 실패하는 어설션이 1개 spec에 존재한다 (검증용 일회성 케이스)
**Then** `playwright-report/` 하위에 해당 실패 spec의 trace.zip + screenshot + video가 모두 생성된다. 검증 후 의도 실패 케이스는 제거되어 본 PR에 포함되지 않는다.

REQ 매핑: REQ-E2E2-006

### AC-6: 인증/가드 회귀 0

**Given** SPEC-E2E-001 `auth.spec.ts`가 main에서 PASS 상태이다
**When** SPEC-E2E-002 PR을 적용한 후 전체 스위트(`pnpm e2e`)를 실행한다
**Then** SPEC-E2E-001의 모든 인증 시나리오(역할별 로그인, 잘못된 비밀번호, 미인증 리다이렉트, 역할 기반 라우팅 가드)가 회귀 없이 통과한다. SPEC-E2E-002는 인증/가드 검증을 중복 작성하지 않으며, 비활성화 후 로그인 거부(AC-3)만 신규 인증 회귀 신호로 추가한다.

REQ 매핑: REQ-E2E2-008

## 엣지 케이스 (Edge Cases)

- **시드 데이터 부재**: `pending` 거래 또는 보조 operator 계정이 부재하면 해당 AC는 `test.skip(true, "<사유 명기>")`로 스킵된다. 보호적 fallback(인라인 시드 생성, mock data) 금지.
- **사업자등록증 업로드 input 부재**: CLIENT 시나리오에서 파일 업로드 input이 UI에 노출되지 않으면 해당 단계만 스킵하고 나머지(등록/검색/매치) 어설트는 진행한다.
- **NotificationBell 셀렉터 모호**: `data-testid` 부재 시 `getByRole`로 식별. 두 패턴 모두 실패 시 본 SPEC 작성 시점에 LESSON으로 기록하고 spec은 명시 사유로 skip.
- **매출매입 위젯 정확 수치 비교 어려움**: REQ-E2E2-002는 "반영"만 요구하므로 위젯 마운트 + 값 비-비어있음 수준의 완화된 어설트를 허용한다.
- **cleanup 실패**: afterEach에서 cleanup이 실패해도 테스트 자체는 PASS로 기록하되 cleanup 실패는 명시 로그(`console.warn`)로 남긴다. 다음 테스트가 해당 데이터에 의존하지 않도록 prefix 격리를 병행한다.
- **pending 거래 풀 충돌**: PAYOUT(AC-2)과 NOTIFY(AC-4)가 동일 `pending` 행을 소비할 수 있어 workers=1을 유지하거나, spec 내부에서 다른 행을 atomically claim한다.

## 품질 게이트 (Quality Gate Criteria)

- **Tested**: Phase 2 4개 도메인(CLIENT/PAYOUT/ADMIN/NOTIFY)의 골든패스가 모두 어설트된다.
- **Readable**: 테스트 이름은 영어로, REQ ID를 주석으로 포함한다 (`// REQ-E2E2-001 (b)`). describe 태그에 페르소나 grep(`@operator`, `@admin`)을 포함한다.
- **Unified**: SPEC-E2E-001 spec 파일 스타일과 일관된 setup/teardown, 셀렉터 패턴(`getByRole`/`getByLabel`/`getByTestId` 우선)을 유지한다.
- **Secured**: ADMIN 비활성화 시나리오(AC-3)가 인증 가드 회귀의 핵심 신호 역할을 한다 (LESSON-003 준수).
- **Trackable**: 커밋 메시지에 `SPEC-E2E-002` 참조를 포함한다.

## 완료의 정의 (Definition of Done)

- [ ] AC-1 ~ AC-6 모두 통과 (시드 부재 시 명시 사유의 skip 허용)
- [ ] `tests/e2e/phase2-client.spec.ts`, `tests/e2e/phase2-payout.spec.ts`, `tests/e2e/phase2-admin.spec.ts`, `tests/e2e/phase2-notify.spec.ts` 4개 파일이 생성됨
- [ ] 기존 헬퍼(`tests/e2e/helpers/personas.ts`, `tests/e2e/helpers/seed-users.ts`) 재사용 패턴 준수, 인라인 사용자 생성 부재
- [ ] 신규 데이터는 `E2E-${domain}-${Date.now()}` prefix로 결정성 확보
- [ ] 모든 `test.skip(true, "사유")`의 사유 문자열이 (시드 부재 / UI 미구현 / 환경 제약) 중 명시 카테고리로 분류됨
- [ ] `pnpm e2e` 전체 스위트(Phase 1 + Phase 2) CI에서 일관되게 통과 (flaky run < 5%)
- [ ] `playwright.config.ts` 변경 없음
- [ ] Playwright 외 신규 라이브러리 도입 없음
- [ ] 새로 추가된 어설션이 어떤 REQ를 커버하는지 주석으로 매핑됨
- [ ] LESSON-003(인증/가드 회귀) 준수 — AC-3가 비활성화 후 로그인 거부 회귀 신호 역할 수행
