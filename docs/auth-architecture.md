# Algolink 인증 아키텍처

본 문서는 SPEC-AUTH-001로 구축된 Algolink 인증·권한 레이어의 전체 흐름과 후속 SPEC을 위한 사용 가이드를 정리한다.

---

## 1. 전체 흐름 (토큰 발급 → JWT claim → RLS 평가)

```
[사용자] ──signInWithPassword──▶ [Supabase Auth]
                                      │
                                      ├── 1. 비밀번호 검증
                                      ├── 2. JWT 발급 직전 Custom Access Token Hook 호출
                                      │      ↓
                                      │   [Postgres: public.custom_access_token_hook]
                                      │      ├── public.users.role 조회
                                      │      └── claims.role + claims.app_metadata.role 양쪽 주입
                                      │
                                      └── 3. access_token + refresh_token 발급
                                              ↓
[브라우저 쿠키]  sb-...-access-token, sb-...-refresh-token (HttpOnly)
       │
       ▼
[Next.js 요청] ──▶ src/proxy.ts (middleware)
                       ├── supabase.auth.getClaims()  ← JWT 서명 검증 + 갱신
                       ├── 미인증 → /login?next=... redirect
                       └── 인증 통과 → 응답에 신 쿠키 attach
                              │
                              ▼
                       [(app)/layout.tsx]  ← getCurrentUser() 직접 호출
                              │
                              ▼
                       [(role)/layout.tsx] ← requireRole(...) (defense-in-depth)
                              │
                              ▼
                       [page.tsx]  ← 페이지별 자체 RLS 쿼리
                              │
                              ▼
                       [Postgres + RLS]  ← auth.jwt() ->> 'role' 읽기
                              │
                              └── public.users / projects 등 SELECT 정책 평가
                                  app.current_role() / app.is_admin() 헬퍼 사용
```

### 핵심 포인트

- **단일 출처 (Source of Truth)**: `public.users.role` (enum `user_role`).
  JWT claim, `auth.users.raw_app_meta_data.role`은 모두 캐시 사본.
- **JWT 서명 검증**: `getSession()` 사용 금지. 항상 `getClaims()` 또는 `getUser()`.
  `getClaims()`은 published JWKS로 매 호출 검증함.
- **3-line defense**: middleware → (app) layout → (role) layout. 어느 한 단계 우회되어도 다음 단계가 차단.
- **Silent redirect**: 권한 부족 시 403 표시 X. role-appropriate home으로 307 redirect.
  특정 route 존재 여부를 사용자에게 노출하지 않음.

---

## 2. 모듈 경계 (hybrid 구조)

| 레이어 | 위치 | 역할 |
|--------|------|------|
| **SDK 어댑터** | `src/utils/supabase/{client,server,middleware}.ts` | Supabase SDK factory 함수만 제공. 비즈니스 로직 없음. Supabase 공식 docs 컨벤션. |
| **인증 도메인** | `src/auth/*.ts` | role 타입, JWT claim 파싱, 권한 가드, 에러 매핑, 감사 로깅. `import 'server-only'` 강제. |
| **레거시 호환** | `src/lib/auth.ts` | SPEC-LAYOUT-001 호환을 위한 얇은 래퍼. 내부적으로 `src/auth/server.ts`의 `getCurrentUser()` 호출. |
| **검증 스키마** | `src/lib/validation/auth.ts` | zod 스키마 (login, password, invite, set-password, forgot-password). |
| **에러 매핑** | `src/auth/errors.ts` | Supabase 에러 코드/메시지 → 한국어 매핑 8종 (REQ-AUTH-ERROR-002). |
| **감사 로깅** | `src/auth/events.ts` | `logAuthEvent()` 헬퍼. 9 event_type 지원. 실패 시 throw 안 함. |

의존 방향: **도메인 → SDK 어댑터** (단방향). SDK 레이어는 도메인을 모르므로 재사용·교체 가능.

---

## 3. 후속 SPEC을 위한 API

### 3.1 server component / Server Action에서 인증 확인

```ts
import { getCurrentUser } from "@/auth/server";

const user = await getCurrentUser();
if (!user) {
  // 미인증 — middleware가 이미 redirect했어야 함
  redirect("/login");
}
// user = { id, email, role: 'instructor' | 'operator' | 'admin' }
```

### 3.2 server component / Server Action에서 역할 강제

```ts
import { requireRole } from "@/auth/guards";

// 단일 역할
await requireRole("admin");

// 다중 허용
await requireRole(["operator", "admin"]);

// 미인증 → /login redirect
// 역할 mismatch → silent redirect to roleHomePath(user.role)
// redirect 루프 발생 시 throw (안전 장치)
```

### 3.3 layout에서 정의된 역할 가드

3개 route group이 이미 가드를 적용함. 페이지를 추가할 때 적절한 그룹 아래에 두면 끝:

| 그룹 | 경로 | 가드 |
|------|------|------|
| `src/app/(app)/(instructor)/` | `/me/*` | `requireRole('instructor')` |
| `src/app/(app)/(operator)/` | `/dashboard, /projects, /instructors, /clients, /settlements, /operator/*` | `requireRole(['operator', 'admin'])` |
| `src/app/(app)/(admin)/` | `/admin/*` | `requireRole('admin')` |
| `src/app/(app)/notifications/` | `/notifications` | (공통, 가드 없음) |

URL은 모두 route group을 통과해 그대로 노출 (e.g., `(operator)/dashboard/page.tsx` → `/dashboard`).

### 3.4 감사 이벤트 기록

```ts
import { logAuthEvent } from "@/auth/events";

await logAuthEvent("login_success", {
  userId: user.id,
  email: user.email,
  metadata: { method: "password" },
});
```

지원 event_type 9종 (`public.auth_events.event_type` CHECK 제약):
- `login_success`, `login_failure`, `logout`
- `password_reset_requested`, `password_reset_completed`, `password_changed`
- `invitation_issued`, `invitation_accepted`, `invitation_revoked`

`metadata` 내 `password|token|secret|key` 매칭 키는 자동 redact됨. 실패 시 console.error만 남기고 throw 안 함 (인증 흐름 끊지 않음, REQ-AUTH-OBS-005).

### 3.5 Service role 클라이언트 (admin 작업용)

```ts
import { createServiceSupabase } from "@/auth/admin";  // 'server-only' 강제
const admin = createServiceSupabase();
await admin.auth.admin.inviteUserByEmail(email, { data: { invited_role } });
```

**주의**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트 번들에 노출하지 말 것. 모든 호출 위치는 `import 'server-only'` 직속이어야 함.

### 3.6 안전한 redirect target 검증 (?next 파라미터)

```ts
import { safeNextPath } from "@/auth/next-param";

const target = safeNextPath(rawNext, user.role, "/dashboard");
// - 외부 URL/protocol-relative 거부
// - 다른 역할의 경로 거부 → fallback
// - auth 페이지 (/login 등) 거부 → fallback
redirect(target);
```

### 3.7 AppShell 통합

`(app)/layout.tsx`가 `getCurrentUser()`로 user를 가져와 `<AppShell role={user.role} userEmail={user.email}>`에 주입. 후속 페이지는 AppShell 안에 그대로 들어가며 sidebar는 role에 따라 자동 분기 (`@/lib/nav.ts`).

로그아웃은 topbar 버튼이 `signOut` Server Action (`src/app/(auth)/login/actions.ts`)을 호출 → 세션 무효화 + `/login` redirect.

---

## 4. JWT custom access token hook

`supabase/migrations/20260427000080_auth_custom_access_token_hook.sql`에 정의:

```sql
CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $$
DECLARE v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.users WHERE id = (event ->> 'user_id')::uuid;
  IF v_role IS NULL THEN RETURN event; END IF;  -- race condition 안전 (REQ-AUTH-ROLE-006)
  RETURN jsonb_set(
    jsonb_set(event, '{claims,role}', to_jsonb(v_role), true),
    '{claims,app_metadata,role}', to_jsonb(v_role), true
  );
EXCEPTION WHEN OTHERS THEN RETURN event;  -- fail-safe (R11)
END $$;
```

활성화: `supabase/config.toml`의 `[auth.hook.custom_access_token]` 또는 클라우드 대시보드 Authentication > Hooks.

### Race condition 처리

초대 수락 직후 첫 토큰 발급 시 `public.users` row INSERT 전에 hook이 호출될 수 있음. hook은 v_role이 NULL이면 원본 event를 그대로 return하므로 토큰은 발급되지만 role claim 없음. 다음 refresh 시 정상화. accept-invite Server Action은 users UPSERT 직후 `refreshSession()`을 명시 호출하여 즉시 정상화 보장.

### Fail-safe

hook function 자체에 `EXCEPTION WHEN OTHERS THEN RETURN event` 가드가 있어 어떤 DB 에러도 로그인을 차단하지 않음. role claim만 누락되며, 사용자는 인증된 상태로 페이지에 도달하나 RLS는 'anon'으로 평가되어 데이터 접근 제한됨. 운영 시 Postgres logs를 모니터링해 hook 에러 발생 추적.

---

## 5. 운영 체크리스트

신규 환경 셋업 시 `docs/auth-bootstrap.md` 참조. 핵심:

1. `.env.local` 환경 변수 4종 설정 (URL, PUBLISHABLE_KEY, SERVICE_ROLE_KEY, APP_URL)
2. Supabase 대시보드: Disable signup ON, Site URL, Redirect URLs, Password Policy
3. DB 마이그레이션 적용: `supabase db reset` (또는 `db push`)
4. Custom Access Token Hook 활성화 (대시보드)
5. 첫 admin 부트스트랩: `pnpm auth:bootstrap-admin --email ... --password ...`
6. jwt.io 디코드로 `role` claim 존재 검증

---

## 6. 잔여 작업 / 후속 SPEC 위임

본 SPEC 범위 외로 명시 위임된 항목:

| 항목 | 위임 SPEC |
|------|-----------|
| 사용자 프로필 편집 (`/me/profile`) | SPEC-ME-001 |
| 인-세션 비밀번호 변경 (`/me/security`) | SPEC-ME-001 |
| Admin UI (사용자 목록, role 변경, 강제 삭제) | SPEC-ADMIN-001 |
| MFA, OAuth, Magic Link, SSO | 후속 SPEC |
| `src/db/supabase-types.ts` 재생성 (user_invitations, auth_events 타입 포함) | 운영 작업 |

`@MX:NOTE`로 표시된 임시 `as any` 캐스트(events.ts, accept-invite/actions.ts, operator/invite/actions.ts)는 supabase-types 재생성 후 제거 가능.

---

_문서 버전: 1.0.0 / 작성일: 2026-04-27 / SPEC: SPEC-AUTH-001_
