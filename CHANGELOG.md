# Changelog

본 프로젝트의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 준수.

## [Unreleased]

### Added (SPEC-MOBILE-001 — 모바일/태블릿 반응형 UX, 320~1024px)
- **M1**: viewport baseline 토큰 9종 (mobile-spacing, touch-target, container-mobile) + utility 추가
- **M2**: AppShell 모바일 분기 + MobileNav (Sheet 기반 off-canvas drawer)
- **M3**: Container 신규 컴포넌트 + Topbar 검색 inline expand + 21개 페이지 적용
- **M4**: KPI / Kanban / Calendar / Table 4종 모바일 분기
- **M5**: Form 모바일 입력 + CardHeader 7곳 + 터치 타겟 ≥44px + Typography 스케일
- **M6**: kanban-board.tsx 등 legacy 정리 + 5 viewport (320/375/768/1024/1440) Playwright matrix smoke

### Changed
- SPEC-LAYOUT-001 토큰 49종 무변경 (확장만 — 9개 모바일 토큰 신규)

### Notes
- DB / API / migrations 변경 0건 (frontend-only)
- 검증: pnpm build PASS / tsc --noEmit PASS / eslint 0 error
- 인수 시나리오 11/13 PASS (2건 Lighthouse 측정 후속)
