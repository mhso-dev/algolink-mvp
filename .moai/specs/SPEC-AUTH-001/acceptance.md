# SPEC-AUTH-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-AUTH-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (M11 admin bootstrap 완료 + DB seed 적용):

| 사용자 | 이메일 | 비밀번호 | role | 비고 |
|--------|--------|---------|------|------|
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` | M11 CLI로 생성 |
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` | seed로 생성 |
| Instructor | `instructor@algolink.test` | `InstructorPass!2026` | `instructor` | seed로 생성 |
| (테스트용) | `newinvitee@algolink.test` | (미설정) | (미생성) | 시나리오 1에서 사용 |

브라우저 환경: Chromium 최신, 쿠키 활성, JavaScript 활성.
환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
서버: `pnpm dev` 또는 production build.

---

## 시나리오 1 — Operator가 강사를 초대하고 강사가 가입까지 완료

**대응 EARS:** REQ-AUTH-INVITE-001, -002, -003, -004, REQ-AUTH-LOGIN-002, REQ-AUTH-OBS-002 (`invitation_issued`, `invitation_accepted`)

### Given

- Operator(`operator@algolink.test`)가 시스템에 로그인된 상태
- 데이터베이스에 `newinvitee@algolink.test`로 등록된 사용자가 없음
- `public.user_invitations` 테이블에 해당 이메일에 대한 미수락 초대가 없음

### When

1. Operator가 `/operator/invite` 페이지에 접속한다
2. 폼에 `email = newinvitee@algolink.test`, `invited_role = instructor`를 입력하고 "초대 발송" 버튼을 클릭한다
3. 시스템이 (a) `user_invitations` row INSERT, (b) `auth.admin.inviteUserByEmail` 호출, (c) `auth_events` INSERT를 수행한다
4. Operator 화면에 "초대를 발송했습니다." 표시 + 미수락 초대 리스트에 신 항목 노출
5. (이메일 클라이언트 또는 Supabase Studio Inbucket에서) 발송된 메일을 열어 초대 링크를 클릭
6. 브라우저가 `/accept-invite?token_hash=...&type=invite`로 이동
7. 시스템이 `verifyOtp({ token_hash, type: 'invite' })`를 호출하여 임시 세션 생성
8. 자동으로 `/accept-invite/set-password`로 redirect
9. 신규 사용자가 비밀번호 `NewPass!Algolink2026` 입력 후 "비밀번호 설정" 클릭
10. 시스템이 (a) `updateUser({ password })`, (b) `user_invitations`에서 `invited_role = 'instructor'` 조회, (c) `public.users` UPSERT (role = instructor), (d) `accepted_at = now()`, (e) `auth_events` INSERT, (f) `refreshSession()`을 수행

### Then

- ✅ Operator의 미수락 초대 리스트에 항목이 더 이상 표시되지 않는다 (accepted_at 채워짐)
- ✅ `auth.users` 테이블에 신 row 존재, `email_confirmed_at IS NOT NULL`
- ✅ `public.users` 테이블에 `(id = auth.user.id, role = 'instructor', email = newinvitee@algolink.test)` row 존재
- ✅ `public.user_invitations`의 해당 row의 `accepted_at`이 NULL이 아니다
- ✅ `public.auth_events`에 `event_type = 'invitation_issued'` 1건 (operator user_id) + `event_type = 'invitation_accepted'` 1건 (신 사용자 user_id)
- ✅ 신규 사용자의 브라우저가 `/me/dashboard`(instructor home)로 redirect됨
- ✅ `<AppShell>`의 sidebar가 `/me/*` 4종 메뉴만 렌더 (DOM에서 `/dashboard`, `/projects`, `/admin/*` 미존재)
- ✅ 신규 사용자의 access token을 jwt.io로 디코드하면 `role: 'instructor'` claim 존재

---

## 시나리오 2 — 정상 자격 증명으로 로그인 성공

**대응 EARS:** REQ-AUTH-LOGIN-001, -002, REQ-AUTH-SESSION-001, -003, REQ-AUTH-ROLE-002, REQ-AUTH-SHELL-001, REQ-AUTH-OBS-002 (`login_success`)

### Given

- 미인증 상태 (브라우저 쿠키 모두 삭제)
- Operator 사용자(`operator@algolink.test` / `OperatorPass!2026`)가 데이터베이스에 존재
- `public.users.role = 'operator'`

### When

1. 브라우저가 `/login`으로 이동
2. `email`에 `operator@algolink.test`, `password`에 `OperatorPass!2026` 입력
3. "로그인" 버튼 클릭 (또는 password 필드에서 Enter 키)
4. Server Action이 `signInWithPassword`를 호출하고 성공 응답을 받는다
5. 시스템이 `logAuthEvent('login_success')` 후 redirect

### Then

- ✅ 브라우저가 `/dashboard`(operator home)로 redirect (HTTP 307)
- ✅ 응답 헤더에 `Set-Cookie: sb-access-token=...`, `Set-Cookie: sb-refresh-token=...` 존재 (HttpOnly, SameSite=Lax)
- ✅ `/dashboard` 페이지가 정상 렌더, `<AppShell userRole="operator">`가 운영 5종 메뉴 노출
- ✅ Topbar에 사용자 이메일 또는 아바타 표시, 역할 배지 "운영자" 표시
- ✅ `public.auth_events`에 `event_type = 'login_success'`, `user_id = operator의 id`, `created_at = 방금` row 1건
- ✅ access token을 jwt.io에서 디코드 시 `role: 'operator'` claim 존재
- ✅ `auth.jwt() ->> 'role'` SQL 호출 결과 `'operator'` (Supabase SQL Editor에서 해당 사용자 토큰으로 RPC 호출 시)

---

## 시나리오 3 — 잘못된 자격 증명으로 로그인 실패 (이메일 enumeration 방지)

**대응 EARS:** REQ-AUTH-LOGIN-004, REQ-AUTH-SECURITY-007, REQ-AUTH-ERROR-002, REQ-AUTH-OBS-002 (`login_failure`)

### Given

- 미인증 상태
- 데이터베이스에 `nobody@algolink.test`라는 이메일을 가진 사용자가 존재하지 않음
- Instructor 사용자(`instructor@algolink.test` / `InstructorPass!2026`)는 존재

### When (3-A: 미가입 이메일)

1. `/login`에서 `email = nobody@algolink.test`, `password = AnyPass!2026` 입력 후 제출
2. Server Action이 `signInWithPassword`를 호출, Supabase가 "Invalid credentials" 에러 반환
3. 시스템이 `logAuthEvent('login_failure', { email: 'nobody@...' })` 후 폼에 에러 표시

### When (3-B: 가입된 이메일 + 잘못된 비밀번호)

1. `/login`에서 `email = instructor@algolink.test`, `password = WrongPass!2026` 입력 후 제출
2. Server Action이 동일 호출 → 에러 반환
3. 시스템이 `logAuthEvent('login_failure', { email: 'instructor@...' })` 후 동일 에러 표시

### Then (3-A와 3-B 모두 적용)

- ✅ 두 케이스 모두 화면에 정확히 동일한 메시지 표시: `"이메일 또는 비밀번호가 올바르지 않습니다."`
- ✅ HTTP 응답 status, 응답 시간(±100ms), 응답 본문이 두 케이스 간 구분 불가능
- ✅ DevTools Network 탭에서 응답 body 차이 없음 (이메일 존재 여부 미공개)
- ✅ `public.auth_events`에 `event_type = 'login_failure'` 2건, `metadata`에 시도된 이메일 기록 (감사용, 사용자에게 노출 X)
- ✅ 사용자는 여전히 미인증 상태 (쿠키 미설정)
- ✅ `/dashboard` 재접근 시 `/login?next=%2Fdashboard`로 redirect

---

## 시나리오 4 — 만료된 access token이 자동 갱신되어 사용자가 끊기지 않음

**대응 EARS:** REQ-AUTH-SESSION-001, -002, -004, REQ-AUTH-ROLE-002 (refresh 시 hook 재실행)

### Given

- Operator가 로그인된 상태 (`/dashboard` 페이지 활성)
- access token의 `exp` claim이 매우 짧게 설정된 테스트 환경 (예: Supabase 대시보드에서 60초로 임시 변경) — 또는 토큰을 강제 만료시키는 방식
- refresh token은 유효

### When

1. access token이 만료된 시점 직후, 브라우저가 페이지 내 링크를 클릭하여 `/projects`로 navigate
2. `src/middleware.ts`가 요청을 가로채서 `getClaims()` 호출
3. `getClaims()`가 만료된 access token을 감지하고 자동으로 refresh token으로 신 access token을 발급
4. middleware가 신 쿠키를 request + response에 attach
5. `/projects` 서버 layout이 `getCurrentUser()`로 신 토큰 기반 사용자 조회

### Then

- ✅ 사용자에게 `/login` redirect가 발생하지 **않는다**
- ✅ `/projects` 페이지가 정상 렌더링됨
- ✅ DevTools Application > Cookies에서 `sb-access-token`이 새 값으로 갱신됨
- ✅ 신 access token을 디코드하면 `exp`가 현재 시각 이후, `role: 'operator'` claim 정상 존재 (Custom Access Token Hook 재실행 확인)
- ✅ `public.auth_events`에는 `login_success` 추가 row가 생성되지 **않는다** (refresh는 별도 이벤트 아님)

---

## 시나리오 5 — Instructor가 operator 전용 라우트 접근 시 silent redirect

**대응 EARS:** REQ-AUTH-GUARD-002, -003, -006, REQ-AUTH-SECURITY-007 (정보 누설 없음)

### Given

- Instructor(`instructor@algolink.test`)가 로그인된 상태
- 현재 페이지: `/me/dashboard`

### When

1. Instructor가 브라우저 URL을 `/dashboard`로 직접 변경 후 Enter (또는 `/projects`, `/instructors`, `/clients`, `/settlements`, `/operator/invite`, `/admin/users` 등 임의 운영/관리자 path)
2. middleware의 1차 가드가 빠른 redirect 시도 (또는 통과)
3. `/(operator)/layout.tsx`의 `requireRole(['operator', 'admin'])`가 role mismatch 감지

### Then

- ✅ HTTP 307 응답으로 `Location: /me/dashboard` 헤더 전송
- ✅ 응답 본문에 "권한 없음", "403", "Forbidden", `/dashboard` 등 어떤 텍스트도 노출되지 **않는다**
- ✅ 페이지 콘텐츠(KPI 카드, 테이블 등)가 렌더링되지 **않는다** (server layout이 redirect로 끊음)
- ✅ DevTools Network 탭에서 응답 status 307, body 비어있거나 redirect 안내만
- ✅ 브라우저 주소창이 `/me/dashboard`로 변경됨
- ✅ 동일 동작이 `/projects`, `/instructors`, `/clients`, `/settlements`, `/operator/invite`, `/admin/users`, `/admin/analytics` 모두에 적용
- ✅ Instructor가 `/me/dashboard`, `/me/resume`, `/me/schedule`, `/me/settlement` 4종 path는 정상 접근 가능

---

## 시나리오 6 — 비밀번호 재설정 end-to-end 흐름

**대응 EARS:** REQ-AUTH-PASSWORD-003, -004, -005, REQ-AUTH-OBS-002 (`password_reset_requested`, `password_reset_completed`), REQ-AUTH-LOGIN-001 (재로그인)

### Given

- Operator(`operator@algolink.test` / `OperatorPass!2026`)가 데이터베이스에 존재
- 미인증 상태

### When

1. `/login`에서 "비밀번호를 잊으셨나요?" 링크 클릭 → `/forgot-password` 도달
2. `email = operator@algolink.test` 입력 후 "재설정 이메일 발송" 클릭
3. Server Action이 `resetPasswordForEmail`을 호출, `logAuthEvent('password_reset_requested')` 기록
4. 화면에 "이메일을 발송했습니다. 받은편지함을 확인하세요." 표시
5. 이메일 클라이언트(또는 Supabase Inbucket)에서 발송된 메일을 열어 링크 클릭
6. 브라우저가 `/api/auth/callback?token_hash=...&type=recovery&next=/reset-password`로 이동
7. Route handler가 `verifyOtp({ token_hash, type: 'recovery' })` 호출 → 임시 세션 생성
8. `/reset-password`로 redirect
9. 신 비밀번호 `NewOpPass!2026` 입력 후 "비밀번호 변경" 클릭
10. Server Action이 (a) `updateUser({ password })`, (b) `logAuthEvent('password_reset_completed')`, (c) `signOut()`, (d) `/login` redirect 수행
11. `/login`에서 `email = operator@algolink.test`, `password = NewOpPass!2026` 입력 후 제출
12. 로그인 성공

### Then

- ✅ Step 4 메시지가 정확히 일치
- ✅ `public.auth_events`에 `password_reset_requested` 1건, `password_reset_completed` 1건 추가
- ✅ Step 11에서 신 비밀번호로 로그인 성공 → `/dashboard` 도달
- ✅ Step 11에서 구 비밀번호 `OperatorPass!2026` 사용 시 시나리오 3과 동일한 통일 에러 메시지 ("이메일 또는 비밀번호가 올바르지 않습니다.")
- ✅ 미가입 이메일(`nonexistent@algolink.test`)로 Step 2 수행 시에도 동일한 Step 4 메시지 표시 (이메일 존재 여부 미공개)
- ✅ Step 4의 메시지에서 "이메일이 등록되지 않았습니다" 같은 차별 메시지가 절대 노출되지 **않는다**
- ✅ Step 6-7의 token이 만료되었거나 이미 사용된 경우 `/reset-password`에 도달하지 못하고 에러 페이지 표시

---

## 시나리오 7 — 초대 토큰 재사용 시도 거부

**대응 EARS:** REQ-AUTH-INVITE-005, REQ-AUTH-ERROR-002

### Given

- 시나리오 1이 완료된 상태 (`newinvitee@algolink.test`가 이미 초대를 수락하여 `accepted_at IS NOT NULL`)
- 시나리오 1에서 받은 초대 이메일이 여전히 받은편지함에 존재 (또는 동일 token_hash URL이 캐시됨)

### When

1. (악의적 사용자 또는 실수로) 시나리오 1에서 사용했던 동일한 `/accept-invite?token_hash=...&type=invite` URL을 브라우저에 다시 입력
2. Route handler가 `verifyOtp({ token_hash, type: 'invite' })` 호출
3. Supabase가 "token_hash invalid or already used" 에러 반환
4. 시스템이 `mapAuthError`로 에러 매핑

### Then

- ✅ 화면에 정확히 다음 메시지 표시: `"초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요."`
- ✅ 사용자에게 임시 세션이 생성되지 **않는다** (DevTools에서 sb-* 쿠키 미설정 확인)
- ✅ `/accept-invite/set-password`로 redirect되지 **않는다**
- ✅ 페이지에 "운영자에게 재발급을 요청하세요" CTA 또는 `/login` 링크 노출
- ✅ `public.users` 테이블의 기존 row(시나리오 1에서 생성된)가 변경되지 **않는다**
- ✅ `public.auth_events`에 추가 `invitation_accepted` row가 생성되지 **않는다**
- ✅ (선택 검증) 만료된 초대(`expires_at < now()`)에 대해서도 동일한 메시지가 노출됨 — 만료와 사용됨을 구분하지 않음 (정보 최소 노출)

---

## 추가 검증 (Edge Cases & Quality Gates)

다음 항목은 7개 주요 시나리오와 별도로 검증한다.

### EC-1 — Operator가 자신을 admin으로 promote 시도 (RLS + 가드 검증)

- **Given**: Operator 로그인
- **When**: SQL `UPDATE public.users SET role = 'admin' WHERE id = auth.uid()` 직접 실행 시도 (Supabase JS 또는 SQL Editor)
- **Then**: RLS 정책으로 거부 (SPEC-DB-001 REQ-DB001-RLS-OPERATOR가 role 컬럼 변경 차단해야 함). 본 SPEC은 admin promotion UI를 제공하지 않으므로 차단 확인.

### EC-2 — `next` 파라미터에 외부 URL (open redirect 방지)

- **Given**: 미인증 상태
- **When**: `/login?next=https%3A%2F%2Fevil.com` 접근 후 정상 자격 증명으로 로그인
- **Then**: 로그인 성공 후 `https://evil.com`이 아닌 사용자 role의 home으로 redirect

### EC-3 — `next` 파라미터에 다른 역할의 path

- **Given**: 미인증 상태
- **When**: instructor 자격 증명으로 `/login?next=%2Fdashboard` 접근 후 로그인
- **Then**: `/dashboard`로 가지 않고 `/me/dashboard`로 redirect (역할 가드 통과 못 하므로 home으로 폴백)

### EC-4 — 이미 로그인된 사용자가 `/login` 재방문

- **Given**: Operator 로그인 상태
- **When**: 브라우저로 `/login` 직접 접근
- **Then**: `/(auth)/layout.tsx`가 `getCurrentUser()` 결과를 보고 `roleHomePath` (`/dashboard`)로 redirect

### EC-5 — 비밀번호 정책 위반 (가입 시)

- **Given**: 시나리오 1의 set-password 화면
- **When**: 비밀번호 `short1` 입력 (12자 미만)
- **Then**: zod 검증으로 클라이언트 즉시 차단, 메시지 `"비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다."`. submit 미실행.

### EC-6 — 비밀번호 정책 위반 (서버 측 우회 시도)

- **Given**: 클라이언트 검증 우회 시도 (DevTools에서 zod 호출 무력화)
- **When**: 약한 비밀번호 `short1` 서버에 전송
- **Then**: Supabase가 dashboard 정책으로 거부, 에러 한국어 매핑 표시

### EC-7 — auth_events RLS 검증

- **Given**: instructor 로그인
- **When**: SQL `SELECT * FROM public.auth_events`
- **Then**: 본인 user_id의 row만 반환. 다른 사용자의 이벤트 0 rows.

### EC-8 — auth_events RLS (admin)

- **Given**: admin 로그인
- **When**: SQL `SELECT * FROM public.auth_events`
- **Then**: 모든 row 반환

### EC-9 — Custom Access Token Hook fail-safe

- **Given**: hook function이 일시적으로 에러 발생 시뮬레이션 (예: `users` 테이블 임시 lock)
- **When**: 사용자가 로그인 시도
- **Then**: 로그인 자체는 성공하되 access token에 `role` claim이 없을 수 있음. RLS는 'anon' fallback으로 평가되어 일부 데이터 접근 불가. 사용자는 다음 토큰 갱신에서 정상화. 서비스 전체 마비는 발생하지 않음.

### EC-10 — middleware 토큰 갱신 실패 (refresh token도 무효)

- **Given**: refresh token도 만료된 상태 (또는 강제 무효화)
- **When**: 인증 필요 path 접근
- **Then**: middleware가 모든 sb-* 쿠키 클리어 + `/login?next=...` redirect

### EC-11 — Admin bootstrap CLI 멱등 검증

- **Given**: 첫 admin이 이미 생성된 상태
- **When**: `pnpm tsx scripts/auth/bootstrap-admin.ts --email admin@algolink.test --password X --name X` 재실행
- **Then**: "Admin already exists, skipping" 출력 + exit code 0. 데이터베이스 변경 없음.

### EC-12 — Service role key 클라이언트 노출 검증

- **Given**: Production build (`pnpm build`)
- **When**: 빌드 산출물(`.next/static/**`)을 grep
- **Then**: `SUPABASE_SERVICE_ROLE_KEY` 또는 그 값이 0건 발견 (`import 'server-only'` 강제로 클라이언트 번들 제외 검증)

---

## 품질 게이트 (Quality Gates)

본 SPEC이 `status: completed`로 전환되기 위한 자동 검증:

| 게이트 | 명령 또는 도구 | 통과 기준 |
|--------|---------------|----------|
| Build | `pnpm build` | 0 error, 0 critical warning |
| Type | `pnpm tsc --noEmit` | 0 error |
| Lint | `pnpm exec eslint .` | 0 critical |
| 마이그레이션 | `supabase db reset` | 무오류 적용 + seed 통과 |
| Hook 검증 | jwt.io 디코드 | `role` claim 존재 |
| Accessibility (axe DevTools) | `/login`, `/forgot-password`, `/reset-password`, `/accept-invite/set-password`, `/operator/invite` | critical 0건 / serious 0건 (5개 페이지) |
| Lighthouse Accessibility | 5개 페이지 | 평균 ≥ 95 |
| 시나리오 | 본 문서 시나리오 1-7 | 모두 PASS |
| Edge cases | EC-1 ~ EC-12 | 모두 PASS |
| Service role key 비노출 | `grep -r "service_role" .next/static/` | 0 hit |

---

## Definition of Done (인수 기준)

본 SPEC은 다음을 모두 만족할 때 사용자가 `/moai sync SPEC-AUTH-001`을 실행할 수 있다:

- [ ] plan.md §5의 DoD 20개 항목 모두 ✓
- [ ] 본 acceptance.md의 시나리오 1-7 모두 PASS
- [ ] 본 acceptance.md의 EC-1 ~ EC-12 모두 PASS
- [ ] 품질 게이트 표의 모든 항목 통과
- [ ] SPEC-LAYOUT-001의 `// TODO(SPEC-AUTH-001)` 주석 잔존 0건 (`grep -rn "TODO(SPEC-AUTH-001)" src/`)
- [ ] `.moai/specs/SPEC-AUTH-001/spec.md`의 `status` 필드를 `planned` → `completed`로 변경
- [ ] `.moai/specs/SPEC-AUTH-001/spec.md`의 `updated` 필드를 완료 일자로 갱신
- [ ] HISTORY 항목에 완료 시점 entry 추가

---

_End of SPEC-AUTH-001 acceptance.md_
