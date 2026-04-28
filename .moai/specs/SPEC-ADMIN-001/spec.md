---
id: SPEC-ADMIN-001
version: 1.0.0
status: completed
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-ADMIN-001 — 관리자: 회원/권한 관리(F-301) + 매출매입 집계 대시보드(F-302)

## HISTORY

- 2026-04-28: 초안 작성. F-301(회원/권한)과 F-302(매출매입 집계)를 단일 SPEC으로 묶어 admin 메뉴 영역을 한 번의 사이클로 구축. SPEC-AUTH-001(역할 가드), SPEC-DB-001(스키마), SPEC-PROJECT-001(projects), SPEC-DASHBOARD-001 위에 적층.

## 1. 목적과 배경

### 1.1 목적

`product.md`의 `F-301`(회원/권한 관리)과 `F-302`(매출매입 집계 대시보드)를 admin 사용자 전용 화면으로 구현한다. 두 기능은 모두 `requireRole(['admin'])` 가드 하에서만 접근 가능하며, 운영자(operator)·강사(instructor)에게는 노출되지 않는다.

- `F-301`: admin이 시스템 사용자 목록을 조회하고, 역할(`user_role`)을 변경하거나 활성/비활성 상태를 토글한다.
- `F-302`: admin이 선택한 기간(월/분기/연도) 동안의 매출(projects)·매입(settlements)·마진을 KPI 카드와 추이/상위 N 위젯으로 확인한다.

### 1.2 배경

- 현재 `src/app/(app)/(admin)/admin/users/page.tsx`는 자리표시(placeholder) 카드만 존재. 실제 회원 관리 로직이 없어 admin이 운영 중 사용자 권한을 변경할 수단이 없다.
- 매출/매입 집계 화면은 아직 라우트조차 없다. `projects.business_amount_krw`, `settlements.instructor_fee_krw`/`profit_krw`, `projects.margin_krw`(GENERATED) 같은 원천 컬럼은 SPEC-DB-001로 이미 적재되어 있으므로, 단순 SUM/GROUP BY로 KPI 산출이 가능하다.
- `users` 테이블에는 활성/비활성 상태를 표현할 컬럼이 없다. 본 SPEC에서 `is_active boolean` 컬럼을 신규 도입한다(추가 마이그레이션 1건).

## 2. 범위

### 2.1 In Scope

#### F-301: 회원/권한 관리

- 라우트
  - `src/app/(app)/(admin)/admin/users/page.tsx`: 회원 리스트 + 역할 필터 + 활성 상태 필터 + 이메일 검색 + 페이지네이션
  - `src/app/(app)/(admin)/admin/users/[id]/page.tsx`: 회원 상세(기본 정보, 최근 로그인 이력, 초대 상태, 역할 변경 폼, 비활성화 토글)
  - `src/app/(app)/(admin)/admin/users/[id]/role/actions.ts`: 역할 변경 Server Action
  - `src/app/(app)/(admin)/admin/users/[id]/deactivate/actions.ts`: `is_active` 토글 Server Action
- 도메인 레이어 (`src/lib/admin/users/`)
  - `queries.ts`: `listUsers`, `getUserById`, `updateUserRole`, `setUserActive`
  - `list-query.ts`: `role` / `is_active` / `email` 필터 + `limit/offset` 페이지네이션
  - `audit.ts`: 역할 변경/비활성화 시 구조화 콘솔 로그 기록(`actor_id`, `target_id`, `before`, `after`, `at`). 향후 `audit_log` 테이블로 확장 가능한 인터페이스 유지.
  - `validation.ts`: Zod 스키마(`updateRoleInput`, `setActiveInput`). admin 자기 자신의 role을 admin 외 값으로 변경하는 시도는 스키마 단계에서 거부.
  - `__tests__/*.test.ts`: 단위 테스트
- 데이터베이스
  - 신규 마이그레이션 `supabase/migrations/20260428120000_admin_user_active.sql`
    - `users.is_active boolean NOT NULL DEFAULT true`
    - `idx_users_is_active`(부분 인덱스: `WHERE is_active = false`)
    - `COMMENT ON COLUMN users.is_active`
- 미들웨어 연동
  - `src/middleware.ts` 또는 auth callback에서 로그인 직후 `users.is_active = false`이면 `/login?error=deactivated`로 차단(본 SPEC 범위에 포함).

#### F-302: 매출매입 집계 대시보드

- 라우트
  - `src/app/(app)/(admin)/admin/dashboard/page.tsx`: 기간 토글(월/분기/연도) + KPI 카드 3종(매출/매입/마진) + 최근 6기간 추이 + 고객사 Top-5 + 강사 Top-5
- 도메인 레이어 (`src/lib/admin/aggregations/`)
  - `revenue.ts`: `sumRevenue(period)` — `projects.business_amount_krw` SUM (`deleted_at IS NULL`)
  - `cost.ts`: `sumCost(period)` — `settlements.instructor_fee_krw` SUM (`status = 'paid'`, `deleted_at IS NULL`)
  - `margin.ts`: `sumMargin(period)` — `projects.margin_krw` SUM (GENERATED 컬럼 그대로 합산)
  - `by-month.ts`: `getMonthlyTrend(months)` — 최근 N개월 시계열
  - `by-client.ts`: `getTopClients(limit, period)` — `client_companies` 기준 매출 Top-N
  - `by-instructor.ts`: `getTopInstructors(limit, period)` — 강사 기준 정산 합계 Top-N
  - `queries.ts`: 위 함수들이 호출하는 단일 진입점. raw SQL은 단순 SUM/GROUP BY만 사용(임베디드 OR 회피, `null` 결과는 0으로 정규화).
  - `__tests__/*.test.ts`: 픽스처 기반 집계 함수 단위 테스트
- UI 컴포넌트
  - `src/components/admin/dashboard/`: `period-toggle.tsx`, `kpi-card.tsx`, `trend-chart.tsx`(기존 차트 라이브러리 재사용), `top-list.tsx`
  - 차트는 신규 라이브러리 도입 없이 프로젝트가 이미 사용 중인 라이브러리(또는 SVG 단순 렌더)로 처리.

### 2.2 Out of Scope (Exclusions — What NOT to Build)

- `audit_log` 테이블 신설 — `audit.ts`는 콘솔 로그만 기록한다. 영속 감사 로그는 후속 `SPEC-AUDIT-001`로 분리.
- 새로운 차트 라이브러리(예: recharts) 도입 — 기존 사용 라이브러리 또는 단순 컴포넌트로 처리.
- RBAC 세분화/권한 그룹 — `user_role` ENUM 3종(`admin`/`operator`/`instructor`)으로 충분.
- 회원 일괄 업로드/CSV 임포트.
- 매출 예측·AI 분석·코호트 분석.
- admin 자기 자신을 비활성화하는 기능(자가 lockout 방지). UI에서 비활성화 토글 비표시.
- 강제 로그아웃(세션 즉시 무효화) — 비활성화는 다음 로그인부터 적용.

## 3. EARS 형식 요구사항

### 3.1 공통 가드 (Ubiquitous)

- THE SYSTEM SHALL `/admin/*` 모든 경로에서 `requireRole(['admin'])` 가드를 적용한다.
- THE SYSTEM SHALL admin 가드 실패 시 `/dashboard`로 리다이렉트한다(SPEC-AUTH-001 정책 재사용).

### 3.2 F-301 회원/권한 관리

- WHEN admin이 `/admin/users` 진입, THE SYSTEM SHALL 페이지네이션된 회원 리스트(기본 20건)와 `role`/`is_active`/이메일 검색 필터를 제공한다.
- WHEN admin이 `/admin/users/[id]` 진입, THE SYSTEM SHALL 대상 사용자의 기본 정보, 최근 로그인 이력(최근 5건, `auth_events`에서 조회), 초대 상태(`user_invitations`), 역할 변경 폼, 비활성화 토글을 표시한다.
- WHEN admin이 사용자 역할을 변경, THE SYSTEM SHALL `users.role`을 갱신하고 `audit.ts`로 구조화 로그(`actor_id`, `target_id`, `before_role`, `after_role`, `at`)를 기록한다.
- WHEN admin이 사용자의 `is_active` 토글, THE SYSTEM SHALL `users.is_active`를 갱신하고 동일 형식의 감사 로그를 남긴다.
- IF admin이 본인 계정의 `role`을 admin 외 값으로 변경 시도, THEN THE SYSTEM SHALL Zod 스키마에서 거부하고 폼에 명시적 오류 메시지를 표시한다.
- IF admin이 본인 계정의 `is_active`를 false로 변경 시도, THEN THE SYSTEM SHALL UI에서 토글을 비표시 처리하고, Server Action에서도 동일 검사로 거부한다.
- WHILE 회원 리스트 조회, THE SYSTEM SHALL `users.deleted_at IS NULL` 조건을 적용한다.
- IF 사용자가 `is_active = false` 상태에서 로그인 시도, THEN THE SYSTEM SHALL 미들웨어/auth callback에서 세션을 차단하고 `/login?error=deactivated`로 리다이렉트한다.

### 3.3 F-302 매출매입 집계 대시보드

- WHEN admin이 `/admin/dashboard` 진입, THE SYSTEM SHALL 당월 기준 매출/매입/마진 KPI 카드 3종, 최근 6개월 추이, 고객사 Top-5, 강사 Top-5를 표시한다.
- WHEN admin이 기간 토글을 분기/연도로 변경, THE SYSTEM SHALL 모든 위젯을 선택된 기간 범위로 재집계한다.
- WHILE 매출 집계, THE SYSTEM SHALL `projects.business_amount_krw` 값을 SUM하며 `deleted_at IS NULL` 조건을 적용한다.
- WHILE 매입 집계, THE SYSTEM SHALL `settlements.instructor_fee_krw` 값을 SUM하며 `status = 'paid'` 및 `deleted_at IS NULL` 조건을 적용한다.
- WHILE 마진 집계, THE SYSTEM SHALL `projects.margin_krw`(GENERATED 컬럼)를 SUM하며 별도 산술 계산을 수행하지 않는다.
- IF 선택된 기간에 데이터가 없음, THEN THE SYSTEM SHALL "데이터 없음" 빈 상태와 0원을 표시하며 오류로 처리하지 않는다.

### 3.4 데이터 무결성 (Unwanted)

- THE SYSTEM SHALL NOT GENERATED 컬럼(`projects.margin_krw`, `settlements.business_amount_krw`, `settlements.instructor_fee_krw`, `settlements.profit_krw`)에 대해 INSERT/UPDATE 문을 발행하지 않는다.
- THE SYSTEM SHALL NOT admin 외 역할의 사용자가 본 SPEC의 라우트나 Server Action을 호출할 수 있도록 허용하지 않는다.

## 4. 비기능 요구사항

- 보안: 모든 라우트 `requireRole(['admin'])`. Server Action도 매 호출 진입에서 동일 가드 재검사(SSR 가드만 의존하지 않음).
- 성능: 회원 리스트 200ms 이내(20건 기준). 대시보드 집계 500ms 이내(최근 12개월 데이터 기준). 모든 집계 쿼리는 단일 라운드트립.
- 관측성: 역할 변경/비활성화 액션은 구조화 로그 기록(`audit.ts`).
- 접근성: KPI 카드와 차트는 텍스트 라벨 동시 노출. 색상만으로 상태를 구분하지 않음.

## 5. 데이터 모델

### 5.1 신규 마이그레이션

`supabase/migrations/20260428120000_admin_user_active.sql`:

```sql
-- SPEC-ADMIN-001: users.is_active 컬럼 도입
ALTER TABLE users
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX idx_users_is_active
  ON users (is_active)
  WHERE is_active = false;

COMMENT ON COLUMN users.is_active IS
  'admin이 비활성화 가능. false면 로그인 시 미들웨어가 차단함.';
```

RLS 변경 없음. 기존 `users` admin SELECT/UPDATE 정책으로 충분.

### 5.2 활용 컬럼 매핑 (수정 없음)

| 영역 | 테이블/컬럼 | 비고 |
| --- | --- | --- |
| 매출 | `projects.business_amount_krw` | SUM 원천 |
| 매입 | `settlements.instructor_fee_krw` | `status='paid'` 한정 |
| 마진 | `projects.margin_krw` (GENERATED) | 직접 합산 |
| 정산 마진 | `settlements.profit_krw` (GENERATED) | 강사 Top-N 보조 지표 |
| 회원 활동 | `auth_events` | 최근 로그인 이력 |
| 초대 상태 | `user_invitations` | 회원 상세 |
| 역할 | `users.role` (`user_role` ENUM) | `instructor`/`operator`/`admin` |
| 활성 | `users.is_active` (신규) | boolean |

## 6. 의존성

- 기 완료: SPEC-AUTH-001(역할 가드, 초대), SPEC-DB-001(스키마), SPEC-LAYOUT-001(레이아웃), SPEC-PROJECT-001/INSTRUCTOR-001/DASHBOARD-001(데이터 적재).
- 외부 라이브러리 신규 도입 없음. Zod·Supabase JS·Next.js Server Actions 기존 스택 사용.

## 7. 마이그레이션 영향

- 다운타임 없음. `ADD COLUMN ... DEFAULT true`는 PostgreSQL 11+ 메타데이터 전용 변경(즉시).
- 기존 사용자 모두 `is_active = true`로 초기화되어 동작 회귀 없음.

## 8. 위험 및 완화

| 위험 | 완화 |
| --- | --- |
| admin 단일 계정의 자가 lockout | Zod·Server Action 양쪽에서 본인 계정의 role 변경 및 비활성화 차단 |
| GENERATED 컬럼에 INSERT 시도 | 도메인 레이어에서 SELECT 전용으로만 노출. 코드 리뷰 체크리스트에 명시 |
| 비활성화 사용자가 기존 세션을 유지 | 본 SPEC은 "다음 로그인부터 차단" 정책. 즉시 무효화는 후속 SPEC |
| 집계 쿼리 풀스캔 | `projects.created_at`, `settlements.paid_at` 인덱스 기존 활용. period 필터는 단일 범위 조건으로 작성 |

## 9. 추적성

- REQ → 코드: 각 EARS 항목은 `acceptance.md`의 테스트 시나리오와 1:1 매핑.
- 코드 → 테스트: `src/lib/admin/users/__tests__/`, `src/lib/admin/aggregations/__tests__/`.
- SPEC → PR: 머지 시 PR 본문에 `SPEC-ADMIN-001` 명시.

## Implementation Notes (2026-04-28, v1.0.0)

### 구현 결과
- **마이그레이션 1건**: `supabase/migrations/20260428120000_admin_user_active.sql` — `users.is_active boolean DEFAULT true` + 부분 인덱스 (false만)
- **Drizzle 스키마**: `src/db/schema/auth.ts`에 `isActive` 컬럼 동기화
- **F-301 도메인** (`src/lib/admin/users/`): validation/audit/list-query/queries (4파일 + 4 테스트)
- **F-302 도메인** (`src/lib/admin/aggregations/`): period/queries + 6 wrapper(revenue/cost/margin/by-month/by-client/by-instructor) + 2 테스트
- **Server Actions**: `users/[id]/{role, active}/actions.ts`
- **UI**: role-form / active-form (`useActionState`), 자기 자신 토글 비표시
- **페이지**: `users/page.tsx` (필터+검색+페이지네이션) + `users/[id]/page.tsx` (상세) + `dashboard/page.tsx` (KPI 3종 + 6개월 추이 + Top 5 고객사/강사)
- **미들웨어 차단** (최소 침습): `src/utils/supabase/middleware.ts` + `src/proxy.ts` — JWT 검증 후 1회 SELECT, `is_active=false`면 `/login?error=deactivated` redirect + 세션 만료
- **단위 테스트**: 30건 PASS — 기존 auth 회귀 25/25 PASS (LESSON-003 적용)

### MX 태그 추가
- `@MX:ANCHOR` users.queries (updateUserRole/setUserActive 진입점)
- `@MX:ANCHOR` aggregations.queries (집계 단일 라운드트립)
- `@MX:WARN` aggregations.queries — GENERATED(`margin_krw`/`profit_krw`) 직접 SELECT
- `@MX:WARN` middleware — 인증 요청당 추가 SELECT 비용 (부분 인덱스 완화)
- `@MX:NOTE` validation.ts — 자가 lockout 의도, period.ts — 반열린 구간

### Deferred Items
| 항목 | 이유 | 후속 |
|---|---|---|
| audit_log 테이블 영속화 | 인터페이스만 호환, 콘솔 로그 stub | SPEC-AUDIT-001 |
| Access token hook 내 is_active 임베딩 | 미들웨어 SELECT 제거 최적화 | 후속 최적화 |
| 차트 라이브러리 신규 도입 | SVG/기존 라이브러리 우선 | UX 폴리시 |
| 회원 일괄 업로드 (CSV) | MVP 외 | Phase 3+ |

### 품질 게이트 결과
- typecheck: 0 errors
- lint: 0 errors / 0 warnings (admin 영역)
- test:unit: 30/30 PASS (admin) + 25/25 PASS (auth 회귀)
