# SPEC-AUTH-001 — 연구 노트 (Research Notes)

본 문서는 SPEC-AUTH-001을 작성하기 전에 수행한 기술 조사를 기록한다. Supabase Auth + `@supabase/ssr` + Next.js 16 App Router 통합, Custom Access Token Hook을 이용한 역할 JWT claim 주입, 초대 기반 가입 플로우, RLS 정책과의 결합 방식을 다룬다.

---

## 1. 결정 요약 (Decision Summary)

| # | 항목 | 채택 | 근거 |
|---|------|------|------|
| D1 | Auth 라이브러리 | **`@supabase/ssr`** | Next.js 16 App Router의 RSC + Server Action + Route Handler에서 쿠키를 읽고 쓸 수 있는 단일 추상화. `@supabase/auth-helpers-nextjs`는 `@supabase/ssr`로 deprecated됨. |
| D2 | 클라이언트 초기화 패턴 | **3종 분리** (`createBrowserClient` / `createServerClient` / `createServiceClient`) | 클라이언트 컴포넌트, 서버 컴포넌트/Action, Admin 작업(초대 발급)에 각기 다른 키와 쿠키 핸들러 필요. |
| D3 | 세션 갱신 위치 | **`middleware.ts` + `supabase.auth.getClaims()`** | RSC는 쿠키를 쓸 수 없으므로 모든 라우트 진입 전에 middleware가 토큰을 갱신하고 새 쿠키를 응답에 attach. |
| D4 | 세션 검증 메서드 | **`getClaims()` (또는 `getUser()`)** | `getSession()`은 JWT 서명 미검증 → 위변조 가능. `getClaims()`는 published JWKS로 매 호출 검증. |
| D5 | 역할 단일 출처 | **`public.users.role` enum** | SPEC-DB-001에서 이미 정의됨. JWT claim은 캐시 사본이며, role 변경 시 동기화. |
| D6 | JWT에 role 주입 방식 | **Custom Access Token Hook** (PostgreSQL function) | RLS는 매 쿼리마다 `auth.jwt()`를 읽으므로 토큰 자체에 role이 박혀야 DB roundtrip 1회 회피. |
| D7 | JWT 내 role 위치 | **`claims.role` (top-level) + `claims.app_metadata.role` (백업)** | `app.current_role()` 함수가 이미 두 경로를 모두 읽도록 작성됨 (`20260427000020_pgcrypto_functions.sql:36-39`). 호환성 위해 둘 다 채움. |
| D8 | 가입 모델 | **초대 전용** (`auth.admin.inviteUserByEmail`) | 사용자 결정 사항. 외부 Self-signup 비활성화. |
| D9 | 비밀번호 정책 | **min length 12 + 대소문자+숫자+심볼 + Pwned Passwords 검사 (Pro 플랜 시)** | Supabase 대시보드 `Auth > Policies` 설정. 코드가 아닌 환경 설정 항목으로 SPEC에 명시. |
| D10 | Rate limit | **Supabase 기본값 + 추후 Management API로 조정** | MVP는 기본값 채택. Brute-force는 Supabase가 lockout 자동 적용 (지수 backoff, 정확한 값은 dashboard 의존). |
| D11 | 미인증 라우트 가드 | **middleware + 서버 layout 이중 가드** | middleware가 빠른 1차 redirect, 서버 layout이 신뢰 가능한 2차 검증 (middleware는 우회 가능성 가정). |
| D12 | 잘못된 역할 접근 처리 | **Silent redirect → 사용자 home dashboard** | 403/404 노출은 정보 누설 (해당 path 존재 여부 확인). |
| D13 | 로그인 실패 메시지 | **고정 메시지 "이메일 또는 비밀번호가 올바르지 않습니다."** | 이메일 enumeration 방지. |
| D14 | 첫 admin bootstrap | **`pnpm tsx scripts/auth/bootstrap-admin.ts`** (CLI) | `auth.admin.createUser()` + `users` 테이블 INSERT를 트랜잭션으로 묶음. UI 없음. |
| D15 | Auth 이벤트 로깅 | **`public.auth_events` 테이블** | Supabase 자체 audit log는 dashboard에서만 조회 가능. 앱 내부 조회/통계가 필요하므로 경량 테이블 신설. |

---

## 2. `@supabase/ssr` 통합 패턴 (Next.js 16 App Router)

### 2.1 출처 (Sources)

- 공식 가이드: https://supabase.com/docs/guides/auth/server-side/nextjs (2026-04-27 확인)
- 패키지 README: https://github.com/supabase/ssr
- Context7 라이브러리 ID: `/supabase/ssr`

### 2.2 핵심 원칙 (공식 인용)

> "Always use `supabase.auth.getClaims()` to protect pages and user data."
> "The Proxy is responsible for: 1. Refreshing the Auth token by calling `supabase.auth.getClaims()`. 2. Passing the refreshed Auth token to Server Components ... 3. Passing the refreshed Auth token to the browser ..."
> 출처: https://supabase.com/docs/guides/auth/server-side/nextjs

### 2.3 클라이언트 3종 (구현 가이드)

본 SPEC의 `src/auth/` 모듈이 노출할 팩토리:

| 함수 | 위치 | 키 | 쿠키 핸들러 |
|------|------|----|-----------|
| `createBrowserSupabase()` | `src/auth/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 자동 |
| `createServerSupabase()` | `src/auth/server.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `next/headers`의 `cookies()` getter/setter |
| `createServiceSupabase()` | `src/auth/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | 쿠키 없음 (서버 전용, 초대 발급용) |

### 2.4 middleware 패턴 (의사 코드)

```ts
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // 세션 갱신 (필수)
  const { data: { claims } } = await supabase.auth.getClaims()
  // claims = { sub, email, role: 'instructor'|'operator'|'admin', ... }

  // 1차 가드 (상세는 본 SPEC REQ-AUTH-GUARD-* 참조)
  // ...

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
```

### 2.5 서버 컴포넌트에서 세션 읽기

```ts
// src/auth/server.ts
import { cookies } from 'next/headers'

export async function getCurrentUser() {
  const supabase = await createServerSupabase()
  const { data: { claims } } = await supabase.auth.getClaims()
  if (!claims) return null
  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role as UserRole,
  }
}
```

### 2.6 SPEC-LAYOUT-001과의 결합

SPEC-LAYOUT-001 `src/app/(app)/layout.tsx`의 placeholder 주석:

```ts
// TODO(SPEC-AUTH-001): const { user } = await getUser(); if (!user) redirect("/login");
```

본 SPEC 구현 시 위 라인을 다음으로 교체:

```ts
const user = await getCurrentUser()
if (!user) redirect(`/login?next=${encodeURIComponent(pathname)}`)
return <AppShell userRole={user.role} userName={user.email}>{children}</AppShell>
```

---

## 3. Custom Access Token Hook (역할 JWT claim 주입)

### 3.1 출처

- 공식 가이드: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook (2026-04-27 확인)
- 호환 정책 가이드: https://supabase.com/docs/guides/auth/row-level-security
- 기존 코드: `supabase/migrations/20260427000020_pgcrypto_functions.sql:29-49` (`app.current_role()` 정의)

### 3.2 동작 원리 (공식 인용)

> "A Custom Access Token Hook ... runs before a token is issued and allows you to add additional claims based on the authentication method used."
> "claims := jsonb_set(claims, '{app_metadata, admin}', 'true');"
> 출처: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

토큰 발급 직전(login, refresh) Postgres function 1회 호출. user_id로 `public.users.role`을 조회하여 `claims.role` + `claims.app_metadata.role`에 박는다.

### 3.3 Function 구현 명세 (본 SPEC M4에서 작성)

```sql
-- supabase/migrations/{ts}_auth_custom_access_token.sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := event -> 'claims';
  v_role text;
  v_app_metadata jsonb;
BEGIN
  SELECT role::text INTO v_role FROM public.users WHERE id = v_user_id;

  IF v_role IS NULL THEN
    -- 신규 가입 직후 users row가 아직 없을 수 있음 (handle_new_user trigger 경합)
    -- 이 경우 role 미주입 상태로 진행하고, 다음 토큰 갱신 시 동기화됨
    RETURN event;
  END IF;

  -- top-level role (app.current_role()의 1순위 경로)
  v_claims := jsonb_set(v_claims, '{role}', to_jsonb(v_role));

  -- app_metadata.role (app.current_role()의 2순위 백업 경로)
  v_app_metadata := COALESCE(v_claims -> 'app_metadata', '{}'::jsonb);
  v_app_metadata := jsonb_set(v_app_metadata, '{role}', to_jsonb(v_role));
  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_metadata);

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.users TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
```

### 3.4 활성화 경로 (Cloud)

대시보드: **Authentication → Hooks → Custom Access Token → Enable → Select function `public.custom_access_token_hook`**.

로컬 개발(`supabase/config.toml`):

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

### 3.5 RLS 결합 검증 (이미 SPEC-DB-001에서 충족)

`supabase/migrations/20260427000020_pgcrypto_functions.sql:29-49`:

```sql
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'role'),
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'anon'
  )
$$;
```

→ Hook이 `claims.role`을 채우면 `app.current_role()`이 정상 동작. 별도 DB roundtrip 없이 RLS 평가.

### 3.6 역할 변경 시 토큰 동기화

| 시점 | 사용자 행동 | 시스템 동작 |
|------|-----------|------------|
| Admin이 사용자 role 변경 | UPDATE users SET role = ... | DB만 업데이트, JWT는 구 role 유지 |
| 다음 토큰 갱신 (1시간 default) | middleware의 `getClaims()` | refresh token 호출 → hook 재실행 → 신 role 반영 |
| 즉시 반영이 필요한 경우 | (선택) 강제 sign-out | `auth.admin.signOut(user_id)` → 다음 로그인 시 신 role |

본 SPEC 결정: **즉시 반영 비요구**. 다음 갱신 사이클까지 stale 허용 (UX 영향 없음, RLS는 항상 신 role 평가하지 않으므로 보안에 무관). 대신 admin UI에 안내 문구.

---

## 4. 초대 기반 가입 플로우

### 4.1 출처

- API 레퍼런스: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- 보안 가이드: https://supabase.com/docs/guides/auth/passwords (resetPasswordForEmail 패턴 응용)

### 4.2 흐름

```
[Operator/Admin] /operator/invite 페이지에서 email + role 입력
   ↓
[Server Action] auth.admin.inviteUserByEmail(email, {
                  data: { invited_role: role, invited_by: auth.uid() }
                })
   ↓
Supabase가 invite 이메일 발송 (template 커스텀 가능)
   ↓
[Invitee] 이메일 링크 클릭 → /accept-invite?token_hash=...&type=invite
   ↓
[Route Handler /api/auth/callback]
   supabase.auth.verifyOtp({ token_hash, type: 'invite' })
   ↓ 성공
   세션 생성 (임시), redirect → /accept-invite/set-password
   ↓
[Page] 비밀번호 입력 폼 → supabase.auth.updateUser({ password })
   ↓
   handle_new_user trigger 또는 server action이 public.users 행 생성
   (role = invited_role from raw_user_meta_data.invited_role)
   ↓
   다음 토큰 갱신 시 Hook이 role claim 주입
   ↓
   redirect → 역할별 home (/me/dashboard or /dashboard)
```

### 4.3 초대 토큰 TTL / 단일 사용

Supabase 기본 동작:
- 초대 토큰 TTL: **24 시간** (대시보드에서 조정 가능)
- 단일 사용: `verifyOtp` 호출 시 토큰 invalidate (재사용 시 `token expired or invalid` 에러)

본 SPEC 결정: **기본값 24시간 채택**. TTL이 필요하면 Pro 플랜의 dashboard에서 조정 (코드 변경 없음).

### 4.4 초대 취소 (revoke)

Supabase에는 초대 전용 revoke API가 없으므로:
- 미수락 초대를 취소하려면 `auth.admin.deleteUser(user_id)` 사용
- 발급 직후 `auth.users` 테이블에 row가 생성되며 `email_confirmed_at IS NULL` 상태
- 본 SPEC: `public.user_invitations` 테이블로 초대 메타데이터 추적, 취소 시 `auth.admin.deleteUser` + 메타데이터 row 삭제

### 4.5 invited_role 보존 전략

`inviteUserByEmail`의 `data` 옵션은 `auth.users.raw_user_meta_data`로 저장된다. **악의적 수정 방지**를 위해 본 SPEC은:

1. 초대 시 `data: { invited_role }` 저장 (raw_user_meta_data) — 사용자 수정 가능 위험 있음
2. **추가**로 `public.user_invitations(id, email, role, invited_by, expires_at, accepted_at)` 테이블에 저장 (신뢰 가능 출처)
3. `handle_new_user` trigger 또는 accept server action에서 **`user_invitations` 테이블 기준**으로 `users.role`을 결정 (raw_user_meta_data는 무시)

→ raw_user_meta_data 변조 시도가 있어도 role 부여 결정은 신뢰 가능 출처에서 수행.

---

## 5. 비밀번호 정책 (Password Policy)

### 5.1 출처

- 공식 가이드: https://supabase.com/docs/guides/auth/password-security (2026-04-27 확인)
- 비밀번호 변경 API: https://supabase.com/docs/guides/auth/passwords

### 5.2 권장 정책 (공식 인용)

> "Set a large minimum password length, with 8 characters being the recommended minimum"
> "Require digits, lowercase and uppercase letters, and symbols to appear at least once"
> "Leverages the open-source HaveIBeenPwned.org Pwned Passwords API to reject credentials"
> 출처: https://supabase.com/docs/guides/auth/password-security

### 5.3 본 SPEC 결정값

| 항목 | 값 | 근거 |
|------|----|----|
| 최소 길이 | **12 chars** | 공식 권장(8) 상회. 한국어 사용자 대상 보안 강화. |
| 문자 종류 | **lowercase + uppercase + digits + symbols 중 3종 이상** | Supabase dashboard 옵션 매칭 |
| 허용 심볼 | `!@#$%^&*()_+-=[]{};':"\|<>?,./~` | Supabase 기본값 |
| Pwned 검사 | **활성화 (Pro 플랜 시)** | 유출 패스워드 차단 |
| 클라이언트 사전 검증 | **zod schema** (`src/lib/validation/auth.ts`) | UX (즉시 피드백) |
| 서버 권위 | **Supabase 정책** (대시보드 설정) | 클라이언트 우회 시도 차단 |

### 5.4 비밀번호 재설정 플로우

```
[User] /login 화면 "비밀번호를 잊으셨나요?" → /forgot-password
   ↓
   email 입력 → supabase.auth.resetPasswordForEmail(email, {
                   redirectTo: `${APP_URL}/api/auth/callback?next=/reset-password`
                 })
   ↓
   "이메일을 확인하세요" 안내 (실제 이메일 존재 여부 미공개)
   ↓
[Email] 링크 클릭 → callback에서 verifyOtp({ type: 'recovery' })
   ↓
   세션 생성, redirect → /reset-password
   ↓
[Page] 신 비밀번호 입력 → supabase.auth.updateUser({ password: new })
   ↓
   "비밀번호가 변경되었습니다" → /login (sign-out 후)
```

### 5.5 로그인 중 비밀번호 변경

`/me/security` 페이지에서:
```ts
await supabase.auth.updateUser({
  password: newPassword,
  // currentPassword 옵션은 supabase-js v2.102.0+
})
```

본 SPEC은 `currentPassword` 옵션 사용 (재인증 효과).

---

## 6. 보안 자세 (Security Posture)

### 6.1 CSRF

- `@supabase/ssr` 쿠키는 `SameSite=Lax` (기본). HTTP POST cross-origin 차단.
- Server Action은 Next.js가 origin/referer 헤더 검증.
- 추가 CSRF 토큰 불필요.

### 6.2 Rate Limit (출처: https://supabase.com/docs/guides/auth/rate-limits)

| 작업 | Supabase 기본값 |
|------|----------------|
| 이메일 발송 (invite, reset 포함) | 사용자당 1회 / period (대시보드 조정) |
| Sign-in (email+password) | IP당 시간당 N회 + burst |
| Token refresh | 별도 limit |

본 SPEC 결정:
- MVP는 **Supabase 기본값 채택**
- 실제 운영 중 적용 (post-launch 모니터링 후 Management API로 조정)
- 앱 단에서 **추가 lockout 로직 없음** (Supabase 위임)

### 6.3 이메일 enumeration 방지

| 화면 | 정책 |
|------|------|
| 로그인 실패 | 항상 "이메일 또는 비밀번호가 올바르지 않습니다." (잘못된 이메일 vs 잘못된 비밀번호 구분 X) |
| 비밀번호 재설정 요청 | 항상 "이메일을 발송했습니다. 받은편지함을 확인하세요." (실제 이메일 존재 여부 미공개) |
| 초대 발급 | Operator에게는 "초대를 발송했습니다." (이미 가입된 이메일이면 "이미 등록된 이메일입니다." 노출 — 운영자는 신뢰 가능 사용자) |

### 6.4 시크릿 관리

| Key | 위치 | 노출 |
|-----|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel | 클라이언트 OK (도메인) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel | 클라이언트 OK (RLS로 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel | **서버 전용**. `src/auth/admin.ts`에서만 import. `'server-only'` import로 클라이언트 번들 차단. |
| `PGRYPTO_SYMMETRIC_KEY` | (SPEC-DB-001 소관) | DB 환경변수, 앱은 미사용 |

`'server-only'` 패키지 (Next.js 권장):
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
export function createServiceSupabase() { ... }
```

---

## 7. 접근성 (A11y)

| 요구 | 구현 |
|------|------|
| 키보드 네비게이션 | 로그인 폼 모든 필드 Tab 순회, Enter 제출 |
| 에러 메시지 ARIA | `<input aria-invalid aria-describedby="email-error">` + `<p id="email-error" role="alert">` |
| 포커스 관리 | submit 실패 시 첫 번째 에러 필드로 focus 이동 |
| 비밀번호 표시 토글 | `<button type="button" aria-label="비밀번호 표시" aria-pressed={visible}>` |
| 라벨 association | 모든 input에 `<label htmlFor>` (SPEC-LAYOUT-001 `<Label>` 프리미티브 활용) |
| 한국어 에러 메시지 | screen reader 친화적 자연어 (코드명 미노출) |

---

## 8. 관측 (Observability)

### 8.1 옵션 비교

| 옵션 | 장점 | 단점 |
|------|------|------|
| **A. `public.auth_events` 테이블** | SQL 쿼리 자유, KPI 집계 용이, 대시보드 자체 구축 가능 | 직접 INSERT 코드 필요 |
| B. Supabase 자체 audit log (Pro+) | 코드 0줄 | 대시보드에서만 조회, KPI 집계 불가, Pro 플랜 필수 |

### 8.2 본 SPEC 결정: **옵션 A**

**경량 테이블 신설**:

```sql
CREATE TABLE public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL CHECK (event_type IN (
    'login_success', 'login_failure',
    'logout',
    'password_reset_requested', 'password_reset_completed',
    'password_changed',
    'invitation_issued', 'invitation_accepted', 'invitation_revoked'
  )),
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX idx_auth_events_event_type ON public.auth_events(event_type);
CREATE INDEX idx_auth_events_created_at ON public.auth_events(created_at DESC);

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_events_admin_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (app.current_role() = 'admin');

CREATE POLICY auth_events_self_select ON public.auth_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT는 server action에서 service role 또는 SECURITY DEFINER function 경유
```

본 SPEC M8에서 구현. 본 SPEC은 frontend/auth 위주이지만 본 테이블은 auth와 직결되므로 SPEC-AUTH-001 범위에 포함.

---

## 9. 첫 admin Bootstrap

### 9.1 절차 (CLI 전용)

```bash
# 환경변수 확인 후
pnpm tsx scripts/auth/bootstrap-admin.ts \
  --email admin@algolink.kr \
  --password 'TempPass!2026' \
  --name '관리자'
```

### 9.2 스크립트 동작

```ts
// scripts/auth/bootstrap-admin.ts
import { createServiceSupabase } from '@/auth/admin'

async function main() {
  const supabase = createServiceSupabase()

  // 1. 이미 존재 확인 (idempotent)
  const { data: existing } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .maybeSingle()

  if (existing?.role === 'admin') {
    console.log('Admin already exists, skipping')
    return
  }

  // 2. auth.users 생성 (이메일 즉시 confirmed)
  const { data: authUser, error: e1 } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invited_role: 'admin' },
  })
  if (e1) throw e1

  // 3. public.users INSERT or UPDATE
  const { error: e2 } = await supabase.from('users').upsert({
    id: authUser.user.id,
    role: 'admin',
    name_kr: name,
    email,
  })
  if (e2) throw e2

  console.log(`Admin bootstrapped: ${email}`)
}
```

### 9.3 멱등성 (Idempotency)

- 이미 admin이 존재하면 skip
- 동일 이메일이 instructor/operator로 존재하면 role을 admin으로 promote (CLI 옵션 `--force-promote`)
- 신규 생성 시 첫 토큰 갱신 사이클까지 JWT에 role 미반영 → 즉시 사용을 위해 즉시 sign-in 후 토큰 reissue 권장

---

## 10. 에러 UX (한국어 메시지 매핑)

| 시나리오 | 사용자 메시지 |
|---------|------------|
| 로그인: 잘못된 자격 증명 | "이메일 또는 비밀번호가 올바르지 않습니다." |
| 로그인: rate limit 초과 | "잠시 후 다시 시도해주세요." (정확한 시간 미공개) |
| 세션 만료 | "세션이 만료되었습니다. 다시 로그인해주세요." → /login?next=... |
| 초대 토큰 만료 | "초대 링크가 만료되었습니다. 운영자에게 재발급을 요청하세요." |
| 초대 토큰 재사용 | "이미 사용된 초대 링크입니다." |
| 비밀번호 정책 위반 | "비밀번호는 12자 이상이며 대소문자/숫자/특수문자를 포함해야 합니다." |
| 네트워크 실패 | "네트워크 연결을 확인하고 다시 시도해주세요." |
| 권한 없음 (operator → admin route) | (silent redirect, no message) |

---

## 11. SPEC-DB-001 / SPEC-LAYOUT-001과의 결합 매트릭스

| 본 SPEC 요구 | DB-001 의존 | LAYOUT-001 의존 |
|------------|------------|---------------|
| RLS가 role claim 사용 | ✅ `app.current_role()` 정의됨 (000020) | — |
| `public.users.role` enum | ✅ `user_role` enum 정의됨 (000030) | — |
| `auth.users` ↔ `public.users` FK | ✅ `users.id` REFERENCES `auth.users` (000030 추정) | — |
| `<AppShell userRole>` prop 주입 | — | ✅ prop 정의 완료, 본 SPEC이 값 주입 |
| Topbar 로그아웃 버튼 활성화 | — | ✅ placeholder 존재, 본 SPEC이 onClick 연결 |
| 라우트 그룹 (instructor)/(operator)/(admin) | — | (구조는 LAYOUT의 nav 분기로 표현, 실제 라우트 그룹 디렉토리는 본 SPEC도 사용) |
| `(app)/layout.tsx`의 가드 placeholder | — | ✅ `// TODO(SPEC-AUTH-001)` 주석 → 본 SPEC이 교체 |
| `auth_events` 신규 테이블 마이그레이션 | (DB-001 다음 마이그레이션 번호 사용) | — |
| `user_invitations` 신규 테이블 | (DB-001 다음 마이그레이션 번호 사용) | — |
| `custom_access_token_hook` function | (DB-001 다음 마이그레이션 번호 사용) | — |

본 SPEC은 SPEC-DB-001 마이그레이션 번호 체계(`20260427000010` ~ `20260427000070`)를 이어 `20260427000080+`부터 신규 마이그레이션 생성.

---

## 12. 검증된 외부 URL (verified via WebFetch on 2026-04-27)

- ✅ https://supabase.com/docs/guides/auth/server-side/nextjs
- ✅ https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- ✅ https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- ✅ https://supabase.com/docs/guides/auth/passwords
- ✅ https://supabase.com/docs/guides/auth/password-security
- ✅ https://supabase.com/docs/guides/auth/rate-limits
- ✅ https://supabase.com/docs/guides/auth/auth-hooks
- ✅ https://supabase.com/docs/guides/auth/row-level-security

(Context7 라이브러리 ID: `/supabase/ssr`, `/supabase/auth`, `/supabase/supabase` — `/moai run` 단계에서 참조)

---

_End of research.md_
