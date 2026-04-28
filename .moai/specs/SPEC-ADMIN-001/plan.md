---
spec_id: SPEC-ADMIN-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
---

# SPEC-ADMIN-001 — 구현 계획

## 1. 개요

본 계획은 SPEC-ADMIN-001의 두 기능(F-301 회원/권한, F-302 매출매입 집계)을 단일 머지 단위로 묶어 admin 메뉴 영역을 한 번의 사이클로 완성하는 것을 목표로 한다. 구현 순서는 데이터 → 도메인 → UI → 테스트 → 통합 검증 순이다.

## 2. 마일스톤 (우선순위 기반, 시간 추정 없음)

| 우선순위 | 단계 | 산출물 |
| --- | --- | --- |
| P0 | M1 — 데이터/마이그레이션 | `users.is_active` 컬럼 + 인덱스 + COMMENT, `pnpm db:verify` 통과 |
| P0 | M2 — F-301 도메인 | `src/lib/admin/users/` queries/list-query/audit/validation + 단위 테스트 |
| P0 | M3 — F-301 미들웨어 차단 | `src/middleware.ts` 또는 auth callback에서 `is_active=false` 차단 + 회귀 테스트 |
| P1 | M4 — F-301 UI | `/admin/users` 리스트, `/admin/users/[id]` 상세, Server Actions |
| P1 | M5 — F-302 도메인 | `src/lib/admin/aggregations/` 6개 모듈 + 단위 테스트(픽스처) |
| P1 | M6 — F-302 UI | `/admin/dashboard` 페이지 + KPI/Trend/Top-N 컴포넌트 |
| P2 | M7 — 통합 검증 | TRUST 5 게이트, lint/typecheck, 수동 시나리오 점검 |

## 3. 작업 분해

### M1. 데이터/마이그레이션

1. `supabase/migrations/20260428120000_admin_user_active.sql` 작성 (spec.md §5.1)
2. `pnpm db:reset && pnpm db:verify` 실행하여 18개 검증 케이스 모두 PASS 확인 (LESSON-002 적용)
3. Supabase 타입 재생성: `pnpm supabase gen types typescript --local > src/types/database.ts`
4. `users` 테이블 타입에 `is_active: boolean` 노출 확인

### M2. F-301 도메인 레이어

`src/lib/admin/users/` 신규 디렉터리:

1. `validation.ts`
   - `updateRoleInput`: `{ targetUserId: uuid, newRole: user_role enum }` + actor 본인 lockout 차단 refine
   - `setActiveInput`: `{ targetUserId: uuid, nextActive: boolean }` + 본인 비활성화 차단 refine
2. `queries.ts`
   - `listUsers(params)`: `role` / `is_active` / `email`(LIKE) 필터, `limit/offset`
   - `getUserById(id)`: 사용자 + 최근 5건 `auth_events` + `user_invitations` 상태
   - `updateUserRole(actorId, input)`: trx 안에서 SELECT → UPDATE → audit.log
   - `setUserActive(actorId, input)`: 동일 패턴
3. `list-query.ts`: `URLSearchParams` ↔ 도메인 입력 매퍼
4. `audit.ts`: `logRoleChange`, `logActiveChange` — 구조화 콘솔 로그(JSON). 추후 audit_log 테이블 추가 시 동일 시그니처로 교체 가능하도록 함수 추출.
5. `__tests__/`
   - `validation.test.ts`: 자기 자신 lockout 케이스
   - `queries.test.ts`: 필터/페이지네이션 조합, GENERATED 컬럼 미참조 확인
   - `audit.test.ts`: 로그 포맷 스냅샷

### M3. 미들웨어 차단

1. `src/middleware.ts` (또는 auth callback)에서 세션 사용자 조회 시 `users.is_active` 함께 SELECT
2. `is_active = false`이면 세션 종료 + `/login?error=deactivated`로 리다이렉트
3. 단위/통합 테스트:
   - 비활성 사용자 로그인 시도 → 차단
   - 활성 사용자 → 정상 통과
   - admin 본인 비활성화 시도 → 도메인 단계에서 거부(M2에서 처리)

### M4. F-301 UI/Server Actions

1. `src/app/(app)/(admin)/admin/users/page.tsx` 교체
   - SSR에서 `requireRole(['admin'])`
   - 필터 폼(role/is_active/email) + 결과 테이블 + 페이지네이션
2. `src/app/(app)/(admin)/admin/users/[id]/page.tsx` 신규
   - 기본 정보 / 최근 로그인 5건 / 초대 상태 / 역할 변경 폼 / 비활성화 토글(자기 자신은 비표시)
3. Server Actions
   - `[id]/role/actions.ts`: `updateUserRole` 호출. Server Action 진입에서 `requireRole(['admin'])` 재검사.
   - `[id]/deactivate/actions.ts`: `setUserActive` 호출. 동일 가드.
4. UI 컴포넌트
   - `src/components/admin/users/`: `user-table.tsx`, `role-select.tsx`, `active-toggle.tsx`, `login-history.tsx`
   - 모두 shadcn/ui + Tailwind 토큰 사용. 신규 디자인 시스템 도입 없음.

### M5. F-302 집계 도메인

`src/lib/admin/aggregations/` 신규 디렉터리:

1. `period.ts`: `Period` 타입(`{ kind: 'month'|'quarter'|'year', anchor: Date }`) + `toRange(period) → { from, to }` 헬퍼
2. `revenue.ts`: `sumRevenue(period)` — `SELECT COALESCE(SUM(business_amount_krw),0) FROM projects WHERE deleted_at IS NULL AND created_at >= $1 AND created_at < $2`
3. `cost.ts`: `sumCost(period)` — `settlements`에서 `status='paid'`, `paid_at` 범위
4. `margin.ts`: `sumMargin(period)` — `projects.margin_krw` SUM
5. `by-month.ts`: 최근 6개월 `(month, revenue, cost, margin)` 시계열
6. `by-client.ts`: `getTopClients(limit, period)` — `client_companies` JOIN, 매출 Top-N
7. `by-instructor.ts`: `getTopInstructors(limit, period)` — `users` JOIN(role='instructor'), 정산 합계 Top-N
8. `queries.ts`: 위 함수들의 단일 진입점 + 결과 캐싱은 도입하지 않음(단순 SUM/GROUP BY 단일 라운드트립)
9. `__tests__/`
   - 각 함수에 대해 픽스처 데이터 기반 단위 테스트 작성
   - 빈 결과(데이터 없음)에서 0 반환 보장
   - GENERATED 컬럼은 SELECT만 — INSERT/UPDATE 미사용 검사(grep 가능 패턴)

### M6. F-302 UI

1. `src/app/(app)/(admin)/admin/dashboard/page.tsx` 신규
   - SSR에서 `requireRole(['admin'])` + URL `period` 쿼리 파싱
   - KPI 카드 3종(매출/매입/마진) + 추이 차트 + 고객사 Top-5 + 강사 Top-5
2. UI 컴포넌트 `src/components/admin/dashboard/`
   - `period-toggle.tsx`(월/분기/연도, URL 상태)
   - `kpi-card.tsx`(라벨, 값, 전기 대비 변화)
   - `trend-chart.tsx`(기존 차트 라이브러리 또는 SVG 단순 막대)
   - `top-list.tsx`(이름, 금액, 비율 바)

### M7. 통합 검증

1. TRUST 5 게이트
   - Tested: M2/M5 단위 테스트 + Playwright 회귀 시나리오 1건(admin 로그인 → /admin/dashboard → KPI 카드 노출)
   - Readable: 함수/변수명 영문, 컴포넌트 PascalCase
   - Unified: ESLint/Prettier 통과
   - Secured: 모든 라우트·Server Action에 `requireRole(['admin'])`. 본인 lockout 차단.
   - Trackable: 커밋 메시지에 `SPEC-ADMIN-001` 포함
2. 수동 시나리오
   - admin이 instructor 사용자 비활성화 → 해당 사용자 로그인 시 차단 확인
   - admin이 본인 비활성화 시도 → UI에서 토글 비표시 확인
   - `/admin/dashboard` 분기/연도 토글 → 위젯 재집계 확인

## 4. 기술 접근

- 데이터 접근: Supabase JS client, Server Actions 내부에서 `createSupabaseServerClient()` 사용. SPEC-AUTH-001과 동일.
- 폼 처리: React 19 `useActionState` + Zod 스키마 검증. 클라이언트와 서버 양쪽에서 동일 스키마 사용.
- 라우팅: App Router 그룹 `(admin)` 하위에 모두 배치. 별도 미들웨어 추가 없이 layout.tsx에서 가드.
- 차트: 단순 SVG로 처리(외부 라이브러리 신규 도입 회피). 향후 recharts 도입 필요 시 SPEC 분리.
- 집계 쿼리: 단일 SELECT 문에서 `COALESCE(SUM(...), 0)`. JOIN은 Top-N에서만. 임베디드 OR 회피, 단일 범위 조건만 사용.

## 5. 위험 및 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 마이그레이션 적용 시 RLS 회귀 | admin 외 사용자가 자기 정보 미조회 | `pnpm db:verify` 18케이스 그대로 PASS 확인. 기존 정책 변경 없음. |
| 미들웨어에서 `users` 추가 SELECT로 인한 지연 | 모든 요청 100~200ms 증가 가능 | 미들웨어는 세션 토큰의 `app_metadata`에 `is_active`를 포함하도록 access token hook 확장 검토(후속). 본 SPEC에서는 콜드 SELECT 1회만 추가. |
| GENERATED 컬럼 INSERT 시도 | DB 에러 | 도메인 함수에서 SELECT 전용 보장 + 단위 테스트로 grep 검사 |
| Top-N 쿼리에서 강사/고객사 JOIN 누락 | 표시 이름 비어있음 | LEFT JOIN + 빈 이름은 "(미확인)"로 표기 |

## 6. 검증 체크리스트

- [ ] 마이그레이션 `20260428120000_admin_user_active.sql` 적용 후 `pnpm db:verify` PASS
- [ ] `users.is_active` Supabase 타입에 노출
- [ ] `/admin/*` 모든 라우트에서 비-admin 접근 시 `/dashboard` 리다이렉트
- [ ] Server Action 진입에서 admin 가드 재검사
- [ ] admin 본인 role 변경/비활성화 시도 차단(UI + Zod + Server Action 3단)
- [ ] 비활성 사용자 로그인 → `/login?error=deactivated`
- [ ] `/admin/dashboard` 월/분기/연도 토글 시 위젯 재집계
- [ ] GENERATED 컬럼은 SELECT만 사용
- [ ] 빈 기간 → 0원 표시(에러 X)
- [ ] EARS 11개 항목 → acceptance.md 테스트와 1:1 매핑
