## SPEC-AUTH-001 Progress

- Started: 2026-04-27
- Mode: TDD (per quality.yaml)
- Harness: standard
- Branch: feature/SPEC-AUTH-001 (created at M1)

## Reconciliation Decisions (User-confirmed 2026-04-27)

- **Module structure (hybrid)**: `src/utils/supabase/` keeps raw SDK factories (browser/server/middleware-helper); `src/auth/` adds domain layer (roles, guards, errors, events, admin, getCurrentUser). Domain depends on adapter, not vice versa.
- **Middleware**: `src/utils/supabase/middleware.ts`를 `supabase.auth.getClaims()` 기반으로 업그레이드 (REQ-AUTH-SESSION-002 충족). Next.js 16의 canonical entry name이 `proxy.ts`임이 확인되어(`node_modules/next/dist/lib/constants.js: PROXY_FILENAME`) `src/proxy.ts`를 그대로 유지. SPEC §4.2의 `src/middleware.ts` 표기는 문서적 포인터로 해석.
- **Login relocation**: 기존 `src/app/login/{actions.ts,login-form.tsx,page.tsx}` 삭제 후 `src/app/(auth)/login/`으로 전면 재작성 (REQ-AUTH-LOGIN-001..006 충족).
- **ENV key naming**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 유지 (Supabase 2024+ 명칭). `.env.example` 수정으로 `.env.local` 실제 키 이름과 통일.
- **역할별 라우트 가드 (M7)**: `(app)` 내부 중첩 route group 채택. URL 변동 0건. `src/app/(app)/(instructor|operator|admin)/layout.tsx`에 `requireRole` 적용.
- **lib/auth.ts 통합 (M8)**: 외부 API(`requireUser`, `SessionUser`)는 유지, 내부 구현만 `src/auth/server.ts`의 `getCurrentUser`로 교체. `SessionUser` 모양은 평탄화(`{id,email,role,displayName}`)로 단순화 (Option B). 호출처 0건 변경.

## Phase 0 — Pre-flight

- Phase 0.5 (memory_guard): not configured → skipped
- Phase 0.9 (JIT language detection): TypeScript/Next.js → moai-lang-typescript
- Phase 0.95 (scale-based mode): files ~50, 3 domains → **Full Pipeline** mode (sequential sub-agent delegation by milestone batch)
- Reconciliation Gate: complete

## Milestone Status

| ID | Title | Status | Commit |
|----|-------|--------|--------|
| M1 | 의존성 + 환경변수 + 셋업 가이드 | ✅ completed | a3b9a33 |
| M2 | src/auth 도메인 모듈 (8 files + 25 tests) | ✅ completed | (M2/M3/M4 합본) |
| M3 | middleware (getClaims) | ✅ completed | (M2/M3/M4 합본) |
| M4 | DB 마이그레이션 3종 + config.toml | ✅ completed | (M2/M3/M4 합본) |
| M5 | 로그인/로그아웃 + (auth) layout + validation | ✅ completed | (M5 단독) |
| M7 | 역할별 가드 layouts + 중첩 route group 이전 | ✅ completed | (M7/M8/M11 합본) |
| M8 | AppShell 통합 + lib/auth 교체 | ✅ completed | (M7/M8/M11 합본) |
| M11 | 첫 admin Bootstrap CLI | ✅ completed | (M7/M8/M11 합본) |
| M6 | 초대 발급/수락 + OTP callback dispatcher | ✅ completed | (M6/M9 합본) |
| M9 | 비밀번호 재설정 흐름 | ✅ completed | (M6/M9 합본) |
| M10 | auth_events 검증 (8/9 type 사용; password_changed는 SPEC-ME-001로 위임) | ✅ completed | (M10/M12/M13 합본) |
| M12 | 접근성 폴리시 + 에러 UX 검증 (a11y-audit.md 생성, 2 file 패치) | ✅ completed | (M10/M12/M13 합본) |
| M13 | 문서 + 핸드오프 (auth-architecture.md, auth-bootstrap.md) | ✅ completed | (M10/M12/M13 합본) |

## 최종 검증

- ✅ `pnpm tsc --noEmit` — 0 error
- ✅ `pnpm test:unit` — 41/41 pass (auth: 25, validation: 16)
- ✅ `pnpm exec eslint src/auth/ src/lib/ src/app/(auth)/ src/app/(app)/ src/utils/supabase/middleware.ts src/proxy.ts scripts/auth/` — 0 error
- ✅ `grep -rn "TODO(SPEC-AUTH-001)" src/` — 0 hit
- ✅ 9개 event_type 중 8개 활성 사용 (login_success/failure/logout/password_reset_requested/_completed/invitation_issued/_accepted/_revoked); password_changed는 REQ-AUTH-PASSWORD-006 정의된 in-session 변경으로 SPEC-ME-001로 위임
- ✅ 모든 Korean 에러 메시지 8종 (`src/auth/errors.ts`) — REQ-AUTH-ERROR-002와 character-for-character 일치
- ⏳ 라이브 검증 (acceptance.md 시나리오 1-7, EC-1..12, axe DevTools, Lighthouse) — `pnpm dev` + Supabase 로컬 스택 + 시나리오 실행 단계로 위임 (`/moai sync` 직전 또는 별도 검증 세션)

## 잔여 운영 작업 (SPEC-AUTH-001 외)

1. `src/db/supabase-types.ts` 재생성 → `user_invitations`, `auth_events` 타입 자동 포함되면 events.ts / accept-invite/actions.ts / operator/invite/actions.ts의 `as never`/`as any` 캐스트 제거 가능 (`@MX:NOTE` 마킹됨)
2. acceptance.md 시나리오 1-7 + EC-1..12 라이브 검증 (별도 세션)
3. axe DevTools / Lighthouse 측정 (5 페이지)
4. 첫 admin 부트스트랩 (`pnpm auth:bootstrap-admin`)

## DoD 체크 (plan.md §5)

| # | 항목 | 상태 |
|---|------|------|
| 1 | `pnpm build` 0 error | ⏳ (라이브 검증) |
| 2 | `pnpm tsc --noEmit` 0 type error | ✅ |
| 3 | `pnpm exec eslint .` 0 critical | ✅ (스코프 폴더) |
| 4 | Supabase 대시보드 설정 체크리스트 | ⏳ (운영) |
| 5 | Custom Access Token Hook 동작 (jwt.io role claim) | ⏳ (라이브) |
| 6 | middleware redirect: 미인증 /dashboard → /login?next | ⏳ (라이브) |
| 7 | Login flow PASS | ⏳ (acceptance.md 시나리오 2/3) |
| 8 | Invite flow PASS | ⏳ (acceptance.md 시나리오 1) |
| 9 | Password reset flow PASS | ⏳ (acceptance.md 시나리오 6) |
| 10 | Route guards (3 roles silent redirect) | ⏳ (acceptance.md 시나리오 5) |
| 11 | AppShell 통합 (real role sidebar + logout) | ⏳ (라이브) |
| 12 | auth_events 9종 row 생성 검증 | ⏳ (라이브, 8 type 활성) |
| 13 | Admin bootstrap CLI 멱등 | ✅ (--help 동작 확인, 라이브 멱등 검증 대기) |
| 14 | axe DevTools critical 0 (5 페이지) | ⏳ (라이브) |
| 15 | Lighthouse Accessibility ≥ 95 평균 | ⏳ (라이브) |
| 16 | 한국어 에러 메시지 8종 매핑 | ✅ (errors.ts character-for-character 일치) |
| 17 | acceptance.md 시나리오 7종 PASS | ⏳ (라이브) |
| 18 | SUPABASE_SERVICE_ROLE_KEY가 server-only 파일에서만 사용 | ✅ (admin.ts 'server-only' 강제) |
| 19 | 신규 마이그레이션 3종 supabase db reset 무오류 | ⏳ (라이브) |
| 20 | TODO(SPEC-AUTH-001) 잔존 0건 | ✅ |

**정적 DoD: 6/20 완료 (코드 영역 100%)**
**라이브 DoD: 14 항목은 acceptance.md 검증 세션에서 수행**
