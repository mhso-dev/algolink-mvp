---
id: SPEC-ADMIN-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: medium
issue_number: null
related: [SPEC-AUTH-001, SPEC-ADMIN-001, SPEC-E2E-002, SPEC-SEED-002]
---

# SPEC-ADMIN-002 — 비활성 사용자 즉시 차단 (Deactivated User Immediate Block)

## HISTORY

- 2026-04-28 (v0.1.0): 초안 작성. SPEC-ADMIN-001(F-301 회원/권한 관리)에서 도입된 `setUserActive` Server Action이 `public.users.is_active`만 토글하고 `auth.users` 세션은 살아 있는 회귀를 차단한다. SSR 가드(`requireUser`)와 로그인 Server Action을 보강하여 (a) 비활성 사용자의 다음 SSR 요청부터 즉시 세션 무효화 + `/login?error=deactivated` redirect, (b) 비활성 자격증명의 신규 로그인 즉시 거부, (c) `/login` 페이지 안내 배너 노출을 명세한다. SPEC-E2E-002 phase2-admin.spec.ts의 비활성화 회귀 테스트 통과를 목표로 한다. LESSON-003(인증/가드 회귀 즉시 테스트) 직접 대응 SPEC.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

비활성화(`users.is_active = false`)된 사용자의 세션을 즉시 차단한다. SPEC-ADMIN-001이 도입한 admin 회원 관리 화면의 "비활성화" 토글은 현재 `public.users.is_active`만 갱신할 뿐 `auth.users`의 supabase 세션을 종료하지 않아, 비활성화 직후에도 해당 사용자가 인증된 상태로 보호 라우트에 접근할 수 있다. 본 SPEC은 (a) SSR 가드 흐름에서 `is_active`를 권위 있는 진실로 검증, (b) 비활성 자격증명의 로그인 거부, (c) 사용자 안내 배너의 3가지 책임을 SPEC-AUTH-001 가드 위에 적층한다.

### 1.2 배경 (Background)

**현재 상태:**

- `src/lib/admin/users/queries.ts:159` `setUserActive(userId, isActive)`: `users` 테이블의 `is_active` 컬럼만 `update`. `auth.users.banned_until`이나 `signOut()` 호출 없음.
- `src/auth/server.ts` `getCurrentUser()`: `supabase.auth.getClaims()`만 호출. JWT의 `sub` 클레임으로 사용자를 식별하지만, `public.users.is_active`는 검증하지 않음.
- `src/auth/guards.ts` `requireUser()`: `getCurrentUser()`가 null일 때 `/login?next=...`로 리다이렉트. "deactivated" 분기 없음.
- 결과: admin이 사용자를 비활성화해도 그 사용자는 supabase 세션이 살아있는 한 보호 라우트(`/operator`, `/admin`, `/instructor` 그룹)에 정상 접근.

**회귀 신호:**

- `tests/e2e/phase2-admin.spec.ts`의 "비활성화 후 로그인 거부" 시나리오가 현재 통과하지 않음.
- LESSON-003(2026-04-28): "인증/가드 회귀 즉시 테스트" — 비활성/탈퇴 처리 시 supabase 세션과 `users.is_active`가 분리되어 있다는 사실 자체가 LESSON-003의 회귀 패턴.

**선택된 접근 (Option A — middleware/getCurrentUser 가드 보강):**

`getCurrentUser()`가 sub로 `public.users.is_active`를 1회 SELECT 하여 false면 null 반환. SSR의 모든 진입점이 `requireUser` → `getCurrentUser`를 거치므로, 한 곳을 보강하면 보호 라우트 전체가 일관되게 차단된다. supabase 세션 자체는 살아있더라도 SSR 가드가 최종 결정권을 가진다.

**대안 거절:**

| 대안 | 거절 사유 |
|---|---|
| Option B — `auth.users.banned_until` | supabase-auth admin API 의존. "임시 ban" vs "영구 비활성" 의미 충돌. 멱등성 처리 복잡. 재활성화 시 `banned_until`을 null로 되돌리는 추가 mutation 필요. |
| Option C — `custom_access_token_hook`에서 `is_active` 체크 | JWT 발급 시점(로그인/refresh)에만 체크. 기존 활성 세션은 토큰 만료까지(기본 1시간) 유효. 즉시 차단 요구사항 미충족. |

### 1.3 범위 (Scope)

**In Scope:**

- `src/auth/server.ts` `getCurrentUser()`: sub 추출 후 `public.users.is_active` 조회 → false면 null 반환 (per-request fresh read, 캐시 금지)
- `src/auth/guards.ts` `requireUser()`: `getCurrentUser()` null 사유에 따라 분기 — 미인증이면 `/login?next=<현재경로>`, 비활성이면 `/login?error=deactivated`로 redirect
- `src/app/(auth)/login/actions.ts` (또는 동등한 login Server Action): `signInWithPassword` 성공 직후 `is_active=false`이면 `supabase.auth.signOut()` + `{ error: "deactivated" }` 반환
- `src/app/(auth)/login/page.tsx`: `searchParams.error === "deactivated"`일 때 한국어 안내 배너 노출 (WCAG AA 명도 대비, 스크린리더 친화)
- `tests/e2e/phase2-admin.spec.ts`: 비활성화 → 다음 navigation에서 로그인 거부 시나리오 PASS 확인
- (선택) Vitest 통합 테스트: `getCurrentUser` is_active 분기, login Server Action 거부 분기

**Out of Scope (별도 SPEC):**

- `is_active` per-request 캐시 / Redis 캐시 / JWT claim 주입 (성능 후속 SPEC)
- 임시 ban (`banned_until` 활용) 기능
- 사용자 셀프 탈퇴 / 계정 삭제 흐름 (별도 데이터 보존 정책 필요)
- 비활성 사용자에게 별도 "정지된 계정" 페이지 제공 (현재는 `/login`에 안내 배너만)
- 관리자 측 비활성화 사유 입력 / 감사 로그 강화 (`auth_events` 확장)
- email 변경 / 비밀번호 강제 재설정과의 결합

### 1.4 가정 (Assumptions)

- SPEC-AUTH-001의 `requireUser`/`getCurrentUser` 흐름이 모든 보호 라우트의 진입점이다. (server layout 가드 일원화 완료)
- `public.users.is_active` 컬럼이 SPEC-DB-001로 이미 존재하며 default true.
- SPEC-ADMIN-001의 `setUserActive` Server Action이 `is_active=false`를 정상 기록한다. (본 SPEC은 그 기록을 권위 있는 진실로 사용)
- 모든 SSR 진입은 RSC/Server Component 레벨에서 발생하므로 `getCurrentUser` 1회 추가 SELECT의 latency 영향은 single-digit ms 수준으로 허용 가능.

---

## 2. 요구사항 (EARS Requirements)

### REQ-ADMIN002-001 (Event-driven, MUST)

**WHEN** admin이 `/admin/users` 화면에서 사용자를 비활성화(`is_active=false` 토글)하면,
**THEN** 해당 사용자의 다음 SSR 요청부터 `requireUser` 가드가 즉시 세션을 무효화하고 `/login?error=deactivated`로 redirect 한다.

수용:
- 활성 세션을 가진 사용자의 다음 page navigation이 `/login?error=deactivated`로 도달
- 보호 라우트에 SPEC-AUTH-001의 인증된 사용자 콘텐츠가 노출되지 않음

### REQ-ADMIN002-002 (Event-driven, MUST)

**WHEN** 비활성 사용자(`is_active=false`)가 `/login`에서 자격증명을 제출하면,
**THEN** 시스템은 `supabase.auth.signInWithPassword` 성공 직후 `is_active`를 검증하여 false인 경우 `supabase.auth.signOut()`을 호출하고 `/login?error=deactivated` 응답으로 거부한다.

수용:
- 비활성 자격증명으로 로그인 시도 시 보호 라우트에 도달하지 않음
- 응답 후 supabase 세션 쿠키가 무효화되어 있음 (signOut 호출 흔적)

### REQ-ADMIN002-003 (Ubiquitous, MUST)

**The system SHALL NOT** cache `is_active` 값을 요청 간(request-to-request)에 재사용한다. `getCurrentUser`는 매 SSR 요청마다 `public.users`에서 fresh read를 수행한다.

수용:
- React `cache()` / module-level memoization 사용 금지
- 요청 1회당 최대 1회 SELECT는 허용 (요청 내 동일 호출에 대한 React `cache()`는 허용 — request-scoped)

### REQ-ADMIN002-004 (Constraint, MUST)

**The system SHALL** maintain 0 regression in SPEC-AUTH-001 인증 가드 동작 (LESSON-003 직접 대응).

수용:
- 활성 사용자의 로그인/세션 유지 흐름 변경 없음
- 미인증 사용자의 `/login?next=<경로>` redirect 동작 변경 없음
- 기존 SPEC-AUTH-001 통합 테스트 / e2e 시나리오 PASS

### REQ-ADMIN002-005 (Event-driven, MUST)

**WHEN** `/login` 페이지가 `?error=deactivated` 쿼리와 함께 로드되면,
**THEN** 시스템은 한국어 안내 메시지("계정이 비활성화되었습니다. 관리자에게 문의해 주세요." 또는 동등 표현)를 ARIA 친화적인 배너로 노출한다.

수용:
- 메시지가 시각적으로 식별 가능 (WCAG AA 대비)
- 스크린리더가 메시지를 인식 (`role="alert"` 또는 `aria-live`)
- 다른 에러(`?error=...`)와 시각적으로 구분되거나 분기 처리됨

### REQ-ADMIN002-006 (State-driven, MUST)

**WHILE** 사용자가 비활성 → 활성으로 재토글된 상태이면,
**THEN** 다음 신규 로그인은 정상적으로 보호 라우트에 도달한다.

수용:
- 재활성화 직후 자격증명으로 로그인 → 역할별 home으로 정상 redirect
- 비활성 시점에 종료된 세션이 재활성 후 재발급 가능

---

## 3. 제외 (Exclusions — What NOT to Build)

본 SPEC이 명시적으로 다루지 않는 항목 (스코프 보호):

- **EX-001**: `is_active` 캐싱 / 메모이제이션 (성능 후속 SPEC). 현재는 every SSR request 1회 SELECT를 허용한다.
- **EX-002**: `auth.users.banned_until`을 활용한 임시 ban / 자동 만료 ban.
- **EX-003**: `custom_access_token_hook`에 `is_active` 주입 (JWT-level 차단). 본 SPEC은 SSR 가드 레벨 차단만 다룬다.
- **EX-004**: 사용자 셀프 탈퇴 / 계정 삭제 흐름. 비활성화는 admin 단방향 토글로 한정.
- **EX-005**: 비활성 사용자 전용 "정지된 계정" 안내 페이지. `/login` 내 배너로 충분.
- **EX-006**: 비활성화 사유 입력 / `auth_events` 확장 / 알림 발송. (별도 admin UX SPEC)
- **EX-007**: email 변경, 비밀번호 강제 재설정, MFA 강제 등 다른 계정 상태 전이.
- **EX-008**: middleware (`src/middleware.ts`) 단의 차단. 현재 `requireUser` SSR 가드만 보강한다 (middleware는 토큰 갱신 책임에 집중).
- **EX-009**: 이미 발급된 JWT의 강제 무효화. supabase 세션 쿠키는 살아있을 수 있으며, SSR 가드가 매 요청마다 권위 판정한다.

---

## 4. 비기능 요구사항 (Non-Functional Requirements)

### 4.1 성능

- `getCurrentUser` 1회 호출당 추가 SELECT 1회 (`public.users WHERE id = $sub`). PK lookup이므로 sub-millisecond 수준.
- React `cache()`로 동일 요청 내 중복 호출 방지 (request-scoped만 허용).

### 4.2 보안

- 정보 누설 방지: `/login?error=deactivated`는 "해당 이메일이 시스템에 존재한다"는 정보를 노출할 수 있다. 단, 비활성화는 admin 발화 액션이므로 사용자가 본인 계정 상태를 알 수 있도록 허용한다.
- `signOut()` 누락 방지: 로그인 Server Action에서 `is_active=false` 분기 시 반드시 `signOut()` 호출.

### 4.3 가용성 / 회복

- `public.users` 조회 실패 시: `getCurrentUser`는 null 반환 + 에러 로그. 즉, 차단 측 안전(fail-closed).

### 4.4 접근성

- `/login` 안내 배너: `role="alert"` 또는 `aria-live="polite"`, WCAG AA 명도 대비.

---

## 5. 통합 지점 (Integration Points)

| 대상 | 파일 / 모듈 | 변경 성격 |
|---|---|---|
| SSR 인증 헬퍼 | `src/auth/server.ts` `getCurrentUser` | is_active 검증 추가 |
| SSR 가드 | `src/auth/guards.ts` `requireUser` | deactivated 분기 추가 |
| 로그인 Server Action | `src/app/(auth)/login/actions.ts` (또는 동등) | signIn 후 is_active 검증 + signOut 분기 |
| 로그인 페이지 | `src/app/(auth)/login/page.tsx` | `error=deactivated` 배너 |
| Admin 회원 관리 | `src/lib/admin/users/queries.ts:setUserActive` | **변경 없음** (기존 동작 유지) |
| E2E 테스트 | `tests/e2e/phase2-admin.spec.ts` | 비활성화 시나리오 PASS 확인 |

---

## 6. 결정 사항 (Decisions)

- **D-001**: SSR 가드 레벨 차단(Option A) 채택. JWT-level 차단(Option C)은 즉시성 부족, banned_until(Option B)은 의미 충돌로 거절.
- **D-002**: `getCurrentUser`의 추가 SELECT를 매 요청마다 수행. 캐시는 request-scoped React `cache()`까지만 허용. (REQ-ADMIN002-003)
- **D-003**: 비활성 분기 시 `/login?error=deactivated` 단일 쿼리 사용. 별도 페이지 라우트 신설 안 함. (`?next=` 분기와 명확히 구분)
- **D-004**: 로그인 Server Action에서 `signOut()` 호출 명시. 세션 쿠키 잔존 방지.
- **D-005**: middleware 변경 없음. SSR 가드가 최종 결정권을 갖는 단일 진실 소스.

---

## 7. 의존성 (Dependencies)

- **선행 (완료)**: SPEC-AUTH-001(인증 가드), SPEC-ADMIN-001(비활성화 토글), SPEC-DB-001(`users.is_active` 컬럼), SPEC-SEED-002(테스트 시드)
- **연관 (병렬)**: SPEC-E2E-002(phase2-admin e2e 회귀 검증)
- **후행 (별도 SPEC)**: 캐싱 최적화, 임시 ban, 비활성화 사유/알림

---

## 8. 검증 (Validation)

- e2e: `tests/e2e/phase2-admin.spec.ts` 비활성화 시나리오 PASS
- 통합: SPEC-AUTH-001 e2e 0회귀
- 수동: admin 토글 → 다른 브라우저 세션의 navigation에서 즉시 `/login?error=deactivated` 도달
