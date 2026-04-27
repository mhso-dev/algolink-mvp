# SPEC-AUTH-001 — 첫 셋업 가이드

본 문서는 SPEC-AUTH-001 인증 레이어가 동작하기 위해 한 번만 수행해야 하는 환경 설정 단계를 정리한다. 코드 외부 작업(Supabase 대시보드 설정, 첫 admin 부트스트랩)이 핵심이다.

---

## 1. 환경 변수 (.env.local)

`.env.example`을 `.env.local`로 복사 후 다음 키를 채운다.

| 키 | 위치 | 비고 |
|----|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings > API | 브라우저 노출 OK |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Project Settings > API > Publishable key | 구 anon key. 브라우저 노출 OK (RLS로 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings > API > service_role | 서버 전용. **절대 클라이언트 노출 금지** |
| `NEXT_PUBLIC_APP_URL` | 배포 도메인 또는 `http://localhost:3000` | 비밀번호 재설정 / 초대 콜백 base URL |

---

## 2. Supabase 대시보드 설정 체크리스트

신규 프로젝트마다 1회만 수행. (로컬 개발은 `supabase/config.toml`이 자동 처리하나, 클라우드는 수기.)

### Authentication > Settings

- [ ] **Disable signup = ON** (필수, REQ-AUTH-SECURITY-006)
  - 외부 사용자가 self-signup 불가. 초대만 허용.
- [ ] **Site URL** = `${NEXT_PUBLIC_APP_URL}` (예: `https://algolink.example.com`)
- [ ] **Redirect URLs (Allow list)** 에 다음 추가:
  - `${NEXT_PUBLIC_APP_URL}/api/auth/callback`

### Authentication > Policies > Password

- [ ] **Minimum length = 12**
- [ ] **Required character types**: Lowercase + Uppercase + Digits + Symbols 중 3종 이상
- [ ] (Pro 플랜) **Pwned Passwords (HaveIBeenPwned) = ON**

### Authentication > Hooks > Custom Access Token (M4 마이그레이션 적용 후)

- [ ] **Enabled = ON**
- [ ] Function = `public.custom_access_token_hook`
- 활성화 직후 jwt.io에서 새 access token을 디코드 → payload에 `role` claim 존재 검증

---

## 3. DB 마이그레이션 적용

```bash
supabase db reset                  # 로컬: 전체 리셋 + seed 적용
# 또는
supabase db push                   # 변경분만 적용
```

신규 마이그레이션 (M4 산출물):

- `20260427000080_auth_custom_access_token_hook.sql`
- `20260427000081_user_invitations.sql`
- `20260427000082_auth_events.sql`

---

## 4. 첫 admin 부트스트랩 (M11 산출물)

```bash
pnpm auth:bootstrap-admin --email admin@algolink.test --password 'StrongPass!2026' --name '관리자'
```

- 이미 admin이 존재하면 skip + exit 0 (멱등)
- 동일 이메일이 instructor/operator로 등록된 경우 `--force-promote` 추가 시 role을 admin으로 UPDATE
- `SUPABASE_SERVICE_ROLE_KEY` 미설정 시 명확한 에러 + exit 1

---

## 5. 검증 (Smoke Test)

1. `pnpm build` → 0 error / 0 critical warning
2. `pnpm tsc --noEmit` → 0 error
3. `pnpm dev` 후 브라우저에서:
   - `/dashboard` 접근 → `/login?next=%2Fdashboard` 로 리다이렉트
   - 로그인 성공 → role-appropriate home 도달
   - jwt.io에 access token 디코드 → `role` claim 존재
4. SQL Editor에서 (admin 토큰):
   ```sql
   SELECT auth.jwt() ->> 'role'; -- 'admin' 반환
   SELECT count(*) FROM public.auth_events; -- 0 이상
   ```

상세 시나리오는 `.moai/specs/SPEC-AUTH-001/acceptance.md` 참조.
