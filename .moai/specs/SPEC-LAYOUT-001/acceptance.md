# SPEC-LAYOUT-001 — 인수기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항을 **검증 가능한 Given/When/Then 시나리오**로 구체화한다. `/moai run` 완료 시점에 모든 시나리오가 PASS 해야 본 SPEC이 종료된다.

---

## 시나리오 1: 강사(instructor) 로그인 시 본인 영역 nav만 노출

**연관 EARS:** REQ-LAYOUT-NAV-001, REQ-LAYOUT-NAV-002

**Given (전제):**
- `(app)/layout.tsx`가 `userRole="instructor"`로 `<AppShell>`을 렌더하도록 설정되어 있고
- 임시 페이지 `(app)/me/dashboard/page.tsx`(stub)가 존재한다

**When (실행):**
- 사용자가 브라우저에서 `/me/dashboard` 경로로 진입하고
- DOM 검사기로 `<aside>` (sidebar) 영역을 확인한다

**Then (기대):**
- Sidebar에 정확히 4개의 nav item이 노출된다: `[내 대시보드, 이력서, 일정, 정산]` (각각 `/me/dashboard`, `/me/resume`, `/me/schedule`, `/me/settlement`)
- DOM에 `href="/dashboard"`, `href="/projects"`, `href="/instructors"`, `href="/clients"`, `href="/settlements"`, `href="/admin"` 으로 시작하는 `<a>` 가 0건 존재한다 (`document.querySelectorAll('aside a[href^="/dashboard"]').length === 0` 등)
- `aria-current="page"`가 `/me/dashboard` 항목에만 설정된다

**검증 방법:** 수동 DOM 검사 + 자동화 시 Playwright `expect(page.locator('aside a')).toHaveCount(4)` + `expect(page.locator('aside a[href^="/dashboard"]')).toHaveCount(0)`

---

## 시나리오 2: 디자인 토큰 일관성 (하드코딩 금지)

**연관 EARS:** REQ-LAYOUT-TOKENS-001, REQ-LAYOUT-TOKENS-006

**Given (전제):**
- `/moai run` M3, M4 완료 후 `src/components/ui/**`와 `src/components/app/**` 11+4 = 최소 15개 파일이 존재하고
- `globals.css`에 21+8+12+5+3 = 49개 디자인 토큰이 CSS variable로 정의되어 있다

**When (실행):**
- 다음 명령을 실행한다:
  ```bash
  grep -rE "#[0-9a-fA-F]{3,6}" src/components/ src/app/(app)/ --include="*.tsx" --include="*.ts" --exclude-dir=node_modules
  grep -rE "[0-9]+px" src/components/ src/app/(app)/ --include="*.tsx" --include="*.ts" --exclude-dir=node_modules | grep -v "1px"
  ```

**Then (기대):**
- 첫 번째 grep: 0 hit (hex 색상 직접 사용 없음. license header, 주석은 예외)
- 두 번째 grep: 0 hit (1px 외 px 단위 직접 사용 없음. svg `viewBox` 등 비-CSS 컨텍스트는 예외이지만 본 SPEC 컴포넌트 범위에서 발생 가능성 낮음)
- 모든 색상은 `bg-primary`, `text-text-muted` 같은 Tailwind utility 또는 `var(--color-*)` 형태
- 모든 크기는 `h-12`, `gap-4`, `p-6` 같은 spacing scale utility 사용

**검증 방법:** CI 또는 pre-commit hook에 위 grep 등록. 또는 ESLint `no-restricted-syntax` 룰로 자동화.

---

## 시나리오 3: 키보드 only 순회와 포커스 가시성

**연관 EARS:** REQ-LAYOUT-A11Y-001, REQ-LAYOUT-A11Y-002, REQ-LAYOUT-A11Y-004

**Given (전제):**
- `(app)/dashboard` placeholder 페이지가 로드되어 있고
- 사용자가 `operator` 역할로 접근하여 sidebar 5개, topbar 4개(검색·다크토글·알림·아바타) 인터랙티브 요소가 표시된다
- main 영역에는 placeholder `<button>들어가기</button>` 1개가 있다

**When (실행):**
- 사용자가 마우스 사용 없이 `Tab` 키만으로 페이지 처음부터 순회한다
- 각 단계에서 포커스 위치를 시각적으로 관찰한다

**Then (기대):**
- Tab 순서가 시각적 reading order와 일치한다: sidebar(5) → topbar(4) → main(1) 총 10회 Tab 으로 모든 요소 순회
- 각 단계에서 `:focus-visible` 링이 명확하게 보인다 (2px outline, primary 색상, 인접 배경 대비 3:1 이상)
- `Shift+Tab`으로 역순 순회 동일하게 동작한다
- axe DevTools 자동 스캔 결과: critical 0건, serious 0건
- Lighthouse Accessibility 점수: ≥ 95

**검증 방법:** 수동 키보드 테스트 + axe DevTools 브라우저 확장 + Lighthouse audit. 자동화 시 Playwright `page.keyboard.press('Tab')` 반복 + `page.evaluate(() => document.activeElement)` 추적.

---

## 시나리오 4: 색상 대비 WCAG 2.1 AA 준수 (light + dark)

**연관 EARS:** REQ-LAYOUT-A11Y-003, REQ-LAYOUT-TOKENS-002, REQ-LAYOUT-TOKENS-003

**Given (전제):**
- 토큰이 정의되어 있고 (`--color-text` `#18181B` on `--color-background` `#FAFAFA` light, `--color-text` `#FAFAFA` on `--color-background` `#09090B` dark 등)
- `(app)/dashboard` placeholder에 다음 4종 텍스트 조합이 노출된다: 본문(text on background), 보조 텍스트(text-muted on surface), 캡션(text-subtle on background), primary 버튼 텍스트(primary-foreground on primary)

**When (실행):**
- light 모드에서 axe DevTools "Color Contrast" 룰 실행
- 다크 모드 전환 후 동일 측정 반복
- Lighthouse "Contrast" 항목 확인

**Then (기대):**
- Light 모드:
  - `text` on `background`: ≥ 4.5:1 (실측 ≥ 16.0:1, `#18181B` on `#FAFAFA`)
  - `text-muted` on `surface`: ≥ 4.5:1 (실측 ≥ 5.7:1, `#71717A` on `#FFFFFF`)
  - `text-subtle` on `background`: ≥ 4.5:1 (실측 ≥ 3.6:1 — 본문이 아닌 보조 정보로만 사용 시 큰 텍스트 3:1 기준 적용 가능, **주의 필요**)
  - `primary-foreground` on `primary`: ≥ 4.5:1 (실측 ≥ 8.5:1, white on `#2563EB`)
- Dark 모드:
  - `text` on `background`: ≥ 4.5:1 (실측 ≥ 18.0:1)
  - `text-muted` on `surface`: ≥ 4.5:1 (확인 필요 — `#A1A1AA` on `#18181B` 실측 ~7:1)
- axe DevTools "color-contrast" violation: 0건 (양 모드 모두)

**검증 방법:** axe DevTools 자동 스캔 + 수동 Contrast Checker (https://webaim.org/resources/contrastchecker/). `text-subtle` 4.5:1 미달 시 본문 용도 사용 금지를 lint 또는 코드 리뷰로 강제.

---

## 시나리오 5: 다크 모드 전환 + FOUC 없음

**연관 EARS:** REQ-LAYOUT-TOKENS-003, REQ-LAYOUT-A11Y-007

**Given (전제):**
- 사용자의 OS 설정이 다크 모드로 전환되어 있고 (macOS System Settings > Appearance > Dark)
- `localStorage.theme`은 비어 있다 (또는 "system")

**When (실행):**
- 사용자가 `(app)/dashboard` 페이지를 처음 로드한다
- 페이지 로드 직후의 첫 100ms 동안 시각적 깜빡임을 관찰한다
- 이후 topbar의 다크 모드 토글 버튼을 클릭하여 light → system → dark 순으로 전환한다

**Then (기대):**
- 페이지 로드 즉시 `<html class="dark">` 적용 (인라인 동기 스크립트 또는 `next-themes` SSR 처리)
- background 색상이 `#FAFAFA` → `#09090B`로 즉시 표시되고, 흰 배경 깜빡임(FOUC) 없음
- 토글 클릭 시:
  - dark → light 전환: 200ms 이하 트랜지션 후 background `#FAFAFA`, surface `#FFFFFF`
  - light → system: OS preference 반영 (현재 OS dark이므로 dark 적용)
  - 모든 상태 토큰(state.confirmed `#3B82F6` 등 9종)은 light/dark 양쪽에서 동일 유지
- `localStorage.theme`이 사용자 선택을 영속화한다 ("light"/"dark"/"system")
- `prefers-reduced-motion: reduce`가 활성화되면 트랜지션이 즉시 적용 (no animation)

**검증 방법:** 
- 수동: macOS Appearance 토글 + 페이지 새로고침 + DevTools Network throttling "Slow 3G"로 FOUC 관찰
- 자동: Playwright `page.emulateMedia({ colorScheme: 'dark' })` + `await expect(page.locator('html')).toHaveClass(/dark/)` + 스크린샷 비교

---

## 시나리오 6 (보너스): 11종 프리미티브 키보드 동작

**연관 EARS:** REQ-LAYOUT-PRIMITIVES-004, REQ-LAYOUT-PRIMITIVES-005, REQ-LAYOUT-PRIMITIVES-006

**Given (전제):**
- 임시 검증 페이지 `(app)/__primitives-test/page.tsx`(개발 전용, M7에서 제거 예정)에 11종 프리미티브가 모두 instantiate 되어 있다

**When (실행):**
- 사용자가 다음 키보드 인터랙션을 수행한다:
  1. `Dialog` trigger button에 포커스 → `Enter` → 다이얼로그 열림 → `Escape` → 닫힘 + 트리거에 포커스 복귀
  2. `DropdownMenu` trigger에 포커스 → `Enter` → 메뉴 열림 → `↓` 화살표 → 첫 항목 → `↓` 다음 → `Enter` → 선택 → 메뉴 닫힘
  3. `Select` trigger → `Enter` → 옵션 리스트 → `↓` `↑` 이동 → `Enter` → 선택
  4. `Checkbox`에 포커스 → `Space` → 체크 토글
  5. `Input` `htmlFor` 연결 — `<Label>` 클릭 시 input 포커스

**Then (기대):**
- 모든 인터랙션이 Radix UI 표준대로 정확히 동작
- Dialog 열림 동안 background 페이지의 다른 요소는 Tab으로 도달 불가 (focus trap)
- DropdownMenu가 type-ahead 지원 (예: "ㄱ" 누르면 ㄱ으로 시작하는 항목으로 점프)
- 모든 컴포넌트에서 `aria-expanded`, `aria-controls`, `aria-checked` 등 적절한 ARIA 속성 동적 갱신

**검증 방법:** 수동 키보드 테스트. 자동화 시 Playwright + axe-core integration test.

---

## 인수기준 요약 표

| # | 시나리오 | 연관 EARS | 검증 도구 |
|---|---------|----------|----------|
| 1 | Role-based nav (instructor) | REQ-LAYOUT-NAV-001, NAV-002 | DOM 검사 / Playwright |
| 2 | 디자인 토큰 일관성 | REQ-LAYOUT-TOKENS-001, TOKENS-006 | grep / ESLint |
| 3 | 키보드 순회 + 포커스 | REQ-LAYOUT-A11Y-001, A11Y-002, A11Y-004 | axe / Lighthouse / 수동 |
| 4 | 색상 대비 (light + dark) | REQ-LAYOUT-A11Y-003, TOKENS-002, TOKENS-003 | axe / WebAIM Contrast Checker |
| 5 | 다크 모드 + FOUC | REQ-LAYOUT-TOKENS-003, A11Y-007 | 수동 / Playwright + emulateMedia |
| 6 | 프리미티브 키보드 동작 | REQ-LAYOUT-PRIMITIVES-004, 005, 006 | 수동 / Radix 표준 |

---

## 완료 정의 (Definition of Done)

본 SPEC의 인수 검증은 다음 조건이 모두 충족되어야 PASS로 간주된다:

- [ ] 시나리오 1~5 모두 PASS (시나리오 6는 권장)
- [ ] `plan.md` Section 5의 "완료 정의" 11개 항목 모두 ✅
- [ ] 후속 SPEC(SPEC-AUTH-001 등)이 본 SPEC의 `<AppShell>`, `<Sidebar>`, 11종 UI 프리미티브를 import하여 사용할 수 있는 상태
- [ ] `progress.md` 진행 기록 작성

---

_End of SPEC-LAYOUT-001 acceptance.md_
