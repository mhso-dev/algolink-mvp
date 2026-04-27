# Visual Identity

알고링크(Algolink) 시각 아이덴티티. B2B 교육 컨설팅 SaaS — 데이터 밀도가 높고 매일 장시간 사용하는 워크 도구. 신뢰·차분함·가독성을 우선한다.

---

## Color Palette

primary: "#2563EB"
  # Royal Blue 600. CTA 버튼, 활성 메뉴, 링크, 포커스 링.
  # 한국 B2B SaaS의 안정감 있는 블루. 너무 어둡거나 너무 밝지 않음.

secondary: "#0F172A"
  # Slate 900. 사이드바 배경, 헤더 텍스트.

accent: "#F59E0B"
  # Amber 500. 알림 배지, 미응답/경고 상태. 사용 빈도 낮음.

neutral_scale:
  # Tailwind zinc 기반. 데이터 테이블·구분선에서 부담 없는 회색.
  50:  "#FAFAFA"
  100: "#F4F4F5"
  200: "#E4E4E7"
  300: "#D4D4D8"
  400: "#A1A1AA"
  500: "#71717A"
  600: "#52525B"
  700: "#3F3F46"
  800: "#27272A"
  900: "#18181B"
  950: "#09090B"

background: "#FAFAFA"
  # 페이지 배경. 순백보다 살짝 어두워 장시간 사용 시 눈 피로 감소.

surface: "#FFFFFF"
  # 카드, 모달, 사이드바 패널 배경.

# Semantic state colors (상태 워크플로우에 사용)
state_colors:
  request:    "#94A3B8"  # 의뢰 / 사업제안 — Slate 400
  proposed:   "#60A5FA"  # 강사제안 / 검토 — Blue 400
  confirmed:  "#3B82F6"  # 배정확정 / 진행확정 — Blue 500
  in_progress: "#10B981"  # 교육중 / 진행 중 — Emerald 500
  completed:  "#6B7280"  # 교육종료 — Gray 500
  settled:    "#22C55E"  # 정산완료 — Green 500
  pending:    "#F59E0B"  # 정산대기 / 배정대기 — Amber 500
  alert:      "#EF4444"  # 이슈알림 / 일정충돌 — Red 500
  info:       "#06B6D4"  # 정보 — Cyan 500

## Typography

primary_font: "Pretendard Variable"
  # 한국어 + 영문 + 숫자 모두 균형 잡힌 가독성. B2B SaaS 표준 한국 폰트.
  # Variable이라 단일 woff2로 100~900 weight 모두 지원.

secondary_font: "same"
  # Pretendard 단일 적용. 본문/제목 모두.

mono_font: "JetBrains Mono"
  # 코드, 숫자 정렬 필요한 곳(정산표 금액, 시간), 강사 ID 같은 고정폭.

font_source: "cdn"
  # Pretendard: cdn.jsdelivr.net/gh/orioncactus/pretendard
  # JetBrains Mono: Google Fonts

## Logo

logo_file: "/algolink-logo.svg"
  # 임시 placeholder. 텍스트 로고 "Algolink" + 작은 알고리즘 노드 모티프.
  # 사용자가 실제 로고 자산을 제공하면 교체.

logo_dark_file: "same"
  # 동일 SVG, currentColor 기반으로 라이트/다크 자동 대응.

logo_max_height: "28px"
  # 사이드바 헤더와 로그인 화면에 적용.

## Layout Preferences

hero_layout: "split-left"
  # 로그인/마케팅 페이지: 좌측 브랜딩(다크 패널), 우측 폼.
  # 일반 앱 화면: 사이드바 + 메인.

section_rhythm: "single-bg"
  # 앱 내부는 단일 배경(neutral-50) + 카드(surface) 조합. 줄무늬 배경 지양.

border_radius_style: "rounded"
  # 기본 8px (rounded-lg). 버튼·인풋은 6px (rounded-md), 큰 패널은 12px.

## Dark Mode

dark_mode_support: "system"
  # prefers-color-scheme 자동 감지. 강사들이 야간에 정산 확인하는 경우 다수.
  # Phase 1에서는 라이트 우선 완성, 다크는 자동 적용 + 토큰 기반 자연스럽게 전환.

## Visual Do's and Don'ts

dos:
  - "데이터 밀도 높게: 한 화면에서 8~12개 행, 5컬럼 칸반이 한눈에 들어와야 함"
  - "여백은 일관되게: 4의 배수 spacing scale (4/8/12/16/24/32/48)"
  - "구분선 얇게: 1px neutral-200, 강조 시 neutral-300"
  - "상태는 색 + 텍스트 라벨 동시: 색약 사용자 고려"
  - "표 내부 숫자는 우측 정렬, 모노폰트로 자릿수 정렬"
  - "한국어 행간 1.5~1.6 (영문 기본 1.4보다 넓게)"
  - "포커스 링: 2px primary + 2px offset, 모든 인터랙션 요소"

donts:
  - "그라디언트 배경(블루→퍼플) 남발 — 마케팅 SaaS 클리셰"
  - "흰 카드 위에 흰 카드 (그림자 없이 구분 안 됨)"
  - "둥근 버튼 + 직각 인풋 같은 일관성 없는 radius"
  - "12px 이하 본문 (한글 가독성 저하)"
  - "단일 색상으로 상태 6개 표현 (구분 불가)"
  - "감성 일러스트/스톡 이미지 — 워크 도구에 불필요"
  - "애니메이션 200ms 초과 — 매일 쓰는 도구는 빨라야 함"

## Spacing & Density

base_spacing: "4px"
spacing_scale: "0/1/2/3/4/5/6/8/10/12/16 → 0/4/8/12/16/20/24/32/40/48/64 px"
content_max_width: "1440px (앱), 1200px (테이블), 480px (폼)"
sidebar_width: "240px (확장), 64px (축소)"
table_row_height: "44px (기본), 36px (촘촘)"

## Motion

transition_duration: "150ms"
easing: "cubic-bezier(0.4, 0, 0.2, 1)"  # ease-out
hover_states: "background-color, border-color만 transition"
modal_enter: "200ms fade + 4px translateY"
toast_duration: "4s 자동 닫힘"

## Iconography

icon_library: "lucide-react"
  # 균일한 stroke-width 1.5, 24px base.
  # 단순/기능적 아이콘 우선.

icon_default_size: "16px (인라인), 20px (버튼), 24px (사이드바)"

## Accessibility (WCAG 2.1 AA)

color_contrast_minimum: "4.5:1 (본문), 3:1 (대형 텍스트/UI 컴포넌트)"
focus_indicator: "2px solid primary + 2px offset"
keyboard_nav: "모든 인터랙션 키보드 접근 가능, Tab 순서 시각 순서와 일치"
screen_reader: "한국어 레이블 우선, role/aria-label 명시"
min_touch_target: "44x44px (모바일), 32x32px (데스크톱 고밀도)"

---

_Last updated: 2026-04-27_
_Populated by: /moai design 자동 채움 (Algolink B2B 교육 컨설팅 SaaS 컨텍스트)_
