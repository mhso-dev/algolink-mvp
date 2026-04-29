---
id: SPEC-MOBILE-001
version: 1.0.0
status: completed
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: TBD
---

# SPEC-MOBILE-001: 모바일/태블릿 반응형 UX (Mobile & Tablet Responsive UX, 320~1024px)

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. SPEC-LAYOUT-001(implemented, 2026-04-27)이 구축한 frontend 기반 레이어(앱 셸 + 디자인 토큰 + 11종 UI 프리미티브) 위에 **모바일·태블릿(320~1024px) UX**를 보완하는 후속 SPEC. SPEC-LAYOUT-001 §1.3 Out of Scope에서 명시 위임된 (1) 모바일 전용 햄버거 메뉴, (2) off-canvas sidebar, (3) 모바일 전용 레이아웃 상세를 본 SPEC이 책임진다. 대상 영역은 instructor + operator + admin 전체 셸 + 13개 페이지 컨테이너 + 복합 컴포넌트(KPI/Kanban/Calendar/Table/Form). 현재 약 27%만 반응형 처리된 상태(audit 결과)에서 100%로 끌어올린다. 신규 디자인 토큰 추가(mobile-spacing, touch-target, container-mobile)는 허용하되 SPEC-LAYOUT-001이 정의한 기존 21+8+12+5+3 토큰 변경은 금지(확장만 허용). DB/백엔드/API 변경 없음(frontend-only).

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **모든 인증된 사용자(instructor / operator / admin)**가 모바일 폰(320~480px)과 태블릿(481~1024px)에서도 **데스크톱과 동등한 정보 접근성과 조작 가능성**을 누릴 수 있도록 한다. 본 SPEC의 산출물은 (a) viewport meta + safe-area-inset baseline 정정, (b) `AppShell`의 모바일 분기(햄버거 + Sheet 기반 drawer sidebar), (c) topbar의 모바일 압축 레이아웃(검색 아이콘화 + 액션 우선순위), (d) 13개 페이지 컨테이너에서 강제된 `max-w-[1440/1200/1000]` 제거 + `Container` 컴포넌트 도입, (e) KPI/칸반/캘린더/테이블/폼 5종 복합 컴포넌트의 모바일 패턴(카드 변환 / 가로 스크롤 컨테이너 / 1열 폼), (f) 터치 타겟 44×44px 보장 + `text-xs` 가독성 상향, (g) 신규 디자인 토큰 3종(mobile-spacing, touch-target, container-mobile)이다.

본 SPEC은 어떤 신규 페이지나 신규 기능도 추가하지 않는다. **기존 UI를 좁은 단말에서도 사용 가능하게 만드는 회귀(non-regression) 작업** 및 **기존 SPEC들의 화면(SPEC-DASHBOARD-001, SPEC-PROJECT-001, SPEC-INSTRUCTOR-001, SPEC-CLIENT-001, SPEC-PAYOUT-001, SPEC-ME-001 등)의 모바일 보강**만 다룬다.

### 1.2 배경 (Background)

`.moai/project/product.md`에 정의된 페르소나 3종 모두 외부 미팅·이동 중 모바일·태블릿 접근이 잦다. 강사(instructor)는 미팅 직전 일정 확인·이력서 점검을 주로 모바일에서 수행하고, 담당자(operator)는 영업 이동 중 프로젝트 상태·강사 매칭 검토를 태블릿에서 수행하며, 관리자(admin)는 정산 결재·알림 확인을 모바일에서 처리한다. 그러나 audit 결과(2026-04-29):

1. **viewport meta 누락**: `src/app/layout.tsx`에 `<meta name="viewport" content="width=device-width, initial-scale=1">` 가 없어 iOS Safari가 980px 가상 viewport로 렌더 → 모든 페이지가 1/3 축소 표시
2. **safe-area-inset 미고려**: iPhone notch / home indicator 영역에 콘텐츠 침범
3. **Sidebar 항상 240px 강제**: `src/components/app/app-shell.tsx`가 모바일에서도 240px sidebar를 렌더 → 320px 단말에서 콘텐츠 폭 80px로 압축
4. **페이지 max-w 강제**: 13개 페이지(`(operator)/dashboard`, `projects`, `instructors`, `clients`, `settlements`, `(instructor)/me/*`)가 `max-w-[1440px]` / `max-w-[1200px]` / `max-w-5xl`을 sidebar와 무관하게 적용 → 모바일에서 좌우 여백 미스매치
5. **topbar 검색 강제 폭**: `topbar.tsx:46-56`의 `<input>`이 `max-w-md`(28rem ≈ 448px)로 모바일에서 overflow
6. **칸반 보드 구버전 고정**: `src/components/dashboard/kanban-board.tsx`가 `grid grid-cols-5 min-w-[1100px]`로 강제 → 모바일에서 강제 가로 스크롤 (신버전 `KanbanBoard.tsx`는 반응형 OK)
7. **CardHeader 강제 `flex-row`**: 7곳에서 `<CardHeader className="flex-row">` 강제 → 모바일에서 헤더 텍스트 줄바꿈 깨짐
8. **터치 타겟 미달**: Avatar `h-7 w-7` (28px), Button `icon-sm` `h-7 w-7` 등이 WCAG 44px 미달
9. **`text-xs` (12px) 남용**: 모바일 가독성 부족 (Pretendard 12px on 모바일 = 시각적 10.5pt)

위 9개 결함을 방치하면 `/moai run` 후속 단계에서 페이지 단위로 패치하게 되어 **(a) 토큰 일관성이 깨지고**, **(b) 같은 패턴이 13곳에서 다르게 구현되며**, **(c) 새로 추가될 페이지에서 동일 결함이 재발**한다. 따라서 본 SPEC은 단일 회차에서 (1) baseline 정정 + (2) 표준 패턴 정의 + (3) 13개 페이지 일괄 보강을 수행한다.

기술적으로 본 SPEC은 SPEC-LAYOUT-001이 채택한 Tailwind 4 CSS-first config(`globals.css` `@theme`) + shadcn/ui Sheet primitive(추가 도입) + Radix UI Dialog 기반 focus trap을 활용한다. `@radix-ui/react-dialog`는 SPEC-LAYOUT-001에 이미 설치되어 있으므로 신규 의존성은 `vaul` 또는 shadcn `sheet` 단일 추가만 필요하다.

### 1.3 범위 (Scope)

**In Scope:**

- **Viewport baseline 정정**: `src/app/layout.tsx`에 viewport `<meta>` 추가, Next.js 16의 `export const viewport: Viewport` 패턴 사용, `themeColor`, `width=device-width`, `initial-scale=1`, `viewportFit=cover` 명시
- **Safe-area-inset 적용**: `globals.css`에 `env(safe-area-inset-*)` 토큰 + `pt-safe`, `pb-safe`, `px-safe` 유틸리티 클래스 정의. AppShell + topbar + sidebar drawer 적용
- **Dynamic viewport units**: `100vh` 대신 `100dvh` 사용 (모바일 브라우저 URL bar 대응). 신규 토큰 또는 utility class 도입
- **AppShell 모바일 분기**: 기존 `grid-cols-[240px_1fr]` (lg) 유지, **모바일(< lg)** 에서는 sidebar 미렌더 + 콘텐츠 full-width + Sheet 기반 drawer로 sidebar 호출
- **Hamburger Sheet drawer**: shadcn/ui `Sheet` 컴포넌트 추가(`src/components/ui/sheet.tsx`), topbar 좌측에 햄버거 트리거(`<Button variant="ghost" size="icon" className="lg:hidden">`), Sheet 내부에 기존 `<Sidebar>` 재사용
- **Topbar 모바일 압축**:
  - 검색 input → 모바일에서 검색 아이콘 버튼만 노출 (탭 시 풀스크린 검색 또는 inline expand)
  - 액션 우선순위: [햄버거(좌)] [페이지 타이틀(중앙)] [검색·알림·아바타(우)] 순으로 배치
  - `gap` / `padding`을 모바일 토큰으로 축소
- **페이지 컨테이너 표준화**: 13개 페이지의 `max-w-[1440px]` / `max-w-[1200px]` / `max-w-5xl` 직접 사용 제거. 신규 `<Container variant="default|narrow|wide">` 컴포넌트 도입(`src/components/app/container.tsx`). 모바일 < lg에서는 `max-w-full`, lg 이상에서만 max-width 적용.
- **표준 반응형 grid 패턴**:
  - **KPI grid**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (모바일 1열 → 태블릿 2열 → 데스크톱 4열)
  - **Kanban board**: 모바일은 `overflow-x-auto` + `min-w-min` (가로 스크롤 명시 + scroll snap), 태블릿은 `sm:grid-cols-2`, 데스크톱은 `lg:grid-cols-5`
  - **List/Card**: 모바일 1열, 태블릿 2열, 데스크톱 3열 또는 그대로
- **테이블 → 카드 변환**: instructors / clients / settlements 리스트 테이블에서 모바일 < md 시 `<table>` 숨김 + `<dl>` 또는 `<Card>` 기반 list view 노출. 신규 `<ResponsiveTable>` wrapper 또는 컴포넌트별 분기
- **폼 모바일 레이아웃**: resume-form 우선. 모바일 < md에서는 모든 `grid-cols-2`, `grid-cols-3`을 `grid-cols-1`로 축소. 폼 액션 버튼은 sticky bottom bar로 노출
- **OperatorCalendar 모바일**: `grid-cols-7` 유지하되 모바일에서 셀 폭 축소 + 텍스트 옵션 단축 ("월요일" → "월"). 또는 모바일에서 일정 list view fallback
- **FullCalendar 모바일**: 컨테이너에 모바일 전용 `headerToolbar` 단순화(prev/next/today만), `dayMaxEvents` 조정
- **CardHeader 분기**: 7곳의 `flex-row` 강제 제거 → 모바일 `flex-col` + 태블릿 이상 `sm:flex-row`. 또는 `<CardHeader className="flex flex-col sm:flex-row">` 패턴
- **터치 타겟 보장**: 모든 인터랙티브 요소(button, link, checkbox, select trigger)에 최소 `min-h-[44px] min-w-[44px]` 적용. `Button size="icon-sm"` (`h-7 w-7`)는 모바일에서 hit-area를 `::before` pseudo로 확장하거나 size를 모바일에서 `icon`(40px)으로 강제
- **Avatar 터치 가능 영역**: 클릭 가능한 Avatar는 `aria-label` + `min-h-[44px]` 보장. 표시 전용 Avatar는 그대로
- **Typography 상향**: `text-xs` 모바일 사용 시 `sm:text-xs text-sm` 패턴(모바일 14px → 태블릿 이상 12px). 또는 `text-xs`를 13px로 상향 신규 토큰
- **신규 디자인 토큰**:
  - `--mobile-spacing-xs/sm/md` (12/16/20px) — 모바일 전용 간격
  - `--touch-target-min` (44px) — WCAG 권장 최소 터치 타겟
  - `--container-mobile` (100%) / `--container-tablet` (calc(100% - 32px)) — 컨테이너 max-width
  - `--safe-top/bottom/left/right` — env() 매핑
- **구버전 파일 정리**: `src/components/dashboard/kanban-board.tsx` (구버전, `min-w-[1100px]` 강제) 사용처 확인 후 제거. 신버전 `KanbanBoard.tsx`로 일원화
- **반응형 검증 baseline**: 5개 viewport(320 / 375 / 768 / 1024 / 1440) × 라이트/다크 모드 × 3 role × 13 페이지 = 검증 매트릭스 (수동 + Playwright 자동)

**Out of Scope (Exclusions — What NOT to Build):**

- **데스크톱 와이드(1440px+) 추가 최적화**: 1440px 이상에서의 ultra-wide 레이아웃, 4K 모니터 최적화 등. SPEC-LAYOUT-001 + 본 SPEC의 lg(1024px) 기준 데스크톱 디자인 그대로 유지.
- **iOS / Android 네이티브 앱**: React Native, Capacitor, Expo 등 네이티브 빌드 없음.
- **PWA / offline / service worker**: `manifest.json`, install prompt, offline cache, push notification → 모두 후속 SPEC.
- **DB / 백엔드 API 변경**: 본 SPEC은 frontend-only. RLS, Drizzle 마이그레이션, API route 변경 없음.
- **신규 페이지 / 신규 기능**: 새 라우트, 새 도메인 화면 추가 금지. 본 SPEC은 기존 화면의 반응형 보강만 수행.
- **디자인 토큰 외부 추출 시스템**: Style Dictionary, Figma 토큰 sync, design system docs 사이트 → 후속.
- **Storybook / 컴포넌트 카탈로그**: visual regression test, Chromatic → 후속.
- **i18n / 다국어**: 한국어 단일. `next-intl` 도입 제외.
- **모바일 전용 단축키 / 제스처**: 스와이프 navigation, pull-to-refresh, long-press menu → 후속 SPEC 또는 native app 단계.
- **추가 shadcn/ui 컴포넌트**: 본 SPEC이 도입하는 것은 `Sheet` 1종만. `Drawer` (vaul), `Sonner` toast, `Tabs` 등 다른 프리미티브 추가는 본 SPEC 범위 외.
- **기존 디자인 토큰 변경**: SPEC-LAYOUT-001이 정의한 21+8+12+5+3=49 토큰의 값 수정 금지. **확장(신규 토큰 추가)만 허용**.
- **다크 모드 신규 색상 추가**: 다크 모드 토큰 변경 없음.
- **로그인/인증 화면 반응형**: `(auth)/login`, `(auth)/signup` 화면은 SPEC-AUTH-001 / SPEC-AUTH-002의 책임. 본 SPEC은 `(app)` route group 내부만 다룸.
- **이메일 / 알림 템플릿 반응형**: HTML 이메일, 푸시 알림 카드 → 별도 SPEC.
- **인쇄(print) 스타일**: `@media print` CSS → 후속.
- **Pencil 디자인 파일 작성**: `.pen` 파일 작성, 디자인 mockup → expert-frontend 또는 designer skill 별도 호출 시.

### 1.4 성공 지표 (Success Criteria)

- ✅ **viewport meta 적용**: `view-source:` 또는 DevTools에서 `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` 확인
- ✅ **5개 viewport 모두 가로 스크롤 0**: 320 / 375 / 768 / 1024 / 1440px에서 의도적 가로 스크롤 영역(kanban, table)을 제외한 모든 페이지에서 `document.documentElement.scrollWidth <= window.innerWidth + 1` (1px 부동소수 허용)
- ✅ **터치 타겟 44×44px 보장**: 모든 인터랙티브 요소(`button, a, [role=button], input[type=checkbox], [role=menuitem]`)가 `getBoundingClientRect()` 기준 width ≥ 44 AND height ≥ 44 (모바일 viewport 기준). 또는 hit-area pseudo로 확장.
- ✅ **axe DevTools 결과**: 모든 13페이지 × 5 viewport에서 critical 0건, serious 0건
- ✅ **Lighthouse Mobile**: Accessibility ≥ 90, Performance ≥ 80, Best Practices ≥ 90 (3 페이지 평균 — `/dashboard`, `/projects`, `/me/dashboard`)
- ✅ **키보드 only 순회**: 모바일 viewport에서도 Tab으로 햄버거 → topbar 액션 → main 도달 가능. Sheet drawer 열림 시 focus trap 동작.
- ✅ **다크 모드 동등 적용**: 모든 검증을 light + dark 양쪽에서 수행, 시각적 회귀(스크린샷) 0건
- ✅ **CardHeader flex-row 7곳 제거**: `grep -rn 'CardHeader.*flex-row' src/` 결과 0건 또는 명시적 `sm:flex-row` 패턴만
- ✅ **`max-w-[*px]` 페이지 직접 사용 0건**: `grep -rE 'max-w-\[[0-9]+(px|rem)\]' src/app/\(app\)/` 결과 0건. 모두 `<Container>` 컴포넌트 사용.
- ✅ **구버전 kanban-board.tsx 제거**: `src/components/dashboard/kanban-board.tsx` 파일 삭제 또는 사용처 0건 확인
- ✅ **신규 토큰 일관 사용**: `safe-area`, `min-h-[44px]`, `dvh` 등 신규 패턴 직접 사용 시 toolen이 정의된 utility 또는 토큰 통과
- ✅ **회귀 없음**: SPEC-LAYOUT-001 인수기준 6종(role-based nav, 토큰 일관성, 키보드 순회, 색상 대비, 다크 모드, 프리미티브 키보드)이 모두 PASS 유지

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 12개 모듈로 구성된다: VIEWPORT, SHELL, TOPBAR, NAV, CONTAINER, GRID, TABLE, FORM, CALENDAR, COMPONENT, TOKEN, CLEANUP.

### 2.1 REQ-MOB-VIEWPORT — Viewport baseline 정정

**REQ-MOB-VIEWPORT-001 (Ubiquitous)**
The system **shall** declare a viewport meta configuration in `src/app/layout.tsx` using Next.js 16 `export const viewport: Viewport` API with `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, and `themeColor` matched to `--color-background` (light + dark).

**REQ-MOB-VIEWPORT-002 (Ubiquitous)**
The system **shall** define safe-area-inset utility classes (`pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, `px-safe`, `py-safe`) in `globals.css` that resolve to `env(safe-area-inset-*, 0px)` and **shall** apply `pt-safe` to topbar and `pb-safe` to bottom action bars where present.

**REQ-MOB-VIEWPORT-003 (Ubiquitous)**
The system **shall** use dynamic viewport units (`100dvh`, `100dvw`) instead of static `100vh`/`100vw` for any full-screen container in AppShell or Sheet drawer to accommodate mobile browser URL bar collapse/expand behavior.

**REQ-MOB-VIEWPORT-004 (Unwanted Behavior)**
**If** any component or page introduces a literal `100vh` or `100vw` for primary layout containers, **then** the implementation **shall not** be considered complete and **shall** be replaced with `100dvh`/`100dvw` or the corresponding utility class.

### 2.2 REQ-MOB-SHELL — AppShell 모바일 분기

**REQ-MOB-SHELL-001 (State-Driven)**
**While** the viewport width is below the `lg` breakpoint (1024px), the system **shall** render the AppShell with `grid-cols-1` (no sidebar column) and **shall not** display the persistent `<Sidebar>` component in the layout flow.

**REQ-MOB-SHELL-002 (State-Driven)**
**While** the viewport width is at or above the `lg` breakpoint (1024px), the system **shall** retain the existing 3-region grid (`grid-cols-[240px_1fr]` with topbar row) defined by SPEC-LAYOUT-001 unchanged.

**REQ-MOB-SHELL-003 (Ubiquitous)**
The system **shall** ensure the main content area uses the full available width minus padding (`px-4 sm:px-6 lg:px-8`) on mobile and tablet viewports without inheriting any desktop-only `max-width` constraints from page content.

**REQ-MOB-SHELL-004 (Unwanted Behavior)**
**If** the AppShell on mobile (< lg) renders the `<Sidebar>` component as a persistent layout column (vs Sheet drawer overlay), **then** the implementation **shall not** be considered complete.

**REQ-MOB-SHELL-005 (Optional Feature)**
**Where** the user has the platform's reduce-motion preference active (`prefers-reduced-motion: reduce`), the system **shall** disable Sheet drawer slide-in transitions and use instant open/close.

### 2.3 REQ-MOB-TOPBAR — Topbar 모바일 압축

**REQ-MOB-TOPBAR-001 (State-Driven)**
**While** the viewport width is below the `lg` breakpoint, the system **shall** render the topbar with the following layout: hamburger button (left, 44×44px touch target) → page title (center, truncated) → action group (right: search icon, notification, avatar).

**REQ-MOB-TOPBAR-002 (State-Driven)**
**While** the viewport width is below the `md` breakpoint (768px), the system **shall** replace the inline search `<input>` with a search icon button that, when activated, expands inline (full topbar width) or opens a full-screen search overlay.

**REQ-MOB-TOPBAR-003 (State-Driven)**
**While** the viewport width is at or above the `md` breakpoint, the system **shall** display the inline search `<input>` constrained to a width that does not cause topbar overflow (`max-w-xs sm:max-w-sm md:max-w-md`).

**REQ-MOB-TOPBAR-004 (Unwanted Behavior)**
**If** the topbar on any viewport from 320px to 1440px causes horizontal overflow (`scrollWidth > clientWidth`), **then** the implementation **shall not** be considered complete.

**REQ-MOB-TOPBAR-005 (Ubiquitous)**
The system **shall** keep the dark mode toggle, notification bell placeholder, and user avatar visible on all viewports ≥ 320px, hiding only secondary labels (e.g., role badge text) when space is insufficient.

### 2.4 REQ-MOB-NAV — Sidebar 모바일 drawer

**REQ-MOB-NAV-001 (Event-Driven)**
**When** the user activates the hamburger button on a mobile or tablet viewport (< lg), the system **shall** open a Sheet drawer sliding in from the left containing the existing `<Sidebar>` component with `userRole` prop preserved.

**REQ-MOB-NAV-002 (Event-Driven)**
**When** the Sheet drawer is open, the system **shall** trap keyboard focus within the drawer, dim the background with a scrim (`bg-black/50`), prevent body scroll, and restore focus to the hamburger trigger upon close.

**REQ-MOB-NAV-003 (Event-Driven)**
**When** the user clicks any nav item inside the Sheet drawer or presses `Escape`, the system **shall** close the drawer immediately and (for nav items) navigate to the selected route.

**REQ-MOB-NAV-004 (Ubiquitous)**
The system **shall** assign `aria-label="주 내비게이션 열기"` to the hamburger trigger and `aria-label="주 내비게이션"` to the nav landmark inside the drawer.

**REQ-MOB-NAV-005 (Unwanted Behavior)**
**If** the Sheet drawer fails to close when the user navigates to a new route (auto-close on route change), **then** the implementation **shall not** be considered complete.

**REQ-MOB-NAV-006 (State-Driven)**
**While** the viewport is at or above the `lg` breakpoint, the system **shall not** render the hamburger trigger and **shall not** mount the Sheet drawer DOM (conditional render via Tailwind `lg:hidden` + React conditional).

### 2.5 REQ-MOB-CONTAINER — 페이지 컨테이너 표준화

**REQ-MOB-CONTAINER-001 (Ubiquitous)**
The system **shall** provide a `<Container variant>` component at `src/components/app/container.tsx` exposing variants `default` (max-width 1440px on lg+), `narrow` (max-width 1200px on lg+), and `wide` (max-width 1600px on lg+, reserved for future use).

**REQ-MOB-CONTAINER-002 (Ubiquitous)**
The system **shall** apply mobile-first padding to the Container — `px-4` on mobile (< sm), `sm:px-6` on tablet, `lg:px-8` on desktop — and **shall not** apply any `max-width` constraint below the `lg` breakpoint.

**REQ-MOB-CONTAINER-003 (Ubiquitous)**
The system **shall** refactor the following 13 pages to consume `<Container>` instead of inline `max-w-[*]` classes: `(operator)/dashboard/page.tsx`, `(operator)/dashboard/calendar/page.tsx`, `(operator)/projects/page.tsx`, `(operator)/projects/[id]/page.tsx`, `(operator)/instructors/page.tsx`, `(operator)/instructors/[id]/page.tsx`, `(operator)/clients/page.tsx`, `(operator)/clients/[id]/page.tsx`, `(operator)/settlements/page.tsx`, `(operator)/settlements/[id]/page.tsx`, `(operator)/operator/invite/page.tsx`, `(instructor)/me/page.tsx`, `(instructor)/me/schedule/page.tsx` (and similar `me/resume`, `me/settlements`, `me/settings` if they share the pattern).

**REQ-MOB-CONTAINER-004 (Unwanted Behavior)**
**If** any page file under `src/app/(app)/` introduces a literal `max-w-[*px]` or `max-w-{N}xl` class on its root container after this SPEC's implementation, **then** the implementation **shall not** be considered complete and **shall** be replaced with `<Container>`.

### 2.6 REQ-MOB-GRID — 표준 반응형 grid 패턴

**REQ-MOB-GRID-001 (Ubiquitous)**
The system **shall** standardize the KPI grid pattern to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` for all KPI card layouts (dashboard, instructor profile, settlement summary).

**REQ-MOB-GRID-002 (State-Driven)**
**While** the viewport width is below the `sm` breakpoint (640px), the system **shall** display the kanban board (`KanbanBoard.tsx`) as a horizontally scrollable container with each column at `min-w-[280px]` and apply `scroll-snap-type: x mandatory` for column-by-column snapping.

**REQ-MOB-GRID-003 (State-Driven)**
**While** the viewport width is between `sm` (640px) and `lg` (1024px), the system **shall** display the kanban board as a 2-column grid (`sm:grid-cols-2`) with vertical scrolling within each column.

**REQ-MOB-GRID-004 (State-Driven)**
**While** the viewport width is at or above `lg`, the system **shall** display the kanban board as a 5-column grid (`lg:grid-cols-5`) matching the existing desktop layout.

**REQ-MOB-GRID-005 (Ubiquitous)**
The system **shall** standardize list/card grids to `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4` where the content type is suitable for grid display.

### 2.7 REQ-MOB-TABLE — 테이블의 모바일 카드 변환

**REQ-MOB-TABLE-001 (State-Driven)**
**While** the viewport width is below the `md` breakpoint (768px), the system **shall** hide all data tables (`<table>` elements in instructors list, clients list, settlements list) using `hidden md:table` and **shall** display an alternative card-based list view using `<Card>` primitives (`md:hidden`).

**REQ-MOB-TABLE-002 (Ubiquitous)**
The system **shall** ensure each card in the mobile list view exposes the same primary information as the corresponding table row: identifier, status, key metric, and a "details" link/button (44×44px touch target).

**REQ-MOB-TABLE-003 (State-Driven)**
**While** the viewport width is at or above the `md` breakpoint, the system **shall** display the data table in its existing form (with `overflow-x-auto` for safety on narrow tablets if column count exceeds 5).

**REQ-MOB-TABLE-004 (Unwanted Behavior)**
**If** a data table on mobile (< md) causes the page to scroll horizontally beyond the viewport width, **then** the implementation **shall not** be considered complete and **shall** trigger the card-list fallback.

### 2.8 REQ-MOB-FORM — 폼 모바일 레이아웃

**REQ-MOB-FORM-001 (State-Driven)**
**While** the viewport width is below the `md` breakpoint, the system **shall** display all forms (resume-form, project-form, settlement-form, profile-form) with a single-column layout (`grid-cols-1`), regardless of the desktop column configuration.

**REQ-MOB-FORM-002 (Ubiquitous)**
The system **shall** ensure form input fields (`<Input>`, `<Select>`, `<Textarea>`) span the full width of their container on mobile (`w-full`) and **shall** maintain a minimum height of 44px for touch targets.

**REQ-MOB-FORM-003 (State-Driven)**
**While** the viewport width is below the `md` breakpoint and a form contains primary action buttons (Save, Submit), the system **shall** render the action button group as a sticky bottom bar (`sticky bottom-0 inset-x-0 bg-surface border-t pb-safe`) to prevent off-screen scrolling.

**REQ-MOB-FORM-004 (Ubiquitous)**
The system **shall** apply `inputMode` and `autoComplete` attributes appropriate to the input semantics (e.g., `inputMode="email"` for email fields, `inputMode="numeric"` for amount fields) to optimize the mobile virtual keyboard.

**REQ-MOB-FORM-005 (Unwanted Behavior)**
**If** the resume-form's existing `overflow-x-auto` table approach forces horizontal scrolling on mobile, **then** the implementation **shall not** be considered complete and **shall** be refactored to a stacked card or accordion layout per row.

### 2.9 REQ-MOB-CALENDAR — Calendar 컴포넌트 모바일

**REQ-MOB-CALENDAR-001 (State-Driven)**
**While** the viewport width is below the `md` breakpoint, the system **shall** render `OperatorCalendar` (`grid-cols-7` month grid) with abbreviated weekday labels (e.g., "월" instead of "월요일") and reduce per-cell padding to fit within the viewport.

**REQ-MOB-CALENDAR-002 (Optional Feature)**
**Where** the OperatorCalendar's per-day event count exceeds the visual capacity on mobile (cell height < 60px), the system **shall** display only an event indicator dot (no event title preview) and **shall** show full event details on cell tap via Popover or Sheet.

**REQ-MOB-CALENDAR-003 (State-Driven)**
**While** the viewport width is below the `md` breakpoint, the FullCalendar (`me-calendar-view.tsx`) **shall** use a simplified `headerToolbar` with only `prev,next today` (no view switcher) and **shall** set `initialView: "listWeek"` as the mobile default to avoid overcrowded month grid.

**REQ-MOB-CALENDAR-004 (Ubiquitous)**
The system **shall** ensure all calendar interactive elements (date cells, event chips, navigation buttons) meet the 44×44px touch target requirement on mobile viewports.

### 2.10 REQ-MOB-COMPONENT — 컴포넌트 일관성 보강

**REQ-MOB-COMPONENT-001 (Ubiquitous)**
The system **shall** refactor all `<CardHeader>` usages currently using `flex-row` (7 occurrences identified in audit: instructor/me, satisfaction-summary-card, and 5 others) to use `flex-col sm:flex-row` so that header text wraps cleanly on mobile and inlines on tablet and above.

**REQ-MOB-COMPONENT-002 (Ubiquitous)**
The system **shall** ensure all interactive elements rendered as `<Button size="icon">` or `<Button size="icon-sm">` provide a minimum 44×44px hit area on mobile viewports, either by enforcing `min-h-[44px] min-w-[44px]` on mobile via responsive utilities or by extending the touch area with a `::before` pseudo-element.

**REQ-MOB-COMPONENT-003 (State-Driven)**
**While** the viewport width is below the `md` breakpoint, the system **shall** upscale `text-xs` (12px) usages in body content to `text-sm` (14px) for readability, applying the pattern `text-sm md:text-xs` to relevant captions, badges, and metadata. Pure decorative text (chip count, badge digit) may remain `text-xs`.

**REQ-MOB-COMPONENT-004 (Ubiquitous)**
The system **shall** ensure all `<Avatar>` components used as interactive triggers (avatar with click handler, dropdown menu) wrap the avatar in a `<Button variant="ghost" size="icon">` providing 44×44px minimum touch area, while purely decorative avatars (avatar in card metadata) may retain `h-7 w-7` (28px).

**REQ-MOB-COMPONENT-005 (Ubiquitous)**
The system **shall** refactor `src/components/projects/project-filters-bar.tsx` to remove `min-w-[140px]` and `min-w-[120px]` forced widths on mobile, allowing select triggers to flex within the available space (`flex-1 sm:min-w-[140px]`).

### 2.11 REQ-MOB-TOKEN — 신규 디자인 토큰

**REQ-MOB-TOKEN-001 (Ubiquitous)**
The system **shall** add the following CSS custom properties to `src/app/globals.css` `@theme` block (extending, not modifying, SPEC-LAYOUT-001 tokens):
- `--mobile-spacing-xs: 12px`, `--mobile-spacing-sm: 16px`, `--mobile-spacing-md: 20px`
- `--touch-target-min: 44px`
- `--container-mobile-max: 100%`
- `--container-tablet-max: calc(100% - 32px)`
- `--safe-top: env(safe-area-inset-top, 0px)`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, `--safe-left: env(safe-area-inset-left, 0px)`, `--safe-right: env(safe-area-inset-right, 0px)`

**REQ-MOB-TOKEN-002 (Ubiquitous)**
The system **shall** mirror the new tokens in `.moai/design/tokens.json` under a new `mobile` namespace, preserving the existing top-level structure (`color`, `typography`, `spacing`, `radius`, `shadow`).

**REQ-MOB-TOKEN-003 (Unwanted Behavior)**
**If** any code change modifies the value of an existing token defined by SPEC-LAYOUT-001 (color/typography/spacing/radius/shadow), **then** the implementation **shall not** be considered complete and **shall** be reverted (this SPEC is extension-only).

**REQ-MOB-TOKEN-004 (Ubiquitous)**
The system **shall** define utility classes `min-h-touch`, `min-w-touch`, `pt-safe`, `pb-safe`, `px-safe`, `py-safe` mapped to the new tokens for consumption by component code.

### 2.12 REQ-MOB-CLEANUP — 구버전 파일 정리

**REQ-MOB-CLEANUP-001 (Ubiquitous)**
The system **shall** identify all import sites of `src/components/dashboard/kanban-board.tsx` (the deprecated lower-case version with hardcoded `min-w-[1100px]`) and **shall** migrate them to `src/components/dashboard/KanbanBoard.tsx` (the responsive PascalCase version). Once import count reaches zero, the system **shall** delete `kanban-board.tsx`.

**REQ-MOB-CLEANUP-002 (Unwanted Behavior)**
**If** both `kanban-board.tsx` and `KanbanBoard.tsx` remain in the codebase after this SPEC's completion, **then** the implementation **shall not** be considered complete (single source of truth principle).

**REQ-MOB-CLEANUP-003 (Optional Feature)**
**Where** other duplicated dashboard components exist (e.g., `kpi-cards.tsx` lower-case vs `KpiCard.tsx` PascalCase), the system **shall** apply the same de-duplication pattern, prioritizing the responsive version and deleting the legacy version.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 **명시적으로 빌드하지 않으며**, 별도 SPEC 또는 후속 단계로 위임한다.

| 항목 | 위임 / 사유 |
|------|-------------|
| 데스크톱 와이드(1440px+) ultra-wide 최적화 | 본 SPEC 범위 외, 후속 SPEC |
| iOS / Android 네이티브 앱 (RN, Capacitor) | 별도 platform SPEC |
| PWA (manifest, service worker, offline) | SPEC-PWA-001 (후속) |
| Push 알림, install prompt | SPEC-PWA-001 / SPEC-NOTIFY-002 |
| DB / 백엔드 API 변경 | 해당 없음 (frontend-only) |
| 신규 페이지 / 신규 도메인 기능 | 해당 없음 (반응형 보강만) |
| Style Dictionary, Figma 토큰 sync | (후속, 우선순위 낮음) |
| Storybook / Chromatic visual regression | SPEC-STORYBOOK-001 (후속) |
| i18n / 다국어 | 한국어 단일 유지 |
| 모바일 단축키 / 제스처 (스와이프, pull-to-refresh, long-press) | 후속 또는 native app 단계 |
| `Drawer` (vaul), `Sonner` 등 추가 프리미티브 | 본 SPEC은 `Sheet` 1종만 도입 |
| 기존 디자인 토큰 값 변경 | 금지 (확장만 허용) |
| 다크 모드 신규 색상 추가 | 변경 없음 |
| `(auth)/login`·`(auth)/signup` 화면 반응형 | SPEC-AUTH-001 / SPEC-AUTH-002 책임 |
| 이메일 / 알림 템플릿 반응형 | 별도 SPEC |
| `@media print` 스타일 | 후속 |
| Pencil 디자인 mockup 작성 | 별도 designer 호출 시 |

---

## 4. 영향 범위 (Affected Files)

본 SPEC 구현 시 **신규/수정**되는 파일 목록.

### 4.1 신규 파일 (NEW)

- `src/components/ui/sheet.tsx` — shadcn/ui Sheet primitive (Radix Dialog 기반 side drawer)
- `src/components/app/container.tsx` — 표준 페이지 컨테이너 (`variant: default | narrow | wide`)
- `src/components/app/mobile-nav.tsx` — 모바일 햄버거 트리거 + Sheet 통합 wrapper (`Sidebar` 재사용)
- `src/components/instructor/instructors-list-mobile.tsx` (또는 동일 파일 내 분기) — 강사 리스트 모바일 카드 변환
- `src/components/clients/clients-list-mobile.tsx` (또는 분기) — 클라이언트 리스트 모바일 카드
- `src/components/settlements/settlements-list-mobile.tsx` (또는 분기) — 정산 리스트 모바일 카드

### 4.2 수정 파일 (MODIFIED) — Baseline

- `src/app/layout.tsx` — `viewport` export 추가, theme color 명시
- `src/app/globals.css` — 신규 토큰 추가, safe-area utility, `dvh` 도입
- `.moai/design/tokens.json` — `mobile` 네임스페이스 추가

### 4.3 수정 파일 (MODIFIED) — App Shell + Navigation

- `src/components/app/app-shell.tsx` — 모바일 grid 분기 (`grid-cols-1 lg:grid-cols-[240px_1fr]`)
- `src/components/app/sidebar.tsx` — drawer 모드 prop 추가 (옵션, Sheet 내부에서 사용 시 chrome 차이)
- `src/components/app/topbar.tsx` — 햄버거 트리거 통합, 검색 input 모바일 분기, `pt-safe` 적용

### 4.4 수정 파일 (MODIFIED) — 페이지 컨테이너 13곳

- `src/app/(app)/(operator)/dashboard/page.tsx`
- `src/app/(app)/(operator)/dashboard/calendar/page.tsx`
- `src/app/(app)/(operator)/projects/page.tsx`
- `src/app/(app)/(operator)/projects/[id]/page.tsx`
- `src/app/(app)/(operator)/instructors/page.tsx`
- `src/app/(app)/(operator)/instructors/[id]/page.tsx`
- `src/app/(app)/(operator)/clients/page.tsx`
- `src/app/(app)/(operator)/clients/[id]/page.tsx`
- `src/app/(app)/(operator)/settlements/page.tsx`
- `src/app/(app)/(operator)/settlements/[id]/page.tsx`
- `src/app/(app)/(operator)/operator/invite/page.tsx`
- `src/app/(app)/(instructor)/me/page.tsx`
- `src/app/(app)/(instructor)/me/schedule/page.tsx`
- (필요 시) `src/app/(app)/(instructor)/me/resume/page.tsx`, `me/settlements/page.tsx`, `me/settings/page.tsx`

### 4.5 수정 파일 (MODIFIED) — 복합 컴포넌트

- `src/components/dashboard/KanbanBoard.tsx` — scroll-snap 추가, 컬럼 `min-w-[280px]` 명시
- `src/components/dashboard/OperatorCalendar.tsx` — 모바일 셀 패딩, 약식 weekday label
- `src/components/instructor/me-calendar-view.tsx` — FullCalendar `headerToolbar` + `initialView` 모바일 분기
- `src/components/projects/project-filters-bar.tsx` — `min-w-[*]` 모바일 해제
- `src/components/resume/resume-form.tsx` — `overflow-x-auto` 테이블 → 카드/아코디언 변환, sticky bottom action bar
- `src/components/instructor/satisfaction-summary-card.tsx` — `CardHeader flex-col sm:flex-row`
- (총 7곳) `CardHeader flex-row` 강제 사용 컴포넌트들

### 4.6 삭제 파일 (DELETED)

- `src/components/dashboard/kanban-board.tsx` — 구버전 (사용처 0건 확인 후 삭제)
- (조건부) `src/components/dashboard/kpi-cards.tsx` — 구버전 KPI (`KpiCard.tsx` + `KpiGrid.tsx`로 대체된 경우)

### 4.7 변경 없음 (참고용)

- `src/db/**`, `src/proxy.ts` — DB/Drizzle, 본 SPEC 미사용
- `src/components/ui/{button,card,dialog,input,label,select,dropdown-menu,popover,avatar,badge,checkbox}.tsx` — SPEC-LAYOUT-001 11종 프리미티브, 본 SPEC은 추가 변경 없음 (단, 사용 패턴은 본 SPEC이 강화)
- `.moai/specs/SPEC-LAYOUT-001/**` — frozen, 변경 금지

---

## 5. 기술 접근 (Technical Approach)

본 섹션은 구현의 큰 방향만 제시하며, 상세 단계는 `plan.md` 참조.

### 5.1 Mobile-first 정책 채택

기존 코드는 desktop-first(예: `lg:hidden` 위주)로 작성되어 있으나 본 SPEC은 mobile-first 원칙을 도입한다: 기본 utility는 모바일 (`grid-cols-1`, `text-sm`)을 가정하고, `sm:` / `md:` / `lg:` prefix로 점진적 enhancement. SPEC-LAYOUT-001이 정의한 breakpoint(sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536)는 그대로 활용한다.

### 5.2 Sheet primitive 도입

shadcn/ui `Sheet` 컴포넌트는 Radix Dialog 기반으로 SPEC-LAYOUT-001의 Dialog 패턴을 그대로 따른다. `npx shadcn@latest add sheet` 또는 수동 작성. side prop으로 `left | right | top | bottom` 지정 가능. 본 SPEC은 left side drawer만 사용 (모바일 sidebar). 신규 의존성은 없음(Radix Dialog 재사용).

### 5.3 Container 컴포넌트 패턴

```
<Container variant="default">  // max-w-[1440px] on lg+
<Container variant="narrow">   // max-w-[1200px] on lg+
<Container variant="wide">     // max-w-[1600px] on lg+ (예약)
```

내부 구현은 Tailwind utility 조합:
- `default`: `mx-auto w-full px-4 sm:px-6 lg:px-8 lg:max-w-[1440px]`
- `narrow`: `mx-auto w-full px-4 sm:px-6 lg:px-8 lg:max-w-[1200px]`

`as` prop으로 `<main>` / `<section>` / `<div>` 선택 가능 (선택, 후속 확장).

### 5.4 테이블 → 카드 변환 패턴

**옵션 A (단순 분기)**: 같은 페이지에서 `<table className="hidden md:table">` + `<ul className="md:hidden grid grid-cols-1 gap-3">` 두 마크업 동시 렌더. 장점: 구현 단순. 단점: 데이터 매핑 로직 중복.

**옵션 B (wrapper 컴포넌트)**: `<ResponsiveTable data={instructors} columns={...} mobileCard={InstructorMobileCard} />`. 장점: 재사용. 단점: 추상화 비용.

본 SPEC은 **옵션 A 채택** (3개 페이지만 적용, 추상화 ROI 낮음). 후속 페이지 증가 시 옵션 B로 리팩터.

### 5.5 터치 타겟 보장 전략

44×44px 보장은 두 가지 접근:

1. **명시 size 적용**: `<Button size="icon">` (40px) → 모바일에서 `min-h-touch min-w-touch` 추가
2. **Hit area 확장**: `<Button size="icon-sm">` (28px) 시각 유지 + `::before { content: ''; position: absolute; inset: -8px; }`로 hit area 확장

본 SPEC은 **(1) 명시 size 적용 우선**, (2) 디자인 의도상 작은 아이콘 유지가 필요한 경우에만 hit area pseudo 사용.

### 5.6 SafeArea + Dvh 적용

```css
/* globals.css */
@theme {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --touch-target-min: 44px;
}

@utility pt-safe { padding-top: var(--safe-top); }
@utility pb-safe { padding-bottom: var(--safe-bottom); }
@utility min-h-touch { min-height: var(--touch-target-min); }
@utility min-w-touch { min-width: var(--touch-target-min); }
```

`100dvh` / `100dvw`는 모던 브라우저 기본 지원(iOS 15.4+, Android 108+). 미지원 브라우저는 `100vh` fallback 자동 적용 가능 (CSS supports query 활용 또는 `@supports (height: 100dvh)` 분기).

### 5.7 Calendar 모바일 단순화

`OperatorCalendar`는 7일 그리드 유지하되 모바일 셀 표시 정보 축소:
- weekday label: "월요일" → "월" (mobile only)
- per-day events: 본문 미리보기 제거 → 도트 인디케이터만, 탭 시 Popover 노출

`me-calendar-view.tsx` (FullCalendar v6): 모바일에서 `initialView: "listWeek"` 또는 `"timeGridDay"` (한 화면에 일정 정보 충분)로 전환. `headerToolbar`는 `{ left: 'prev,next', center: 'title', right: 'today' }`로 단순화.

### 5.8 Form sticky bottom bar

```tsx
<form>
  <div className="space-y-4 pb-24 md:pb-0">  {/* sticky bar 높이만큼 padding */}
    {/* form fields */}
  </div>
  <div className="md:hidden sticky bottom-0 inset-x-0 bg-surface border-t border-border px-4 py-3 pb-safe">
    <Button type="submit" className="w-full">저장</Button>
  </div>
  <div className="hidden md:flex md:justify-end md:gap-2">
    {/* desktop action buttons */}
  </div>
</form>
```

### 5.9 검증 자동화 전략

**수동 검증** (필수):
- Chrome DevTools Device Mode: iPhone SE / iPhone 12 / iPad / iPad Pro 4종
- macOS Safari Responsive Design Mode (실제 mobile rendering 확인)

**자동 검증** (권장, M5 단계에서 도입):
- Playwright: `page.setViewportSize({width: 320, height: 568})` 등 5종 viewport 매트릭스
- axe-core integration: `@axe-core/playwright`로 각 viewport별 critical/serious 0건 확인
- Lighthouse CI (선택): mobile preset으로 Accessibility/Performance 측정

### 5.10 점진적 롤아웃 정책

본 SPEC은 13페이지 + 5 복합 컴포넌트 + baseline 정정 + 토큰 신규 → 변경 폭이 크다. 따라서 마일스톤 단위 commit 분리 + 각 마일스톤마다 `pnpm build` + 핵심 페이지 시각 검증 통과 후 다음 진행. PR도 마일스톤별 분할 가능 (5개 PR) 또는 단일 PR 내 logical commit 분리.

### 5.11 의존성 / 가정

- SPEC-LAYOUT-001(implemented): 앱 셸 + 토큰 + 11종 프리미티브 baseline 완료 가정
- Next.js 16 App Router `Viewport` API: `next 16.0.0+` 필요 (이미 설치됨)
- shadcn/ui CLI: `Sheet` 컴포넌트 추가 가능 (`npx shadcn@latest add sheet`)
- Radix UI Dialog: 이미 설치됨(`@radix-ui/react-dialog`), Sheet에서 재사용
- `100dvh` / `100dvw` CSS: 모던 브라우저 기본 지원
- iOS Safari notch / home indicator 환경: env() safe-area 자동 제공
- 13개 페이지의 max-w 직접 사용은 audit 결과 기반, 실제 grep으로 재확인 후 보강

---

## 6. 미해결 질문 (Open Questions)

본 SPEC 작성 시점에 다음 결정이 미해결 상태이며, `/moai run` 진입 전 또는 첫 마일스톤 수행 중 확정 필요.

| # | 질문 | 권장 옵션 | 대안 |
|---|------|-----------|------|
| 1 | 모바일 검색 input 확장 방식 | **Inline expand**: 검색 아이콘 클릭 시 topbar 전체를 검색 input으로 변환 (back 버튼으로 복귀) | (a) 풀스크린 overlay 패턴 (b) 라우트 분리(`/search`) |
| 2 | 테이블 → 카드 변환 추상화 수준 | **옵션 A** (페이지별 단순 분기, 3개만 적용) | 옵션 B (`<ResponsiveTable>` wrapper) — 후속 확장 시 |
| 3 | Sheet drawer 측면 | **left side** (sidebar 위치 일관성) | right side (modern app pattern) |
| 4 | 모바일 캘린더 default view | **OperatorCalendar는 month grid 유지 (정보 손실 없이 축소만)**, **FullCalendar는 listWeek로 전환** | OperatorCalendar도 listWeek 전환 (정보 밀도 감소) |
| 5 | sticky bottom action bar 적용 범위 | **resume-form 우선**, 다른 폼은 audit 결과 보고 결정 | 모든 폼에 일괄 적용 (UX 일관성) |
| 6 | `text-xs` 상향 정책 | **`text-sm md:text-xs` 패턴** (모바일 14px, 태블릿+ 12px) | (a) 모든 `text-xs`를 `text-sm`로 상향 (b) 토큰 자체를 13px로 변경 (단, SPEC-LAYOUT-001 토큰 변경 금지로 (b) 불가) |
| 7 | 구버전 `kanban-board.tsx` 처리 | **사용처 0건 grep 확인 후 즉시 삭제** | 사용처 있으면 신버전 import로 일괄 치환 |
| 8 | Avatar 인터랙티브 wrap 방식 | **`<Button variant="ghost" size="icon">` 외부 래핑** | hit area pseudo 확장 (avatar 시각 유지) |
| 9 | M3 ResponsiveTable / 카드 변환 시 데이터 누락 처리 | **mobile card는 desktop table의 primary 4-5 컬럼만 노출, 나머지는 details 페이지** | 모든 컬럼 노출 (카드 가독성 저하 우려) |
| 10 | 검증 자동화 도입 시점 | **M5에서 Playwright matrix 자동화 도입** | M1부터 모든 마일스톤마다 자동화 (높은 초기 비용) |

---

_End of SPEC-MOBILE-001 spec.md_
