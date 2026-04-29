# SPEC-PROPOSAL-001 Compact

## Identity

- ID: SPEC-PROPOSAL-001
- Version: 0.1.0
- Status: draft
- Created: 2026-04-29 / Updated: 2026-04-29
- Author: 철
- Priority: medium

## Mission (1 sentence)

알고링크 PM이 영업 단계에서 고객사에 제출하는 제안서(`proposals`)와 그에 연관된 후보 강사 사전 가용성 문의(`proposal_inquiries`)를 시스템에 들이고, 수주 시 SPEC-PROJECT-001 `projects` 엔티티로 메타데이터를 그대로 이어가는 변환 흐름을 구축한다.

## EARS Requirements (7 modules)

### REQ-PROPOSAL-ENTITY (제안서 엔티티 + 워크플로우)

- **REQ-PROPOSAL-ENTITY-001 (Ubiquitous)**: 시스템은 `proposals` 테이블(15 컬럼: id, title CHECK 1-200, client_id RESTRICT, operator_id, proposed_period_start/end, proposed_business_amount_krw, proposed_hourly_rate_krw, notes, status, submitted_at, decided_at, converted_project_id, created_at, updated_at, deleted_at)을 정의한다.
- **REQ-PROPOSAL-ENTITY-002 (Ubiquitous)**: `proposal_status` enum은 정확히 5개 값 (`draft`, `submitted`, `won`, `lost`, `withdrawn`)을 가진다.
- **REQ-PROPOSAL-ENTITY-003 (Ubiquitous)**: `proposal_required_skills` junction 테이블 (proposal_id CASCADE, skill_id RESTRICT, PK 복합)을 정의한다.
- **REQ-PROPOSAL-ENTITY-004 (Ubiquitous)**: 허용 전환 그래프 — `draft→submitted/withdrawn`, `submitted→won/lost/withdrawn`, frozen states (won/lost/withdrawn) → no transitions.
- **REQ-PROPOSAL-ENTITY-005 (State-Driven)**: WHILE status IN (won, lost, withdrawn), 시스템은 deleted_at 외 모든 컬럼 수정을 거부하고 `"확정된 제안서는 수정할 수 없습니다."` 한국어 에러를 반환한다.
- **REQ-PROPOSAL-ENTITY-006 (Event-Driven)**: WHEN 등록 폼 제출, status='draft' + operator_id=currentUser.id 단일 트랜잭션으로 INSERT 후 `/proposals/[id]` redirect.
- **REQ-PROPOSAL-ENTITY-007 (Unwanted)**: IF period_end < period_start, THEN 한국어 에러 `"종료일은 시작일 이후여야 합니다."` 반환, INSERT 0건.
- **REQ-PROPOSAL-ENTITY-008 (Optional)**: WHERE 첨부 필요, Storage `proposal-attachments` 버킷 (mime: pdf/png/jpeg, ≤5MB, kind='proposal_attachment').

### REQ-PROPOSAL-LIST (리스트/검색)

- **REQ-PROPOSAL-LIST-001 (Ubiquitous)**: `/proposals` 페이지 operator/admin 전용, 20건/page, RSC 렌더링.
- **REQ-PROPOSAL-LIST-002 (Ubiquitous)**: URL params `status` (multi), `client_id`, `period_from`, `period_to`, `q` (ILIKE on title), `page`.
- **REQ-PROPOSAL-LIST-003 (Ubiquitous)**: 표시 컬럼 — 제목, 고객사, 담당자, 상태, 기간, 사업비, 등록일.
- **REQ-PROPOSAL-LIST-004 (Ubiquitous)**: deleted_at IS NOT NULL 행 0건 노출.
- **REQ-PROPOSAL-LIST-005 (Unwanted)**: IF page 초과, THEN last valid page redirect.

### REQ-PROPOSAL-DETAIL (상세 + 응답 보드)

- **REQ-PROPOSAL-DETAIL-001 (Ubiquitous)**: `/proposals/[id]` 7개 섹션 (요약, 상태 컨트롤, 기술스택, 첨부, 디스패치 패널, 응답 보드, 변환 컨트롤).
- **REQ-PROPOSAL-DETAIL-002 (Ubiquitous)**: getCurrentUser() + deleted_at IS NULL 검증, 미존재 시 notFound().
- **REQ-PROPOSAL-DETAIL-003 (State-Driven)**: WHILE status='draft', "제출"/"취소" 버튼 + edit + dispatch 가능.
- **REQ-PROPOSAL-DETAIL-004 (State-Driven)**: WHILE status='submitted', "수주"/"실주"/"취소" 버튼 + dispatch 가능, "수주" 클릭 시 변환 액션.
- **REQ-PROPOSAL-DETAIL-005 (State-Driven)**: WHILE status IN frozen, 모든 컨트롤 비활성 + frozen 배지 + (won 시) 프로젝트 딥링크.
- **REQ-PROPOSAL-DETAIL-006 (Ubiquitous)**: 응답 보드 4 컬럼 (대기 중/수락/거절/조건부) 그룹.

### REQ-PROPOSAL-INQUIRY (사전 강사 문의 디스패치)

- **REQ-PROPOSAL-INQUIRY-001 (Ubiquitous)**: `proposal_inquiries` 테이블 (12 컬럼: id, proposal_id CASCADE, instructor_id RESTRICT, proposed_time_slot_start/end, question_note, status, conditional_note, responded_at, responded_by_user_id, created_at, updated_at). UNIQUE(proposal_id, instructor_id). 인덱스 (instructor_id, status), (proposal_id, status).
- **REQ-PROPOSAL-INQUIRY-002 (Ubiquitous)**: `inquiry_status` enum 정확히 4개 값 (pending, accepted, declined, conditional).
- **REQ-PROPOSAL-INQUIRY-003 (Event-Driven)**: WHEN dispatchInquiries 호출, 단일 트랜잭션으로 (a) proposal_inquiries N건 INSERT (status=pending), (b) notifications N건 INSERT (type=inquiry_request), (c) console.log N건 (`[notif] inquiry_request → instructor_id=<uuid> proposal_id=<uuid>`).
- **REQ-PROPOSAL-INQUIRY-004 (Unwanted)**: IF 중복 (proposal_id, instructor_id), THEN 전체 롤백 + 한국어 에러 `"이미 사전 문의를 보낸 강사입니다."`.
- **REQ-PROPOSAL-INQUIRY-005 (Unwanted)**: IF status NOT IN (draft, submitted), THEN 한국어 에러 `"확정된 제안서에는 추가 문의를 보낼 수 없습니다."`.
- **REQ-PROPOSAL-INQUIRY-006 (Optional)**: WHERE 추천 후보만 보기 토글, instructor_skills × proposal_required_skills 매칭으로 필터.
- **REQ-PROPOSAL-INQUIRY-007 (Ubiquitous)**: `notification_type` enum에 `inquiry_request` 추가 (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`).
- **REQ-PROPOSAL-INQUIRY-008 (Ubiquitous)**: 강사 응답 처리는 SPEC-CONFIRM-001 책임. 본 SPEC은 `proposal_inquiries.status` pending → accepted/declined/conditional 컬럼 계약만 노출.

### REQ-PROPOSAL-CONVERT (Won → Project 변환)

- **REQ-PROPOSAL-CONVERT-001 (Ubiquitous)**: convertProposalToProject Server Action 단일 트랜잭션 4-step:
  - (a) proposals UPDATE (status='won', decided_at=now(), converted_project_id=<new>)
  - (b) projects INSERT (title, client_id, operator_id, start_date, end_date, business_amount_krw, instructor_fee_krw, status='proposal', instructor_id=NULL, project_type='education')
  - (c) project_required_skills 복사
  - (d) accepted ≥ 1 시 ai_instructor_recommendations INSERT (top3_jsonb 최대 3명 capped, model='manual_from_proposal', adopted_instructor_id=NULL)
- **REQ-PROPOSAL-CONVERT-002 (Unwanted)**: IF status != 'submitted', THEN 한국어 에러.
- **REQ-PROPOSAL-CONVERT-003 (Unwanted)**: IF converted_project_id IS NOT NULL, THEN 한국어 에러 (멱등성).
- **REQ-PROPOSAL-CONVERT-004 (Event-Driven)**: WHEN 변환 성공, /projects/<new_id> redirect + revalidate /proposals + /projects.
- **REQ-PROPOSAL-CONVERT-005 (Ubiquitous)**: SPEC-PROJECT-001 schema 변경 0건. 미매핑 필드 (instructor_id, notes, project_type)는 SPEC-PROJECT-001 default 사용.
- **REQ-PROPOSAL-CONVERT-006 (Ubiquitous)**: convert.ts 도메인 함수 (buildProjectFromProposal, buildAcceptedRecommendationFromInquiries) 순수 함수, 사이드 이펙트 없음.

### REQ-PROPOSAL-SIGNAL (추천 엔진 시그널 read-only)

- **REQ-PROPOSAL-SIGNAL-001 (Ubiquitous)**: `instructor_inquiry_history` view 정의 (instructor_id, prior_accepted_count_90d, prior_declined_count_90d, prior_pending_count, last_responded_at).
- **REQ-PROPOSAL-SIGNAL-002 (Ubiquitous)**: query-time view (not materialized), RLS는 underlying 테이블에 적용.
- **REQ-PROPOSAL-SIGNAL-003 (Unwanted)**: SPEC-RECOMMEND-001 score.ts/engine.ts/kpi.ts 변경 0건. 가중치 FROZEN.
- **REQ-PROPOSAL-SIGNAL-004 (Ubiquitous)**: `selectInstructorPriorAcceptedCount(instructorId, windowDays=90)` 헬퍼 export. runRecommendationAction에서 호출 안 함.

### REQ-PROPOSAL-RLS (역할 가드 + 데이터 격리)

- **REQ-PROPOSAL-RLS-001 (Ubiquitous)**: SPEC-AUTH-001 `requireRole(['operator', 'admin'])` 가드 재사용.
- **REQ-PROPOSAL-RLS-002 (Ubiquitous)**: RLS 정책 5종:
  - proposals_operator_admin_all (FOR ALL, role IN operator/admin)
  - proposal_required_skills_operator_admin_all (FOR ALL)
  - proposal_inquiries_operator_admin_all (FOR ALL)
  - proposal_inquiries_instructor_self_select (FOR SELECT, instructor self)
  - proposal_inquiries_instructor_self_update (FOR UPDATE, instructor self) — sibling SPEC-CONFIRM-001 사용
- **REQ-PROPOSAL-RLS-003 (Ubiquitous)**: SUPABASE_SERVICE_ROLE_KEY 미사용, user-scoped client만.
- **REQ-PROPOSAL-RLS-004 (Ubiquitous)**: Storage `proposal-attachments` 버킷 RLS — operator/admin RW, instructor/anonymous deny.
- **REQ-PROPOSAL-RLS-005 (Unwanted)**: IF instructor가 /proposals/[id] 접근, THEN guard redirect 우선, defense-in-depth로 RLS 0 rows + notFound().

## Acceptance Scenarios (Given/When/Then)

상세는 [`acceptance.md`](./acceptance.md) 참조. 8개 시나리오 + EC-01~EC-15 edge cases.

| ID | Title | Refs |
|----|-------|------|
| 1 | 신규 제안서 초안 등록 | ENTITY-001/006/007 |
| 2 | draft → submitted 전환 | ENTITY-004, DETAIL-003 |
| 3 | 강사 3명 사전 문의 디스패치 | INQUIRY-001/003/007 |
| 4 | Won → Project 변환 (accepted 2명) | CONVERT-001/004/005 |
| 5 | Frozen 상태 (lost/withdrawn/won) 모든 변경 거부 | ENTITY-005, DETAIL-005 |
| 6 | 강사 응답 결과 응답 보드 반영 (sibling 핸드오프) | INQUIRY-008, DETAIL-006 |
| 7 | RLS — instructor /proposals 접근 차단 + 본인 inquiries만 | RLS-001/002/005 |
| 8 | 첨부 파일 업로드 + Storage/files 일관성 | ENTITY-008, RLS-004 |

## Affected Files

### Migrations
- supabase/migrations/20260429000010_proposals.sql (proposal_status enum + proposals + proposal_required_skills + pg_trgm 인덱스)
- supabase/migrations/20260429000020_proposal_inquiries.sql (inquiry_status enum + proposal_inquiries + 인덱스 + unique 제약)
- supabase/migrations/20260429000030_notification_inquiry_request.sql (ALTER TYPE notification_type ADD VALUE inquiry_request)
- supabase/migrations/20260429000040_proposal_attachments_bucket.sql (Storage 버킷 + file_kind enum value + RLS)
- supabase/migrations/20260429000050_proposals_rls.sql (RLS 정책 5종)
- supabase/migrations/20260429000060_instructor_inquiry_history_view.sql (시그널 view)

### Domain (`src/lib/proposals/`)
- status-machine.ts (`@MX:ANCHOR validateProposalTransition`)
- list-query.ts
- queries.ts (`@MX:ANCHOR createProposal`, `listProposals`)
- inquiry.ts (`@MX:ANCHOR dispatchInquiries`, `@MX:WARN` race)
- convert.ts (`@MX:ANCHOR convertProposalToProject`, `@MX:WARN` 트랜잭션)
- signal.ts (selectInstructorPriorAcceptedCount)
- file-upload.ts (`@MX:WARN` Storage+DB 일관성)
- validation.ts (Zod schemas)
- errors.ts (PROPOSAL_ERRORS 한국어 상수)
- types.ts

### Routes (`src/app/(app)/(operator)/proposals/`)
- page.tsx (리스트)
- new/page.tsx + actions.ts (createProposal)
- [id]/page.tsx (상세)
- [id]/edit/page.tsx + actions.ts (updateProposal, transitionProposalStatus)
- [id]/inquiries/dispatch/actions.ts (dispatchInquiries)
- [id]/convert/actions.ts (convertProposalToProject)

### UI (`src/components/proposals/`)
- ProposalFiltersBar.tsx
- ProposalStatusBadge.tsx
- ProposalForm.tsx (create | edit)
- InquiryDispatchModal.tsx
- InquiryResponseBoard.tsx
- ProposalAttachmentUploader.tsx
- ConvertToProjectButton.tsx

### Tests
- src/lib/proposals/__tests__/{status-machine,validation,inquiry,convert,signal,list-query}.test.ts
- src/app/(app)/(operator)/proposals/__tests__/integration.test.ts

### Schema
- src/db/schema/proposals.ts (Drizzle)
- src/db/schema/index.ts (export 추가)

## Exclusions (What NOT to Build)

| 항목 | 사유 |
|------|------|
| AI 제안서 본문 자동 생성 (Claude 등) | 운영자 입력만 받음, 후속 SPEC |
| 전자 서명 (e-signature, DocuSign 등) | 외부 도입, 영구 제외 |
| 실제 이메일/SMS/카카오 알림톡 발송 | 콘솔 로그 + notifications 스텁만 (SPEC-NOTIFY-001 어댑터) |
| 다중 통화 (USD/JPY) | KRW 단일, 영구 제외 |
| 제안서 템플릿화 / 이전 제안서 복제 | 후속 SPEC |
| 강사 응답 처리 화면 (`/me/inquiries` accept/decline/conditional 폼) | sibling SPEC-CONFIRM-001 |
| 사전 문의 응답 시 운영자 알림 | SPEC-CONFIRM-001 또는 SPEC-NOTIFY-RULES-001 |
| 제안서 매출 통계 / 수주율 KPI 대시보드 | SPEC-ADMIN-001 또는 후속 |
| 제안서 hard delete | soft delete만 |
| Won → 취소 reverse 변환 | won frozen, admin DB 작업으로만 복구 |
| 첨부 OCR / AI 파싱 | 후속 SPEC |
| 제안서 다단계 승인 (admin 결재) | operator 단독, 영구 제외 (MVP) |
| `prior_accepted_count` 시그널을 SPEC-RECOMMEND-001 점수에 반영 | 본 SPEC은 view만 제공, 가중치 변경은 별도 SPEC (SPEC-RECOMMEND-002 또는 후속) |
| 다국어 (i18n) | 한국어 단일, 영구 제외 (MVP) |
| 모바일 전용 UX | SPEC-MOBILE-001 가이드만 따름 |
| proposal 단계 강사 일정 자동 충돌 감지 | 후속 SPEC |

## Frozen Boundaries (변경 금지)

- SPEC-PROJECT-001 `projects` 테이블 schema (컬럼/enum/제약) 0건 변경
- SPEC-PROJECT-001 `src/lib/projects/status-machine.ts` 0 line 변경
- SPEC-RECOMMEND-001 `src/lib/recommend/score.ts` 가중치 `{skill: 0.5, availability: 0.3, satisfaction: 0.2}` 0 변동
- SPEC-RECOMMEND-001 `engine.ts` / `kpi.ts` 0 line 변경
- SPEC-DB-001 기존 테이블 schema 0 변경 (enum value 추가는 idempotent)

## Dependencies

- ✅ SPEC-DB-001 (completed) — clients, instructors, users, skill_categories, files, notifications
- ✅ SPEC-CLIENT-001 (completed) — listClients 헬퍼, Storage 패턴
- ✅ SPEC-PROJECT-001 (completed) — projects 변환 타깃, ai_instructor_recommendations 호환
- 📝 SPEC-RECOMMEND-001 (draft) — source 유니언 호환, model 컬럼 free-text
- ✅ SPEC-AUTH-001 (completed) — requireRole, getCurrentUser
- 📝 SPEC-NOTIFY-001 — notifications + 콘솔 로그 스텁 패턴
- 🔀 SPEC-CONFIRM-001 (sibling, 병행) — 강사 응답 측 처리

## Quality Gate

- pnpm typecheck: 0 errors
- pnpm lint: 0 critical
- pnpm test:unit: 라인 커버리지 ≥ 85% (proposals 모듈)
- pnpm test integration: 시나리오 1~8 PASS
- pnpm build: 0 errors
- npx supabase start && pnpm db:verify: 18/18 + 본 SPEC 신규 PASS
- 회귀: SPEC-RECOMMEND-001 score.test.ts PASS (가중치 0 변동), SPEC-PROJECT-001 0 schema 변경, SPEC-DB-001 0 테이블 변경
- 접근성: axe DevTools critical 0건, Lighthouse Accessibility ≥ 95
- 한국어 + Asia/Seoul 일관

---

문서 끝.
