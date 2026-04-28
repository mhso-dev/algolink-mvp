---
id: SPEC-E2E-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-E2E-001: Phase 1 골든패스 E2E 회귀 스위트

## HISTORY

- 2026-04-28: 초안 작성 (Phase 1 SPEC 5종에 대한 Playwright 골든패스 회귀 스위트 정의)

## 개요 (Overview)

Algolink MVP의 Phase 1에서 출시된 5개 SPEC(SPEC-AUTH-001, SPEC-DASHBOARD-001, SPEC-INSTRUCTOR-001, SPEC-PROJECT-001, SPEC-ME-001)에 대해 Playwright 기반 E2E 골든패스 회귀 스위트를 정의한다. 기존 `tests/e2e/*.spec.ts` 6개 파일을 **강화(strengthen)** 하는 것이 목표이며, 새로 작성하지 않는다. CI에서 헤드리스로 실행되며, 실패 시 trace/screenshot/video 아티팩트를 남긴다.

## 배경 (Background)

- Phase 1 SPEC 5종은 모두 main에 머지된 상태이며 README 진행 상태에 반영되어 있다.
- `playwright.config.ts`는 이미 3개 페르소나(admin, operator, instructor) storageState 패턴, 포트 3000, build+start, workers=1 설정을 갖추고 있다.
- 기존 e2e 파일이 6개 존재하지만 골든패스 회귀 보장 수준에 도달하지 못한 부분이 있어, 회귀 방지 단일 진실 공급원(single source of truth)이 필요하다.
- 시드 사용자는 `scripts/auth:bootstrap-admin` 등의 시더로 일관되게 생성되어야 하며, 스펙 내부에서 인라인 생성하지 않는다.

## 요구사항 (EARS Requirements)

### REQ-E2E-001 (Ubiquitous)

The system SHALL provide a Playwright golden-path regression suite covering all five Phase 1 SPECs that runs headless in CI with trace artifacts on failure.

- 대상 SPEC: SPEC-AUTH-001, SPEC-DASHBOARD-001, SPEC-INSTRUCTOR-001, SPEC-PROJECT-001, SPEC-ME-001
- 실행 환경: 헤드리스, CI(`pnpm e2e`), 로컬 클린 체크아웃 모두에서 통과
- 실패 시 산출물: trace.zip, screenshot, video를 `playwright-report/` 하위에 생성

### REQ-E2E-002 (Event-driven)

WHEN auth flow runs, the system SHALL test:
- (a) 각 역할(admin/operator/instructor) 별 로그인 성공 시 역할에 적합한 랜딩 라우트로 리다이렉트된다
- (b) 잘못된 비밀번호 입력 시 에러 메시지가 노출된다
- (c) 세션 없이 보호된 라우트 접근 시 `/login`으로 리다이렉트된다

### REQ-E2E-003 (Event-driven)

WHEN dashboard scenario runs, the system SHALL verify:
- KPI 타일이 플레이스홀더가 아닌 실제 값(숫자)으로 렌더된다
- 칸반 보드에 프로젝트 카드가 올바른 상태 컬럼에 배치된다 (컬럼 수 > 0, 카드 분포 검증)

### REQ-E2E-004 (Event-driven)

WHEN instructor scenario runs, the system SHALL exercise:
- 강사 등록 폼 제출 → 목록에 신규 강사가 반영된다
- 임의 프로젝트에서 AI 매칭 트리거 시 상위 3명의 후보가 노출된다

### REQ-E2E-005 (Event-driven)

WHEN project scenario runs, the system SHALL exercise the following sequence:
- 신규 프로젝트 생성 → 목록 검색(아래 의존성 참조) → 상세 보기 → 강사 배정 → 배정된 강사 계정에서 알림이 노출된다

[DEPENDENCY] 본 시나리오의 검색 부분은 **SPEC-PROJECT-SEARCH-001**(q 멀티컬럼 ILIKE) 머지 여부에 따라 stage 1/2로 분리된다. 자세한 내용은 plan.md 참고.

### REQ-E2E-006 (Event-driven)

WHEN me scenario runs, the system SHALL exercise:
- 이력서 편집 저장
- PDF export 트리거 (다운로드 발생 또는 PDF 라우트 200 응답 검증)
- 정산 이력(payout history) 조회 (행 수 > 0)
- 정산 설정 암호화 검증 (암호문 형태 확인, DOM/네트워크 어디에도 IBAN/계좌번호 평문 누출 없음)

### REQ-E2E-007 (Ubiquitous)

All scenarios SHALL reuse the seed users from `scripts/auth:bootstrap-admin` (and equivalent operator/instructor seeders). 스펙 파일 내부에서 사용자 생성을 인라인으로 수행하지 않는다.

### REQ-E2E-008 (Ubiquitous)

All scenarios SHALL run headless and emit Playwright trace + screenshot + video on failure. 본 동작은 `playwright.config.ts`에 이미 구성되어 있으며, 본 SPEC은 해당 설정을 검증하고 문서화한다(설정 변경 없음).

## 비기능 요구사항 (Non-Functional Requirements)

- **언어**: 시나리오 본문/주석은 한국어 또는 영어 모두 허용. 테스트 이름 및 코드 식별자는 영어.
- **결정성(determinism)**: 시드 데이터에 의존하며, 테스트 간 부수효과를 남기지 않는다(필요 시 cleanup hook 사용).
- **성능**: 전체 스위트는 워커 1개 기준 합리적 시간 내(< 10분) 완료한다.
- **보안**: 정산/이력서 PDF 시나리오에서 평문 민감정보 노출 여부를 명시적으로 검증한다(REQ-E2E-006).

## 제외 (Exclusions — What NOT to Build)

- 기존 e2e 파일을 처음부터 다시 쓰지 않는다(strengthen-only).
- `playwright.config.ts` 변경은 본 SPEC 범위 밖이다(설정은 이미 충족).
- 시드 사용자/데이터 생성 로직 자체의 신규 작성은 범위 밖이며, 이미 존재하는 시더만 재사용한다.
- E2E 스위트와 무관한 단위(unit)/통합(integration) 테스트 보강은 범위 밖이다.
- 모바일/크로스 브라우저(WebKit, Firefox) 매트릭스 확장은 본 SPEC 범위 밖이다(Chromium 골든패스만).
- 시각적 회귀(visual regression, snapshot diff)는 본 SPEC 범위 밖이다.
- SPEC-PROJECT-SEARCH-001의 백엔드/스키마 구현은 본 SPEC 범위 밖이며, 의존(consumes)만 한다.

## 의존성 (Dependencies)

- **선행 머지 필수 (stage 1)**: SPEC-AUTH-001, SPEC-DASHBOARD-001, SPEC-INSTRUCTOR-001, SPEC-PROJECT-001, SPEC-ME-001 (모두 main 반영 완료)
- **선행 머지 필수 (stage 2)**: SPEC-PROJECT-SEARCH-001 (q 멀티컬럼 ILIKE) — REQ-E2E-005의 클라이언트명 검색 서브 어설션 활성화 조건
- **시더 의존**: `scripts/auth:bootstrap-admin` 및 operator/instructor 시더

## 참조

- 기존 파일: `tests/e2e/auth.spec.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/instructors.spec.ts`, `tests/e2e/projects.spec.ts`, `tests/e2e/me-resume.spec.ts`, `tests/e2e/me-payouts.spec.ts`
- 인증 셋업: `tests/e2e/auth.setup.ts`
- 설정: `playwright.config.ts`
