# SPEC-MOBILE-001 — 인수기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항을 **검증 가능한 Given/When/Then 시나리오**로 구체화한다. `/moai run` 완료 시점에 모든 시나리오가 PASS 해야 본 SPEC이 종료된다.

검증 대상 viewport는 5종이며, 모든 시나리오는 light + dark 양쪽에서 검증한다:

- **320px** — iPhone SE (1st gen), 최저 baseline
- **375px** — iPhone 12 / 13 / 14, 가장 흔한 모바일
- **768px** — iPad portrait, md breakpoint 진입
- **1024px** — iPad Pro / lg breakpoint 진입 (모바일 ↔ 데스크톱 전환점)
- **1440px** — desktop reference (회귀 검증용)

검증 대상 페이지는 13종이며, 3 role × 라이트/다크 = 검증 매트릭스 = 5 × 13 × 2 = 130 cell. 자동화 전 수동 sampling은 핵심 5페이지 × 5 viewport = 25 cell.

---

## 시나리오 1: Viewport 베이스라인 정정 + Safe-area 적용

**연관 EARS:** REQ-MOB-VIEWPORT-001, REQ-MOB-VIEWPORT-002, REQ-MOB-VIEWPORT-003

**Given (전제):**
- `src/app/layout.tsx`에 `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [...] }`가 추가되어 있다
- `globals.css`에 safe-area utility (`pt-safe`, `pb-safe`, `px-safe`)와 `--touch-target-min`이 정의되어 있다

**When (실행):**
- iPhone 12 (375px) viewport에서 `(operator)/dashboard` 페이지를 로드한다
- DevTools에서 `<head>`의 viewport meta 태그를 확인한다
- iOS Safari simulator에서 notch 영역과 home indicator 영역의 콘텐츠 침범 여부를 시각 확인한다

**Then (기대):**
- HTML head에 `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` 가 포함된다 (Next.js viewport API가 자동 생성)
- `<meta name="theme-color" content="#FAFAFA" media="(prefers-color-scheme: light)">` 와 `(prefers-color-scheme: dark)` 버전이 모두 존재한다
- topbar의 상단 padding이 `safe-area-inset-top`만큼 자동 확장되어 notch 아래에 콘텐츠가 위치한다
- 모달/Sheet drawer의 하단이 `safe-area-inset-bottom`만큼 padding되어 home indicator를 침범하지 않는다
- 페이지의 어떤 wrapper도 `100vh`를 사용하지 않으며 `100dvh` 또는 `min-h-screen` 패턴 사용
- iOS 가상 뷰포트(980px)로 강제 렌더되지 않는다 (`document.documentElement.clientWidth` ≈ 375)

**검증 방법:** 수동 — iOS simulator (`xcrun simctl boot "iPhone 14"` + Safari) + DevTools Elements. 자동화 — Playwright `await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /width=device-width.*initial-scale=1/)`

---

## 시나리오 2: AppShell 모바일 분기 + Sidebar drawer

**연관 EARS:** REQ-MOB-SHELL-001, REQ-MOB-SHELL-002, REQ-MOB-NAV-001, REQ-MOB-NAV-002, REQ-MOB-NAV-003

**Given (전제):**
- `src/components/app/app-shell.tsx`가 `grid-cols-1 lg:grid-cols-[240px_1fr]`로 분기되어 있다
- `src/components/app/topbar.tsx`에 햄버거 버튼이 `<Button variant="ghost" size="icon" className="lg:hidden">` 으로 추가되어 있다
- shadcn/ui Sheet 컴포넌트가 `src/components/ui/sheet.tsx`에 존재한다
- 사용자는 `userRole="operator"`로 인증된 상태이다

**When (실행):**
- 320px / 375px / 768px viewport에서 `(operator)/dashboard`에 진입한다
- DOM 검사기에서 sidebar 영역을 확인한다
- 햄버거 버튼을 클릭한다
- drawer가 열린 상태에서 Tab 키를 눌러 focus 순회를 확인한다
- nav item "프로젝트"를 클릭한다
- 1024px viewport로 전환한 뒤 동일 페이지를 재로딩한다

**Then (기대):**
- < lg viewport (320 / 375 / 768): persistent `<aside>` sidebar 컬럼이 DOM에 미존재 (또는 `lg:flex` 처리로 시각적으로만 hidden)
- 햄버거 버튼이 topbar 좌측에 노출되며 `min-h-touch min-w-touch` (44×44px) 보장
- 햄버거 클릭 시 Sheet drawer가 좌측에서 슬라이드 인 (≤ 200ms 트랜지션)
- drawer 열림 동안:
  - `<body>` 또는 `<html>` 에 scroll lock 적용 (Radix Dialog 기본 동작)
  - 백그라운드에 scrim (`bg-black/50` 또는 토큰 기반) 표시
  - Tab 순회가 drawer 내부에 trap (focus가 drawer 밖으로 나가지 않음)
  - drawer 내부에 기존 `<Sidebar userRole="operator">`와 동일한 5개 nav item 노출
- nav item 클릭 시 drawer 자동 닫힘 + `/projects`로 라우팅
- drawer 닫힌 후 focus가 햄버거 트리거로 복귀
- ≥ lg viewport (1024 / 1440): 햄버거 버튼 미렌더, persistent sidebar 정상 노출 (SPEC-LAYOUT-001 동작 회귀 없음)
- `Escape` 키 입력 시 drawer 즉시 닫힘

**검증 방법:** 수동 — Chrome DevTools Device Mode + 키보드 only 테스트. 자동화 — `page.click('[aria-label="주 내비게이션 열기"]')` + `await expect(page.locator('[role=dialog]')).toBeVisible()` + Playwright Tab 순회 검증.

---

## 시나리오 3: Topbar 모바일 압축 + 검색 분기

**연관 EARS:** REQ-MOB-TOPBAR-001, REQ-MOB-TOPBAR-002, REQ-MOB-TOPBAR-003, REQ-MOB-TOPBAR-004

**Given (전제):**
- topbar가 `[햄버거] [페이지타이틀] [검색·알림·아바타]` 레이아웃으로 리팩터되어 있다
- < md viewport에서는 검색 input이 아이콘 버튼으로 대체된다

**When (실행):**
- 320px viewport에서 `(operator)/projects`에 진입한다
- topbar 가로 길이가 viewport와 일치하는지 (`scrollWidth === clientWidth`) 확인한다
- 검색 아이콘 버튼을 클릭한다
- 검색 input에 "테스트"를 입력한다
- Esc 키 또는 back 버튼으로 검색 모드를 닫는다
- 768px viewport로 전환 후 검색 input이 inline 노출되는지 확인한다

**Then (기대):**
- 320px / 375px:
  - topbar 좌측 햄버거 (44×44), 중앙 페이지 타이틀(`truncate`), 우측 검색 아이콘 + 알림 + 아바타 노출
  - topbar 자체에서 가로 overflow 발생하지 않음 (`overflow-x` 없음)
  - 검색 input은 DOM에 미렌더 또는 `hidden md:block` 처리
- 검색 아이콘 클릭 시:
  - inline expand 패턴: topbar 영역이 검색 input으로 변환되며 다른 액션은 일시 hidden, 좌측에 close 버튼 노출
  - input에 자동 focus, mobile keyboard 자동 호출 (iOS Safari)
  - Esc / close 버튼 클릭 시 원래 topbar로 복귀
- ≥ md (768 / 1024 / 1440):
  - 검색 input이 inline 노출 (`max-w-xs sm:max-w-sm md:max-w-md`)
  - topbar overflow 없음
- 페이지 타이틀이 매우 긴 경우 `truncate` + `min-w-0`으로 정상 처리

**검증 방법:** 수동 — Device Mode + 검색 시뮬레이션. 자동화 — `await expect(page).toHaveScrollWidth(viewport.width, {tolerance: 1})`.

---

## 시나리오 4: 페이지 컨테이너 표준화 (Container 컴포넌트)

**연관 EARS:** REQ-MOB-CONTAINER-001, REQ-MOB-CONTAINER-002, REQ-MOB-CONTAINER-003, REQ-MOB-CONTAINER-004

**Given (전제):**
- `src/components/app/container.tsx`에 `<Container variant="default|narrow|wide">` 컴포넌트가 존재한다
- 13개 페이지가 `<Container>`를 사용하도록 리팩터되어 있다

**When (실행):**
- 다음 grep을 실행한다:
  ```
  grep -rE "max-w-\[[0-9]+(px|rem)\]|max-w-(5xl|6xl|7xl)" src/app/\(app\)/ --include="*.tsx"
  ```
- 320px / 375px / 768px / 1024px / 1440px viewport에서 `(operator)/dashboard`, `(operator)/projects`, `(instructor)/me/page.tsx` 3페이지를 로드한다
- 각 viewport에서 콘텐츠 영역의 좌우 padding을 측정한다

**Then (기대):**
- grep 결과: 0 hit (페이지 파일 내 직접 max-w 사용 없음. 단, `<Container>` 내부 정의는 허용)
- 320px viewport: 콘텐츠 좌우 padding `px-4` (16px) 적용, 페이지 max-width 미적용 (`width: 100%`)
- 375px viewport: 동일 (`px-4`)
- 768px viewport: `px-6` (24px) 적용, 여전히 `max-w` 미적용
- 1024px viewport: `px-8` (32px) 적용, `max-w-[1440px]` (default variant) 또는 `max-w-[1200px]` (narrow) 적용
- 1440px viewport: 콘텐츠가 정중앙 정렬, 좌우 여백 = (1440 - 1440) / 2 = 0 (default) 또는 (1440 - 1200) / 2 = 120px (narrow)
- 모든 viewport에서 `document.documentElement.scrollWidth <= window.innerWidth + 1` (가로 스크롤 없음)

**검증 방법:** Bash grep + 수동 페이지 로드 + DevTools Computed style 검사.

---

## 시나리오 5: KPI grid + Kanban board 반응형

**연관 EARS:** REQ-MOB-GRID-001, REQ-MOB-GRID-002, REQ-MOB-GRID-003, REQ-MOB-GRID-004

**Given (전제):**
- `(operator)/dashboard`에 KPI grid 4개와 Kanban board (5 컬럼)가 노출된다
- KPI grid가 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`로 리팩터되어 있다
- KanbanBoard가 모바일에서 `overflow-x-auto` + `scroll-snap-type: x mandatory` 적용되어 있다

**When (실행):**
- 320px viewport에서 dashboard 진입, KPI 카드 배치와 kanban 가로 스크롤 동작 확인
- 640px (sm) viewport로 변경, KPI는 2열, kanban은 2열 그리드 확인
- 1024px (lg) viewport로 변경, KPI는 4열, kanban은 5열 그리드 확인
- 모바일에서 kanban 컬럼 사이를 스와이프 또는 가로 스크롤한다

**Then (기대):**
- 320px / 375px:
  - KPI 카드: 1열, 각 카드 full width, 세로 스택
  - Kanban: `display: flex` 또는 `grid-flow-col`, 가로 스크롤 가능, 각 컬럼 `min-w-[280px]`
  - scroll snap: 스크롤 후 가장 가까운 컬럼에 자동 정렬
- 640px ~ 1023px (sm ~ lg-1):
  - KPI: 2열
  - Kanban: 2열 그리드 (스크롤 없음, 5개 컬럼이면 첫 화면 2개 + 다음 행 2개 + 다음 행 1개)
- 1024px+ (lg+):
  - KPI: 4열
  - Kanban: 5열 그리드 (SPEC-LAYOUT-001 + SPEC-DASHBOARD-001 desktop 기존 동작 유지)
- 모든 viewport에서 페이지 자체의 가로 스크롤 없음 (kanban 내부 가로 스크롤만 의도적 발생)

**검증 방법:** 수동 Device Mode 전환 + 스크롤 검증. 자동화 — Playwright `await expect(page.locator('[data-testid=kpi-grid]')).toHaveCSS('grid-template-columns', /repeat\(1/)` 등 viewport별 CSS 검증.

---

## 시나리오 6: 테이블 → 카드 변환 (instructors / clients / settlements)

**연관 EARS:** REQ-MOB-TABLE-001, REQ-MOB-TABLE-002, REQ-MOB-TABLE-003, REQ-MOB-TABLE-004

**Given (전제):**
- `(operator)/instructors/page.tsx`에 강사 리스트가 `<table>`로 렌더된다
- 모바일 대응 카드 마크업이 추가되어 `hidden md:table` + `md:hidden` 분기 패턴이 적용되어 있다
- 같은 패턴이 clients, settlements 리스트에 적용되어 있다

**When (실행):**
- 320px / 375px viewport에서 `(operator)/instructors` 진입
- DOM에서 `<table>` element와 `<ul>` (또는 `<div role="list">`) 카드 컨테이너를 모두 확인한다
- 768px viewport로 전환 후 동일 확인

**Then (기대):**
- < md (320 / 375 / 640):
  - `<table>` 가 `display: none` (`.hidden`) 처리됨 (DOM에는 존재 가능)
  - 카드 list view가 `display: block` 으로 노출
  - 각 카드는 강사 식별자(이름), 상태 배지, 핵심 메트릭(직군 / 평점 / 진행 프로젝트 수), "상세보기" 링크/버튼 (44×44px) 포함
  - 카드 사이 `gap-3` 또는 `gap-4`, `<Card>` 프리미티브 사용
  - 카드 list 자체에 가로 스크롤 없음
- ≥ md (768 / 1024 / 1440):
  - `<table>` 정상 노출 (SPEC-INSTRUCTOR-001 desktop 동작 유지)
  - 카드 list는 `hidden`
  - 컬럼 5개 이상이면 `<table>` 부모에 `overflow-x-auto` 적용 (안전망)
- clients, settlements 리스트도 동일 패턴 검증

**검증 방법:** 수동 — Device Mode 분기 확인 + 카드 마크업 의미론(semantic) 검토. 자동화 — `await expect(page.locator('table')).toBeHidden()` (모바일) / `toBeVisible()` (데스크톱).

---

## 시나리오 7: Resume form 모바일 1열 + sticky bottom action bar

**연관 EARS:** REQ-MOB-FORM-001, REQ-MOB-FORM-002, REQ-MOB-FORM-003, REQ-MOB-FORM-004, REQ-MOB-FORM-005

**Given (전제):**
- `src/components/resume/resume-form.tsx`가 모바일 분기 패턴으로 리팩터되어 있다
- `(instructor)/me/resume/page.tsx`에서 폼이 노출된다
- 폼에 "저장" / "취소" 액션 버튼이 존재한다

**When (실행):**
- 375px viewport에서 `(instructor)/me/resume` 진입
- 폼 필드 배치, 입력 시 가상 키보드, 액션 버튼 위치를 확인한다
- 폼 스크롤 후에도 "저장" 버튼이 화면 하단에 고정되어 있는지 확인한다
- 이메일 필드 클릭 시 `inputMode="email"` 키보드 호출 확인
- 1024px viewport로 전환 후 데스크톱 레이아웃 회귀 검증

**Then (기대):**
- 375px:
  - 폼 필드 모두 1열 배치 (`grid-cols-1`), 각 필드 `w-full`
  - input 높이 ≥ 44px (`min-h-touch` 또는 명시 `h-11`)
  - 기존 `overflow-x-auto` 테이블 영역(예: 이력 항목 row)이 카드/아코디언으로 변환되어 가로 스크롤 없음
  - 폼 컨테이너 하단에 `pb-24` (sticky bar 높이만큼 padding)
  - 화면 하단 (`bottom: 0` + `pb-safe`)에 sticky 액션 바: "저장" 버튼 full-width 또는 "취소" + "저장" 2분할
  - sticky bar는 `bg-surface border-t` + `pb-safe` (home indicator 회피)
- ≥ md:
  - 폼 필드가 기존 `grid-cols-2` / `grid-cols-3` 레이아웃 회귀
  - sticky bottom bar는 `md:hidden`, 데스크톱은 폼 우측 하단에 inline 액션 버튼
- input의 `inputMode`/`autoComplete` 적절히 적용 (email/tel/numeric/url 등)

**검증 방법:** 수동 — Device Mode + 가상 키보드 시뮬레이션 (Safari Simulator). 자동화 — `await expect(form).toHaveCSS('grid-template-columns', /1fr/)` (모바일) + sticky 위치 검증.

---

## 시나리오 8: Calendar 컴포넌트 모바일 (OperatorCalendar + FullCalendar)

**연관 EARS:** REQ-MOB-CALENDAR-001, REQ-MOB-CALENDAR-002, REQ-MOB-CALENDAR-003, REQ-MOB-CALENDAR-004

**Given (전제):**
- `src/components/dashboard/OperatorCalendar.tsx`가 모바일 분기 (약식 weekday + 도트 인디케이터)로 리팩터되어 있다
- `src/components/instructor/me-calendar-view.tsx`(FullCalendar v6)가 모바일에서 `headerToolbar` 단순화 + `initialView: "listWeek"` 적용되어 있다

**When (실행):**
- 375px viewport에서 `(operator)/dashboard/calendar` 진입 (OperatorCalendar 노출)
- 셀 폭, weekday label, 일정 표시 방식을 확인한다
- 일정이 있는 셀을 탭한다
- 375px viewport에서 `(instructor)/me/schedule` 진입 (FullCalendar 노출)
- headerToolbar, default view, 일정 chip 터치 가능 영역 확인

**Then (기대):**
- OperatorCalendar (375px):
  - `grid-cols-7` 유지 (월력 그리드 유지로 정보 손실 없음)
  - weekday header: "월", "화", ... (1글자 약식)
  - 셀 padding 축소 (`p-1` 또는 `p-2`)
  - 일정 미리보기 텍스트 제거 → 도트 인디케이터 (`<span class="size-1.5 rounded-full bg-primary">`)
  - 셀 탭 시 Popover 또는 Sheet로 해당 날짜 일정 상세 노출
  - 셀 자체가 44×44px 이상 보장 (모바일 셀 크기 약 53×60)
- FullCalendar (375px):
  - `headerToolbar`: `{ left: 'prev,next', center: 'title', right: 'today' }` (view switcher 제거)
  - `initialView: "listWeek"` 또는 `"timeGridDay"` (월 그리드 회피)
  - 일정 chip 터치 영역 ≥ 44px 높이
- ≥ md viewport: 데스크톱 기존 layout 회귀 (월 그리드, 풀 weekday label, 모든 view 옵션)

**검증 방법:** 수동 — Device Mode + 셀 탭 인터랙션. 자동화 시 FullCalendar 옵션 검증은 dom snapshot 비교.

---

## 시나리오 9: 터치 타겟 44×44px + Typography 가독성

**연관 EARS:** REQ-MOB-COMPONENT-002, REQ-MOB-COMPONENT-003, REQ-MOB-COMPONENT-004

**Given (전제):**
- 모든 인터랙티브 요소가 mobile viewport에서 `min-h-touch min-w-touch` (44×44px) 보장된다
- `text-xs`가 모바일에서 `text-sm md:text-xs` 패턴으로 상향되어 있다
- 인터랙티브 Avatar는 `<Button variant="ghost" size="icon">`로 래핑되어 있다

**When (실행):**
- 320px viewport에서 `(operator)/dashboard`, `(operator)/projects`, `(instructor)/me/page.tsx` 3페이지 로드
- 각 페이지의 모든 `button, a, [role=button], input[type=checkbox], [role=menuitem]`을 querySelectorAll로 추출한다
- 각 요소의 `getBoundingClientRect()` width / height를 측정한다
- body 텍스트의 `font-size`를 측정한다 (특히 캡션, 메타데이터, 배지)

**Then (기대):**
- 모바일 viewport (< md):
  - 모든 인터랙티브 요소가 `width >= 44 && height >= 44` (또는 hit area pseudo로 효과적 영역 ≥ 44)
  - Avatar 인터랙티브: `<button>` 부모가 44×44 이상
  - Avatar 표시 전용 (예: 카드 내부 아바타): 28px 유지 허용 (인터랙션 없음)
  - 배지/캡션/메타데이터 텍스트의 `font-size: 14px` (`text-sm`)
- ≥ md viewport: 기존 `text-xs` (12px) / icon button 28px 회귀 가능
- axe DevTools "Target size (Minimum)" 룰: 0 violation
- Lighthouse Mobile Accessibility "Tap targets are sized appropriately": pass

**검증 방법:** 수동 — DevTools Inspect + 픽셀 측정. 자동화:
```js
// Playwright snippet
const targets = await page.$$('button, a, [role=button], input[type=checkbox]');
for (const el of targets) {
  const box = await el.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}
```

---

## 시나리오 10: CardHeader flex 분기 + project-filters-bar 폭 해제

**연관 EARS:** REQ-MOB-COMPONENT-001, REQ-MOB-COMPONENT-005

**Given (전제):**
- 7곳의 `<CardHeader className="flex-row">` 강제 사용이 `flex-col sm:flex-row` 패턴으로 리팩터되어 있다
- `project-filters-bar.tsx`의 `min-w-[140px]`, `min-w-[120px]`이 `flex-1 sm:min-w-[140px]` 패턴으로 변경되어 있다

**When (실행):**
- 320px viewport에서 `(instructor)/me/page.tsx` 진입 → CardHeader 영역 확인
- 320px viewport에서 `(operator)/projects` 진입 → project-filters-bar의 select들 확인
- 768px viewport로 전환 후 데스크톱 레이아웃 회귀 확인

**Then (기대):**
- 320px CardHeader:
  - 헤더 텍스트(title + actions)가 세로로 스택 (`flex-col`)
  - title이 길어도 줄바꿈 가능 (강제 horizontal scroll 없음)
- ≥ sm CardHeader:
  - 가로 정렬 (`sm:flex-row`)로 회귀
  - title 좌, actions 우 배치
- 320px project-filters-bar:
  - 모든 select trigger가 `flex: 1`로 가용 공간 균등 분할
  - 가로 overflow 없음
  - select가 너무 좁아질 경우 `flex-wrap`으로 다음 행으로 wrap 가능
- ≥ sm project-filters-bar:
  - select 최소 폭 140px 적용 회귀
- grep 검증: `grep -rn 'CardHeader.*"flex-row"' src/components/` 결과 0건 (또는 명시적 `sm:flex-row`만)

**검증 방법:** 수동 + grep.

---

## 시나리오 11: 다크 모드 회귀 + reduce-motion

**연관 EARS:** SPEC-LAYOUT-001 회귀 (REQ-LAYOUT-TOKENS-003), REQ-MOB-SHELL-005

**Given (전제):**
- 본 SPEC의 모든 모바일 변경이 다크 모드에서도 동일하게 동작한다
- `prefers-reduced-motion: reduce` 활성 시 Sheet drawer 트랜지션이 비활성화된다

**When (실행):**
- 모든 시나리오 1~10을 dark 모드로 재실행한다
- macOS System Settings > Accessibility > Reduce motion 활성 후 Sheet drawer 열기/닫기

**Then (기대):**
- 모든 시나리오 결과가 dark 모드에서도 동일하게 PASS
- 다크 모드 색상 (`#09090B` background 등)이 모바일 viewport에서도 정상 적용
- reduce-motion 활성 시 Sheet drawer가 트랜지션 없이 즉시 open/close
- 색상 대비 (dark): 본문 ≥ 4.5:1, large text ≥ 3:1

**검증 방법:** 수동 — OS 설정 + dark mode toggle + axe DevTools dark theme 스캔.

---

## 시나리오 12: 회귀 검증 (1024px+ desktop 동작 보존)

**연관 EARS:** REQ-MOB-SHELL-002, SPEC-LAYOUT-001 인수기준 1~6 전체

**Given (전제):**
- 본 SPEC 변경 후 1024px / 1440px viewport에서 SPEC-LAYOUT-001의 인수기준이 모두 회귀 없이 유지된다

**When (실행):**
- 1024px / 1440px viewport에서 SPEC-LAYOUT-001 acceptance.md의 시나리오 1~6을 재실행한다
- 시나리오 1: 강사 로그인 시 본인 영역 nav만 노출
- 시나리오 2: 디자인 토큰 일관성 (hex/px 0건)
- 시나리오 3: 키보드 only 순회 + 포커스 가시성
- 시나리오 4: 색상 대비 WCAG AA
- 시나리오 5: 다크 모드 + FOUC
- 시나리오 6: 11종 프리미티브 키보드 동작

**Then (기대):**
- SPEC-LAYOUT-001 시나리오 1~6 모두 PASS 유지
- 1024px+에서 햄버거 미렌더, persistent sidebar 동작
- 1024px+에서 topbar 검색 input inline 노출
- 1024px+에서 페이지 컨테이너 max-w (1440 / 1200) 적용
- 1024px+에서 KPI 4열, kanban 5열, 테이블 정상 렌더

**검증 방법:** SPEC-LAYOUT-001 acceptance.md를 그대로 재수행. 회귀 발견 시 본 SPEC FAIL.

---

## 시나리오 13: 자동화 매트릭스 검증 (선택, M5)

**연관 EARS:** 전체

**Given (전제):**
- Playwright + axe-core integration이 도입되어 있다
- 5 viewport (320 / 375 / 768 / 1024 / 1440) × 5 페이지 (`/dashboard`, `/projects`, `/instructors`, `/me/page`, `/me/schedule`) × 2 mode (light / dark) = 50 cell 매트릭스 정의

**When (실행):**
- `pnpm exec playwright test specs/mobile-responsive.spec.ts` 실행

**Then (기대):**
- 50 cell 모두 다음 검증 통과:
  - 가로 스크롤 없음 (의도적 영역 제외)
  - axe critical 0, serious 0
  - 페이지 첫 인터랙티브 요소까지 키보드 도달 가능
  - 핵심 텍스트 가시 (font-size ≥ 14px)
- Lighthouse Mobile (3 페이지 평균): Accessibility ≥ 90, Performance ≥ 80

**검증 방법:** Playwright CLI + Lighthouse CI (선택).

---

## 인수기준 요약 표

| # | 시나리오 | 연관 EARS | 검증 도구 | 우선순위 |
|---|---------|----------|----------|---------|
| 1 | Viewport meta + Safe-area | REQ-MOB-VIEWPORT-001~003 | DevTools / iOS sim | High |
| 2 | AppShell 모바일 분기 + Drawer | REQ-MOB-SHELL-001~002, REQ-MOB-NAV-001~003 | Device Mode / 키보드 | High |
| 3 | Topbar 모바일 압축 | REQ-MOB-TOPBAR-001~004 | Device Mode | High |
| 4 | Container 표준화 | REQ-MOB-CONTAINER-001~004 | grep / DevTools | High |
| 5 | KPI + Kanban 반응형 | REQ-MOB-GRID-001~004 | Device Mode | High |
| 6 | 테이블 → 카드 변환 | REQ-MOB-TABLE-001~004 | Device Mode + DOM | High |
| 7 | Resume form + sticky bar | REQ-MOB-FORM-001~005 | Device Mode + Sim | High |
| 8 | Calendar 모바일 | REQ-MOB-CALENDAR-001~004 | Device Mode | Medium |
| 9 | 터치 타겟 + Typography | REQ-MOB-COMPONENT-002~004 | Playwright / axe | High |
| 10 | CardHeader + filters-bar | REQ-MOB-COMPONENT-001, 005 | grep / Device Mode | Medium |
| 11 | 다크 모드 + reduce-motion | REQ-MOB-SHELL-005, 회귀 | OS settings / axe | Medium |
| 12 | Desktop 회귀 검증 | SPEC-LAYOUT-001 시나리오 1~6 | 수동 재수행 | High |
| 13 | 자동화 매트릭스 (선택) | 전체 | Playwright / Lighthouse | Medium |

---

## 완료 정의 (Definition of Done)

본 SPEC의 인수 검증은 다음 조건이 모두 충족되어야 PASS로 간주된다:

- [ ] 시나리오 1~12 모두 PASS (시나리오 13 자동화 매트릭스는 권장)
- [ ] `plan.md` Section 5의 "완료 정의" 모든 항목 ✅
- [ ] `pnpm build` 0 error / 0 warning (critical)
- [ ] `pnpm tsc --noEmit` 0 type error
- [ ] `pnpm exec eslint .` 0 critical
- [ ] `grep -rE "max-w-\[[0-9]+(px|rem)\]" src/app/\(app\)/` 0 hit
- [ ] `grep -rE "100vh|100vw" src/components/ src/app/` (primary container) 0 hit
- [ ] `grep -rn 'CardHeader.*"flex-row"' src/components/` 0 hit (또는 `sm:flex-row` 명시만)
- [ ] `src/components/dashboard/kanban-board.tsx` 삭제 또는 사용처 0건
- [ ] axe DevTools (mobile viewport): critical 0, serious 0 (5 페이지 sampling)
- [ ] Lighthouse Mobile Accessibility ≥ 90 (3 페이지 평균)
- [ ] SPEC-LAYOUT-001 acceptance.md 시나리오 1~6 회귀 없음
- [ ] Open Questions 10개 중 핵심(1, 3, 7) 결정 + plan/spec 반영
- [ ] `progress.md` 진행 기록 작성

---

_End of SPEC-MOBILE-001 acceptance.md_
