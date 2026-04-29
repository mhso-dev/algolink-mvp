# Changelog

본 프로젝트의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 준수.

## [Unreleased]

### Added (SPEC-PAYOUT-002 — 시간당 사업비 기반 자동 정산 산정, Issue #14)
- **M1**: `lecture_sessions` 신규 테이블 (project_id, instructor_id, date, hours, status enum, original_session_id self-FK, soft delete) + `settlement_sessions` junction + `projects.hourly_rate_krw` / `instructor_share_pct` 컬럼 추가. db:verify 24/24 PASS
- **M2**: 정수 산술 정산 산식 순수 함수 (`src/lib/payouts/calculator.ts`) — `floor((rate × round(pct × 100)) / 10000)` IEEE-754 drift 차단
- **M3**: `src/lib/sessions/` 도메인 모듈 (types, errors, validation, queries, status-machine)
- **M5+M6**: `src/lib/payouts/generate.ts` + `/settlements/generate` 운영자 트리거 배치 정산 UI
- **M4+M6**: 프로젝트 폼 zod 확장 (`hourly_rate_krw`, `instructor_share_pct`) + 예외 처리 Server Actions (cancelSessionAction / rescheduleSessionAction / withdrawInstructorAction)
- **M7**: 통합 시나리오 단위 테스트 11종 (Scenario 1~11 포함 concurrent race 방지 검증)

### Changed (SPEC-PAYOUT-002)
- `projects` status machine에 `instructor_withdrawn` enum 신규 전환 추가 (SPEC-PROJECT-001 exhaustiveness 충족)
- `settlement_sessions(lecture_session_id)` UNIQUE INDEX로 이중 청구 DB 레이어 강제 (REQ-PAYOUT002-LINK-006)

### Notes (SPEC-PAYOUT-002)
- 99 신규 단위 테스트 + 11 통합 시나리오 PASS / pnpm typecheck PASS / eslint 0 error / pnpm build PASS
- `/me/settlements` 강사 정산 조회 페이지 확장은 SPEC §4.7에 따라 SPEC-ME-002로 위임
- SPEC-PAYOUT-001(완료) 변경 없음 — 본 SPEC 정산 INSERT 경로는 기존 4-state 머신 + GENERATED 컬럼 정책 그대로 준수

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
