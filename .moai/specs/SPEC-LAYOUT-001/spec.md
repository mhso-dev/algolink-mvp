---
id: SPEC-LAYOUT-001
version: 1.0.0
status: draft
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-LAYOUT-001: 공통 앱 셸 + 디자인 시스템 토큰화 + UI 프리미티브 (App Shell + Design Tokens + UI Primitives)

## HISTORY

- **2026-04-27 (v1.0.0)**: 초기 작성. Algolink MVP의 frontend 기반 레이어로서 (1) `(app)` route group 공통 셸(사이드바 + 톱바 + 메인), (2) DB `user_role` enum(instructor/operator/admin) 기반 nav 분기, (3) shadcn/ui 11종 프리미티브, (4) Tailwind 4 `@theme` 디자인 토큰(컬러 21·타이포 8·spacing 12·radius 5·shadow 3), (5) system-preference 기반 다크 모드, (6) WCAG 2.1 AA 접근성 베이스라인을 명세한다. SPEC-DB-001 완료 후속, SPEC-AUTH-001(가드)·SPEC-PROJECT-001(콘텐츠) 등 모든 페이지 SPEC의 선행 의존성. stash@{0}에 baseline 코드(앱 셸 4파일 + UI 프리미티브 11파일 + globals.css + tokens.json)가 대기 중이며, /moai run 단계에서 pop 후 본 SPEC 인수기준에 맞춰 정제될 예정.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 모든 페이지가 공유할 **frontend 기반 레이어**를 정의한다. 본 SPEC의 산출물은 (a) 인증된 사용자가 접근하는 `(app)` route group의 공통 레이아웃 컴포넌트(`AppShell`/`Sidebar`/`Topbar`), (b) `user_role` enum 3종(`instructor`/`operator`/`admin`)에 따라 다른 nav를 렌더하는 분기 로직, (c) shadcn/ui 기반 11종 UI 프리미티브 라이브러리, (d) Tailwind 4 `@theme` directive와 `globals.css` CSS variable로 코드화된 디자인 토큰 세트, (e) `prefers-color-scheme` 기반 다크 모드 토큰 분기, (f) WCAG 2.1 AA 등급의 접근성 베이스(키보드 포커스·색상 대비·aria 레이블)이다.

본 SPEC 자체는 어떤 실제 페이지 콘텐츠도 빌드하지 않는다. 후속 도메인 SPEC(대시보드·프로젝트·강사·일정·정산 등)이 공통적으로 import 하는 **재사용 가능한 컴포넌트 + 토큰 인프라**만 제공한다.

### 1.2 배경 (Background)

`.moai/project/product.md`의 페르소나 3종(강사·담당자·관리자)은 동일 워크스페이스에서 협업하지만 메뉴 노출 권한이 다르다. 강사는 본인 영역(`/me/*`)만 접근 가능하고, 담당자는 운영 메뉴(`/dashboard`, `/projects`, `/instructors`, `/clients`, `/settlements`)에 접근하며, 관리자는 추가로 `/admin/*`에 접근한다. 이를 페이지마다 중복 구현하면 nav 분기 로직과 디자인 일관성이 붕괴되므로 단일 셸에서 한 번만 처리해야 한다.

또한 `.moai/design/research.md`와 `.moai/design/spec.md`에서 결정된 "데이터 밀도 높은 워크 도구, 신뢰감 블루(`#2563EB`) + 차분 그레이, 한국어 가독성(Pretendard 14px body / line-height 1.5), 키보드 우선" 디자인 의도를 코드 차원의 단일 진실 공급원(CSS variable + Tailwind `@theme`)으로 고정해야, 이후 수십 개 페이지를 빠르게 빌드하면서도 시각적 일관성을 유지할 수 있다.

기술 스택은 Next.js 16 App Router + React 19 + Tailwind 4(CSS-first config) + shadcn/ui CLI v4(Radix UI 기반) + `next/font`(Pretendard Variable + JetBrains Mono)이다. SPEC-DB-001에서 `user_role` enum과 RLS가 이미 정의되었으므로 본 SPEC은 frontend-only이며 DB 변경을 동반하지 않는다.

### 1.3 범위 (Scope)

**In Scope:**

- `src/app/(app)/layout.tsx`: `(app)` route group의 서버 컴포넌트 레이아웃 진입점. 가드 hook 자리(noop placeholder)와 `<AppShell>` 렌더링.
- `src/components/app/app-shell.tsx`: 3-region(sidebar / topbar / main) 그리드 컨테이너 클라이언트 컴포넌트.
- `src/components/app/sidebar.tsx`: 좌측 nav. `userRole` prop을 받아 메뉴 배열을 분기 렌더. 강사용 `/me/*` 4종, 담당자/관리자용 운영 메뉴 5종, 관리자 추가 `/admin/*`(Phase 2 노출 제외).
- `src/components/app/topbar.tsx`: 상단 바. 페이지 타이틀 슬롯, 사용자 아바타 + 역할 배지, 로그아웃 트리거 자리(SPEC-AUTH-001로 위임), 다크 모드 토글, ⌘K 자리(SPEC-CMDK-001로 위임), 알림 벨 자리(SPEC-NOTIF-001로 위임).
- `src/components/ui/`: shadcn/ui 11종 프리미티브 — `button`, `card`, `dialog`, `input`, `label`, `select`, `dropdown-menu`, `popover`, `avatar`, `badge`, `checkbox`. 각 컴포넌트는 디자인 토큰 기반 variant API + Radix UI 키보드/ARIA 표준 준수.
- `src/app/globals.css`: Tailwind 4 `@theme` directive로 CSS variable 정의 — 컬러 21종(primary·secondary·accent·background·surface·border·text·상태 9종), 타이포 8 role(Display/H1/H2/H3/Body/Body-strong/Caption/Mono), spacing 12단계(0~80, 4px base), radius 5단계(sm/md/lg/xl/full), shadow 3단계(sm/md/lg).
- `.moai/design/tokens.json`(이미 stash 존재): 디자인 토큰의 기계 판독 가능 출처. `globals.css`와 1:1 동기화 되어야 함.
- `src/app/layout.tsx`(루트): `next/font/local` 또는 `next/font/google`로 Pretendard Variable + JetBrains Mono 로드, `lang="ko"`, `suppressHydrationWarning` 설정.
- 다크 모드: `prefers-color-scheme` system 감지 + `:root.dark` 토큰 분기. `next-themes` 또는 인라인 `<script>`로 FOUC 방지.
- 접근성 베이스: 모든 인터랙티브 요소 키보드 포커스, `:focus-visible` 링 가시화, Tab 순서 = 시각 순서, `aria-label`/`aria-current` 부여, 본문 색상 대비 4.5:1 이상.
- 반응형 breakpoint **정의만** (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536, Tailwind 기본). 모바일 전용 햄버거 메뉴 등 상세 모바일 UX는 후속.

**Out of Scope (Exclusions — What NOT to Build):**

- **인증/세션/라우트 가드**: Supabase Auth 통합, 미인증 시 `/login` 리다이렉트, 서버 컴포넌트에서 `getUser()` 호출 → SPEC-AUTH-001. 본 SPEC의 `(app)/layout.tsx`는 가드 hook 자리(주석 placeholder)만 표시.
- **모든 실제 페이지 콘텐츠**: `/dashboard`(KPI 카드·칸반), `/projects`(리스트), `/instructors`(테이블), `/clients`, `/settlements`, `/me/*`, `/admin/*`의 페이지 본문은 빌드 금지. 본 SPEC은 셸과 nav 컴포넌트만 제공하며, 후속 SPEC이 각 페이지를 별도로 빌드.
- **⌘K 명령 팔레트**: 검색·빠른 액션 팔레트 → SPEC-CMDK-001. 본 SPEC의 topbar에는 트리거 자리 표시만(`<button disabled>` placeholder).
- **알림 벨 데이터 연동**: 알림 카운트, drawer, 읽음 처리 → SPEC-NOTIF-001. topbar의 벨 아이콘은 정적 표시 또는 placeholder.
- **폼 컴포넌트**: `<ProjectForm>`, `<ResumeForm>`, `<SettlementForm>` 등 도메인 특화 폼 → 각 도메인 SPEC. 본 SPEC은 `input`/`label`/`select`/`checkbox` 프리미티브만 제공.
- **칸반 보드, KPI 카드, 테이블 등 복합 컴포넌트**: → SPEC-DASHBOARD-001 등 후속.
- **다국어 i18n**: 한국어 단일. `next-intl` 등 도입 제외.
- **모바일 전용 레이아웃 상세**: 반응형 breakpoint 토큰만 정의. 햄버거 메뉴, off-canvas sidebar 등은 후속 SPEC.
- **Storybook / Visual Regression Test**: 컴포넌트 카탈로그·스냅샷 회귀 테스트 → 후속.
- **추가 shadcn/ui 컴포넌트**: `tabs`, `tooltip`, `toast`, `command`, `calendar`, `data-table` 등 11종 외 컴포넌트는 필요 시점의 SPEC에서 추가.
- **디자인 토큰 외부 추출 시스템**: Style Dictionary, Figma 토큰 동기화 등 → 후속.
- **DB / 백엔드 변경**: 본 SPEC은 frontend-only. RLS, 마이그레이션, API 라우트 모두 제외.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러, 0 ESLint critical
- ✅ axe DevTools 결과: 모든 `(app)` 페이지 placeholder 기준 critical 0건, serious 0건
- ✅ Lighthouse Accessibility 점수 ≥ 95
- ✅ 색상 대비: 본문 4.5:1, 큰 텍스트 3:1 (light/dark 양쪽)
- ✅ 키보드 only 순회: Tab 키만으로 sidebar nav → topbar 액션 → main의 첫 인터랙티브 요소 도달, 포커스 링 모두 가시화
- ✅ 디자인 토큰 일관성: `src/components/ui/**`와 `src/components/app/**`에서 hex 코드 직접 사용 0건(ESLint 또는 grep 검증), px 직접 사용은 border-width 등 1px 예외 외 0건
- ✅ 다크 모드 전환: OS preference 변경 시 background `#FAFAFA` ↔ `#09090B` 즉시 반영, FOUC(Flash of Unstyled Content) 없음
- ✅ Role-based nav: `instructor`로 셸 진입 시 `/dashboard`·`/projects`·`/admin` 메뉴 DOM에 미존재(렌더 자체 분기), `operator`로 진입 시 운영 5종 메뉴만, `admin`은 운영 5종 + (Phase 2 노출 제외 표시된) `/admin/*` 메뉴 노출
- ✅ 11종 프리미티브: 각각 `<Button variant="default|secondary|outline|ghost|destructive">` 등 variant API 동작, Radix 키보드 단축키 표준(예: `Dialog` Esc 닫기, `DropdownMenu` 화살표 이동) 동작

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 5개 모듈(REQ-LAYOUT-SHELL, REQ-LAYOUT-NAV, REQ-LAYOUT-TOKENS, REQ-LAYOUT-A11Y, REQ-LAYOUT-PRIMITIVES)로 구성된다.

### 2.1 REQ-LAYOUT-SHELL — 공통 앱 셸 구조

**REQ-LAYOUT-SHELL-001 (Ubiquitous)**
The system **shall** render a 3-region application shell consisting of a left sidebar, a top bar, and a main content area for every route under `(app)/*`.

**REQ-LAYOUT-SHELL-002 (Ubiquitous)**
The system **shall** expose the main content area as a `<main>` landmark with `role="main"` and place page content via Next.js `children` slot.

**REQ-LAYOUT-SHELL-003 (Event-Driven)**
**When** the viewport width is at or above the `lg` breakpoint (1024px), the system **shall** display the sidebar in expanded mode (240px width with text labels and icons).

**REQ-LAYOUT-SHELL-004 (State-Driven)**
**While** the viewport width is below the `lg` breakpoint, the system **shall** collapse the sidebar to icon-only mode (64px width). 모바일 전용 햄버거 toggle은 본 SPEC 범위 외(Out of Scope).

**REQ-LAYOUT-SHELL-005 (Optional Feature)**
**Where** the topbar exposes auxiliary slots (⌘K trigger, notification bell, user menu), the system **shall** render placeholder buttons that are visually present but functionally deferred to SPEC-CMDK-001 / SPEC-NOTIF-001 / SPEC-AUTH-001 respectively.

**REQ-LAYOUT-SHELL-006 (Unwanted Behavior)**
**If** any page under `(app)/*` attempts to render its own duplicate sidebar or topbar, **then** the system **shall not** display nested navigation chrome (single source of truth in `(app)/layout.tsx`).

### 2.2 REQ-LAYOUT-NAV — 역할 기반 nav 분기

**REQ-LAYOUT-NAV-001 (Ubiquitous)**
The system **shall** receive the authenticated user's `role` (one of `instructor`/`operator`/`admin`) as input to the sidebar component and **shall** render exactly the nav items permitted for that role.

**REQ-LAYOUT-NAV-002 (State-Driven)**
**While** the user's role is `instructor`, the system **shall** display only the personal area menu — `[/me/dashboard, /me/resume, /me/schedule, /me/settlement]` — and **shall not** render `/dashboard`, `/projects`, `/instructors`, `/clients`, `/settlements`, or `/admin/*` items in the DOM.

**REQ-LAYOUT-NAV-003 (State-Driven)**
**While** the user's role is `operator`, the system **shall** display the operations menu — `[/dashboard, /projects, /instructors, /clients, /settlements]` — and **shall not** render `/me/*` (operator의 본인 정보는 별도 `settings/profile`로 분리 예정) or `/admin/*` items.

**REQ-LAYOUT-NAV-004 (State-Driven)**
**While** the user's role is `admin`, the system **shall** display the operations menu plus an `Admin` section header followed by `/admin/*` placeholder items. Phase 2 노출 제어를 위해 `/admin/*` 항목은 코드상 정의되지만 `data-phase="2"` 속성과 함께 시각적으로 숨김 처리(`hidden md:hidden` 등) 가능.

**REQ-LAYOUT-NAV-005 (Event-Driven)**
**When** the current route matches a nav item's `href`, the system **shall** apply the active state (background `bg-primary/10`, text `text-primary`, `aria-current="page"`).

**REQ-LAYOUT-NAV-006 (Unwanted Behavior)**
**If** the `userRole` prop is missing or invalid, **then** the sidebar **shall not** render any nav items and **shall** log a development-mode console warning. Production fallback은 빈 sidebar(셸 무너짐 방지).

### 2.3 REQ-LAYOUT-TOKENS — 디자인 토큰 일관 적용

**REQ-LAYOUT-TOKENS-001 (Ubiquitous)**
The system **shall** define all color, typography, spacing, radius, and shadow values as CSS custom properties via Tailwind 4 `@theme` directive in `src/app/globals.css`, and **shall** mirror the same values machine-readably in `.moai/design/tokens.json`.

**REQ-LAYOUT-TOKENS-002 (Ubiquitous)**
The system **shall** expose the following 21 color tokens (light mode): `--color-primary` (`#2563EB`), `--color-primary-hover` (`#1D4ED8`), `--color-primary-foreground` (`#FFFFFF`), `--color-secondary` (`#0F172A`), `--color-accent` (`#F59E0B`), `--color-background` (`#FAFAFA`), `--color-surface` (`#FFFFFF`), `--color-border` (`#E4E4E7`), `--color-border-strong` (`#D4D4D8`), `--color-text` (`#18181B`), `--color-text-muted` (`#71717A`), `--color-text-subtle` (`#A1A1AA`), 상태 9종 `--color-state-{request|proposed|confirmed|in-progress|completed|settled|pending|alert|info}`.

**REQ-LAYOUT-TOKENS-003 (State-Driven)**
**While** the `prefers-color-scheme` media query resolves to `dark` (or `:root.dark` 클래스가 활성화된 동안), the system **shall** override the following 5 tokens — `--color-background` (`#09090B`), `--color-surface` (`#18181B`), `--color-border` (`#27272A`), `--color-text` (`#FAFAFA`), `--color-text-muted` (`#A1A1AA`) — and **shall** keep the 9 state tokens identical to light mode.

**REQ-LAYOUT-TOKENS-004 (Ubiquitous)**
The system **shall** define the typography scale with 8 roles using Pretendard Variable for sans-serif and JetBrains Mono for mono: Display 32px/700/1.2, H1 24px/700/1.3, H2 20px/600/1.4, H3 16px/600/1.5, Body 14px/400/1.5, Body-strong 14px/600/1.5, Caption 12px/400/1.4, Mono 13px/400/1.4.

**REQ-LAYOUT-TOKENS-005 (Ubiquitous)**
The system **shall** define the spacing scale on a 4px base with stops `[0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]`, the radius scale `{sm: 4px, md: 6px, lg: 8px, xl: 12px, full: 9999px}`, and 3 shadow levels `{sm, md, lg}` with values per `.moai/design/system.md`.

**REQ-LAYOUT-TOKENS-006 (Unwanted Behavior)**
**If** any component file under `src/components/**` or `src/app/**` introduces a literal hex color (e.g. `#2563EB`) or a literal pixel size other than `1px` border-widths, **then** the implementation **shall not** be considered complete and the change **shall** be rejected by code review or lint rule.

### 2.4 REQ-LAYOUT-A11Y — 접근성 베이스라인 (WCAG 2.1 AA)

**REQ-LAYOUT-A11Y-001 (Ubiquitous)**
The system **shall** ensure every interactive element (link, button, form control, menu item) is reachable by keyboard `Tab` traversal in an order that matches the visual reading order.

**REQ-LAYOUT-A11Y-002 (Event-Driven)**
**When** an interactive element receives keyboard focus via `:focus-visible`, the system **shall** render a visible focus ring with at least 2px outline and at least 3:1 contrast against the adjacent background.

**REQ-LAYOUT-A11Y-003 (Ubiquitous)**
The system **shall** maintain text-on-background contrast of at least 4.5:1 for body text (≤ 18px regular or ≤ 14px bold) and 3:1 for large text and non-text UI elements, in both light and dark themes.

**REQ-LAYOUT-A11Y-004 (Ubiquitous)**
The system **shall** assign `aria-label`, `aria-current`, `aria-expanded`, `aria-controls`, `role`, and other appropriate ARIA attributes to all custom interactive components, leveraging Radix UI's built-in primitives wherever possible.

**REQ-LAYOUT-A11Y-005 (Unwanted Behavior)**
**If** information is conveyed by color alone (예: 빨간 배지로 "긴급" 표시), **then** the system **shall not** be considered compliant; an accompanying text label or icon **shall** also be present.

**REQ-LAYOUT-A11Y-006 (Unwanted Behavior)**
**If** a CSS transition or animation duration exceeds 200ms for non-decorative interaction feedback (예: hover, focus, open/close), **then** the implementation **shall not** be considered complete and **shall** be tightened to ≤ 200ms (이지즈 `cubic-bezier(0.4, 0, 0.2, 1)` 권장).

**REQ-LAYOUT-A11Y-007 (Optional Feature)**
**Where** the user has enabled `prefers-reduced-motion: reduce`, the system **shall** disable non-essential transitions and animations.

### 2.5 REQ-LAYOUT-PRIMITIVES — shadcn/ui 프리미티브 11종

**REQ-LAYOUT-PRIMITIVES-001 (Ubiquitous)**
The system **shall** provide 11 reusable UI primitives in `src/components/ui/` — `button`, `card`, `dialog`, `input`, `label`, `select`, `dropdown-menu`, `popover`, `avatar`, `badge`, `checkbox` — built on shadcn/ui CLI v4 patterns and Radix UI underlying components.

**REQ-LAYOUT-PRIMITIVES-002 (Ubiquitous)**
Each primitive **shall** consume design tokens via Tailwind utility classes (e.g. `bg-primary`, `text-foreground`, `rounded-md`) rather than literal values, and **shall** expose a `className` prop merged via the `cn()` utility for downstream composition.

**REQ-LAYOUT-PRIMITIVES-003 (Ubiquitous)**
The `Button` primitive **shall** expose at minimum the variants `default`, `secondary`, `outline`, `ghost`, `destructive`, and the sizes `default`, `sm`, `lg`, `icon`. 파괴적 액션은 `variant="destructive"`로 시각 구분 + 텍스트("삭제"/"취소" 등) 병기.

**REQ-LAYOUT-PRIMITIVES-004 (Event-Driven)**
**When** a `Dialog` is opened, the system **shall** trap focus within the dialog, restore focus to the trigger on close, close on `Escape`, and prevent body scroll while open (Radix `Dialog` 기본 동작 활용).

**REQ-LAYOUT-PRIMITIVES-005 (Event-Driven)**
**When** a `DropdownMenu` or `Select` is opened, the system **shall** support keyboard navigation via arrow keys, `Home`/`End`, type-ahead, and selection via `Enter`/`Space` (Radix 기본 동작 활용).

**REQ-LAYOUT-PRIMITIVES-006 (Ubiquitous)**
The `Input` and `Checkbox` primitives **shall** be paired with a `Label` via `htmlFor` association, and **shall** expose `aria-invalid`, `aria-describedby` attributes for downstream form validation. 자동 저장/검증 로직은 본 SPEC 범위 외.

**REQ-LAYOUT-PRIMITIVES-007 (Unwanted Behavior)**
**If** a primitive is implemented without leveraging the corresponding Radix UI component (예: 자체 구현 `<Dialog>`), **then** the implementation **shall not** be considered complete (예외: `Card`, `Badge`, `Avatar` 처럼 인터랙션이 없는 표현용 컴포넌트는 Radix 미사용 허용).

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 **명시적으로 빌드하지 않으며**, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 SPEC |
|------|---------------|
| Supabase Auth 통합, `getUser()` 가드, `/login` 리다이렉트 | SPEC-AUTH-001 |
| `/dashboard` KPI 카드, 칸반 보드 | SPEC-DASHBOARD-001 |
| `/projects` 리스트·CRUD, project-form | SPEC-PROJECT-001 |
| `/instructors` 테이블, resume-form | SPEC-INSTRUCTOR-001 |
| `/me/*` 강사 본인 영역 페이지 | SPEC-ME-001 |
| `/admin/*` 관리자 페이지 (Phase 2) | SPEC-ADMIN-001 |
| ⌘K 명령 팔레트 | SPEC-CMDK-001 |
| 알림 벨 데이터 연동, drawer | SPEC-NOTIF-001 |
| 다국어 i18n | (검토 후 결정) |
| 모바일 햄버거 메뉴, off-canvas sidebar | SPEC-LAYOUT-MOBILE-001 (후속) |
| Storybook, Chromatic visual regression | SPEC-STORYBOOK-001 (후속) |
| `tabs`, `tooltip`, `toast`, `command`, `calendar`, `data-table` 추가 프리미티브 | 필요 시점 SPEC |
| Style Dictionary, Figma 토큰 sync | (후속) |
| DB / 백엔드 / RLS 변경 | 해당 없음 (frontend-only) |

---

## 4. 영향 범위 (Affected Files)

본 SPEC 구현 시 생성·수정되는 파일 목록. **★ 표시는 stash@{0} 베이스라인 존재** — `/moai run` 단계에서 `git stash pop` 후 본 SPEC 인수기준에 맞춰 정제.

### 4.1 신규/수정 파일 (Application Shell + Routing)

- `src/app/layout.tsx` ★ — 루트 레이아웃, `next/font`로 Pretendard + JetBrains Mono 로드, `lang="ko"`, dark mode FOUC 방지 인라인 스크립트
- `src/app/globals.css` ★ — Tailwind 4 `@theme` directive, CSS variable 토큰 정의, dark mode override, base layer 리셋
- `src/app/(app)/layout.tsx` ★ (29 lines baseline) — `(app)` route group 진입점, 가드 hook placeholder, `<AppShell>` 렌더
- `src/components/app/app-shell.tsx` ★ (37 lines baseline) — 3-region 그리드 컨테이너
- `src/components/app/sidebar.tsx` ★ (104 lines baseline) — `userRole` 기반 nav 분기
- `src/components/app/topbar.tsx` ★ (121 lines baseline) — 페이지 타이틀 슬롯, 사용자 아바타·역할 배지, dark toggle, ⌘K/알림/로그아웃 placeholder

### 4.2 신규/수정 파일 (UI Primitives — shadcn/ui v4 패턴)

총 11개 파일, stash 기준 약 786 lines.

- `src/components/ui/button.tsx` ★
- `src/components/ui/card.tsx` ★
- `src/components/ui/dialog.tsx` ★
- `src/components/ui/input.tsx` ★
- `src/components/ui/label.tsx` ★
- `src/components/ui/select.tsx` ★
- `src/components/ui/dropdown-menu.tsx` ★
- `src/components/ui/popover.tsx` ★
- `src/components/ui/avatar.tsx` ★
- `src/components/ui/badge.tsx` ★
- `src/components/ui/checkbox.tsx` ★

### 4.3 신규/수정 파일 (Utilities + Tokens)

- `src/lib/utils.ts` (신규 또는 stash 존재 가능) — `cn()` 유틸 (`clsx` + `tailwind-merge`)
- `src/lib/types.ts` 또는 `src/types/role.ts` (신규) — `UserRole` TypeScript type alias, DB enum 미러링
- `.moai/design/tokens.json` ★ (148 lines baseline) — 디자인 토큰 기계 판독 출처
- `tailwind.config.ts` 또는 (Tailwind 4 CSS-first 시 불필요) — Tailwind 설정. CSS-first 방식 채택 시 `globals.css`만으로 충분
- `package.json` ★ — shadcn/ui CLI 의존성 (`@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) 추가 확인

### 4.4 검증 / 설정 파일

- `eslint.config.mjs` (신규 또는 수정) — 하드코딩 hex/px 금지 규칙 (옵션)
- `next.config.ts` — 변경 없음 또는 미세 조정
- `components.json` — shadcn/ui CLI 설정 (alias, style, baseColor 등)

### 4.5 변경 없음 (참고용)

- `.moai/specs/SPEC-DB-001/**` — DB 레이어, frontend SPEC과 무관
- `src/db/**`, `src/proxy.ts` — Drizzle/Supabase 관련, 본 SPEC 미사용

---

## 5. 기술 접근 (Technical Approach)

본 섹션은 구현의 큰 방향만 제시하며, 상세 단계는 `plan.md` 참조.

### 5.1 디자인 토큰 코드화 전략

Tailwind 4의 CSS-first config 방식을 채택한다. `tailwind.config.ts` 대신 `globals.css`의 `@theme` directive 내부에 모든 토큰을 CSS variable로 선언하면, Tailwind이 자동으로 `bg-primary`, `text-text-muted` 같은 utility class를 생성한다. 다크 모드는 `:root` 기본값 + `:root.dark` (또는 `@media (prefers-color-scheme: dark)`) 오버라이드로 5개 토큰만 재정의한다.

`.moai/design/tokens.json`은 기계 판독 가능 출처로 유지하되, `globals.css`와의 동기화는 코드 리뷰 + (선택적) 자동 생성 스크립트로 보장한다.

### 5.2 Role-based Sidebar 분기

`Sidebar` 컴포넌트는 `userRole: UserRole` prop을 받아 정적 메뉴 배열을 분기 렌더한다. 메뉴 정의는 `src/components/app/nav-config.ts` (신규) 같은 단일 파일에 상수로 정의한다:

```
const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  instructor: [/* /me/* 4종 */],
  operator: [/* 운영 5종 */],
  admin: [/* 운영 5종 + admin 헤더 + /admin/* */],
};
```

서버 컴포넌트 `(app)/layout.tsx`에서 `userRole`을 결정하여 `Sidebar`에 prop으로 전달한다. 본 SPEC에서는 `userRole`을 임시 prop(예: `userRole="operator"`)으로 하드코딩하거나, layout.tsx 상단에 `// TODO(SPEC-AUTH-001): replace with getUser()` 주석을 표시한다.

### 5.3 다크 모드 구현

`next-themes` 라이브러리 또는 인라인 `<script>` blocking 방식 중 택일. FOUC를 방지하려면 `<head>`에 동기 스크립트로 `document.documentElement.classList.add('dark')`를 추가하는 패턴이 일반적. 다크 토글 버튼은 topbar에 두며, 사용자 선택은 `localStorage`에 저장하고 system preference fallback을 유지한다.

### 5.4 shadcn/ui 컴포넌트 통합

stash@{0}에 11종 컴포넌트가 baseline으로 존재. `/moai run` 단계에서 다음 검증을 수행:

1. 각 컴포넌트가 Radix UI primitive를 import 하고 있는지
2. 디자인 토큰 utility class만 사용하는지 (`bg-primary` 사용 / `bg-[#2563EB]` 미사용)
3. `cn()` 유틸로 `className` prop 머지
4. TypeScript prop 타입이 적절히 추출되어 있는지 (`React.ComponentProps<typeof Primitive.Root>`)

### 5.5 접근성 검증

`pnpm dev` 실행 후 다음을 수동/자동 검증:
- axe DevTools 브라우저 확장으로 스캔 (critical 0)
- Lighthouse Accessibility audit (≥ 95)
- 키보드 only 순회 수동 테스트
- macOS VoiceOver 또는 NVDA(Windows)로 sidebar nav 읽기 테스트 (선택)

### 5.6 의존성 / 가정

- Next.js 16 App Router, React 19 RSC 활성
- Tailwind 4 (`@tailwindcss/postcss` 플러그인, CSS-first)
- shadcn/ui CLI v4 (`npx shadcn@latest add ...`로 설치된 컴포넌트 가정)
- Pretendard Variable 웹폰트 라이선스 OK (오픈 폰트)
- `next/font/local` 또는 `next/font/google` 둘 다 가능
- DB user.role enum (`instructor`/`operator`/`admin`)은 SPEC-DB-001에서 정의됨, 본 SPEC은 frontend `UserRole` type alias로 미러링만 함

---

## 6. 미해결 질문 (Open Questions)

> **2026-04-27 확정**: 사용자가 7개 질문 모두 권장값(Default)을 채택. `/moai run` 단계는 아래 RESOLVED 값으로 진행.

| # | 질문 | RESOLVED |
|---|------|----------|
| 1 | Tailwind 설정 형식 | **CSS-first** (`globals.css` `@theme` directive 단일 출처, `tailwind.config.ts` 미사용) |
| 2 | 다크 모드 라이브러리 | **`next-themes`** (FOUC 방지 + system fallback) |
| 3 | `/admin/*` Phase 2 노출 제어 | **`NEXT_PUBLIC_FEATURE_ADMIN`** 환경변수 토글 + 정의 유지 |
| 4 | `UserRole` 단일 출처 | **Drizzle 추출** — `InferSelectModel<typeof users>['role']` |
| 5 | Pretendard 로드 방식 | **npm `pretendard` 패키지 + `next/font/local`** (빌드 결정성) |
| 6 | ESLint hex/px 금지 룰 | **도입** — `eslint-plugin-no-restricted-syntax` (1px 예외 허용) |
| 7 | `nav-config.ts` 파일 위치 | **`src/components/app/nav-config.ts`** (sidebar 도메인 동거) |

---

_End of SPEC-LAYOUT-001 spec.md_
