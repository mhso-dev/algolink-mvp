# SPEC-LAYOUT-001 — 압축본 (Compact)

> 자동 생성 압축본. 요구사항 + 인수기준만 포함. 상세는 `spec.md` / `plan.md` / `acceptance.md` 참조.

**ID:** SPEC-LAYOUT-001 | **Version:** 1.0.0 | **Status:** draft | **Priority:** high
**Author:** 철 | **Created/Updated:** 2026-04-27

---

## 한 줄 요약

Algolink MVP의 모든 페이지가 공유할 frontend 기반 레이어 — `(app)` route group 공통 셸(사이드바+톱바+메인), `user_role`(instructor/operator/admin) 기반 nav 분기, shadcn/ui 11종 프리미티브, Tailwind 4 `@theme` 디자인 토큰(컬러 21·타이포 8·spacing 12·radius 5·shadow 3), `prefers-color-scheme` 다크 모드, WCAG 2.1 AA 접근성 베이스라인.

---

## EARS 요구사항 (5 모듈, 32 항목)

### REQ-LAYOUT-SHELL — 공통 앱 셸 구조 (6개)

- **001 Ubiquitous:** 시스템은 `(app)/*` 모든 라우트에 sidebar + topbar + main 3-region 셸을 렌더한다.
- **002 Ubiquitous:** 메인 영역은 `<main role="main">` 랜드마크로 노출하고 Next.js `children`을 받는다.
- **003 Event-Driven:** When 뷰포트 ≥ `lg` (1024px), sidebar 240px 확장 모드(텍스트+아이콘) 표시.
- **004 State-Driven:** While 뷰포트 < `lg`, sidebar 64px 아이콘 only collapse (모바일 햄버거는 Out of Scope).
- **005 Optional Feature:** Where topbar에 ⌘K/알림/사용자 메뉴 슬롯이 있으면, placeholder 버튼 렌더 (기능은 SPEC-CMDK-001/SPEC-NOTIF-001/SPEC-AUTH-001로 위임).
- **006 Unwanted Behavior:** If 페이지가 자체 sidebar/topbar 중복 렌더 시도하면, 시스템은 nested chrome을 표시하지 않는다.

### REQ-LAYOUT-NAV — 역할 기반 nav 분기 (6개)

- **001 Ubiquitous:** Sidebar는 `role`(instructor/operator/admin)을 prop으로 받아 권한별 nav만 렌더한다.
- **002 State-Driven:** While role=instructor, `[/me/dashboard, /me/resume, /me/schedule, /me/settlement]` 4종만, 운영/관리자 메뉴는 DOM 미존재.
- **003 State-Driven:** While role=operator, `[/dashboard, /projects, /instructors, /clients, /settlements]` 5종만, `/me/*` 및 `/admin/*` DOM 미존재.
- **004 State-Driven:** While role=admin, 운영 5종 + Admin 헤더 + `/admin/*` placeholder (Phase 2 노출 제어 가능).
- **005 Event-Driven:** When 현재 라우트가 nav item과 매칭, active state(`bg-primary/10`, `text-primary`, `aria-current="page"`) 적용.
- **006 Unwanted Behavior:** If userRole 누락/무효, sidebar nav 0개 + dev-mode 콘솔 경고.

### REQ-LAYOUT-TOKENS — 디자인 토큰 일관 적용 (6개)

- **001 Ubiquitous:** 모든 컬러/타이포/spacing/radius/shadow를 `globals.css` `@theme` directive CSS variable로 정의 + `tokens.json` 미러링.
- **002 Ubiquitous:** Light 모드 21 컬러 토큰 정의 — primary `#2563EB`, secondary `#0F172A`, accent `#F59E0B`, background `#FAFAFA`, surface `#FFFFFF`, text `#18181B`/`#71717A`/`#A1A1AA`, border `#E4E4E7`/`#D4D4D8`, 상태 9종(request/proposed/confirmed/in-progress/completed/settled/pending/alert/info).
- **003 State-Driven:** While `prefers-color-scheme: dark`, 5 토큰 오버라이드 — background `#09090B`, surface `#18181B`, border `#27272A`, text `#FAFAFA`, text-muted `#A1A1AA`. 상태 9종은 동일 유지.
- **004 Ubiquitous:** 타이포 8 role 정의 — Pretendard Variable + JetBrains Mono. Display 32/700/1.2, H1 24/700/1.3, H2 20/600/1.4, H3 16/600/1.5, Body 14/400/1.5, Body-strong 14/600/1.5, Caption 12/400/1.4, Mono 13/400/1.4.
- **005 Ubiquitous:** spacing 4px base [0,4,8,12,16,20,24,32,40,48,64,80] / radius {sm:4, md:6, lg:8, xl:12, full:9999} / shadow 3 levels (sm/md/lg).
- **006 Unwanted Behavior:** If hex 색상 또는 1px 외 px 직접 사용, 구현 미완료로 간주(코드 리뷰 또는 lint 룰로 거절).

### REQ-LAYOUT-A11Y — 접근성 WCAG 2.1 AA (7개)

- **001 Ubiquitous:** 모든 인터랙티브 요소는 키보드 Tab 순회 가능 + 시각 reading order 일치.
- **002 Event-Driven:** When `:focus-visible` 활성, 2px outline + 인접 배경 대비 3:1 이상 포커스 링 표시.
- **003 Ubiquitous:** 본문 텍스트 4.5:1, 큰 텍스트/UI 3:1 대비 (light + dark 양쪽).
- **004 Ubiquitous:** `aria-label`, `aria-current`, `aria-expanded`, `aria-controls`, `role` 등 ARIA 속성 적절히 부여 + Radix UI 활용.
- **005 Unwanted Behavior:** If 정보가 색상 only로 전달되면, 컴플라이언트 아님; 텍스트/아이콘 병기 필수.
- **006 Unwanted Behavior:** If transition > 200ms (장식 외 인터랙션), 200ms 이하로 단축 (`cubic-bezier(0.4, 0, 0.2, 1)` 권장).
- **007 Optional Feature:** Where `prefers-reduced-motion: reduce`, 비-essential 트랜지션/애니메이션 비활성화.

### REQ-LAYOUT-PRIMITIVES — shadcn/ui 11종 (7개)

- **001 Ubiquitous:** `src/components/ui/`에 11종 프리미티브 제공 — button, card, dialog, input, label, select, dropdown-menu, popover, avatar, badge, checkbox. shadcn/ui CLI v4 + Radix UI 기반.
- **002 Ubiquitous:** 각 프리미티브는 디자인 토큰 utility class만 사용 + `cn()` 유틸로 `className` prop 머지.
- **003 Ubiquitous:** Button variants: default, secondary, outline, ghost, destructive / sizes: default, sm, lg, icon. 파괴적 액션은 destructive + 텍스트 병기.
- **004 Event-Driven:** When Dialog 열림, focus trap + Esc 닫기 + 트리거 포커스 복귀 + body scroll 잠금 (Radix 기본).
- **005 Event-Driven:** When DropdownMenu/Select 열림, 화살표/Home/End/type-ahead/Enter/Space 키보드 네비게이션 (Radix 기본).
- **006 Ubiquitous:** Input/Checkbox는 Label `htmlFor` 연결 + `aria-invalid`, `aria-describedby` 노출.
- **007 Unwanted Behavior:** If 인터랙티브 컴포넌트가 Radix UI 미사용으로 자체 구현되면 미완료로 간주 (Card/Badge/Avatar 정적 표현 컴포넌트는 예외).

---

## 인수기준 요약 (Given/When/Then 5개)

| # | 시나리오 | 핵심 검증 |
|---|---------|----------|
| 1 | 강사 nav 분기 | role=instructor 시 sidebar 4개 항목만, `/dashboard`/`/projects`/`/admin` href DOM 0건 |
| 2 | 디자인 토큰 일관성 | `grep -rE "#[0-9a-f]{3,6}" src/components/` 0 hit, `grep "[0-9]+px"` 1px 외 0 hit |
| 3 | 키보드 순회 + 포커스 | Tab만으로 sidebar(5)→topbar(4)→main(1) 시각 순서 통과 + `:focus-visible` 링 가시 + axe critical 0 + Lighthouse a11y ≥95 |
| 4 | 색상 대비 WCAG AA | 본문 4.5:1, 큰 텍스트 3:1 (light + dark), axe color-contrast violation 0 |
| 5 | 다크 모드 + FOUC | OS dark + 첫 로드 시 `<html class="dark">` 즉시 적용 + 흰 배경 깜빡임 없음 + 토글 light/system/dark 3-way + localStorage 영속 + reduce-motion 적용 |

추가 (보너스): 11종 프리미티브 키보드 동작 — Dialog Esc/포커스 복귀, DropdownMenu 화살표 + type-ahead, Checkbox Space 토글, Label htmlFor 연결.

---

## 영향 범위 (Affected Files)

**stash@{0} baseline 존재 (★) — `/moai run` 시 pop 후 정제:**

- `src/app/(app)/layout.tsx` ★ (29 lines)
- `src/app/layout.tsx` ★ (수정)
- `src/app/globals.css` ★ (수정)
- `src/components/app/{app-shell, sidebar, topbar}.tsx` ★ (37+104+121=262 lines)
- `src/components/ui/{button, card, dialog, input, label, select, dropdown-menu, popover, avatar, badge, checkbox}.tsx` ★ (11 파일, ~786 lines)
- `.moai/design/tokens.json` ★ (148 lines)

**신규/추가:**
- `src/lib/utils.ts` (cn 유틸)
- `src/lib/types/role.ts` (UserRole alias)
- `src/components/app/nav-config.ts` (NAV_BY_ROLE 상수)
- `components.json` (shadcn/ui CLI 설정)
- `package.json` (Radix UI + cva + clsx + tailwind-merge + lucide-react + next-themes 의존성)

---

## 제외 사항 (Exclusions)

| 항목 | 위임 SPEC |
|------|-----------|
| 인증/세션/`/login` 가드 | SPEC-AUTH-001 |
| 페이지 콘텐츠 (dashboard/projects/instructors/me/admin) | 각 도메인 SPEC |
| ⌘K 명령 팔레트 | SPEC-CMDK-001 |
| 알림 벨 데이터 연동 | SPEC-NOTIF-001 |
| 폼 컴포넌트 | 각 도메인 SPEC |
| 칸반/KPI/테이블 복합 컴포넌트 | SPEC-DASHBOARD-001 등 |
| 다국어 i18n | (보류) |
| 모바일 햄버거 메뉴 | SPEC-LAYOUT-MOBILE-001 (후속) |
| Storybook | SPEC-STORYBOOK-001 (후속) |
| 추가 프리미티브 (tabs/tooltip/toast/calendar/data-table 등) | 필요 시점 SPEC |
| DB / 백엔드 변경 | 해당 없음 (frontend-only) |

---

## 결정 필요 사항 (Open Questions, 7개)

1. Tailwind 설정 형식 (CSS-first vs `tailwind.config.ts`) — **권장: CSS-first**
2. 다크 모드 라이브러리 (next-themes vs 자체) — **권장: next-themes**
3. `/admin/*` Phase 2 노출 (시각 숨김 vs 환경변수) — **권장: 환경변수**
4. UserRole 단일 출처 (Drizzle 추출 vs 수동) — **권장: Drizzle 추출**
5. Pretendard 로드 (npm + next/font/local vs CDN) — **권장: npm 패키지**
6. Hex/px 금지 ESLint 룰 — **권장: 도입**
7. nav-config.ts 위치 — **권장: `src/components/app/`**

---

_End of SPEC-LAYOUT-001 spec-compact.md_
