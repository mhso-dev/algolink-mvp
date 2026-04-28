# SPEC-E2E-001 — Phase 1 골든패스 E2E 회귀망

## Status

Stage 1 진행 중 (PROJECT-SEARCH 머지 후 Stage 2 추가).

## Goal

Phase 1 SPEC (AUTH/DASHBOARD/INSTRUCTOR/PROJECT/ME) 의 골든 패스를
Playwright 기반 E2E 회귀망으로 묶어, Server Action 결합 회귀를 PR 단위로 즉시 잡는다.

## Requirements (EARS)

- REQ-E2E-001 (Ubiquitous): E2E 스위트는 `pnpm e2e` 단일 명령으로 실행 가능해야 한다.
- REQ-E2E-002 (Event-driven): 사용자가 잘못된 자격증명을 제출하면 통일된 에러 메시지가
  표시되고 URL 이 `/login` 에 머무른다.
  - (a) admin/operator/instructor 3 역할 성공 로그인 시 각자 home 라우트로 이동
  - (b) 미인증 상태로 보호 라우트 접근 시 `/login?next=` 으로 redirect
- REQ-E2E-003 (Ubiquitous): 운영자 대시보드는 4 종 KPI 와 5 컬럼 칸반을 항상 렌더해야 하며,
  KPI 값은 숫자 또는 명시적 데이터-없음 표시(em-dash) 여야 한다.
- REQ-E2E-004 (Event-driven): 신규 강사 등록 후 강사 리스트는 새 행을 노출해야 하고,
  운영자는 프로젝트 상세에서 AI 매칭을 트리거할 수 있어야 한다.
- REQ-E2E-005 (Event-driven, stage 1): 신규 프로젝트 등록 → 제목 검색 → 상세 → 1-클릭
  배정 골든 패스가 회귀 없이 동작해야 한다.
  - stage 2 (PROJECT-SEARCH 머지 후 추가): 고객사명 다중 컬럼 검색 어서션
- REQ-E2E-006 (Ubiquitous): 강사 본인 이력서는 PDF export 가 200 + `application/pdf` 응답을
  주어야 하고, 지급 정보는 평문 PII 가 DOM/HTML 응답에 노출되지 않아야 한다.
- REQ-E2E-007 (Event-driven): 강사가 배정되면 알림 페이지에 새 알림이 노출된다
  (현재 placeholder 단계 — main role + 페이지 접근만 보수적으로 검증).
- REQ-E2E-008 (Ubiquitous): Playwright config 는 production build 기준으로 동작해야 한다
  (dev 서버 hydration race 회피).

## Out of Scope (stage 1)

- 고객사명/스킬 다중 컬럼 검색 어서션 — SPEC-PROJECT-SEARCH-001 머지 후 stage 2 에서 추가.
- 알림 시스템 활성화 후 실제 unread 카운트 기반 어서션 — Phase 2 후속.
