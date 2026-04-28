---
id: SPEC-ADMIN-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: medium
related: [SPEC-AUTH-001, SPEC-ADMIN-001, SPEC-E2E-002, SPEC-SEED-002]
---

# SPEC-ADMIN-002 — Acceptance Criteria

## 1. Given-When-Then 시나리오

### AC-ADMIN002-DEACTIVATE-PROPAGATES — 비활성화 즉시 전파

**Given** 활성 operator 사용자 `op@algolink.test`가 브라우저 A에서 로그인되어 `/operator/dashboard`를 보고 있음
**And** admin 사용자가 브라우저 B에서 `/admin/users`에 진입해 있음
**When** admin이 `op@algolink.test`의 `is_active`를 false로 토글(SPEC-ADMIN-001 setUserActive Server Action 호출)
**And** 브라우저 A에서 다음 page navigation(예: `/operator/projects` 클릭) 발생
**Then** 브라우저 A의 응답이 `/login?error=deactivated`로 redirect 됨
**And** `/login` 페이지에 한국어 안내 배너가 노출됨
**And** 보호 라우트의 콘텐츠는 어떤 형태로도 노출되지 않음

매핑: REQ-ADMIN002-001, REQ-ADMIN002-005

---

### AC-ADMIN002-LOGIN-REJECTED — 비활성 자격증명 신규 로그인 거부

**Given** `inst@algolink.test` 사용자가 admin에 의해 `is_active=false`로 설정됨
**And** 해당 사용자는 현재 어떤 세션도 보유하지 않음
**When** 사용자가 `/login` 페이지에서 `inst@algolink.test`/올바른 비밀번호로 폼 제출
**Then** 로그인 Server Action이 `signInWithPassword` 성공 직후 `is_active=false`를 검출하여 `supabase.auth.signOut()`을 호출함
**And** 응답이 `/login?error=deactivated`로 redirect 됨 (또는 동등한 에러 응답)
**And** 응답 후 supabase 세션 쿠키가 무효화되어 있음
**And** 사용자는 보호 라우트에 도달하지 않음

매핑: REQ-ADMIN002-002, REQ-ADMIN002-005

---

### AC-ADMIN002-REACTIVATE-RESTORES — 재활성화 후 정상 로그인

**Given** `inst@algolink.test`가 비활성 상태(`is_active=false`)
**When** admin이 `is_active`를 true로 재토글
**And** `inst@algolink.test`가 `/login`에서 자격증명을 제출
**Then** 로그인 Server Action이 정상 진행되어 역할별 home(`/instructor/...`)으로 redirect
**And** 보호 라우트의 콘텐츠가 정상 노출됨
**And** 이후 SSR 요청에서 `requireUser`가 차단하지 않음

매핑: REQ-ADMIN002-006

---

### AC-ADMIN002-AUTH-REGRESSION — SPEC-AUTH-001 0 회귀

**Given** 활성 사용자 3명(instructor/operator/admin)에 대한 SPEC-AUTH-001의 기존 인증 흐름 e2e/통합 테스트 스위트
**When** SPEC-ADMIN-002 변경(M1~M4) 적용 후 동일 스위트 재실행
**Then** 모든 기존 시나리오가 PASS 상태를 유지함
**And** 미인증 사용자의 `/login?next=<경로>` redirect 동작이 변경되지 않음
**And** 활성 사용자의 로그인/세션 유지/로그아웃 흐름이 변경되지 않음
**And** `requireUser` 호출부가 새로운 deactivated 분기 외에는 변경되지 않음

매핑: REQ-ADMIN002-004, LESSON-003 직접 대응

---

### AC-ADMIN002-LOGIN-BANNER — /login 안내 배너

**Given** 사용자가 어떤 사유로든 `/login?error=deactivated` URL로 접근
**When** 페이지가 렌더링됨
**Then** 페이지 상단(또는 폼 위) 영역에 한국어 안내 메시지가 노출됨
- 메시지 예: "계정이 비활성화되었습니다. 관리자에게 문의해 주세요."
**And** 메시지 컨테이너에 `role="alert"` 또는 `aria-live="polite"` 속성이 적용됨
**And** WCAG 2.1 AA 명도 대비를 충족함
**And** 다른 에러 쿼리(예: `?error=invalid` 또는 일반 잘못된 자격증명 메시지)와 시각적/의미적으로 구분됨

매핑: REQ-ADMIN002-005

---

### AC-ADMIN002-NO-CACHE — 캐시 금지 검증

**Given** 사용자 A가 활성 상태로 보호 라우트에 진입
**When** admin이 비활성으로 토글하고, 사용자 A가 즉시 다음 SSR 요청 발생
**Then** `getCurrentUser`가 새로운 SELECT를 수행하여 최신 `is_active=false`를 즉시 인식함
**And** 모듈 레벨 캐시 / 외부 스토리지 캐시가 사용되지 않음
**And** 동일 요청 내 중복 호출에 대해서만 React `cache()` 적용이 허용됨

매핑: REQ-ADMIN002-003

---

## 2. 엣지 케이스 (Edge Cases)

### EC-001: public.users 조회 실패

**상황**: 데이터베이스 일시 장애 등으로 `public.users` SELECT 실패
**기대**: `getCurrentUser`가 null 반환 (fail-closed). `requireUser`는 `/login?next=...`로 redirect (보수적 차단).
**금지**: 활성 상태로 가정하고 보호 콘텐츠 노출 금지.

### EC-002: sub claim이 public.users에 존재하지 않음

**상황**: JWT의 sub가 `public.users.id`에 매핑되지 않는 경우 (데이터 불일치)
**기대**: `getCurrentUser`가 null 반환. `requireUser`가 `/login?next=...`로 redirect.

### EC-003: 비활성화 직전 발급된 활성 세션의 마지막 응답

**상황**: 사용자가 페이지 navigation을 트리거한 직후 admin이 비활성화
**기대**: 그 응답은 활성 응답일 수 있음 (race). 다음 요청부터 즉시 차단되면 ACCEPT.

### EC-004: 동일 요청 내 다중 getCurrentUser 호출

**상황**: server layout과 page component가 모두 `getCurrentUser`를 호출
**기대**: React `cache()`로 1회 SELECT만 수행. 동일 결과 공유.

### EC-005: 로그인 직후 즉시 비활성화

**상황**: 사용자가 `/login` 폼 제출 후 응답 직전 admin이 비활성화
**기대**: 로그인 Server Action의 `is_active` 검증이 최신 값을 읽어 차단할 수 있다면 차단. 못 읽었더라도 다음 SSR 요청에서 즉시 차단.

### EC-006: searchParams.error에 비정상 값

**상황**: `/login?error=<unknown>` 같은 알 수 없는 값
**기대**: deactivated가 아닌 경우 안내 배너 미노출. 일반 로그인 폼 노출.

### EC-007: 로그인 Server Action signOut 실패

**상황**: 비활성 검증 후 `signOut()` 호출이 일시 실패
**기대**: 그래도 사용자에게 에러 응답 반환. 다음 SSR 요청에서 `requireUser`가 차단(이중 안전망).

---

## 3. 품질 게이트 (Quality Gate Criteria)

### 3.1 코드 품질

- [ ] TypeScript 타입 체크 통과 (`tsc --noEmit`)
- [ ] ESLint 규칙 위반 0
- [ ] 신규/변경 파일 테스트 커버리지 SPEC-AUTH-001 가드 영역 합계 85% 이상
- [ ] `getCurrentUser`/`requireUser`/login Server Action에 대한 단위/통합 테스트 추가

### 3.2 보안

- [ ] 비활성 사용자 자격증명으로 보호 라우트 도달 불가 (수동 + e2e 검증)
- [ ] signOut 호출 후 supabase 세션 쿠키 무효화 확인
- [ ] 정보 누설: `/login?error=deactivated`가 비활성 사용자에게만 의미 있는 정보로 한정됨 (의도된 노출)

### 3.3 회귀 방지 (LESSON-003 직접 대응)

- [ ] SPEC-AUTH-001 인증 가드 e2e 시나리오 100% PASS
- [ ] 활성 사용자 3종(instructor/operator/admin)의 로그인/세션/로그아웃 흐름 변경 없음
- [ ] phase2-client/payout/notify e2e 0 회귀

### 3.4 접근성

- [ ] `/login` 안내 배너에 ARIA 속성 적용
- [ ] WCAG 2.1 AA 명도 대비 충족
- [ ] 스크린리더 호환 (수동 검증 1회)

### 3.5 성능

- [ ] `getCurrentUser` 추가 SELECT가 PK lookup이며 추가 latency 의미 있는 증가(>5ms p95) 없음
- [ ] 동일 요청 내 다중 호출이 React `cache()`로 1회로 수렴

---

## 4. 완료 정의 (Definition of Done)

본 SPEC은 다음을 모두 충족할 때 완료됩니다:

- [ ] 모든 AC(AC-ADMIN002-DEACTIVATE-PROPAGATES, LOGIN-REJECTED, REACTIVATE-RESTORES, AUTH-REGRESSION, LOGIN-BANNER, NO-CACHE) 검증 완료
- [ ] 모든 EARS 요구사항(REQ-ADMIN002-001~006) 구현 검증 완료
- [ ] 모든 엣지 케이스(EC-001~007) 처리 또는 명시적 비대상 표기
- [ ] 품질 게이트 모든 항목 통과
- [ ] `tests/e2e/phase2-admin.spec.ts` 비활성화 시나리오 PASS
- [ ] SPEC-AUTH-001 e2e 0 회귀 확인
- [ ] LESSON-003 회귀 패턴 추가 발생 0
- [ ] manager-docs를 통한 SYNC 단계로 문서/CHANGELOG 반영

---

## 5. 검증 방법 (Validation Methods)

| 검증 대상 | 도구 / 방법 |
|---|---|
| getCurrentUser is_active 분기 | Vitest 통합 테스트 (mock supabase) |
| requireUser deactivated redirect | Vitest 통합 테스트 + e2e |
| 로그인 Server Action 거부 | Vitest 통합 테스트 + Playwright e2e |
| /login 안내 배너 | Playwright e2e + 수동 검증 (스크린리더) |
| 캐시 금지 (per-request fresh) | 코드 리뷰 + 통합 테스트 (2회 토글 시나리오) |
| SPEC-AUTH-001 회귀 | 기존 e2e/통합 테스트 스위트 |
| 시각적/접근성 | Playwright a11y 헬퍼 또는 axe-core |

---

## 6. 비대상 / 제외 (Out of Acceptance)

다음은 본 SPEC의 acceptance 검증 대상이 아닙니다 (별도 SPEC):

- `is_active` 캐싱 / Redis / JWT-level 차단 검증
- 임시 ban / banned_until 활용 검증
- 비활성 사용자 셀프 활성화 / 셀프 탈퇴 흐름
- 비활성화 사유 입력 / `auth_events` 확장 / 알림 발송
- middleware 단의 차단 검증
