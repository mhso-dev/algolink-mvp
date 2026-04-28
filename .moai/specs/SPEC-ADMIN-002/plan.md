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

# SPEC-ADMIN-002 — Implementation Plan

## 1. 접근 (Approach)

### 1.1 핵심 전략

SSR 가드의 단일 진실 소스(single source of truth) 원칙을 유지한다. `getCurrentUser`가 사용자의 인증 상태와 활성 상태를 함께 책임지도록 하여, 모든 보호 라우트가 자동으로 일관된 차단 동작을 얻는다.

```
[기존 흐름]
SSR Request → middleware (token refresh) → requireUser → getCurrentUser → supabase.auth.getClaims()
                                                              ↓
                                                       null이면 redirect /login

[보강 흐름]
SSR Request → middleware (token refresh) → requireUser → getCurrentUser → getClaims()
                                                              ↓
                                                    sub로 public.users.is_active SELECT
                                                              ↓
                                                  is_active=false면 null + reason="deactivated"
                                                              ↓
                                              requireUser가 reason에 따라 분기 redirect
```

### 1.2 설계 원칙

- **Fail-closed**: `users` 조회 실패는 차단 쪽으로 처리 (null 반환).
- **Per-request fresh**: 캐시 금지. React `cache()`는 동일 요청 내에서만 허용.
- **분기 명확성**: 미인증(`?next=`)과 비활성(`?error=deactivated`)을 구분.
- **로그인 진입점 일관성**: SSR 가드와 로그인 Server Action이 동일한 `is_active` 검증을 수행.

---

## 2. 마일스톤 (Milestones, 우선순위 순)

### M1 — getCurrentUser 보강 (Priority: High)

`src/auth/server.ts`의 `getCurrentUser` 함수에 `public.users.is_active` 검증 추가.

작업 내용:
- `supabase.auth.getClaims()` 성공 후 `claims.sub`로 `public.users` 조회 (id, role, is_active)
- `is_active === false`인 경우 null + `{ reason: "deactivated" }` 반환 가능한 구조 도입
- 기존 호출부 호환 유지 (반환 시그니처 검토)
- 요청 내 중복 SELECT 방지 위해 React `cache()` 적용 (request-scoped)

검증:
- 활성 사용자: 기존 동작 유지
- 비활성 사용자: null 반환, reason 식별 가능

### M2 — requireUser deactivated 분기 (Priority: High)

`src/auth/guards.ts`의 `requireUser` 함수에 비활성 사용자 분기 추가.

작업 내용:
- `getCurrentUser` 결과 null + reason="deactivated"인 경우 `redirect("/login?error=deactivated")`
- 미인증(reason 없음 또는 unauthenticated)인 경우 기존 `redirect("/login?next=<현재경로>")` 유지
- 분기 결정 로직을 `requireUser` 한 곳에 집중

검증:
- 비활성 사용자가 보호 라우트 접근 시 `/login?error=deactivated`로 도달
- 미인증 사용자가 보호 라우트 접근 시 `/login?next=...` 유지

### M3 — login Server Action 보강 (Priority: High)

로그인 Server Action(`src/app/(auth)/login/actions.ts` 또는 동등 경로)에서 인증 직후 `is_active` 검증.

작업 내용:
- `supabase.auth.signInWithPassword` 성공 후 `claims.sub` 또는 반환된 user로 `public.users.is_active` 조회
- false인 경우 `supabase.auth.signOut()` 호출 + 에러 응답(`{ error: "deactivated" }` 또는 `redirect("/login?error=deactivated")`)
- true인 경우 기존 역할별 home redirect 흐름 유지

검증:
- 비활성 자격증명으로 로그인 시 보호 라우트 도달 차단
- signOut 호출 후 응답 쿠키에 supabase 세션이 남지 않음

### M4 — /login 안내 배너 (Priority: Medium)

`src/app/(auth)/login/page.tsx`에 `error=deactivated` 쿼리 처리.

작업 내용:
- `searchParams.error === "deactivated"` 조건으로 한국어 안내 메시지 렌더링
- `role="alert"` 또는 `aria-live="polite"` 적용
- WCAG AA 명도 대비 확인 (기존 디자인 토큰 재사용)
- 다른 에러(`?error=...`)와 분기 처리 또는 공용 컴포넌트 확장

검증:
- `/login?error=deactivated` 접근 시 배너 노출
- 스크린리더 호환

### M5 — 통합 테스트 (Priority: Medium)

Vitest 통합 테스트 추가.

작업 내용:
- `getCurrentUser`: is_active=false인 경우 null + reason 검증
- 로그인 Server Action: 비활성 자격증명 → signOut 호출 + 에러 분기
- requireUser: deactivated reason → redirect 경로 검증
- mock supabase client 또는 supabase test 환경 사용

검증:
- 단위/통합 테스트 GREEN
- 회귀 케이스(활성 사용자 정상 로그인) 0 실패

### M6 — e2e phase2-admin PASS 검증 (Priority: Medium)

`tests/e2e/phase2-admin.spec.ts`의 비활성화 시나리오를 실제 환경에서 통과시킨다.

작업 내용:
- 시드된 테스트 사용자(SPEC-SEED-002)로 시나리오 실행
- admin 토글 → instructor/operator 세션 navigation → `/login?error=deactivated` 도달 검증
- 재활성화 → 정상 로그인 검증
- SPEC-AUTH-001 기존 e2e 회귀 0 확인

검증:
- phase2-admin.spec.ts PASS
- phase2-client/payout/notify e2e 회귀 0
- SPEC-AUTH-001 인증 흐름 e2e 회귀 0

---

## 3. 기술 접근 (Technical Approach)

### 3.1 데이터 흐름

```
1. SSR Request 진입
2. middleware: supabase.auth.getClaims()로 토큰 갱신 (변경 없음)
3. server layout에서 requireUser() 호출
4. requireUser → getCurrentUser
   a. getClaims()로 sub 추출
   b. supabase server client로 public.users SELECT (id, role, is_active)
   c. is_active=false면 null + reason="deactivated"
5. requireUser가 reason에 따라 redirect 분기
   - reason="deactivated" → /login?error=deactivated
   - 기타(unauthenticated) → /login?next=<경로>
```

### 3.2 코드 구조 영향

- `src/auth/server.ts`: `getCurrentUser` 시그니처 확장 가능. 호출부가 user 객체만 사용하는 경우 호환 유지.
- `src/auth/guards.ts`: `requireUser` 내부 분기만 변경. 외부 시그니처 동일.
- `src/app/(auth)/login/actions.ts`: 인증 성공 후 추가 SELECT + signOut 분기.
- `src/app/(auth)/login/page.tsx`: searchParams 분기.

### 3.3 데이터베이스 영향

- 스키마 변경 없음 (`is_active` 컬럼은 SPEC-DB-001로 기존 존재).
- 추가 쿼리: `SELECT id, role, is_active FROM public.users WHERE id = $sub` (PK lookup).
- RLS: `users` 셀프 SELECT 정책이 sub 기준으로 허용되는지 확인. 필요 시 server-only client(서비스 롤)로 우회.

---

## 4. 위험 (Risks)

### R-001: getCurrentUser 호출부 호환성

`getCurrentUser` 시그니처 확장이 다른 호출부(예: 페이지 콘텐츠에서 user 정보 표시)에 영향을 줄 수 있다.

완화:
- M1 작업 시 호출부 전수 검토 (Grep)
- 기존 user 객체 반환을 유지하고 reason은 별도 채널(예: 두 번째 반환값, throw)로 전달

### R-002: middleware/getCurrentUser 이중 SELECT 가능성

middleware에서도 `getCurrentUser`를 호출하면 한 요청당 2회 SELECT 발생 가능.

완화:
- middleware는 토큰 갱신만 수행하고 `getCurrentUser`를 호출하지 않도록 확인 (SPEC-AUTH-001 흐름 유지)
- React `cache()`는 RSC 내에서만 동작하므로 middleware↔RSC 간 캐시 공유는 불가. 따라서 middleware는 is_active 검증을 하지 않는 것이 정확.

### R-003: 로그인 Server Action의 race condition

로그인과 admin 비활성화가 동시에 발생할 경우 일순간 로그인이 성공할 수 있다.

완화:
- 다음 SSR 요청에서 `requireUser`가 즉시 차단하므로 사용자에게 노출되는 콘텐츠는 없음
- 본 SPEC은 "다음 요청부터 즉시 차단"을 보장. 인증 직후 단일 응답에 대한 강한 일관성은 별도 SPEC으로 처리.

### R-004: 테스트 시드 / e2e 환경 의존

phase2-admin e2e가 SPEC-SEED-002 시드 데이터에 의존한다.

완화:
- M6에서 시드 상태 확인 후 실행
- 시드 누락 시 테스트 setup 단계에서 명시적 검증

### R-005: 정보 누설 vs UX

`?error=deactivated`는 해당 이메일 존재 여부를 노출할 수 있다.

완화:
- 비활성화는 admin 발화 액션이므로 본인 통지가 정당
- 일반 미인증/잘못된 자격증명은 기존 일반 에러 메시지 유지

---

## 5. 작업 순서 (Execution Order)

권장 순서: M1 → M2 → M3 → M4 → M5 → M6.

M1과 M2는 강한 의존(M2가 M1의 reason 채널 사용). M3는 M1과 독립적으로 진행 가능하나 M1의 SELECT 헬퍼 재사용을 위해 M1 후 진행 권장. M4는 M2/M3 완료 후 의미. M5는 M1~M4 작업 단위로 점진 추가. M6는 모든 코드 변경 완료 후 최종 검증.

병렬 기회: 없음 (단일 파일 의존 체인).

---

## 6. 완료 기준 (Definition of Done)

- 모든 EARS 요구사항(REQ-ADMIN002-001~006) 충족
- M1~M6 모두 완료
- 기존 SPEC-AUTH-001 e2e 회귀 0
- phase2-admin e2e 비활성화 시나리오 PASS
- TRUST 5 게이트 통과 (lint, typecheck, test, security, commit)
- LESSON-003 회귀 패턴 추가 발생 0
