# SPEC-MOBILE-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High / Medium / Low) + 의존 순서**로 표현한다.

본 SPEC은 SPEC-LAYOUT-001(implemented)이 구축한 frontend 기반 레이어 위에 모바일/태블릿 UX를 보강하는 후속 SPEC이며, **신규 페이지나 새 도메인 기능을 추가하지 않는다**. 13개 페이지 + 5종 복합 컴포넌트 + baseline 정정 + 신규 토큰 추가 + 구버전 정리가 본 SPEC의 산출물 전체이다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-LAYOUT-001 완료 (status: implemented, 2026-04-27) — 앱 셸, 디자인 토큰 49종, 11종 UI 프리미티브 baseline 존재
- ✅ Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui 환경
- ✅ `@radix-ui/react-dialog` 설치 (Sheet primitive base로 재사용)
- ✅ `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` 의존성
- ✅ `next-themes` 다크 모드 인프라
- ✅ `globals.css`의 `@theme` 토큰 21+8+12+5+3 = 49종

### 1.2 본 SPEC 내 선행 조건

- M1(baseline 정정 + 신규 토큰)이 모든 후속 마일스톤의 선행 조건
- M2(Sheet primitive + AppShell 분기)가 M3(페이지 컨테이너)와 병렬 가능하나 시각 검증은 M2 완료 후
- M5(복합 컴포넌트)는 M3 컨테이너 표준 위에서 진행 (페이지 max-w 제거 후 컴포넌트 폭 검증 가능)
- M6(검증 + 정리)는 M1~M5 완료 후 마지막 마일스톤

### 1.3 후속 SPEC을 위한 산출물 약속

- `<Container variant>` 컴포넌트는 후속 모든 페이지 SPEC에서 표준 wrapper로 import 가능
- `<Sheet>` primitive는 후속 SPEC(filter drawer, mobile menu 등)에서 재사용 가능
- 신규 토큰(`min-h-touch`, `pt-safe`, `pb-safe`)은 후속 컴포넌트에서 utility 형태로 즉시 사용 가능
- 표준 반응형 grid 패턴(`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)은 후속 SPEC의 reference 패턴

---

## 2. 마일스톤 분해 (Milestones)

### M1 — Baseline 정정 + 신규 디자인 토큰 [Priority: High]

**목표:** Viewport meta, safe-area, dvh, 신규 토큰을 정의하여 모든 후속 마일스톤이 의존할 baseline을 확립한다.

**대상 파일:**

- `src/app/layout.tsx` (수정) — Next.js 16 `export const viewport: Viewport` 추가, `themeColor` (light + dark)
- `src/app/globals.css` (수정) — `@theme` 블록 확장: `--mobile-spacing-{xs,sm,md}`, `--touch-target-min`, `--container-mobile-max`, `--container-tablet-max`, `--safe-{top,bottom,left,right}`. `@utility` 정의: `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, `px-safe`, `py-safe`, `min-h-touch`, `min-w-touch`. `@supports` 분기로 `100dvh` fallback
- `.moai/design/tokens.json` (수정) — `mobile` 네임스페이스 추가 (touch_target, safe_area, mobile_spacing, container)

**산출물:**

```ts
// src/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
  ],
};
```

```css
/* globals.css 추가 */
@theme {
  --touch-target-min: 44px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --mobile-spacing-xs: 12px;
  --mobile-spacing-sm: 16px;
  --mobile-spacing-md: 20px;
}

@utility pt-safe { padding-top: var(--safe-top); }
@utility pb-safe { padding-bottom: var(--safe-bottom); }
@utility px-safe { padding-left: var(--safe-left); padding-right: var(--safe-right); }
@utility py-safe { padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); }
@utility min-h-touch { min-height: var(--touch-target-min); }
@utility min-w-touch { min-width: var(--touch-target-min); }
```

**검증:**

- `pnpm dev` 실행 → DevTools에서 `<meta name="viewport" ...>` 확인
- iOS Safari simulator에서 notch / home indicator 영역 확인
- `grep -rE "100vh|100vw" src/components/ src/app/` 결과 분석 → primary container 사용처 0건 (작은 spinner 등은 허용 가능, case-by-case)
- 신규 utility class (`pt-safe`, `min-h-touch`)가 사용 가능한 상태

**연관 EARS:** REQ-MOB-VIEWPORT-001, 002, 003, 004, REQ-MOB-TOKEN-001, 002, 003, 004

**Definition of Done:**
- [ ] viewport meta DevTools에서 확인됨
- [ ] safe-area utility 정의 + 1곳 이상 사용 (topbar)
- [ ] 신규 토큰 8종 모두 globals.css + tokens.json에 mirror
- [ ] 기존 SPEC-LAYOUT-001 토큰 값 변경 0건 (`git diff`로 확인)

---

### M2 — Sheet primitive 도입 + AppShell 모바일 분기 [Priority: High]

**목표:** 모바일 햄버거 + Sheet drawer 패턴을 도입하고 AppShell이 viewport에 따라 sidebar 렌더 방식을 분기하도록 한다.

**대상 파일:**

- `src/components/ui/sheet.tsx` (신규) — shadcn/ui Sheet primitive (`@radix-ui/react-dialog` 기반, side prop: `left | right | top | bottom`)
- `src/components/app/mobile-nav.tsx` (신규) — 햄버거 트리거 + `<Sheet side="left">`로 기존 `<Sidebar userRole>` 래핑한 wrapper. 라우트 변경 시 자동 닫힘 (`usePathname` 변화 감지)
- `src/components/app/app-shell.tsx` (수정) — grid 분기:
  - `< lg`: `grid-cols-1 grid-rows-[56px_1fr]` (sidebar column 제거)
  - `>= lg`: `grid-cols-[240px_1fr] grid-rows-[56px_1fr]` (기존 SPEC-LAYOUT-001)
- `src/components/app/topbar.tsx` (수정) — `<MobileNav>` 햄버거 트리거를 좌측에 통합, `pt-safe` 적용

**산출물:**

```tsx
// src/components/app/mobile-nav.tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { UserRole } from "@/types/role";

export function MobileNav({ userRole }: { userRole: UserRole }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden min-h-touch min-w-touch"
          aria-label="주 내비게이션 열기"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 pb-safe">
        <Sidebar userRole={userRole} />
      </SheetContent>
    </Sheet>
  );
}
```

**검증:**

- 320px / 375px / 768px viewport에서 햄버거 클릭 → Sheet drawer 좌측 슬라이드 인
- drawer 내부 nav item 클릭 → 라우팅 + drawer 자동 닫힘
- Tab 순회 trap 확인 (drawer 내부에 갇힘)
- Esc 키 닫힘
- 1024px viewport: 햄버거 미렌더, persistent sidebar 정상

**연관 EARS:** REQ-MOB-SHELL-001, 002, 003, 004, 005, REQ-MOB-NAV-001, 002, 003, 004, 005, 006

**Definition of Done:**
- [ ] `sheet.tsx` 컴포넌트 작성, Radix Dialog 기반, focus trap 동작
- [ ] `mobile-nav.tsx` 컴포넌트 작성, route 변경 시 auto-close
- [ ] AppShell grid 분기 적용
- [ ] 320 / 375 / 768 / 1024 viewport에서 시각 확인 통과
- [ ] axe DevTools 모바일 viewport critical 0

---

### M3 — Topbar 모바일 압축 + 페이지 컨테이너 표준화 [Priority: High]

**목표:** Topbar의 검색 input을 모바일에서 아이콘으로 분기하고, 13개 페이지의 max-w 강제를 제거하여 `<Container>` 컴포넌트로 표준화한다.

**대상 파일:**

- `src/components/app/container.tsx` (신규) — `<Container variant="default|narrow|wide">` 컴포넌트
- `src/components/app/topbar.tsx` (추가 수정) — 검색 input 모바일 분기:
  - `< md`: 검색 아이콘 버튼만 노출 (탭 시 inline expand 또는 overlay)
  - `>= md`: inline input (`max-w-xs sm:max-w-sm md:max-w-md`)
  - 액션 우선순위: `[햄버거] [페이지 타이틀(truncate)] [검색·알림·아바타]`
- `src/app/(app)/(operator)/dashboard/page.tsx` — `<Container>` 사용
- `src/app/(app)/(operator)/dashboard/calendar/page.tsx` — `<Container variant="narrow">`
- `src/app/(app)/(operator)/projects/page.tsx`, `[id]/page.tsx` — `<Container>` / `<Container variant="narrow">`
- `src/app/(app)/(operator)/instructors/page.tsx`, `[id]/page.tsx` — 동일
- `src/app/(app)/(operator)/clients/page.tsx`, `[id]/page.tsx` — 동일
- `src/app/(app)/(operator)/settlements/page.tsx`, `[id]/page.tsx` — 동일
- `src/app/(app)/(operator)/operator/invite/page.tsx` — `<Container variant="narrow">`
- `src/app/(app)/(instructor)/me/page.tsx`, `me/schedule/page.tsx`, (그리고 me/resume, me/settlements, me/settings) — `<Container>`

**산출물:**

```tsx
// src/components/app/container.tsx
import { cn } from "@/lib/utils";
import type { ComponentProps, ElementType } from "react";

const VARIANT_MAX_W = {
  default: "lg:max-w-[1440px]",
  narrow: "lg:max-w-[1200px]",
  wide: "lg:max-w-[1600px]",
} as const;

type ContainerProps<T extends ElementType = "div"> = {
  variant?: keyof typeof VARIANT_MAX_W;
  as?: T;
} & ComponentProps<T>;

export function Container({
  variant = "default",
  as: Tag = "div",
  className,
  ...rest
}: ContainerProps) {
  const Component = Tag as ElementType;
  return (
    <Component
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        VARIANT_MAX_W[variant],
        className,
      )}
      {...rest}
    />
  );
}
```

**페이지 변환 패턴:**

```tsx
// before
<div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-6">
  {/* page content */}
</div>

// after
<Container className="flex flex-col gap-6 py-6">
  {/* page content */}
</Container>
```

**검증:**

- `grep -rE "max-w-\[[0-9]+(px|rem)\]|max-w-(5xl|6xl|7xl)" src/app/\(app\)/ --include="*.tsx"` → 0 hit
- 5 viewport에서 13페이지 모두 가로 스크롤 0 (chrome devtools)
- topbar 가로 overflow 0건
- 검색 아이콘 클릭 시 inline expand 동작
- 1024 / 1440px에서 max-w 적용 회귀 정상

**연관 EARS:** REQ-MOB-TOPBAR-001, 002, 003, 004, 005, REQ-MOB-CONTAINER-001, 002, 003, 004

**Definition of Done:**
- [ ] `container.tsx` 작성, 3 variant 동작
- [ ] 13개 페이지 모두 `<Container>` 사용으로 변환
- [ ] grep 0 hit 검증 통과
- [ ] topbar 모바일 압축 동작 확인 (320 ~ 768px)
- [ ] Desktop 1024 / 1440px 회귀 검증 통과

---

### M4 — KPI / Kanban / Table / Calendar 반응형 [Priority: High]

**목표:** 핵심 복합 컴포넌트 4종(KPI grid, Kanban board, 데이터 테이블, Calendar)을 mobile-first 패턴으로 보강한다.

**대상 파일:**

- `src/components/dashboard/KpiGrid.tsx` 또는 `KpiCard.tsx` 호출부 — `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` 표준 패턴 적용
- `src/components/dashboard/KanbanBoard.tsx` (수정) — 모바일 분기:
  - `< sm`: `flex overflow-x-auto snap-x snap-mandatory gap-4` + 각 컬럼 `min-w-[280px] snap-start`
  - `sm ~ lg`: `grid grid-cols-2 gap-4`
  - `>= lg`: `grid grid-cols-5 gap-4` (기존 desktop 회귀)
- `src/components/dashboard/OperatorCalendar.tsx` (수정) — 모바일 셀 패딩 축소 + 약식 weekday + 도트 인디케이터, 셀 탭 시 Popover 일정 상세
- `src/components/instructor/me-calendar-view.tsx` (수정) — FullCalendar 옵션 분기:
  - `< md`: `headerToolbar: { left: 'prev,next', center: 'title', right: 'today' }`, `initialView: "listWeek"`
  - `>= md`: 기존 옵션 (월 그리드 + view switcher)
  - `useMediaQuery` 훅 또는 `window.matchMedia`로 viewport 감지
- 강사 / 클라이언트 / 정산 리스트 페이지 — 테이블 모바일 카드 분기:
  - `<table className="hidden md:table">` + `<ul className="md:hidden grid grid-cols-1 gap-3">`
  - 카드 마크업: `<Card>` + 핵심 4-5 필드 + "상세보기" 링크 (44×44px)

**산출물 예시:**

```tsx
// KanbanBoard.tsx (간략화)
<div className={cn(
  "min-w-0",
  // mobile: horizontal scroll with snap
  "flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2",
  // tablet: 2-column grid
  "sm:grid sm:grid-cols-2 sm:overflow-visible sm:snap-none",
  // desktop: 5-column grid
  "lg:grid-cols-5",
)}>
  {columns.map((col) => (
    <KanbanColumn
      key={col.id}
      className="min-w-[280px] snap-start sm:min-w-0"
      {...col}
    />
  ))}
</div>
```

```tsx
// instructors/page.tsx (간략화)
<>
  <table className="hidden md:table w-full">
    {/* desktop table */}
  </table>
  <ul className="md:hidden grid grid-cols-1 gap-3" role="list">
    {instructors.map((i) => (
      <li key={i.id}>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Avatar />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{i.name}</p>
              <p className="text-sm text-text-muted">{i.role}</p>
              <Badge variant={statusVariant(i.status)}>{i.status}</Badge>
            </div>
            <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
              <Link href={`/instructors/${i.id}`} aria-label={`${i.name} 상세보기`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </li>
    ))}
  </ul>
</>
```

**검증:**

- 320 / 375 / 768 / 1024px viewport에서 KPI / Kanban / Calendar / Table 4종 시각 확인
- 모바일 kanban: 가로 스크롤 + scroll snap 동작
- 태블릿 kanban: 2열 그리드, 가로 스크롤 0
- 데스크톱 kanban: 5열 그리드 회귀
- 모바일 instructors: `<table>` 미노출, 카드 list 노출
- 데스크톱 instructors: 테이블 노출, 카드 list 미노출
- OperatorCalendar 모바일 셀 폭 정상, 일정 도트 노출
- FullCalendar 모바일에서 listWeek 기본 view

**연관 EARS:** REQ-MOB-GRID-001~005, REQ-MOB-TABLE-001~004, REQ-MOB-CALENDAR-001~004

**Definition of Done:**
- [ ] KPI grid 표준 패턴 적용 (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)
- [ ] Kanban 3-tier 분기 (mobile scroll / tablet 2col / desktop 5col)
- [ ] 3개 리스트 페이지(instructors / clients / settlements) 카드 변환
- [ ] OperatorCalendar 모바일 약식 + 도트
- [ ] FullCalendar `listWeek` 기본 view (모바일)

---

### M5 — Form 모바일 + 컴포넌트 일관성 보강 [Priority: High]

**목표:** Resume form 우선으로 폼 모바일 패턴(1열 + sticky bottom bar)을 적용하고, CardHeader / Avatar / project-filters-bar / 터치 타겟 / typography를 일괄 보강한다.

**대상 파일:**

- `src/components/resume/resume-form.tsx` (수정) — 1열 grid, `overflow-x-auto` 테이블 → 카드/아코디언, sticky bottom action bar (`md:hidden sticky bottom-0 inset-x-0 bg-surface border-t pb-safe`)
- `src/components/projects/project-filters-bar.tsx` (수정) — `min-w-[140px]`, `min-w-[120px]` → `flex-1 sm:min-w-[140px]` 패턴, `flex-wrap` 허용
- 7곳의 `<CardHeader className="flex-row">` 강제 제거 → `flex-col sm:flex-row` 패턴 일괄 변환:
  - `src/components/instructor/satisfaction-summary-card.tsx`
  - 그리고 audit에서 식별된 6곳 (M5 진입 시 `grep -rn 'CardHeader.*flex-row' src/components/`로 재식별)
- 인터랙티브 Avatar 래핑: 클릭 가능 Avatar는 `<Button variant="ghost" size="icon" className="min-h-touch min-w-touch">` 외부 래핑 (audit에서 식별된 사용처)
- `text-xs` 가독성 상향: 본문/캡션/메타데이터 사용처에 `text-sm md:text-xs` 패턴 적용 (배지 숫자 등 decorative는 유지)
- 터치 타겟 보강: 모든 `<Button size="icon">`, `<Button size="icon-sm">`, `<a>` 인터랙티브 요소에 `min-h-touch min-w-touch` 모바일 적용 (또는 `Button` 컴포넌트 자체에 조건부 size 적용)

**산출물 예시:**

```tsx
// resume-form.tsx (간략화)
<form onSubmit={handleSubmit}>
  <div className="space-y-6 pb-24 md:pb-0">
    {/* sections, each with grid-cols-1 md:grid-cols-2 */}
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" inputMode="text" autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">이메일</Label>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" />
      </div>
    </section>
    {/* 이력 항목 (이전 overflow-x-auto 테이블 → 카드 list) */}
    <section className="space-y-3">
      {experiences.map((exp) => (
        <Card key={exp.id} className="p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input value={exp.company} ... />
            <Input value={exp.role} ... />
            <Input value={exp.period} ... />
          </div>
        </Card>
      ))}
    </section>
  </div>

  {/* mobile sticky action bar */}
  <div className="md:hidden sticky bottom-0 inset-x-0 bg-surface border-t border-border px-4 py-3 pb-safe flex gap-2">
    <Button variant="outline" type="button" className="flex-1">취소</Button>
    <Button type="submit" className="flex-1">저장</Button>
  </div>

  {/* desktop inline action */}
  <div className="hidden md:flex md:justify-end md:gap-2 md:mt-6">
    <Button variant="outline" type="button">취소</Button>
    <Button type="submit">저장</Button>
  </div>
</form>
```

**검증:**

- `grep -rn 'CardHeader.*"flex-row"' src/components/` → 0 hit (또는 `sm:flex-row` 명시만)
- `grep -rE "min-w-\[1[24]0px\]" src/components/projects/` → project-filters-bar 0 hit
- 375px viewport에서 resume-form: 1열 + sticky bar 노출
- 1024px viewport: 폼 grid-cols-2 / 3 회귀, sticky bar 미노출, inline action 노출
- 터치 타겟 자동 검증: Playwright 또는 수동 측정으로 모든 인터랙티브 요소 ≥ 44×44

**연관 EARS:** REQ-MOB-FORM-001~005, REQ-MOB-COMPONENT-001~005

**Definition of Done:**
- [ ] resume-form 1열 + sticky bar 적용
- [ ] CardHeader 7곳 `flex-col sm:flex-row` 패턴
- [ ] project-filters-bar `min-w` 모바일 해제
- [ ] 터치 타겟 ≥ 44×44 모든 인터랙티브 요소 (모바일 viewport)
- [ ] `text-xs` 가독성 상향 패턴 적용
- [ ] 인터랙티브 Avatar 래핑

---

### M6 — 검증 + 회귀 + 정리 [Priority: High]

**목표:** 5 viewport × 13 페이지 매트릭스 검증, 구버전 파일 정리, axe / Lighthouse 자동 검증, 회귀 테스트.

**대상 작업:**

- 5 viewport × 5 핵심 페이지 (`/dashboard`, `/projects`, `/instructors`, `/me/page`, `/me/schedule`) 수동 시각 검증 + 스크린샷 기록
- axe DevTools 스캔: critical 0, serious 0 확인
- Lighthouse Mobile 측정: Accessibility ≥ 90, Performance ≥ 80
- `src/components/dashboard/kanban-board.tsx` 사용처 grep 확인 → 0건이면 삭제, 사용처 있으면 `KanbanBoard.tsx`로 일괄 import 치환 후 삭제
- (조건부) `src/components/dashboard/kpi-cards.tsx` 구버전 정리
- SPEC-LAYOUT-001 acceptance.md 시나리오 1~6 재실행 (회귀 검증)
- 다크 모드 + reduce-motion 환경에서 동일 검증 반복
- (선택) Playwright matrix test 작성 (`tests/mobile-responsive.spec.ts`):
  - viewport 5종 × 페이지 5종 × mode 2종 = 50 cell
  - 각 cell: 가로 스크롤 0, axe critical 0, 첫 인터랙티브 도달 가능
- `progress.md` 진행 기록 작성

**검증:**

- 모든 acceptance.md 시나리오 1~12 PASS (시나리오 13 자동화는 권장)
- `pnpm build` 0 error
- `pnpm tsc --noEmit` 0 error
- `pnpm exec eslint .` 0 critical
- Definition of Done 체크리스트 100%

**연관 EARS:** 전체 (검증), REQ-MOB-CLEANUP-001, 002, 003

**Definition of Done:**
- [ ] kanban-board.tsx (구버전) 삭제
- [ ] (조건부) 다른 구버전 컴포넌트 정리
- [ ] axe DevTools 5 페이지 × 모바일 viewport critical 0
- [ ] Lighthouse Mobile 3 페이지 평균 Accessibility ≥ 90
- [ ] SPEC-LAYOUT-001 회귀 검증 시나리오 1~6 PASS
- [ ] (선택) Playwright matrix 자동화 도입
- [ ] progress.md 작성

---

## 3. 위험 (Risks) 및 완화

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|--------|------|------|
| R1 | iOS Safari `100dvh` 비호환 환경 (iOS 15.3 이하) | L | M | `@supports (height: 100dvh)` fallback + `100vh` 보조. 또는 baseline iOS 15.4+ 명시(target audience 확인) |
| R2 | Tailwind 4 `@utility` directive로 `pt-safe` 정의 시 빌드 실패 (`@theme`에 인접 위치 필요) | M | M | M1 시작 시 Tailwind 4 공식 docs `@utility` 패턴 검증 + 단일 utility (`pt-safe`)부터 빌드 테스트 후 일괄 추가 |
| R3 | shadcn/ui Sheet primitive baseline이 SPEC-LAYOUT-001 토큰 명명과 불일치 | M | L | M2 시작 시 `npx shadcn@latest add sheet` 결과를 SPEC-LAYOUT-001 토큰(`bg-surface`, `border-border` 등)으로 일괄 치환. hex/zinc 직접 사용 0건 검증 |
| R4 | 13개 페이지 일괄 `<Container>` 변환 시 누락 또는 회귀 | H | M | M3 진입 시 `find` + `grep`으로 13페이지 위치 자동 식별, 변환 후 5 viewport × 13 페이지 sampling 검증. 단일 commit 분리(페이지별 또는 logical group) |
| R5 | Resume form 모바일 변환 시 데이터 입력 UX 회귀 (이력 항목 카드화로 입력 흐름 변경) | M | H | M5 시작 전 instructor persona 1명에게 mobile prototype review 또는 designer 호출. sticky bar의 keyboard 가림 이슈는 `@supports` 분기 |
| R6 | KanbanBoard `min-w-[280px]` × 5 컬럼 = 1400px → 모바일 가로 스크롤 길이 부담 | M | L | scroll snap으로 column-by-column 이동 자연스러움. 또는 모바일에서 컬럼 수를 시각적으로 제한 (1-2 컬럼만 화면) |
| R7 | FullCalendar `listWeek` 모바일 적용 시 사용자 익숙함 손실 (월 그리드 기대) | M | M | Open Question 4 결정. listWeek + 옵션으로 월 그리드 toggle 제공 또는 `dayGridWeek` 대안 검토 |
| R8 | 터치 타겟 44×44 강제 적용 시 시각 디자인 손상 (작은 아이콘 의도된 영역) | M | L | hit area pseudo (`::before { content: ''; position: absolute; inset: -8px; }`)로 시각 유지 + 터치 보장. `Button` 변형 추가 |
| R9 | `text-xs` 일괄 상향 시 데스크톱 정보 밀도 손상 | M | L | `text-sm md:text-xs` 패턴으로 데스크톱은 12px 유지. decorative text(배지 숫자)는 `text-xs` 유지 (선별 적용) |
| R10 | 모바일 검색 inline expand UX의 자연스러움 (back 버튼 위치, focus 동작) | M | M | M3 진입 시 prototype 작성 후 결정. 또는 fullscreen overlay 패턴(Open Question 1)으로 변경 가능 |
| R11 | 13페이지 + 7 CardHeader + 5 컴포넌트 → 단일 PR 리뷰 부담 | H | L | 마일스톤 단위 commit 분리: M1 / M2 / M3 / M4 / M5 / M6. PR도 마일스톤별 분할 또는 단일 PR 내 logical commit 분리 |
| R12 | Sheet drawer focus trap이 Radix Dialog 기본 동작과 충돌 (Sidebar 내부 form 등) | L | M | M2 진입 시 Sheet 내부에 form 요소 없는지 확인 (현재 Sidebar는 nav만). 향후 nav에 form 추가 시 별도 처리 |
| R13 | viewport meta 추가가 기존 SSR 결과에 영향 (Next.js 16 viewport API) | L | M | Next.js 16 docs 확인. 기존 `metadata` export 제거 시 추가 영향 검토. `viewport`는 별도 export로 영향 격리 |

---

## 4. 진행 순서 (Sequencing)

```
M1 (baseline + 토큰)
   ↓
M2 (Sheet + AppShell 분기) ────┐
                                ├──→ M4 (KPI / Kanban / Table / Calendar)
M3 (Topbar + Container) ───────┘                    ↓
                                            M5 (Form + 컴포넌트 일관성)
                                                    ↓
                                            M6 (검증 + 회귀 + 정리)
```

**병렬 가능:** M2와 M3는 서로 독립적이므로 병렬 가능. 단 M3의 페이지 컨테이너 변환은 M1 토큰이 필요하고, M2의 햄버거가 topbar에 통합되는 부분은 M3와 동시 작업 시 충돌 가능 → 두 마일스톤 모두 topbar.tsx를 수정하므로 직렬 처리 권장.

**M4와 M5 병렬 가능:** 서로 다른 컴포넌트 영역. M4는 dashboard / kanban / calendar / table 위주, M5는 form / CardHeader / 터치 타겟. 단 둘 다 M3 컨테이너 표준 위에서 진행 권장.

**M6는 직렬:** 모든 마일스톤 완료 후 통합 검증.

---

## 5. 완료 정의 (Definition of Done)

본 SPEC은 다음 모든 조건이 충족될 때 **완료**로 간주한다:

1. ✅ `pnpm build` 0 error / 0 warning (critical)
2. ✅ `pnpm tsc --noEmit` 0 type error
3. ✅ `pnpm exec eslint .` 0 critical
4. ✅ DevTools에서 viewport meta 적용 확인 (`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`)
5. ✅ `grep -rE "max-w-\[[0-9]+(px|rem)\]" src/app/\(app\)/` 0 hit
6. ✅ `grep -rn 'CardHeader.*"flex-row"' src/components/` 0 hit (또는 `sm:flex-row` 명시만)
7. ✅ `src/components/dashboard/kanban-board.tsx` 삭제 또는 사용처 0건
8. ✅ axe DevTools (모바일 viewport) critical 0건, serious 0건 (5 페이지 sampling)
9. ✅ Lighthouse Mobile Accessibility ≥ 90 (3 페이지 평균)
10. ✅ Lighthouse Mobile Performance ≥ 80 (3 페이지 평균)
11. ✅ 5 viewport (320 / 375 / 768 / 1024 / 1440) × 5 핵심 페이지 모두 가로 스크롤 0 (의도적 영역 제외)
12. ✅ 모든 인터랙티브 요소 모바일에서 44×44 터치 타겟 보장 (Playwright 또는 수동 검증)
13. ✅ SPEC-LAYOUT-001 acceptance.md 시나리오 1~6 회귀 없음
14. ✅ Sheet drawer 키보드 동작: focus trap, Esc 닫기, 라우트 변경 자동 닫기, focus 복귀 모두 PASS
15. ✅ 다크 모드에서 모든 검증 동등 PASS
16. ✅ `acceptance.md`의 시나리오 1~12 모두 PASS (시나리오 13 자동화는 권장)
17. ✅ Open Questions 10개 중 핵심 7개(1, 2, 3, 4, 6, 7, 8) 결정 + spec/plan에 결정 반영
18. ✅ 신규 토큰 8종 globals.css + tokens.json mirror, 기존 SPEC-LAYOUT-001 토큰 값 변경 0건

---

## 6. 후속 SPEC 핸드오프 약속

본 SPEC 완료 시 후속 SPEC들이 import 가능한 산출물:

- `import { Container } from "@/components/app/container"` — 표준 페이지 wrapper
- `import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"` — 모바일 drawer / filter drawer / 기타 side panel
- `import { MobileNav } from "@/components/app/mobile-nav"` — topbar 햄버거 (이미 통합되어 있어 재사용 불필요)
- Tailwind utility: `pt-safe`, `pb-safe`, `px-safe`, `min-h-touch`, `min-w-touch` — 직접 사용 가능
- 표준 반응형 grid 패턴: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (KPI), `flex overflow-x-auto snap-x sm:grid sm:grid-cols-2 lg:grid-cols-5` (Kanban) — 후속 페이지 reference

후속 SPEC에서 새 페이지 추가 시:
- 반드시 `<Container>` 사용
- `max-w-[*]` 직접 사용 금지
- 인터랙티브 요소 `min-h-touch min-w-touch` 적용
- 폼은 `grid-cols-1 md:grid-cols-2` 패턴 + 모바일 sticky action bar (해당하는 경우)
- 데이터 테이블 시 모바일 카드 변환 (해당하는 경우)

---

_End of SPEC-MOBILE-001 plan.md_
