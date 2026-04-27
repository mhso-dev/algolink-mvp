---
id: SPEC-AUTH-001
version: 1.0.0
status: completed
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-AUTH-001: Supabase Auth + 역할 기반 라우팅 (Authentication & Role-Based Routing)

## HISTORY

- **2026-04-27 (v1.0.0)**: 초기 작성. Algolink MVP의 인증 및 권한 레이어로서 (1) `@supabase/ssr` 기반 쿠키 세션, (2) 이메일/비밀번호 단일 인증 방식, (3) 초대 전용 가입 모델(`auth.admin.inviteUserByEmail`), (4) Custom Access Token Hook으로 `users.role` enum을 JWT `claims.role`에 주입하여 SPEC-DB-001의 RLS와 결합, (5) middleware + 서버 layout 이중 라우트 가드, (6) SPEC-LAYOUT-001 `<AppShell userRole>` prop 주입, (7) 비밀번호 재설정 / 변경, (8) `public.auth_events` 로깅, (9) 첫 admin CLI bootstrap, (10) 한국어 에러 UX, (11) WCAG 2.1 AA 접근성을 명세한다. SPEC-DB-001(완료) 후속, SPEC-LAYOUT-001(완료) 보완. MFA / OAuth / Self-signup은 명시적으로 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **인증 및 권한 컨트롤 평면**을 구축한다. 본 SPEC의 산출물은 (a) `@supabase/ssr`로 통합된 Next.js 16 App Router의 쿠키 기반 세션 관리, (b) 이메일/비밀번호 단일 인증의 로그인·로그아웃 흐름, (c) operator/admin이 발급하는 초대 링크를 통한 가입 흐름과 토큰 TTL·단일 사용 보장, (d) `public.users.role` enum을 JWT custom claim으로 주입하여 SPEC-DB-001의 `app.current_role()` 함수와 결합되는 RLS 무중단 평가, (e) 역할별 라우트 그룹 `(instructor)`/`(operator)`/`(admin)`에 대한 middleware + 서버 layout 이중 가드, (f) 잘못된 역할 접근 시 정보 누설 없는 silent redirect, (g) SPEC-LAYOUT-001의 `<AppShell userRole>` prop 주입과 로그아웃 버튼 연결, (h) 비밀번호 재설정·변경 흐름, (i) `public.auth_events` 테이블 기반 감사 로그, (j) CLI를 통한 첫 admin 부트스트랩, (k) 한국어 에러 메시지 + WCAG 2.1 AA 접근성 베이스이다.

본 SPEC은 어떤 페이지의 콘텐츠도 빌드하지 않는다. `/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/operator/invite` (UI 단순) 외에는 인증 인프라와 가드만 제공한다.

### 1.2 배경 (Background)

`.moai/project/product.md`의 페르소나 3종(강사·담당자·관리자)은 `public.users.role` enum으로 식별되며, SPEC-DB-001은 이미 `app.current_role()` 함수가 `auth.jwt() ->> 'role'` 또는 `auth.jwt() -> 'app_metadata' ->> 'role'`을 읽도록 구현했다(`supabase/migrations/20260427000020_pgcrypto_functions.sql:29-49`). 따라서 RLS는 JWT에 role이 박혀 있다는 가정하에 정상 동작하며, 본 SPEC은 그 claim을 채우는 책임을 진다.

SPEC-LAYOUT-001은 공통 앱 셸을 `<AppShell userRole={userRole}>` 인터페이스로 노출하며, `src/app/(app)/layout.tsx`에 `// TODO(SPEC-AUTH-001): const { user } = await getUser(); if (!user) redirect("/login");` placeholder를 남겼다. 본 SPEC은 이 placeholder를 실제 가드 + role 주입 로직으로 교체한다.

가입은 사용자 결정에 따라 **초대 전용**(`auth.admin.inviteUserByEmail`)으로 한정된다. 자기 가입(self-signup) UI는 빌드하지 않으며, Supabase 대시보드에서도 외부 가입을 차단한다. MFA, 매직 링크, OAuth 등은 후속 SPEC으로 이연한다.

### 1.3 범위 (Scope)

**In Scope:**

- `src/auth/` 모듈: `client.ts`(브라우저), `server.ts`(서버 컴포넌트/Action), `admin.ts`(service role, 초대 발급용), `roles.ts`(`UserRole` type alias), `events.ts`(auth_events 로깅 헬퍼)
- `src/middleware.ts`: 모든 인증 필요 라우트 진입 전 `supabase.auth.getClaims()` 호출로 토큰 갱신 + 1차 라우트 가드 + 새 쿠키 attach
- `src/app/(auth)/login/page.tsx` + Server Action: 이메일/비밀번호 로그인 폼, 한국어 에러, `?next=` 복귀 URL 처리
- `src/app/(auth)/forgot-password/page.tsx` + Server Action: 비밀번호 재설정 요청 (`resetPasswordForEmail`)
- `src/app/(auth)/reset-password/page.tsx` + Server Action: 새 비밀번호 입력 (`updateUser({ password })`)
- `src/app/(auth)/accept-invite/page.tsx` + `set-password/page.tsx` + Server Action: 초대 수락 → 비밀번호 설정 → 역할별 home 리다이렉트
- `src/app/api/auth/callback/route.ts`: Supabase OTP/PKCE 콜백 처리 (`verifyOtp`)
- `src/app/api/auth/signout/route.ts` 또는 Server Action: 세션 무효화 + 쿠키 삭제 + `/login` 리다이렉트
- `src/app/(operator)/operator/invite/page.tsx` + Server Action: operator/admin이 초대 발급 (email + role 입력)
- `src/app/(app)/layout.tsx` 수정: SPEC-LAYOUT-001의 placeholder를 `getCurrentUser()` + `<AppShell userRole>`로 교체
- 라우트 그룹별 server layout 가드:
  - `src/app/(instructor)/layout.tsx`: role !== 'instructor' 시 silent redirect
  - `src/app/(operator)/layout.tsx`: role !∈ ('operator', 'admin') 시 silent redirect
  - `src/app/(admin)/layout.tsx`: role !== 'admin' 시 silent redirect
- 마이그레이션 신규 (SPEC-DB-001 번호 체계 이어받음, 20260427000080+ 부터):
  - `20260427000080_auth_custom_access_token_hook.sql`: `public.custom_access_token_hook(jsonb)` function + grants
  - `20260427000081_user_invitations.sql`: `public.user_invitations` 테이블 + RLS
  - `20260427000082_auth_events.sql`: `public.auth_events` 테이블 + RLS
- `supabase/config.toml`: `[auth.hook.custom_access_token]` 활성화 (로컬 개발용)
- `scripts/auth/bootstrap-admin.ts`: 첫 admin 생성 CLI (멱등)
- 비밀번호 정책 zod schema: `src/lib/validation/auth.ts` (12자 이상 + 대소문자/숫자/특수문자)
- 한국어 에러 메시지 매핑: `src/auth/errors.ts` (Supabase 에러 코드 → 한국어)
- 키보드 접근성, ARIA 속성, focus 관리

**Out of Scope (Exclusions — What NOT to Build):**

- **MFA (다중 인증)**: TOTP/SMS/WebAuthn 등 → 별도 SPEC-AUTH-MFA-XXX. Supabase MFA API는 Pro 플랜 일부 기능. MVP는 단일 패스워드만.
- **매직 링크 (Magic Link)**: 이메일 OTP 로그인 미제공. `signInWithOtp` 호출 0건.
- **OAuth (Social Login)**: Google/Kakao/Naver 등 외부 IdP 연동 미제공. `signInWithOAuth` 호출 0건.
- **자기 가입 (Self-Signup)**: 외부 사용자가 직접 가입하는 `/signup` 페이지 미빌드. Supabase 대시보드에서도 `Disable signup` 활성화.
- **SSO / SAML**: 기업 IdP 연동 미제공.
- **계정 삭제 / 탈퇴 UI**: 별도 SPEC. operator/admin은 `auth.admin.deleteUser`를 CLI/Admin UI로만 호출 (admin UI는 SPEC-ADMIN-001).
- **이메일 발송 인프라**: Supabase 기본 SMTP에 의존. 자체 SMTP/SES 연동은 `Out of Scope`. 발송 자체는 Supabase가 수행하므로 본 SPEC은 발송 로직을 빌드하지 않음.
- **이메일 템플릿 디자인**: Supabase 대시보드 기본 템플릿 사용. 한국어 템플릿 커스터마이징은 운영 단계 작업.
- **세션 동시성 제한 (Concurrent Session Limit)**: "한 사용자가 N개 디바이스만 로그인 가능" 정책 미적용.
- **Account lockout custom 로직**: 앱 단에서 별도 lockout counter 미구현. Supabase 기본 rate limit에 위임.
- **Captcha (hCaptcha 등)**: MVP 미적용. Supabase 옵션이 있으나 운영 단계 결정.
- **사용자 프로필 편집 UI**: `/me/profile` 페이지 (이름, 사진 등 변경) → 별도 SPEC-ME-001.
- **권한 세분화 (Permission)**: role 외 fine-grained permission 시스템 (RBAC matrix, ABAC 등) 미빌드. 3단계 enum만.
- **Role transition workflow**: instructor → operator 승급 등 워크플로우 UI는 별도 SPEC-ADMIN-001.
- **Refresh token rotation 커스터마이징**: Supabase 기본 동작 채택.
- **JWT secret rotation**: 운영 단계 작업, 코드 변경 없음.
- **Auth UI 컴포넌트 라이브러리** (`@supabase/auth-ui-react`): 자체 React Hook Form + zod로 폼 구현. Supabase Auth UI 미사용.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ Supabase Auth 대시보드 설정: `Enable Email Signup = OFF` 확인 (수기 점검)
- ✅ Custom Access Token Hook 활성화 확인: 새로 발급된 access token의 payload에 `role` 클레임 존재 (jwt.io로 디코드)
- ✅ RLS 검증: instructor 토큰으로 `SELECT * FROM users WHERE role='admin'` → 0 rows
- ✅ middleware 동작: 미인증 상태로 `/dashboard` 접근 시 `/login?next=%2Fdashboard` 리다이렉트
- ✅ 역할별 라우트 가드: instructor 토큰으로 `/dashboard` (operator route) 접근 시 `/me/dashboard`로 silent redirect (403 페이지 노출 X)
- ✅ 초대 흐름: operator가 invite 발급 → 이메일 수신 → 링크 클릭 → 비밀번호 설정 → instructor home 도달
- ✅ 초대 토큰 단일 사용: 동일 초대 링크 재방문 시 "이미 사용된 초대 링크입니다." 표시
- ✅ 비밀번호 재설정: `/forgot-password` 입력 → 이메일 수신 → 링크 클릭 → 비밀번호 변경 → `/login` 자동 리다이렉트 + 신 비밀번호로 로그인 성공
- ✅ 로그인 실패 시 이메일 enumeration 방지: 미가입 이메일과 잘못된 비밀번호 모두 동일 메시지 반환
- ✅ Auth events: 로그인/로그아웃/초대 발급/초대 수락/비밀번호 재설정 5종 이벤트 모두 `public.auth_events`에 row 생성
- ✅ 첫 admin bootstrap CLI: `pnpm tsx scripts/auth/bootstrap-admin.ts` 실행 시 멱등 동작 (재실행 시 skip)
- ✅ 접근성: axe DevTools `/login` 페이지 critical 0건, Lighthouse Accessibility ≥ 95
- ✅ 키보드 only: Tab으로 모든 폼 도달, Enter 제출, Esc로 dialog 닫기
- ✅ AppShell 통합: 로그인 후 `/dashboard` 진입 시 `<AppShell userRole>`이 실제 role을 받아 sidebar 분기 정상 동작

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 11개 모듈로 구성된다: `LOGIN`, `SESSION`, `PASSWORD`, `INVITE`, `GUARD`, `ROLE`, `SHELL`, `SECURITY`, `A11Y`, `OBS`, `ERROR`.

### 2.1 REQ-AUTH-LOGIN — 로그인 / 로그아웃

**REQ-AUTH-LOGIN-001 (Ubiquitous)**
The system **shall** provide an email + password login form at `/login` that calls `supabase.auth.signInWithPassword({ email, password })` via a Next.js Server Action.

**REQ-AUTH-LOGIN-002 (Event-Driven)**
**When** login succeeds, the system **shall** redirect the user to either the URL specified by the `next` query parameter (if same-origin and present) or the role-appropriate home (`/me/dashboard` for instructor, `/dashboard` for operator/admin).

**REQ-AUTH-LOGIN-003 (Unwanted Behavior)**
**If** the `next` query parameter contains an external URL, a protocol-relative URL, or a path that the user's role cannot access, **then** the system **shall not** honor it and **shall** redirect to the role-appropriate home.

**REQ-AUTH-LOGIN-004 (Unwanted Behavior)**
**If** login fails for any reason (wrong credentials, unknown email, rate-limited, MFA-required, network), **then** the system **shall** display the unified Korean message `"이메일 또는 비밀번호가 올바르지 않습니다."` for credential failures and **shall not** distinguish between unknown email vs wrong password to prevent email enumeration.

**REQ-AUTH-LOGIN-005 (Ubiquitous)**
The system **shall** provide a sign-out trigger (button or Server Action endpoint) that calls `supabase.auth.signOut()`, clears all `sb-*` cookies, invalidates the server session, and redirects to `/login`.

**REQ-AUTH-LOGIN-006 (Event-Driven)**
**When** sign-out completes, the system **shall** prevent back-button reentry into authenticated pages by ensuring the next request to any `(app)/*` route triggers REQ-AUTH-GUARD-001 redirect to `/login`.

### 2.2 REQ-AUTH-SESSION — 세션 관리

**REQ-AUTH-SESSION-001 (Ubiquitous)**
The system **shall** implement Next.js middleware at `src/middleware.ts` that runs `supabase.auth.getClaims()` on every request matching the matcher pattern (excluding static assets, `/api/health`, and Supabase callback) to refresh the access token and attach updated cookies to both the request (for downstream Server Components) and the response (for the browser).

**REQ-AUTH-SESSION-002 (Ubiquitous)**
The system **shall** use `supabase.auth.getClaims()` (not `getSession()`) for all authentication and authorization checks, because `getClaims()` validates the JWT signature against published JWKS while `getSession()` does not.

**REQ-AUTH-SESSION-003 (State-Driven)**
**While** a valid session exists, the system **shall** expose a server-side helper `getCurrentUser()` from `src/auth/server.ts` that returns `{ id: string, email: string, role: UserRole }` to Server Components and Server Actions.

**REQ-AUTH-SESSION-004 (Event-Driven)**
**When** the access token expires during an active user session, the system **shall** automatically refresh it via the middleware on the next request without forcing a re-login, provided the refresh token is still valid.

**REQ-AUTH-SESSION-005 (Unwanted Behavior)**
**If** both access and refresh tokens are invalid or expired, **then** the system **shall** clear all session cookies and treat the user as unauthenticated for the current request (triggering REQ-AUTH-GUARD-001).

**REQ-AUTH-SESSION-006 (Ubiquitous)**
The system **shall** import the service role key (`SUPABASE_SERVICE_ROLE_KEY`) only from `src/auth/admin.ts` with a leading `import 'server-only'` directive to prevent client bundle leakage.

### 2.3 REQ-AUTH-PASSWORD — 비밀번호 정책 / 재설정 / 변경

**REQ-AUTH-PASSWORD-001 (Ubiquitous)**
The system **shall** enforce a password policy of minimum 12 characters containing at least 3 of the 4 character classes (lowercase, uppercase, digits, symbols), validated client-side via a zod schema in `src/lib/validation/auth.ts` and server-side via Supabase dashboard `Auth > Policies` settings.

**REQ-AUTH-PASSWORD-002 (Optional Feature)**
**Where** the Supabase project is on the Pro plan or above, the system **shall** enable HaveIBeenPwned leaked-password protection in the Supabase dashboard.

**REQ-AUTH-PASSWORD-003 (Ubiquitous)**
The system **shall** provide a password reset request flow at `/forgot-password` that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/reset-password' })` and **shall** display the unified message `"이메일을 발송했습니다. 받은편지함을 확인하세요."` regardless of whether the email is registered.

**REQ-AUTH-PASSWORD-004 (Ubiquitous)**
The system **shall** handle the password reset callback at `/api/auth/callback` by calling `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` and, on success, redirect to `/reset-password` with a temporary authenticated session.

**REQ-AUTH-PASSWORD-005 (Event-Driven)**
**When** the user submits a new password at `/reset-password`, the system **shall** call `supabase.auth.updateUser({ password })`, sign the user out, log a `password_reset_completed` auth_event, and redirect to `/login` with a success toast.

**REQ-AUTH-PASSWORD-006 (Ubiquitous)**
The system **shall** provide an in-session password change page (placeholder route `/me/security` reserved for future SPEC-ME-001) that calls `supabase.auth.updateUser({ password: newPassword, currentPassword: oldPassword })` requiring the current password as re-authentication.

**REQ-AUTH-PASSWORD-007 (Unwanted Behavior)**
**If** the new password fails the policy or matches the current password, **then** the system **shall** reject the change with a Korean error message `"비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 하고, 이전 비밀번호와 달라야 합니다."`.

### 2.4 REQ-AUTH-INVITE — 초대 발급 / 수락

**REQ-AUTH-INVITE-001 (Ubiquitous)**
The system **shall** provide an invitation issue page at `/operator/invite` accessible only to operator and admin roles, with form fields for `email` and `invited_role` (`instructor` | `operator` | `admin`, where `admin` is selectable only by existing admins).

**REQ-AUTH-INVITE-002 (Event-Driven)**
**When** an operator submits the invite form, the system **shall** (1) insert a row into `public.user_invitations` with `email`, `invited_role`, `invited_by = auth.uid()`, `expires_at = now() + interval '24 hours'`, and `accepted_at = NULL`; (2) call `supabase.auth.admin.inviteUserByEmail(email, { data: { invited_role } })` via the service role client; (3) log an `invitation_issued` auth_event.

**REQ-AUTH-INVITE-003 (Ubiquitous)**
The system **shall** handle invite acceptance at `/accept-invite?token_hash=...&type=invite` by calling `supabase.auth.verifyOtp({ token_hash, type: 'invite' })` and, on success, redirect to `/accept-invite/set-password` with a temporary authenticated session.

**REQ-AUTH-INVITE-004 (Event-Driven)**
**When** the invitee submits a password at `/accept-invite/set-password`, the system **shall** (1) call `supabase.auth.updateUser({ password })`; (2) read the `invited_role` from `public.user_invitations` (NOT from `auth.users.raw_user_meta_data`, which is user-modifiable); (3) UPSERT a row into `public.users` with the resolved role; (4) UPDATE `user_invitations.accepted_at = now()`; (5) log an `invitation_accepted` auth_event; (6) redirect to the role-appropriate home.

**REQ-AUTH-INVITE-005 (Unwanted Behavior)**
**If** the invitation token is expired (`expires_at < now()`) or has been used (`accepted_at IS NOT NULL`) at the moment of `verifyOtp`, **then** the system **shall** display `"초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요."` and **shall not** create a session.

**REQ-AUTH-INVITE-006 (Optional Feature)**
**Where** an operator needs to revoke an unaccepted invitation, the system **shall** provide a list at `/operator/invite` showing pending invitations with a `revoke` action that calls `supabase.auth.admin.deleteUser(user_id)`, deletes the `user_invitations` row, and logs an `invitation_revoked` auth_event.

**REQ-AUTH-INVITE-007 (Unwanted Behavior)**
**If** an instructor attempts to access `/operator/invite`, **then** the route guard (REQ-AUTH-GUARD-003) **shall** silently redirect them to `/me/dashboard` and **shall not** reveal the route's existence.

### 2.5 REQ-AUTH-GUARD — 라우트 가드

**REQ-AUTH-GUARD-001 (Event-Driven)**
**When** an unauthenticated request targets any path matched by `src/middleware.ts` other than `/login`, `/forgot-password`, `/reset-password`, `/accept-invite*`, `/api/auth/*`, the system **shall** redirect to `/login?next=${encodeURIComponent(originalPath)}`.

**REQ-AUTH-GUARD-002 (Ubiquitous)**
The system **shall** implement defense-in-depth role guards: (1) middleware performs an early role check based on JWT claim, (2) each route group server layout (`src/app/(instructor)/layout.tsx`, `src/app/(operator)/layout.tsx`, `src/app/(admin)/layout.tsx`) re-validates the role via `getCurrentUser()`.

**REQ-AUTH-GUARD-003 (State-Driven)**
**While** the authenticated user's role is `instructor`, the system **shall** allow only paths under `/me/*`, `/api/me/*`, and shared paths (`/notifications`, `/settings/profile` if introduced); access to `/dashboard`, `/projects`, `/instructors`, `/clients`, `/settlements`, `/operator/*`, `/admin/*` **shall** result in a silent redirect to `/me/dashboard`.

**REQ-AUTH-GUARD-004 (State-Driven)**
**While** the authenticated user's role is `operator`, the system **shall** allow paths under `/dashboard`, `/projects`, `/instructors`, `/clients`, `/settlements`, `/operator/*`; access to `/me/*` (operator-specific profile is a separate concern) and `/admin/*` **shall** result in a silent redirect to `/dashboard`.

**REQ-AUTH-GUARD-005 (State-Driven)**
**While** the authenticated user's role is `admin`, the system **shall** allow all operator paths plus `/admin/*`.

**REQ-AUTH-GUARD-006 (Unwanted Behavior)**
**If** a route guard denies access due to role mismatch, **then** the system **shall not** render an HTTP 403 page or any error message that confirms the existence of the target route; the response **shall** be an HTTP 307 redirect to the role-appropriate home.

**REQ-AUTH-GUARD-007 (Unwanted Behavior)**
**If** the middleware-level guard is bypassed (e.g., by a misconfigured matcher), **then** the server-layout guard **shall** still enforce the role check before any page content renders.

### 2.6 REQ-AUTH-ROLE — 역할 단일 출처 + JWT claim 동기화

**REQ-AUTH-ROLE-001 (Ubiquitous)**
The system **shall** treat `public.users.role` (enum `user_role` defined by SPEC-DB-001) as the canonical source of truth for a user's role; all other representations (JWT claim, `auth.users.raw_app_meta_data.role`) are derived caches.

**REQ-AUTH-ROLE-002 (Ubiquitous)**
The system **shall** install a PostgreSQL function `public.custom_access_token_hook(event jsonb) RETURNS jsonb` that, on every access-token issuance (login, refresh), reads `public.users.role` for the requesting user and writes the value to both `claims.role` (top-level) and `claims.app_metadata.role` (compatibility), preserving the structure expected by SPEC-DB-001's `app.current_role()`.

**REQ-AUTH-ROLE-003 (Ubiquitous)**
The system **shall** enable the Custom Access Token Hook in Supabase by (1) adding `[auth.hook.custom_access_token]` configuration to `supabase/config.toml` with `enabled = true` and `uri = "pg-functions://postgres/public/custom_access_token_hook"` for local development, and (2) documenting the cloud activation step (Dashboard → Authentication → Hooks → Custom Access Token).

**REQ-AUTH-ROLE-004 (Ubiquitous)**
The hook function `public.custom_access_token_hook` **shall** be granted only to `supabase_auth_admin` role and **shall not** be executable by `authenticated`, `anon`, or `public`.

**REQ-AUTH-ROLE-005 (Event-Driven)**
**When** an admin updates a user's `role` via SQL or admin UI, the system **shall** rely on the next access token refresh cycle (default 1 hour) to propagate the new role into the JWT; the system **shall not** force-invalidate existing sessions in MVP.

**REQ-AUTH-ROLE-006 (Unwanted Behavior)**
**If** a user's `public.users` row does not exist at the moment of token issuance (race condition during invitation acceptance), **then** the hook **shall** return the original event unmodified (no role claim) and **shall not** raise an exception; the next refresh after the row is created will populate the claim.

**REQ-AUTH-ROLE-007 (Ubiquitous)**
The system **shall** define a TypeScript type alias `UserRole = 'instructor' | 'operator' | 'admin'` in `src/auth/roles.ts` mirroring the `user_role` Postgres enum, and **shall** use this type throughout the codebase for compile-time safety.

### 2.7 REQ-AUTH-SHELL — SPEC-LAYOUT-001 통합

**REQ-AUTH-SHELL-001 (Ubiquitous)**
The system **shall** modify `src/app/(app)/layout.tsx` to (1) call `await getCurrentUser()`, (2) `redirect('/login?next=...')` if null, (3) render `<AppShell userRole={user.role} userName={user.email}>{children}</AppShell>`.

**REQ-AUTH-SHELL-002 (Ubiquitous)**
The system **shall** wire SPEC-LAYOUT-001's topbar logout placeholder button (currently a static UI element) to call a Server Action that triggers `supabase.auth.signOut()` and redirects to `/login`.

**REQ-AUTH-SHELL-003 (Event-Driven)**
**When** the AppShell server layout fails to load the user (unexpected error, not just unauthenticated), the system **shall** log the error, render a minimal error page in Korean (`"세션 정보를 불러오는 중 오류가 발생했습니다. 다시 로그인해주세요."`), and provide a link to `/login`.

**REQ-AUTH-SHELL-004 (Optional Feature)**
**Where** the AppShell needs to display a loading state during the brief moment of session validation, the system **shall** use Next.js `loading.tsx` conventions or React Suspense boundaries; the implementation **shall not** flash sidebar nav for an unauthorized role.

### 2.8 REQ-AUTH-SECURITY — 보안 자세

**REQ-AUTH-SECURITY-001 (Ubiquitous)**
The system **shall** rely on `@supabase/ssr` cookie defaults (`SameSite=Lax`, `HttpOnly`, `Secure` in production) for CSRF protection and **shall not** add a separate CSRF token mechanism.

**REQ-AUTH-SECURITY-002 (Ubiquitous)**
The system **shall** rely on Supabase's built-in rate limiting for `signInWithPassword`, `resetPasswordForEmail`, and `inviteUserByEmail` operations and **shall not** implement an application-level lockout counter in MVP.

**REQ-AUTH-SECURITY-003 (Ubiquitous)**
The system **shall** never log raw passwords, raw access tokens, refresh tokens, or service role keys; auth_events `metadata` field **shall** redact any sensitive value.

**REQ-AUTH-SECURITY-004 (Ubiquitous)**
The system **shall** verify that `SUPABASE_SERVICE_ROLE_KEY` is referenced only inside files that begin with `import 'server-only'`, enforced by an ESLint rule or a code review checklist item.

**REQ-AUTH-SECURITY-005 (Unwanted Behavior)**
**If** any request to an authenticated route arrives over HTTP (not HTTPS) in a non-development environment, **then** the system **shall** redirect to HTTPS or reject the request (Vercel + Supabase enforces this at the platform level; documented as a deployment requirement).

**REQ-AUTH-SECURITY-006 (Ubiquitous)**
The system **shall** disable email signup in the Supabase project (`Authentication > Settings > Disable signup = ON`) so that only `inviteUserByEmail` from the service role can create new users.

**REQ-AUTH-SECURITY-007 (Unwanted Behavior)**
**If** error responses to `/login`, `/forgot-password`, or `/accept-invite` would leak information about email registration status (e.g., distinct messages for "user not found" vs "wrong password"), **then** the implementation **shall not** be considered complete and **shall** be revised to use unified messages.

### 2.9 REQ-AUTH-A11Y — 접근성 (WCAG 2.1 AA)

**REQ-AUTH-A11Y-001 (Ubiquitous)**
The system **shall** ensure all auth forms (`/login`, `/forgot-password`, `/reset-password`, `/accept-invite/set-password`, `/operator/invite`) are fully keyboard navigable: every input, button, and toggle reachable via Tab in visual reading order, with Enter submitting the form.

**REQ-AUTH-A11Y-002 (Ubiquitous)**
The system **shall** associate every `<input>` with a `<label htmlFor>` (using SPEC-LAYOUT-001's `<Label>` primitive) and **shall** expose validation errors via `aria-invalid="true"`, `aria-describedby="<error-id>"`, with the error `<p>` having `role="alert"` so screen readers announce changes.

**REQ-AUTH-A11Y-003 (Event-Driven)**
**When** form submission produces a validation error, the system **shall** programmatically move focus to the first invalid field.

**REQ-AUTH-A11Y-004 (Optional Feature)**
**Where** a password input is shown, the system **shall** provide a visibility toggle button with `aria-label="비밀번호 표시"` / `"비밀번호 숨김"` and `aria-pressed` reflecting the current state.

**REQ-AUTH-A11Y-005 (Ubiquitous)**
The system **shall** maintain the SPEC-LAYOUT-001 contrast and focus-ring requirements (4.5:1 body, 3:1 large/UI, 2px focus outline) on all auth pages in both light and dark modes.

**REQ-AUTH-A11Y-006 (Ubiquitous)**
The system **shall** announce server-side outcomes (login success, error, password reset confirmation) via a Korean `role="status"` or `role="alert"` live region so screen-reader users receive feedback.

### 2.10 REQ-AUTH-OBS — 감사 로깅 (Auth Events)

**REQ-AUTH-OBS-001 (Ubiquitous)**
The system **shall** create a `public.auth_events` table with columns `(id uuid PK, user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL, email text, event_type text NOT NULL, ip_address inet, user_agent text, metadata jsonb DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())` and an `event_type` CHECK constraint listing allowed values.

**REQ-AUTH-OBS-002 (Ubiquitous)**
The allowed `event_type` values **shall** be exactly: `login_success`, `login_failure`, `logout`, `password_reset_requested`, `password_reset_completed`, `password_changed`, `invitation_issued`, `invitation_accepted`, `invitation_revoked`.

**REQ-AUTH-OBS-003 (Event-Driven)**
**When** any of the 9 listed events occurs, the system **shall** insert a row into `public.auth_events` capturing the user_id (when known), the email attempted (for login_failure), the IP address (from `x-forwarded-for` or `request.ip`), the user agent string, and any event-specific metadata.

**REQ-AUTH-OBS-004 (Ubiquitous)**
The system **shall** apply RLS to `public.auth_events`: admins can SELECT all rows; authenticated users can SELECT their own rows (`user_id = auth.uid()`); INSERT is restricted to server-side code via SECURITY DEFINER function or service role.

**REQ-AUTH-OBS-005 (Unwanted Behavior)**
**If** logging an auth event fails (DB unavailable, constraint violation), **then** the system **shall not** abort the auth operation; the failure **shall** be logged to the application error log and the user-facing flow **shall** continue.

**REQ-AUTH-OBS-006 (Optional Feature)**
**Where** the deployment includes a separate APM/log aggregator (Sentry, Vercel Logs), the system **shall** also forward auth events to it; in MVP, only the database table is required.

### 2.11 REQ-AUTH-ERROR — 에러 UX (한국어)

**REQ-AUTH-ERROR-001 (Ubiquitous)**
The system **shall** provide a single error-mapping module `src/auth/errors.ts` that translates Supabase error codes / messages into Korean user-facing messages.

**REQ-AUTH-ERROR-002 (Ubiquitous)**
The system **shall** use the following exact Korean messages for the listed scenarios:
- 로그인 자격 증명 오류: `"이메일 또는 비밀번호가 올바르지 않습니다."`
- Rate limit 초과: `"잠시 후 다시 시도해주세요."`
- 세션 만료: `"세션이 만료되었습니다. 다시 로그인해주세요."`
- 초대 토큰 만료/사용됨: `"초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요."`
- 비밀번호 정책 위반: `"비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다."`
- 비밀번호 재설정 이메일 발송 후: `"이메일을 발송했습니다. 받은편지함을 확인하세요."`
- 비밀번호 재설정 성공: `"비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."`
- 네트워크 실패: `"네트워크 연결을 확인하고 다시 시도해주세요."`

**REQ-AUTH-ERROR-003 (Ubiquitous)**
The system **shall** never display raw English Supabase error messages, error codes, or stack traces to end users; all user-facing error text **shall** be in Korean and free of technical identifiers.

**REQ-AUTH-ERROR-004 (Unwanted Behavior)**
**If** an unmapped Supabase error code is encountered, **then** the system **shall** display a generic Korean fallback `"알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요."` and **shall** log the original error code/message to the application error log for follow-up.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| MFA (TOTP, SMS, WebAuthn) | SPEC-AUTH-MFA-XXX (후속) |
| Magic Link / OTP 로그인 | (검토 후 결정) |
| OAuth (Google/Kakao/Naver 등) | (검토 후 결정) |
| Self-signup `/signup` 페이지 | 정책상 영구 제외 (초대 전용) |
| SSO / SAML | 엔터프라이즈 단계 |
| 계정 삭제 / 탈퇴 UI | SPEC-ADMIN-001 (admin UI) |
| 자체 SMTP / SES 연동 | (운영 단계) |
| 이메일 템플릿 한국어 디자인 | (운영 단계, Supabase dashboard) |
| 세션 동시성 제한 | (검토 후 결정) |
| Captcha (hCaptcha) | (운영 단계) |
| `/me/profile` 사용자 프로필 편집 | SPEC-ME-001 |
| Fine-grained permission (RBAC matrix) | (검토 후 결정) |
| Role transition 워크플로우 (instructor↔operator) | SPEC-ADMIN-001 |
| `@supabase/auth-ui-react` 라이브러리 | 정책상 제외 (자체 폼 사용) |
| 세션 강제 무효화 (force re-login on role change) | MVP 범위 외 |
| JWT secret rotation | (운영 단계, 코드 변경 무) |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 파일 (auth 모듈)

- `src/auth/client.ts` — `createBrowserSupabase()`
- `src/auth/server.ts` — `createServerSupabase()`, `getCurrentUser()`
- `src/auth/admin.ts` — `createServiceSupabase()` (with `import 'server-only'`)
- `src/auth/roles.ts` — `UserRole` type alias, `roleHomePath(role)` helper
- `src/auth/guards.ts` — `requireRole(role | role[])` server helper
- `src/auth/errors.ts` — Supabase 에러 → 한국어 메시지 매핑
- `src/auth/events.ts` — `logAuthEvent(eventType, metadata)` 헬퍼

### 4.2 신규 파일 (middleware + routes)

- `src/middleware.ts` — 세션 갱신 + 1차 가드
- `src/app/(auth)/login/page.tsx` + `actions.ts`
- `src/app/(auth)/forgot-password/page.tsx` + `actions.ts`
- `src/app/(auth)/reset-password/page.tsx` + `actions.ts`
- `src/app/(auth)/accept-invite/page.tsx` (token 검증 진입점)
- `src/app/(auth)/accept-invite/set-password/page.tsx` + `actions.ts`
- `src/app/(auth)/layout.tsx` — 비인증 레이아웃 (centered card, 로고)
- `src/app/api/auth/callback/route.ts` — Supabase OTP 콜백 처리
- `src/app/api/auth/signout/route.ts` (또는 Server Action으로 대체)

### 4.3 수정 파일 (SPEC-LAYOUT-001 통합)

- `src/app/(app)/layout.tsx` — placeholder 교체, `<AppShell userRole>` prop 주입
- `src/components/app/topbar.tsx` — 로그아웃 버튼 onClick 연결, 사용자 이메일 표시

### 4.4 신규 파일 (역할별 가드 layouts)

- `src/app/(instructor)/layout.tsx` — `requireRole('instructor')`
- `src/app/(operator)/layout.tsx` — `requireRole(['operator', 'admin'])`
- `src/app/(admin)/layout.tsx` — `requireRole('admin')`

### 4.5 신규 파일 (operator 초대 UI)

- `src/app/(operator)/operator/invite/page.tsx` — 초대 발급 폼 + 미수락 초대 리스트
- `src/app/(operator)/operator/invite/actions.ts` — `inviteUser`, `revokeInvitation` Server Actions

### 4.6 신규 파일 (validation)

- `src/lib/validation/auth.ts` — zod schemas (login, password, invite)

### 4.7 신규 마이그레이션

- `supabase/migrations/20260427000080_auth_custom_access_token_hook.sql`
- `supabase/migrations/20260427000081_user_invitations.sql`
- `supabase/migrations/20260427000082_auth_events.sql`

### 4.8 신규 스크립트

- `scripts/auth/bootstrap-admin.ts`

### 4.9 설정 파일 수정

- `supabase/config.toml` — `[auth.hook.custom_access_token]` 활성화
- `package.json` — `@supabase/ssr`, `@supabase/supabase-js`, `server-only` 의존성 추가
- `.env.example` — Supabase 키 + `NEXT_PUBLIC_APP_URL` 항목 추가
- (선택) `eslint.config.mjs` — `SUPABASE_SERVICE_ROLE_KEY` 사용 위치 제한 룰

### 4.10 변경 없음 (참고)

- `supabase/migrations/20260427000010_extensions.sql` ~ `20260427000070_seed.sql` — SPEC-DB-001 산출물, 변경 없음
- `src/db/**` — 본 SPEC은 Drizzle 스키마 변경 없음 (auth 관련 테이블은 SQL only)
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물, 그대로 사용

---

## 5. 기술 접근 (Technical Approach)

### 5.1 토큰에 role 주입 (핵심 메커니즘)

Custom Access Token Hook이 Postgres 측에서 `users.role`을 읽어 `claims.role` (top-level) + `claims.app_metadata.role` (백업 경로)에 동시 기록. SPEC-DB-001의 `app.current_role()`이 두 경로 모두 읽도록 이미 구현되어 있어 RLS는 변경 없이 동작.

### 5.2 middleware의 책임

1. `getClaims()` 호출 → 토큰 갱신 + JWKS 서명 검증
2. 갱신된 쿠키를 request + response에 attach (RSC가 같은 요청 내에서 신 쿠키 사용 가능)
3. 빠른 1차 라우트 가드 (정확한 role 체크는 server layout이 담당)
4. matcher: 정적 자산, `/api/health`, `/api/auth/callback` 제외

### 5.3 이중 가드 (defense in depth)

middleware는 빠르지만 우회 가능. 따라서 각 route group의 server layout에서 `requireRole()` 재검증. 한 번이라도 권한 검증을 우회하면 layout에서 차단.

### 5.4 Silent redirect (정보 누설 방지)

instructor가 `/dashboard` 접근 → 403 반환 X → `/me/dashboard`로 307 redirect. 사용자는 routing 정책을 관찰할 수 있으나, 특정 route 존재 여부는 노출되지 않음.

### 5.5 초대 토큰 신뢰 모델

`auth.users.raw_user_meta_data.invited_role`은 사용자가 클라이언트 측 `updateUser` 호출로 수정 가능. 따라서 신뢰 가능한 출처로 별도 `public.user_invitations` 테이블 운영. 초대 수락 시 `users.role`은 invitations 테이블 기준으로만 결정.

### 5.6 비밀번호 정책 이중 검증

- 클라이언트: zod schema (즉시 피드백, UX)
- 서버: Supabase 대시보드 정책 (권위 있는 검증, 우회 불가)

### 5.7 첫 admin bootstrap

UI 없음. `pnpm tsx scripts/auth/bootstrap-admin.ts --email ... --password ...` 형태 CLI. `auth.admin.createUser` (email_confirm: true) + `users` upsert. 멱등.

### 5.8 의존성

- `@supabase/ssr` (latest, Next.js 16 호환)
- `@supabase/supabase-js` (peer dep)
- `server-only` (Next.js 권장 패키지)
- (이미 있음) `react-hook-form`, `zod` (SPEC-LAYOUT-001 의존성)
- 추가 마이그레이션 도구 불필요 (Supabase migration CLI 사용)

---

## 6. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ Supabase 대시보드 `Disable signup = ON` 확인
- ✅ Custom Access Token Hook 활성화 확인 (jwt.io 디코드로 `role` claim 존재 검증)
- ✅ 미인증 접근 → `/login?next=...` 리다이렉트
- ✅ 잘못된 자격 증명 → 통일 메시지
- ✅ 초대 → 수락 → 비밀번호 설정 → home 리다이렉트 end-to-end 통과
- ✅ 초대 토큰 재사용 → 거부
- ✅ 비밀번호 재설정 end-to-end 통과
- ✅ 역할 가드 silent redirect 통과 (instructor → /dashboard 차단)
- ✅ AppShell userRole prop 주입 + 로그아웃 동작
- ✅ auth_events 5종 이벤트 row 생성
- ✅ axe DevTools `/login` critical 0
- ✅ Lighthouse Accessibility ≥ 95

---

## 7. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Custom Access Token Hook 활성화 누락 → role claim 미주입 → RLS 모든 쿼리 거부 | 운영 장애 | `pnpm tsx scripts/auth/verify-hook.ts` 같은 검증 스크립트 추가, 또는 acceptance test에 hook 동작 검증 포함. 배포 시 dashboard 설정 체크리스트 운영. |
| 초대 수락 race condition (verifyOtp는 성공하나 users row INSERT 전에 토큰 발급) → 첫 토큰에 role claim 없음 | UX (로그인 직후 권한 부족) | hook function에서 users row 미존재 시 silent return, 다음 갱신 시 정상화. accept-invite 서버 액션은 users INSERT 완료 후 명시적 토큰 refresh 트리거. |
| `next` query param에 외부 URL 또는 다른 역할의 path → open redirect 또는 권한 우회 시도 | 보안 | `next` 파라미터 검증: same-origin + 사용자 role이 접근 가능한 path만 허용. 미통과 시 role home으로 폴백. |
| Supabase 기본 SMTP rate limit (시간당 N건) → 초대 발급 실패 | 운영 | 운영 단계에 자체 SMTP/SES 전환 계획. MVP는 N명 운영자 대상이므로 기본값 충분. |
| 비밀번호 재설정 이메일이 spam 폴더로 분류 | UX | Supabase 기본 발송 도메인 사용 (CTA만 정확히 한국어). 운영 시 자체 도메인 + SPF/DKIM 설정으로 개선. |
| `getClaims()` 서명 검증 실패 (JWKS 캐시 stale 등) → 사용자 강제 로그아웃 | UX | `@supabase/ssr` 자체 처리에 위임. 발생 시 `/login?next=...`로 우아한 fallback. |
| Service role key 클라이언트 번들 유출 | 치명적 보안 | `import 'server-only'` 강제, ESLint 룰 (`no-restricted-imports`), 리뷰 체크리스트, `.env.local`에서 `NEXT_PUBLIC_` prefix 사용 금지. |
| `(auth)` route group의 layout이 인증된 사용자에게도 보임 (이미 로그인 상태에서 /login 접근) | UX (혼란) | `(auth)/layout.tsx`에서 `getCurrentUser()` 결과가 있으면 home으로 redirect. |
| Custom Access Token Hook이 Postgres 측 에러 발생 시 모든 로그인 차단 | 치명적 운영 장애 | Hook function 내 `EXCEPTION WHEN OTHERS THEN RETURN event` 예외 처리. 에러 로그는 Postgres logs에 남기되 인증은 계속 (role claim만 누락). |
| middleware가 모든 요청마다 Supabase 호출 → cold start 지연 | 성능 | `getClaims()`은 JWKS 캐시 활용으로 빠름. matcher로 정적 자산 제외. |
| 24시간 초대 TTL이 한국 업무 시간상 짧음 (금요일 발송 → 월요일 만료) | 사용성 | 운영자가 만료 시 재발급 가능. 향후 dashboard에서 TTL 조정 (Pro 플랜). |

---

## 8. 참고 자료 (References)

- `.moai/project/product.md`: 페르소나 3종 (instructor/operator/admin), F-001 인증 요구
- `.moai/project/structure.md`: `src/auth/` 디렉토리 설계
- `.moai/project/tech.md`: ADR-002 Supabase Auth 채택
- `.moai/specs/SPEC-DB-001/spec.md`: `users.role` enum, RLS 정책, `app.current_role()` 함수 정의
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: `<AppShell userRole>` prop 인터페이스, topbar 로그아웃 placeholder
- [`research.md`](./research.md): 기술 조사 + Supabase 공식 문서 인용 + 결정 근거
- [`plan.md`](./plan.md): 마일스톤 분해 + 의존성 + DoD 체크리스트
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 7종
- 외부 (verified 2026-04-27):
  - https://supabase.com/docs/guides/auth/server-side/nextjs
  - https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
  - https://supabase.com/docs/guides/auth/row-level-security
  - https://supabase.com/docs/guides/auth/password-security
  - https://supabase.com/docs/guides/auth/rate-limits
  - https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail

---

## 9. Implementation Notes (Sync 2026-04-27)

본 SPEC은 Plan-Run-Sync 사이클을 거쳐 정적 영역 100% 구현 완료(상태 `completed`). 라이브 검증(acceptance.md 시나리오 1-7, EC-1..12, axe DevTools, Lighthouse)은 SPEC 외 운영 검증으로 위임.

### 구현 산출물 (커밋 6종)

| Milestone | 커밋 | 핵심 산출물 |
|-----------|------|-------------|
| M1 | `a3b9a33` | 의존성 + .env.example + setup 가이드 |
| M2/M3/M4 | `7d6bb8b` | `src/auth/` 도메인 8 모듈 + `src/utils/supabase/middleware.ts` getClaims + 마이그레이션 3종 (`20260427000080_auth_custom_access_token_hook.sql`, `_user_invitations.sql`, `_auth_events.sql`) |
| M5 | `d60e4c6` | `(auth)` route group + login/logout + zod validation (`src/lib/validation/auth.ts`) |
| M7/M8/M11 | `9c17947` | 역할별 nested route group `(instructor)/(operator)/(admin)` + `<AppShell userRole>` 통합 + `scripts/auth/bootstrap-admin.ts` |
| M6/M9 | `93a0c57` | 초대 발급/수락 + 비밀번호 재설정 + `/api/auth/callback` OTP dispatcher |
| M10/M12/M13 | `1121aa2` | `auth_events` 8 type 활성 사용 + `a11y-audit.md` + `docs/auth-architecture.md` + `docs/auth-bootstrap.md` |

### Plan 대비 발생한 보완

- **Module structure (hybrid)**: `src/utils/supabase/`(SDK 어댑터)와 `src/auth/`(도메인 레이어) 분리 채택. SPEC §4.2의 단일 `src/middleware.ts` 표기는 Next.js 16 canonical entry name `src/proxy.ts`로 해석 (sync에서 spec.md는 그대로 유지하고 본 노트에서 명시).
- **`SessionUser` 평탄화**: 외부 API(`requireUser`) 유지, 내부 모양만 `{id, email, role, displayName}`로 단순화 — 호출처 0건 변경.
- **`auth_events` event_type 9종 중 8종 활성**: `password_changed`는 REQ-AUTH-PASSWORD-006 정의된 in-session 변경으로 SPEC-ME-001에 위임.
- **추가 도메인 모듈**: `errors.ts`(8종 한국어 에러 매핑), `next-param.ts`(open redirect 가드), `events.ts`(audit logger), `admin.ts`(server-only Service Role), `client.ts`/`server.ts`(어댑터 래퍼) — 원안의 4 파일을 8 파일로 확장.

### 잔여 작업 (SPEC 범위 외)

1. `src/db/supabase-types.ts` 재생성 → `user_invitations`/`auth_events` 자동 타입 → `as never`/`as any` 캐스트 제거 (`@MX:NOTE`로 표시됨)
2. acceptance.md 시나리오 1-7 + EC-1..12 라이브 검증 세션
3. axe DevTools / Lighthouse 측정 (5 페이지)
4. 첫 admin bootstrap 실제 실행 (`pnpm auth:bootstrap-admin`)

정적 DoD 체크리스트는 `progress.md` 참조.

---

_End of SPEC-AUTH-001 spec.md_
