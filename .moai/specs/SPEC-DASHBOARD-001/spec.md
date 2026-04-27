---
id: SPEC-DASHBOARD-001
version: 1.0.0
status: draft
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-DASHBOARD-001: 담당자 메인 대시보드 (Operator Main Dashboard)

## HISTORY

- **2026-04-27 (v1.0.0)**: 초기 작성. Algolink MVP 담당자 페르소나의 진입 화면([F-201])으로서 (1) KPI 위젯 4종(의뢰 건수 / 배정확정 건수 / 교육중 건수 / 미정산 합계), (2) 프로젝트 상태 다중 필터(의뢰·강사매칭·컨펌·진행·정산), (3) 칸반 뷰(상태별 컬럼 + 클릭 기반 상태 전환, MVP에서는 드래그앤드롭 미포함), (4) 강사 일정 월력 뷰(전 강사 배정 강의 + 강사별 색상 구분, Asia/Seoul), (5) 알림 미리보기(미응답 배정 / 일정 충돌 / D-Day) 인터페이스, (6) Server Component 우선 + Drizzle SQL aggregate, (7) `revalidate` 30초 + `revalidatePath` 인validation, (8) operator/admin RLS 가드, (9) 한국어 + WCAG 2.1 AA를 정의한다. SPEC-DB-001(완료) `projects` / `assignments` / `schedules` 테이블, SPEC-AUTH-001(완료) `requireRole(['operator','admin'])`, SPEC-LAYOUT-001(완료) `<AppShell>` 위에서 동작한다. 알림 데이터 소스(SPEC-NOTIF-001)는 후속 SPEC이므로 본 SPEC은 알림 미리보기를 placeholder 컴포넌트 + 인터페이스 계약으로만 정의한다. 프로젝트 CRUD UI(SPEC-PROJECT-001), 강사 추천 UI(SPEC-RECO-001), 정산 페이지(SPEC-SETTLE-001)는 명시적으로 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP에서 **담당자(operator)와 관리자(admin)가 로그인 직후 첫 화면으로 진입하는 운영 허브**를 구축한다. 본 SPEC의 산출물은 (a) 4종 KPI 위젯이 SQL aggregate 한 번으로 집계되는 Server Component 카드 그리드, (b) 프로젝트 상태 enum 5종(`의뢰 / 강사매칭 / 컨펌 / 진행 / 정산`)을 다중 선택할 수 있는 URL search-param 기반 필터, (c) 동일 상태 enum을 컬럼으로 하는 칸반 뷰(클릭으로 다음 상태 이동, MVP는 드래그앤드롭 미포함), (d) 모든 배정된 강의를 강사별 색상으로 구분하여 월/주 토글로 보여주는 캘린더 페이지, (e) 미응답 배정 요청 / 일정 충돌 / D-Day 경고 카운트를 묶은 알림 미리보기 카드(SPEC-NOTIF-001 데이터 소스에 대한 인터페이스 계약 + MVP placeholder 구현), (f) `revalidate = 30s` + Server Action 후 `revalidatePath` 조합으로 캐시 일관성을 유지하는 데이터 흐름, (g) operator/admin 외 접근 시 SPEC-AUTH-001 silent redirect를 그대로 활용하는 가드, (h) 한국어 라벨 + WCAG 2.1 AA(키보드 네비, ARIA, axe critical 0건)이다.

본 SPEC은 어떤 새 도메인 데이터도 만들지 않는다. 이미 SPEC-DB-001로 마이그레이션된 `projects`, `assignments`, `schedules` 테이블에 대한 **읽기 + 단일 상태 전환 Server Action**만 추가한다.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.1 [F-201]은 담당자 메인 대시보드를 "의뢰 / 배정확정 / 교육중 필터 + 강사 일정 월력"으로 정의한다. §5의 MVP KPI는 "의뢰→배정 평균 소요 시간(상태 전환 타임스탬프)", "강사 추천 1순위 채택률" 등 **상태 전환 이벤트 기반 측정**을 요구하므로, 본 SPEC의 KPI 카드는 단순 row count가 아니라 `projects.status_changed_at` 등 SPEC-DB-001 스키마의 타임스탬프 컬럼을 기반으로 집계한다.

`.moai/project/structure.md` §3.2의 프로젝트 상태 머신 `draft → 의뢰 → 강사매칭 → 요청 → 컨펌 → 진행 → 종료 → 정산요청 → 정산완료`에서 본 대시보드가 다루는 5개 핵심 컬럼은 다음과 같이 매핑한다 (UI 컬럼 = enum 값 묶음):

| UI 컬럼 라벨 | 매핑되는 Postgres enum 값 |
|---|---|
| 의뢰 | `draft`, `의뢰` |
| 강사매칭 | `강사매칭`, `요청` |
| 컨펌 | `컨펌` |
| 진행 | `진행` |
| 정산 | `종료`, `정산요청`, `정산완료` |

> 정확한 enum 식별자는 SPEC-DB-001 산출물 `supabase/migrations/20260427000030_users_projects.sql`에 정의된 값을 따른다 (한국어 enum 라벨 그대로).

SPEC-LAYOUT-001은 `<AppShell userRole>`을 노출하며 operator 토큰일 때 sidebar에 `/dashboard` 진입점이 이미 렌더된다. SPEC-AUTH-001은 `(operator)/layout.tsx`에서 `requireRole(['operator', 'admin'])`을 강제하므로 본 SPEC은 추가 가드 코드를 작성하지 않는다 — 상위 layout가 이미 보호한다.

알림 트리거는 `.moai/project/product.md` [F-206]에서 별도 항목으로 분리되어 있어 SPEC-NOTIF-001로 위임된다. 본 SPEC은 **알림 미리보기 카드의 인터페이스(`type NotificationPreview = { kind: 'unanswered' | 'conflict' | 'deadline'; count: number; samples: ... }`)만 확정**하고, 데이터 소스는 placeholder 함수(`getNotificationPreview()`)로 stub하여 SPEC-NOTIF-001 구현 시 1줄 swap만으로 활성화되도록 한다.

### 1.3 범위 (Scope)

**In Scope:**

- `src/app/(operator)/dashboard/page.tsx` — Server Component, KPI 4종 + 상태 필터 + 칸반 + 알림 미리보기 카드 + 캘린더 진입 링크
- `src/app/(operator)/dashboard/calendar/page.tsx` — Server Component, 강사 일정 월/주 토글 캘린더 페이지
- `src/components/dashboard/kpi-card.tsx` — 단일 KPI 카드 (라벨, 값, 추세 아이콘, 보조 설명)
- `src/components/dashboard/kpi-grid.tsx` — KPI 4장을 grid로 묶은 컨테이너 (responsive, sr-only summary 포함)
- `src/components/dashboard/status-filter.tsx` — Client Component (`'use client'`), URL search-param `?status=의뢰,컨펌` 기반 multi-select 토글
- `src/components/dashboard/kanban-board.tsx` — Server Component 컨테이너, 컬럼 5개를 받아 렌더
- `src/components/dashboard/kanban-column.tsx` — Server Component, 컬럼 라벨 + 카드 리스트
- `src/components/dashboard/kanban-card.tsx` — Server Component, 프로젝트 카드(제목, 고객사, 일정, 다음 상태 버튼)
- `src/components/dashboard/status-transition-button.tsx` — Client Component, Server Action `transitionProjectStatus(projectId, nextStatus)` 호출 + 낙관 UI
- `src/components/dashboard/notification-preview.tsx` — Server Component, 3종 카운트 카드. 내부적으로 `getNotificationPreview()` placeholder 호출
- `src/components/dashboard/instructor-calendar.tsx` — Client Component (캘린더 라이브러리는 react/SSR-friendly한 것 선택, 기본 후보: `react-big-calendar` + `date-fns`), 월/주 토글, 강사별 색상 분류, 클릭 시 toast로 메타 표시(드릴다운은 후속 SPEC)
- `src/lib/dashboard/queries.ts` — 순수 Drizzle 쿼리 함수 5종:
  - `getKpiSummary(): Promise<KpiSummary>` — 4종 KPI 단일 SQL aggregate
  - `getProjectsByStatus(filters: StatusFilter[]): Promise<ProjectKanbanRow[]>` — 칸반 카드 리스트
  - `getInstructorScheduleRange(from: Date, to: Date): Promise<ScheduleEvent[]>` — 캘린더용 일정
  - `getNotificationPreview(operatorId: string): Promise<NotificationPreview>` — placeholder (MVP 동안은 0/0/0 반환)
  - `transitionProjectStatus(projectId: string, fromStatus, toStatus): Promise<void>` — Server Action용 도메인 함수, SPEC-DB-001 RLS에 위임
- `src/lib/dashboard/types.ts` — 위 5함수 입출력 타입, `STATUS_COLUMN_MAP` 상수(UI 컬럼 ↔ enum 매핑), `INSTRUCTOR_COLOR_PALETTE`(8색 사이클)
- `src/lib/dashboard/format.ts` — 금액(원 단위 KRW), 날짜(Asia/Seoul), 일자 차이(D-Day) 포맷 헬퍼
- `src/app/(operator)/dashboard/actions.ts` — `transitionProjectStatusAction` Server Action (revalidatePath 호출 포함)
- `src/components/dashboard/empty-state.tsx` — 칸반/캘린더 빈 상태 (`role="status"` 라이브 영역)
- `src/components/dashboard/error-state.tsx` — 데이터 로드 실패 시 에러 박스 + 재시도 링크
- `src/app/(operator)/dashboard/loading.tsx` — Suspense fallback (KPI/칸반/캘린더 skeleton)
- `src/app/(operator)/dashboard/error.tsx` — Error boundary, 한국어 안내 + `/dashboard` 다시 시도 링크
- (선택, MVP는 비활성) E2E 시나리오 1건: operator 로그인 → 대시보드 도달 → 필터 변경 → URL 갱신 확인 (Playwright)

**Out of Scope (Exclusions — What NOT to Build):**

- **프로젝트 등록 / 편집 UI**: `/projects/new`, `/projects/[id]` 폼 → SPEC-PROJECT-001. 본 SPEC의 칸반 카드는 클릭 시 `/projects/[id]`로 navigate 만, 그 페이지는 빌드하지 않음 (404 허용 또는 SPEC-PROJECT-001 후속 의존).
- **AI 강사 추천 UI**: Top-3 추천 카드, 1-클릭 배정 요청 → SPEC-RECO-001.
- **강사 관리 페이지**: `/instructors`, `/instructors/[id]` → SPEC-INSTR-001.
- **고객사 관리**: `/clients` → SPEC-CLIENT-001.
- **정산 페이지**: `/settlements` 상세 (KPI 카드의 "미정산 합계" 클릭은 본 SPEC에서 navigate만, 도착 페이지는 SPEC-SETTLE-001).
- **알림 데이터 소스**: 미응답 배정 감지 / 일정 충돌 감지 / D-Day 알림 트리거 로직 → SPEC-NOTIF-001. 본 SPEC은 `getNotificationPreview()` placeholder만 제공하고 항상 `{ unanswered: 0, conflict: 0, deadline: 0 }` 반환.
- **알림 센터(인앱) 자체**: 알림 리스트 / 읽음 처리 / 알림 설정 → SPEC-NOTIF-001 또는 `/notifications` 페이지.
- **드래그앤드롭 칸반**: `dnd-kit` 등 라이브러리 도입 미실시. MVP는 카드 내 "다음 상태로" 버튼 클릭 → Server Action으로 단일 단계 전환만. 후속 SPEC-DASHBOARD-DND-XXX로 이연.
- **칸반 카드 인라인 편집**: 카드에서 직접 제목/일정 수정 미지원. 클릭 → 상세 페이지(SPEC-PROJECT-001) navigate.
- **캘린더 일정 등록 / 수정**: 본 SPEC의 캘린더는 read-only. 일정 생성/충돌 해결은 SPEC-SCHED-001.
- **다중 워크스페이스 / 담당자별 보드 분리**: `.moai/project/product.md` §3.3 가정 1(단일 워크스페이스) 따라 모든 operator가 동일 데이터를 봄. `담당자 = own_assigned`로 자동 필터하지 않으며, 모든 운영자에게 동일한 view 노출 (RLS는 operator 전체 read).
- **사용자 정의 KPI / 차트**: `Recharts` 기반 매출/매입 차트는 [F-302] 관리자 대시보드(SPEC-ADMIN-001)에 위임. 본 SPEC은 텍스트 기반 KPI 카드만.
- **검색 / 정렬**: 칸반 보드에 검색바 미포함. 필터는 상태 멀티 선택만. 검색은 `/projects` 리스트 페이지(SPEC-PROJECT-001)에 위임.
- **무한 스크롤 / 페이지네이션**: 칸반 컬럼당 최대 100건 강제 LIMIT (그 이상은 "더 보기" 링크로 SPEC-PROJECT-001로 navigate). 페이지네이션 UI 미빌드.
- **실시간 푸시 (Realtime / SSE)**: Supabase Realtime 채널 미구독. 데이터 갱신은 `revalidate = 30s` + Server Action 후 `revalidatePath`만. 후속 SPEC에서 검토.
- **모바일 앱 / PWA**: 데스크톱 우선. 반응형 미디어 쿼리는 SPEC-LAYOUT-001 토큰 활용 범위 내에서 grid 컬럼 수만 조정 (모바일에서는 KPI 1열, 칸반 가로 스크롤).
- **다크 모드 별도 디자인**: SPEC-LAYOUT-001 토큰 자동 상속. 별도 컴포넌트 변형 미빌드.
- **국제화 (i18n)**: 한국어 단일 (.moai/project/product.md §3.3 가정 2). 영어 번역 미제공.
- **권한 세분화**: operator/admin 동일 화면. operator A의 데이터를 operator B가 보는 것을 막지 않음 (RLS 정책에 따름, SPEC-DB-001 결정사항).
- **`/me` 강사 대시보드**: [F-101] → 별도 SPEC-DASHBOARD-INSTR-XXX.
- **로깅 / 분석 연동**: PostHog, Sentry 등 미연동. KPI 측정용 SQL 쿼리는 본 SPEC 범위 내 함수로만 구현, 외부 분석 도구 통합은 운영 단계.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ operator 토큰으로 `/dashboard` 진입 시 4종 KPI 카드, 상태 필터, 칸반 보드(5컬럼), 알림 미리보기, 캘린더 진입 링크 모두 첫 paint 내 표시
- ✅ KPI 카드 4종이 한 번의 SQL 호출로 집계됨 (`EXPLAIN ANALYZE`로 단일 쿼리 확인 또는 Drizzle 쿼리 카운터 1건)
- ✅ 상태 필터 "의뢰" + "진행" 동시 선택 시 URL이 `?status=의뢰,진행`으로 변경되고 칸반은 해당 컬럼만 강조 표시 (필터되지 않은 컬럼은 dim 처리하거나 hide)
- ✅ 칸반 카드의 "다음 상태로" 버튼 클릭 시 (a) Server Action 호출 → (b) DB 상태 enum 단일 단계 전환 → (c) `revalidatePath('/dashboard')` → (d) 카드가 다음 컬럼으로 이동된 채 재렌더
- ✅ 캘린더 페이지(`/dashboard/calendar`)에서 월/주 토글 정상 동작, 강사별 색상 8색 사이클 일관 매핑
- ✅ 빈 상태: 모든 칸반 컬럼이 비어있을 때 `<EmptyState>` 컴포넌트 + `role="status"` 메시지 노출
- ✅ 오류 상태: DB 실패 시 `error.tsx` boundary가 한국어 안내 + 재시도 링크 표시 (raw error 노출 X)
- ✅ instructor 토큰으로 `/dashboard` 접근 시 SPEC-AUTH-001 silent redirect → `/me/dashboard` (본 SPEC 코드 변경 0건)
- ✅ 알림 미리보기 카드: SPEC-NOTIF-001 미구현 단계에서도 placeholder 함수가 안전하게 0/0/0 반환 + UI는 "곧 활성화됩니다" 보조 문구 표시
- ✅ 접근성: axe DevTools `/dashboard` + `/dashboard/calendar` 페이지 critical 0건, Lighthouse Accessibility ≥ 95
- ✅ 키보드 only: Tab으로 KPI 카드 → 상태 필터 → 칸반 카드 → 캘린더 링크 순회 가능, Enter로 액션 트리거, Esc 미사용 (모달 없음)
- ✅ 한국어 통일: 모든 라벨 / 빈 상태 / 에러 메시지가 한국어
- ✅ Asia/Seoul 타임존: 캘린더 / KPI 일자 표시가 KST 기준 (date-fns-tz 또는 동등 헬퍼)
- ✅ 캐시 일관성: `revalidate = 30s` 동작 확인 (네트워크 탭에서 30초 후 자동 fresh fetch), Server Action 후 즉시 fresh 데이터 노출
- ✅ 성능: KPI + 칸반 + 알림 미리보기 단일 페이지 LCP < 2.5초 (`tech.md` §5 목표)

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 9개 모듈로 구성된다: `KPI`, `FILTER`, `KANBAN`, `TRANSITION`, `CALENDAR`, `NOTIFY`, `DATA`, `STATE`, `A11Y`.

### 2.1 REQ-DASH-KPI — KPI 위젯 4종

**REQ-DASH-KPI-001 (Ubiquitous)**
The system **shall** render exactly four KPI cards on `/dashboard` in the following order: (1) "의뢰 건수" (count of projects whose current status is in `{draft, 의뢰}`), (2) "배정확정 건수" (count of projects whose current status is `컨펌`), (3) "교육중 건수" (count of projects whose current status is `진행`), (4) "미정산 합계" (sum of `settlements.amount_total` where `settlements.status` ≠ `정산완료`).

**REQ-DASH-KPI-002 (Ubiquitous)**
The system **shall** compute all four KPI values via a single Drizzle query that uses Postgres `FILTER (WHERE ...)` aggregates or a single CTE; multiple sequential queries **shall not** be issued.

**REQ-DASH-KPI-003 (Event-Driven)**
**When** the dashboard renders, the system **shall** call `getKpiSummary()` from `src/lib/dashboard/queries.ts` and **shall** pass the result to `<KpiGrid>` via props; the function **shall not** be called from a Client Component.

**REQ-DASH-KPI-004 (Ubiquitous)**
The "미정산 합계" KPI **shall** display the value formatted as KRW (e.g., `₩12,400,000`) using `Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })`.

**REQ-DASH-KPI-005 (Optional Feature)**
**Where** a KPI value's underlying detail page exists (currently `/projects?status=의뢰` for KPI #1, etc.), the KPI card **shall** render as an `<a>` tag linking to that page; **where** the detail page does not yet exist (e.g., `/settlements` before SPEC-SETTLE-001), the card **shall** render as a non-interactive `<div>` to avoid 404 navigation.

**REQ-DASH-KPI-006 (Unwanted Behavior)**
**If** a KPI value cannot be computed (e.g., DB error on the underlying aggregate), **then** the affected card **shall** display "—" (em dash) instead of `0`, so users can distinguish "data unavailable" from "zero count".

**REQ-DASH-KPI-007 (Ubiquitous)**
Each KPI card **shall** include an accessible name combining the label and value (e.g., `aria-label="의뢰 건수 12건"`) so screen readers announce both the metric name and its current value.

### 2.2 REQ-DASH-FILTER — 상태 멀티 필터

**REQ-DASH-FILTER-001 (Ubiquitous)**
The system **shall** render a multi-select status filter row with five toggle buttons labeled exactly: `의뢰`, `강사매칭`, `컨펌`, `진행`, `정산`; the order **shall** match the project lifecycle direction.

**REQ-DASH-FILTER-002 (Event-Driven)**
**When** the user clicks a filter button, the system **shall** update the URL search parameter `?status=` to a comma-separated list of currently active filters (e.g., `?status=의뢰,진행`) using Next.js `router.replace` (not `push`), preserving other parameters and not adding a new history entry per click.

**REQ-DASH-FILTER-003 (State-Driven)**
**While** zero filters are active (URL has no `status` parameter), the system **shall** display all five kanban columns at full opacity.

**REQ-DASH-FILTER-004 (State-Driven)**
**While** one or more filters are active, the system **shall** visually emphasize the selected columns (full opacity) and de-emphasize unselected columns (reduced opacity, e.g., 40%) **without** removing them from the DOM; this preserves consistent layout and keyboard order.

**REQ-DASH-FILTER-005 (Ubiquitous)**
The filter component **shall** be a Client Component (`'use client'`) and **shall** read its initial active set from the URL on first render, supporting deep-link sharing of filtered views.

**REQ-DASH-FILTER-006 (Unwanted Behavior)**
**If** the URL contains a `status` value that is not one of the five canonical labels, **then** the system **shall** silently ignore the unknown value and **shall not** raise an error; only valid values **shall** be honored.

**REQ-DASH-FILTER-007 (Ubiquitous)**
Each filter button **shall** expose `aria-pressed="true"` when active and `aria-pressed="false"` when inactive; **shall** be reachable via Tab in left-to-right reading order.

### 2.3 REQ-DASH-KANBAN — 칸반 보드

**REQ-DASH-KANBAN-001 (Ubiquitous)**
The system **shall** render a kanban board with exactly five columns whose headers and label-to-enum mapping are defined by `STATUS_COLUMN_MAP` in `src/lib/dashboard/types.ts`; the mapping **shall** be a single source of truth shared by SQL queries and UI rendering.

**REQ-DASH-KANBAN-002 (Ubiquitous)**
Each kanban card **shall** display the project's title, client (`clients.name`), scheduled date range (start / end formatted in Asia/Seoul), and a "다음 상태로" action button when a forward transition is allowed for that status.

**REQ-DASH-KANBAN-003 (Ubiquitous)**
Each column **shall** load at most 100 cards (server-side `LIMIT 100`); when a column has more than 100 matching projects, the column footer **shall** show a "100+개 — 전체 보기" link to `/projects?status=<column>` (route may not yet exist; SPEC-PROJECT-001 will provide it).

**REQ-DASH-KANBAN-004 (Ubiquitous)**
The kanban board **shall** be rendered as Server Components; only the per-card transition button **shall** be a Client Component.

**REQ-DASH-KANBAN-005 (Event-Driven)**
**When** a kanban card is clicked (anywhere except the transition button), the system **shall** navigate to `/projects/[id]` (the destination page is provided by SPEC-PROJECT-001; until then, the route may 404 — this is acceptable for MVP).

**REQ-DASH-KANBAN-006 (State-Driven)**
**While** a column has zero cards (after applying current filter), the column **shall** display `<EmptyState>` with the message `"이 상태의 프로젝트가 없습니다."` and `role="status"`.

**REQ-DASH-KANBAN-007 (Unwanted Behavior)**
**If** the kanban data fails to load, **then** the system **shall** render `<ErrorState>` with the Korean message `"프로젝트 목록을 불러오지 못했습니다. 새로고침 해주세요."` and a retry link to `/dashboard`; raw error messages **shall not** be exposed.

### 2.4 REQ-DASH-TRANSITION — 상태 전환 (단일 단계)

**REQ-DASH-TRANSITION-001 (Ubiquitous)**
The system **shall** expose a Server Action `transitionProjectStatusAction(projectId: string, fromStatus: ProjectStatus, toStatus: ProjectStatus)` that (1) verifies the current authenticated user is operator or admin via `requireRole(['operator','admin'])`, (2) verifies `fromStatus` matches the row's current status (optimistic concurrency), (3) writes the new status, (4) calls `revalidatePath('/dashboard')`.

**REQ-DASH-TRANSITION-002 (Ubiquitous)**
The system **shall** allow only forward transitions along the canonical path `의뢰 → 강사매칭 → 컨펌 → 진행 → 정산`; backward or skip transitions **shall** be rejected at the action level with a Korean error toast `"허용되지 않는 상태 전환입니다."`.

**REQ-DASH-TRANSITION-003 (Event-Driven)**
**When** the action succeeds, the system **shall** rely on `revalidatePath` to re-render `/dashboard` with fresh data; the client **shall not** maintain its own local cache of project rows beyond the optimistic-UI window.

**REQ-DASH-TRANSITION-004 (Unwanted Behavior)**
**If** the row's current status no longer matches `fromStatus` at action time (concurrent edit), **then** the system **shall** abort the write and display `"다른 사용자가 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요."` to the user.

**REQ-DASH-TRANSITION-005 (Ubiquitous)**
The transition button **shall** display the destination column label inline (e.g., `"강사매칭으로"`) so users see the target before clicking; the final column (`정산`) **shall not** render a transition button.

**REQ-DASH-TRANSITION-006 (Unwanted Behavior)**
**If** the underlying RLS policy denies the UPDATE (e.g., misconfigured operator role), **then** the system **shall** fall back to the same error message as REQ-DASH-TRANSITION-002 and **shall** log the error to the application error log (not to the user-facing UI).

### 2.5 REQ-DASH-CALENDAR — 강사 일정 캘린더

**REQ-DASH-CALENDAR-001 (Ubiquitous)**
The system **shall** provide a dedicated calendar page at `/dashboard/calendar` that renders all confirmed instructor schedules (rows in `schedules` joined with `assignments` where `assignment.status = '컨펌' OR assignment.status = '진행'`) for the visible month.

**REQ-DASH-CALENDAR-002 (Ubiquitous)**
The calendar **shall** support month and week views with a toggle control; the default view **shall** be "month".

**REQ-DASH-CALENDAR-003 (Ubiquitous)**
Each schedule event **shall** be rendered with a color drawn from `INSTRUCTOR_COLOR_PALETTE` (8 hues), assigned deterministically by hashing the instructor's `id` so the same instructor always maps to the same color across sessions.

**REQ-DASH-CALENDAR-004 (Ubiquitous)**
All times **shall** be displayed in Asia/Seoul (KST) using a date-fns timezone helper or equivalent; UTC offsets **shall not** appear in the UI.

**REQ-DASH-CALENDAR-005 (Event-Driven)**
**When** the user clicks an event, the system **shall** display a tooltip or toast showing instructor name, project title, and time range; navigation to a detail page is reserved for SPEC-SCHED-001 and **shall not** occur in this SPEC.

**REQ-DASH-CALENDAR-006 (State-Driven)**
**While** the visible range has zero confirmed schedules, the calendar **shall** render an empty-state overlay reading `"이 기간에 배정된 강의가 없습니다."` without breaking the grid.

**REQ-DASH-CALENDAR-007 (Optional Feature)**
**Where** the deployment includes more than 8 active instructors in a single visible range, the color palette **shall** cycle (instructor #9 reuses color #1); this collision is acceptable for MVP and **shall** not raise an error.

**REQ-DASH-CALENDAR-008 (Ubiquitous)**
The calendar **shall** be reachable from the main `/dashboard` page via a clearly labeled "강사 일정 보기" link or button placed near the kanban board.

### 2.6 REQ-DASH-NOTIFY — 알림 미리보기 (인터페이스 계약)

**REQ-DASH-NOTIFY-001 (Ubiquitous)**
The system **shall** define and export a TypeScript type `NotificationPreview` in `src/lib/dashboard/types.ts` with the shape `{ unanswered: number; conflict: number; deadline: number; updatedAt: string | null }`; this type **shall** serve as the contract between this SPEC and SPEC-NOTIF-001.

**REQ-DASH-NOTIFY-002 (Ubiquitous)**
The system **shall** implement a placeholder function `getNotificationPreview(operatorId: string): Promise<NotificationPreview>` in `src/lib/dashboard/queries.ts` that returns `{ unanswered: 0, conflict: 0, deadline: 0, updatedAt: null }` until SPEC-NOTIF-001 replaces its body; the function signature **shall not** change after SPEC-NOTIF-001.

**REQ-DASH-NOTIFY-003 (Ubiquitous)**
The `<NotificationPreview>` card **shall** display three lines:
- 미응답 배정 요청: `<n>건`
- 일정 충돌: `<n>건`
- D-Day 경고: `<n>건`
each line linking to the future notification center (SPEC-NOTIF-001) or to a placeholder route `/notifications` (acceptable to 404 in MVP).

**REQ-DASH-NOTIFY-004 (State-Driven)**
**While** all three counts are zero (placeholder mode), the card **shall** display the helper text `"알림 시스템 활성화 후 사용 가능합니다."` below the counts so operators understand the feature is pending.

**REQ-DASH-NOTIFY-005 (Optional Feature)**
**Where** SPEC-NOTIF-001 has been merged and the placeholder is replaced, the helper text from REQ-DASH-NOTIFY-004 **shall** be removed automatically (it is conditional on `updatedAt === null`).

### 2.7 REQ-DASH-DATA — 데이터 페칭 / 캐싱

**REQ-DASH-DATA-001 (Ubiquitous)**
All read queries (`getKpiSummary`, `getProjectsByStatus`, `getInstructorScheduleRange`, `getNotificationPreview`) **shall** be defined in `src/lib/dashboard/queries.ts` as pure async functions taking explicit parameters and returning typed results; they **shall not** read `cookies()` or `headers()` directly — the calling Server Component is responsible for resolving auth context.

**REQ-DASH-DATA-002 (Ubiquitous)**
The dashboard page module **shall** export `export const revalidate = 30` to enable Next.js Incremental Static Regeneration with a 30-second window; this value **shall** apply to both `/dashboard` and `/dashboard/calendar`.

**REQ-DASH-DATA-003 (Event-Driven)**
**When** any Server Action mutates project state (currently only `transitionProjectStatusAction`), the action **shall** call `revalidatePath('/dashboard')` so the next request returns fresh data immediately rather than waiting for the 30-second window.

**REQ-DASH-DATA-004 (Ubiquitous)**
All Drizzle queries **shall** use parameterized inputs (no string concatenation) and **shall** rely on SPEC-DB-001 RLS to enforce row visibility; explicit `WHERE operator_id = ?` filters **shall not** be added unless RLS is bypassed (e.g., admin queries).

**REQ-DASH-DATA-005 (Unwanted Behavior)**
**If** a query exceeds 1 second of execution time, **then** the system **shall** log a warning to the application error log including the query name and duration; this **shall not** affect the user-facing response.

**REQ-DASH-DATA-006 (Ubiquitous)**
The system **shall** use the SPEC-AUTH-001 server-side helper `getCurrentUser()` to obtain the requesting operator's ID and role at the top of each Server Component that fetches data; passing this ID into query functions enables future per-operator personalization without changing the query layer.

### 2.8 REQ-DASH-STATE — 빈 / 로딩 / 오류 상태

**REQ-DASH-STATE-001 (Ubiquitous)**
The system **shall** provide a `loading.tsx` at `src/app/(operator)/dashboard/loading.tsx` rendering skeleton placeholders for KPI grid, status filter, kanban board, and notification card so users see structure during initial fetch.

**REQ-DASH-STATE-002 (Ubiquitous)**
The system **shall** provide an `error.tsx` at `src/app/(operator)/dashboard/error.tsx` rendering a Korean error panel with title `"대시보드를 불러오지 못했습니다."`, the localized error message via `mapAuthError` (or a generic fallback), and a "다시 시도" button calling `reset()`; raw stack traces **shall not** appear.

**REQ-DASH-STATE-003 (Ubiquitous)**
The system **shall** provide reusable `<EmptyState>` and `<ErrorState>` components under `src/components/dashboard/` with `role="status"` and `role="alert"` respectively, and Korean messages.

**REQ-DASH-STATE-004 (Event-Driven)**
**When** the user has zero projects in any status (entirely empty workspace), the kanban board **shall** still render all five columns each showing `<EmptyState>`; the page **shall not** show a single "no data" overlay covering the entire kanban area.

### 2.9 REQ-DASH-A11Y — 접근성 (WCAG 2.1 AA)

**REQ-DASH-A11Y-001 (Ubiquitous)**
The dashboard **shall** be fully keyboard navigable: Tab order **shall** flow KPI grid → status filters → notification preview → kanban columns (left-to-right, top-to-bottom within each column) → calendar link.

**REQ-DASH-A11Y-002 (Ubiquitous)**
KPI cards, kanban cards, and notification preview rows **shall** expose accessible names and (when applicable) accessible descriptions so screen readers announce both the metric/content and its meaning.

**REQ-DASH-A11Y-003 (Ubiquitous)**
The status filter row **shall** be wrapped in a `<div role="group" aria-label="프로젝트 상태 필터">` so assistive tech identifies the filter set as a unit.

**REQ-DASH-A11Y-004 (Ubiquitous)**
Color-coded calendar events **shall not** rely on color alone to convey instructor identity; each event **shall** also include the instructor's name as visible text (or `aria-label` for icon-only views).

**REQ-DASH-A11Y-005 (Ubiquitous)**
All interactive elements (filter buttons, transition buttons, calendar events, KPI links) **shall** maintain SPEC-LAYOUT-001's contrast and focus-ring requirements (4.5:1 body, 3:1 large/UI, 2px outline).

**REQ-DASH-A11Y-006 (Event-Driven)**
**When** a status transition succeeds or fails, the system **shall** announce the result via a Korean `role="status"` (success) or `role="alert"` (failure) live region so screen-reader users receive feedback without inspecting the DOM.

**REQ-DASH-A11Y-007 (Ubiquitous)**
The dashboard **shall** maintain WCAG 2.1 AA compliance verified by axe DevTools (critical = 0, serious = 0) and Lighthouse Accessibility ≥ 95 on `/dashboard` and `/dashboard/calendar`.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 프로젝트 등록/편집 UI (`/projects/new`, `/projects/[id]`) | SPEC-PROJECT-001 |
| AI 강사 추천 카드 / 1-클릭 배정 요청 | SPEC-RECO-001 |
| 강사 관리 페이지 (`/instructors`) | SPEC-INSTR-001 |
| 고객사 관리 페이지 (`/clients`) | SPEC-CLIENT-001 |
| 정산 상세 페이지 (`/settlements`) | SPEC-SETTLE-001 |
| 알림 트리거 / 데이터 소스 / 알림 센터 | SPEC-NOTIF-001 |
| 강사 일정 등록 / 수정 / 충돌 해결 | SPEC-SCHED-001 |
| 드래그앤드롭 칸반 (`dnd-kit`) | SPEC-DASHBOARD-DND-XXX (후속) |
| Realtime 푸시 (Supabase Realtime / SSE) | (검토 후 결정) |
| 차트 / 매출·매입 시각화 (`Recharts`) | SPEC-ADMIN-001 ([F-302]) |
| 검색 / 정렬 / 페이지네이션 UI | SPEC-PROJECT-001 |
| 다중 워크스페이스 / 담당자별 보드 | (정책상 제외, MVP 단일 워크스페이스) |
| 영어/일본어 번역 (i18n) | (정책상 제외, 한국어 단일) |
| 모바일 PWA / 네이티브 앱 | (운영 단계) |
| 대시보드 위젯 사용자 정의 | (운영 단계) |
| 강사 본인 (`/me`) 대시보드 | SPEC-DASHBOARD-INSTR-XXX |
| PostHog / Sentry 분석 연동 | (운영 단계) |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 파일 (라우트)

- `src/app/(operator)/dashboard/page.tsx` — 메인 대시보드 Server Component
- `src/app/(operator)/dashboard/loading.tsx` — Suspense fallback
- `src/app/(operator)/dashboard/error.tsx` — Error boundary
- `src/app/(operator)/dashboard/actions.ts` — `transitionProjectStatusAction` Server Action
- `src/app/(operator)/dashboard/calendar/page.tsx` — 강사 일정 캘린더 페이지
- `src/app/(operator)/dashboard/calendar/loading.tsx`
- `src/app/(operator)/dashboard/calendar/error.tsx`

### 4.2 신규 파일 (컴포넌트)

- `src/components/dashboard/kpi-card.tsx`
- `src/components/dashboard/kpi-grid.tsx`
- `src/components/dashboard/status-filter.tsx` (`'use client'`)
- `src/components/dashboard/kanban-board.tsx`
- `src/components/dashboard/kanban-column.tsx`
- `src/components/dashboard/kanban-card.tsx`
- `src/components/dashboard/status-transition-button.tsx` (`'use client'`)
- `src/components/dashboard/notification-preview.tsx`
- `src/components/dashboard/instructor-calendar.tsx` (`'use client'`)
- `src/components/dashboard/empty-state.tsx`
- `src/components/dashboard/error-state.tsx`

### 4.3 신규 파일 (도메인 레이어 — 순수 TS)

- `src/lib/dashboard/queries.ts` — Drizzle 쿼리 함수 (Server only)
- `src/lib/dashboard/types.ts` — 타입 정의 + `STATUS_COLUMN_MAP` + `INSTRUCTOR_COLOR_PALETTE`
- `src/lib/dashboard/format.ts` — KRW / Asia/Seoul / D-Day 포맷 헬퍼
- `src/lib/dashboard/transitions.ts` — 상태 전환 도메인 규칙 (`canTransition`, `nextStatus`)

### 4.4 수정 없음 (참고)

- `src/app/(operator)/layout.tsx` — SPEC-AUTH-001 산출물, `requireRole(['operator','admin'])` 그대로 사용
- `src/components/app/sidebar.tsx` (또는 동등) — SPEC-LAYOUT-001 산출물, `/dashboard` 메뉴 이미 존재
- `src/db/schema/projects.ts`, `src/db/schema/assignments.ts`, `src/db/schema/schedules.ts`, `src/db/schema/settlements.ts` — SPEC-DB-001 산출물, 변경 없음
- `supabase/migrations/**` — 본 SPEC은 마이그레이션 변경 없음

### 4.5 의존성 추가 (가능성)

- `react-big-calendar` + `date-fns` + `date-fns-tz` (Asia/Seoul 표시) — 캘린더 라이브러리. 라이브 vs `@fullcalendar/react` 결정은 plan 단계 또는 Run M5에서 검증 후 확정. `tech.md` §2.1은 FullCalendar를 디폴트로 명시했으나 RSC 친화도와 번들 크기에서 react-big-calendar가 유리할 수 있음 — Run 단계에 1차 spike로 결정.
- (이미 있음) `react-hook-form`, `zod`, `lucide-react`, `tailwindcss` v4, shadcn/ui primitives — 추가 도입 없음

---

## 5. 기술 접근 (Technical Approach)

### 5.1 데이터 흐름 (요약)

```
URL ─────────► (operator)/dashboard/page.tsx (Server Component)
  │                │
  │                ├─► await getCurrentUser()           [SPEC-AUTH-001]
  │                ├─► await getKpiSummary()            [single SQL aggregate]
  │                ├─► await getProjectsByStatus(filters from URL)
  │                └─► await getNotificationPreview()   [placeholder]
  │
  ├─► <KpiGrid>            (server, props)
  ├─► <StatusFilter>       (client, reads URL)
  ├─► <KanbanBoard>        (server)
  │     └─► <KanbanCard>
  │           └─► <StatusTransitionButton>  (client → Server Action)
  ├─► <NotificationPreview>(server, placeholder)
  └─► <a href="/dashboard/calendar">강사 일정 보기</a>
```

### 5.2 KPI 단일 쿼리 (의사코드)

```sql
-- src/lib/dashboard/queries.ts: getKpiSummary()
SELECT
  count(*) FILTER (WHERE p.status IN ('draft','의뢰'))             AS request_count,
  count(*) FILTER (WHERE p.status = '컨펌')                         AS confirmed_count,
  count(*) FILTER (WHERE p.status = '진행')                         AS in_progress_count,
  COALESCE(
    (SELECT sum(s.amount_total)
       FROM public.settlements s
       WHERE s.status <> '정산완료'),
    0
  ) AS unsettled_total
FROM public.projects p;
```

Drizzle 표현으로는 `db.select({...}).from(projects)` + `sql<number>\`count(*) FILTER (WHERE ...)\`` 헬퍼를 사용. 단일 round-trip.

### 5.3 칸반 SQL (의사코드)

```sql
-- src/lib/dashboard/queries.ts: getProjectsByStatus()
SELECT
  p.id, p.title, p.status, p.start_date, p.end_date,
  c.id AS client_id, c.name AS client_name
FROM public.projects p
LEFT JOIN public.clients c ON c.id = p.client_id
WHERE p.status = ANY($1::user_role_enum_or_status[])
ORDER BY p.updated_at DESC
LIMIT 100;
```

본 SPEC은 컬럼별로 별도 호출이 아니라 5컬럼 enum 묶음을 IN으로 단일 쿼리한 뒤 메모리에서 컬럼별 그룹화. 100건 LIMIT는 컬럼별이 아닌 전체 기준 (MVP 데이터 규모상 충분; 운영 데이터가 늘면 컬럼별 LIMIT로 재설계).

### 5.4 상태 전환 Server Action

```ts
// src/app/(operator)/dashboard/actions.ts
'use server'
export async function transitionProjectStatusAction(
  projectId: string,
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireRole(['operator', 'admin'])         // SPEC-AUTH-001
  if (!canTransition(fromStatus, toStatus)) return { ok: false, message: '허용되지 않는 상태 전환입니다.' }
  // optimistic concurrency: WHERE id = ? AND status = ?
  const updated = await db.update(projects)
    .set({ status: toStatus, statusChangedAt: sql`now()` })
    .where(and(eq(projects.id, projectId), eq(projects.status, fromStatus)))
    .returning({ id: projects.id })
  if (updated.length === 0) return { ok: false, message: '다른 사용자가 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요.' }
  revalidatePath('/dashboard')
  return { ok: true }
}
```

`statusChangedAt` 컬럼은 SPEC-DB-001 산출 스키마에 따라 명칭이 다를 수 있음 — Run 단계에 실제 컬럼명으로 매핑.

### 5.5 캘린더 색상 매핑

```ts
// src/lib/dashboard/types.ts
export const INSTRUCTOR_COLOR_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
] as const
export function colorForInstructor(id: string): string {
  // simple deterministic hash → palette index
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return INSTRUCTOR_COLOR_PALETTE[h % INSTRUCTOR_COLOR_PALETTE.length]
}
```

### 5.6 알림 미리보기 placeholder

```ts
// src/lib/dashboard/queries.ts
export async function getNotificationPreview(_operatorId: string): Promise<NotificationPreview> {
  // SPEC-NOTIF-001 will replace this body. Until then, return zero state.
  return { unanswered: 0, conflict: 0, deadline: 0, updatedAt: null }
}
```

타입 안정성: `NotificationPreview`는 `src/lib/dashboard/types.ts`에 단일 정의. SPEC-NOTIF-001이 본 함수 본문만 갈아끼우면 호출처(`<NotificationPreview>` 컴포넌트) 0건 변경.

### 5.7 캐싱 전략

- `export const revalidate = 30` — `/dashboard`, `/dashboard/calendar` 모두 적용
- Server Action 후 `revalidatePath('/dashboard')` — 즉시 fresh
- 클라이언트 측 `useMutation` / TanStack Query 미사용 (이번 SPEC 범위) — RSC + Server Action으로 충분
- 추후 SPEC-NOTIF-001이 Realtime을 도입할 경우 본 SPEC의 `revalidate = 30`은 그대로 유지하고 알림 영역만 client-side subscribe 추가 가능

### 5.8 RLS 의존

본 SPEC은 명시적 권한 코드 없음. 모든 DB 호출은 SPEC-DB-001 RLS 정책에 위임:
- `projects` 테이블: operator/admin SELECT all (RLS 정책에서 이미 정의)
- `settlements` 테이블: operator/admin SELECT all
- `schedules` / `assignments`: operator/admin SELECT all

instructor 토큰이 본 페이지에 도달하지 않도록 SPEC-AUTH-001의 `(operator)/layout.tsx`가 보호하므로, 본 SPEC의 쿼리는 항상 operator/admin 컨텍스트에서 실행됨을 가정한다.

### 5.9 캘린더 라이브러리 선정 (Run 단계 결정 항목)

후보:
1. `react-big-calendar` + `date-fns` + `date-fns-tz` — 가벼움, RSC 친화적, 한국어 로케일 지원
2. `@fullcalendar/react` (`tech.md` 명시 디폴트) — 풍부한 기능, 번들 크기 큼

본 SPEC plan 단계는 두 후보를 모두 명시하고, Run M5에서 1시간 spike로 결정. 결정 결과는 plan.md M5 노트에 기록.

---

## 6. 컴포넌트 트리 (Component Tree)

```
/dashboard (Server Component)
├── <KpiGrid>                       (server)
│   └── <KpiCard> × 4               (server, may be <a> or <div>)
├── <StatusFilter>                  ('use client', URL search-param sync)
│   └── <button aria-pressed> × 5
├── <KanbanBoard>                   (server)
│   └── <KanbanColumn> × 5          (server)
│       └── <KanbanCard> × N        (server, click → /projects/[id])
│           └── <StatusTransitionButton>  ('use client', Server Action)
├── <NotificationPreview>           (server, placeholder data)
│   └── 3 lines (미응답/충돌/D-Day)
└── <a href="/dashboard/calendar">강사 일정 보기</a>

/dashboard/calendar (Server Component)
├── <InstructorCalendar>            ('use client', month/week toggle)
│   └── events colored by instructor
└── <a href="/dashboard">대시보드로 돌아가기</a>
```

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ KPI 4종 단일 SQL aggregate로 집계 + 한국어 라벨 + KRW 포맷
- ✅ 상태 멀티 필터 → URL `?status=...` 갱신 + 칸반 dim/full opacity 분기
- ✅ 칸반 5컬럼 + 상태 전환 버튼 클릭 → Server Action → revalidate → 카드 이동 재렌더
- ✅ 캘린더 월/주 토글 + 강사별 색상 결정적 매핑 + Asia/Seoul 표시
- ✅ 알림 미리보기 placeholder 0/0/0 + helper text 노출
- ✅ 빈/오류 상태: `loading.tsx`, `error.tsx`, `<EmptyState>`, `<ErrorState>` 모두 한국어
- ✅ instructor 토큰 접근 → SPEC-AUTH-001 silent redirect 정상 동작 (본 SPEC 코드 변경 0)
- ✅ axe DevTools `/dashboard` + `/dashboard/calendar` critical 0
- ✅ Lighthouse Accessibility ≥ 95 (2개 페이지 평균)
- ✅ LCP < 2.5초

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| `STATUS_COLUMN_MAP`의 enum 값이 SPEC-DB-001 실제 enum과 불일치 → 런타임 빈 칸반 | 운영 표시 오류 | Run 단계 첫 작업으로 `supabase/migrations/20260427000030_*.sql`에서 실제 enum 값 grep + 본 SPEC 매핑 확정. type test로 enum 값 일치 컴파일 검증. |
| KPI 단일 쿼리가 인덱스 부재로 느림 (LCP 저하) | 성능 | `projects.status`, `settlements.status` 인덱스 존재 검증. 없으면 SPEC-DB-001 후속 마이그레이션으로 보완 (본 SPEC 외). 1초 초과 시 워닝 로그(REQ-DASH-DATA-005)로 모니터링. |
| 칸반 컬럼당 100건 LIMIT가 운영 데이터 늘어나며 부족 | UX | "100+개 — 전체 보기" 링크로 SPEC-PROJECT-001로 확장. SPEC-PROJECT-001 미구현 시 현재는 미스 link이지만 MVP 데이터 규모에서는 발생 가능성 낮음. |
| 상태 전환 동시성: 두 사용자가 동시에 같은 카드 이동 | 데이터 정합성 | optimistic concurrency (`WHERE id = ? AND status = fromStatus`)로 두 번째 호출은 0 row 반환 → 한국어 메시지로 안내. |
| `revalidate = 30s`가 매출 보고용 KPI 정확도와 충돌 | 데이터 fresh | 30초는 운영 화면 적정선. 보고용 정확 수치는 [F-302] SPEC-ADMIN-001에서 `revalidate = 0` 또는 dynamic으로 처리. |
| 캘린더 라이브러리 결정 지연 (FullCalendar vs react-big-calendar) | 일정 지연 | plan 단계에 두 후보 명시 + Run M5에 1시간 spike 결정. 결정 미루기 방지를 위해 default fallback은 `react-big-calendar`로 명시. |
| `getNotificationPreview` placeholder가 SPEC-NOTIF-001 구현 시 시그니처 변경 강요 | 재작업 | 본 SPEC에서 `NotificationPreview` 타입을 단일 출처로 확정. SPEC-NOTIF-001은 함수 body만 교체. 시그니처 변경 시 후속 SPEC도 호출처 0건 변경되도록 type lock. |
| 색상 팔레트 8색 사이클 시 동일 강사 관계자가 같은 색을 보고 혼동 | UX | 강사 이름이 항상 시각 텍스트 + aria-label로 노출되도록 강제 (REQ-DASH-A11Y-004). 운영자 ≤ 8명 가정에서는 충돌 빈도 낮음. |
| RSC + Client 컴포넌트 hydration mismatch (URL filter 초기값) | UX (flash) | `<StatusFilter>`는 `useSearchParams` 훅으로 클라이언트 측에서만 active set 계산. 서버는 항상 raw 칸반 렌더, 클라이언트가 dim/full 분기. |
| `react-big-calendar` 한국어 로케일 미지원 | 라벨 영문 노출 | `date-fns/locale/ko` + `culture` prop으로 KO 적용. spike 단계 검증 항목. |
| Drizzle `FILTER (WHERE ...)` 표현이 raw SQL 의존 | 타입 안전성 저하 | `sql<number>\`count(*) FILTER (...)\`` 표현은 Drizzle 표준 패턴. 단위 테스트로 결과 타입 검증. |
| 칸반 카드 클릭 시 `/projects/[id]` 404 (SPEC-PROJECT-001 미존재) | UX 일시적 | spec.md §3 Exclusions에 명시. acceptance.md에서 의도된 동작으로 표기. SPEC-PROJECT-001 머지와 함께 자동 해소. |
| RLS 정책 미세 차이로 admin이 보는 칸반 ≠ operator | 시각적 혼동 | RLS는 SPEC-DB-001 결정사항. 본 SPEC은 RLS에 위임. acceptance.md EC에 admin / operator 동일 view 검증 시나리오 포함. |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md` §3.1 [F-201], §5 KPI 측정 방법(상태 전환 타임스탬프)
- `.moai/project/structure.md` §3.2 프로젝트 상태 머신 (5컬럼 매핑 근거)
- `.moai/project/tech.md` §2.1 (캘린더 라이브러리 후보 — FullCalendar 기본), §5 (성능 목표 LCP < 2.5s)
- `.moai/specs/SPEC-DB-001/spec.md`: `projects.status` enum, `assignments`, `schedules`, `settlements` 테이블, RLS 정책
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole(['operator','admin'])`, `getCurrentUser()`, `(operator)/layout.tsx` 가드
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: `<AppShell userRole>`, sidebar `/dashboard` 진입점, 디자인 토큰
- 외부 (verified 2026-04-27, plan 단계 spike에서 재확인 예정):
  - https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration
  - https://nextjs.org/docs/app/api-reference/functions/revalidate-path
  - https://orm.drizzle.team/docs/select#filter-clauses
  - https://github.com/jquense/react-big-calendar
  - https://date-fns.org/docs/Time-Zones

---

_End of SPEC-DASHBOARD-001 spec.md_
