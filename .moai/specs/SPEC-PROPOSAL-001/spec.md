---
id: SPEC-PROPOSAL-001
version: 0.1.0
status: draft
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: medium
issue_number: null
---

# SPEC-PROPOSAL-001: 제안서 도메인 + 사전 강사 문의 (Proposal Domain + Pre-Contract Instructor Inquiry)

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. Algolink AI Agentic Platform MVP의 영업 상위 단계(`알고링크 → 고객사 제안서 제출`)를 정의하는 신규 도메인. 본 SPEC은 (1) `proposals` 테이블 + 워크플로우(`draft → submitted → won|lost|withdrawn`), (2) `proposal_inquiries` 테이블 + 강사 다중 사전 문의 디스패치 + 인앱 알림 스텁(`notification_type=inquiry_request`), (3) Won 제안서 → 프로젝트 자동 변환(SPEC-PROJECT-001 `projects` row + 메타데이터 복사 + accepted 강사 후보 기록), (4) 제안서 첨부(사업자등록증 X, 제안서 PDF/견적서) Storage 어댑터, (5) operator/admin 가드(`(operator)/proposals/**`)와 RLS 정합성, (6) 향후 SPEC-RECOMMEND-001이 읽을 수 있는 `prior_accepted_count` 시그널(view) 기록까지 7개 EARS 모듈로 다룬다. 강사 응답 측 처리(`/me/inquiries`, 수락·거절·조건부 회신, `proposal_inquiries.status` 갱신)는 sibling SPEC-CONFIRM-001(병행 작성)에서 다루며 본 SPEC의 책임은 디스패치까지로 한정된다. SPEC-PROJECT-001(`status: completed`) `projects` 엔티티 + 13단계 enum + KPI 산출식(`top1_acceptance_rate`)은 변경하지 않으며, SPEC-RECOMMEND-001(`status: draft`) 가중치/스코어링 정책 또한 일체 변경하지 않는다(시그널 컬럼만 제공). SPEC-CLIENT-001(`status: completed`) `clients` 테이블, SPEC-DB-001 `skill_categories`/`instructors` 테이블, SPEC-AUTH-001 `requireRole(['operator', 'admin'])` 가드를 그대로 재사용한다. 명시적 제외: AI 제안서 본문 자동 생성, 전자 서명, 실제 이메일 발송(스텁만), 다중 통화, 제안서 템플릿화.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 영업 상위 단계(pre-contract sales)를 시스템 안에 들이는 신규 도메인을 구축한다. 본 SPEC의 산출물은 (a) `(operator)/proposals` 라우트 그룹의 리스트/신규/상세/수정 4개 페이지 + 2개의 Server Action(`/[id]/inquiries/dispatch`, `/[id]/convert`), (b) `proposals` 테이블에서 사용자 흐름 `draft → submitted → won|lost|withdrawn`을 강제하는 상태 머신과 허용된 전환만을 통과시키는 검증기, (c) 제안서 1건당 N명의 후보 강사에게 일괄 사전 문의를 발송하는 디스패치 흐름과 `proposal_inquiries` 테이블 + `notifications` 테이블 INSERT(콘솔 로그 스텁), (d) `submitted → won` 시점에 SPEC-PROJECT-001 `projects` row + `project_required_skills` junction + `ai_instructor_recommendations` row(accepted 강사 후보 기록)를 단일 트랜잭션으로 생성하는 Won → Project 변환 액션, (e) Storage 버킷 `proposal-attachments`에 PDF/이미지 첨부 + `files` 테이블 메타데이터 기록, (f) operator/admin 외 역할 차단 + 강사가 본인 inquiries만 조회 가능하도록 SPEC-AUTH-001 가드와 SPEC-DB-001 RLS 패턴을 재사용하는 데이터 격리, (g) SPEC-RECOMMEND-001이 미래 시점에 읽을 수 있는 강사별 `prior_accepted_count`(최근 90일 accepted 카운트) 시그널 view, (h) 한국어 UI + Asia/Seoul 시간대 + WCAG 2.1 AA 접근성 + Zod 검증 + 한국어 에러 매핑이다.

본 SPEC은 강사 응답 처리(`/me/inquiries` 화면, 수락·거절·조건부 회신 폼, `proposal_inquiries.status` 갱신 Server Action)를 빌드하지 않는다. 이는 sibling SPEC-CONFIRM-001의 책임이며, 본 SPEC은 응답 결과를 `proposal_inquiries.status` 컬럼으로 수신하는 데이터 계약(contract)만 명시한다.

### 1.2 배경 (Background)

`.moai/project/product.md` §1.1 비즈니스 컨텍스트에는 운영 PM의 핵심 페인포인트가 명시되어 있다 — "강사 물색하는데 일정 확인 + 강의 가능 스택 파악에 시간이 너무 걸림". 그러나 현재 시스템은 `의뢰 → 강사매칭 → 요청 → 컨펌 → 진행` 흐름의 시작점인 "의뢰"가 이미 수주된 상태를 전제로 한다(SPEC-PROJECT-001 `proposal` enum은 표면적 명칭이지만 실제로는 "계약 직전 단계"로 사용 중). 알고링크 PM이 실제로 보내는 영업 한국어 워크플로우는 다음과 같다:

1. 알고링크 → 고객사 제안서 제출 (← **THIS SPEC**: 본 SPEC이 다루는 영역)
2. 강의 수주 성공 시 운영자가 강사 물색. 또는 제안서 제출 단계에서 강사에게 "해당 시간대에 강의가 가능한가"를 미리 물어보는 경우도 있음 (← **THIS SPEC**: 디스패치 + sibling SPEC-CONFIRM-001: 응답)
3. 운영자와 강사가 합의하면 해당 강의를 진행 (← SPEC-PROJECT-001 + SPEC-PAYOUT-002 + SPEC-CONFIRM-001)

본 SPEC이 채우는 갭은 **수주 이전 단계의 제안 추적 + 사전 강사 가용성 검증**이다. 사전 문의가 의미 있는 이유는 (i) 제안서를 제출하기 전에 후보 강사의 일정 가용성과 강의 가능 스택을 미리 확인하면 수주 확률을 높일 수 있고, (ii) 수주 후 강사 물색에 소요되는 시간(현재 30~60분)을 단축할 수 있으며, (iii) 제안서 단계의 응답 데이터가 `prior_accepted_count` 시그널로 누적되어 향후 추천 엔진의 정확도 개선 입력이 된다.

기술 기반은 다음 SPEC들에 이미 마련되어 있어 본 SPEC은 신규 도메인 테이블 2개와 junction 1개, Storage 버킷 1개, notification enum value 1개의 마이그레이션만 추가한다:

- SPEC-DB-001(`status: completed`): `clients`, `instructors`, `users`, `skill_categories`, `files`, `notifications` 테이블 및 RLS 패턴
- SPEC-CLIENT-001(`status: completed`): `clients` 등록/조회 흐름, `client_contacts`, `business-licenses` Storage bucket 패턴(본 SPEC의 `proposal-attachments` bucket 설계 참조)
- SPEC-PROJECT-001(`status: completed`): `projects` 테이블 + 13단계 enum + `project_required_skills` junction + `ai_instructor_recommendations` 테이블 — Won → Project 변환의 타깃
- SPEC-RECOMMEND-001(`status: draft`): `rankTopN` 3-tier 정렬 + 가중치 FROZEN 정책 — 본 SPEC의 시그널 컬럼은 읽기 전용으로만 노출
- SPEC-AUTH-001(`status: completed`): `requireRole(['operator', 'admin'])` 가드, `getCurrentUser()` 헬퍼
- SPEC-NOTIFY-001(`status: draft|in-progress`): `notifications` 테이블 + 콘솔 로그 스텁 패턴

본 SPEC의 시작 상태와 종료 상태는 다음과 같다:

| 단계 | 시작 데이터 | 종료 데이터 |
|------|----------|----------|
| 제안서 등록 | client 1건, operator 본인, skill_categories N건 | `proposals` row 1건 (status=draft) |
| 제안서 제출 | proposals row 1건 (status=draft) | proposals row 1건 (status=submitted, submitted_at=now) |
| 사전 강사 문의 | proposals row + instructor N명 후보 + 시간대 | `proposal_inquiries` rows N건 (status=pending) + `notifications` rows N건 |
| 강사 응답 (sibling SPEC-CONFIRM-001) | proposal_inquiries rows (status=pending) | proposal_inquiries rows (status=accepted|declined|conditional) |
| Won → Project 변환 | proposals row (status=submitted) + accepted 강사 0~N명 | proposals row (status=won, converted_project_id) + projects row 1건 + project_required_skills + ai_instructor_recommendations row(accepted 후보) |
| Lost / Withdrawn | proposals row (status=submitted 또는 draft) | proposals row (status=lost|withdrawn, decided_at) — 이후 frozen |

### 1.3 범위 (Scope)

**In Scope:**

- 라우트 (`src/app/(app)/(operator)/proposals/`):
  - `page.tsx` — 리스트 (status multi-select / client / 기간 / `q` ILIKE)
  - `new/page.tsx` + `new/actions.ts` — 등록 폼 + `createProposal` Server Action
  - `[id]/page.tsx` — 상세 (요약 카드 + 상태 컨트롤 + 사전 문의 디스패치 패널 + 응답 보드 + 첨부 다운로드)
  - `[id]/edit/page.tsx` + `[id]/edit/actions.ts` — 수정 폼 + 낙관적 동시성
  - `[id]/inquiries/dispatch/actions.ts` — `dispatchInquiries` Server Action (instructor multi-select + time-slot + question_note)
  - `[id]/convert/actions.ts` — `convertProposalToProject` Server Action (won → project 변환)
- 도메인 로직 (`src/lib/proposals/`):
  - `status-machine.ts` — `proposal_status` enum + 허용 전환 그래프 + `validateTransition`
  - `list-query.ts` — 리스트 검색·필터 (status / client_id / period / q ILIKE on title)
  - `queries.ts` — CRUD: `createProposal`, `updateProposal`, `getProposal`, `listProposals`, `softDeleteProposal`
  - `inquiry.ts` — 사전 문의 디스패치 도메인 함수 (`buildInquiryRecords`, `dispatchInquiries`)
  - `convert.ts` — Won → Project 변환 도메인 함수 (`buildProjectFromProposal`, `buildAcceptedRecommendation`)
  - `signal.ts` — `prior_accepted_count` 시그널 view 정의 SQL + `selectInstructorPriorAcceptedCount` 헬퍼
  - `file-upload.ts` — Storage 업로드 + `files` row 생성 (`uploadProposalAttachment`)
  - `validation.ts` — Zod schema (제안서 폼 / 디스패치 폼 / 변환 입력)
  - `errors.ts` — 한국어 에러 상수
- UI 컴포넌트 (`src/components/proposals/`):
  - `ProposalFiltersBar.tsx` — 검색·필터 컨트롤
  - `ProposalStatusBadge.tsx` — 상태 라벨 + 색상
  - `ProposalForm.tsx` — react-hook-form 기반 등록/수정 공용 폼 (mode prop)
  - `InquiryDispatchModal.tsx` — instructor multi-select + 시간대 입력 + question_note + 미리보기
  - `InquiryResponseBoard.tsx` — `proposal_inquiries` 응답 현황(pending/accepted/declined/conditional) 보드
  - `ProposalAttachmentUploader.tsx` — 첨부 업로드 (Storage 버킷 `proposal-attachments`)
  - `ConvertToProjectButton.tsx` — won → project 변환 트리거 + 확인 다이얼로그
- 마이그레이션 (`supabase/migrations/`):
  - `20260429xxxxxx_proposals.sql` — `proposals` 테이블 + `proposal_status` enum
  - `20260429xxxxxx_proposal_inquiries.sql` — `proposal_inquiries` 테이블 + `inquiry_status` enum + 인덱스
  - `20260429xxxxxx_proposal_required_skills.sql` — junction 테이블
  - `20260429xxxxxx_proposal_attachments_bucket.sql` — Storage 버킷 + RLS
  - `20260429xxxxxx_notification_inquiry_request.sql` — `notification_type` enum에 `inquiry_request` 값 추가
  - `20260429xxxxxx_instructor_inquiry_history_view.sql` — `prior_accepted_count` 시그널 view
- 단위 테스트 (`src/lib/proposals/__tests__/*.test.ts`) — `status-machine` / `validation` / `inquiry` / `convert` / `signal` 5종 (`tsx --test`)
- 통합 테스트 (`src/app/(app)/(operator)/proposals/__tests__/integration.test.ts`) — 등록 → 제출 → 디스패치 → 응답 시뮬레이션 → 변환 시나리오

**Out of Scope (Exclusions — What NOT to Build):** §3 참조

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 단위 테스트: `src/lib/proposals/__tests__/` 모든 케이스 PASS, 라인 커버리지 ≥ 85%
- ✅ 통합 테스트: 등록 → 제출 → 디스패치(N=3) → 1건 accepted 시뮬레이션 → 변환 시나리오 PASS
- ✅ 상태 전환 검증: `lost` 또는 `won` 또는 `withdrawn` 상태에서 어떠한 수정 시도도 거부, 한국어 에러 반환
- ✅ 디스패치 결과: instructor 3명 선택 시 `proposal_inquiries` rows 3건 (status=pending) + `notifications` rows 3건 (type=inquiry_request) + 콘솔 로그 3건 (`[notif] inquiry_request → instructor_id=<uuid> proposal_id=<uuid>`)
- ✅ 디스패치 멱등성: 동일 (proposal_id, instructor_id) 쌍은 unique 제약으로 거부, 한국어 에러 `"이미 사전 문의를 보낸 강사입니다."` 반환
- ✅ 변환 결과: `submitted → won` 액션 호출 시 (i) `proposals.status = 'won'`, `decided_at = now()`, `converted_project_id = <new project id>` 갱신, (ii) `projects` 신규 row 1건 (title/client_id/operator_id/start_date/end_date/business_amount_krw/instructor_fee_krw 복사, status='proposal'), (iii) `project_required_skills` junction 복사, (iv) accepted 강사가 N명 있으면 `ai_instructor_recommendations` row 1건 (top3_jsonb에 accepted 강사 ID 포함, model='manual_from_proposal')
- ✅ 변환 멱등성: 이미 `converted_project_id`가 set 된 제안서에 대한 재변환 시도 거부, 한국어 에러 반환
- ✅ Frozen 보장: SPEC-PROJECT-001 schema(컬럼/enum/제약) 변경 0건, SPEC-RECOMMEND-001 가중치 변경 0건
- ✅ RLS: instructor 토큰으로 `/proposals` 접근 시 silent redirect (`requireRole`), instructor가 직접 SELECT 시 0 rows
- ✅ 시그널 view 동작: `instructor_inquiry_history` view에서 instructor_id별 `prior_accepted_count` (최근 90일) 산출 가능, SPEC-RECOMMEND-001은 본 SPEC 적용 후에도 점수 산출 결과 동일 (시그널은 읽지 않음)
- ✅ 첨부 업로드: PDF/PNG/JPG 5MB 이하만 허용, 그 외 mime/size는 한국어 에러 반환, `proposal-attachments/{proposal_id}/{uuid}.{ext}` 경로 충돌 방지
- ✅ 한국어 UI + Asia/Seoul 시간대 + WCAG 2.1 AA 접근성

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `ENTITY`, `LIST`, `DETAIL`, `INQUIRY`, `CONVERT`, `SIGNAL`, `RLS`.

### 2.1 REQ-PROPOSAL-ENTITY — 제안서 엔티티 + 상태 워크플로우

**REQ-PROPOSAL-ENTITY-001 (Ubiquitous)**
The system **shall** define a `proposals` table with columns: `id uuid PK`, `title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200)`, `client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT`, `operator_id uuid NOT NULL REFERENCES users(id)`, `proposed_period_start date`, `proposed_period_end date`, `proposed_business_amount_krw bigint`, `proposed_hourly_rate_krw bigint`, `notes text`, `status proposal_status NOT NULL DEFAULT 'draft'`, `submitted_at timestamptz`, `decided_at timestamptz`, `converted_project_id uuid REFERENCES projects(id)`, `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`, `deleted_at timestamptz`.

**REQ-PROPOSAL-ENTITY-002 (Ubiquitous)**
The system **shall** define a `proposal_status` enum with exactly 5 values: `draft`, `submitted`, `won`, `lost`, `withdrawn` — and **shall not** introduce additional values without a follow-up SPEC.

**REQ-PROPOSAL-ENTITY-003 (Ubiquitous)**
The system **shall** define a `proposal_required_skills (proposal_id uuid, skill_id uuid, PRIMARY KEY (proposal_id, skill_id))` junction table referencing `proposals(id) ON DELETE CASCADE` and `skill_categories(id) ON DELETE RESTRICT`, mirroring the SPEC-PROJECT-001 `project_required_skills` pattern.

**REQ-PROPOSAL-ENTITY-004 (Ubiquitous)**
The system **shall** define an allowed-transition graph in `src/lib/proposals/status-machine.ts`:
- `draft → submitted` (operator-driven, sets `submitted_at = now()`)
- `draft → withdrawn` (operator-driven, sets `decided_at = now()`)
- `submitted → won` (operator-driven, sets `decided_at = now()`; conversion action separately sets `converted_project_id`)
- `submitted → lost` (operator-driven, sets `decided_at = now()`)
- `submitted → withdrawn` (operator-driven, sets `decided_at = now()`)
- All transitions outside this graph **shall** be rejected by `validateProposalTransition(from, to): { ok: true } | { ok: false; reason: string }`.

**REQ-PROPOSAL-ENTITY-005 (State-Driven)**
**While** `proposals.status IN ('won', 'lost', 'withdrawn')`, the system **shall** treat the row as frozen and **shall** reject any update that modifies fields other than `deleted_at`, returning the Korean error `"확정된 제안서는 수정할 수 없습니다."`.

**REQ-PROPOSAL-ENTITY-006 (Event-Driven)**
**When** an operator submits the create form with valid data, the system **shall** insert a `proposals` row with `status = 'draft'`, `operator_id = currentUser.id`, persist `proposal_required_skills` rows in the same transaction, and redirect to `/proposals/[id]` of the newly created proposal.

**REQ-PROPOSAL-ENTITY-007 (Unwanted Behavior)**
**If** the form submits `proposed_period_end < proposed_period_start`, **then** the system **shall** reject submission with the Korean error `"종료일은 시작일 이후여야 합니다."` and **shall not** persist any row.

**REQ-PROPOSAL-ENTITY-008 (Optional Feature)**
**Where** the operator wants to attach proposal PDFs or quotation files (제안서, 견적서), the system **shall** allow uploads via Storage bucket `proposal-attachments` with mime in `{application/pdf, image/png, image/jpeg}` and size ≤ 5MB; uploaded file metadata **shall** be persisted to the existing `files` table with `kind = 'proposal_attachment'` (introduce the enum value via migration if absent).

### 2.2 REQ-PROPOSAL-LIST — 리스트 / 검색 / 필터

**REQ-PROPOSAL-LIST-001 (Ubiquitous)**
The system **shall** provide a list page at `/proposals` (under route group `(operator)`) accessible only to roles `operator` and `admin`, rendering server-side via React Server Components, paginated at 20 items per page.

**REQ-PROPOSAL-LIST-002 (Ubiquitous)**
The system **shall** support filters via URL query parameters: `status` (multi-select among `draft|submitted|won|lost|withdrawn`), `client_id` (single select), `period_from` / `period_to` (ISO 8601 date matching `proposed_period_start`), `q` (case-insensitive `ILIKE '%<q>%'` on `title`), and `page` (1-based).

**REQ-PROPOSAL-LIST-003 (Ubiquitous)**
The system **shall** display each row with: 제목 (`title`), 고객사 (`clients.company_name`), 담당자 (`users.display_name` for `operator_id`), 상태 (한국어 라벨 with badge color), 기간 (`proposed_period_start ~ proposed_period_end`), 사업비 (`proposed_business_amount_krw`), 등록일 (`created_at`).

**REQ-PROPOSAL-LIST-004 (Ubiquitous)**
The system **shall** exclude `deleted_at IS NOT NULL` rows from the default list, search, and detail views.

**REQ-PROPOSAL-LIST-005 (Unwanted Behavior)**
**If** the requested `page` exceeds total pages, **then** the system **shall** redirect to the last valid page rather than rendering an empty list.

### 2.3 REQ-PROPOSAL-DETAIL — 상세 페이지 + 응답 보드

**REQ-PROPOSAL-DETAIL-001 (Ubiquitous)**
The system **shall** provide a detail page at `/proposals/[id]` rendering server-side, with sections: (a) 요약 헤더 (제목·고객사·담당자·상태·기간·금액), (b) 상태 컨트롤 (현재 상태에 따라 허용된 전환 버튼만 표시), (c) 기술스택 태그 리스트, (d) 첨부 파일 다운로드 링크, (e) 사전 강사 문의 디스패치 패널 (CTA `"강사 사전 문의"`), (f) 응답 보드 (`proposal_inquiries` 행을 상태별로 그룹), (g) Won → Project 변환 컨트롤 (status=submitted일 때만 노출).

**REQ-PROPOSAL-DETAIL-002 (Ubiquitous)**
The system **shall** call `getCurrentUser()` (SPEC-AUTH-001) and verify the proposal is not soft-deleted (`deleted_at IS NULL`); when soft-deleted or not found, return Next.js `notFound()`.

**REQ-PROPOSAL-DETAIL-003 (State-Driven)**
**While** `proposals.status = 'draft'`, the system **shall** display the "제출" button + "취소(withdrawn)" button + edit access; the inquiry dispatch panel **shall** be available so operators can pre-validate instructor availability before submitting.

**REQ-PROPOSAL-DETAIL-004 (State-Driven)**
**While** `proposals.status = 'submitted'`, the system **shall** display the "수주(won)" / "실주(lost)" / "취소(withdrawn)" buttons; "수주" **shall** trigger the convert-to-project Server Action.

**REQ-PROPOSAL-DETAIL-005 (State-Driven)**
**While** `proposals.status IN ('won', 'lost', 'withdrawn')`, the system **shall** disable all edit and dispatch controls and display a frozen-state badge; additionally, **while** `status = 'won' AND converted_project_id IS NOT NULL`, the system **shall** display a deep link to `/projects/<converted_project_id>`.

**REQ-PROPOSAL-DETAIL-006 (Ubiquitous)**
The response board **shall** group `proposal_inquiries` rows for this proposal by `status` into 4 columns: `대기 중 (pending)`, `수락 (accepted)`, `거절 (declined)`, `조건부 (conditional)`, displaying instructor name, response timestamp (Asia/Seoul), and `conditional_note` excerpt where applicable.

### 2.4 REQ-PROPOSAL-INQUIRY — 사전 강사 문의 디스패치

**REQ-PROPOSAL-INQUIRY-001 (Ubiquitous)**
The system **shall** define a `proposal_inquiries` table with columns: `id uuid PK`, `proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE`, `instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT`, `proposed_time_slot_start timestamptz`, `proposed_time_slot_end timestamptz`, `question_note text`, `status inquiry_status NOT NULL DEFAULT 'pending'`, `conditional_note text`, `responded_at timestamptz`, `responded_by_user_id uuid REFERENCES users(id)`, `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`, with indexes on `(instructor_id, status)` and `(proposal_id, status)`, and a unique constraint on `(proposal_id, instructor_id)` to enforce one inquiry per pair.

**REQ-PROPOSAL-INQUIRY-002 (Ubiquitous)**
The system **shall** define an `inquiry_status` enum with exactly 4 values: `pending`, `accepted`, `declined`, `conditional` — mirroring the SPEC-CONFIRM-001 contract on the response side.

**REQ-PROPOSAL-INQUIRY-003 (Event-Driven)**
**When** an operator clicks `"강사 사전 문의"` on the detail page and submits the modal with N selected `instructorIds` + optional time-slot + `question_note`, the system **shall** invoke the Server Action `dispatchInquiries({ proposalId, instructorIds, timeSlotStart, timeSlotEnd, questionNote })`; the action **shall** in a single transaction (a) INSERT N rows into `proposal_inquiries` (status=pending), (b) INSERT N rows into `notifications` (type=`inquiry_request`, recipient_id = each instructor's user_id, body referencing the proposal title and time-slot), (c) emit one `console.log("[notif] inquiry_request → instructor_id=<uuid> proposal_id=<uuid>")` line per row.

**REQ-PROPOSAL-INQUIRY-004 (Unwanted Behavior)**
**If** any of the chosen `instructorIds` already has a `proposal_inquiries` row for this proposal, **then** the dispatch action **shall** abort the entire transaction (no partial inserts) and return the Korean error `"이미 사전 문의를 보낸 강사입니다."` listing the duplicate instructor IDs.

**REQ-PROPOSAL-INQUIRY-005 (Unwanted Behavior)**
**If** the `proposals.status` is not in `{draft, submitted}` at dispatch time, **then** the action **shall** reject with the Korean error `"확정된 제안서에는 추가 문의를 보낼 수 없습니다."`.

**REQ-PROPOSAL-INQUIRY-006 (Optional Feature)**
**Where** the operator wants candidates pre-filtered, the dispatch modal **shall** offer an optional toggle "추천 후보만 보기" that filters the instructor selector by `proposal_required_skills` overlap with `instructor_skills`; this is a UX convenience and **shall not** restrict which instructors can ultimately be selected.

**REQ-PROPOSAL-INQUIRY-007 (Ubiquitous)**
The system **shall** introduce the value `inquiry_request` into the existing `notification_type` enum via the migration `20260429xxxxxx_notification_inquiry_request.sql` using `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_request';`, and **shall not** modify other enum values.

**REQ-PROPOSAL-INQUIRY-008 (Ubiquitous)**
The response side (instructor receives notification → opens `/me/inquiries` → posts accept/decline/conditional) **shall** be implemented by SPEC-CONFIRM-001 (sibling SPEC); the contract this SPEC exposes is **only** the `proposal_inquiries.status` column transitions `pending → accepted | declined | conditional` and the timestamp columns `responded_at`, `responded_by_user_id`. The system **shall not** restrict which user_id may transition `pending → *` at the DB level beyond RLS — SPEC-CONFIRM-001 enforces "only the inquired instructor can respond" via Server Action validation.

### 2.5 REQ-PROPOSAL-CONVERT — Won → Project 변환

**REQ-PROPOSAL-CONVERT-001 (Ubiquitous)**
The system **shall** provide a Server Action `convertProposalToProject({ proposalId })` at `src/app/(app)/(operator)/proposals/[id]/convert/actions.ts` that, in a single PostgreSQL transaction, (a) updates `proposals.status = 'won'`, `decided_at = now()`, `converted_project_id = <new project id>`, (b) inserts a new row into `projects` with `title = proposal.title`, `client_id = proposal.client_id`, `operator_id = proposal.operator_id`, `start_date = proposal.proposed_period_start`, `end_date = proposal.proposed_period_end`, `business_amount_krw = proposal.proposed_business_amount_krw`, `instructor_fee_krw` derived from `proposal.proposed_hourly_rate_krw × estimated_hours` (or 0 when unset; documented in §5), `status = 'proposal'`, `instructor_id = NULL`, (c) copies `proposal_required_skills` rows into `project_required_skills` for the new project, (d) when ≥ 1 `proposal_inquiries` rows for this proposal have `status = 'accepted'`, inserts a single row into `ai_instructor_recommendations` for the new project with `top3_jsonb` listing the accepted instructors (capped at 3) and `model = 'manual_from_proposal'`, leaving `adopted_instructor_id = NULL`.

**REQ-PROPOSAL-CONVERT-002 (Unwanted Behavior)**
**If** `proposals.status` is not `'submitted'` at conversion time, **then** the action **shall** reject with the Korean error `"제출 상태의 제안서만 수주 처리할 수 있습니다."`.

**REQ-PROPOSAL-CONVERT-003 (Unwanted Behavior)**
**If** `proposals.converted_project_id IS NOT NULL`, **then** the action **shall** reject with the Korean error `"이미 프로젝트로 변환된 제안서입니다."` and **shall not** create a duplicate `projects` row.

**REQ-PROPOSAL-CONVERT-004 (Event-Driven)**
**When** the conversion succeeds, the system **shall** redirect the operator to `/projects/<new_project_id>` (the SPEC-PROJECT-001 detail page) and **shall** revalidate both `/proposals` and `/projects` paths.

**REQ-PROPOSAL-CONVERT-005 (Ubiquitous)**
The system **shall** preserve SPEC-PROJECT-001's `projects` schema unchanged (no new columns, no enum value changes); when SPEC-PROJECT-001 fields not derivable from the proposal (e.g., `instructor_id`, `notes`, `project_type`) lack a source, the conversion **shall** insert defaults (`NULL` or the SPEC-PROJECT-001 default; for `project_type` use `'education'` per SPEC-PROJECT-001 default).

**REQ-PROPOSAL-CONVERT-006 (Ubiquitous)**
The conversion logic **shall** be implemented as pure functions in `src/lib/proposals/convert.ts` (`buildProjectFromProposal`, `buildAcceptedRecommendationFromInquiries`) independent of Drizzle/Supabase; side effects (transaction, INSERTs) live in the Server Action.

### 2.6 REQ-PROPOSAL-SIGNAL — 추천 엔진 입력 시그널 (read-only)

**REQ-PROPOSAL-SIGNAL-001 (Ubiquitous)**
The system **shall** define a database view `instructor_inquiry_history` exposing per-instructor signal columns:
- `instructor_id uuid`
- `prior_accepted_count_90d bigint` (count of `proposal_inquiries` rows with `status = 'accepted'` AND `responded_at > now() - interval '90 days'`)
- `prior_declined_count_90d bigint` (same, `status = 'declined'`)
- `prior_pending_count bigint` (current `status = 'pending'`)
- `last_responded_at timestamptz` (max `responded_at` across all statuses)

**REQ-PROPOSAL-SIGNAL-002 (Ubiquitous)**
The view **shall** be a SQL `CREATE OR REPLACE VIEW` (not a materialized view); all aggregations are computed at query time. RLS **shall** apply to the underlying `proposal_inquiries` table — the view does not bypass RLS.

**REQ-PROPOSAL-SIGNAL-003 (Unwanted Behavior)**
The system **shall not** modify SPEC-RECOMMEND-001's scoring function `score.ts:rankTopN` or its weights `{skill: 0.5, availability: 0.3, satisfaction: 0.2}`; the view is read-only signal infrastructure for a future SPEC. Whether and how SPEC-RECOMMEND-001 (or its successor) ever consumes this signal is **out of scope** for this SPEC.

**REQ-PROPOSAL-SIGNAL-004 (Ubiquitous)**
The system **shall** export a TypeScript helper `selectInstructorPriorAcceptedCount(instructorId, windowDays = 90): Promise<number>` in `src/lib/proposals/signal.ts` that operators may use for ad-hoc analytics; the helper **shall** read the view and **shall not** be invoked from `runRecommendationAction` in this SPEC.

### 2.7 REQ-PROPOSAL-RLS — 역할 가드 + 데이터 격리

**REQ-PROPOSAL-RLS-001 (Ubiquitous)**
The system **shall** rely on SPEC-AUTH-001's `(operator)/layout.tsx` guard (`requireRole(['operator', 'admin'])`) for the primary access control to `/proposals/*`; instructors reaching this URL **shall** be silent-redirected to their role home.

**REQ-PROPOSAL-RLS-002 (Ubiquitous)**
The system **shall** define RLS policies on `proposals`, `proposal_required_skills`, and `proposal_inquiries`:
- `proposals_operator_admin_all`: `FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('operator', 'admin'))` with matching WITH CHECK.
- `proposal_required_skills_operator_admin_all`: same pattern.
- `proposal_inquiries_operator_admin_all`: same pattern (operator/admin full access).
- `proposal_inquiries_instructor_self_select`: `FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'instructor' AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid()))` — instructor can SELECT only own inquiry rows (so SPEC-CONFIRM-001's `/me/inquiries` can read them).
- `proposal_inquiries_instructor_self_update`: `FOR UPDATE` with same USING/WITH CHECK predicate, allowing instructor to transition `status` on own rows only (SPEC-CONFIRM-001 will enforce additional Server Action checks on the value transitions).

**REQ-PROPOSAL-RLS-003 (Ubiquitous)**
The system **shall not** introduce a service-role (`SUPABASE_SERVICE_ROLE_KEY`) Supabase client in this SPEC; all DB operations **shall** use the user-scoped server client to keep RLS as the authoritative authorization layer.

**REQ-PROPOSAL-RLS-004 (Ubiquitous)**
The system **shall** define Storage RLS for the `proposal-attachments` bucket: operator/admin SELECT/INSERT/UPDATE/DELETE on path prefix `proposal-attachments/*`; instructor and unauthenticated requests denied. Bucket creation and policies **shall** ship as a single migration `20260429xxxxxx_proposal_attachments_bucket.sql`.

**REQ-PROPOSAL-RLS-005 (Unwanted Behavior)**
**If** an instructor (somehow) reaches `/proposals/[id]`, **then** the route group guard **shall** redirect first; defense-in-depth, RLS **shall** return zero rows from `proposals` SELECT and the page **shall** call `notFound()`.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임하거나 영구 제외한다.

| 항목 | 사유 | 위임 대상 |
|------|------|----------|
| **AI 제안서 본문 자동 생성 (Claude Sonnet 등)** | 운영자가 작성한 텍스트만 입력받음. 향후 별도 SPEC. | (검토 후 결정) |
| **전자 서명 / e-signature 통합 (DocuSign 등)** | 제안서는 PDF 첨부 정도만 지원. 서명 인프라는 외부 도입 사안. | 영구 제외 또는 외부 서비스 연동 별도 SPEC |
| **실제 이메일 발송 / SMS / 카카오 알림톡** | 본 SPEC은 `notifications` INSERT + `console.log` 스텁. 실제 어댑터는 SPEC-NOTIFY-001 후속. | SPEC-NOTIFY-001 (어댑터 단계) |
| **다중 통화 (USD / JPY 등)** | KRW 단일 (`product.md` §3.3 가정과 일관). | 영구 제외 (MVP 범위) |
| **제안서 템플릿화 / 이전 제안서 복제** | 매번 새로 작성. 템플릿화는 후속 SPEC. | (검토 후 결정) |
| **강사 응답 처리 (`/me/inquiries` 화면 + accept/decline/conditional Server Action)** | sibling SPEC에서 다룸. 본 SPEC은 디스패치 + 보드 표시까지. | SPEC-CONFIRM-001 |
| **사전 문의 응답 자동 알림 (강사가 응답하면 운영자에게 인앱 알림)** | sibling SPEC에서 응답 시점에 별도 notification INSERT. | SPEC-CONFIRM-001 또는 SPEC-NOTIFY-RULES-001 |
| **제안서 매출 통계 / 수주율 KPI 대시보드** | 단순 status 카운트 외 별도 분석 화면 없음. | SPEC-ADMIN-001 또는 후속 |
| **제안서 hard delete UI** | soft delete만 제공 (`deleted_at`). | 영구 제외 |
| **제안서 ↔ 프로젝트 reverse 변환 (won 취소 후 status 복구)** | won은 frozen. 운영 사고 복구는 admin DB 작업 + audit 로그. | (검토 후 결정) |
| **제안서별 첨부 파일 OCR / AI 파싱** | 텍스트 추출 후속 SPEC. | (검토 후 결정) |
| **제안서 워크플로우의 다단계 승인 (admin 결재)** | operator 단독 워크플로우. admin은 force only. | 영구 제외 (MVP) |
| **`prior_accepted_count` 시그널을 SPEC-RECOMMEND-001 점수에 반영** | 본 SPEC은 view만 제공. 가중치 변경은 SPEC-RECOMMEND-001 FROZEN 위반. | 미래 SPEC (SPEC-RECOMMEND-002 또는 후속) |
| **다국어 (i18n)** | 한국어 단일 (`product.md` §3.3). | 영구 제외 (MVP) |
| **모바일 전용 UX** | 데스크톱 우선. 반응형은 SPEC-MOBILE-001 가이드. | SPEC-MOBILE-001 가이드만 따름 |
| **proposal 단계의 강사 일정 자동 충돌 감지 트리거** | 운영자가 수동으로 instructor 선택 시 일정 표시는 후속. | (검토 후 결정) |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 라우트 (operator route group)

- `src/app/(app)/(operator)/proposals/page.tsx` — 리스트
- `src/app/(app)/(operator)/proposals/new/page.tsx`
- `src/app/(app)/(operator)/proposals/new/actions.ts` — `createProposal`
- `src/app/(app)/(operator)/proposals/[id]/page.tsx` — 상세
- `src/app/(app)/(operator)/proposals/[id]/edit/page.tsx`
- `src/app/(app)/(operator)/proposals/[id]/edit/actions.ts` — `updateProposal`, `transitionProposalStatus`
- `src/app/(app)/(operator)/proposals/[id]/inquiries/dispatch/actions.ts` — `dispatchInquiries`
- `src/app/(app)/(operator)/proposals/[id]/convert/actions.ts` — `convertProposalToProject`

### 4.2 신규 도메인 모듈 (`src/lib/proposals/`)

- `src/lib/proposals/status-machine.ts` — `proposal_status` enum + 허용 전환 그래프 + `validateProposalTransition` (`@MX:ANCHOR`)
- `src/lib/proposals/list-query.ts` — 리스트 검색·필터
- `src/lib/proposals/queries.ts` — CRUD (`@MX:ANCHOR createProposal`, `listProposals`)
- `src/lib/proposals/inquiry.ts` — 디스패치 도메인 함수 (`buildInquiryRecords`, `dispatchInquiries`) (`@MX:ANCHOR`)
- `src/lib/proposals/convert.ts` — Won → Project 도메인 함수 (`buildProjectFromProposal`, `buildAcceptedRecommendationFromInquiries`) (`@MX:ANCHOR`, `@MX:WARN` 트랜잭션 일관성)
- `src/lib/proposals/signal.ts` — view 정의 + `selectInstructorPriorAcceptedCount` 헬퍼
- `src/lib/proposals/file-upload.ts` — Storage 업로드 + `files` row 생성
- `src/lib/proposals/validation.ts` — Zod schema
- `src/lib/proposals/errors.ts` — 한국어 에러 상수

### 4.3 신규 UI 컴포넌트 (`src/components/proposals/`)

- `src/components/proposals/ProposalFiltersBar.tsx`
- `src/components/proposals/ProposalStatusBadge.tsx`
- `src/components/proposals/ProposalForm.tsx` (mode: 'create' | 'edit')
- `src/components/proposals/InquiryDispatchModal.tsx`
- `src/components/proposals/InquiryResponseBoard.tsx`
- `src/components/proposals/ProposalAttachmentUploader.tsx`
- `src/components/proposals/ConvertToProjectButton.tsx`

### 4.4 신규 마이그레이션

- `supabase/migrations/20260429000010_proposals.sql` — `proposal_status` enum + `proposals` 테이블 + `proposal_required_skills` junction (M1)
- `supabase/migrations/20260429000020_proposal_inquiries.sql` — `inquiry_status` enum + `proposal_inquiries` 테이블 + 인덱스 + unique 제약
- `supabase/migrations/20260429000030_notification_inquiry_request.sql` — `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_request';`
- `supabase/migrations/20260429000040_proposal_attachments_bucket.sql` — Storage 버킷 + `kind = 'proposal_attachment'` enum value (필요 시) + RLS 정책
- `supabase/migrations/20260429000050_proposals_rls.sql` — `proposals` / `proposal_required_skills` / `proposal_inquiries` RLS 정책
- `supabase/migrations/20260429000060_instructor_inquiry_history_view.sql` — `prior_accepted_count` 시그널 view

### 4.5 신규 테스트

- `src/lib/proposals/__tests__/status-machine.test.ts` — 전환 그래프 + frozen 보호
- `src/lib/proposals/__tests__/validation.test.ts` — Zod schema (제안서 / 디스패치 / 변환)
- `src/lib/proposals/__tests__/inquiry.test.ts` — `buildInquiryRecords` 순수 함수 + 중복 검출
- `src/lib/proposals/__tests__/convert.test.ts` — `buildProjectFromProposal` + `buildAcceptedRecommendationFromInquiries` 순수 함수
- `src/lib/proposals/__tests__/signal.test.ts` — view 헬퍼 + 90일 윈도우
- `src/lib/proposals/__tests__/list-query.test.ts` — 검색 + 페이지네이션
- `src/app/(app)/(operator)/proposals/__tests__/integration.test.ts` — 등록 → 제출 → 디스패치 → 응답 시뮬 → 변환

### 4.6 변경 파일

- `src/db/schema/index.ts` — `proposals`, `proposal_required_skills`, `proposal_inquiries` Drizzle 모델 export
- `package.json` (`test:unit` 스크립트) — proposals 테스트 경로 등록
- `.moai/project/structure.md` (sync 단계에서) — `src/lib/proposals/`, `(operator)/proposals/` 디렉토리 추가 표기

### 4.7 변경 없음 (참고)

- `src/lib/recommend/**` — SPEC-RECOMMEND-001 산출물, 가중치/정렬 로직 그대로
- `src/lib/projects/**` — SPEC-PROJECT-001 산출물, 7단계 매핑/`status-machine` 그대로
- `src/auth/**` — SPEC-AUTH-001 산출물 그대로
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물 그대로
- `src/lib/clients/**` — SPEC-CLIENT-001 산출물 그대로 (`listClients` 헬퍼 재사용)

---

## 5. 기술 접근 (Technical Approach)

### 5.1 데이터 모델

신규 테이블 2개 + junction 1개 + view 1개:

```sql
-- 20260429000010_proposals.sql
CREATE TYPE proposal_status AS ENUM ('draft', 'submitted', 'won', 'lost', 'withdrawn');

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES users(id),
  proposed_period_start date,
  proposed_period_end date,
  proposed_business_amount_krw bigint,
  proposed_hourly_rate_krw bigint,
  notes text,
  status proposal_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  converted_project_id uuid REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (proposed_period_end IS NULL OR proposed_period_start IS NULL OR proposed_period_end >= proposed_period_start)
);
CREATE INDEX idx_proposals_status ON proposals(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_proposals_client ON proposals(client_id);
CREATE INDEX idx_proposals_operator ON proposals(operator_id);
CREATE INDEX idx_proposals_title_trgm ON proposals USING gin (title gin_trgm_ops);

CREATE TABLE proposal_required_skills (
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill_categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (proposal_id, skill_id)
);

-- 20260429000020_proposal_inquiries.sql
CREATE TYPE inquiry_status AS ENUM ('pending', 'accepted', 'declined', 'conditional');

CREATE TABLE proposal_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
  proposed_time_slot_start timestamptz,
  proposed_time_slot_end timestamptz,
  question_note text,
  status inquiry_status NOT NULL DEFAULT 'pending',
  conditional_note text,
  responded_at timestamptz,
  responded_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, instructor_id)
);
CREATE INDEX idx_proposal_inquiries_instructor_status ON proposal_inquiries(instructor_id, status);
CREATE INDEX idx_proposal_inquiries_proposal_status ON proposal_inquiries(proposal_id, status);

-- 20260429000060_instructor_inquiry_history_view.sql
CREATE OR REPLACE VIEW instructor_inquiry_history AS
SELECT
  i.id AS instructor_id,
  COUNT(*) FILTER (WHERE pi.status = 'accepted' AND pi.responded_at > now() - interval '90 days') AS prior_accepted_count_90d,
  COUNT(*) FILTER (WHERE pi.status = 'declined' AND pi.responded_at > now() - interval '90 days') AS prior_declined_count_90d,
  COUNT(*) FILTER (WHERE pi.status = 'pending') AS prior_pending_count,
  MAX(pi.responded_at) AS last_responded_at
FROM instructors i
LEFT JOIN proposal_inquiries pi ON pi.instructor_id = i.id
GROUP BY i.id;
```

### 5.2 상태 머신

`src/lib/proposals/status-machine.ts`:

```ts
export const PROPOSAL_STATUSES = ['draft', 'submitted', 'won', 'lost', 'withdrawn'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['won', 'lost', 'withdrawn'],
  won: [],
  lost: [],
  withdrawn: [],
};

export function validateProposalTransition(from: ProposalStatus, to: ProposalStatus):
  | { ok: true } | { ok: false; reason: string };
```

전환 시 자동 timestamp 갱신:
- `submitted` 진입 시 `submitted_at = now()`
- `won|lost|withdrawn` 진입 시 `decided_at = now()`
- `won` 진입은 별도 convert 액션을 통해서만 가능 (단순 status UPDATE는 컨버트 액션이 트랜잭션 내부에서 수행)

### 5.3 디스패치 트랜잭션

`dispatchInquiries`는 다음 단계를 단일 트랜잭션으로 실행:

```sql
BEGIN;
  -- 1. 중복 체크 (advisory lock으로 race 방지 권장 — §8 R-2)
  -- 2. proposals.status IN ('draft', 'submitted') 검증
  INSERT INTO proposal_inquiries (proposal_id, instructor_id, ...) VALUES (...), (...), (...);
  -- unique 제약 위반 시 전체 롤백
  INSERT INTO notifications (recipient_id, type, title, body, link_url) VALUES (...), (...), (...);
COMMIT;
```

각 INSERT 후 `console.log("[notif] inquiry_request → instructor_id=<uuid> proposal_id=<uuid>")`. notification body 예: `"<제안서 제목> 강의 가능 여부 사전 문의 (<기간>)"`. link_url: `/me/inquiries/<inquiry_id>` (sibling SPEC-CONFIRM-001 라우트).

### 5.4 Won → Project 변환

`convertProposalToProject`는 다음을 단일 트랜잭션으로 실행:

```sql
BEGIN;
  -- 1. proposals.status = 'submitted' AND converted_project_id IS NULL 검증
  -- 2. accepted 강사 ID 조회
  SELECT pi.instructor_id FROM proposal_inquiries pi WHERE pi.proposal_id = $1 AND pi.status = 'accepted' LIMIT 3;
  -- 3. projects INSERT (모든 메타데이터 복사)
  INSERT INTO projects (...) RETURNING id;
  -- 4. project_required_skills 복사
  INSERT INTO project_required_skills (project_id, skill_id) SELECT $newProjectId, skill_id FROM proposal_required_skills WHERE proposal_id = $1;
  -- 5. accepted 강사가 있으면 ai_instructor_recommendations row 1건
  INSERT INTO ai_instructor_recommendations (project_id, top3_jsonb, model) VALUES (...);
  -- 6. proposals UPDATE (status='won', decided_at=now(), converted_project_id=<new>)
  UPDATE proposals SET status='won', decided_at=now(), converted_project_id=$newProjectId WHERE id=$1;
COMMIT;
```

`buildProjectFromProposal(proposal)`은 순수 함수로 입력 proposal → 출력 `ProjectInsert` 객체 매핑(필드별 변환 규칙 명시). `instructor_fee_krw`는 다음 우선순위:
1. `proposal.proposed_hourly_rate_krw IS NULL` → 0
2. 그렇지 않으면 0 (시간 추정 미지원 — 후속 SPEC에서 정교화 가능). MVP는 `instructor_fee_krw = 0`을 기본으로 하고 운영자가 `/projects/[id]/edit`에서 수기 입력하도록 안내.

`top3_jsonb` 형식 (SPEC-PROJECT-001 호환):
```json
[
  { "instructorId": "<uuid>", "finalScore": null, "skillMatch": null, "availability": null, "satisfaction": null, "reason": "사전 문의에서 수락한 후보 강사", "source": "fallback" }
]
```
점수 필드는 null로 두고, source는 `"fallback"` 고정 (SPEC-RECOMMEND-001 유니언 보존). model은 `"manual_from_proposal"` 신규 값 — `ai_instructor_recommendations.model`은 free-text(`text`) 컬럼이므로 enum 변경 불필요.

### 5.5 첨부 파일 업로드

- Storage 버킷: `proposal-attachments`
- 경로: `proposal-attachments/{proposal_id}/{uuid}.{ext}`
- 허용 mime: `application/pdf`, `image/png`, `image/jpeg`
- 최대 size: 5MB
- `files` 테이블에 `kind = 'proposal_attachment'` 메타 row INSERT (file_kind enum에 해당 값이 없으면 마이그레이션에서 `ALTER TYPE file_kind ADD VALUE IF NOT EXISTS 'proposal_attachment'`)
- 다운로드: signed URL (60초 TTL)

### 5.6 검색 + 페이지네이션

`title`에 대한 ILIKE 검색을 위해 `pg_trgm` 확장의 GIN 인덱스 사용. 쿼리:
```sql
SELECT ... FROM proposals
WHERE deleted_at IS NULL
  AND (status = ANY($1) OR cardinality($1) = 0)
  AND ($2::uuid IS NULL OR client_id = $2)
  AND ($3::date IS NULL OR proposed_period_start >= $3)
  AND ($4::date IS NULL OR proposed_period_start <= $4)
  AND ($5::text IS NULL OR title ILIKE '%' || $5 || '%')
ORDER BY created_at DESC
LIMIT 20 OFFSET ($6 - 1) * 20;
```

### 5.7 RLS 정책 통합

기존 SPEC-CLIENT-001 / SPEC-PROJECT-001 패턴(`auth.jwt() ->> 'role' IN ('operator', 'admin')`)을 재사용. 강사 본인 inquiry 조회 정책은 SPEC-DB-001 instructor self-access 패턴 (`instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())`)을 그대로 차용.

### 5.8 한국어 + Asia/Seoul

- `src/lib/format/datetime.ts:formatKstDateTime` 재사용 (SPEC-PROJECT-001 산출)
- 모든 status badge / error message는 한국어 상수 (`PROPOSAL_ERRORS` 객체)
- DB는 `timestamptz` 그대로 저장, 표시 레이어에서만 KST 변환

### 5.9 의존성

- 기존 사용 라이브러리만 활용: `drizzle-orm`, `zod`, `react-hook-form`, `@hookform/resolvers/zod`, `@supabase/ssr`, `@supabase/supabase-js`
- 신규 npm 의존성: 없음
- 신규 `pg_trgm` 확장: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (SPEC-DB-001에서 이미 활성화되어 있을 가능성 높음 — 마이그레이션은 idempotent)

### 5.10 동시성 / Stale 보호

- 수정 폼 제출 시 hidden input `expected_updated_at` (ISO timestamp) 포함
- Server Action에서 `UPDATE ... WHERE id = $1 AND updated_at = $2` 실행
- affected rows = 0 일 때 한국어 stale 메시지 반환 (SPEC-PROJECT-001 패턴 동일)

---

## 6. UX 흐름 요약 (UX Flow Summary)

### 6.1 신규 제안서 등록 → 사전 문의 → 제출 → 수주 → 프로젝트 변환

1. operator가 사이드바 "Proposals" 클릭 → `/proposals` 도달
2. 우상단 "신규 제안서" 버튼 → `/proposals/new`
3. 폼 입력 (제목·고객사·기간·기술스택·금액·메모) → 제출 → `/proposals/<id>` (status=draft)
4. 첨부 업로드 (선택) — 제안서 PDF / 견적서
5. "강사 사전 문의" 버튼 클릭 → 모달 열림 → instructor 3명 선택 + 시간대 + 질문 → 보내기
6. 응답 보드에 3명이 `대기 중` 컬럼에 등장 → 콘솔 로그 3건
7. (sibling SPEC-CONFIRM-001) 강사 1명이 수락 → 응답 보드 자동 갱신(서버 revalidate)
8. operator가 "제출" 버튼 → status=submitted (제안서 고객사 제출)
9. 며칠 후 고객사가 수주 결정 → operator가 "수주" 버튼 → 변환 액션 실행 → `/projects/<new_id>` redirect
10. SPEC-PROJECT-001 detail 페이지에서 정상 흐름 (`(operator)/projects/[id]` 추천·배정·진행)

### 6.2 사전 문의 없이 바로 수주 흐름

1. operator가 제안서 등록 → 제출 (사전 문의 미사용)
2. 고객사 수주 결정 → "수주" 버튼 → 프로젝트 변환 → SPEC-PROJECT-001 추천 흐름에서 강사 물색

### 6.3 실주 / 취소 흐름

1. operator가 제안서 제출 후 고객사 거절 통보 → "실주" 버튼 → status=lost (frozen)
2. 또는 제출 전 취소 → "취소" 버튼 (draft 또는 submitted에서) → status=withdrawn (frozen)
3. 이후 모든 수정 시도 거부 (한국어 에러)

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 등록 → 자동 redirect → 상세 페이지 도달
- ✅ 제출 (draft → submitted) → status badge 변경 + submitted_at 기록
- ✅ 디스패치 N=3 → proposal_inquiries 3건 + notifications 3건 + 콘솔 로그 3건
- ✅ 디스패치 중복 → unique 제약 위반 → 한국어 에러 + 전체 롤백
- ✅ Won 변환 → projects + project_required_skills + ai_instructor_recommendations(있으면) + proposals 갱신, 단일 트랜잭션
- ✅ Lost / Withdrawn → frozen, 모든 수정/디스패치/변환 시도 거부
- ✅ 응답 시뮬 (sibling) → proposal_inquiries.status pending → accepted, 응답 보드 자동 반영
- ✅ instructor 토큰 / `/proposals` 접근 → silent redirect
- ✅ 시그널 view → instructor별 prior_accepted_count_90d 산출, SPEC-RECOMMEND-001 점수 결과 변동 없음
- ✅ 첨부 업로드 (5MB pdf) → files row + Storage object, 한국어 에러는 mime/size 위반 시
- ✅ 단위 테스트 ≥ 85% line coverage (proposals 모듈)

---

## 8. 위험 및 완화 (Risks & Mitigations)

| ID | 위험 | 영향 | 완화 |
|----|------|------|------|
| R-1 | `proposal_inquiries (proposal_id, instructor_id)` unique 제약 위반이 race condition으로 발생 | 두 operator가 동일 instructor를 동시 디스패치 시 한 측은 성공 다른 측은 unique 위반으로 실패 | unique 제약은 DB 레벨에서 자동 직렬화. Server Action은 unique 위반을 catch하여 한국어 에러로 변환. 두 operator가 동시 dispatch는 배타적 — 한 측만 성공이라는 게 의도된 동작. |
| R-2 | Won 변환 트랜잭션이 부분 성공 (projects INSERT는 성공했으나 proposals UPDATE 실패) | 데이터 불일치 (projects는 생성되었으나 proposals.converted_project_id NULL) | Drizzle `db.transaction(async (tx) => { ... })` 블록으로 단일 트랜잭션 실행. 한 곳이라도 실패하면 전체 롤백. |
| R-3 | 변환 시점에 accepted 강사 0명 → ai_instructor_recommendations row 미생성 | KPI(채택률) 또는 추천 흐름에서 분모 누락 | 0명일 경우 `ai_instructor_recommendations` INSERT 자체를 skip (NULL row 생성 안 함). SPEC-PROJECT-001의 정규 추천 실행 흐름을 그대로 따름. |
| R-4 | `notification_type` enum에 `inquiry_request` 추가 마이그레이션이 SPEC-NOTIFY-001과 충돌 | enum value 중복 추가 시 Postgres는 idempotent 처리(`IF NOT EXISTS`) | `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_request';`로 안전. SPEC-NOTIFY-001과 timestamp 분리 (본 SPEC: 20260429xxxxxx). |
| R-5 | `instructor_inquiry_history` view가 프로덕션에서 N+1 쿼리 발생 | 강사 100명 × 인콰이어리 수천 건 시 view 집계 성능 저하 | view는 query-time 계산이므로 RLS 통과 시 빠름. 성능 이슈 발견 시 후속 SPEC에서 materialized view 또는 trigger 기반 카운터 컬럼 도입. 현재는 instructors 100 × 90일 데이터셋 기준 < 100ms 예상. |
| R-6 | SPEC-RECOMMEND-001 가중치 FROZEN 약속 위반 우려 | 본 SPEC의 시그널 view를 누군가 점수에 반영하는 코드 추가 시 SPEC-RECOMMEND-001 §6 위반 | §2.6 REQ-PROPOSAL-SIGNAL-003에서 "score.ts 변경 0건" 명시. lint/CI에서 `src/lib/recommend/score.ts` git diff 0 line 보장 검사 옵션 검토(후속). |
| R-7 | SPEC-CONFIRM-001 미작성 상태에서 본 SPEC만 머지되면 강사가 응답할 수 없어 시스템 데드 | 운영 가용성 | (a) sibling SPEC-CONFIRM-001을 본 SPEC과 병행 plan 단계로 진행 (사용자 지시), (b) 본 SPEC만 단독 머지될 경우, instructor에게 도착한 알림이 응답 화면 부재로 dead-link 상태가 됨 — 알림 본문에 임시 안내 텍스트("응답 화면 준비 중") 포함 옵션 검토. |
| R-8 | won 변환 후 operator가 "잘못 변환했음, 되돌리고 싶다" | won 상태는 frozen 약속 위반 | won 되돌림은 본 SPEC 범위 외(영구 제외). 운영 사고 발생 시 admin DB 작업으로만 복구. converted_project_id가 set된 후의 projects row 삭제는 SPEC-PROJECT-001 hard delete 정책에 따름 (그것도 admin DB 작업). |
| R-9 | `proposal_attachments` Storage 버킷이 환경(local/staging/prod)별로 사전 생성되어 있지 않은 경우 | 첫 업로드 시 404 에러 | 마이그레이션 `20260429000040_proposal_attachments_bucket.sql`에서 `INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING`으로 idempotent 보장. SPEC-CLIENT-001 패턴 동일. |
| R-10 | `manager-spec`이 정의하지 않은 SPEC-PROJECT-001 schema 변경(예: `projects.proposal_id` FK 신설)을 변환 액션이 시도 | SPEC-PROJECT-001 frozen 위반 | 변환 액션은 `projects` 테이블에 신규 컬럼 추가 없이, 기존 컬럼만 채운다 (§2.5 REQ-PROPOSAL-CONVERT-005 명시). converted_project_id는 `proposals` 측 컬럼이므로 SPEC-PROJECT-001 schema 무영향. |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: §1 비즈니스 컨텍스트, §3.1 [F-201]~[F-205] 운영 영역, §3.3 가정 (한국어 단일, KRW 단일)
- `.moai/project/structure.md`: `src/lib/`, `(operator)/` 라우트 구조 패턴
- `.moai/project/tech.md`: ADR-002 Supabase RLS, ADR-003 Drizzle ORM, ADR-005 이메일 스텁
- `.moai/specs/SPEC-DB-001/spec.md`: `instructors`, `users`, `clients`, `skill_categories`, `notifications`, `files`, RLS 패턴
- `.moai/specs/SPEC-CLIENT-001/spec.md`: `clients` 등록 흐름 + Storage 버킷 + RLS 패턴 (재사용 베이스라인)
- `.moai/specs/SPEC-PROJECT-001/spec.md`: `projects`, `project_required_skills`, `ai_instructor_recommendations`, 13단계 enum, 7단계 매핑 (변환 타깃)
- `.moai/specs/SPEC-RECOMMEND-001/spec.md`: 가중치 FROZEN, source 유니언 `claude | fallback`, model 컬럼 free-text 패턴 (호환 보존)
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole(['operator', 'admin'])`, `getCurrentUser()`
- `.moai/specs/SPEC-NOTIFY-001/spec.md`: `notifications` 테이블 + `console.log` 스텁 패턴
- (sibling) `.moai/specs/SPEC-CONFIRM-001/spec.md`: 강사 응답 측 처리 (병행 작성 중)
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오
- [`plan.md`](./plan.md): 마일스톤 분해
- [`spec-compact.md`](./spec-compact.md): EARS 요약본

---

문서 끝.
