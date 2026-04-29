# Changelog

본 프로젝트의 주요 변경사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/) 준수.

## [Unreleased]

### Added (SPEC-PROPOSAL-001 — 제안서 도메인 + 사전 강사 문의, Issue #17)

- **M1**: 마이그레이션 6건 — `proposals` 테이블 (status 5종: draft/submitted/won/lost/withdrawn + proposal_status enum), `proposal_required_skills` junction, `proposal_inquiries` 확장 (`proposal_id` / `instructor_id` / `status` 4종: pending/accepted/declined/conditional + inquiry_status enum), `notification_type=inquiry_request` enum 값 추가, Storage 버킷 `proposal-attachments` + RLS, `instructor_inquiry_history` view (90일 시그널). Drizzle schema `proposal.ts` + `index.ts` barrel export. db:verify 32 → 40 (+8 신규 검증) PASS
- **M2**: 도메인 순수 함수 9개 (`src/lib/proposals/`) — `status-machine.ts` (validateProposalTransition, timestampUpdatesForTransition, rejectIfFrozen), `inquiry.ts` (buildInquiryRecords idempotent UNIQUE, buildInquiryNotificationPayload, formatInquiryDispatchLog), `convert.ts` (buildProjectFromProposal, buildAcceptedTop3Entry, buildAcceptedRecommendationFromInquiries), `signal.ts` (selectInstructorPriorAcceptedCount, selectInstructorInquirySignal — instructor_inquiry_history view 90일 쿼리), `list-query.ts`, `queries.ts`, `validation.ts`, `errors.ts`, `types.ts`/`labels.ts`
- **M3~M6**: 라우트 4종 (`/proposals` 리스트 + 필터, `/proposals/new` 등록, `/proposals/[id]` 상세 7섹션, `/proposals/[id]/edit` 수정) + Server Actions 4종 (createProposal, updateProposal + transitionProposalStatus, dispatchInquiries idempotent UNIQUE 위반 catch, convertProposalToProject canonical 6-step READ COMMITTED + 멱등 early-return) + UI 컴포넌트 7종 (ProposalForm / ProposalFiltersBar / ProposalStatusBadge / InquiryDispatchTrigger / InquiryResponseBoard / StatusControls / ConvertToProjectButton)
- **M7**: 통합 테스트 73 신규 unit tests (status-machine 16, validation 14, inquiry 9, convert 12, signal 4, list-query 17) + 24 통합 시나리오 PASS. typecheck 0 errors, pnpm build PASS, pnpm test:unit 743 → 840 (+97 PASS)

### Notes (SPEC-PROPOSAL-001)

- Convert canonical 6-step 멱등: `converted_project_id NOT NULL` early-return + `UPDATE WHERE converted_project_id IS NULL` race guard (REQ-PROPOSAL-CONVERT-003/007)
- SPEC-CONFIRM-001 stub 정식 schema로 보강 — `proposal_inquiries` SPEC §5.1 컬럼 정합 (FK 무결성 보존)
- Frozen 검증: SPEC-PROJECT-001 schema 변경 0건, SPEC-RECOMMEND-001 score.ts 변경 0건, SPEC-DB-001 기존 테이블 schema 변경 0건
- 4-SPEC 시퀀스 (SPEC-PAYOUT-002 → SPEC-RECEIPT-001 → SPEC-CONFIRM-001 → SPEC-PROPOSAL-001) 완료
- Closes Issue #17

### Added (SPEC-CONFIRM-001 — 강사 응답 시스템, Issue #16 / SPEC-PROJECT-AMEND-001, Issue #22)

- **M1**: 마이그레이션 3건 — `instructor_responses` 테이블 신설 (`CHECK XOR` + 두 partial UNIQUE 인덱스: `(project_id, instructor_id) WHERE project_id IS NOT NULL`, `(proposal_inquiry_id, instructor_id) WHERE proposal_inquiry_id IS NOT NULL`), `notification_type` enum 5개 신규 값 추가 (`assignment_accepted`, `assignment_declined`, `inquiry_accepted`, `inquiry_declined`, `inquiry_conditional`), `notifications` 테이블에 `source_kind`/`source_id` 컬럼 + partial UNIQUE 인덱스 (`idx_notifications_idempotency`) 추가 — 알림 idempotency 정확히-1행 보장. db:verify 32/32 PASS
- **M2**: 도메인 모듈 `src/lib/responses/` 신설 — `state-machine.ts` (`validateStatusTransition`, `isWithinChangeWindow`, `CHANGE_WINDOW_HOURS=1`), `side-effects.ts` (순수 부수효과 산출 함수 3종: `computeAssignmentAcceptanceEffects`, `computeInquiryAcceptanceEffects`, `computeAssignmentDowngradeEffects`), `notification-mapping.ts` (6 매핑 케이스 × 2 source_kind × 3 status), `errors.ts` (한국어 에러 상수 12종+)
- **M3/M4**: Server Actions 2종 (`respondToAssignment`, `respondToInquiry`) + UI 라우트 2종 (`/me/assignments`, `/me/inquiries`) — 응답 패널 3-state (accept/decline/conditional) + `conditional_note` + 1시간 카운트다운 타이머 (REQ-CONFIRM-RESPONSE-WINDOW-006) + `response-panel.tsx` UI 컴포넌트
- 56 신규 단위 테스트 + 14 통합 시나리오 PASS. typecheck 0 error, build PASS

### Changed (SPEC-CONFIRM-001 + SPEC-PROJECT-AMEND-001)

- **SPEC-PROJECT-AMEND-001 통합**: `src/lib/projects/status-machine.ts` `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` backward edge 추가 — SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 1시간 윈도 강사 응답 다운그레이드 보상 트랜잭션 정식 경로. `__bypassValidateTransitionForResponseDowngrade` 함수 잔존 0건 (시나리오 B 채택). 신규 단위 테스트 9건 추가 (A/B/C/D 케이스 + 회귀 가드 5종)

### Notes (SPEC-CONFIRM-001 + SPEC-PROJECT-AMEND-001)

- 56 신규 단위 테스트 + 14 통합 시나리오 PASS / typecheck 0 error / pnpm build PASS / db:verify 32/32 PASS
- SPEC-PROJECT-AMEND-001 v0.1.1: grep `__bypassValidateTransitionForResponseDowngrade` src/ tests/ → 0건 검증
- Closes Issue #16 (SPEC-CONFIRM-001), Issue #22 (SPEC-PROJECT-AMEND-001)

### Added (SPEC-RECEIPT-001 — 고객 직접 정산 + 자동 영수증 발급, Issue #15)
- **M1**: 마이그레이션 7건 (`app.current_user_role` helper, `settlement_flow=client_direct` enum 확장, `settlements` 6개 nullable 컬럼, `organization_info` singleton 테이블, `payout-receipts` Storage 버킷, `notification_type=receipt_issued`, `receipt_counters` + `app.next_receipt_number()` 연도별 reset). db:verify 30/30 PASS
- **M2**: 도메인 순수 함수 3종 — `receipt-number.ts` (RPC 래퍼), `organization-info.ts` (DB 우선 → env fallback), `client-direct-validation.ts` (zod refinement)
- **M3**: `src/lib/payouts/receipt-pdf.ts` + `ReceiptDocument.tsx` — `@react-pdf/renderer` + NotoSansKR 절대 경로 등록, A4 portrait 한국어 단일 페이지 영수증 PDF 렌더
- **M4**: 강사 송금 등록 Server Action (`registerInstructorRemittance`) — pending → requested 전환 + `client_payout_amount_krw` UPDATE + 첨부 파일 Storage 업로드 (`payout-evidence` bucket-relative)
- **M5**: 운영자 수취 확인 atomic 8-step Server Action (`confirmRemittanceAndIssueReceipt`) — PII GUC + `decrypt_pii` RPC + `pii_access_log` INSERT + PDF 렌더 + Storage 업로드 + settlements UPDATE + notifications INSERT + best-effort compensating cleanup
- **M6**: UI 와이어링 — 강사 `/me/payouts/[id]` "송금 완료 등록" CTA + 영수증 다운로드 signed URL, 운영자 `/settlements/[id]/confirm-remittance` 패널 + flow indicator
- **M7**: 통합 테스트 71 신규 unit tests + 10 통합 시나리오 PASS. db:verify 6개 신규 검증 포함 30/30 PASS

### Changed (SPEC-RECEIPT-001 cross-SPEC)
- **SPEC-PAYOUT-002 `generate.ts` amendment**: `client_direct` 흐름 정산 행 생성 시 `instructor_remittance_amount_krw` 컬럼을 `business_amount_krw - instructor_fee_krw`(profit_krw)로 populate (cross-SPEC contract, Option A 채택)

### Notes (SPEC-RECEIPT-001)
- 71 신규 단위 테스트 + 10 통합 시나리오 PASS / typecheck 0 error / lint NO REGRESSION / pnpm build PASS / db:verify 30/30 PASS
- 회귀 0건: SPEC-PAYOUT-001 `corporate`/`government` 흐름 16개 상태 전환 테스트 PASS
- 실제 이메일/SMS 발송, 국세청 세금계산서, 영수증 취소/재발급 UI는 후속 SPEC에 위임

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
