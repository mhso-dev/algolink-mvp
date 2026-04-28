---
id: SPEC-E2E-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
---

# SPEC-E2E-001 인수 기준 (Acceptance Criteria)

## 인수 기준 목록 (Acceptance Criteria)

### AC-1: 클린 체크아웃에서 전체 스위트 통과

**Given** main 브랜치에서 의존성을 새로 설치한 클린 체크아웃 환경
**When** `pnpm e2e`를 헤드리스로 실행한다
**Then** Phase 1 SPEC 5종을 다루는 5개의 시나리오 파일이 모두 통과한다 (`auth.spec.ts`, `dashboard.spec.ts`, `instructors.spec.ts`, `projects.spec.ts`, `me-resume.spec.ts` + `me-payouts.spec.ts`).

### AC-2: 인증 시나리오

**Given** admin/operator/instructor 시드 사용자가 존재한다
**When** 각 페르소나로 로그인하고, 잘못된 비밀번호 시도, 미인증 보호 라우트 접근을 수행한다
**Then**
- 각 역할별 로그인 성공 → 역할에 적합한 랜딩 라우트로 리다이렉트된다
- 잘못된 비번 → 에러 메시지가 노출된다
- 미인증 사용자가 보호 라우트 접근 → `/login`으로 리다이렉트된다

REQ 매핑: REQ-E2E-002, REQ-E2E-007

### AC-3: 대시보드 시나리오

**Given** 시드 데이터로 KPI/칸반에 표시할 프로젝트와 강사가 존재한다
**When** admin/operator 페르소나로 대시보드 페이지에 진입한다
**Then**
- KPI 타일이 숫자 값(플레이스홀더 아님)으로 렌더된다
- 칸반 보드의 컬럼 수가 0보다 크고, 각 컬럼이 카드 또는 빈 상태 메시지를 가진다

REQ 매핑: REQ-E2E-003

### AC-4: 강사 시나리오

**Given** 운영자(operator) 페르소나로 인증된 세션이 존재한다
**When** 강사 등록 폼을 제출하고, 임의 프로젝트에서 AI 매칭을 트리거한다
**Then**
- 강사 목록에 새로 등록한 강사가 반영된다
- AI 매칭 결과로 상위 3명(또는 시드 풀 크기 이내의 동등 결과)의 후보가 노출된다

REQ 매핑: REQ-E2E-004

### AC-5: 프로젝트 시나리오 (Stage 1)

**Given** 운영자(operator) 페르소나로 인증되어 있고, 배정 가능한 강사가 시드로 존재한다
**When** 신규 프로젝트를 생성 → 목록에서 **타이틀 기반** 검색 → 상세 페이지 진입 → 강사 배정 → instructor 페르소나로 전환한다
**Then**
- 생성한 프로젝트가 목록 검색 결과에 노출된다 (타이틀 매치)
- 상세 페이지에 프로젝트 정보가 정확히 노출된다
- 배정 액션 후 instructor 계정의 알림 영역에 배정 알림이 노출된다

REQ 매핑: REQ-E2E-005 (stage 1 부분)

### AC-6: Me 시나리오 (이력서 + 정산)

**Given** instructor 페르소나로 인증되어 있다
**When** 이력서 편집 후 저장 → PDF export 트리거 → 정산 이력 조회 → 정산 설정 화면 확인을 수행한다
**Then**
- 이력서 저장 후 새로고침해도 값이 유지된다
- PDF export 시 `download` 이벤트가 발생하거나 `/api/.../pdf` 라우트가 200 응답한다
- 정산 이력 행 수 > 0
- 정산 설정 화면 DOM과 네트워크 응답 본문 어디에도 IBAN/계좌번호 평문이 노출되지 않는다 (마스킹 또는 암호문만 허용)

REQ 매핑: REQ-E2E-006

### AC-7: 실패 시 아티팩트 생성

**Given** 의도적으로 실패하는 어설션이 존재한다 (검증용 일회성 케이스)
**When** `pnpm e2e`를 실행하여 해당 케이스가 실패한다
**Then** `playwright-report/` 하위에 trace.zip + screenshot + video가 모두 생성된다.

REQ 매핑: REQ-E2E-001, REQ-E2E-008

### AC-8: 프로젝트 검색 — 클라이언트명 매치 (Stage 2, **post-merge gated**)

[DEPENDENCY] 본 AC는 **SPEC-PROJECT-SEARCH-001**가 main에 머지된 이후에만 활성화된다.

**Given** 타이틀은 "X", 연결된 clients.name은 "Y"인 프로젝트가 시드 또는 사전 생성으로 존재한다
**When** 프로젝트 목록에서 `q="Y"`로 검색한다
**Then** 타이틀이 매치하지 않음에도 해당 프로젝트가 검색 결과에 포함된다 (UI를 통한 multi-column ILIKE 동작 증명).

REQ 매핑: REQ-E2E-005 (stage 2 부분)

## 엣지 케이스 (Edge Cases)

- **세션 만료 도중 액션**: 보호 라우트에서 액션 수행 중 세션 만료가 발생한 경우, 다시 `/login`으로 안내된다(별도 시나리오로는 다루지 않으나 미인증 리다이렉트 어설션이 일반 케이스로 커버).
- **AI 매칭 결과 < 3명**: 시드 강사 풀이 3명 미만인 환경에서는 "최소 1명, 최대 3명" 형태로 어설션을 완화한다.
- **PDF export 환경 차이**: 일부 환경에서 `download` 대신 `application/pdf` 응답으로 인라인 표시될 수 있어 두 경로 모두 허용한다.
- **시드 데이터 부재**: 시드가 비어있으면 테스트는 실패해야 하며, 시더가 사전 실행됨을 전제로 한다(보호적 fallback 금지).

## 품질 게이트 (Quality Gate Criteria)

- **Tested**: 5개 SPEC 영역에 대한 골든패스 회귀가 모두 어설트된다.
- **Readable**: 테스트 이름은 영어로, REQ ID를 주석으로 포함한다(`// REQ-E2E-002 (a)`).
- **Unified**: 기존 e2e 파일 스타일과 일관된 setup/teardown, 셀렉터 패턴을 유지한다.
- **Secured**: 정산 시나리오에서 평문 민감정보 누출 부재를 명시적으로 검증한다.
- **Trackable**: 커밋 메시지에 `SPEC-E2E-001` 참조를 포함한다.

## 완료의 정의 (Definition of Done)

- [ ] AC-1 ~ AC-7 모두 통과 (stage 1 범위)
- [ ] 시드 사용자 헬퍼(`tests/e2e/helpers/seed-users.ts`)가 단일 진실 공급원으로 정착
- [ ] `playwright.config.ts`의 trace/screenshot/video 설정이 본 SPEC 의도대로 동작함을 문서화 (변경 없음 확인)
- [ ] 새로 추가된 어설션이 어떤 REQ를 커버하는지 주석으로 매핑됨
- [ ] CI에서 `pnpm e2e`가 일관되게 통과 (flaky run < 5%)
- [ ] **AC-8은 SPEC-PROJECT-SEARCH-001 머지 후 별도 PR로 추가 후 통과**
