# 역할별 브라우저 E2E 시나리오 카탈로그

AI 에이전트(Claude / Playwright MCP / Chrome DevTools MCP)가 브라우저 자동화로 본 프로젝트를 회귀 검증할 때 따라야 할 시나리오 명세.

- **대상 역할**: `admin` / `operator` / `instructor` / `anon` (미인증)
- **시드 자격증명** (`tests/e2e/helpers/seed-users.ts` 와 1:1 매칭):
  - admin → `admin@algolink.local` / `DevAdmin!2026` → home `/dashboard`
  - operator → `operator@algolink.local` / `DevOperator!2026` → home `/dashboard`
  - operator2 → `operator2@algolink.local` / `DevOperator2!2026` → home `/dashboard`
  - instructor → `instructor1@algolink.local` / `DevInstructor!2026` → home `/me`
- **사전 조건**:
  - `npx supabase start` 가동 + 마이그레이션 (`20260428000020_e2e_seed_phase2.sql` 포함) 적용
  - `pnpm db:seed-users` 실행 (멱등)
  - `pnpm dev` 또는 `pnpm build && pnpm start` 로 Next.js 가동 (port 3000)
  - **globalSetup**: `tests/e2e/global-setup.ts` 가 매 실행 시 settlements 를 pending 으로, notifications 를 read 로 정규화 — AI 에이전트도 시드 reset 책임 동일
- **차단 명령** (`.claude/hooks/moai/handle-pre-tool.sh` 에서 차단): `supabase db reset` — DB 통째로 날리지 말고 globalSetup SQL 으로 부분 reset
- **핵심 파일 참조**:
  - 인증/RBAC 가드: `src/auth/server.ts`, `src/auth/guards.ts`, `src/app/(app)/layout.tsx`
  - 알림 트리거: `src/lib/payouts/mail-stub.ts`, `src/lib/notifications/triggers/*`
  - 라우팅: `src/app/(app)/(admin|operator|instructor)/`

---

## 0. 공통 검증 패턴

모든 시나리오는 다음을 만족해야 한다.

| 항목 | 도구 | 판정 |
|---|---|---|
| 페이지 골격 | `getByRole("main")` | visible |
| 주 헤딩 | `getByRole("heading", { level: 1 })` | 시나리오별 텍스트 매칭 |
| 알림 종 | `getByRole("button", { name: /^알림(, 안읽음 \d+건)?$/ })` | 모든 인증 페이지에서 visible (TopBar) |
| 프로필 메뉴 | `getByRole("button", { name: "프로필 메뉴 열기" })` | 클릭 시 dropdown 열림 → "로그아웃" menuitem 가시 |
| 권한 위반 | URL pathname | 본인 home (`/dashboard` 또는 `/me`) 또는 `/login` 외 금지 |
| FormData 빈 값 | input HTML5 required + zod | redirect 발생하지 않고 폼 유지 |

---

## 1. 익명(anon) 시나리오 — 미인증 사용자

목적: 인증 없이 보호 라우트 접근이 차단되는지 + 로그인 플로우 정상 동작.

### 1.1 보호 라우트 접근 차단

| ID | 동작 | 기대 |
|---|---|---|
| ANON-1 | `GET /dashboard` (쿠키 없음) | 302/307 → `/login?next=/dashboard` |
| ANON-2 | `GET /projects` | 302 → `/login?next=/projects` |
| ANON-3 | `GET /instructors` | 302 → `/login?next=/instructors` |
| ANON-4 | `GET /me` | 302 → `/login?next=/me` |
| ANON-5 | `GET /settlements` | 302 → `/login?next=/settlements` |
| ANON-6 | `GET /clients` | 302 → `/login?next=/clients` |
| ANON-7 | `GET /admin` | 302 → `/login?next=/admin` |

### 1.2 로그인 플로우

| ID | 동작 | 기대 |
|---|---|---|
| ANON-LOGIN-1 | 잘못된 자격증명 (예: `wrong@x.local` / `bad`) 제출 | 통합 에러 메시지(`로그인에 실패했습니다.` 류), URL 은 `/login` 유지 |
| ANON-LOGIN-2 | admin 자격증명 제출 | `/dashboard` 로 redirect, 인증 쿠키 set |
| ANON-LOGIN-3 | operator 자격증명 제출 | `/dashboard` 로 redirect |
| ANON-LOGIN-4 | instructor 자격증명 제출 | `/me` 로 redirect |
| ANON-LOGIN-5 | 로그인 후 쿠키 임의 삭제하고 `/projects` 접근 | `/login?next=/projects` 로 redirect |

---

## 2. instructor (강사) 시나리오

홈: `/me`. 본인 정보 / 이력서 / 정산 내역만 접근 가능.

### 2.1 라우팅 / RBAC

| ID | 동작 | 기대 |
|---|---|---|
| INST-RBAC-1 | `GET /dashboard` | `/me` 로 redirect (operator/admin 전용) |
| INST-RBAC-2 | `GET /clients`, `/clients/new` | `/me` 또는 `/login` 으로 redirect |
| INST-RBAC-3 | `GET /projects/new`, `/instructors/new` | redirect 차단 |
| INST-RBAC-4 | `GET /admin/users`, `/admin/dashboard` | redirect 차단 |
| INST-RBAC-5 | `GET /settlements` | redirect 차단 (강사는 `/me/settlements` 만 허용) |

### 2.2 본인 페이지

| ID | 동작 | 기대 |
|---|---|---|
| INST-HOME-1 | `GET /me` | main role visible, "내 정보" 또는 강사명 헤딩 |
| INST-RESUME-1 | `GET /me/resume` | 7개 섹션 키워드 가시 (학력/경력/자격/기타…) |
| INST-RESUME-2 | `GET /me/resume/export?mask=true` (curl with cookie) | HTTP 200, `Content-Type: application/pdf`, body ≥ 1 KB, magic `%PDF` |
| INST-RESUME-3 | `GET /me/resume/export?mask=false` | HTTP 200, `X-Resume-Mask: 0` |
| INST-PAYOUT-1 | `GET /me/settlements` | 정산 리스트 진입, 본인 정산만 노출 |
| INST-PAYOUT-2 | `GET /me/settings/payout` | 지급 정보 폼 영역 가시 |
| INST-PAYOUT-3 | 저장된 계좌번호가 DOM 에 평문으로 노출되지 않음 | `getByText(/\d{6}-\d{2}-\d{6}/)` 미존재, 마스킹 토큰만 노출 |

### 2.3 알림 수신 (cross-role)

| ID | 동작 | 기대 |
|---|---|---|
| INST-NOTIFY-1 | operator 가 본인 강사의 정산을 "정산 요청" 으로 전환 | instructor `/me` reload 시 bell aria-label 의 안읽음 카운트 +1 |
| INST-NOTIFY-2 | bell 클릭 → dropdown 최상단 항목 클릭 | navigation 후 reload 시 안읽음 카운트 -1 (mark-as-read) |
| INST-NOTIFY-3 | `/notifications` 직접 진입 | main 가시, 본인 알림만 노출 (RLS) |

### 2.4 보안

| ID | 동작 | 기대 |
|---|---|---|
| INST-SEC-1 | `/me/resume/export` 를 operator 쿠키로 호출 | HTTP 403 "강사 본인만 …" |
| INST-SEC-2 | 다른 강사 ID 의 정산 직접 접근 (`/me/settlements/{타강사 settlement id}`) | RLS 로 404 또는 빈 결과 |

---

## 3. operator (운영자) 시나리오

홈: `/dashboard`. 강사/프로젝트/고객사/정산 운영. /admin 진입 차단.

### 3.1 라우팅 / RBAC

| ID | 동작 | 기대 |
|---|---|---|
| OP-RBAC-1 | `GET /me` | `/dashboard` 로 redirect |
| OP-RBAC-2 | `GET /admin/users` | `/dashboard` 로 redirect (admin 전용) |
| OP-RBAC-3 | `GET /admin/dashboard` | redirect 차단 |
| OP-RBAC-4 | "프로필 메뉴 열기" 클릭 → "로그아웃" menuitem 클릭 | `/login` 으로 이동, 인증 쿠키 invalidate |

### 3.2 대시보드

| ID | 동작 | 기대 |
|---|---|---|
| OP-DASH-1 | `GET /dashboard` | main + KPI 4종 카드 |
| OP-DASH-2 | KPI 값은 숫자 또는 em-dash(데이터 없음) | 정규식 매칭 |
| OP-DASH-3 | 칸반 5개 컬럼 (제안/검토/진행/완료/보류) 헤더 가시 | 각 컬럼 ≥ 0 카드 |
| OP-DASH-4 | 캘린더 진입 링크 클릭 | `/calendar` 또는 schedule 페이지로 이동 |

### 3.3 프로젝트 (CRUD + AI 매칭)

| ID | 동작 | 기대 |
|---|---|---|
| OP-PROJ-LIST-1 | `GET /projects` | 리스트 가시 |
| OP-PROJ-LIST-2 | "신규 프로젝트" 버튼 클릭 | `/projects/new` 이동 |
| OP-PROJ-LIST-3 | `?q=foo` 검색 | URL 에 q 파라미터 보존 |
| OP-PROJ-LIST-4 | 고객사명 only 검색 | 해당 고객사의 프로젝트 행 노출 (AC-8) |
| OP-PROJ-CREATE-1 | title 미입력 + clientId 선택 후 등록 | `/projects/new` 유지 (HTML5/zod 차단) |
| OP-PROJ-CREATE-2 | title="X" + clientId 첫 옵션 + 종료일 < 시작일 | alert "종료일은 시작일과 같거나 늦어야 합니다." |
| OP-PROJ-CREATE-3 | title + clientId 만 채우고 등록 | `/projects/{uuid}` 로 redirect, main visible (날짜는 비워도 통과 — 버그 #2 fix 회귀) |
| OP-PROJ-CREATE-4 | title 에 `<script>window.__xss=true</script>` 입력 | 등록 후 상세에서 페이로드는 텍스트로만 노출, `window.__xss === undefined` |
| OP-PROJ-DETAIL-1 | 미배정 프로젝트(`?status=assignment_review`) 진입 | "추천 실행" 버튼 visible |
| OP-PROJ-DETAIL-2 | "추천 실행" 클릭 | 60초 내 `getByRole("list", { name: "강사 추천 후보" })` 또는 룰 기반 폴백 alert/status 가시 |
| OP-PROJ-DETAIL-3 | 후보 ≥ 1, ≤ 3 | 1-클릭 "배정 요청" 클릭 시 "배정됨"/"배정 요청됨" 배지 가시 |
| OP-PROJ-DETAIL-4 | 이미 배정된 프로젝트 (`40000000-...001`) 진입 | "추천 실행" 버튼 미노출 |

### 3.4 강사 관리

| ID | 동작 | 기대 |
|---|---|---|
| OP-INST-LIST-1 | `GET /instructors` | 리스트 + 등록 버튼 가시 |
| OP-INST-LIST-2 | 데이터 테이블 행 ≥ 1 | 시드 강사 노출 |
| OP-INST-LIST-3 | 정렬 가능 컬럼 헤더 가시 | aria-sort 또는 button role |
| OP-INST-CREATE-1 | "강사 등록" → 폼 → 필수값 입력 → 저장 | `/instructors` 리스트로 복귀 |
| OP-INST-DETAIL-1 | 강사 행 클릭 | `/instructors/{uuid}` 진입, main visible |

### 3.5 고객사 관리

| ID | 동작 | 기대 |
|---|---|---|
| OP-CLIENT-LIST-1 | `GET /clients` | 헤딩 "고객사 관리" + 등록 버튼 |
| OP-CLIENT-CREATE-1 | companyName 미입력 + contact 만 채워 등록 | `/clients/new` 유지 |
| OP-CLIENT-CREATE-2 | companyName=`E2E-CLIENT-{ts}` + contact-name-0 입력 → 저장 | `/clients` 또는 `/clients/{id}` 로 이동, `?q=...` 검색 시 정확히 1건 매치 |

### 3.6 정산 / 매출매입

| ID | 동작 | 기대 |
|---|---|---|
| OP-PAYOUT-1 | `GET /settlements?status=pending` | pending 행 ≥ 1 노출 |
| OP-PAYOUT-2 | 첫 행 → 상세 → "정산 요청" 클릭 (confirm 자동 수락) | 상태 `requested`, "정산 요청" 텍스트 visible |
| OP-PAYOUT-3 | "입금 확인" 클릭 → "정산 완료" 입력 처리 | 상태 `paid`, 매출매입 위젯에 반영 |
| OP-PAYOUT-4 | paid 거래에 다시 "정산 요청" 시도 | 거부 (SPEC-PAYOUT-001 §M5 동결) |

### 3.7 알림 (operator 본인은 settlement_requested 의 수신자가 아님)

| ID | 동작 | 기대 |
|---|---|---|
| OP-NOTIFY-1 | operator 가 정산 요청 트리거 후 본인 bell 카운트 | 변동 없음 (수신자는 instructor) |
| OP-NOTIFY-2 | (cross-role) 별도 instructor 컨텍스트에서 bell +1 | INST-NOTIFY-1 와 동일 검증 |

---

## 4. admin (관리자) 시나리오

홈: `/dashboard`. 회원/권한/매출매입 집계 + 운영자 권한 모두 포함.

### 4.1 admin 전용

| ID | 동작 | 기대 |
|---|---|---|
| ADMIN-USERS-1 | `GET /admin/users` | "회원 / 권한" 헤딩, 4개 행(admin/operator/operator2/instructor) |
| ADMIN-USERS-2 | role 필터 적용 (`?role=operator&is_active=true`) | operator 만 노출 |
| ADMIN-USERS-3 | 보조 operator 행에서 "비활성화" 버튼 클릭 | 행에 "비활성" 표시 |
| ADMIN-USERS-4 | 비활성화한 계정으로 새 컨텍스트 로그인 | 로그인 거부 또는 로그인 직후 자동 로그아웃 |
| ADMIN-USERS-5 | 비활성화 후 "활성화" 클릭 → 원복 | 행에 "활성" 표시 |
| ADMIN-USERS-SELF-1 | admin 본인 행에 "비활성화" 버튼 | **미노출** (SPEC-ADMIN-001 §B-8 self-lockout 차단) |
| ADMIN-USERS-SELF-2 | admin 본인 행에 "역할 변경" 버튼 | 미노출 또는 disabled |

### 4.2 매출매입 (admin 만)

| ID | 동작 | 기대 |
|---|---|---|
| ADMIN-AGG-1 | admin dashboard 의 매출매입 위젯 | YTD 매출/매입/수익 KPI 노출 |
| ADMIN-AGG-2 | 정산이 paid 로 전환된 직후 위젯 reload | 해당 금액이 합계에 반영 |

### 4.3 admin 도 operator 작업 수행 가능

operator 시나리오 OP-PROJ-*, OP-INST-*, OP-CLIENT-*, OP-PAYOUT-* 전부 admin 으로도 통과해야 한다 (가드: `requireRole(["operator", "admin"])`).

---

## 5. 공통 — 입력 검증 / 보안

| ID | 동작 | 기대 |
|---|---|---|
| SEC-XSS-1 | 모든 사용자 입력 필드 (title/companyName/notes/contact-name) 에 `<script>` 페이로드 | 텍스트로 escape, JS 실행 없음 |
| SEC-SQL-1 | 검색 q 파라미터에 `'; DROP TABLE projects; --` | 정상 검색 (결과 0건), DB 무손상 |
| SEC-CSRF-1 | Server Action 이 next-action signature 검증 | (Next.js 자동 보호) |
| SEC-AUTH-EXPIRY-1 | 만료된 JWT 쿠키로 보호 라우트 접근 | `/login?next=...` 로 redirect |
| SEC-RLS-1 | instructor 가 다른 강사의 settlement detail 접근 | 404 또는 빈 결과 |
| SEC-RLS-2 | operator 가 admin RLS 정책 영역(`auth.users`) 직접 select | 거부 |
| VAL-DATE-1 | 빈 startAt/endAt 으로 프로젝트 등록 | 통과 (둘 다 optional, 버그 #2 회귀) |
| VAL-DATE-2 | startAt > endAt | "종료일은 시작일과 같거나 늦어야 합니다." alert |
| VAL-REQ-1 | required 필드 (title, clientId, companyName, contact name) 누락 | 폼 유지, fieldErrors 노출 |

---

## 6. 멀티-탭 / 동시성 (선택)

| ID | 동작 | 기대 |
|---|---|---|
| CONC-1 | operator A + operator B 가 같은 프로젝트에 1-클릭 배정 동시 시도 | 한쪽만 성공, 다른 쪽은 "이미 배정됨" 에러 |
| CONC-2 | 동일 강사에 대해 2 개 프로젝트가 시간 충돌하는 schedule 입력 | EXCLUSION 제약 거부 (SPEC-DB-001 SCHED-01) |
| CONC-3 | settlement 를 두 탭에서 동시 "정산 요청" | 한쪽만 성공, 다른 쪽은 status mismatch 에러 |

---

## 7. AI 에이전트 자동화 가이드

### 7.1 도구 추천

| 작업 | 권장 도구 |
|---|---|
| 풀 회귀 | `pnpm exec playwright test --reporter=list` |
| 단일 시나리오 | `pnpm exec playwright test --grep "<제목 패턴>"` |
| 진단/디버그 | `--trace on`, `playwright show-trace test-results/.../trace.zip` |
| 수동 인증 후 cookie curl | `jq -r '.cookies | map("\(.name)=\(.value)") | join("; ")' tests/e2e/.auth/<role>.json` |
| DB 직접 조회 | `docker exec supabase_db_algolink-mvp psql -U postgres -d postgres -c "..."` |

### 7.2 자율 fix-loop 알고리즘

1. **baseline**: 풀 회귀 실행 → `passed / failed / skipped` 카운트 캡처
2. **triage**: 실패 / skip 항목별 사유 분석
   - skip 사유가 시드/UI 셀렉터/env 변수 → 테스트 측 수정
   - skip 사유가 제품 동작(404/500/RLS) → 제품 수정
3. **fix**: 필요 시 worktree 격리 subagent (`expert-debug`, `expert-backend`) 호출
4. **verify**: 단일 시나리오 재실행 → PASS 확인 → 풀 회귀 재실행
5. **iterate**: 실패 0 + skip 0 까지 반복 (사용자 명시 종료 기준)

### 7.3 AI 가 다루기 까다로운 부분

| 영역 | 권장 |
|---|---|
| Radix Select (shadcn) | trigger click → `getByRole("listbox")` toBeVisible 대기 → option click → listbox toBeHidden 대기 |
| Server Action redirect | `page.waitForURL(/path/, { timeout: 30_000 })` |
| Next.js 라우터/SSR 캐시 | `?_cb=${Date.now()}` cache-bust 쿼리 + 폴링 (재시도 5회) |
| Supabase JWT 만료 | 테스트 setup project 가 매 실행 시 fresh storageState 갱신 — 세션 만료 의심되면 setup 재실행 |
| dialog confirm | `page.once("dialog", (d) => d.accept())` 를 click 직전 등록 |
| 비결정성 시드 | globalSetup 으로 settlements/notifications reset, project 는 `?status=assignment_review` 등 명시 필터 사용 |

### 7.4 AI 가 절대 하면 안 되는 것

- `supabase db reset` (hook 차단됨)
- 실제 production DB 에 globalSetup SQL 실행 (`DATABASE_URL` 가드만 있음 — 항상 로컬 supabase URL 인지 확인)
- 시드 자격증명 변경 (`operator@algolink.local` 등은 다른 spec 가 의존)
- `tests/e2e/.auth/*.json` 직접 편집 (auth.setup.ts 가 자동 생성)

---

## 8. 시나리오 → 코드 매핑

| 시나리오 ID 범위 | 구현 spec 파일 |
|---|---|
| ANON-1..7 | `tests/e2e/auth.spec.ts` (anon redirects) |
| ANON-LOGIN-1..5 | `tests/e2e/auth.spec.ts` |
| INST-RBAC-* | `tests/e2e/rbac-cross-role.spec.ts`, `auth.spec.ts` |
| INST-HOME-*, INST-RESUME-* | `tests/e2e/me-resume.spec.ts`, `auth.spec.ts` |
| INST-PAYOUT-* | `tests/e2e/me-payouts.spec.ts` |
| INST-NOTIFY-1..2 | `tests/e2e/phase2-notify.spec.ts` |
| INST-NOTIFY-3 | `tests/e2e/projects.spec.ts` (Notification visibility) |
| OP-RBAC-* | `tests/e2e/rbac-cross-role.spec.ts`, `auth.spec.ts` |
| OP-DASH-* | `tests/e2e/dashboard.spec.ts` |
| OP-PROJ-* | `tests/e2e/projects.spec.ts`, `instructors.spec.ts` (AI matching) |
| OP-PROJ-CREATE-1..4 | `tests/e2e/input-validation.spec.ts`, `projects.spec.ts` |
| OP-INST-* | `tests/e2e/instructors.spec.ts` |
| OP-CLIENT-* | `tests/e2e/phase2-client.spec.ts`, `input-validation.spec.ts` |
| OP-PAYOUT-* | `tests/e2e/phase2-payout.spec.ts` |
| ADMIN-USERS-* | `tests/e2e/phase2-admin.spec.ts` |
| ADMIN-USERS-SELF-* | `tests/e2e/admin-self-lockout.spec.ts` |
| SEC-XSS-1, VAL-* | `tests/e2e/input-validation.spec.ts` |
| CONC-* | **미구현** — 향후 spec 추가 시 본 카탈로그 ID 사용 |

---

**Maintenance**: 본 문서는 `tests/e2e/*.spec.ts` 변경과 동기화 유지. 새 시나리오 추가 시 §8 매핑 표 갱신 + 시나리오 ID 부여(naming: `<역할>-<도메인>-<일련번호>`).
