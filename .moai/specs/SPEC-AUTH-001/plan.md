# SPEC-AUTH-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 (`status: completed`) — `user_role` enum, `users` 테이블, `app.current_role()` 함수, `app.is_admin()` / `app.is_operator_or_admin()` / `app.is_instructor()` 헬퍼, RLS 정책 전부 적용 완료
- ✅ SPEC-LAYOUT-001 완료 (`status: implemented`) — `<AppShell userRole>` 컴포넌트, role-based sidebar, topbar 플레이스홀더, UI 프리미티브 11종, 디자인 토큰
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩
- ✅ Supabase 프로젝트 생성 및 `.env.local` 환경변수 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- ✅ `supabase/config.toml` 존재 (CLI 부트스트랩됨)

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (deps + env)이 모든 마일스톤의 선행
- M2 (auth helpers + types)는 M3-M9의 선행
- M3 (middleware)은 M7 (route guards)의 선행 (중복 가드 검증 가능)
- M4 (custom access token hook + 신규 마이그레이션 3종)는 M5 (login)·M6 (invite) 검증 전제
- M5 (login + signout)은 M7 (route guards)·M9 (admin bootstrap) 검증 전제
- M7 (route guards)은 M8 (AppShell wiring)의 선행
- M10 (auth_events logging)은 M5/M6/M8 완료 후 hook 추가
- M11 (a11y polish)는 M5/M6/M8 모든 폼 완성 후

### 1.3 후속 SPEC을 위한 산출물 약속

- `getCurrentUser()`는 모든 SPEC의 server component 진입점에서 사용 가능
- `requireRole(role | role[])` 헬퍼는 후속 SPEC들이 server layout/page에서 권한 검증 시 import
- `<AppShell userRole>` prop이 실제 값으로 주입되어 모든 후속 페이지 SPEC이 즉시 nav 분기 활용 가능
- `public.user_invitations` 테이블은 SPEC-ADMIN-001에서 admin invite UI가 동일 모델 재사용
- `public.auth_events` 테이블은 SPEC-ADMIN-001 분석 대시보드에서 활용

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 의존성 + 환경 변수 [Priority: High]

**산출물:**
- `package.json` 의존성 추가:
  - `@supabase/ssr` (latest, peer of supabase-js v2)
  - `@supabase/supabase-js` (peer dep)
  - `server-only` (Next.js 권장)
- `.env.example` 업데이트:
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```
- `.env.local` 검증 (이미 존재할 수 있음)
- Supabase 대시보드 설정 체크리스트 (수기 작업, 문서화):
  - [ ] Authentication > Settings > **Disable signup = ON**
  - [ ] Authentication > Settings > Site URL = `${NEXT_PUBLIC_APP_URL}`
  - [ ] Authentication > Settings > Redirect URLs 허용 목록에 `${NEXT_PUBLIC_APP_URL}/api/auth/callback` 추가
  - [ ] Authentication > Policies > Password > Min length 12, 3-of-4 char classes
  - [ ] (Pro 플랜 시) Authentication > Policies > Pwned Passwords = ON
  - [ ] (M4 이후) Authentication > Hooks > Custom Access Token = ENABLED, function `public.custom_access_token_hook`

**검증:**
- `pnpm install` 무오류
- `pnpm tsc --noEmit` 0 type 에러
- 환경변수 로드 확인 (서버 시작 후 `console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)` 임시 점검)

**연관 EARS:** REQ-AUTH-SECURITY-006 (Disable signup), REQ-AUTH-PASSWORD-001/002 (정책)

---

### M2 — Auth 모듈 (helpers + types) [Priority: High]

**산출물:**
- `src/auth/roles.ts`:
  ```ts
  export type UserRole = 'instructor' | 'operator' | 'admin'
  export const ROLE_HOME: Record<UserRole, string> = {
    instructor: '/me/dashboard',
    operator: '/dashboard',
    admin: '/dashboard',
  }
  export function roleHomePath(role: UserRole): string
  export function isValidRole(value: unknown): value is UserRole
  ```
- `src/auth/client.ts`:
  ```ts
  'use client'
  import { createBrowserClient } from '@supabase/ssr'
  export function createBrowserSupabase() { ... }
  ```
- `src/auth/server.ts`:
  ```ts
  import 'server-only'
  import { cookies } from 'next/headers'
  import { createServerClient } from '@supabase/ssr'
  export async function createServerSupabase() { ... }
  export async function getCurrentUser(): Promise<{
    id: string; email: string; role: UserRole
  } | null>
  ```
- `src/auth/admin.ts`:
  ```ts
  import 'server-only'
  import { createClient } from '@supabase/supabase-js'
  export function createServiceSupabase() { ... }
  ```
- `src/auth/guards.ts`:
  ```ts
  import 'server-only'
  import { redirect } from 'next/navigation'
  export async function requireUser(): Promise<NonNullable<...>>
  export async function requireRole(role: UserRole | UserRole[]): Promise<...>
  ```
- `src/auth/errors.ts`:
  - Supabase error code → 한국어 메시지 매핑 객체
  - `mapAuthError(error: AuthError | unknown): string`
- `src/auth/events.ts`:
  ```ts
  import 'server-only'
  export type AuthEventType = 'login_success' | 'login_failure' | 'logout' | ...
  export async function logAuthEvent(eventType: AuthEventType, ctx: {
    userId?: string; email?: string; metadata?: object
  }): Promise<void>
  ```

**검증:**
- `pnpm tsc --noEmit` 0 에러
- ESLint: `import 'server-only'` 누락 확인
- 단위 테스트(선택): `mapAuthError` 매핑 검증

**연관 EARS:** REQ-AUTH-ROLE-007, REQ-AUTH-SESSION-003/006, REQ-AUTH-SECURITY-004, REQ-AUTH-ERROR-001/002/003/004

---

### M3 — middleware [Priority: High]

**산출물:**
- `src/middleware.ts`:
  - `matcher` 설정 (정적 자산, `/api/health`, `/api/auth/callback` 제외)
  - `getClaims()` 호출로 토큰 갱신
  - 1차 가드:
    - `/(auth)/*`, `/api/auth/*`는 인증 무관 통과
    - 기타 path에 미인증 접근 → `/login?next=...` redirect
    - 인증 + role mismatch는 server layout이 처리 (middleware는 빠른 path 체크만)
  - 갱신된 쿠키를 request + response에 attach (양쪽)

**검증:**
- 미인증 상태로 `/dashboard` curl/브라우저 접근 → 307 + Location: `/login?next=%2Fdashboard`
- 인증 상태로 정적 asset (`/_next/static/...`) 접근 → middleware 미실행 (matcher 제외)
- 토큰 만료 후 다음 요청 시 자동 갱신 → 사용자는 인증된 채로 응답 받음

**연관 EARS:** REQ-AUTH-SESSION-001/002/004/005, REQ-AUTH-GUARD-001

---

### M4 — DB 마이그레이션 (hook + invitations + auth_events) [Priority: High]

**산출물:**
- `supabase/migrations/20260427000080_auth_custom_access_token_hook.sql`:
  - `public.custom_access_token_hook(event jsonb) RETURNS jsonb` function
  - `claims.role` + `claims.app_metadata.role` 양쪽에 `users.role` 주입
  - users row 미존재 시 silent return
  - GRANT EXECUTE TO supabase_auth_admin; REVOKE FROM authenticated/anon/public
  - GRANT SELECT ON public.users TO supabase_auth_admin

- `supabase/migrations/20260427000081_user_invitations.sql`:
  ```sql
  CREATE TABLE public.user_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    invited_role public.user_role NOT NULL,
    invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX idx_user_invitations_email_pending
    ON public.user_invitations(email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
  CREATE INDEX idx_user_invitations_invited_by ON public.user_invitations(invited_by);
  ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
  -- 정책: admin all, operator own (invited_by = auth.uid()) R/W
  ```

- `supabase/migrations/20260427000082_auth_events.sql`:
  - `public.auth_events` 테이블 (research.md §8.2 스키마)
  - `event_type` CHECK constraint (9종)
  - 인덱스: user_id, event_type, created_at DESC
  - RLS: admin SELECT all, self SELECT own
  - INSERT는 SECURITY DEFINER function `app.log_auth_event(...)` 또는 service role 경유

- `supabase/config.toml`에 추가:
  ```toml
  [auth.hook.custom_access_token]
  enabled = true
  uri = "pg-functions://postgres/public/custom_access_token_hook"
  ```

**검증:**
- `supabase db reset` (또는 `pnpm db:push`) 무오류
- 다음 SQL로 hook 동작 검증 (admin 사용자 1명 sign-in 후):
  ```sql
  SELECT auth.jwt() ->> 'role'; -- 'admin' 반환 확인
  ```
- jwt.io에 access token 붙여넣어 payload `role` claim 시각 확인
- `INSERT INTO user_invitations` 시 RLS 통과 확인 (admin/operator), 거부 (instructor)

**연관 EARS:** REQ-AUTH-ROLE-002/003/004/006, REQ-AUTH-INVITE-002 (테이블), REQ-AUTH-OBS-001/002/004

---

### M5 — 로그인 / 로그아웃 페이지 + Server Actions [Priority: High]

**산출물:**
- `src/app/(auth)/layout.tsx`:
  - centered card 레이아웃 (SPEC-LAYOUT-001 디자인 토큰 활용)
  - 이미 인증된 사용자가 접근 시 `roleHomePath(user.role)`로 redirect
- `src/app/(auth)/login/page.tsx`:
  - email + password 폼 (`react-hook-form` + zod)
  - 비밀번호 표시 토글 버튼
  - "비밀번호를 잊으셨나요?" 링크 → `/forgot-password`
  - `?next=...` 파라미터 보존 (hidden input)
- `src/app/(auth)/login/actions.ts`:
  ```ts
  'use server'
  export async function login(formData: FormData): Promise<{ error?: string }> {
    // 1. zod 검증
    // 2. supabase.auth.signInWithPassword
    // 3. 실패: logAuthEvent('login_failure'), 통일 메시지 반환
    // 4. 성공: logAuthEvent('login_success'), redirect to safeNext or roleHome
  }
  ```
- `src/lib/validation/auth.ts`:
  - `loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })`
  - `passwordSchema = z.string().min(12).refine(/* 3-of-4 char classes */)`
  - `inviteSchema`, `resetPasswordSchema` 등
- `src/app/api/auth/signout/route.ts` (또는 Server Action):
  - `supabase.auth.signOut()` + `logAuthEvent('logout')` + redirect `/login`
- `next` 파라미터 검증 헬퍼: `src/auth/next-param.ts`
  - same-origin 검증
  - 사용자 role이 접근 가능한 path인지 검증
  - 외부 URL/protocol 거부

**검증:**
- 로그인 성공 → role-appropriate home 도달
- 로그인 실패 → 통일 한국어 메시지
- `?next=/dashboard` 보존 후 로그인 → `/dashboard` 도달 (role 허용 시)
- `?next=https://evil.com` → 무시하고 home 도달
- Sign-out → `/login` 도달, 다시 `/dashboard` 접근 시 재로그인 요구

**연관 EARS:** REQ-AUTH-LOGIN-001/002/003/004/005/006, REQ-AUTH-SECURITY-007 (이메일 enumeration), REQ-AUTH-ERROR-001/002

---

### M6 — 초대 발급 / 수락 흐름 [Priority: High]

**산출물:**
- `src/app/(operator)/operator/invite/page.tsx`:
  - 초대 발급 폼 (email + role select)
  - 미수락 초대 리스트 (revoke 버튼 포함)
  - admin은 role select에 `admin` 옵션 노출, operator는 `instructor`/`operator`만
- `src/app/(operator)/operator/invite/actions.ts`:
  - `inviteUser(formData)`: user_invitations INSERT + `auth.admin.inviteUserByEmail` + `logAuthEvent('invitation_issued')`
  - `revokeInvitation(id)`: `auth.admin.deleteUser(auth_user_id)` + UPDATE `revoked_at` + `logAuthEvent('invitation_revoked')`
- `src/app/(auth)/accept-invite/page.tsx`:
  - URL의 `token_hash` + `type=invite` 추출
  - `verifyOtp({ token_hash, type: 'invite' })` 호출
  - 성공 → `/accept-invite/set-password` redirect
  - 실패 → 에러 메시지 (만료/사용됨 통일)
- `src/app/(auth)/accept-invite/set-password/page.tsx`:
  - 비밀번호 입력 폼 (zod 검증)
- `src/app/(auth)/accept-invite/set-password/actions.ts`:
  ```ts
  'use server'
  export async function acceptInvite(formData) {
    // 1. getCurrentUser() 확인 (verifyOtp 후 임시 세션)
    // 2. supabase.auth.updateUser({ password })
    // 3. user_invitations에서 invited_role 조회 (신뢰 출처)
    // 4. public.users UPSERT (id, role, email, name='')
    // 5. user_invitations.accepted_at = now()
    // 6. logAuthEvent('invitation_accepted')
    // 7. supabase.auth.refreshSession() 호출하여 신 role claim 즉시 반영
    // 8. redirect to roleHomePath(invited_role)
  }
  ```
- `src/app/api/auth/callback/route.ts`:
  - `type` 파라미터 분기 (`invite` / `recovery`)
  - `verifyOtp` 호출
  - `next` 파라미터로 후속 path 결정

**검증:**
- operator 토큰으로 invite 발급 → 이메일 수신 시뮬레이션 (Supabase Studio Inbucket / 실제 메일)
- 링크 클릭 → set-password 도달 → 비밀번호 입력 → instructor home 도달
- 동일 링크 재방문 → 통일 메시지로 거부
- 24시간 후 (또는 강제 expires_at 단축) 링크 클릭 → 거부
- instructor 토큰으로 `/operator/invite` 접근 → silent redirect to `/me/dashboard`

**연관 EARS:** REQ-AUTH-INVITE-001~007, REQ-AUTH-GUARD-007 (instructor 차단)

---

### M7 — 역할별 라우트 가드 + Server Layouts [Priority: High]

**산출물:**
- `src/app/(instructor)/layout.tsx`:
  ```ts
  export default async function InstructorLayout({ children }) {
    await requireRole('instructor')
    return <>{children}</>
  }
  ```
- `src/app/(operator)/layout.tsx`:
  ```ts
  export default async function OperatorLayout({ children }) {
    await requireRole(['operator', 'admin'])
    return <>{children}</>
  }
  ```
- `src/app/(admin)/layout.tsx`:
  ```ts
  export default async function AdminLayout({ children }) {
    await requireRole('admin')
    return <>{children}</>
  }
  ```
- `requireRole` 동작:
  - 미인증 → `redirect('/login?next=...')`
  - role mismatch → `redirect(roleHomePath(user.role))` (silent)

**검증:**
- instructor 토큰으로 `/dashboard` 접근 → `/me/dashboard`로 silent redirect (HTTP 307, 페이지 미렌더)
- operator 토큰으로 `/admin/users` 접근 → `/dashboard`로 silent redirect
- 가드 우회 시도 (middleware 비활성화 후): server layout이 여전히 차단 (defense in depth)
- 응답에 "권한 없음" 같은 텍스트 미노출 확인

**연관 EARS:** REQ-AUTH-GUARD-002/003/004/005/006/007

---

### M8 — AppShell 통합 (SPEC-LAYOUT-001 placeholder 교체) [Priority: High]

**산출물:**
- `src/app/(app)/layout.tsx` 수정:
  - 기존 `// TODO(SPEC-AUTH-001): const { user } = await getUser(); if (!user) redirect("/login");` 주석 라인 → 실제 구현으로 교체
  - 임시 하드코딩된 `userRole` 제거
  - `<AppShell userRole={user.role} userName={user.email}>{children}</AppShell>`
- `src/components/app/topbar.tsx` 수정:
  - 로그아웃 placeholder 버튼의 `onClick` 또는 `<form action>` → Server Action 호출
  - 사용자 이메일/이름 표시 (현재 placeholder인 경우 실제 데이터로 교체)
  - 역할 배지 (`<Badge>` with role label) 동적 렌더

**검증:**
- 인증 후 `/dashboard` 진입 → sidebar가 실제 role의 nav 렌더 (instructor 토큰 시 `/me/*`만, operator 시 운영 5종)
- topbar의 사용자 이메일이 실제 사용자 이메일 표시
- 로그아웃 버튼 클릭 → `/login` 도달, 세션 쿠키 제거 확인 (DevTools)
- AppShell error 시 (DB 장애 시뮬레이션) → 에러 페이지 + `/login` 링크

**연관 EARS:** REQ-AUTH-SHELL-001/002/003/004

---

### M9 — 비밀번호 재설정 흐름 [Priority: High]

**산출물:**
- `src/app/(auth)/forgot-password/page.tsx`:
  - 이메일 입력 폼
- `src/app/(auth)/forgot-password/actions.ts`:
  ```ts
  export async function requestPasswordReset(formData) {
    // 1. zod email 검증
    // 2. supabase.auth.resetPasswordForEmail(email, {
    //      redirectTo: `${APP_URL}/api/auth/callback?next=/reset-password`
    //    })
    // 3. logAuthEvent('password_reset_requested')
    // 4. 항상 통일 메시지 반환 (이메일 존재 여부 미공개)
  }
  ```
- `src/app/(auth)/reset-password/page.tsx`:
  - 새 비밀번호 입력 폼 (zod 검증)
- `src/app/(auth)/reset-password/actions.ts`:
  ```ts
  export async function resetPassword(formData) {
    // 1. getCurrentUser() (verifyOtp로 생성된 임시 세션 확인)
    // 2. supabase.auth.updateUser({ password })
    // 3. logAuthEvent('password_reset_completed')
    // 4. supabase.auth.signOut()
    // 5. redirect('/login') with success toast
  }
  ```
- `/api/auth/callback`은 M6에서 이미 작성됨 (`type='recovery'` 분기)

**검증:**
- `/forgot-password` 입력 → 통일 메시지 (이메일 존재해도, 없어도 동일)
- 실제 이메일 수신 시뮬레이션 → 링크 클릭 → `/reset-password` 도달
- 신 비밀번호 입력 → `/login` 도달 → 신 비밀번호로 로그인 성공
- 미가입 이메일 입력 → 동일 통일 메시지 (이메일 발송은 실제로는 안 됨)
- 만료된 recovery 링크 → 에러 메시지 + `/forgot-password` 링크

**연관 EARS:** REQ-AUTH-PASSWORD-003/004/005/007, REQ-AUTH-OBS-002/003

---

### M10 — Auth Events 로깅 (모든 흐름에 hook 추가) [Priority: Medium]

**산출물:**
- 본 시점에는 M5/M6/M9의 Server Actions 내부에 `logAuthEvent` 호출이 이미 박혀 있어야 하므로, 이 마일스톤은 검증 + 누락 보완이 주임
- 누락 위치 검사:
  - M5 login/logout
  - M6 invite 발급/수락/취소
  - M9 password reset 요청/완료
  - 비밀번호 변경 (M11에서 다룰 수 있음, /me/security는 SPEC-ME-001로 위임이지만 M9의 reset은 본 SPEC 범위)
- IP / User-Agent 추출 헬퍼:
  - `src/auth/request-meta.ts`: `getRequestMeta()` from `headers()` (`x-forwarded-for`, `user-agent`)

**검증:**
- 각 흐름 1회씩 수행 후 SQL: `SELECT event_type, count(*) FROM public.auth_events GROUP BY event_type;` 9종 모두 row 존재 가능 확인 (해당 흐름이 발생한 종류만)
- admin 토큰으로 `SELECT * FROM auth_events` 전체 조회 가능
- instructor 토큰으로 본인 row만 조회 가능
- 로깅 실패 시 인증 흐름은 계속 진행됨 (DB 장애 시뮬레이션)

**연관 EARS:** REQ-AUTH-OBS-001~006

---

### M11 — 첫 admin Bootstrap CLI [Priority: Medium]

**산출물:**
- `scripts/auth/bootstrap-admin.ts`:
  - CLI argv 파싱 (`--email`, `--password`, `--name`, `--force-promote`)
  - `createServiceSupabase()` 사용
  - 멱등 동작:
    - 이미 admin이 존재 → skip + 안내
    - 동일 이메일이 instructor/operator → `--force-promote` 시 role을 admin으로 UPDATE
    - 신규 → `auth.admin.createUser({ email, password, email_confirm: true })` + `users` UPSERT
  - 환경변수 검증 (service role key 미설정 시 명확한 에러)
- `package.json` scripts:
  ```json
  "auth:bootstrap-admin": "tsx scripts/auth/bootstrap-admin.ts"
  ```
- `README.md` 또는 `docs/auth-bootstrap.md`: 사용법 문서화

**검증:**
- 빈 DB에 실행 → admin 생성 성공
- 동일 명령 재실행 → "Admin already exists, skipping" 출력 + exit 0
- service role key 미설정 → 명확한 에러 메시지 + exit 1

**연관 EARS:** (REQ는 spec.md 1.4 성공지표에 포함되나 명시적 REQ-AUTH-XXX-XXX는 없음 — 본 SPEC 범위 내 운영 항목)

---

### M12 — 접근성 + 에러 UX 폴리시 [Priority: Medium]

**산출물:**
- 모든 폼에 다음 패턴 적용 검증:
  - `<label htmlFor>` association
  - `aria-invalid`, `aria-describedby`
  - `role="alert"` 에러 컨테이너
  - `role="status"` 성공 토스트
  - 비밀번호 visibility toggle: `aria-pressed`
  - submit 실패 시 첫 invalid 필드로 focus 이동 (RHF setFocus)
- 한국어 에러 메시지 매핑 검증:
  - `src/auth/errors.ts`의 8종 메시지가 spec.md REQ-AUTH-ERROR-002와 1:1 일치
  - 미매핑 에러는 fallback 메시지 + 원본 로그 기록 검증
- axe DevTools 스캔: `/login`, `/forgot-password`, `/reset-password`, `/accept-invite/set-password`, `/operator/invite` 5개 페이지 critical 0
- Lighthouse Accessibility: 5개 페이지 평균 ≥ 95
- 키보드 only 순회 수동 검증

**연관 EARS:** REQ-AUTH-A11Y-001~006, REQ-AUTH-ERROR-001~004

---

### M13 — 문서 + 후속 SPEC 핸드오프 [Priority: Low]

**산출물:**
- `.moai/specs/SPEC-AUTH-001/progress.md` (진행 기록)
- `.moai/docs/auth-architecture.md` (1-2 page):
  - 토큰 발급 → hook → claim → RLS 흐름 다이어그램
  - 신규 SPEC이 `requireRole`, `getCurrentUser`, `<AppShell>` 사용 가이드
- `README.md` 또는 `docs/setup-supabase.md`:
  - 첫 setup 체크리스트 (M1의 dashboard 설정 + M11 admin bootstrap)

**연관 EARS:** (운영 항목, 명시 REQ 없음)

---

## 3. 진행 순서 (Sequencing)

```
M1 (deps + env)
   ↓
M2 (auth helpers + types)
   ↓
M3 (middleware) ──────┐
   ↓                  │
M4 (DB migrations: hook + invitations + auth_events)
   ↓                  │
   ├─→ M5 (login + signout)
   │       ↓
   ├─→ M6 (invite issue/accept) ──┐
   │       ↓                       │
   ├─→ M9 (password reset)         │
   │       ↓                       │
   └─→ M7 (route guards) ←────────┘
           ↓
       M8 (AppShell wiring)
           ↓
       M10 (auth_events 검증)
           ↓
       M11 (admin bootstrap CLI)
           ↓
       M12 (a11y + error UX 폴리시)
           ↓
       M13 (docs + handoff)
```

병렬 가능: M5, M6, M9는 M4 완료 후 서로 독립적으로 진행 가능. 단 M6/M9는 `/api/auth/callback` 공유.

---

## 4. 위험 (Risks) 및 완화

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|-------|------|------|
| R1 | Custom Access Token Hook이 활성화되지 않은 채 배포 → role claim 미주입 → RLS 모든 쿼리 거부 | M | H | M4 완료 후 즉시 jwt.io로 토큰 디코드 확인. acceptance.md에 hook 검증 시나리오 포함. 배포 체크리스트에 dashboard 설정 항목 명시. |
| R2 | 초대 수락 race condition (handle_new_user trigger와 hook 호출 순서 모호) | M | M | hook function의 `IF v_role IS NULL THEN RETURN event` 가드. accept-invite Server Action에서 `users` UPSERT 후 명시적 `refreshSession()` 호출하여 신 role claim 즉시 반영. |
| R3 | `next` 파라미터 검증 미흡 → open redirect | L | H | `next-param.ts` 헬퍼에 same-origin + role-allowed-path 이중 검증. 단위 테스트로 외부 URL/protocol 거부 확인. |
| R4 | Supabase 기본 SMTP 발송 실패/지연 → 초대/재설정 흐름 중단 | M | M | MVP는 알고링크 운영팀 (소수) 대상이므로 기본 SMTP rate 충분. 운영 시 SES 전환 계획. 발송 실패 시 명확한 에러 + 운영자 재시도 가능. |
| R5 | `getClaims()` JWKS 캐시 stale → 토큰 검증 실패 → 강제 로그아웃 | L | M | `@supabase/ssr` 자체 처리 신뢰. 발생 시 우아한 `/login` redirect. 모니터링은 sentry 등 (post-MVP). |
| R6 | service role key 클라이언트 번들 유출 | L | C | `import 'server-only'` 강제, `NEXT_PUBLIC_` prefix 금지, 코드 리뷰 체크리스트, build 시 sourcemap 분석으로 키 노출 검증. |
| R7 | middleware 모든 요청에 Supabase 호출 → cold start 지연 | L | L | matcher로 정적 자산 제외. `getClaims()`는 JWKS 캐시. |
| R8 | 24시간 초대 TTL이 운영자에게 너무 짧음 | M | L | M11 docs에 명시, 운영자가 만료 시 재발급 가능. Pro 플랜 후 dashboard에서 조정. |
| R9 | role mismatch silent redirect가 무한 루프 발생 (예: instructor의 home도 차단되는 버그) | L | H | `requireRole` 헬퍼에 redirect target이 현재 path와 같으면 에러 페이지로 fallback. 단위 테스트로 검증. |
| R10 | M6 invite Server Action의 `auth.admin.deleteUser` 실패 시 `user_invitations` 행은 INSERT됨 → 고아 row | L | L | revokeInvitation에서 auth_user_id 누락 row도 처리. 또는 SQL transaction 사용 (Supabase 제약상 application-level rollback). |
| R11 | Custom Access Token Hook 실행 실패 → 모든 사용자 로그인 차단 | L | C | hook function 내 `EXCEPTION WHEN OTHERS THEN RETURN event` 예외 처리. 에러는 Postgres logs에 기록되나 인증 흐름은 계속 (role claim만 누락). M4 acceptance test에 fail-safe 동작 검증. |
| R12 | M8 AppShell 통합 시 SSR/RSC hydration mismatch (서버는 user 있음 / 클라는 cookie expired) | L | M | `<AppShell>`은 가능한 server component로 유지. 클라이언트 의존 부분(다크 토글)만 분리. |
| R13 | acceptance.md 시나리오 검증을 위한 테스트 사용자 데이터 부재 | M | L | M11 admin bootstrap 후 시드 스크립트 또는 acceptance.md 부록에 SQL INSERT 안내. SPEC-DB-001 seed에 admin 1명 이미 존재. |
| R14 | RLS 정책으로 `user_invitations` INSERT가 거부됨 (operator role이 본인 row만 INSERT 가능 검증 누락) | M | M | M4 마이그레이션 작성 시 RLS 정책 명시 + acceptance.md 시나리오로 검증. |

---

## 5. 완료 정의 (Definition of Done)

본 SPEC은 다음 모든 조건이 충족될 때 **완료**로 간주한다:

1. ✅ `pnpm build` 0 error / 0 warning (critical)
2. ✅ `pnpm tsc --noEmit` 0 type error
3. ✅ `pnpm exec eslint .` 0 critical
4. ✅ Supabase 대시보드 설정 체크리스트 모두 ✓ (Disable signup, Site URL, Redirect URLs, Password Policy, Custom Access Token Hook 활성화)
5. ✅ Custom Access Token Hook 동작 확인: 새로 발급된 access token에 `role` claim 존재 (jwt.io 디코드)
6. ✅ middleware 리다이렉트 검증: 미인증 `/dashboard` 접근 → `/login?next=%2Fdashboard`
7. ✅ Login 흐름 통과: 정상 로그인, 잘못된 자격 증명 통일 메시지, signout 후 재접근 차단
8. ✅ Invite 흐름 통과: operator 발급 → 이메일 → 링크 → 비밀번호 설정 → instructor home, 토큰 재사용 거부
9. ✅ Password reset 흐름 통과: 요청 → 통일 메시지 → 이메일 → reset → 신 비밀번호 로그인
10. ✅ Route guards 통과 (instructor/operator/admin 3종 silent redirect)
11. ✅ AppShell 통합: 실제 role 기반 sidebar 분기, 로그아웃 동작
12. ✅ auth_events 9종 이벤트 row 생성 검증 (수동 trigger + SELECT)
13. ✅ Admin bootstrap CLI 멱등 동작 확인 (재실행 skip)
14. ✅ axe DevTools `/login`, `/forgot-password`, `/reset-password`, `/accept-invite/set-password`, `/operator/invite` 5종 critical 0
15. ✅ Lighthouse Accessibility ≥ 95 (5개 페이지 평균)
16. ✅ 한국어 에러 메시지 8종 매핑 검증 (REQ-AUTH-ERROR-002와 1:1)
17. ✅ `acceptance.md`의 Given/When/Then 시나리오 7종 모두 PASS
18. ✅ `SUPABASE_SERVICE_ROLE_KEY` 사용 위치가 `import 'server-only'` 파일에 한정됨을 grep/lint로 확인
19. ✅ 본 SPEC의 신규 마이그레이션 3종 (`...80`, `...81`, `...82`) `supabase db reset` 무오류 적용
20. ✅ SPEC-LAYOUT-001의 `<AppShell userRole>` placeholder 코드 100% 교체 완료 (TODO 주석 잔존 0건)

---

_End of SPEC-AUTH-001 plan.md_
