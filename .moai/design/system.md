# Design System

알고링크 디자인 시스템 — 토큰·타이포·컴포넌트·접근성 규약. visual-identity.md의 결정을 코드에서 사용하는 토큰으로 옮겨놓은 단일 진실 소스.

---

## Design Intent

데이터 밀도가 높고 매일 4시간 이상 사용하는 워크 도구. **신뢰감 있는 블루 + 차분한 그레이 스케일 + 명확한 상태 색상**으로 정보를 즉시 인지하게 하고, 한국어 본문이 가장 가독성 좋도록 Pretendard + line-height 1.5 + 14px 본문을 기본으로 한다. 화려함보다 일관성·접근성·키보드 우선.

## Domain Vocabulary

| Term | Definition |
|------|------------|
| **교육 프로젝트** | 의뢰 접수부터 정산 완료까지 한 묶음 — 상태 워크플로우의 단위 |
| **상태(Status)** | 교육 프로젝트의 13단계 워크플로우 (사업제안→사업확정→강의요청→강사섭외→배정검토→배정확정→교육확정→모집중→진행확정→진행중→교육종료→정산진행→과업종료) — 칸반에서는 5단계로 그룹핑 |
| **추천(Recommendation)** | AI 강사 매칭 결과 — Top-3 (기술스택·일정·만족도 가중치) |
| **배정 요청(Request)** | 담당자 → 강사로 보내는 강의 제안. 이메일 + 인앱 알림 |
| **컨펌(Confirm)** | 강사가 배정 요청을 수락하는 액션 |
| **만족도(Rating)** | 교육 종료 후 담당자가 입력하는 0~5 별 + 코멘트 |
| **정산 흐름** | 기업교육: 고객→알고링크→강사 / 정부교육: 고객→강사→알고링크 |
| **인건비 처리** | 강사료에 원천세 3.3% 또는 8.8% 적용 |
| **세금계산서 처리** | 강사가 사업자인 경우 — 부가세 별도/포함 |
| **마스킹** | 주민번호·계좌번호 등 민감정보 디폴트 가림, 권한자가 명시적 펼치기 |

## Craft Principles

- 모든 파괴적 액션(배정 취소·강사 비활성화·정산 보류)은 명시적 확인 다이얼로그 + 결과 미리 안내
- 모든 인터랙션은 키보드 접근 가능, Tab 순서 = 시각 순서
- 폼 인풋은 자동 저장(draft) — 5초 무입력 시 로컬 스토리지 저장, 페이지 떠날 때 경고
- 모든 빈 상태에 다음 액션 CTA
- 모든 에러는 원인 + 다음 행동 + 한국어
- 색상으로만 의미 전달 금지 — 텍스트/아이콘 병기
- 200ms 이상 트랜지션 금지

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `color.primary` | `#2563EB` | CTA 버튼, 활성 메뉴, 링크, 포커스 링 |
| `color.primary-hover` | `#1D4ED8` | 호버 상태 |
| `color.primary-foreground` | `#FFFFFF` | primary 위 텍스트 |
| `color.secondary` | `#0F172A` | 사이드바 배경, 헤더 텍스트 |
| `color.accent` | `#F59E0B` | 알림 배지, 미응답 |
| `color.background` | `#FAFAFA` | 페이지 배경 |
| `color.surface` | `#FFFFFF` | 카드/모달 배경 |
| `color.border` | `#E4E4E7` | 1px 구분선 (zinc-200) |
| `color.border-strong` | `#D4D4D8` | 강조 구분선 (zinc-300) |
| `color.text` | `#18181B` | 본문 (zinc-900) |
| `color.text-muted` | `#71717A` | 보조 텍스트 (zinc-500) |
| `color.text-subtle` | `#A1A1AA` | placeholder (zinc-400) |
| `color.state.request` | `#94A3B8` | 의뢰/사업제안 상태 |
| `color.state.proposed` | `#60A5FA` | 강사제안/검토 |
| `color.state.confirmed` | `#3B82F6` | 배정확정/진행확정 |
| `color.state.in-progress` | `#10B981` | 교육중/진행중 |
| `color.state.completed` | `#6B7280` | 교육종료 |
| `color.state.settled` | `#22C55E` | 정산완료 |
| `color.state.pending` | `#F59E0B` | 정산대기/배정대기 |
| `color.state.alert` | `#EF4444` | 이슈알림/일정충돌 |
| `color.state.info` | `#06B6D4` | 정보 알림 |

### Dark Mode (system preference)

| Token | Light | Dark |
|-------|-------|------|
| `color.background` | `#FAFAFA` | `#09090B` |
| `color.surface` | `#FFFFFF` | `#18181B` |
| `color.border` | `#E4E4E7` | `#27272A` |
| `color.text` | `#18181B` | `#FAFAFA` |
| `color.text-muted` | `#71717A` | `#A1A1AA` |
| state colors | 동일 | 동일 (대비 충분) |

## Typography

primary font: **Pretendard Variable** (한국어 + 영문 + 숫자)
mono font: **JetBrains Mono** (숫자·코드)

| Role | Family | Weight | Size | Line Height |
|------|--------|--------|------|-------------|
| Display | Pretendard | 700 | 32px | 1.2 |
| H1 | Pretendard | 700 | 24px | 1.3 |
| H2 | Pretendard | 600 | 20px | 1.4 |
| H3 | Pretendard | 600 | 16px | 1.5 |
| Body | Pretendard | 400 | 14px | 1.5 |
| Body-strong | Pretendard | 600 | 14px | 1.5 |
| Caption | Pretendard | 400 | 12px | 1.4 |
| Mono | JetBrains Mono | 400 | 13px | 1.4 |

## Spacing / Radius / Shadow

base spacing unit: **4px**
spacing scale: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80` px
border radius: `sm 4px / md 6px (input/button) / lg 8px (card) / xl 12px (panel) / full 9999px`
shadow levels:
  - `shadow-sm`: `0 1px 2px 0 rgba(0,0,0,0.05)` — 카드 호버 전
  - `shadow-md`: `0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)` — 드롭다운/팝오버
  - `shadow-lg`: `0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05)` — 모달

## Iconography

- Library: **lucide-react**
- Default size: 16px (인라인), 20px (버튼 내), 24px (사이드바)
- Stroke width: 1.5
- 색상: `currentColor` (텍스트 색상 따라감)

## Layout Rules

- App shell: 사이드바(240px 확장 / 64px 축소) + Top bar(56px) + Main(flex-1)
- Content max width: 1440px (대시보드/리스트), 1200px (상세), 480px (폼)
- Grid: 12 컬럼, gap 24px (기본), 16px (촘촘)
- Breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536` — MVP는 lg 우선
- Sidebar 모바일: lg 미만에서 Sheet 오버레이로 전환

## Motion

- Default duration: **150ms**
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- Modal enter: 200ms fade + 4px translateY
- Toast: 4s 자동 닫힘, ESC로 즉시 닫기
- Disabled: `prefers-reduced-motion: reduce` 시 모든 transition 제거

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | 명령 팔레트 (검색·점프·새 의뢰) |
| `⌘B` / `Ctrl+B` | 사이드바 접기/펼치기 |
| `Esc` | 모달/패널/드롭다운 닫기 |
| `?` | 단축키 도움말 |
| `g d` | 대시보드로 이동 |
| `g p` | 프로젝트 리스트로 이동 |
| `g i` | 강사 리스트로 이동 (담당자) |
| `g s` | 정산으로 이동 |
| `n` | 새 항목 만들기 (컨텍스트별) |

## Accessibility

- WCAG 2.1 AA 목표
- Color contrast: ≥ 4.5:1 (본문), ≥ 3:1 (UI 컴포넌트)
- Focus indicator: `2px solid color.primary` + `2px offset`
- Keyboard navigation: 모든 인터랙션 요소 Tab 도달 가능, 시각 순서와 일치
- Screen reader: 한국어 `aria-label` 우선, 상태 변화는 `aria-live="polite"`
- Touch targets: 데스크톱 32x32, 모바일 44x44 최소

## Component Catalog (shadcn/ui 기반)

| Component | 용도 | 위치 |
|-----------|------|------|
| Button | primary/secondary/outline/ghost/destructive | 모든 액션 |
| Input | 단일 행 텍스트 | 폼 |
| Textarea | 다중 행 + 마크다운 | 메모 |
| Select | 드롭다운 선택 | 상태/역할/필터 |
| DatePicker | 단일/범위 날짜 | 일정/검색 |
| Card | 정보 묶음 컨테이너 | 칸반 카드, 위젯 |
| Badge | 상태 라벨 | 상태/만족도/카운트 |
| Avatar | 사용자/강사 이미지 | 사이드바, 카드, 테이블 |
| Tabs | 같은 컨텍스트 뷰 전환 | 진행현황/교육중 |
| Table | 데이터 그리드 | 강사/프로젝트/정산 |
| Dialog | 확인/입력 모달 | 강사 등록, 정산 요청 확인 |
| Sheet | 슬라이드 패널 | 카드 상세, 강사 상세 |
| DropdownMenu | 컨텍스트 액션 | 행 우측 케밥 메뉴 |
| Tooltip | 보조 정보 | 아이콘 버튼, 약어 |
| Toast (Sonner) | 비차단 알림 | 저장 성공, 에러 |
| Skeleton | 로딩 상태 | 테이블, 카드 |
| Command (cmdk) | 명령 팔레트 | ⌘K |

---

_Last updated: 2026-04-27_
_Populated by: /moai design 자동 채움 (visual-identity.md 토큰 + shadcn/ui 컴포넌트 매핑)_
