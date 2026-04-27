# SPEC-LAYOUT-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 — `users.role` enum (`instructor`/`operator`/`admin`) DB 정의
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩 (`966f345 chore: 프로젝트 초기 부트스트랩`)
- ✅ pnpm 환경, `package.json` 기본 의존성
- ✅ `.moai/design/research.md` + `.moai/design/spec.md` 디자인 의도 결정

### 1.2 본 SPEC 내 선행 조건

- 토큰(globals.css + tokens.json)이 컴포넌트보다 먼저 확정되어야 함 (M2 → M3, M4)
- `cn()` 유틸 + `UserRole` 타입은 컴포넌트 빌드 전에 준비 (M1)

### 1.3 후속 SPEC을 위한 산출물 약속

- `<AppShell>` 컴포넌트는 `children` slot을 React Server Component 호환으로 노출
- `Sidebar`는 `userRole` prop만 외부 의존 — 인증 통합 시 SPEC-AUTH-001가 prop 주입
- 11종 프리미티브는 `import { Button } from "@/components/ui/button"` 형태로 import 가능

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 의존성 + 유틸 + 타입 [Priority: High]

**산출물:**
- `package.json` 의존성 검증/추가: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `next-themes`, `@radix-ui/*` (각 컴포넌트별), `pretendard`(npm 패키지) 또는 webfont 자산
- `src/lib/utils.ts` — `cn()` 유틸 (clsx + tailwind-merge)
- `src/lib/types/role.ts` (또는 `src/db/types.ts` 연동) — `UserRole` type alias
- `components.json` — shadcn/ui CLI 설정 확인 (없을 시 생성: `style: new-york`, `baseColor: zinc`, `cssVariables: true`, `aliases: {components: "@/components", utils: "@/lib/utils"}`)

**검증:**
- `pnpm install` 무오류
- `pnpm tsc --noEmit` 0 type 에러

**연관 EARS:** REQ-LAYOUT-PRIMITIVES-002 (cn 유틸), REQ-LAYOUT-NAV-001 (UserRole 타입)

---

### M2 — 디자인 토큰 코드화 [Priority: High]

**산출물:**
- `src/app/globals.css` 확장:
  - `@import "tailwindcss"` (Tailwind 4)
  - `@theme { --color-* / --font-* / --spacing-* / --radius-* / --shadow-* }` 블록 — 21 컬러 + 8 타이포 + 12 spacing + 5 radius + 3 shadow
  - `:root.dark { --color-background / --color-surface / --color-border / --color-text / --color-text-muted }` 5 토큰 다크 오버라이드
  - 기본 `@layer base` 리셋 (`html`, `body`, `font-feature-settings` 등)
  - `:focus-visible` 스타일 (포커스 링 2px outline-primary)
  - `@media (prefers-reduced-motion: reduce)` 트랜지션 무력화
- `.moai/design/tokens.json` 검증/동기화 (stash baseline 그대로 또는 일치 확인)
- `src/app/layout.tsx` (root) — `next/font` 설정, `lang="ko"`, dark mode FOUC 방지 인라인 `<script>`

**검증:**
- `pnpm dev` 실행 시 폰트 로드, 토큰 적용 확인
- 브라우저 OS 다크 모드 토글 시 background 즉시 전환
- 색상 대비 측정: axe DevTools / Lighthouse → 본문 4.5:1 이상

**연관 EARS:** REQ-LAYOUT-TOKENS-001~006, REQ-LAYOUT-A11Y-002, REQ-LAYOUT-A11Y-003, REQ-LAYOUT-A11Y-007

---

### M3 — UI 프리미티브 11종 통합 [Priority: High]

**진행 방식:** stash@{0}에 11개 컴포넌트 baseline 존재. `git stash pop` 후 다음 작업:

**산출물 (각 컴포넌트별 동일 검증):**
1. `button.tsx` — `cva` variants (`default`/`secondary`/`outline`/`ghost`/`destructive`) + sizes (`default`/`sm`/`lg`/`icon`)
2. `card.tsx` — `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<CardFooter>` (Radix 미사용 OK)
3. `dialog.tsx` — Radix `@radix-ui/react-dialog` 기반, focus trap + Esc 닫기
4. `input.tsx` — `<input>` 래퍼, `aria-invalid` 지원
5. `label.tsx` — Radix `@radix-ui/react-label`, `htmlFor` association
6. `select.tsx` — Radix `@radix-ui/react-select`, 키보드 네비게이션
7. `dropdown-menu.tsx` — Radix `@radix-ui/react-dropdown-menu`
8. `popover.tsx` — Radix `@radix-ui/react-popover`
9. `avatar.tsx` — Radix `@radix-ui/react-avatar`
10. `badge.tsx` — `cva` variants (상태 9종 + neutral) — Radix 미사용 OK
11. `checkbox.tsx` — Radix `@radix-ui/react-checkbox`

**각 컴포넌트 검증 체크리스트:**
- [ ] 디자인 토큰 utility class만 사용 (hex 0건, px 0건 except `border-1`)
- [ ] `cn()` 유틸로 `className` prop 머지
- [ ] TypeScript prop 타입 추출 (`React.ComponentProps<typeof Primitive.Root>`)
- [ ] `displayName` 설정 (devtools 가독성)
- [ ] Radix 컴포넌트는 `forwardRef` 적용

**연관 EARS:** REQ-LAYOUT-PRIMITIVES-001~007, REQ-LAYOUT-TOKENS-006, REQ-LAYOUT-A11Y-002, REQ-LAYOUT-A11Y-004

---

### M4 — 앱 셸 (AppShell + Sidebar + Topbar) [Priority: High]

**산출물:**
- `src/app/(app)/layout.tsx`:
  - 서버 컴포넌트
  - `// TODO(SPEC-AUTH-001): const { user } = await getUser(); if (!user) redirect("/login");` 주석 placeholder
  - 임시 `userRole`을 prop으로 하드코딩하거나 query param 등으로 검증 가능하게
  - `<AppShell userRole={userRole}>{children}</AppShell>` 렌더
- `src/components/app/app-shell.tsx`:
  - 클라이언트 또는 서버 컴포넌트 (가능하면 서버)
  - 그리드: `grid-cols-[240px_1fr] grid-rows-[56px_1fr]` (lg) / `grid-cols-[64px_1fr]` (md 미만, sidebar collapse)
  - `<Sidebar>` + `<Topbar>` + `<main role="main">{children}</main>` 배치
- `src/components/app/nav-config.ts`:
  - `NAV_BY_ROLE: Record<UserRole, NavItem[]>` 상수 정의
  - 강사 4종, 담당자 5종, 관리자 5종 + admin 헤더 + admin/*
  - `NavItem = { href, label, icon, phase?: 1 | 2 }`
- `src/components/app/sidebar.tsx`:
  - `userRole` prop 받아 `NAV_BY_ROLE[userRole]` 렌더
  - 활성 라우트 매칭 (`usePathname()`) → `aria-current="page"` + active class
  - lucide-react 아이콘 + 한국어 레이블 + (lg 미만) 아이콘 only
  - `<nav aria-label="주 내비게이션">` 랜드마크
- `src/components/app/topbar.tsx`:
  - `<header>` 랜드마크
  - 페이지 타이틀 슬롯 (children 또는 title prop)
  - 우측 영역: ⌘K placeholder(`<Button disabled aria-label="검색 (준비 중)">`), 다크 모드 토글, 알림 placeholder, `<Avatar>` + 역할 배지(`<Badge>`)
  - 다크 모드 토글: `next-themes` 의 `useTheme()` 활용

**검증:**
- `pnpm dev` 실행 후 각 role(쿼리 또는 하드코딩) 변경 시 nav 차이 시각 확인
- DOM 검사: `instructor` 시 `/dashboard` `<a>` 미존재
- Tab 키 순회: 시각 순서대로 sidebar → topbar → main

**연관 EARS:** REQ-LAYOUT-SHELL-001~006, REQ-LAYOUT-NAV-001~006, REQ-LAYOUT-A11Y-001, REQ-LAYOUT-A11Y-004

---

### M5 — 접근성 + 일관성 검증 [Priority: High]

**산출물 (verification artifacts, 코드보단 검증 보고):**
- `pnpm dev` 실행 + 임시 placeholder 페이지 추가 (`(app)/dashboard/page.tsx` 등 5종) — 본 SPEC 인수 검증 전용, 후속 SPEC에서 덮어쓰일 stub
- axe DevTools 스캔 결과: critical 0, serious 0
- Lighthouse Accessibility 점수: ≥ 95 (3 페이지 평균)
- 키보드 only 순회 수동 검증 노트
- 색상 대비 측정 결과 (light + dark)
- Hex/px 하드코딩 grep 결과: 0건 (예외: `border-1px` 등)

**검증 도구:**
- `pnpm exec eslint .` → 0 critical
- `pnpm tsc --noEmit` → 0 error
- `grep -rE "#[0-9a-fA-F]{3,6}" src/components/` → 0 hit (license headers 제외)
- `grep -rE "[0-9]+px" src/components/` → 1px 만 hit

**연관 EARS:** REQ-LAYOUT-A11Y-001~007, REQ-LAYOUT-TOKENS-006

---

### M6 — 다크 모드 + reduce-motion 검증 [Priority: Medium]

**산출물:**
- 다크 모드 토글 버튼 동작 (light → dark → system 3-way)
- localStorage 영속화 검증
- `prefers-color-scheme: dark` system fallback 검증
- `prefers-reduced-motion: reduce` 시 transition 비활성 검증

**연관 EARS:** REQ-LAYOUT-TOKENS-003, REQ-LAYOUT-A11Y-007

---

### M7 — 문서 + 후속 SPEC 핸드오프 [Priority: Medium]

**산출물:**
- `.moai/specs/SPEC-LAYOUT-001/progress.md` — 진행 기록
- `README` 또는 `.moai/docs/`에 디자인 토큰 사용 가이드 (1 page) — 후속 SPEC 작업자가 hex 직접 쓰지 않도록 가이드
- 후속 SPEC들이 import 할 컴포넌트 목록 명시

---

## 3. 위험 (Risks) 및 완화

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|-------|------|------|
| R1 | Tailwind 4 CSS-first config 학습 곡선 (`@theme` 문법, color custom property 자동 변환) | M | M | M2 시작 전 Tailwind 4 공식 docs 참조 + Context7 query, 1차 토큰 정의 후 단일 컴포넌트(`Button`)로 검증 → 통과 후 전체 적용 |
| R2 | shadcn/ui CLI v4 baseline 코드(stash)가 Tailwind 4 토큰 명명과 정확히 일치하지 않을 수 있음 (예: `bg-zinc-900` 직접 사용 vs `bg-secondary`) | H | M | M3 시작 시 11개 컴포넌트 grep으로 hex/zinc 직접 사용 식별 → 토큰 명명으로 일괄 치환 |
| R3 | Pretendard Variable 폰트 라이선스 또는 로딩 실패 (CDN 의존 시) | L | M | npm `pretendard` 패키지 + `next/font/local` 사용 권장 (Open Question 5 권장 옵션). fallback 폰트 (`-apple-system`, `system-ui`) 명시 |
| R4 | `next-themes`와 React 19 RSC 호환성 이슈 | L | M | next-themes 최신 버전 검증, 호환 안 될 시 인라인 스크립트로 fallback. `<ThemeProvider>`는 클라이언트 컴포넌트로 격리 |
| R5 | Role-based nav 테스트 어려움 (실제 인증 없이 검증 필요) | M | L | M4에서 임시 `?role=instructor` 쿼리 파라미터 또는 환경변수로 role override 허용 (개발 전용, M7 시점에 제거 또는 SPEC-AUTH-001로 위임) |
| R6 | 색상 대비 4.5:1 미달 토큰 발견 (특히 dark mode `text-muted` `#A1A1AA` on `surface #18181B`) | M | H | M2에서 토큰 정의 후 즉시 axe로 측정. 미달 시 토큰 값 미세 조정 (예: text-muted dark를 `#B4B4B8`로 약간 밝힘) — 디자인 의도 보존 범위 내 |
| R7 | 11종 프리미티브 + 셸 → file count 폭증 (~20+ 신규 파일), 단일 PR 리뷰 부담 | M | L | 마일스톤 단위 commit 분리 권장: M1, M2, M3(11 컴포넌트), M4(셸), M5-M7. PR도 마일스톤별 분할 또는 단일 SPEC PR 내 logical commit 분리 |
| R8 | `/admin/*` Phase 2 노출 정책 모호 (DOM에 둠 vs 트리 셰이킹) | L | L | Open Question 3 권장 — 환경변수 + 정의 유지. `NEXT_PUBLIC_FEATURE_ADMIN=false` 기본 |

---

## 4. 진행 순서 (Sequencing)

```
M1 (deps + utils + types)
   ↓
M2 (tokens: globals.css + tokens.json + root layout)
   ↓
M3 (11 primitives) ─────┐
                        ├──→ M5 (a11y + 일관성 검증)
M4 (app shell + nav) ───┘            ↓
                                    M6 (dark mode + reduce-motion)
                                     ↓
                                    M7 (docs + handoff)
```

M3와 M4는 병렬 가능 (서로 의존 없음, 단 M3의 `Button`/`Avatar`/`Badge`/`DropdownMenu`는 topbar에서 사용되므로 M4 완료 전에 최소 이 4종은 통과 필요).

---

## 5. 완료 정의 (Definition of Done)

본 SPEC은 다음 모든 조건이 충족될 때 **완료**로 간주한다:

1. ✅ `pnpm build` 0 error / 0 warning (critical)
2. ✅ `pnpm tsc --noEmit` 0 type error
3. ✅ `pnpm exec eslint .` 0 critical
4. ✅ axe DevTools: critical 0 + serious 0 (3 placeholder 페이지 평균)
5. ✅ Lighthouse Accessibility ≥ 95
6. ✅ Hex 직접 사용 0건, px 직접 사용 1px 외 0건 (`src/components/**`, `src/app/**`)
7. ✅ Role-based nav 시각/DOM 검증 통과 (instructor/operator/admin 3종)
8. ✅ 다크 모드 토글 동작 + FOUC 없음 + system fallback 동작
9. ✅ 11종 프리미티브 모두 import + 기본 variant 동작 확인
10. ✅ `acceptance.md`의 Given/When/Then 시나리오 5종 모두 PASS
11. ✅ Open Questions 7개 모두 결정 + 본 plan/spec에 결정 반영

---

_End of SPEC-LAYOUT-001 plan.md_
