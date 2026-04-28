---
id: SPEC-AUTH-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
related: [SPEC-AUTH-001, SPEC-ADMIN-002, SPEC-ADMIN-001, SPEC-DB-001, SPEC-SEED-002, SPEC-E2E-002]
---

# SPEC-AUTH-002 — Implementation Plan

## 1. 접근 (Approach)

### 1.1 핵심 전략

**상태 게이트(state gate) 재사용**: SPEC-ADMIN-002가 만든 `is_active` 기반 차단 메커니즘을 재사용하여, 셀프 가입은 새로운 코드 경로지만 **차단 메커니즘은 0 신규**로 처리한다. 본 SPEC은 (a) 진입점 추가(`/signup`), (b) 메타데이터 추가(`instructor_signup_requests`), (c) 운영자 큐 추가(`/admin/signup-requests`)에 집중하며, 가드 자체는 기존 `requireUser`만 분기 추가한다.

```
[기존 흐름 — SPEC-AUTH-001 invite fast-track]
operator → /operator/instructors/new → admin.inviteUserByEmail
        → /accept-invite/set-password → users.is_active=true → 정상 로그인

[신규 흐름 — SPEC-AUTH-002 cold path]
visitor → /signup (form) → signupInstructor Server Action
        → auth.admin.createUser + users.is_active=false + instructor_signup_requests(pending)
        → /signup/pending (안내)

operator → /admin/signup-requests (queue) → approveSignupRequest
        → users.is_active=true → 다음 로그인 시 정상

또는 → rejectSignupRequest → users.is_active 그대로 false → 차단 유지
```

### 1.2 설계 원칙

- **동작 보존(invite fast-track)**: SPEC-AUTH-001 코드 경로는 한 줄도 변경하지 않는다.
- **단일 차단 진실**: SPEC-ADMIN-002의 `requireUser` + `is_active` 가드가 모든 비활성 차단의 권위. 본 SPEC은 차단 분기에 `pending_approval`만 추가한다.
- **정보 누설 최소화**: 중복 이메일 응답은 통일 메시지. Rate-limit는 IP 기준이 우선, email 기준은 보조.
- **롤백 가능성**: 가입 Server Action은 `auth.users` 생성 실패/`users` upsert 실패 시 즉시 `auth.admin.deleteUser`로 롤백 (기존 invite 액션 패턴 모방).
- **시드 호환**: 신규 페르소나 추가는 SPEC-SEED-002 패턴을 따름. 기존 4 페르소나는 변경 없음.

---

## 2. 모듈 구성 (Modules)

### M1 — DB 스키마: instructor_signup_requests + auth_rate_limits + auth_events 확장 (Priority: High)

**Scope**:
- `public.instructor_signup_requests` 테이블 신설 (spec.md §6.1)
- `public.auth_rate_limits` 테이블 신설 (spec.md §6.2)
- `public.auth_events.event_type` CHECK 확장: `signup_submitted`, `signup_approved`, `signup_rejected`, `invite_after_rejection` 4종 추가
- RLS 정책 적용 + 인덱스 + UNIQUE 제약 (pending one-per-user)

**Files Touched**:
- `supabase/migrations/20260428000010_instructor_signup_requests.sql` (신규)
- `supabase/migrations/20260428000011_auth_rate_limits.sql` (신규)
- `supabase/migrations/20260428000012_auth_events_signup_types.sql` (신규, ALTER CHECK)
- `src/db/schema/auth.ts` (Drizzle 동등 정의 — SPEC-AUTH-001 §4.10 "auth 관련 테이블은 SQL only" 원칙 따라 SQL만 추가하고 Drizzle은 `pgTable` 정의 없음 가능. <!-- TBD: 본 프로젝트의 Drizzle 사용 범위 확인 후 결정 -->)
- `src/db/supabase-types.ts` (자동 재생성 또는 수기 추가)

**DB 마이그레이션**: 3개 신규 SQL 파일. 모두 forward-only.

**Tests**:
- `tests/db/instructor-signup-requests.rls.test.ts` (RLS: operator/admin SELECT 가능, instructor/anon 거부)
- `tests/db/auth-rate-limits.rls.test.ts` (service-role only)
- `pnpm db:verify` 시드 검증 + 신규 테이블 무결성 확인

**Risks**:
- R-M1-1: `auth.users` ON DELETE CASCADE가 `instructor_signup_requests`까지 전파되는지 확인. 거부된 row는 보존되어야 하므로 `ON DELETE SET NULL` on `processed_by`는 OK이나 `user_id`는 CASCADE — 사용자 자체가 삭제되면 가입 신청 history도 의미 없으므로 CASCADE 채택.
- R-M1-2: `is_active` default가 SPEC-DB-001 시점에 `true`로 설정되어 있다면, 본 SPEC의 가입 액션은 INSERT 시 명시적으로 `false` 지정해야 함. 시드 결과 확인 필요. <!-- TBD -->

---

### M2 — Server Action `signupInstructor` + Rate-limit 헬퍼 (Priority: High)

**Scope**:
- `signupInstructor(formData)` Server Action 구현 (spec.md §REQ-AUTH002-001..005)
- Rate-limit 헬퍼 `checkAndRecordRateLimit({ keyType, keyValue, action })` 구현
- IP 추출 헬퍼 (`x-forwarded-for` 우선, 없으면 unknown)
- zod schema: signup 폼 검증
- 한국어 에러 메시지 매핑 (SPEC-AUTH-001 `src/auth/errors.ts` 패턴 재사용)

**Files Touched**:
- `src/app/(auth)/signup/actions.ts` (신규)
- `src/lib/rate-limit/check.ts` (신규 — Postgres 백엔드 rate-limit 헬퍼)
- `src/lib/validation/auth.ts` (signupSchema 추가)
- `src/auth/errors.ts` (signup-specific 에러 추가: `SIGNUP_RATE_LIMITED`, `SIGNUP_DUPLICATE_EMAIL`, `SIGNUP_TERMS_REQUIRED`)
- `src/auth/events.ts` (logAuthEvent에 `signup_submitted` 사용)

**DB 마이그레이션**: 없음 (M1에서 처리).

**Tests**:
- `tests/unit/signup-action.test.ts`:
  - 유효한 페이로드 → users + signup_requests + auth_events 3종 row 생성
  - 약관 미동의 → reject before any DB call
  - 중복 이메일 → unified message + no row created
  - rate-limit 초과 → 429 + no row created
  - 부분 실패 시 `auth.admin.deleteUser` 롤백 호출 검증
- `tests/unit/rate-limit-check.test.ts`: IP 3회 / email 1회 임계값 boundary 테스트

**Risks**:
- R-M2-1: `auth.admin.createUser` race condition (동시 동일 이메일 가입 시도) — Supabase 측에서 unique constraint 처리하므로 catch 후 통일 메시지 반환.
- R-M2-2: IP 추출이 Vercel/proxy 설정에 따라 다름. `x-forwarded-for`의 첫 IP 채택. `127.0.0.1`/내부망 IP는 그대로 기록 (개발 환경 호환).
- R-M2-3: rate-limit 검사 자체가 DB query 1회 추가 → 성능 영향 미미 (인덱스 lookup).

---

### M3 — 공개 라우트 + 폼 컴포넌트 (Priority: High)

**Scope**:
- `/signup` 페이지: 폼 렌더링 + Server Action 바인딩 (spec.md §8.1)
- `/signup/pending` 안내 페이지 (spec.md §8.2)
- `(auth)/layout.tsx` 재사용 (이미 존재, 변경 없음)
- 이미 로그인된 사용자가 `/signup` 진입 시 `roleHomePath`로 redirect (SPEC-AUTH-001 패턴)
- 로그인 페이지에 "회원가입" 링크 추가

**Files Touched**:
- `src/app/(auth)/signup/page.tsx` (신규)
- `src/app/(auth)/signup/signup-form.tsx` (신규, client component)
- `src/app/(auth)/signup/pending/page.tsx` (신규)
- `src/app/(auth)/login/login-form.tsx` (기존 — "회원가입" 링크 추가)
- `src/app/(auth)/login/page.tsx` (`?error=pending_approval` 분기 배너 추가)

**DB 마이그레이션**: 없음.

**Tests**:
- Playwright e2e `tests/e2e/auth-signup.spec.ts`:
  - 정상 가입 흐름 → `/signup/pending` 도달
  - 약관 미동의 → 클라이언트 검증 에러
  - 비밀번호 정책 위반 → 클라이언트 검증 에러
  - 중복 이메일 (이미 시드된 instructor) → 통일 메시지
  - 가입 직후 로그인 시도 → `/login?error=pending_approval`
- Vitest a11y: signup-form 키보드 네비게이션 + label 연결 + `role="alert"`

**Risks**:
- R-M3-1: 약관 페이지(`/terms`, `/privacy`) 미존재 → 링크 클릭 시 404. 임시 placeholder 페이지 추가 또는 `<!-- TBD -->`로 별도 SPEC 위임. 본 plan에서는 placeholder 1줄 페이지 생성 (콘텐츠는 별도 SPEC).
- R-M3-2: `(auth)/layout.tsx`가 이미 로그인된 사용자를 home으로 redirect하는 로직이 있는지 확인. 없으면 `/signup` 진입 시 추가 가드 필요.

---

### M4 — 운영자 승인 큐 (`/admin/signup-requests`) (Priority: High)

**Scope**:
- `/admin/signup-requests` 라우트 + 페이지 (spec.md §8.3)
- 큐 페치 query (operator/admin RLS)
- 승인/거부 confirmation dialog
- Server Actions `approveSignupRequest`, `rejectSignupRequest`
- (선택) 처리 이력 탭 — pending 외 status 조회 <!-- TBD -->

**Files Touched**:
- `src/app/(app)/(admin)/admin/signup-requests/page.tsx` (신규)
- `src/app/(app)/(admin)/admin/signup-requests/actions.ts` (신규)
- `src/app/(app)/(admin)/admin/signup-requests/signup-requests-table.tsx` (신규, client component)
- `src/lib/admin/signup-requests/queries.ts` (신규)
- `src/app/(app)/(admin)/admin/layout.tsx` 또는 navigation 컴포넌트: 사이드바 메뉴 항목 추가
- `src/app/(app)/(operator)/operator/...`: operator 권한도 가능하므로 `requireRole(['operator', 'admin'])` 적용
  - 라우트 그룹 결정: `/admin/signup-requests`로 하되 `requireRole`은 operator + admin 둘 다 허용 — `/admin/*` prefix가 admin-only가 아닌 케이스 정착 필요. 또는 `/operator/signup-requests`로 옮기는 안 검토 <!-- TBD: SPEC-AUTH-001 §REQ-AUTH-GUARD-004는 /admin/* = admin only로 정의. 본 SPEC은 operator도 승인 가능을 요구하므로 `/operator/signup-requests`가 더 적합 -->

**DB 마이그레이션**: 없음.

**Tests**:
- Vitest 통합 `tests/integration/signup-approval.test.ts`:
  - 승인 → users.is_active=true + status=approved + auth_events row
  - 거부 → users.is_active=false + status=rejected + auth_events row
  - 멱등: 이미 approved row에 다시 승인 시도 → no-op + 한국어 메시지
- Playwright e2e `tests/e2e/auth-signup.spec.ts`:
  - operator 로그인 → `/operator/signup-requests` (또는 `/admin/...`) 진입 → pending 항목 확인 → 승인 → 가입자 로그인 성공
  - 거부 시나리오 → 가입자 로그인 차단

**Risks**:
- R-M4-1: 라우트 그룹 결정 (operator vs admin) — SPEC-AUTH-001의 `/admin/*` = admin only 규칙 위반 가능. **권장**: `/operator/signup-requests`로 이동 (operator + admin 모두 접근, SPEC-AUTH-001 §REQ-AUTH-GUARD-004 호환). 본 plan에서 이 결정을 채택.
- R-M4-2: `/admin/users` 목록에 pending 사용자가 함께 표시되어 운영자 혼란 가능 — SPEC-ADMIN-001 측에 status 배지 추가 검토 (본 SPEC 범위 외, 별도 follow-up).

**최종 라우트 결정**: `/operator/signup-requests` (operator + admin 접근). spec.md §8.3의 `/admin/signup-requests` 표기는 다음 amendment 사이클에서 정정.

---

### M5 — Rate-limit 메커니즘 (Priority: Medium)

**Scope**:
- `public.auth_rate_limits` 테이블 활용 (M1에서 생성됨)
- `checkAndRecordRateLimit` 헬퍼 (M2에서 구현)
- 본 모듈은 헬퍼 통합 검증 + 운영 가시성에 집중
- (선택) 만료 row GC 잡 — 본 SPEC 범위 외

**Files Touched**:
- M2와 동일 (별도 신규 파일 없음)
- `src/lib/rate-limit/check.ts` 추가 검증 + 문서화

**DB 마이그레이션**: 없음.

**Tests**:
- M2 테스트와 동일 (rate-limit boundary)
- `tests/integration/rate-limit-window.test.ts`: 시계 mock으로 15분/24h 경계 검증

**Risks**:
- R-M5-1: 테스트 시계 mock 정확성. Vitest `vi.useFakeTimers()` 사용.
- R-M5-2: 실제 운영에서 rate-limit row가 무한 누적. 30일 GC 잡은 별도 SPEC.

---

### M6 — E2E 커버리지 (Priority: Medium)

**Scope**:
- 신규 e2e: `tests/e2e/auth-signup.spec.ts`
  - 가입 정상 흐름 (form → pending → operator approve → login)
  - 거부 흐름
  - 중복 이메일 거부
  - rate-limit 거부 (IP 4회째)
  - `/login?error=pending_approval` 배너 노출
- 기존 e2e 보강: `tests/e2e/rbac-cross-role.spec.ts`
  - `instructorPending` 페르소나로 `/instructor/*`, `/operator/*`, `/admin/*` 모두 차단 검증
  - `/login?error=pending_approval` redirect 검증
- 시드 페르소나 추가: `tests/e2e/helpers/seed-users.ts` + `personas.ts`에 `instructorPending` 1종 추가

**Files Touched**:
- `tests/e2e/auth-signup.spec.ts` (신규)
- `tests/e2e/rbac-cross-role.spec.ts` (수정)
- `tests/e2e/helpers/seed-users.ts` (수정)
- `tests/e2e/helpers/personas.ts` (수정)

**DB 마이그레이션**: 없음.

**Tests**: 본 모듈 자체가 테스트.

**Risks**:
- R-M6-1: e2e 환경의 rate-limit 카운터 누적 → 테스트 격리 깨짐. 각 spec 시작 시 `auth_rate_limits` truncate (helper) 또는 IP를 spec별로 다르게 mock.
- R-M6-2: 신규 페르소나 추가가 SPEC-SEED-002 시드 검증을 깨뜨릴 가능성 — `pnpm db:verify` 재실행으로 확인.

---

### M7 — 문서 동기화 + SPEC-AUTH-001 amendment (Priority: Low)

**Scope**:
- SPEC-AUTH-001 spec.md HISTORY 보강 (별도 첨부 `spec-auth-001-amendment.md` 작성, orchestrator가 검토 후 적용)
- CLAUDE.md: 영향 없음 (SPEC-AUTH-002는 CLAUDE.md 변경 트리거하지 않음)
- README / docs/auth-architecture.md 업데이트 (SPEC-AUTH-001 산출 문서) — Self-signup 섹션 추가
- `.moai/project/product.md`: 강사 페르소나 진입 채널 갱신 권장 (작은 보강)

**Files Touched**:
- `.moai/specs/SPEC-AUTH-002/spec-auth-001-amendment.md` (신규, 본 SPEC 산출물의 일부)
- `docs/auth-architecture.md` (sync 단계에서 추가)
- `.moai/project/product.md` (sync 단계에서 추가)

**DB 마이그레이션**: 없음.

**Tests**: 없음 (문서 동기화).

**Risks**:
- R-M7-1: SPEC-AUTH-001 amendment를 직접 적용하지 않고 별도 파일로 제안. orchestrator가 검토 후 SPEC-AUTH-001 HISTORY에 머지 결정.

---

## 3. 작업 순서 (Execution Order)

권장 순서: **M1 → M2 → M3 → M4 → M5 → M6 → M7**

의존성:
- M1은 모든 후속 모듈의 전제 (스키마 부재 시 코드 작성 불가)
- M2는 M3/M4의 액션 코드의 전제
- M3과 M4는 독립적이나, M4가 e2e (M6)에서 더 많이 등장하므로 함께 진행 가능
- M5는 M2 헬퍼의 통합 검증
- M6는 모든 코드 변경 후
- M7은 sync 단계 (manager-docs 위임)

**병렬 기회**:
- M3 (공개 폼)와 M4 (운영자 큐)는 파일 디렉토리가 분리되어 있어 병렬 가능
- M2 헬퍼 완료 후 M3/M4 동시 착수 가능

---

## 4. 위험 (Risks) — 통합

| ID | 위험 | 영향 | 완화 |
|---|---|---|---|
| R-001 | rate-limit 정책이 정상 사용자도 차단할 수 있음 | UX 저하 | 디폴트 임계값을 보수적(IP 3/15min, email 1/24h)으로 설정. 운영 데이터 기반 후속 튜닝 SPEC. |
| R-002 | 중복 이메일 통일 메시지 vs UX 친절도 trade-off | UX 저하 | "이미 등록된 이메일입니다" 메시지에 "초대 링크 확인하거나 로그인" 안내 동봉. 정보 누설 방지 + UX 보완. |
| R-003 | 거부된 사용자가 동일 이메일로 재가입 시도 | 운영 부담 | rejected row 30일 보존 + 재시도 시 통일 메시지(중복 이메일과 동일). 30일 후는 재가입 허용 (정책 결정 필요). <!-- TBD --> |
| R-004 | operator 권한 누설 (operator가 admin 페이지 접근) | 보안 | 큐 라우트를 `/operator/signup-requests`로 이동 (M4에서 결정). SPEC-AUTH-001 §REQ-AUTH-GUARD-004 준수. |
| R-005 | 가입 액션 service-role key 사용으로 인한 RLS 우회 | 보안 | `signupInstructor` Server Action을 `import 'server-only'`로 격리. ESLint `no-restricted-imports` 룰 검토. |
| R-006 | M1 마이그레이션이 기존 SPEC-DB-002 / SPEC-SEED-002 시드를 깨뜨림 | 회귀 | 마이그레이션 전후 `pnpm db:verify` PASS 18/18 유지 확인 (LESSON-002 학습 적용). |
| R-007 | LESSON-003 (인증/가드 회귀 즉시 테스트) — 신규 분기 추가가 SPEC-AUTH-001 흐름을 깨뜨림 | 회귀 | M6에서 SPEC-AUTH-001 e2e 전체 재실행. `requireUser` 변경은 분기 추가만 (기존 분기 0 변경). |
| R-008 | `auth_events` event_type CHECK 확장이 기존 row와 충돌 | 마이그레이션 실패 | ALTER CHECK은 기존 값을 무효화하지 않으므로 안전. 마이그레이션 시 `IF EXISTS` + 새 값 추가만. |

---

## 5. 완료 기준 (Definition of Done)

- M1~M6 모두 완료 (M7은 sync 단계)
- `pnpm db:verify` 18/18 (또는 신규 검증 추가 후 동등) PASS
- 신규 e2e `auth-signup.spec.ts` 모든 시나리오 PASS
- `rbac-cross-role.spec.ts` 보강 시나리오 PASS
- SPEC-AUTH-001 e2e 전체 0 회귀 (`auth.spec.ts` 21건)
- SPEC-ADMIN-002 e2e (`phase2-admin.spec.ts` 비활성화 시나리오) 0 회귀
- TRUST 5 게이트 통과 (lint, typecheck, test, security, commit)
- LESSON-003 회귀 패턴 발생 0
- `spec-auth-001-amendment.md` 작성 완료 (orchestrator 검토 대기)

---

## 6. Out-of-Scope 명시 (재확인)

본 plan이 다루지 않는 항목 (spec.md §3 비목표 인용):

- CAPTCHA / Redis / 이메일 인증 / 스킬 입력 / operator 셀프 가입 / 알림 발송 / 거부 사유 / 셀프 탈퇴 / 약관 콘텐츠 / MFA / rate-limit 관리 UI / 가입 신청 amend

---

_End of SPEC-AUTH-002 plan.md_
