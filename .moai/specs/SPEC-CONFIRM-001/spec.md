---
id: SPEC-CONFIRM-001
version: 0.1.0
status: draft
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: medium
issue_number: null
---

# SPEC-CONFIRM-001: 강사 응답 시스템 (Instructor Response System — Inquiries / Assignments)

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. SPEC-PROJECT-001(완료, 2026-04-28 머지)이 §2.7 REQ-PROJECT-ASSIGN에서 placeholder로 deferred한 "SPEC-INSTRUCTOR-CONFIRM-XXX"를 본 SPEC이 정식으로 수임한다. (1) `instructor_responses` 통합 응답 모델 — `source_kind` ∈ `{proposal_inquiry, assignment_request}` discriminator로 (a) SPEC-PROPOSAL-001(병렬 작성)이 발생시키는 사전 가용성 문의와 (b) SPEC-PROJECT-001 `assignInstructor` Server Action이 생성한 `notifications` 배정 요청을 강사 측에서 단일 모델로 통합 응답; (2) 강사 워크스페이스(SPEC-ME-001 `/me/*`) 산하 두 라우트 `/me/inquiries`(사전 문의) + `/me/assignments`(정식 배정 요청) — 각 페이지는 pending/accepted/declined/conditional 4-state 응답 패널 + `conditional_note` 텍스트 필드(conditional 시 필수); (3) Acceptance side-effects — 배정 요청 수락 시 `projects.instructor_id = self`, 상태 `assignment_review → assignment_confirmed` 전환, `lecture_sessions`(SPEC-PAYOUT-002 향후) 또는 SPEC-DB-001 `schedule_items`로 자동 INSERT(`schedule_kind = 'system_lecture'`); 사전 문의 수락 시는 `proposal_inquiries.status = 'accepted'`만 표기하고 `schedule_items` 생성은 보류; (4) Notification + email-stub — 신규 `notification_type` enum 5개(`assignment_accepted`, `assignment_declined`, `inquiry_accepted`, `inquiry_declined`, `inquiry_conditional`)를 마이그레이션으로 추가, 응답 발생 시 운영자에게 in-app `notifications` row 1건 INSERT + 콘솔 로그 `[notif] <type> → operator_id=<uuid> source_id=<uuid>`(ADR-005 이메일 스텁 기조 유지); (5) 1시간 변경 윈도 — `responded_at + 1h` 이내에만 응답 변경 가능, 이후 final lock(운영자 force-reset은 admin only로 본 SPEC 외부); (6) RLS — instructor self-only SELECT/UPDATE, instructor B의 row 노출 0; (7) Idempotency — 더블 클릭/네트워크 재시도 시 동일 status 재INSERT 금지, transactional UPSERT 사용. SPEC-PROJECT-001 `runRecommendationAction`/`assignInstructor` 흐름은 그대로 보존, 본 SPEC은 그 이후 강사가 응답하는 후행 단계. SPEC-PROPOSAL-001과는 sibling parallel 관계로 `proposal_inquiries` 테이블 스키마는 SPEC-PROPOSAL-001이 정의하고 본 SPEC은 그 row를 read+UPDATE만 수행. 실제 이메일 발송, 외부 캘린더 연동, 응답 분석 대시보드, AI 자동 응답, 다강사 팀 응답은 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

알고링크 PM이 직접 설명한 비즈니스 프로세스의 핵심 통점인 **"강사 입장에서 다음 일정 관리가 구두로만 이뤄져 어려움"** 을 시스템 측 단일 응답 흐름으로 해소한다. 본 SPEC의 산출물은 (a) SPEC-PROJECT-001 §2.7이 deferred한 강사 confirm 흐름을 수임하는 `instructor_responses` 통합 응답 모델, (b) `/me/inquiries`(SPEC-PROPOSAL-001 사전 가용성 문의 응답) + `/me/assignments`(SPEC-PROJECT-001 정식 배정 요청 응답) 두 단일-시스템 라우트, (c) 4-state 응답 라이프사이클(`pending → accepted | declined | conditional`) + `conditional_note` 자유 입력 + 1시간 변경 윈도, (d) 수락 시 자동 부수효과(배정 요청은 `projects.instructor_id` 갱신 + 상태 전환 + `schedule_items` 자동 INSERT, 사전 문의는 `proposal_inquiries.status` 표기만), (e) 5종 신규 `notification_type`(`assignment_accepted/declined`, `inquiry_accepted/declined/conditional`) + ADR-005 이메일 스텁 콘솔 로그, (f) instructor self-only RLS 보장 + 트랜잭션 idempotency, (g) 한국어 UI + Asia/Seoul + WCAG 2.1 AA 일관 적용이다.

본 SPEC은 운영자 측 응답 부재 알림 자동화(N시간 미응답), 외부 이메일/SMS/카카오 발송, 응답 분석 대시보드, AI 기반 자동 응답 추천, 동일 프로젝트에 다강사 팀 단위 공동 응답을 빌드하지 않는다.

### 1.2 배경 (Background)

`.moai/project/product.md` §2.1 강사 페르소나 핵심 니즈에 **"강의 제안 수락/거절 빠른 응답"** 이 명시되어 있다. 또한 알고링크 PM이 제공한 Korean 비즈니스 컨텍스트는 다음과 같이 두 강사 응답 시점을 구분한다:

1. **사전 가용성 문의 (제안서 단계)**: 알고링크가 고객사에 제안서를 제출하기 전, 운영자가 강사에게 "5/10~5/20 사이 React 18 강의 가능한가요?" 같은 시간대/스택 가능 여부를 미리 물어본다. 수주 미확정 단계이므로 schedule 등록은 부적절. → SPEC-PROPOSAL-001(병렬 작성)이 `proposal_inquiries` 테이블을 도입하고 강사 측 알림을 발생시킨다.
2. **정식 배정 요청 (수주 후)**: 고객사 수주 성공 후, 운영자가 SPEC-PROJECT-001 §2.6 추천을 거쳐 §2.7 1-클릭 배정 요청을 발송한다. 이때 `notifications` 테이블에 `type = 'assignment_request'` row 1건이 강사 user_id로 INSERT 되며, `console.log("[notif] assignment_request → instructor_id=<uuid> project_id=<uuid> rank=<N>")` 로그가 남는다(SPEC-PROJECT-001 §2.7 REQ-PROJECT-ASSIGN-002).

두 시점 모두 **"운영자가 보낸 알림을 강사가 받아 응답 → 운영자에게 응답 결과 통지 → 다음 단계 진행"** 이라는 동일 패턴을 따른다. 차이는 (a) source 데이터(`proposal_inquiries.id` vs `projects.id`), (b) 수락 후 부수효과(schedule 생성 여부) 두 가지뿐이다. 두 흐름을 별도 모델로 분리하면 코드 중복과 일관성 위험이 커지므로 **`source_kind` discriminator를 가진 단일 `instructor_responses` 모델**로 통합한다.

기술 기반은 다음 SPEC들이 이미 마련했다:

- SPEC-AUTH-001 (완료): `getCurrentUser()`, `requireRole('instructor')`, `<AppShell userRole>`, `/me/*` instructor-only guard
- SPEC-DB-001 (완료): `notifications` 테이블 + `notification_type` enum, `schedule_items` + `schedule_kind`, `pii_access_log` 패턴
- SPEC-ME-001 (완료): `/me/*` 라우트 그룹, `<AppShell>` instructor 사이드바, instructor 도메인 query 헬퍼
- SPEC-PROJECT-001 (완료): `assignInstructor` Server Action이 `notifications` INSERT + `adopted_instructor_id` UPDATE + `projects.instructor_id` UPDATE를 트랜잭션으로 수행, `notification_type` enum에 `assignment_request` 추가하는 마이그레이션(`20260427000091_*.sql`) 이미 적용

본 SPEC은 SPEC-PROJECT-001 §2.7 REQ-PROJECT-ASSIGN-004에서 명시적으로 deferred한 다음 placeholder를 정식 SPEC으로 승격한다:

> _"the notification body **shall** include the project title, start/end dates, and a deep link to `/me/dashboard` (instructor home for confirmation flow, deferred to SPEC-INSTRUCTOR-CONFIRM-XXX)."_

또한 SPEC-PROJECT-001 §3 Exclusions의 **"강사 confirm 흐름 (강사가 배정 요청을 수락/거절) → SPEC-INSTRUCTOR-CONFIRM-XXX"** 항목을 본 SPEC-CONFIRM-001로 매핑한다.

### 1.3 범위 (Scope)

**In Scope:**

- 신규 마이그레이션 (`supabase/migrations/`):
  - `20260429000010_instructor_responses.sql` — `instructor_responses` 테이블 신설 (id uuid PK, source_kind text, source_id uuid, instructor_id uuid FK, status text, conditional_note text nullable, responded_at timestamptz nullable, created_at timestamptz default now(), updated_at timestamptz default now()) + 인덱스 `(instructor_id, status)`, `(source_kind, source_id)` + RLS policy (instructor self-only) + UPDATE trigger `updated_at = now()`
  - `20260429000011_notification_types_confirm.sql` — `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_accepted'`, `'assignment_declined'`, `'inquiry_accepted'`, `'inquiry_declined'`, `'inquiry_conditional'` (5 신규 enum 값)
- 도메인 로직 (`src/lib/responses/`):
  - `types.ts` — `ResponseSourceKind` (`'proposal_inquiry' | 'assignment_request'`), `ResponseStatus` (`'pending' | 'accepted' | 'declined' | 'conditional'`), `InstructorResponse`, `ResponseSideEffectResult`
  - `state-machine.ts` — `validateStatusTransition(from, to): { ok: true } | { ok: false; reason: string }` (전환 그래프 + 1시간 윈도 체크), `isWithinChangeWindow(respondedAt: Date): boolean`
  - `side-effects.ts` — 순수 함수: `computeAssignmentAcceptanceEffects(project)`, `computeInquiryAcceptanceEffects(inquiry)` (생성할 schedule_items 배열 + project status 전환 후보 산출)
  - `notification-mapping.ts` — `mapResponseToNotificationType(sourceKind, status): NotificationType` (5개 신규 enum value 매핑)
  - `errors.ts` — 한국어 에러 상수 (12종+)
  - `index.ts` — public API
- Server Actions (`src/app/(app)/(instructor)/me/`):
  - `inquiries/actions.ts` — `respondToInquiry({ inquiryId, status, conditionalNote? })` (사전 문의 응답)
  - `assignments/actions.ts` — `respondToAssignment({ projectId, status, conditionalNote? })` (배정 요청 응답)
  - 두 액션 모두 트랜잭션으로 (a) `instructor_responses` UPSERT, (b) source 테이블 status UPDATE, (c) schedule_items INSERT(배정 수락 시), (d) notifications INSERT(operator), (e) `console.log` 콘솔 스텁 수행
- 라우트 페이지 (`src/app/(app)/(instructor)/me/`):
  - `inquiries/page.tsx` — 사전 가용성 문의 inbox + 응답 패널
  - `inquiries/loading.tsx`
  - `assignments/page.tsx` — 정식 배정 요청 inbox + 응답 패널
  - `assignments/loading.tsx`
- DB 쿼리 (`src/db/queries/responses/`):
  - `responses.ts` — `getMyResponses(instructorId, { sourceKind, status })`, `upsertResponse(...)`, `getLatestForSource(sourceKind, sourceId)`
  - `inquiries.ts` — `getMyInquiries(instructorId)` (`proposal_inquiries` SELECT, SPEC-PROPOSAL-001 dependency)
  - `assignments.ts` — `getMyAssignmentRequests(instructorId)` (`projects` + 가장 최근 `notifications` row JOIN)
- UI 컴포넌트 (`src/components/instructor/`):
  - `response-panel.tsx` — accept/decline/conditional 3-버튼 + conditional 시 `<Textarea>` 표시 (zod min-length 5자) + 1시간 윈도 카운트다운 표시
  - `inquiry-card.tsx` — 사전 문의 1건 카드 (제목, 일정, 기술스택, 메모 + ResponsePanel)
  - `assignment-card.tsx` — 배정 요청 1건 카드 (프로젝트 제목, 시작/종료일, 사업비, 클라이언트 + ResponsePanel)
  - `response-history-badge.tsx` — final lock 상태 표시 (1시간 경과 후)
- 사이드바 placeholder 업데이트:
  - `src/components/app/sidebar.tsx` — instructor 메뉴에 "사전 문의" + "배정 요청" 추가 (코드 수정은 다른 SPEC에 위임 가능, 본 SPEC은 placeholder 등록만)
- 단위 테스트 (`tests/unit/responses/`):
  - `state-machine.test.ts` — pending → accepted/declined/conditional 전환, 1시간 윈도 boundary
  - `side-effects.test.ts` — 배정 수락 시 schedule_items 생성 케이스, 사전 문의는 schedule 생성 안 함
  - `notification-mapping.test.ts` — 5×4 매핑 테이블 전체 커버
- 통합 테스트 (`tests/integration/`):
  - `responses-flow.test.ts` — 운영자가 배정 요청 → 강사 수락 → schedule_items + notifications + project status 전환 검증
- 한국어 라벨/에러/toast, Asia/Seoul KST 표시 일관성

**Out of Scope (Exclusions — What NOT to Build):**

- **실제 이메일 발송**: ADR-005 이메일 스텁 정책 유지. `console.log` + in-app notification만. Resend/AWS SES 어댑터는 SPEC-NOTIF-001(후속).
- **외부 캘린더 동기화 (Google Calendar / iCal)**: 강사 수락 시 `schedule_items` 자동 INSERT는 인앱 한정. ICS export, OAuth 동기화는 운영 단계 별도 SPEC.
- **응답 분석 대시보드 (analytics)**: 강사별 응답률, 평균 응답 시간, conditional 비율 같은 운영자용 통계 화면 미빌드. 추후 SPEC-ANALYTICS-XXX 위임.
- **AI 자동 응답 추천**: "이 프로젝트는 일정/스택이 잘 맞으므로 수락 추천" 같은 Claude 기반 자동 추천 미빌드. 본 SPEC은 강사 수동 결정만.
- **다강사 팀 응답 (multi-instructor team responses)**: 한 프로젝트에 강사 N명이 공동 강의하는 경우의 합산 응답 흐름 미빌드. 본 SPEC은 1 프로젝트 ↔ 1 강사 관계만 다룬다(SPEC-PROJECT-001 §3과 일관).
- **운영자 측 응답 부재 알림 자동화 (N시간 미응답 → escalation)**: SPEC-NOTIF-RULES-001(후속)으로 위임.
- **운영자 측 force-reset / 응답 무효화 admin UI**: 본 SPEC은 강사 응답이 1시간 윈도 후 final lock. 관리자가 force-reset하는 UI는 SPEC-ADMIN-001 또는 admin DB 작업으로 위임.
- **conditional 협상 UI (운영자 ↔ 강사 negotiation thread)**: 강사가 "5/3은 가능, 5/4는 18시 이후만" 같은 조건을 남기면 운영자에게 알림만 발송. 운영자가 조건을 검토 후 새 inquiry/assignment를 발송하는 흐름은 별도 UI 없이 기존 발송 흐름 재사용. 양방향 메시지 스레드는 미빌드.
- **응답 변경 이력 audit trail (누가 언제 어떤 status로 변경했는지 시계열)**: `instructor_responses.updated_at` 단일 timestamp만 유지. 변경 history 테이블 별도 미빌드.
- **모바일 푸시 알림**: 인앱만. 모바일 push는 SPEC-NOTIF-001 후속.
- **다국어**: 한국어 단일 (product.md §3.3).
- **다강사 추천 + 일괄 응답 요청 (broadcast)**: 운영자가 강사 5명에게 동시 inquiry 발송 → 첫 수락자 자동 채택은 미빌드. 본 SPEC은 1 inquiry ↔ 1 강사 1:1 관계만.
- **`instructor_responses` 컬럼 모델로 대체하는 옵션 (extend each source table)**: §5.2 기술 접근에서 트레이드오프 검토 후 통합 테이블 옵션을 채택. 컬럼 모델은 미빌드.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, `pnpm tsc --noEmit` 0 type 에러
- ✅ `instructor_responses` 마이그레이션 정합: `pnpm db:migrate` PASS, RLS 정책 instructor self-only 검증 통과
- ✅ `notification_type` enum 5개 신규 값 추가: 마이그레이션 후 `SELECT enum_range(NULL::notification_type)` 결과에 5개 포함
- ✅ `/me/inquiries` 페이지 렌더링: 강사가 받은 사전 문의 pending 목록 정확히 표시, 응답 패널 키보드 네비게이션 동작
- ✅ `/me/assignments` 페이지 렌더링: 강사가 받은 정식 배정 요청 pending 목록 정확히 표시, 응답 패널 동작
- ✅ 수락 부수효과 (배정): `instructor_responses` UPSERT + `projects.instructor_id` UPDATE + `projects.status = 'assignment_confirmed'` + `schedule_items` 1건 이상 INSERT(`schedule_kind = 'system_lecture'`) + `notifications` 1건 INSERT(`type = 'assignment_accepted'`, `recipient_id = operator_id`) 모두 단일 트랜잭션 내 실행
- ✅ 수락 부수효과 (사전 문의): `instructor_responses` UPSERT + `proposal_inquiries.status = 'accepted'` + `notifications` 1건 INSERT(`type = 'inquiry_accepted'`, `recipient_id = operator_id`) — `schedule_items` 미생성
- ✅ 거절 부수효과: `instructor_responses` status='declined' + 운영자 notifications INSERT(`type = 'assignment_declined' | 'inquiry_declined'`) + 콘솔 로그
- ✅ Conditional 부수효과: status='conditional' + `conditional_note` 5자 이상 zod 검증 + 운영자 notifications INSERT(`type = 'inquiry_conditional'` 또는 `assignment_*` — 매핑은 §5.4) + 콘솔 로그
- ✅ 1시간 변경 윈도: `responded_at + 1h` 이내 응답 변경 가능, 1시간 경과 후 UI는 응답을 final lock 표시 + 변경 시도 시 한국어 에러 `"응답 변경 가능 시간이 지났습니다."`
- ✅ Idempotency: 동일 (`source_kind`, `source_id`, `instructor_id`) 조합으로 더블 클릭 시 단일 row만 존재(UPSERT), `notifications` 중복 INSERT 0건
- ✅ RLS 격리: instructor B 토큰으로 instructor A의 `instructor_responses` row SELECT 시 0행 반환, UPDATE 시 RLS deny
- ✅ 콘솔 로그 포맷: `[notif] assignment_accepted → operator_id=<uuid> source_id=<uuid>` 정확히 출력 (5개 type 모두)
- ✅ 단위 테스트: state-machine, side-effects, notification-mapping 모두 PASS, 라인 커버리지 ≥ 85%
- ✅ 통합 테스트: 운영자 배정 → 강사 수락 → 부수효과 6종 시나리오 PASS
- ✅ Asia/Seoul 표시: 모든 timestamp(요청 시각, 응답 시각, 변경 윈도 카운트다운) KST 형식 일관 적용
- ✅ 한국어 UI: 라벨/버튼/에러/toast 모두 한국어, 영문 평문 노출 0건
- ✅ axe DevTools: `/me/inquiries`, `/me/assignments` critical 0건, serious 0건
- ✅ Lighthouse Accessibility ≥ 95

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `RESPONSES`, `INQUIRIES`, `ASSIGNMENTS`, `EFFECTS`, `NOTIFY`, `RESPONSE-WINDOW`, `RLS`.

### 2.1 REQ-CONFIRM-RESPONSES — 통합 응답 모델 + 라이프사이클

**REQ-CONFIRM-RESPONSES-001 (Ubiquitous)**
The system **shall** define a unified `instructor_responses` table with columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `source_kind text NOT NULL CHECK (source_kind IN ('proposal_inquiry', 'assignment_request'))`, `source_id uuid NOT NULL`, `instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE`, `status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'conditional')) DEFAULT 'pending'`, `conditional_note text`, `responded_at timestamptz`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` and a UNIQUE constraint on `(source_kind, source_id, instructor_id)` to enforce idempotency.

**REQ-CONFIRM-RESPONSES-002 (Ubiquitous)**
The system **shall** create indexes `idx_instructor_responses_by_instructor (instructor_id, status)` and `idx_instructor_responses_by_source (source_kind, source_id)` to support both `/me/inquiries` and `/me/assignments` query patterns.

**REQ-CONFIRM-RESPONSES-003 (Ubiquitous)**
The system **shall** implement a state machine via `src/lib/responses/state-machine.ts` exporting `validateStatusTransition(from: ResponseStatus, to: ResponseStatus): { ok: true } | { ok: false; reason: string }`; allowed transitions are `pending → accepted | declined | conditional`, and any non-pending status MAY transition to another non-pending status only when the change window (REQ-CONFIRM-RESPONSE-WINDOW) is open.

**REQ-CONFIRM-RESPONSES-004 (Unwanted Behavior)**
**If** a response is submitted with `status = 'conditional'` and `conditional_note` is missing, empty, or shorter than 5 characters, **then** the Server Action **shall** reject the request with the Korean message `"조건부 응답에는 5자 이상의 메모를 입력해주세요."` and **shall not** persist any row.

**REQ-CONFIRM-RESPONSES-005 (Ubiquitous)**
The `instructor_responses` table **shall** be created with RLS enabled and a policy `instructor_responses_self_only` that allows `SELECT`, `INSERT`, `UPDATE` only when `auth.uid() IN (SELECT user_id FROM instructors WHERE id = instructor_responses.instructor_id)`; all other roles **shall** receive zero rows on `SELECT` and permission-denied on writes.

**REQ-CONFIRM-RESPONSES-006 (Event-Driven)**
**When** an `instructor_responses` row is updated, the database **shall** automatically set `updated_at = now()` via a `BEFORE UPDATE` trigger; the application code **shall not** manage `updated_at` directly.

**REQ-CONFIRM-RESPONSES-007 (Ubiquitous)**
The system **shall** provide a typed domain module `src/lib/responses/index.ts` exporting `ResponseSourceKind`, `ResponseStatus`, `InstructorResponse`, and pure functions for state transition validation; the module **shall not** depend on Drizzle, Supabase, or React.

### 2.2 REQ-CONFIRM-INQUIRIES — `/me/inquiries` 사전 가용성 문의 라우트

**REQ-CONFIRM-INQUIRIES-001 (Ubiquitous)**
The system **shall** render an instructor inquiry inbox at `/me/inquiries` (server component, behind SPEC-AUTH-001 `requireRole('instructor')`) listing all `proposal_inquiries` rows whose `instructor_id` matches the authenticated instructor and whose status filter is `pending` by default; the page **shall** join `proposal_inquiries → projects/proposals` (via SPEC-PROPOSAL-001's source table) to display title, requested time slot, required skill stack, and operator memo.

**REQ-CONFIRM-INQUIRIES-002 (Ubiquitous)**
The system **shall** display each inquiry row with: 제목, 요청 일정 범위(시작/종료 KST), 기술스택 태그 리스트, 운영자 메모, 요청 시각(KST), 응답 상태 배지(pending/accepted/declined/conditional), 응답 시각(`responded_at` KST, nullable).

**REQ-CONFIRM-INQUIRIES-003 (Event-Driven)**
**When** the instructor selects accept/decline/conditional on an inquiry's `<ResponsePanel>`, the system **shall** call the Server Action `respondToInquiry({ inquiryId, status, conditionalNote? })` which validates input via zod, runs `validateStatusTransition`, and persists the response in a single transaction.

**REQ-CONFIRM-INQUIRIES-004 (State-Driven)**
**While** an inquiry response is `pending`, the page **shall** render all three action buttons (accept/decline/conditional) as enabled; **while** the response is in any non-pending state and within the 1-hour change window, the page **shall** highlight the chosen status and offer a "응답 변경" affordance that re-opens the panel.

**REQ-CONFIRM-INQUIRIES-005 (Optional Feature)**
**Where** the instructor wants to filter the inbox, the system **shall** support URL query parameters `status` (multi-select among 4 values) and `responded_at` date range; defaults to `status=pending`.

**REQ-CONFIRM-INQUIRIES-006 (Unwanted Behavior)**
**If** the instructor reaches `/me/inquiries/<id>` for an inquiry not addressed to them (URL tampering), **then** RLS **shall** return zero rows and the page **shall** render `notFound()` rendering the Korean state `"문의를 찾을 수 없습니다."` without confirming foreign IDs.

### 2.3 REQ-CONFIRM-ASSIGNMENTS — `/me/assignments` 정식 배정 요청 라우트

**REQ-CONFIRM-ASSIGNMENTS-001 (Ubiquitous)**
The system **shall** render an instructor assignment-request inbox at `/me/assignments` (server component, behind SPEC-AUTH-001 `requireRole('instructor')`) listing all projects where (a) `projects.instructor_id = self.instructor_id` AND (b) `projects.status IN ('assignment_review', 'assignment_confirmed')` OR (c) the most recent `notifications` row with `type = 'assignment_request'` targets the instructor; the page **shall** join `projects → clients` for the company name and the latest `ai_instructor_recommendations` for the rank.

**REQ-CONFIRM-ASSIGNMENTS-002 (Ubiquitous)**
The system **shall** display each assignment-request card with: 프로젝트 제목, 클라이언트(고객사명), 강의 시작/종료일(KST), 사업비/강사료(KRW), 추천 rank(1/2/3 또는 "기타"), 요청 시각(`notifications.created_at` KST), 응답 상태, 응답 패널.

**REQ-CONFIRM-ASSIGNMENTS-003 (Event-Driven)**
**When** the instructor selects accept/decline/conditional on the response panel, the system **shall** call the Server Action `respondToAssignment({ projectId, status, conditionalNote? })` which validates input, runs `validateStatusTransition`, and persists the response + acceptance side-effects (REQ-CONFIRM-EFFECTS) in a single transaction.

**REQ-CONFIRM-ASSIGNMENTS-004 (State-Driven)**
**While** the response status is `accepted` and the project status has transitioned to `assignment_confirmed`, the page **shall** display a green confirmation banner `"배정이 확정되었습니다. 일정에 자동 등록되었습니다."` and **shall** link to `/me/calendar` to view the auto-created `schedule_items`.

**REQ-CONFIRM-ASSIGNMENTS-005 (Unwanted Behavior)**
**If** the instructor attempts to respond to an assignment whose `projects.instructor_id` no longer matches their own (e.g., operator reassigned to another instructor in the meantime), **then** the action **shall** reject with the Korean message `"이미 다른 강사에게 재배정된 프로젝트입니다."` and **shall not** modify any row.

**REQ-CONFIRM-ASSIGNMENTS-006 (Optional Feature)**
**Where** the instructor wants to view past responses (final-locked, beyond 1-hour window), the system **shall** provide a `?include=history` toggle that includes accepted/declined/conditional rows older than 1 hour in read-only display.

### 2.4 REQ-CONFIRM-EFFECTS — 수락 부수효과

**REQ-CONFIRM-EFFECTS-001 (Event-Driven)**
**When** an instructor responds to an `assignment_request` with `status = 'accepted'`, the system **shall** execute within a single PostgreSQL transaction: (a) UPSERT into `instructor_responses` with `responded_at = now()`, (b) UPDATE `projects SET instructor_id = self, status = 'assignment_confirmed', updated_at = now() WHERE id = $projectId AND status = 'assignment_review'`, (c) INSERT one or more `schedule_items` rows with `schedule_kind = 'system_lecture'`, `instructor_id = self`, `project_id = $projectId`, `starts_at = projects.education_start_at`, `ends_at = projects.education_end_at`, (d) INSERT one `notifications` row addressed to `projects.operator_id` with `type = 'assignment_accepted'`.

**REQ-CONFIRM-EFFECTS-002 (Event-Driven)**
**When** an instructor responds to a `proposal_inquiry` with `status = 'accepted'`, the system **shall** execute within a single transaction: (a) UPSERT into `instructor_responses`, (b) UPDATE `proposal_inquiries SET status = 'accepted'` (column owned by SPEC-PROPOSAL-001), (c) INSERT one `notifications` row addressed to the operator who initiated the inquiry with `type = 'inquiry_accepted'`; the system **shall NOT** create any `schedule_items` rows because the proposal is not yet won.

**REQ-CONFIRM-EFFECTS-003 (Event-Driven)**
**When** the response status is `declined` or `conditional` for either source kind, the system **shall** UPSERT `instructor_responses` and INSERT a single `notifications` row addressed to the operator with the corresponding type from §2.5 mapping table; the system **shall NOT** modify `projects.instructor_id`, `projects.status`, or `proposal_inquiries.status`.

**REQ-CONFIRM-EFFECTS-004 (Ubiquitous)**
The pure-function module `src/lib/responses/side-effects.ts` **shall** export `computeAssignmentAcceptanceEffects(project: ProjectSnapshot): { scheduleItems: ScheduleItemDraft[]; nextStatus: ProjectStatus }` and `computeInquiryAcceptanceEffects(inquiry: InquirySnapshot): { inquiryStatus: 'accepted' }`; both functions **shall** be free of IO and **shall** be unit-tested.

**REQ-CONFIRM-EFFECTS-005 (Unwanted Behavior)**
**If** the transaction fails at any step (e.g., `schedule_items` INSERT violates EXCLUSION constraint due to overlap with another `system_lecture`), **then** the entire transaction **shall** roll back; the user **shall** see a Korean error toast describing the conflict (e.g., `"이미 등록된 강의 일정과 겹쳐 자동 등록에 실패했습니다. 운영자에게 문의해주세요."`) and the response **shall not** be recorded.

**REQ-CONFIRM-EFFECTS-006 (State-Driven)**
**While** the project's `education_start_at` or `education_end_at` is null at the time of acceptance, the system **shall** still record the response and transition the project status, but **shall** skip `schedule_items` creation and **shall** display a non-blocking warning banner `"강의 시작/종료일이 미정이어서 일정 등록이 보류되었습니다."`.

**REQ-CONFIRM-EFFECTS-007 (Optional Feature)**
**Where** SPEC-PAYOUT-002 introduces a `lecture_sessions` table for finer-grained per-session scheduling, the side-effect logic **shall** be refactored to derive `schedule_items` from `lecture_sessions`; until then, the M-1 acceptance flow uses `projects.education_start_at` / `education_end_at` as the single session window.

### 2.5 REQ-CONFIRM-NOTIFY — 운영자 알림 + 이메일 스텁

**REQ-CONFIRM-NOTIFY-001 (Ubiquitous)**
The system **shall** introduce 5 new `notification_type` enum values via migration `20260429000011_notification_types_confirm.sql` using `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '<value>'` for each of: `assignment_accepted`, `assignment_declined`, `inquiry_accepted`, `inquiry_declined`, `inquiry_conditional`.

**REQ-CONFIRM-NOTIFY-002 (Ubiquitous)**
The mapping from `(source_kind, status)` to `notification_type` **shall** be defined in `src/lib/responses/notification-mapping.ts` as:

| `source_kind` | `status` | `notification_type` |
|---------------|----------|---------------------|
| `assignment_request` | `accepted` | `assignment_accepted` |
| `assignment_request` | `declined` | `assignment_declined` |
| `assignment_request` | `conditional` | `assignment_declined` |
| `proposal_inquiry` | `accepted` | `inquiry_accepted` |
| `proposal_inquiry` | `declined` | `inquiry_declined` |
| `proposal_inquiry` | `conditional` | `inquiry_conditional` |

(Note: assignment conditional maps to `assignment_declined` because operator must re-issue request; SPEC-NOTIF-RULES-001 future work may add a dedicated `assignment_conditional` enum value.)

**REQ-CONFIRM-NOTIFY-003 (Event-Driven)**
**When** any response is recorded, the system **shall** INSERT one `notifications` row in the same transaction as the response with `recipient_id = operator_user_id` (resolved via `projects.operator_id` for assignments or `proposal_inquiries.created_by_user_id` for inquiries), `type = mapResponseToNotificationType(sourceKind, status)`, `title` = Korean templated string (e.g., `"강사 응답: {프로젝트명} 수락"`), `body` = Korean detail including instructor name and conditional note (truncated 200자), `link_url = '/projects/<id>'` for assignments or `/proposals/<id>` for inquiries.

**REQ-CONFIRM-NOTIFY-004 (Event-Driven)**
**When** a notification is INSERTed, the system **shall** also emit a console-log line in the format `[notif] <notification_type> → operator_id=<uuid> source_id=<uuid>` to stdout via `console.log`, preserving ADR-005's email-stub boundary; the log line **shall** appear regardless of NODE_ENV.

**REQ-CONFIRM-NOTIFY-005 (Unwanted Behavior)**
**If** the operator user record is deleted or `recipient_id` cannot be resolved, **then** the notification INSERT **shall** be skipped (not raise) and a `console.warn` line **shall** be emitted; the response transaction **shall** still commit so the instructor's choice is not lost.

**REQ-CONFIRM-NOTIFY-006 (Optional Feature)**
**Where** SPEC-NOTIF-001 introduces a real email adapter, the console-log site **shall** be replaced by an adapter call without changing the response transaction boundary; the response transaction remains the source of truth.

### 2.6 REQ-CONFIRM-RESPONSE-WINDOW — 1시간 변경 윈도 + Idempotency

**REQ-CONFIRM-RESPONSE-WINDOW-001 (Ubiquitous)**
The system **shall** define a constant `CHANGE_WINDOW_HOURS = 1` in `src/lib/responses/state-machine.ts` and a pure function `isWithinChangeWindow(respondedAt: Date, now: Date = new Date()): boolean` returning `true` when `now - respondedAt <= 1 hour`.

**REQ-CONFIRM-RESPONSE-WINDOW-002 (State-Driven)**
**While** an `instructor_responses` row has `responded_at != null` AND `now() - responded_at > 1 hour`, the response **shall** be considered final-locked; the UI **shall** display a `"응답 확정"` badge and the action buttons **shall** be disabled.

**REQ-CONFIRM-RESPONSE-WINDOW-003 (Unwanted Behavior)**
**If** the instructor attempts to change a final-locked response (via re-submitted Server Action, possibly from a stale browser tab), **then** the Server Action **shall** reject with the Korean error `"응답 변경 가능 시간이 지났습니다. 운영자에게 문의해주세요."` and the existing row **shall** remain unchanged.

**REQ-CONFIRM-RESPONSE-WINDOW-004 (Event-Driven)**
**When** the instructor changes their response within the 1-hour window (e.g., from accepted to declined), the system **shall** UPDATE the existing `instructor_responses` row (UNIQUE constraint enforces same row) and **shall** insert a new `notifications` row reflecting the new status; the previous notification row remains for operator audit but the response transaction MUST be atomic.

**REQ-CONFIRM-RESPONSE-WINDOW-005 (Ubiquitous)**
The system **shall** ensure idempotency on Server Action re-invocation by relying on the UNIQUE constraint `(source_kind, source_id, instructor_id)`; double-clicks, network retries, or concurrent submissions from multiple tabs **shall** result in at most one row per `(source, instructor)` tuple.

**REQ-CONFIRM-RESPONSE-WINDOW-006 (Optional Feature)**
**Where** the response panel UI is rendering a non-pending response within the change window, the panel **shall** display a live countdown `"남은 변경 가능 시간: <mm:ss>"` updating every second via client component; on countdown reaching zero, the buttons **shall** disable without requiring a page refresh.

### 2.7 REQ-CONFIRM-RLS — instructor self-only 격리

**REQ-CONFIRM-RLS-001 (Ubiquitous)**
The system **shall** rely on SPEC-AUTH-001's `(instructor)/layout.tsx` guard for the primary access control to `/me/inquiries` and `/me/assignments`; the layout **shall** call `requireRole('instructor')` and silent-redirect on mismatch (operator/admin → `/dashboard`).

**REQ-CONFIRM-RLS-002 (Ubiquitous)**
The `instructor_responses` table **shall** have RLS policy `instructor_responses_self_only` enforcing instructor-only `SELECT/INSERT/UPDATE` based on `auth.uid()` to `instructors.user_id` resolution; operator/admin direct queries to this table **shall** return zero rows for SELECT and `permission denied` on writes (defense in depth — operators see responses only via the operator-side `notifications` and `projects.instructor_id` joins).

**REQ-CONFIRM-RLS-003 (Unwanted Behavior)**
**If** instructor B attempts (via stale URL, deep-linked card UUID, or DevTools Network tab edit) to read or update an `instructor_responses` row owned by instructor A, **then** RLS **shall** return zero rows on SELECT and the Server Action **shall** receive a "row not found or not permitted" outcome translated to the Korean error `"본인 응답만 수정할 수 있습니다."`.

**REQ-CONFIRM-RLS-004 (Ubiquitous)**
The system **shall NOT** introduce any service-role (`SUPABASE_SERVICE_ROLE_KEY`) Supabase client in the `respondToInquiry` or `respondToAssignment` Server Actions; all DB operations **shall** use the user-scoped server client to keep RLS as the authoritative authorization layer (consistent with SPEC-PROJECT-001 REQ-PROJECT-RLS-004).

**REQ-CONFIRM-RLS-005 (Optional Feature)**
**Where** an admin needs to inspect or override an instructor's response (operational recovery), the override path **shall** live in a separate admin route (out of scope for this SPEC, deferred to SPEC-ADMIN-001) and **shall NOT** be invokable from the instructor's `/me/*` workspace.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 실제 이메일 발송 (Resend / AWS SES) | SPEC-NOTIF-001 |
| 외부 캘린더 동기화 (Google / iCal / ICS export) | (운영 단계 별도 SPEC) |
| 응답 분석 대시보드 (응답률, 응답 시간 통계) | SPEC-ANALYTICS-XXX (검토 후 결정) |
| AI 자동 응답 추천 (수락/거절 자동 제안) | (검토 후 결정) |
| 다강사 팀 응답 (multi-instructor team responses) | (영구 제외, 1:1 관계 유지) |
| 운영자 측 응답 부재 알림 자동화 (N시간 미응답 → escalation) | SPEC-NOTIF-RULES-001 |
| 운영자 측 force-reset / 응답 무효화 admin UI | SPEC-ADMIN-001 |
| 양방향 conditional 협상 메시지 스레드 | (검토 후 결정) |
| 응답 변경 audit trail 시계열 history 테이블 | (운영 단계) |
| 모바일 push 알림 | SPEC-NOTIF-001 후속 |
| 다국어 (i18n) | (영구 제외, 한국어 단일) |
| 다강사 broadcast inquiry (강사 N명 동시 발송 + 첫 수락자 채택) | (검토 후 결정) |
| 컬럼 모델로 대체 (`proposal_inquiries.response_status` 등 source 테이블 직접 확장) | §5.2에서 통합 테이블 채택, 컬럼 모델 영구 제외 |
| 모바일 전용 응답 UX (포커스/제스처 최적화) | (검토 후 결정) |
| `assignment_conditional` 별도 enum value | §5.4에서 `assignment_declined`로 통합 매핑, 분리는 SPEC-NOTIF-RULES-001 |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 마이그레이션 (`supabase/migrations/`)

- `supabase/migrations/20260429000010_instructor_responses.sql`
  - `CREATE TABLE instructor_responses` (모든 컬럼 + UNIQUE 제약 + 인덱스 2종)
  - `ALTER TABLE instructor_responses ENABLE ROW LEVEL SECURITY`
  - `CREATE POLICY instructor_responses_self_only` (SELECT/INSERT/UPDATE)
  - `CREATE TRIGGER set_updated_at_instructor_responses` (BEFORE UPDATE)
- `supabase/migrations/20260429000011_notification_types_confirm.sql`
  - `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_accepted'`
  - (4 추가 enum value, 동일 패턴)

### 4.2 신규 도메인 모듈 (`src/lib/responses/`)

- `src/lib/responses/types.ts` — `ResponseSourceKind`, `ResponseStatus`, `InstructorResponse`, `ResponseSideEffectResult`
- `src/lib/responses/state-machine.ts` — `validateStatusTransition`, `isWithinChangeWindow`, `CHANGE_WINDOW_HOURS`
- `src/lib/responses/side-effects.ts` — `computeAssignmentAcceptanceEffects`, `computeInquiryAcceptanceEffects`
- `src/lib/responses/notification-mapping.ts` — `mapResponseToNotificationType`
- `src/lib/responses/errors.ts` — 한국어 에러 상수 12종+
- `src/lib/responses/index.ts` — public re-export

### 4.3 신규 Server Actions + 페이지 (`src/app/(app)/(instructor)/me/`)

- `src/app/(app)/(instructor)/me/inquiries/page.tsx` — 사전 문의 inbox
- `src/app/(app)/(instructor)/me/inquiries/loading.tsx`
- `src/app/(app)/(instructor)/me/inquiries/actions.ts` — `respondToInquiry` Server Action
- `src/app/(app)/(instructor)/me/assignments/page.tsx` — 정식 배정 요청 inbox
- `src/app/(app)/(instructor)/me/assignments/loading.tsx`
- `src/app/(app)/(instructor)/me/assignments/actions.ts` — `respondToAssignment` Server Action

### 4.4 신규 DB 쿼리 (`src/db/queries/responses/`)

- `src/db/queries/responses/responses.ts` — `getMyResponses`, `upsertResponse`, `getLatestForSource`
- `src/db/queries/responses/inquiries.ts` — `getMyInquiries` (proposal_inquiries SELECT, SPEC-PROPOSAL-001 dependency)
- `src/db/queries/responses/assignments.ts` — `getMyAssignmentRequests` (projects + 최근 notifications JOIN)

### 4.5 신규 UI 컴포넌트 (`src/components/instructor/`)

- `src/components/instructor/response-panel.tsx` — accept/decline/conditional 3-버튼 + conditional textarea + countdown
- `src/components/instructor/inquiry-card.tsx` — 사전 문의 1건 카드
- `src/components/instructor/assignment-card.tsx` — 배정 요청 1건 카드
- `src/components/instructor/response-history-badge.tsx` — final lock 상태 표시

### 4.6 placeholder 변경 (다른 SPEC에 위임 가능)

- `src/components/app/sidebar.tsx` — instructor 메뉴에 "사전 문의" + "배정 요청" 진입점 추가 (SPEC-ME-001 sidebar placeholder 채움)
  - 본 SPEC은 메뉴 placeholder 등록만 명시. 실제 변경은 SPEC-ME-001 후속 마일스톤 또는 본 SPEC 구현 시 함께 반영 가능.

### 4.7 신규 테스트

- `tests/unit/responses/state-machine.test.ts` — 4-state 전환 매트릭스 + 1시간 윈도 boundary
- `tests/unit/responses/side-effects.test.ts` — 배정 수락 schedule 생성 / 사전 문의 수락은 schedule 미생성
- `tests/unit/responses/notification-mapping.test.ts` — 6개 매핑 케이스 전체
- `tests/integration/responses-flow.test.ts` — 운영자 배정 → 강사 수락 → 6종 부수효과 + 콘솔 로그

### 4.8 변경 없음 (참고)

- SPEC-PROJECT-001 산출물 (`src/app/(app)/(operator)/projects/[id]/assign/actions.ts` 등) — 0 변경
- SPEC-DB-001 산출물 (`projects`, `notifications`, `schedule_items` 테이블) — 0 변경 (enum 5개 추가만)
- SPEC-AUTH-001 산출물 (`requireRole`, `getCurrentUser`) — 0 변경, 그대로 사용
- SPEC-ME-001 산출물 (`/me/*` 라우트 그룹, instructor 사이드바) — placeholder 메뉴 추가만

---

## 5. 기술 접근 (Technical Approach)

### 5.1 통합 테이블 vs 컬럼 확장 트레이드오프

두 구현 옵션을 검토했다:

- **옵션 A (채택): 통합 `instructor_responses` 테이블 + `source_kind` discriminator**
  - 장점: (i) 단일 라이프사이클 코드(state-machine, validation, idempotency)로 두 source 모두 커버, (ii) `/me/*` UI에서 동일한 ResponsePanel 컴포넌트 재사용, (iii) 향후 새 source(e.g., satisfaction_review_request) 추가가 row 1줄 추가로 끝남, (iv) RLS 정책 1개로 격리 보장
  - 단점: source 테이블과 `instructor_responses` 간 조인 필요(런타임 비용 미미)

- **옵션 B (제외): 각 source 테이블에 응답 컬럼 직접 추가 (`proposal_inquiries.response_status`, `projects.instructor_response_status` 등)**
  - 장점: 조인 없이 단일 SELECT로 응답 표시 가능
  - 단점: (i) 라이프사이클 코드가 두 곳에 중복, (ii) `conditional_note` 컬럼이 source마다 별도, (iii) 향후 새 source 추가 시 매번 마이그레이션 + 코드 수정, (iv) idempotency 보장 위해 UNIQUE 제약을 source 테이블별로 추가해야 함

옵션 A를 채택. SPEC-PROPOSAL-001과의 sibling 관계도 옵션 A에서 더 깨끗한데, `proposal_inquiries`는 자기 도메인(고객사 제안 단계 정보)에 집중하고 강사 응답은 `instructor_responses`가 단독 책임진다.

### 5.2 source 매핑 + 조회 전략

`/me/inquiries` 페이지 데이터 흐름:

```
1. requireRole('instructor') → getCurrentUser() → instructorId
2. SELECT pi.*, ir.status, ir.responded_at, ir.conditional_note
   FROM proposal_inquiries pi
   LEFT JOIN instructor_responses ir
     ON ir.source_kind = 'proposal_inquiry'
    AND ir.source_id = pi.id
    AND ir.instructor_id = $instructorId
   WHERE pi.instructor_id = $instructorId
   ORDER BY pi.created_at DESC
3. 클라이언트 측 필터: ?status=pending 등
```

`/me/assignments` 페이지 데이터 흐름:

```
1. requireRole('instructor') → instructorId
2. SELECT p.*, c.company_name, n.created_at AS request_created_at,
          air.top3_jsonb, ir.status, ir.responded_at, ir.conditional_note
   FROM projects p
   JOIN clients c ON c.id = p.client_id
   LEFT JOIN LATERAL (
     SELECT created_at FROM notifications
     WHERE recipient_id = $userId AND type = 'assignment_request'
       AND link_url LIKE '%' || p.id || '%'
     ORDER BY created_at DESC LIMIT 1
   ) n ON true
   LEFT JOIN ai_instructor_recommendations air
     ON air.project_id = p.id
   LEFT JOIN instructor_responses ir
     ON ir.source_kind = 'assignment_request'
    AND ir.source_id = p.id
    AND ir.instructor_id = $instructorId
   WHERE p.instructor_id = $instructorId
     AND p.status IN ('assignment_review', 'assignment_confirmed')
   ORDER BY n.created_at DESC NULLS LAST
```

`source_id`는 assignment의 경우 `projects.id` UUID를 그대로 사용한다(notifications.link_url 파싱 대신).

### 5.3 트랜잭션 + idempotency

`respondToAssignment` Server Action 핵심 SQL (Drizzle `db.transaction`):

```sql
BEGIN;
  -- 1. UPSERT response (UNIQUE constraint enforces single row)
  INSERT INTO instructor_responses (
    source_kind, source_id, instructor_id, status, conditional_note, responded_at
  ) VALUES ('assignment_request', $projectId, $instructorId, $status, $note, now())
  ON CONFLICT (source_kind, source_id, instructor_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    conditional_note = EXCLUDED.conditional_note,
    responded_at = now()
  WHERE instructor_responses.responded_at IS NULL  -- pending → first response
     OR (now() - instructor_responses.responded_at) <= INTERVAL '1 hour'  -- within window
  RETURNING *;

  -- 2. (accepted only) Update project + create schedule + notify operator
  -- (declined/conditional only) Skip project update + notify operator with appropriate type

COMMIT;
```

WHERE 절의 `responded_at IS NULL OR within 1h`이 1시간 윈도 enforcement를 DB 차원에서 보장한다(클라이언트 timestamp 신뢰 X).

### 5.4 conditional 매핑 결정

`assignment_request × conditional` 케이스는 SPEC-NOTIF-RULES-001 전까지 dedicated enum이 없다. 본 SPEC의 매핑 결정:

- 옵션 1 (채택): `assignment_declined` enum으로 매핑. body 텍스트에 `[조건부] {note}` 접두사 추가. 운영자 입장에서 "거절 → 재배정 필요" 동일한 UX flow.
- 옵션 2 (보류): 별도 `assignment_conditional` enum 신설 → SPEC-NOTIF-RULES-001로 위임.

옵션 1을 채택. 사전 문의(inquiry_conditional)는 conditional 그 자체가 정상 응답 흐름의 일부(운영자가 negotiate 후 새 inquiry 발송)이므로 별도 enum이 가치 있지만, 배정 단계의 conditional은 사실상 거절 후 재배정 흐름이므로 별도 enum이 큰 가치가 없다.

### 5.5 한국어 에러 + Asia/Seoul

`src/lib/responses/errors.ts`:

```typescript
export const RESPONSE_ERRORS = {
  NOTE_TOO_SHORT: '조건부 응답에는 5자 이상의 메모를 입력해주세요.',
  WINDOW_EXPIRED: '응답 변경 가능 시간이 지났습니다. 운영자에게 문의해주세요.',
  NOT_OWN_RESPONSE: '본인 응답만 수정할 수 있습니다.',
  REASSIGNED_AWAY: '이미 다른 강사에게 재배정된 프로젝트입니다.',
  SCHEDULE_CONFLICT: '이미 등록된 강의 일정과 겹쳐 자동 등록에 실패했습니다. 운영자에게 문의해주세요.',
  PROJECT_DATES_MISSING: '강의 시작/종료일이 미정이어서 일정 등록이 보류되었습니다.',
  INVALID_TRANSITION: '허용되지 않은 응답 상태 전환입니다.',
  // ... 12종 이상
} as const;
```

KST 시각 표시는 SPEC-PROJECT-001 §5.9의 `formatKstDateTime`을 재사용한다.

### 5.6 의존성 (신규)

- 외부 라이브러리 신규 추가 0건 (zod, drizzle-orm, @supabase/ssr 모두 기존 사용)
- SPEC-PROPOSAL-001(병렬)이 정의할 `proposal_inquiries` 테이블 의존성 — M-1 게이트에서 SPEC-PROPOSAL-001 마이그레이션 머지 확인 후 본 SPEC 시작

### 5.7 SPEC-PROPOSAL-001과 dependency 관리

본 SPEC의 `/me/inquiries` 라우트는 `proposal_inquiries` 테이블이 존재해야 동작한다. 만약 SPEC-PROPOSAL-001이 먼저 머지되면 본 SPEC은 그대로 진행. 본 SPEC이 먼저 SPEC scope을 finalize하지만 implementation 시점에 SPEC-PROPOSAL-001 미완성이면 `/me/inquiries`만 deferred하고 `/me/assignments`만 먼저 출시 가능(M-1/M-2 분리, plan.md 참조).

### 5.8 schedule_items EXCLUSION 제약 대응

SPEC-DB-001은 `schedule_items`에 EXCLUSION 제약(시간 범위 겹침 방지)을 걸 수 있다(REQ-CONFIRM-EFFECTS-005 참조). 강사가 이미 `unavailable` 또는 다른 `system_lecture`로 등록한 시간과 겹치는 프로젝트를 수락 시도하면 INSERT 실패 → 트랜잭션 롤백 → 한국어 안내. 강사는 운영자에게 conditional 응답을 통해 재조정 요청해야 한다.

---

## 6. UX 흐름 (User Flows)

### 6.1 정식 배정 요청 — Golden Path

1. 운영자가 `/projects/[id]`에서 1-클릭 배정(SPEC-PROJECT-001 §2.7) → `notifications` row INSERT
2. 강사가 `/me`에 진입 → `<TopBar>` 알림 벨에 1건 표시
3. 강사가 사이드바 "배정 요청" 클릭 → `/me/assignments`
4. 카드 1건 표시 (프로젝트 제목 + 일정 + 사업비 + 추천 rank 1/2/3)
5. 응답 패널의 "수락" 버튼 클릭 → 확인 다이얼로그 → 확정
6. 트랜잭션 6 step 실행 (REQ-CONFIRM-EFFECTS-001)
7. 페이지 refetch → 카드 상태 "수락" 배지 + 녹색 banner `"배정이 확정되었습니다. 일정에 자동 등록되었습니다."` + `/me/calendar` 링크
8. 운영자에게 `notifications` 1건 + 콘솔 로그
9. 1시간 카운트다운 표시 → 1시간 경과 후 "응답 확정" final lock 표시

### 6.2 conditional 응답 — 시간/조건 제약

1. 강사가 "조건부" 버튼 클릭 → `<Textarea>` 활성화
2. 강사 입력 `"5/3은 가능, 5/4는 18시 이후만 가능합니다."` (10자 ≥ 5자 zod 통과)
3. 저장 → `instructor_responses.status = 'conditional'` + `conditional_note` 저장 + 운영자 `notifications` `type = 'assignment_declined'`(body에 "[조건부] ..." 접두사)
4. 강사 카드는 "조건부 응답" 배지 표시, 1시간 윈도 카운트다운
5. 운영자는 `/notifications`에서 메시지 확인 후 negotiate → 새 배정 요청 발송 또는 다른 강사 추천

### 6.3 거절 → 재추천 흐름 (운영자 측)

1. 강사 "거절" 버튼 → `instructor_responses.status = 'declined'`
2. 운영자 `notifications` `type = 'assignment_declined'` 수신
3. 운영자가 `/projects/[id]`에서 "추천 다시 실행" → SPEC-PROJECT-001 §2.6 재추천 경로 (본 SPEC 외)

### 6.4 1시간 윈도 — 응답 변경

1. 강사가 처음 "수락" 클릭 → `responded_at = T0`
2. T0 + 30분: 강사가 일정 충돌 발견 → "응답 변경" 버튼 클릭 → 패널 재오픈
3. "거절" 선택 → `instructor_responses` UPDATE (UNIQUE 제약으로 동일 row 갱신) + 운영자 `notifications` 새 row INSERT (`assignment_declined`)
4. 운영자는 가장 최근 응답을 신뢰 (notifications.created_at 기준)
5. T0 + 1h 경과: 강사 UI에 "응답 확정" 표시, 변경 시도 시 한국어 에러

### 6.5 사전 가용성 문의 — 수락 흐름

1. 운영자가 SPEC-PROPOSAL-001 흐름으로 강사에게 사전 문의 발송 → `proposal_inquiries` row + `notifications` `type = 'assignment_request'`(또는 SPEC-PROPOSAL-001이 정의한 별도 type)
2. 강사가 `/me/inquiries` → 카드 1건 (제목 + 시간대 + 기술스택 + 운영자 메모)
3. 강사 "수락" 클릭 → `proposal_inquiries.status = 'accepted'` + `instructor_responses` UPSERT + 운영자 `notifications` `type = 'inquiry_accepted'`
4. **schedule_items 미생성** (제안 미수주 단계)
5. 운영자가 추후 수주 성공 시 SPEC-PROJECT-001 §2.6 추천 → §2.7 정식 배정 요청 발송 → 본 SPEC §6.1 흐름 반복

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 마이그레이션 머지: `instructor_responses` 테이블 + 5개 enum value 추가 정합
- ✅ `/me/inquiries`, `/me/assignments` 진입 → 강사 본인 row만 표시
- ✅ 수락(배정) → 6종 부수효과 단일 트랜잭션 PASS
- ✅ 수락(사전 문의) → schedule_items 미생성 + `proposal_inquiries.status = 'accepted'`
- ✅ 거절 → 운영자 알림 + 콘솔 로그
- ✅ 조건부 → `conditional_note` 5자 미만 reject + 운영자 알림 body에 `[조건부]` 접두사
- ✅ 1시간 윈도: 윈도 내 변경 OK / 윈도 외 reject 한국어 에러
- ✅ Idempotency: 더블 클릭 / 네트워크 retry 시 단일 row만 존재
- ✅ RLS: instructor B가 instructor A의 row 접근 → 0 행 / permission denied
- ✅ schedule_items EXCLUSION 충돌 → 트랜잭션 롤백 + 응답 미저장 + 한국어 안내
- ✅ 콘솔 로그 5개 type 모두 정확한 포맷 출력
- ✅ 단위 테스트 ≥ 85% 라인 커버리지
- ✅ axe DevTools 2 페이지 critical 0건
- ✅ 한국어 + KST 일관성

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| SPEC-PROPOSAL-001 미머지 상태에서 본 SPEC 진행 | `/me/inquiries` 빌드 차단 | M-1/M-2를 배정/문의로 분리. 배정만 먼저 출시 가능 (plan.md 마일스톤 분리) |
| `notification_type` enum value 추가 마이그레이션이 동시 실행되는 다른 PR과 충돌 | enum ordering 미보장 | `ADD VALUE IF NOT EXISTS` 사용 + 같은 prefix(`20260429000011`)로 timeline 분리 |
| schedule_items EXCLUSION 제약으로 수락 트랜잭션 자주 롤백 | 강사 UX 저하 | (i) 트랜잭션 실패 시 한국어 안내 정확히 표시, (ii) 강사가 미리 `/me/calendar`에서 unavailable 등록 권장 가이드 표시, (iii) 추후 conditional 응답으로 negotiate |
| 1시간 윈도 클라이언트 timezone drift | 윈도 boundary 부정확 | DB 측 `now() - responded_at <= INTERVAL '1 hour'` enforcement (서버 단 timestamp만 신뢰), 클라이언트 카운트다운은 단순 표시용 |
| 더블 클릭 / 네트워크 retry로 동일 응답 중복 INSERT | 알림 중복 / 데이터 부정합 | UNIQUE `(source_kind, source_id, instructor_id)` + `ON CONFLICT DO UPDATE` UPSERT 패턴, idempotency 단위 테스트 필수 |
| operator user 삭제 시 notifications.recipient_id 무효 | 응답 트랜잭션 fail | REQ-CONFIRM-NOTIFY-005: notification skip + console.warn, 응답 transaction은 commit |
| RLS policy 누락으로 instructor B가 instructor A의 row 접근 | 개인정보 유출 | 마이그레이션에 RLS policy 명시적 작성 + 통합 테스트에서 cross-instructor query 차단 검증 |
| `proposal_inquiries` 스키마가 SPEC-PROPOSAL-001과 미일치 | 본 SPEC 빌드 깨짐 | M-1 시점에 SPEC-PROPOSAL-001과 sync. column 시그니처 변경 시 본 SPEC `getMyInquiries` query 같이 수정 |
| `assignment_conditional` 별도 enum 부재로 운영자 UX 모호 | 응답 의도 구분 어려움 | body 텍스트에 `[조건부]` 접두사 + body에 conditional_note 본문 전달, SPEC-NOTIF-RULES-001로 별도 enum 분리 위임 |
| 운영자가 동일 프로젝트에 다른 강사 재배정 시 강사 A의 응답 stale | 강사 UX 혼란 | `respondToAssignment` 액션에 `projects.instructor_id = self` 사전 검증 추가 + 한국어 에러 `"이미 다른 강사에게 재배정된 프로젝트입니다."` |
| schedule_items 생성 시 `projects.education_start_at` null | 트랜잭션 부분 실패 | REQ-CONFIRM-EFFECTS-006: schedule 생성 skip + 비차단 경고 banner 표시, 운영자가 일정 확정 후 재처리 가능 |
| `console.log` 스텁이 production 로그를 오염 | 로그 잡음 | NODE_ENV 무관 출력 명시 (REQ-CONFIRM-NOTIFY-004), SPEC-NOTIF-001에서 adapter로 전환 시 이 라인 제거 |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: §2.1 강사 핵심 니즈 "강의 제안 수락/거절 빠른 응답", §3.1 [F-104] / [F-101], §시나리오 A 단계 4-5(강의 제안 알림 → 수락 → 일정 자동 등록)
- `.moai/project/structure.md`: `(instructor)/me/*` 라우트 그룹, `src/lib/`, `src/db/queries/`, `src/components/instructor/`
- `.moai/project/tech.md`: ADR-002 Supabase RLS, ADR-005 이메일 스텁 정책, ADR-006 FullCalendar
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole('instructor')`, `getCurrentUser()`, `<AppShell userRole>`, silent redirect
- `.moai/specs/SPEC-DB-001/spec.md`: `notifications` 테이블 + `notification_type` enum, `schedule_items` + EXCLUSION 제약, RLS 패턴
- `.moai/specs/SPEC-ME-001/spec.md`: `/me/*` 라우트 그룹, instructor 사이드바, `ensureInstructorRow` 패턴
- `.moai/specs/SPEC-PROJECT-001/spec.md`: §2.7 REQ-PROJECT-ASSIGN-004 "deferred to SPEC-INSTRUCTOR-CONFIRM-XXX" 본 SPEC이 수임, §3 Exclusions "강사 confirm 흐름 → SPEC-INSTRUCTOR-CONFIRM-XXX"
- `.moai/specs/SPEC-PROPOSAL-001/spec.md` (sibling parallel): `proposal_inquiries` 테이블 스키마, 운영자 사전 문의 발송 흐름
- [`plan.md`](./plan.md): 마일스톤 M1-M6 분해 + 우선순위 라벨
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 8개+
- [`spec-compact.md`](./spec-compact.md): REQ + GWT 요약본
- 외부 (verified 2026-04-29):
  - https://supabase.com/docs/guides/database/postgres/row-level-security
  - https://orm.drizzle.team/docs/transactions
  - https://www.postgresql.org/docs/16/sql-altertype.html (ADD VALUE IF NOT EXISTS)
  - https://www.w3.org/WAI/WCAG21/quickref/

---

_End of SPEC-CONFIRM-001 spec.md_
