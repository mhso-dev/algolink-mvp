---
id: SPEC-E2E-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
---

# SPEC-E2E-001 구현 계획 (Plan)

## 접근 전략 (Approach)

기존 `tests/e2e/*.spec.ts` 6개 파일을 **확장(extend)** 하여 골든패스 회귀 어설션을 강화한다. 신규 작성이 아닌 보강 작업이며, 페르소나 storageState 패턴과 시더 재사용 원칙을 유지한다. 전체 작업은 **stage 1**(SPEC-PROJECT-SEARCH-001 미의존 부분)과 **stage 2**(머지 후 활성화)로 분할한다.

## 파일 변경 목록 (Files)

확장 대상 (기존 파일):
- `tests/e2e/auth.spec.ts` — 3역할 로그인 + 잘못된 비번 + 미인증 리다이렉트 어설션 강화
- `tests/e2e/dashboard.spec.ts` — KPI 비-플레이스홀더 숫자 어설션 + 칸반 컬럼/카드 분포 어설션 추가
- `tests/e2e/instructors.spec.ts` — 등록 → 목록 반영 → AI 매칭 top-3 어설션 추가
- `tests/e2e/projects.spec.ts` — 생성 → 검색(타이틀) → 상세 → 배정 → 강사 알림 어설션 추가 (stage 1)
- `tests/e2e/me-resume.spec.ts` — 이력서 저장 + PDF export 200/다운로드 어설션 강화
- `tests/e2e/me-payouts.spec.ts` — 정산 이력 + 평문 누출 부재 검증 추가

신규 헬퍼 (필요 시 생성):
- `tests/e2e/helpers/seed-users.ts` — admin/operator/instructor 이메일 상수 export. env 또는 `.moai/config/sections/user.yaml`에서 읽거나 시더 시드값과 동일 상수를 노출.
- 기존 `tests/e2e/helpers/`가 있으면 거기에 추가, 없으면 신규 디렉터리 생성.

설정 (변경 없음, 검증/문서화만):
- `playwright.config.ts` — `retries: process.env.CI ? 1 : 0`, trace `on-first-retry` 또는 동등 설정, screenshot/video on failure 설정 존재 확인. 변경 시도 금지.

## 마일스톤 (Milestones, priority-based — 시간 추정 없음)

### M1 (Priority High) — 헬퍼 정비

- `tests/e2e/helpers/seed-users.ts` 존재 여부 확인, 없으면 생성
- 시더가 노출하는 admin/operator/instructor 계정의 이메일/비밀번호 상수화
- 기존 spec 파일들이 이 헬퍼를 import하도록 정리

### M2 (Priority High) — Stage 1 시나리오 강화

다음 6개 파일을 순차적으로 보강한다:

1. **auth.spec.ts** (REQ-E2E-002)
   - 3개 페르소나 로그인 → 각 역할별 랜딩 라우트 확인 (admin → /admin/*, operator → /operator/*, instructor → /instructor/* 또는 /me/*)
   - 잘못된 비번 → 에러 토스트/필드 메시지 노출
   - 미인증 사용자가 보호 라우트 접근 → /login으로 redirect 확인

2. **dashboard.spec.ts** (REQ-E2E-003)
   - KPI 타일 텍스트가 숫자 패턴(`/^\d+/`)을 포함하고 placeholder("--", "TBD" 등)가 아님을 확인
   - 칸반 컬럼 셀렉터로 컬럼 수 > 0, 각 컬럼 내 카드(또는 빈 상태 메시지) 존재 확인

3. **instructors.spec.ts** (REQ-E2E-004)
   - 등록 폼 제출 → 목록 페이지에서 새 강사 row 발견
   - 임의 프로젝트 상세 → AI 매칭 트리거 → 후보 카드 3개(또는 그 이상 중 top-3) 표시 확인

4. **projects.spec.ts** (REQ-E2E-005, stage 1만)
   - 신규 프로젝트 생성 폼 제출
   - 목록에서 **타이틀 기반** 검색으로 발견 (현재 동작; 클라이언트명 검색은 stage 2로 미룸)
   - 상세 페이지 진입
   - 강사 배정 액션
   - instructor 페르소나로 storageState 전환하여 알림 영역에서 배정 알림 발견

5. **me-resume.spec.ts** (REQ-E2E-006 일부)
   - 이력서 필드 수정 → 저장 → 새로고침 후 값 유지
   - PDF export 버튼 클릭 → `download` 이벤트 또는 `/api/.../pdf` 응답 200 검증

6. **me-payouts.spec.ts** (REQ-E2E-006 나머지)
   - 정산 이력 페이지 접근 → 행 수 > 0
   - 정산 설정 페이지에서 계좌 입력값이 마스킹/암호문(예: 별표 또는 hash 형태)으로 노출되는지 확인
   - 페이지 DOM(`page.content()`) 및 네트워크 응답(JSON body) 어디에도 평문 IBAN/계좌번호가 없음을 정규식으로 검증

### M3 (Priority High) — CI 회귀 게이트

- `pnpm e2e` 로컬 클린 체크아웃 통과 확인
- `playwright.config.ts`의 trace/screenshot/video 설정이 실패 시 산출물 생성하는지 일부러 실패 케이스로 1회 검증 후 원복
- `playwright-report/` 디렉터리에 산출물이 떨어지는지 문서화

### M4 (Priority Medium, **Blocked until SPEC-PROJECT-SEARCH-001 merges**) — Stage 2

[DEPENDENCY] **SPEC-PROJECT-SEARCH-001** (q 멀티컬럼 ILIKE — clients.name 등) 머지 후에만 시작.

- `projects.spec.ts`에 서브 테스트 추가:
  - 시나리오: title은 X, clients.name은 Y인 프로젝트를 시드 또는 사전 생성
  - q="Y"로 검색 → title이 매치하지 않음에도 해당 프로젝트가 결과에 포함됨을 어설트
  - 이는 UI를 통한 multi-column ILIKE 동작 증명
- AC-8 (acceptance.md) 활성화 및 통과 확인

## 기술적 접근 (Technical Approach)

- **시드 재사용**: 모든 시나리오는 `auth.setup.ts`가 만든 storageState를 통해 인증 상태를 주입받는다. 인라인 사용자 생성/삭제 금지.
- **결정성 확보**: 테스트 간 데이터 격리는 (a) 고유한 이름 prefix(`E2E-${Date.now()}` 등) 또는 (b) 테스트별 cleanup hook을 사용한다. DB truncate 같은 광범위 정리는 금지.
- **셀렉터 우선순위**: `getByRole`, `getByLabel`, `getByTestId` 우선. CSS 클래스 셀렉터는 최후 수단.
- **암호화 검증**: `me-payouts` 시나리오에서는 `expect(pageContent).not.toMatch(/\b\d{10,}\b/)` 류 정규식으로 계좌번호 평문 부재를 검증. JSON 응답은 `route.fetch()` 또는 `page.on('response')`로 본문을 캡처.

## 위험 요소 (Risks)

| 위험 | 완화 방안 |
| --- | --- |
| 시드 사용자 비번/이메일 변경으로 모든 스펙 깨짐 | `seed-users.ts` 단일 진실 공급원 패턴으로 격리 |
| AI 매칭이 비결정적 결과 → top-3 어설션 flaky | "후보 카드가 정확히 3개 노출"이 아닌 "최소 1개, 최대 3개 중 첫번째가 존재" 식으로 완화. 또는 시드 강사 풀을 작게 유지하여 결정성 확보 |
| PDF export가 환경에 따라 다운로드/인라인 응답 양쪽 가능 | 둘 다 허용하는 분기 어설션(다운로드 이벤트 OR `application/pdf` 응답) |
| Stage 2 의존 SPEC 머지 지연 | M4는 별도 PR로 분리하여 stage 1 머지가 막히지 않도록 함 |
| 정산 시나리오에서 환경별 평문 표현 차이로 false positive | 정규식을 보수적으로 작성하고, 마스킹된 표현(예: `****1234`)은 명시적으로 허용 |

## 검증 (Verification)

- `pnpm e2e` 로컬 통과
- CI(헤드리스) 통과
- `playwright-report/` 산출물 존재 확인 (실패 사례 한 번 강제 후 복원)
- M4 시점에 `q=clients.name` 시나리오 추가 통과

## 운영 순서 요약

```
M1 (헬퍼) → M2 (시나리오 6개 강화) → M3 (CI 게이트)
                                          │
                                          ▼ 머지
                              [SPEC-PROJECT-SEARCH-001 머지 대기]
                                          │
                                          ▼
                                       M4 (검색 서브 테스트 추가)
```
