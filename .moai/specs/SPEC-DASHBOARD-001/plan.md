# SPEC-DASHBOARD-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 개발 모드는 `quality.development_mode = tdd`(default)에 따라 **RED-GREEN-REFACTOR** 사이클로 진행한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 — `projects.status` enum, `assignments`, `schedules`, `settlements` 테이블 및 RLS 정책 적용
- ✅ SPEC-AUTH-001 완료 — `requireRole(['operator','admin'])`, `getCurrentUser()`, `(operator)/layout.tsx` 가드, `mapAuthError` 한국어 매핑
- ✅ SPEC-LAYOUT-001 완료 — `<AppShell userRole>`, sidebar `/dashboard` 메뉴 진입점, 디자인 토큰, UI 프리미티브 11종
- ✅ Next.js 16 (App Router) + React 19 + Tailwind v4 + Drizzle 부트스트랩
- ✅ shadcn/ui primitives, `lucide-react`, `react-hook-form`, `zod`

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (도메인 타입 + STATUS_COLUMN_MAP)이 모든 후속 마일스톤의 선행
- M2 (queries + format 헬퍼) → M3 (KPI), M4 (칸반 read), M6 (캘린더), M7 (알림)의 선행
- M3 (KPI)·M4 (칸반 read)는 병렬 가능
- M5 (상태 전환 Server Action)는 M4 완료 후
- M6 (캘린더)는 M2 완료 후 독립 진행 가능
- M7 (알림 placeholder)는 M1 타입 정의 후 즉시 가능
- M8 (loading/error/empty 상태) 은 M3-M7 완료 후 폴리시
- M9 (a11y + 한국어 폴리시)는 가장 마지막

### 1.3 후속 SPEC을 위한 산출물 약속

- `STATUS_COLUMN_MAP` 상수는 SPEC-PROJECT-001이 동일 매핑으로 리스트 화면 구성 시 재사용
- `NotificationPreview` 타입은 SPEC-NOTIF-001이 함수 본문만 교체하면 호출처 0 변경
- `INSTRUCTOR_COLOR_PALETTE` + `colorForInstructor(id)` 헬퍼는 SPEC-SCHED-001 / SPEC-INSTR-001에서 동일 색상 정책 사용
- `getProjectsByStatus(filters)`는 SPEC-PROJECT-001 리스트 페이지에서도 활용 가능 (검색 추가 후 확장)
- `transitionProjectStatusAction`은 본 SPEC 외 위치(예: 프로젝트 상세 페이지)에서도 import 가능한 표준 도메인 액션

---

## 2. 마일스톤 분해 (Milestones, TDD RED-GREEN-REFACTOR)

### M1 — 도메인 타입 + STATUS_COLUMN_MAP [Priority: High]

**산출물:**
- `src/lib/dashboard/types.ts`:
  - `ProjectStatus` enum (SPEC-DB-001 실제 enum 값 grep 후 동기화)
  - `KanbanColumnLabel` 타입: `'의뢰' | '강사매칭' | '컨펌' | '진행' | '정산'`
  - `STATUS_COLUMN_MAP: Record<KanbanColumnLabel, ProjectStatus[]>` (단일 출처)
  - `ProjectKanbanRow` 타입 (id, title, status, startDate, endDate, clientId, clientName)
  - `KpiSummary` 타입 (`requestCount`, `confirmedCount`, `inProgressCount`, `unsettledTotal`)
  - `ScheduleEvent` 타입 (id, instructorId, instructorName, projectTitle, start, end)
  - `NotificationPreview` 타입 (`unanswered`, `conflict`, `deadline`, `updatedAt: string | null`)
  - `INSTRUCTOR_COLOR_PALETTE` 상수 (8색)
  - `colorForInstructor(id: string): string` 헬퍼
- `src/lib/dashboard/transitions.ts`:
  - `STATUS_FORWARD_PATH: ProjectStatus[]` (canonical 순서)
  - `canTransition(from: ProjectStatus, to: ProjectStatus): boolean`
  - `nextStatus(from: ProjectStatus): ProjectStatus | null`

**RED 단계:**
- `tests/unit/dashboard/transitions.test.ts`:
  - `canTransition('의뢰', '강사매칭')` → true
  - `canTransition('의뢰', '진행')` → false (skip 금지)
  - `canTransition('진행', '의뢰')` → false (역방향 금지)
  - `nextStatus('정산')` → null (terminal)
- `tests/unit/dashboard/types.test.ts`:
  - `STATUS_COLUMN_MAP` 5개 키 모두 존재
  - 각 enum 값이 정확히 1개 컬럼에 매핑됨 (중복 / 누락 검증)
  - `colorForInstructor('same-id')` 반복 호출 시 동일 결과 (결정성)
  - `colorForInstructor` 결과가 `INSTRUCTOR_COLOR_PALETTE`에 포함됨

**GREEN 단계:**
- 위 타입/상수/헬퍼 최소 구현
- `pnpm vitest run dashboard/` 통과

**REFACTOR 단계:**
- enum import를 SPEC-DB-001 산출 schema에서 직접 추론 (가능하면 `typeof projects.status._.dataType` 등)
- 한국어 enum 값 / 영문 식별자 혼용 시 명확화

**검증:**
- `pnpm tsc --noEmit` 0 에러
- 단위 테스트 통과
- ESLint 통과

**연관 EARS:** REQ-DASH-KANBAN-001, REQ-DASH-NOTIFY-001, REQ-DASH-CALENDAR-003/007, REQ-DASH-TRANSITION-002

---

### M2 — Queries + Format 헬퍼 [Priority: High]

**산출물:**
- `src/lib/dashboard/queries.ts` (`import 'server-only'` 적용):
  - `getKpiSummary(): Promise<KpiSummary>` — 단일 SQL aggregate
  - `getProjectsByStatus(activeColumns: KanbanColumnLabel[]): Promise<Map<KanbanColumnLabel, ProjectKanbanRow[]>>`
    - 활성 컬럼이 비어있으면 5컬럼 모두 반환
    - LIMIT 100 (전체)
    - 각 컬럼별 그룹화는 메모리에서 수행
  - `getInstructorScheduleRange(from: Date, to: Date): Promise<ScheduleEvent[]>`
  - `getNotificationPreview(operatorId: string): Promise<NotificationPreview>` — placeholder body
  - `transitionProjectStatus(projectId: string, fromStatus: ProjectStatus, toStatus: ProjectStatus): Promise<{ ok: boolean; reason?: 'forbidden_transition' | 'concurrent_modified' | 'rls_denied' }>`
- `src/lib/dashboard/format.ts`:
  - `formatKrw(amount: number): string` (Intl.NumberFormat ko-KR currency KRW)
  - `formatKstDate(date: Date | string): string` (date-fns-tz, `Asia/Seoul`)
  - `formatKstDateRange(start, end): string`
  - `formatDDay(target: Date): string` (예: `D-3`, `D-Day`, `D+1`)

**RED 단계:**
- `tests/unit/dashboard/format.test.ts`:
  - `formatKrw(12_400_000)` → `'₩12,400,000'`
  - `formatKstDate('2026-04-27T00:00:00Z')` → KST 기준 `'2026-04-27 (월)'` 같은 형태 (정확한 포맷은 결정)
  - `formatDDay(today)` → `'D-Day'`
  - `formatDDay(today + 3d)` → `'D-3'`
- `tests/integration/dashboard/queries.test.ts` (Vitest + 테스트 DB, SPEC-DB-001 seed):
  - `getKpiSummary()` 결과 4 필드 모두 number
  - `getProjectsByStatus([])` → 5컬럼 Map, 각 컬럼은 array (빈 가능)
  - `getProjectsByStatus(['의뢰'])` → '의뢰' 컬럼만 요소 반환, 나머지는 빈 배열
  - `getNotificationPreview('any-id')` → `{ unanswered: 0, conflict: 0, deadline: 0, updatedAt: null }`
  - `transitionProjectStatus(seededId, '의뢰', '강사매칭')` → `{ ok: true }`
  - `transitionProjectStatus(seededId, '의뢰', '진행')` → `{ ok: false, reason: 'forbidden_transition' }`
  - 동시 동일 호출 → 두 번째는 `{ ok: false, reason: 'concurrent_modified' }`

**GREEN 단계:**
- Drizzle 쿼리 작성
- 단일 aggregate 쿼리 검증 (`logger`로 query count 1 확인)

**REFACTOR 단계:**
- 쿼리 함수가 1초 초과 시 console.warn (REQ-DASH-DATA-005)
- 100건 LIMIT 검증

**검증:**
- 통합 테스트 통과 (테스트 DB 필요 — 없을 시 mock supabase로 대체)
- `pnpm tsc --noEmit` 0 에러
- `EXPLAIN ANALYZE` 결과 KPI 쿼리 단일 실행 검증 (수동)

**연관 EARS:** REQ-DASH-KPI-002/003, REQ-DASH-KANBAN-003, REQ-DASH-CALENDAR-001/004, REQ-DASH-NOTIFY-002, REQ-DASH-DATA-001/004/005, REQ-DASH-TRANSITION-001/002/004

---

### M3 — KPI 위젯 4종 [Priority: High]

**산출물:**
- `src/components/dashboard/kpi-card.tsx`:
  - props: `{ label, value: string | number; ariaLabel; href?: string; helper?: string }`
  - `href` 있으면 `<a>` 렌더, 없으면 `<div>`
  - `aria-label` 통합 (라벨 + 값)
- `src/components/dashboard/kpi-grid.tsx`:
  - props: `{ summary: KpiSummary }`
  - 4 카드 grid (responsive: 4cols → 2cols → 1col)
  - 보조 sr-only summary 텍스트 ("총 4종 KPI: ...")
- `src/app/(operator)/dashboard/page.tsx`에 `<KpiGrid summary={await getKpiSummary()} />` 통합

**RED 단계:**
- `tests/unit/components/dashboard/kpi-card.test.tsx`:
  - render with href → `<a>` 태그 출력 확인
  - render without href → `<div>` 출력 확인
  - `aria-label` = `<label> <value>`
  - value=null/undefined → `'—'` 표시 (REQ-DASH-KPI-006)
- `tests/unit/components/dashboard/kpi-grid.test.tsx`:
  - 4 cards 렌더 + 라벨이 `의뢰 건수 / 배정확정 건수 / 교육중 건수 / 미정산 합계`
  - `미정산 합계`만 KRW 포맷 적용
  - `미정산 합계`는 href 없음 (SPEC-SETTLE-001 미존재)

**GREEN/REFACTOR:**
- shadcn/ui `Card` primitive 활용
- 한국어 라벨 고정 상수화

**검증:**
- 단위 테스트 통과
- 시각 검증: 4 카드 grid 노출
- axe DevTools KPI 영역 critical 0

**연관 EARS:** REQ-DASH-KPI-001~007, REQ-DASH-A11Y-002

---

### M4 — 칸반 보드 (read) + 상태 필터 [Priority: High]

**산출물:**
- `src/components/dashboard/status-filter.tsx` (`'use client'`):
  - 5 토글 버튼
  - `useSearchParams` + `useRouter().replace`로 URL 동기화
  - `aria-pressed` 동적
  - `<div role="group" aria-label="프로젝트 상태 필터">` 래퍼
  - 알 수 없는 status 값은 silently 무시
- `src/components/dashboard/kanban-board.tsx`:
  - props: `{ columns: Map<KanbanColumnLabel, ProjectKanbanRow[]>; activeColumns: KanbanColumnLabel[] }`
  - 5 `<KanbanColumn>` 렌더
  - 비활성 컬럼은 dim 처리 (Tailwind `opacity-40`), 활성/전체는 full opacity
- `src/components/dashboard/kanban-column.tsx`:
  - props: `{ label, rows, isActive }`
  - 컬럼 헤더 + 카드 리스트 + 빈 상태 + "100+개 — 전체 보기" 링크
- `src/components/dashboard/kanban-card.tsx`:
  - props: `{ row: ProjectKanbanRow; nextLabel?: KanbanColumnLabel }`
  - 카드 클릭 → `<a href="/projects/{id}">`
  - 다음 상태 버튼 영역 (M5에서 활성화)
- `src/components/dashboard/empty-state.tsx`:
  - props: `{ message }`
  - `role="status"` + 한국어
- `src/app/(operator)/dashboard/page.tsx`에 통합:
  - `searchParams.status`를 파싱
  - `getProjectsByStatus`에 활성 컬럼 전달

**RED 단계:**
- `tests/unit/components/dashboard/status-filter.test.tsx`:
  - 첫 렌더에서 URL의 `?status=의뢰,진행` 반영 → 2개 버튼 active
  - 클릭 시 URL 갱신 (`router.replace` 호출 인자 검증)
  - `aria-pressed` 분기
  - 알 수 없는 value는 무시
- `tests/unit/components/dashboard/kanban-board.test.tsx`:
  - 5 컬럼 정확한 순서 + 한국어 라벨
  - activeColumns가 비어있으면 모두 full opacity
  - activeColumns에 일부만 → 나머지는 `opacity-40` 클래스
  - 빈 컬럼 → `<EmptyState>` 메시지 노출
- `tests/unit/components/dashboard/kanban-card.test.tsx`:
  - 카드 클릭 → `/projects/{id}` 링크
  - `client_name`, 일정 표시
  - 100+ 케이스 → 전체 보기 링크 노출

**GREEN/REFACTOR:**
- Tailwind 클래스 정리, shadcn `Card`/`Badge` 재사용

**검증:**
- 단위 테스트 통과
- 수동 테스트: URL `/dashboard?status=의뢰,진행` 직접 입력 → 2개 컬럼 강조

**연관 EARS:** REQ-DASH-FILTER-001~007, REQ-DASH-KANBAN-001~007, REQ-DASH-A11Y-001/003

---

### M5 — 상태 전환 Server Action + 버튼 [Priority: High]

**산출물:**
- `src/app/(operator)/dashboard/actions.ts`:
  - `transitionProjectStatusAction(projectId, fromStatus, toStatus)` Server Action
  - `requireRole(['operator', 'admin'])` 호출
  - `transitionProjectStatus` 도메인 함수 위임
  - 결과에 따라 `revalidatePath('/dashboard')` 호출 (성공 시)
  - 실패 시 한국어 메시지 반환
- `src/components/dashboard/status-transition-button.tsx` (`'use client'`):
  - props: `{ projectId, fromStatus, toStatus, toLabel }`
  - 클릭 → Server Action 호출
  - 낙관 UI: 버튼 disabled + spinner
  - 결과 fail → toast (한국어 메시지)
  - 결과 success → revalidate가 자동 처리, 별도 client cache 갱신 X
  - `role="status"` 또는 `role="alert"` 라이브 영역으로 결과 announce (REQ-DASH-A11Y-006)
- `<KanbanCard>`에 버튼 통합:
  - 마지막 컬럼('정산')이면 버튼 미렌더
  - 그 외는 다음 라벨 표시 (`강사매칭으로` 등)

**RED 단계:**
- `tests/integration/dashboard/transition.test.ts` (테스트 DB):
  - 정상 forward 전환 → DB UPDATE 확인 + revalidatePath mock 호출
  - skip / 역방향 → action `{ ok: false, message: '허용되지 않는 상태 전환입니다.' }`
  - 동시성 (mock) → `{ ok: false, message: '다른 사용자가 먼저 ...' }`
  - instructor 토큰 → `requireRole`이 redirect 시도 (mock)
- `tests/unit/components/dashboard/status-transition-button.test.tsx`:
  - 클릭 → action 호출 (mocked)
  - 성공 시 toast 메시지 / `role="status"`
  - 실패 시 toast 메시지 / `role="alert"`
  - 마지막 상태 → 버튼 미렌더

**GREEN/REFACTOR:**
- 낙관 UI 단순화
- 에러 메시지를 `mapAuthError` 또는 dashboard 전용 매퍼로 통일

**검증:**
- 통합 테스트 통과
- 수동 E2E: 카드 클릭 → 버튼 클릭 → 컬럼 이동 확인

**연관 EARS:** REQ-DASH-TRANSITION-001~006, REQ-DASH-DATA-003, REQ-DASH-A11Y-006

---

### M6 — 강사 일정 캘린더 [Priority: High]

**산출물:**
- 캘린더 라이브러리 결정 spike (1시간):
  - 후보: `react-big-calendar` vs `@fullcalendar/react`
  - 평가: SSR/RSC 친화도, 번들 크기, 한국어 로케일, 접근성
  - 결정 기록: 본 plan.md 하단 "Spike 결과" 섹션에 추가
- `pnpm add` 결정된 라이브러리 + `date-fns` + `date-fns-tz`
- `src/components/dashboard/instructor-calendar.tsx` (`'use client'`):
  - props: `{ events: ScheduleEvent[]; defaultView?: 'month' | 'week' }`
  - 월/주 토글
  - 강사별 색상 매핑 (M1 헬퍼 사용)
  - 이벤트 클릭 → tooltip/toast (강사명, 프로젝트, 시간)
  - 빈 상태 오버레이
  - `aria-label` / 시각 텍스트 모두에 강사명 노출
- `src/app/(operator)/dashboard/calendar/page.tsx`:
  - `getCurrentUser()` (운영자 컨텍스트)
  - `getInstructorScheduleRange(monthStart, monthEnd)` 호출
  - `<InstructorCalendar events={...} />` 렌더
  - `export const revalidate = 30`
  - "대시보드로 돌아가기" 링크
- `src/app/(operator)/dashboard/calendar/loading.tsx`, `error.tsx`
- `src/app/(operator)/dashboard/page.tsx`에 "강사 일정 보기" 링크 추가

**RED 단계:**
- `tests/unit/components/dashboard/instructor-calendar.test.tsx`:
  - 월/주 토글 → view 변경 (라이브러리 API 활용)
  - 동일 instructorId → 동일 색상 (M1 단위 테스트로 이미 검증됨, 컴포넌트 레벨에서는 DOM 색상 attribute 검증)
  - 이벤트에 강사명 텍스트 노출
  - 빈 events array → 오버레이 노출
- `tests/integration/dashboard/calendar.test.ts`:
  - operator 토큰으로 `/dashboard/calendar` 접근 → 200
  - instructor 토큰 → SPEC-AUTH-001가 `/me/dashboard`로 redirect (코드 변경 없이)

**GREEN/REFACTOR:**
- 라이브러리 한국어 로케일 적용
- KST timezone 일관성 검증

**검증:**
- 단위 + 통합 테스트 통과
- axe DevTools `/dashboard/calendar` critical 0
- 시각 검증: 8색 사이클, 한국어 라벨

**연관 EARS:** REQ-DASH-CALENDAR-001~008, REQ-DASH-A11Y-004

---

### M7 — 알림 미리보기 카드 (placeholder) [Priority: Medium]

**산출물:**
- `src/components/dashboard/notification-preview.tsx`:
  - props: `{ preview: NotificationPreview }`
  - 3 라인 (미응답 배정 / 일정 충돌 / D-Day) + 카운트 + 링크
  - `updatedAt === null`일 때 "알림 시스템 활성화 후 사용 가능합니다." 헬퍼 텍스트
- `src/app/(operator)/dashboard/page.tsx`에 통합

**RED 단계:**
- `tests/unit/components/dashboard/notification-preview.test.tsx`:
  - 3 라인 모두 렌더, 한국어 라벨
  - 카운트 0/0/0일 때 helper text 노출
  - 카운트 > 0일 때 helper text 미노출
  - `updatedAt !== null`일 때 helper text 미노출 (SPEC-NOTIF-001 미래 시나리오)
  - 각 라인이 `<a href="/notifications">` (404 허용)

**GREEN/REFACTOR:**
- 단순 카드 레이아웃

**검증:**
- 단위 테스트 통과

**연관 EARS:** REQ-DASH-NOTIFY-001~005

---

### M8 — Loading / Error / Empty 상태 [Priority: Medium]

**산출물:**
- `src/app/(operator)/dashboard/loading.tsx`:
  - KPI grid skeleton (4 카드)
  - 상태 필터 skeleton (5 버튼)
  - 칸반 보드 skeleton (5 컬럼 × 2 카드)
  - 알림 미리보기 skeleton
- `src/app/(operator)/dashboard/error.tsx`:
  - props: `{ error: Error; reset: () => void }`
  - 한국어 안내 + "다시 시도" 버튼
  - raw error 미노출
- `src/components/dashboard/error-state.tsx`:
  - 칸반/캘린더 내부 부분 실패 시 사용
  - `role="alert"` + 한국어 + 재시도 링크
- `src/app/(operator)/dashboard/calendar/loading.tsx`, `error.tsx` 동일 패턴

**RED 단계:**
- `tests/unit/components/dashboard/error-state.test.tsx`:
  - `role="alert"`
  - 메시지 한국어
  - 재시도 링크 노출
- 수동 테스트:
  - 일부 query에 mock 에러 주입 → error.tsx 동작 확인

**GREEN/REFACTOR:**
- skeleton CSS 단순화 (Tailwind `animate-pulse`)

**검증:**
- 시각 검증: loading state, error state 모두 자연스러운 UX

**연관 EARS:** REQ-DASH-STATE-001~004, REQ-DASH-KANBAN-007

---

### M9 — A11y + 한국어 + 성능 폴리시 [Priority: Medium]

**산출물 / 검증:**
- 모든 인터랙티브 요소 키보드 도달성 수동 검증 (Tab 순서)
- KPI 카드 / 칸반 카드 / 알림 라인 → `aria-label` 통일
- 캘린더 이벤트 → 색상 + 텍스트 이중 표현 검증
- axe DevTools 스캔: `/dashboard`, `/dashboard/calendar` critical 0, serious 0
- Lighthouse Accessibility: 2개 페이지 평균 ≥ 95
- LCP 측정 (Lighthouse 또는 Chrome DevTools): `/dashboard` < 2.5s
- 한국어 라벨 / 메시지 / 빈 상태 / 에러 모두 검토
- `tests/unit/dashboard/i18n.test.ts` (선택):
  - 모든 export된 한국어 상수가 한글 포함 검증

**RED 단계:**
- M1-M8의 단위 테스트가 이미 a11y 일부 검증 (`role`, `aria-pressed`, `aria-label`)
- 본 마일스톤은 통합 a11y 게이트

**GREEN/REFACTOR:**
- focus ring, contrast 검증 후 부족하면 SPEC-LAYOUT-001 토큰 활용 보강

**연관 EARS:** REQ-DASH-A11Y-001~007, REQ-DASH-KPI-007, REQ-DASH-STATE-002

---

### M10 — 문서 + 후속 SPEC 핸드오프 [Priority: Low]

**산출물:**
- `.moai/specs/SPEC-DASHBOARD-001/progress.md` (진행 기록)
- `.moai/docs/dashboard-architecture.md` (1-2 page):
  - 데이터 흐름 다이어그램
  - SPEC-NOTIF-001 / SPEC-PROJECT-001 핸드오프 가이드
  - `STATUS_COLUMN_MAP` 단일 출처 약속
- `.moai/specs/SPEC-DASHBOARD-001/spec.md` HISTORY 항목에 완료 시점 entry 추가
- `status: draft` → `completed`로 전환

---

## 3. 진행 순서 (Sequencing)

```
M1 (types + STATUS_COLUMN_MAP + transitions)
   ↓
M2 (queries + format) ────────┐
   ↓                          │
   ├─→ M3 (KPI)               │
   ├─→ M4 (칸반 read + filter)│
   │     ↓                    │
   │   M5 (전환 Server Action)│
   ├─→ M6 (캘린더) ───────────┤  (라이브러리 spike 포함)
   └─→ M7 (알림 placeholder)  │
                              ↓
                          M8 (loading/error/empty)
                              ↓
                          M9 (a11y + 한국어 + LCP 폴리시)
                              ↓
                          M10 (docs + 핸드오프)
```

병렬 가능: M3, M4, M6, M7은 M2 완료 후 서로 독립. M5는 M4의 칸반 카드에 통합되므로 M4 후에 진행. M6는 라이브러리 spike 결정이 선행.

---

## 4. 위험 (Risks) 및 완화

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|-------|------|------|
| R1 | `STATUS_COLUMN_MAP` enum 값이 SPEC-DB-001 실제 enum과 불일치 → 칸반 빈 채로 노출 | M | H | M1 첫 작업으로 SPEC-DB-001 마이그레이션 grep + 본 SPEC types에 동기화. 단위 테스트 (`tests/unit/dashboard/types.test.ts`)에 enum 일치 컴파일 검증 포함. |
| R2 | KPI 단일 쿼리가 인덱스 부재로 1초 초과 | M | M | M2 통합 테스트에 query 시간 측정 + 1초 초과 시 fail. 인덱스 누락 발견 시 SPEC-DB-001-FIXUP-XXX 후속 SPEC 제안 (본 SPEC 외). |
| R3 | 캘린더 라이브러리 spike 결정 지연 | M | M | M6 진입 시 1시간 timebox spike. 결정 미확정 시 default `react-big-calendar` 채택 (`tech.md`의 FullCalendar는 추후 재검토). |
| R4 | `react-big-calendar` 한국어 로케일 / 접근성 부족 | L | M | spike 단계에서 axe DevTools로 검증. 부족 시 FullCalendar 또는 자체 month grid 컴포넌트로 fallback. |
| R5 | 상태 전환 동시성 race (두 사용자 동시 클릭) | M | L | optimistic concurrency (`WHERE id AND status = fromStatus`)로 두 번째 호출 0 row → 한국어 메시지. 단위 테스트로 검증. |
| R6 | revalidatePath 후에도 stale 데이터 노출 (Next.js 캐시 버그) | L | M | Server Action 응답에 `revalidate` 명시. 클라이언트는 페이지 자동 리로드 활용. 발견 시 `router.refresh()` 추가 호출 fallback. |
| R7 | 칸반 100건 LIMIT가 부족한 운영 데이터 발생 | L | L | "100+개 — 전체 보기" 링크로 SPEC-PROJECT-001 위임. 본 SPEC 코드 변경 0. |
| R8 | `getNotificationPreview` placeholder가 SPEC-NOTIF-001 구현 시 시그니처 변경 강요 | L | M | 본 SPEC에서 `NotificationPreview` 타입 단일 출처 확정. SPEC-NOTIF-001 구현 시 함수 body만 교체. type lock으로 호출처 변경 0 보장. |
| R9 | 상태 필터 hydration mismatch (server initial vs client URL) | M | L | `<StatusFilter>`는 클라이언트 컴포넌트로 `useSearchParams` 활용, 서버는 raw 5컬럼 그대로 렌더 + 클라이언트가 dim/full 분기. SSR 차이 없음. |
| R10 | RLS 정책 미세 차이로 admin이 보는 칸반 ≠ operator | L | L | acceptance.md EC에 두 토큰 동일 view 검증 포함. 발견 시 SPEC-DB-001-FIXUP 또는 본 SPEC 명시 WHERE 조건 추가 (RLS 우회 안 함). |
| R11 | Drizzle `FILTER (WHERE)` 표현 타입 안전성 저하 (raw SQL) | L | L | 단위 테스트로 결과 타입 (`number`) 검증. `sql<number>` 타입 어노테이션 강제. |
| R12 | 캘린더 페이지 LCP 가 큰 라이브러리 영향으로 2.5초 초과 | L | M | spike 단계에 번들 크기 측정. dynamic import + Suspense 적용 가능. M9에서 LCP 측정 + 미달 시 라이브러리 lazy load. |
| R13 | `loading.tsx` skeleton이 실제 layout과 어긋나서 layout shift 발생 | M | L | skeleton 크기를 실제 컴포넌트와 px 단위 일치시킴. M8 시각 검증. |
| R14 | 칸반 카드 `/projects/{id}` 클릭 시 SPEC-PROJECT-001 미존재로 404 | H | L | spec.md §3 Exclusions 명시. acceptance.md 시나리오에 의도된 동작으로 표시. SPEC-PROJECT-001 머지로 자동 해소. |

---

## 5. Spike 결과 (M6 진입 시 채워짐)

> 본 섹션은 M6 라이브러리 결정 spike 후 작성. plan 단계에서는 비어있음.

- 결정 라이브러리: `(TBD)`
- 결정 사유: `(TBD)`
- 번들 크기 영향: `(TBD)`
- 한국어 로케일 지원: `(TBD)`
- axe DevTools critical: `(TBD)`

---

## 6. 완료 정의 (Definition of Done)

본 SPEC은 다음 모든 조건이 충족될 때 **완료**로 간주한다:

1. ✅ `pnpm build` 0 error / 0 critical warning
2. ✅ `pnpm tsc --noEmit` 0 type error
3. ✅ `pnpm exec eslint .` 0 critical
4. ✅ `pnpm vitest run dashboard/` 모든 테스트 통과 (단위 + 통합)
5. ✅ KPI 4 카드 정확한 라벨 + KRW 포맷 + 단일 SQL aggregate (수동 EXPLAIN 검증)
6. ✅ 상태 멀티 필터 → URL `?status=...` 갱신 + dim/full opacity 분기 동작
7. ✅ 칸반 5컬럼 + 100건 LIMIT + 빈 컬럼 EmptyState 노출
8. ✅ 상태 전환 버튼 클릭 → 카드 다음 컬럼으로 이동 + revalidate 동작
9. ✅ 동시성 시뮬레이션 → 두 번째 호출 한국어 에러 메시지
10. ✅ 캘린더 월/주 토글 + 8색 강사 매핑 + Asia/Seoul 표시
11. ✅ 알림 미리보기 placeholder 0/0/0 + helper text 노출
12. ✅ instructor 토큰 → SPEC-AUTH-001 silent redirect 정상 동작 (본 SPEC 코드 변경 0)
13. ✅ axe DevTools `/dashboard` + `/dashboard/calendar` critical 0, serious 0
14. ✅ Lighthouse Accessibility ≥ 95 (2개 페이지 평균)
15. ✅ LCP `/dashboard` < 2.5초 (Chrome DevTools 또는 Lighthouse)
16. ✅ 모든 한국어 라벨 / 빈 상태 / 에러 메시지가 한국어
17. ✅ acceptance.md Given/When/Then 시나리오 모두 PASS
18. ✅ `STATUS_COLUMN_MAP` 단일 출처가 SQL + UI 양쪽에서 사용됨을 grep으로 검증
19. ✅ `getNotificationPreview` 시그니처가 SPEC-NOTIF-001과 호환되는 placeholder로 확정 (`NotificationPreview` 타입 export)
20. ✅ HISTORY entry + `status: completed` + `updated` 일자 갱신

---

_End of SPEC-DASHBOARD-001 plan.md_
