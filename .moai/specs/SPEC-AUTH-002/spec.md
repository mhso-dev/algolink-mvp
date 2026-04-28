---
id: SPEC-AUTH-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
related: [SPEC-AUTH-001, SPEC-ADMIN-002, SPEC-ADMIN-001, SPEC-DB-001, SPEC-SEED-002, SPEC-E2E-002]
---

# SPEC-AUTH-002 — 강사 공개 셀프 가입 + 운영자 승인 플로우 (Public Instructor Self-Signup with Operator Approval)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초안 작성. SPEC-AUTH-001이 §1.2/§3에서 영구 제외했던 "self-signup"을 제한된 형태로 재도입한다. 본 SPEC은 (a) `/signup` 공개 라우트와 강사 셀프 가입 폼, (b) 가입 직후 `is_active=false` 보류 상태 + `instructor_signup_requests` 추적 테이블, (c) operator/admin이 `/admin/users` 또는 신설 `/admin/signup-requests`에서 승인/거부, (d) 승인 시 `is_active=true` 전이 → SPEC-ADMIN-002 가드를 통과하여 정상 로그인 가능, (e) 이메일 + IP 기반 최소 rate-limit (Postgres 백엔드, Redis 미도입), (f) 약관 동의 필수, (g) 봇/스팸 1차 방어를 명세한다. SPEC-AUTH-001 §1.2의 "초대 전용" 가정을 본 SPEC이 두 번째 정식 채널로 보강한다 (자동 활성화 금지 원칙은 유지). 별도 첨부 `spec-auth-001-amendment.md`로 SPEC-AUTH-001 HISTORY 보강 제안. LESSON-003(인증/가드 회귀 즉시 테스트) 적용.

---

## 1. 배경 (Background)

### 1.1 현재 상태

SPEC-AUTH-001(`completed`)은 강사 온보딩을 **초대 전용**으로 한정했다. 운영자가 `/operator/instructors/new`에서 이메일을 입력하면 `auth.admin.inviteUserByEmail`이 발송되고, 수신자는 `/accept-invite`에서 비밀번호를 설정해 즉시 활성 instructor가 된다. 이 흐름은 가입 자격을 운영자가 통제한다는 점에서 안전하지만, **운영자가 강사 후보를 사전에 알아야 한다**는 강한 전제를 요구한다.

`.moai/project/product.md`의 강사 페르소나는 "플랫폼을 발견한 후 자기 의지로 등록을 시도"하는 콜드 트래픽을 포함한다. 현재는 이 트래픽을 받을 진입점이 존재하지 않으며, `(auth)` 라우트 그룹에는 `signup` / `register` 디렉토리가 없다 (login, forgot-password, reset-password, accept-invite만 존재).

### 1.2 변경 동기

- **유입 채널 확대**: 운영자 발견 비용 없이 강사 풀을 늘린다.
- **초대 흐름 보존**: 운영자가 이미 알고 있는 강사는 즉시 활성화되는 fast-track을 유지한다.
- **자동 활성화 금지 유지**: SPEC-AUTH-001 §1.2의 "외부 사용자가 직접 활성 계정을 만들 수 없다"는 원칙은 본 SPEC도 준수한다. 셀프 가입은 **계정을 만들지만 비활성 상태**로 남기며, 운영자/관리자의 명시적 승인을 거쳐야 한다.
- **SPEC-ADMIN-002와 직접 결합**: 비활성 계정은 SPEC-ADMIN-002의 `requireUser` 가드가 자동으로 차단한다. 본 SPEC은 그 차단 메커니즘에 새로운 진입 사례(승인 대기)를 더할 뿐이다.

### 1.3 선택된 접근 (요약)

- **상태 모델**: `public.users.is_active` (boolean, SPEC-DB-001 기존)을 그대로 사용한다. 가입 직후 `is_active=false`. 추가로 가입 메타데이터(요청 일시, 처리자, 처리 사유)는 신설 `public.instructor_signup_requests` 테이블에 적재한다. → 결정 D-001 참조.
- **승인 UX**: SPEC-ADMIN-001이 만든 `/admin/users`를 확장하지 않고, **별도 라우트 `/admin/signup-requests`** 를 신설한다. 승인 대기 큐를 별도 테이블/뷰로 분리해야 운영자 시야가 명확하다. → 결정 D-002 참조.
- **거부 처리**: 거부는 **soft delete** (`instructor_signup_requests.status='rejected'` + `users.is_active=false` 유지). 동일 이메일의 재시도를 추적/차단하기 위해 row를 보존한다. 하드 삭제는 `auth.users` 측 잔여물 정리 비용이 크고, 악의적 반복 가입 추적이 어렵다. → 결정 D-003 참조.
- **Rate-limit**: Postgres 백엔드의 `auth_rate_limits` 테이블 신설. IP당 15분 / 3회, 이메일당 24시간 / 1회를 MVP 디폴트로 한다. Redis 도입 비용은 본 SPEC 범위 밖. → 결정 D-004 참조.

---

## 2. 목표 (Goals)

- **G-001**: `(auth)/signup` 공개 라우트에서 누구나 강사 자격으로 셀프 가입을 시도할 수 있다.
- **G-002**: 가입 직후 사용자는 `is_active=false` 상태이며, 어떤 보호 라우트(`/instructor/*`, `/operator/*`, `/admin/*`)에도 접근할 수 없다 (SPEC-ADMIN-002 가드 위임).
- **G-003**: operator 또는 admin이 `/admin/signup-requests`에서 승인 대기 항목을 확인하고, 한 번의 액션으로 승인 또는 거부할 수 있다.
- **G-004**: 승인된 사용자는 즉시 다음 로그인 시도부터 `/instructor/*`에 정상 진입한다.
- **G-005**: 거부된 사용자는 로그인이 차단되며, 동일 이메일로 재가입을 시도해도 일정 정책(예: 30일)까지 차단된다.
- **G-006**: 봇/스팸 1차 방어로 IP/이메일 rate-limit이 작동한다.
- **G-007**: SPEC-AUTH-001 초대 흐름은 어떠한 동작 변경도 없이 fast-track으로 공존한다.

---

## 3. 비목표 (Non-Goals)

본 SPEC이 명시적으로 다루지 않는 항목:

- **NG-001**: CAPTCHA / hCaptcha / reCAPTCHA. MVP는 rate-limit으로 충분.
- **NG-002**: Redis 또는 외부 KV 스토어 도입.
- **NG-003**: 이메일 인증(이메일 소유 확인). Supabase 기본 `email_confirm` 흐름은 `auth.signUp`이 활용하나, 본 SPEC의 "비활성 보류"는 **이메일 검증과 별개의 운영자 승인 게이트**다. 이메일 인증 활성화 여부는 별도 결정 D-005 참조.
- **NG-004**: 강사 스킬 / 자기소개 / 이력서 입력. 모두 승인 후 `/me/profile`에서 처리 (SPEC-ME-001 위임).
- **NG-005**: operator/admin 셀프 가입. operator/admin은 초대(SPEC-AUTH-001) 또는 admin 직접 생성(SPEC-ADMIN-001)으로만 만들 수 있다. 본 SPEC은 강사 가입에 한정.
- **NG-006**: 승인 알림 (가입자 측 이메일 통보). 본 SPEC은 상태 전이만 책임지며, 알림 발송은 SPEC-NOTIFY-001 또는 후속 SPEC에 위임.
- **NG-007**: 승인 거부 사유 입력 / 거부 사유 사용자 통보. 단순 status 토글만.
- **NG-008**: 셀프 탈퇴 / 계정 삭제 흐름.
- **NG-009**: 약관 본문 콘텐츠 작성. `/terms`, `/privacy` 페이지 자체는 별도 SPEC. 본 SPEC은 동의 체크박스만 강제.
- **NG-010**: MFA / OAuth / 매직 링크 (SPEC-AUTH-001 §3 인용).
- **NG-011**: rate-limit 관리 UI / 화이트리스트 IP / 차단 해제 admin 액션.
- **NG-012**: 가입 신청 amend / 본인 정보 수정. 승인 전 정정은 거부 후 재신청으로 처리.

---

## 4. 사용자 시나리오 (User Scenarios)

### 4.1 콜드 강사 가입 (Happy Path)

1. 외부 강사 후보가 랜딩에서 "강사 등록" 링크를 통해 `/signup` 진입.
2. 이메일, 비밀번호, 이름, 전화번호, 약관 동의 입력 후 제출.
3. 시스템이 `auth.signUp` (또는 동등 admin API) → `public.users` row + `instructor_signup_requests` row 생성. `is_active=false`.
4. 사용자에게 한국어 안내 페이지 노출: "가입 신청이 접수되었습니다. 운영자 승인 후 로그인할 수 있습니다."
5. 사용자가 즉시 로그인 시도 → SPEC-ADMIN-002 가드가 `is_active=false`를 감지 → `/login?error=pending_approval` (또는 동등 분기) 도달. (REQ-AUTH002-006 참조)
6. operator가 `/admin/signup-requests`에서 항목을 보고 승인 → `is_active=true` + `instructor_signup_requests.status='approved'`.
7. 사용자가 다시 로그인 → `/instructor/dashboard` 정상 도달.

### 4.2 거부 시나리오

1. 4.1의 1~3단계 완료.
2. operator가 항목을 거부 → `instructor_signup_requests.status='rejected'`. `users.is_active`는 false 유지.
3. 사용자 로그인 시도 → 가드가 차단 (`/login?error=pending_approval` 또는 별도 분기).
4. 동일 이메일로 재가입 시도 → 시스템이 기존 거부된 요청을 감지하여 일정 기간(30일) 차단.

### 4.3 초대 vs 셀프 가입 충돌

1. operator가 `inst@example.com`을 이미 초대 발송 (SPEC-AUTH-001) → `auth.users` 존재.
2. 사용자가 모르고 `/signup`에서 동일 이메일로 가입 시도.
3. 시스템이 중복 이메일을 감지 → 한국어 메시지 노출 ("이미 등록된 이메일입니다. 받은 초대 링크를 확인하거나 로그인을 시도하세요."). 신규 row를 만들지 않음.

### 4.4 봇/스팸 시도

1. 동일 IP에서 15분간 4회째 가입 시도.
2. 시스템이 rate-limit 거부 → 429 응답 + 한국어 메시지 ("잠시 후 다시 시도해 주세요.").
3. 가입 row 생성되지 않음.

---

## 5. 요구사항 (EARS Requirements)

본 SPEC은 6개 모듈로 구성된다: `SIGNUP`, `STATE`, `APPROVAL`, `RATELIMIT`, `COEXIST`, `A11Y`.

### 5.1 REQ-AUTH002-SIGNUP — 공개 가입 폼 / 액션

**REQ-AUTH002-001 (Ubiquitous)**
The system SHALL provide a public unauthenticated route at `/signup` rendering a server-validated form with the following fields: `email` (required, RFC 5322), `password` (required, SPEC-AUTH-001 §REQ-AUTH-PASSWORD-001 정책 준수), `display_name` (required, 1–60자), `phone` (required, KR 형식: 숫자 9–11자리, 하이픈 허용), `terms_agreed` (required, boolean true).

**REQ-AUTH002-002 (Event-Driven)**
WHEN a user submits the `/signup` form with a valid payload, the system SHALL invoke a Server Action `signupInstructor` that (1) calls `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name, phone } })` via the service-role client, (2) UPSERTs into `public.users` with `role='instructor'` and `is_active=false`, (3) INSERTs a row into `public.instructor_signup_requests` with `status='pending'`, `requested_at=now()`, captured IP, and captured user agent, (4) returns success with a redirect to `/signup/pending` confirmation page.

**REQ-AUTH002-003 (Unwanted Behavior)**
IF any required field is missing, malformed, or `terms_agreed` is false, THEN the Server Action SHALL reject the request before any DB or auth API call and SHALL render the form with field-level error messages in Korean.

**REQ-AUTH002-004 (Unwanted Behavior)**
IF the email already exists in `auth.users` (regardless of `users.is_active` value or invitation status), THEN the system SHALL respond with the unified Korean message `"이미 등록된 이메일입니다. 받은 초대 링크를 확인하거나 로그인을 시도하세요."` AND SHALL NOT create a new `instructor_signup_requests` row AND SHALL NOT distinguish between "invited but not accepted" / "active" / "rejected by operator" cases (정보 누설 방지).

**REQ-AUTH002-005 (Ubiquitous)**
The Server Action `signupInstructor` SHALL be transactional with respect to (`auth.users` creation, `public.users` upsert, `instructor_signup_requests` insert): on any partial failure after `auth.users` creation, the system SHALL invoke `auth.admin.deleteUser` to roll back, mirroring `src/app/(app)/(operator)/instructors/new/actions.ts`의 기존 invite 롤백 패턴.

### 5.2 REQ-AUTH002-STATE — 가입 상태 / 가드 통합

**REQ-AUTH002-006 (State-Driven)**
WHILE `instructor_signup_requests.status = 'pending'` AND `users.is_active = false`, the system SHALL block the user from all protected routes via the existing SPEC-ADMIN-002 `requireUser` guard, redirecting to `/login?error=pending_approval`.

**REQ-AUTH002-007 (Event-Driven)**
WHEN a user submits credentials at `/login` AND the corresponding `users.is_active=false` AND a related `instructor_signup_requests.status='pending'` row exists, THEN the login Server Action SHALL invoke `supabase.auth.signOut()` and respond with `redirect('/login?error=pending_approval')` (별도 분기를 SPEC-ADMIN-002의 `?error=deactivated`와 구분).

**REQ-AUTH002-008 (Event-Driven)**
WHEN `/login` is loaded with `?error=pending_approval`, THEN the page SHALL display a Korean banner `"가입 신청이 검토 중입니다. 운영자 승인 후 로그인할 수 있습니다."` with `role="alert"` AND visually distinct from `?error=deactivated` 배너.

**REQ-AUTH002-009 (Constraint, MUST)**
The `requireUser` guard SHALL NOT change behavior for `users.is_active=true` users (SPEC-AUTH-001 0 회귀, LESSON-003 직접 대응).

### 5.3 REQ-AUTH002-APPROVAL — 운영자 승인 / 거부 표면

**REQ-AUTH002-010 (Ubiquitous)**
The system SHALL provide a route `/admin/signup-requests` accessible only to `role IN ('operator', 'admin')` listing all `instructor_signup_requests` rows with `status='pending'`, ordered by `requested_at DESC`, with columns: email, display_name, phone, requested_at, IP, user_agent (truncated).

**REQ-AUTH002-011 (Event-Driven)**
WHEN an operator clicks "승인" on a pending row, THEN the Server Action `approveSignupRequest(requestId)` SHALL (1) UPDATE `instructor_signup_requests` SET `status='approved'`, `processed_at=now()`, `processed_by=auth.uid()`, (2) UPDATE `public.users` SET `is_active=true` WHERE `id` matches the request's `user_id`, (3) write an `auth_events` row with `event_type='signup_approved'`.

**REQ-AUTH002-012 (Event-Driven)**
WHEN an operator clicks "거부" on a pending row, THEN the Server Action `rejectSignupRequest(requestId)` SHALL (1) UPDATE `instructor_signup_requests` SET `status='rejected'`, `processed_at=now()`, `processed_by=auth.uid()`, (2) keep `public.users.is_active=false` unchanged, (3) write an `auth_events` row with `event_type='signup_rejected'`.

**REQ-AUTH002-013 (Unwanted Behavior)**
IF an `instructor_signup_requests` row is already in `status IN ('approved', 'rejected')` at the moment of approve/reject submission (race), THEN the Server Action SHALL no-op AND return a Korean message `"이미 처리된 신청입니다."` (멱등 보장).

**REQ-AUTH002-014 (Constraint, MUST)**
RLS on `instructor_signup_requests` SHALL allow `SELECT/UPDATE` only to `role IN ('operator', 'admin')`. The signup Server Action uses service-role client and bypasses RLS for INSERT.

### 5.4 REQ-AUTH002-RATELIMIT — 봇/스팸 1차 방어

**REQ-AUTH002-015 (Event-Driven)**
WHEN the `/signup` Server Action is invoked, BEFORE any `auth.admin.createUser` call, the system SHALL consult `public.auth_rate_limits` to verify (a) the requesting IP has fewer than 3 attempts in the past 15 minutes, AND (b) the submitted email has fewer than 1 attempt in the past 24 hours.

**REQ-AUTH002-016 (Unwanted Behavior)**
IF either rate-limit threshold is exceeded, THEN the Server Action SHALL respond with HTTP 429 (or equivalent error state) AND a Korean message `"잠시 후 다시 시도해 주세요."` AND SHALL NOT create any `auth.users` / `users` / `instructor_signup_requests` rows AND SHALL increment the rate-limit counter for the IP regardless of email validity.

**REQ-AUTH002-017 (Ubiquitous)**
The system SHALL maintain `public.auth_rate_limits (id uuid PK, key_type text CHECK (key_type IN ('ip', 'email')), key_value text, attempt_at timestamptz NOT NULL DEFAULT now(), action text NOT NULL CHECK (action IN ('signup')))` with an index on `(key_type, key_value, attempt_at DESC)`. Rows older than 30 days MAY be garbage-collected by a separate maintenance job (NG-013, 별도 SPEC).

**REQ-AUTH002-018 (Constraint, MUST)**
The system SHALL NOT block based on email enumeration: the rate-limit check on email value SHALL operate on the submitted string regardless of whether that email currently exists in `auth.users`.

### 5.5 REQ-AUTH002-COEXIST — 초대 흐름과 공존

**REQ-AUTH002-019 (Constraint, MUST)**
The existing invite flow at `/operator/instructors/new` and `/accept-invite` SHALL retain its behavior unchanged: invited users become `is_active=true` upon `/accept-invite/set-password` completion, bypassing the `signup-requests` queue (fast-track). 본 요구는 SPEC-AUTH-001 §REQ-AUTH-INVITE-001..007의 동작 보존을 보장한다.

**REQ-AUTH002-020 (Event-Driven)**
WHEN an operator invites an email that previously had a `rejected` signup request, THEN the invite SHALL succeed (operator override) AND the system SHOULD log an `auth_events` row with `event_type='invite_after_rejection'` for audit. (UPSERT 시 `users.is_active=true` 전이.)

**REQ-AUTH002-021 (Constraint, MUST)**
A given `auth.users.id` SHALL have at most one row in `instructor_signup_requests` whose `status='pending'` at any time (`UNIQUE INDEX ... WHERE status='pending'`).

### 5.6 REQ-AUTH002-A11Y — 접근성

**REQ-AUTH002-022 (Ubiquitous)**
The `/signup` form SHALL inherit SPEC-AUTH-001 §REQ-AUTH-A11Y-001..006 standards: every input has an associated label, validation errors via `aria-invalid` + `aria-describedby` + `role="alert"`, focus moves to the first invalid field, password visibility toggle includes `aria-pressed`, contrast 4.5:1 / focus ring 2px maintained.

**REQ-AUTH002-023 (Ubiquitous)**
The terms-of-service consent checkbox SHALL be a real `<input type="checkbox">` with associated `<label>`, NOT a custom div hack, AND SHALL link to `/terms` and `/privacy` (placeholder routes acceptable for now <!-- TBD: terms 페이지 콘텐츠 별도 SPEC -->).

---

## 6. 데이터 모델 변경 (Data Model Changes)

### 6.1 신규 테이블: `public.instructor_signup_requests`

```sql
CREATE TABLE public.instructor_signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_address inet,
  user_agent text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT processed_consistency
    CHECK ((status = 'pending' AND processed_at IS NULL AND processed_by IS NULL)
        OR (status IN ('approved','rejected') AND processed_at IS NOT NULL))
);

CREATE UNIQUE INDEX idx_signup_pending_one_per_user
  ON public.instructor_signup_requests (user_id) WHERE status = 'pending';

CREATE INDEX idx_signup_requests_status_requested
  ON public.instructor_signup_requests (status, requested_at DESC);
```

RLS:
- `SELECT`: `role IN ('operator', 'admin')`
- `UPDATE`: `role IN ('operator', 'admin')` (status 전이만 허용; 그 외 컬럼 수정 금지 — column-level CHECK or trigger)
- `INSERT`: service-role only (signup Server Action)
- `DELETE`: 금지 (감사 로그성 보존)

### 6.2 신규 테이블: `public.auth_rate_limits`

```sql
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_type text NOT NULL CHECK (key_type IN ('ip', 'email')),
  key_value text NOT NULL,
  action text NOT NULL CHECK (action IN ('signup')),
  attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_lookup
  ON public.auth_rate_limits (key_type, key_value, action, attempt_at DESC);
```

RLS: `SELECT/INSERT` service-role only. 일반 사용자는 접근 불가.

### 6.3 기존 테이블 영향

- `public.users`: 변경 없음. `is_active=false` default 유지 (SPEC-DB-001 기준 검토 필요 <!-- TBD: 현재 default가 true인지 false인지 시드 결과로 확인 -->).
- `public.auth_events`: SPEC-AUTH-001 §REQ-AUTH-OBS-002의 `event_type` CHECK 목록을 확장하여 `signup_submitted`, `signup_approved`, `signup_rejected`, `invite_after_rejection` 4종 추가.

### 6.4 시드 영향 (SPEC-SEED-002)

- `tests/e2e/helpers/seed-users.ts`: 신규 페르소나 추가 권장 — `instructorPending@algolink.test` (`is_active=false`, `instructor_signup_requests.status='pending'`).
- 기존 4 페르소나는 변경 없음.

---

## 7. API 표면 (API Surface)

### 7.1 신규 Server Actions

| Action | 위치 | 책임 | 호출자 권한 |
|---|---|---|---|
| `signupInstructor(formData)` | `src/app/(auth)/signup/actions.ts` | Public — 가입 신청 처리 | unauthenticated |
| `approveSignupRequest(requestId)` | `src/app/(app)/(admin)/admin/signup-requests/actions.ts` | 승인 | operator/admin |
| `rejectSignupRequest(requestId)` | 동상 | 거부 | operator/admin |

### 7.2 신규 라우트

| 경로 | 라우트 그룹 | 인증 요구 |
|---|---|---|
| `/signup` | `(auth)` | unauthenticated only (이미 로그인 시 home redirect) |
| `/signup/pending` | `(auth)` | unauthenticated (가입 후 안내 페이지) |
| `/admin/signup-requests` | `(app)/(admin)` | operator/admin |

### 7.3 변경되지 않는 라우트

- `/login`, `/forgot-password`, `/reset-password`, `/accept-invite*`: 동작 보존
- `/admin/users`: 변경 없음 (별도 큐로 분리)
- `/operator/instructors/new`: 변경 없음 (초대 fast-track 보존)

---

## 8. UI 표면 (UI Surface)

### 8.1 `/signup` 폼

- shadcn/ui `<Card>` 중앙 배치 (SPEC-LAYOUT-001 `(auth)/layout.tsx` 재사용)
- 필드: 이메일, 비밀번호 (visibility toggle), 비밀번호 확인, 이름, 전화번호, 약관 동의 체크박스
- 약관 체크박스 옆 링크: "[이용약관](/terms)에 동의합니다", "[개인정보 처리방침](/privacy)을 읽었습니다"
- 제출 버튼: "가입 신청하기"
- 하단 링크: "이미 계정이 있으신가요? [로그인](/login)"
- 에러 표시: `<FormMessage>` 사용 (SPEC-LAYOUT-001 primitives)

### 8.2 `/signup/pending` 안내 페이지

- 단순 `<Card>`: 한국어 안내 텍스트 + `/login` 링크
- 메시지: "가입 신청이 접수되었습니다. 운영자 승인 후 로그인할 수 있으며, 일반적으로 영업일 기준 1–2일 이내 처리됩니다."

### 8.3 `/admin/signup-requests` 큐

- 테이블 형태 (`<Table>` shadcn): 이메일, 이름, 전화번호, 신청일시, IP, 액션 컬럼
- 액션 컬럼: "승인" (primary button), "거부" (destructive button) — 모두 confirmation dialog 후 Server Action 호출
- 빈 상태: "현재 검토 대기 중인 신청이 없습니다."
- 필터: 기본 `status='pending'`. (선택) `status='approved'`, `status='rejected'` 탭 — <!-- TBD: 처리 이력 조회 UI는 본 SPEC 범위 포함 여부 결정 필요 -->

### 8.4 `/login` 배너 분기

- `?error=deactivated` (SPEC-ADMIN-002): "관리자에 의해 비활성화된 계정입니다."
- `?error=pending_approval` (SPEC-AUTH-002): "가입 신청이 검토 중입니다. 운영자 승인 후 로그인할 수 있습니다."
- 시각적 톤: pending은 정보(파란색 계열), deactivated는 경고(빨간색 계열)

---

## 9. 보안 (Security)

### 9.1 정보 누설 방지

- `/signup` 중복 이메일 응답: REQ-AUTH002-004의 통일 메시지 사용. "이미 가입됨" / "초대 발송 완료" / "거부됨"을 구분하지 않음.
- `/login?error=pending_approval`: 비로그인 상태에서도 노출되는 쿼리이므로 원칙상 정보 누설이지만, 가입자 본인이 자기 상태를 알아야 한다는 UX 가치가 더 크다 (SPEC-ADMIN-002 §4.2와 동일 논거).

### 9.2 Rate-limit 누락 방지

- 모든 코드 경로(직접 Server Action 호출, fetch by curl 등)가 동일한 rate-limit 함수를 통과하도록 Server Action 진입 첫 줄에서 검사.
- IP 추출: `headers().get('x-forwarded-for')` 또는 `request.ip`. 프록시 신뢰 설정은 Vercel 기본값 사용.

### 9.3 Service Role Key 사용 제한

- `signupInstructor`는 `auth.admin.createUser`를 호출하므로 service-role client 필요.
- 호출 위치는 `src/app/(auth)/signup/actions.ts` 내부로 한정. `import 'server-only'` 강제 (SPEC-AUTH-001 §REQ-AUTH-SECURITY-004 인용).

### 9.4 SQL Injection / RLS 우회 방지

- `auth_rate_limits`/`instructor_signup_requests` INSERT는 매개변수화된 쿼리로만 수행.
- RLS 활성화 후, 일반 권한 client가 service-role 우회를 시도해도 차단되는지 RLS 통합 테스트로 검증.

### 9.5 약관 동의 강제

- `terms_agreed` 체크박스는 zod schema `.refine(v => v === true)`로 클라이언트 + 서버 양측 검증.
- 미동의 시 가입 row 자체가 만들어지지 않음.

---

## 10. 회귀 영향 (Regression Impact)

### 10.1 SPEC-AUTH-001 (초대 흐름)

- 영향: **없음**. `/operator/instructors/new` 코드 경로 변경 없음.
- 검증: SPEC-AUTH-001 acceptance 시나리오 전체 PASS 유지.
- 보강: SPEC-AUTH-001 spec.md HISTORY에 amendment 추가 (별도 첨부 `spec-auth-001-amendment.md`). 자동 활성화 금지 원칙은 본 SPEC도 준수함을 명시.

### 10.2 SPEC-ADMIN-002 (비활성 차단)

- 영향: **없음**. 기존 `getCurrentUser` + `requireUser` 가드가 본 SPEC의 신규 비활성 사용자에게 자동 적용된다.
- 보강: `/login?error=pending_approval`은 SPEC-ADMIN-002의 `?error=deactivated`와 동일 페이지의 다른 분기로 추가됨. SPEC-ADMIN-002의 배너 코드는 그대로 두고 분기만 추가.

### 10.3 SPEC-ADMIN-001 (admin 사용자 관리)

- 영향: **거의 없음**. `/admin/users`는 그대로 유지. 본 SPEC은 `/admin/signup-requests`를 별도로 추가.
- 잠재 영향: `/admin/users` 목록에 `is_active=false`인 가입 신청자가 함께 표시되므로, 운영자가 혼란을 겪지 않도록 admin 측 필터/배지 추가 검토 필요 <!-- TBD: SPEC-ADMIN-001 추가 작업 또는 본 SPEC M4에서 처리 -->.

### 10.4 SPEC-DB-001 (RLS / 마이그레이션)

- 영향: 신규 마이그레이션 2종 (`instructor_signup_requests`, `auth_rate_limits`).
- 마이그레이션 번호는 SPEC-DB-001 번호 체계 이어받음 (`20260428000010_*` 또는 차순서).

### 10.5 SPEC-SEED-002 / SPEC-E2E-002

- 영향: 신규 페르소나 1종 권장 (`instructorPending`).
- e2e: `tests/e2e/auth-signup.spec.ts` 신설 + `rbac-cross-role.spec.ts`에 pending 사용자 보호 라우트 차단 검증 추가.

### 10.6 LESSON-003

- 본 SPEC의 모든 가드/인증 변경 사항은 acceptance에 1:1 매핑되는 자동화 검증을 동반한다 (LESSON-003 직접 대응).

---

## 11. 검증 전략 (Validation Strategy)

| 항목 | 검증 도구 / 방법 |
|---|---|
| 가입 폼 유효성 | Vitest 통합 테스트 (zod schema, Server Action 거부 분기) |
| 가입 직후 보호 라우트 차단 | Playwright e2e (`auth-signup.spec.ts` 신규) |
| 승인 → 로그인 정상 | Playwright e2e (동상) |
| 거부 → 로그인 차단 + 재가입 차단 | Playwright e2e |
| Rate-limit IP/email | Vitest 통합 테스트 (mock clock) + Playwright e2e (선택) |
| 중복 이메일 정보 누설 방지 | Vitest 통합 (3가지 케이스 동일 메시지) |
| 초대 흐름 0 회귀 | SPEC-AUTH-001 기존 e2e 재실행 |
| RLS instructor_signup_requests | Vitest RLS integration (`pnpm db:verify` 패턴) |
| `/login?error=pending_approval` 배너 | Playwright e2e + axe-core a11y 체크 |

---

## 12. 결정 사항 (Decisions)

- **D-001**: `users.is_active`만 사용. 새로운 enum 컬럼 (`onboarding_status`) 도입 거절 — SPEC-ADMIN-002가 이미 `is_active`를 권위 있는 진실로 사용하므로 두 컬럼 운영 시 동기화 부담. 대신 `instructor_signup_requests` 테이블이 메타데이터 책임을 진다.
- **D-002**: `/admin/signup-requests` 별도 라우트. `/admin/users` 확장 거절 — 승인 큐는 시간 민감 작업이고, "전체 사용자 관리"와 시야가 다르다. 별도 페이지가 운영자 인지 부담을 줄인다.
- **D-003**: 거부는 soft delete (`status='rejected'` row 보존). 하드 삭제 거절 — `auth.users` 잔여물 정리 비용 + 악의적 반복 가입 추적 불가. 재시도 차단 정책(예: 30일)을 위해서도 row 보존 필요.
- **D-004**: Rate-limit는 Postgres 백엔드. Redis 거절 — 의존성 추가 비용 vs MVP 트래픽 규모 트레이드오프에서 Postgres가 충분. 30일 GC만 별도 운영 잡으로 처리.
- **D-005**: 이메일 인증(`email_confirm`) 활성화 vs 비활성화는 운영자 승인이 사실상 인간 검증 게이트이므로 **이메일 인증 비활성화** (즉, `auth.admin.createUser({ email_confirm: true })`로 즉시 confirmed 처리). 이메일 검증 실패는 운영자 승인 단계에서 인지된다 (전화번호로 cross-check).
- **D-006**: `is_active` default는 SPEC-DB-001 시점 결정 그대로 사용. 본 SPEC은 명시적 false 설정만 책임. <!-- TBD: 시드 결과 확인 -->
- **D-007**: Rate-limit 임계값(IP 3/15min, email 1/24h)은 디폴트. 운영 데이터 누적 후 튜닝 (별도 SPEC).

---

## 13. 의존성 (Dependencies)

- **선행 (완료)**: SPEC-AUTH-001 (인증/가드), SPEC-ADMIN-002 (비활성 차단), SPEC-DB-001 (`users.is_active` 컬럼), SPEC-ADMIN-001 (admin 회원 관리 패턴), SPEC-LAYOUT-001 (`(auth)/layout.tsx`)
- **연관 (병렬)**: SPEC-SEED-002 (시드 페르소나 추가), SPEC-E2E-002 (e2e 회귀 검증)
- **후행 (별도 SPEC)**:
  - 가입 알림 발송 (SPEC-NOTIFY-002 또는 후속)
  - `/terms`, `/privacy` 페이지 콘텐츠
  - Rate-limit 관리 UI / GC 잡
  - 거부 사유 입력 / 사용자 통보

---

## 14. 참고 자료 (References)

- SPEC-AUTH-001 §1.2 (초대 전용 가정), §3 Out of Scope (Self-signup 제외 명시)
- SPEC-ADMIN-002 §1.2 (Option A SSR 가드 단일 진실 소스)
- SPEC-DB-001 (`users.is_active`, `app.current_role()`)
- SPEC-LAYOUT-001 (`<AppShell>`, `(auth)/layout.tsx`)
- LESSON-003 (인증/가드 회귀 즉시 테스트)
- `src/app/(app)/(operator)/instructors/new/actions.ts` (rollback 패턴 참조)
- `tests/e2e/helpers/seed-users.ts`, `personas.ts` (시드 페르소나 패턴)

---

_End of SPEC-AUTH-002 spec.md_
