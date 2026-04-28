---
id: SPEC-E2E-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
---

# SPEC-E2E-002 구현 계획 (Plan)

## 접근 전략 (Approach)

SPEC-E2E-001이 검증한 골든패스 패턴(페르소나 storageState 재사용, 시드 의존, Chromium 헤드리스, 결정성 prefix, cleanup hook)을 그대로 적용하여 Phase 2 4개 도메인에 대한 신규 spec 파일 4개를 `tests/e2e/` 하위에 작성한다. 도메인별 1 파일 정책으로 책임 분리하며, 공통 유틸이 필요할 경우에만 `tests/e2e/helpers/phase2.ts`를 신규 생성한다.

## 파일 변경 목록 (Files)

신규 spec 파일 (4개, 도메인별 분리):

- `tests/e2e/phase2-client.spec.ts` — REQ-E2E2-001 (CLIENT 골든패스: 등록 → 검색 → 매치)
- `tests/e2e/phase2-payout.spec.ts` — REQ-E2E2-002 (PAYOUT 상태 머신: pending → requested → paid + 매출매입 반영)
- `tests/e2e/phase2-admin.spec.ts` — REQ-E2E2-003 (ADMIN 비활성화 → 로그인 거부)
- `tests/e2e/phase2-notify.spec.ts` — REQ-E2E2-004 (NOTIFY 정산요청 트리거 → bell 카운트 → read_at 업데이트)

신규 헬퍼 (필요 시 — 중복 코드가 2회 이상 발생할 경우에만 생성):

- `tests/e2e/helpers/phase2.ts` — Phase 2 4 spec 공통 유틸 (예: pending 거래 식별, cleanup용 정산 상태 원복, NotificationBell 카운트 파싱)
- 단일 spec에서만 쓰는 유틸은 해당 spec 내부 helper 함수로 유지한다

기존 헬퍼 재사용 (변경 없음):

- `tests/e2e/helpers/personas.ts` — 페르소나 계정 + grep 태그
- `tests/e2e/helpers/seed-users.ts` — 자격 증명 주입 단일 진실 공급원

설정 (변경 없음, 검증/문서화만):

- `playwright.config.ts` — 5 project(`setup`, `anon`, `instructor`, `operator`, `admin`) + grep 태그 + trace/screenshot/video on failure 설정 존재 확인. 변경 시도 금지.

## 마일스톤 (Milestones, priority-based — 시간 추정 없음)

### M1 (Priority High) — 사전 검증 + 헬퍼 정비

- 페르소나 storageState 4개(setup 산출물)가 정상 생성되는지 `pnpm e2e --project=setup` 1회 실행으로 확인
- 시드 데이터(`pending` 거래, 보조 operator 계정) 존재 여부를 `pnpm db:verify` 또는 직접 SQL로 확인
- `tests/e2e/helpers/phase2.ts` 필요 여부 판단 (작성 시작 후 중복 발생 시 추출)

### M2 (Priority High) — REQ-E2E2-001 CLIENT 시나리오

`tests/e2e/phase2-client.spec.ts` 작성:

- describe 태그: `"@operator phase2-client"`
- 단일 test: 등록 → 검색 → 매치 어설트
- 회사명: `E2E-CLIENT-${Date.now()}` prefix
- 담당자: 이름/이메일/연락처는 동일 prefix 활용 (이메일은 `e2e-client-${ts}@example.test`)
- 사업자등록증 업로드: input[type=file] 존재 여부 확인 후 fixture 부재 시 skip(부분 어설트만)
- cleanup: afterEach에서 생성된 회사명 prefix로 식별하여 삭제 (또는 soft-delete API가 없으면 검색만으로 격리 확인)

### M3 (Priority High) — REQ-E2E2-002 PAYOUT 시나리오

`tests/e2e/phase2-payout.spec.ts` 작성:

- describe 태그: `"@operator phase2-payout"`
- 단일 test: pending → requested → paid 상태 전환 + 매출매입 위젯 반영 어설트
- 사전 단계: `/transactions` 진입 → 첫 `pending` 행 식별 → 부재 시 `test.skip(true, "pending 거래 시드 부재")`
- 액션: "정산요청" 클릭 → 행 상태 또는 배지 텍스트가 `requested` 표시되는지 확인
- 액션: "입금확인" 클릭 → 행 상태가 `paid` 표시되는지 확인
- 매출매입 위젯: 시작 시점 KPI 값을 캡처 → 상태 전환 후 KPI 값이 변동했는지(`>=` 또는 `!=`) 어설트
- cleanup: afterEach에서 paid 거래를 다시 pending으로 원복 (관리자 API 또는 SQL 직접 사용 — 관리자 API 부재 시 cleanup hook은 skip 처리하고 격리는 후속 PR로 위임)

### M4 (Priority High) — REQ-E2E2-003 ADMIN 시나리오

`tests/e2e/phase2-admin.spec.ts` 작성:

- describe 태그: `"@admin phase2-admin"`
- 단일 test: 비활성화 → 로그인 거부 → 원복 어설트
- 사전 단계: `/admin/users` 진입 → 시드의 보조 operator 계정 식별 → 부재 시 `test.skip(true, "비활성화 대상 operator 시드 부재")`
- 액션: 비활성화 토글 클릭 → 행 상태 표시 확인
- 검증: 새 컨텍스트(`browser.newContext()`, storageState 없음)로 로그인 페이지 진입 → 비활성화된 계정 자격 증명 입력 → 로그인 시도 → `/login?error=deactivated`(또는 동등 에러) 노출 확인
- cleanup: afterEach에서 admin 페르소나로 다시 활성화 토글 실행 (테스트 격리 핵심)
- LESSON-003 준수: 인증/가드 회귀 신호 역할

### M5 (Priority High) — REQ-E2E2-004 NOTIFY 시나리오

`tests/e2e/phase2-notify.spec.ts` 작성:

- describe 태그: `"@operator phase2-notify"`
- 단일 test: 정산요청 트리거 → bell unread 카운트 증가 → dropdown 클릭 → read_at 업데이트 어설트
- 사전 단계: 헤더 NotificationBell 셀렉터로 현재 unread 카운트 캡처 → `/transactions` 진입 → `pending` 행 식별(부재 시 skip)
- 액션: 정산요청 클릭 (REQ-E2E2-002와 동일 트리거)
- 검증 (a): 헤더 unread 카운트가 `prev + 1` 이상으로 증가
- 액션: NotificationBell dropdown 열기 → 최상단 항목 클릭
- 검증 (b): unread 카운트 감소 OR (UI 검증 어려운 경우) DB의 `notifications.read_at` IS NOT NULL을 SQL helper로 확인 (fallback)
- cleanup: afterEach에서 정산 상태 원복 + 생성된 알림 행 삭제 (관리자 권한 API 또는 SQL helper)

### M6 (Priority Medium) — CI 회귀 게이트

- `pnpm e2e` 로컬 클린 체크아웃 통과 확인 (Phase 1 + Phase 2 합산)
- 4개 시나리오 모두 PASS 또는 정당한 사유의 SKIP 만 기록되는지 확인
- `playwright-report/` 산출물(trace/screenshot/video) 4 spec 모두에 대해 실패 시 생성됨을 1회 검증 후 원복
- README 또는 Phase 2 종결 보고서에 SPEC-E2E-002 추가 항목 반영 (별도 PR로 분리 가능)

## 기술적 접근 (Technical Approach)

- **시드 재사용**: 모든 시나리오는 `auth.setup.ts` storageState + `seed-users.ts` 자격 증명 헬퍼만 사용한다. 인라인 사용자 생성 금지.
- **결정성 확보**: 신규 데이터(회사명, 담당자 이메일)는 `E2E-${domain}-${Date.now()}` prefix. 기존 시드 의존 데이터(`pending` 거래, 보조 operator)는 부재 시 명시 사유로 skip.
- **셀렉터 우선순위**: `getByRole`, `getByLabel`, `getByTestId` 우선. CSS 클래스/`data-test-id` 셀렉터는 차선. 동적 텍스트(상태 배지)는 `getByText` 사용.
- **cleanup 전략**: 각 spec의 `test.afterEach`에서 부수효과를 정리한다. 광범위 정리(DB truncate)는 금지. 정리 실패 시 다음 테스트가 영향받지 않도록 prefix 격리도 병행.
- **DB 검증 fallback**: NOTIFY 시나리오의 `read_at` 검증은 우선 UI 카운트 감소로 어설트. UI 셀렉터가 모호하면 SQL helper(예: `pnpm db:exec` 또는 `supabase` CLI 호출) fallback 사용.
- **격리 가능성**: 4 spec은 서로 다른 도메인을 다루므로 데이터 충돌이 없어야 한다. 단, PAYOUT과 NOTIFY는 동일 `pending` 거래에 의존할 수 있어 시드 풀이 작은 경우 직렬 실행 권장 (workers=1 유지).

## 위험 요소 (Risks)

| 위험 | 완화 방안 |
| --- | --- |
| 시드의 `pending` 거래 풀 부족으로 PAYOUT/NOTIFY 동시 실행 시 충돌 | workers=1 유지 (`playwright.config.ts` 기본). 또는 spec 내부에서 pending 행을 atomically claim하는 helper 도입(후순위) |
| 보조 operator 계정 부재로 ADMIN 시나리오 영구 skip | 시드 보강은 본 SPEC 범위 밖이므로 skip 허용. 별도 SPEC-SEED-XXX로 시드 보강 위임 |
| 비활성화 cleanup 실패 시 다음 테스트에서 해당 operator 사용 불가 | afterEach에서 try/catch로 cleanup 실패를 명시 로그하고, 다른 테스트가 해당 계정 의존하지 않도록 분리 |
| NotificationBell 셀렉터가 환경별로 다르거나 미정 | `data-testid="notification-bell"` 같은 명시 testid가 있으면 우선 사용. 없으면 `getByRole("button", { name: /알림/ })` fallback. 두 패턴 모두 실패 시 spec 작성 시점에 LESSON으로 기록 |
| 매출매입 위젯 KPI 셀렉터 모호 | KPI 텍스트 패턴(`/^\d+/`)이나 `data-testid` 식별 어려운 경우 위젯 레벨 어설트는 "위젯이 마운트됨" + "값이 비어있지 않음" 수준으로 완화 (REQ는 "반영"만 요구, 정확 수치 비교 강제 안 함) |
| LESSON-002(미구현 플레이스홀더 금지) 위반 우려 — 정당한 skip vs 회피성 skip 구분 | 모든 `test.skip(true, "사유")`의 사유 문자열은 (a) 시드 부재 (b) UI/API 미구현 (c) 환경 제약 중 하나로 명시. 회피성 "TODO" 메시지 금지 |

## 검증 (Verification)

- `pnpm e2e --grep "@operator phase2-client"` 통과
- `pnpm e2e --grep "@operator phase2-payout"` 통과 또는 정당 skip
- `pnpm e2e --grep "@admin phase2-admin"` 통과 또는 정당 skip
- `pnpm e2e --grep "@operator phase2-notify"` 통과 또는 정당 skip
- `pnpm e2e` 전체 스위트(Phase 1 + Phase 2) 통과
- `playwright-report/` 산출물 존재 확인 (실패 사례 한 번 강제 후 복원)
- 새로 추가된 어설션이 어떤 REQ를 커버하는지 주석으로 매핑 (`// REQ-E2E2-001 (b)`)

## 운영 순서 요약

```
M1 (사전 검증/헬퍼) → M2 (CLIENT) → M3 (PAYOUT) → M4 (ADMIN) → M5 (NOTIFY) → M6 (CI 게이트)
                            └────── 4개 spec 병렬 작성도 가능 (도메인 격리됨) ──────┘
```

## SPEC-E2E-001과의 차이점

| 항목 | SPEC-E2E-001 | SPEC-E2E-002 |
| --- | --- | --- |
| 대상 Phase | Phase 1 (5 SPEC) | Phase 2 (4 SPEC, 4 도메인) |
| 작업 방식 | 기존 spec 파일 6개 **확장(extend)** | 신규 spec 파일 4개 **작성(new)** |
| 헬퍼 | `helpers/seed-users.ts` 신규 생성 | 기존 헬퍼 재사용 (필요 시 `phase2.ts` 추가) |
| 시드 의존 강도 | 낮음 (자격 증명 위주) | 높음 (`pending` 거래, 보조 operator 등) |
| skip 정책 | 환경 의존적 1건만 허용 (AC-8) | 시드 부재 시 명시 사유로 skip 허용 (REQ-E2E2-007) |
