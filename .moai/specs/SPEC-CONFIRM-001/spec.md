---
id: SPEC-CONFIRM-001
version: 0.2.1
status: completed
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: medium
issue_number: 16
---

# SPEC-CONFIRM-001: 강사 응답 시스템 (Instructor Response System — Inquiries / Assignments)

## HISTORY

- **2026-04-29 (v0.2.1)**: 구현 완료. M1~M7 + AMEND-001 통합. SPEC-PROJECT-AMEND-001 v0.1.1을 동일 PR `feature/SPEC-CONFIRM-001`에서 함께 머지하여 `ALLOWED_TRANSITIONS.assignment_confirmed`에 backward edge `'assignment_review'` 추가. 따라서 §HIGH-2 "documented bypass path" 표현은 **AMEND-001 통합으로 직접 `validateTransition` 정식 통과**로 reinterpret되며, `__bypassValidateTransitionForResponseDowngrade` 함수는 코드베이스에 작성되지 않았다 (시나리오 B 채택). REQ-CONFIRM-EFFECTS-008 reverse compensation 트랜잭션은 정식 backward edge 경로로 동작. §4.8 "변경 없음" 항목을 변경 1건으로 정정 — `src/lib/projects/status-machine.ts` ALLOWED_TRANSITIONS 확장은 SPEC-PROJECT-AMEND-001 산출물이지만 본 SPEC implementation과 동일 PR 처리. M1 trigger 이름은 `set_updated_at_instructor_responses`(spec) → `trg_instructor_responses_updated_at`(LESSON-001 convention) 으로 마이그레이션 적용 — REQ-CONFIRM-RESPONSES-006 동작은 동일. notifications 테이블의 컬럼명은 spec.md `recipient_user_id` → 본 프로젝트 schema convention `recipient_id`로 매핑되어 적용. proposal_inquiries 테이블은 SPEC-PROPOSAL-001(P4) 미머지 시점이므로 stub 정의로 본 SPEC M1 마이그레이션 내 임시 생성 (FK 제약 + RLS + UPDATE trigger 모두 스펙대로 작성, SPEC-PROPOSAL-001 머지 시 정식 정의가 본 stub을 대체). 회귀: typecheck PASS, build PASS, db:verify 32/32 PASS, 단위/통합 56 신규 테스트 모두 PASS.
- **2026-04-29 (v0.2.0)**: plan-auditor FAIL 결정에 대응한 8건 결함(HIGH 3 / MEDIUM 3 / LOW 2) 수정. (1) **HIGH-1 polymorphic FK 정합**: `instructor_responses.source_id` 단일 컬럼 모델을 폐기하고 `project_id uuid REFERENCES projects(id) ON DELETE CASCADE` + `proposal_inquiry_id uuid REFERENCES proposal_inquiries(id) ON DELETE CASCADE` 두 nullable FK + `CHECK XOR` 제약 + 두 partial UNIQUE 인덱스(per-source idempotency)로 전환. orphan 응답 위험 제거, Drizzle/PostgREST/Supabase 도구 호환성 확보; (2) **HIGH-2 Accept→Decline 보상 트랜잭션**: 1시간 윈도 내 accepted → declined/conditional 전환 시 `projects.status` reset + `projects.instructor_id` clear + 직전 accept이 INSERT한 `schedule_items` 하드 삭제를 단일 트랜잭션으로 수행하는 REQ-CONFIRM-EFFECTS-008 신설. SPEC-PROJECT-001 `validateTransition` 그래프에 `assignment_confirmed → assignment_review` 역방향 전환이 부재하므로 후속 SPEC-PROJECT-AMEND-001로 보완 위임 + 본 SPEC은 명시적 bypass 경로 + `console.warn` 감사 로그로 처리; (3) **HIGH-3 notification idempotency**: `notifications` 테이블에 `source_kind text`, `source_id uuid` 컬럼 추가 + `UNIQUE (recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL` partial UNIQUE 인덱스로 ON CONFLICT DO NOTHING 시 정확히 1행 보장 (REQ-CONFIRM-NOTIFY-002 갱신, 시나리오 8 "1개 또는 2개" → "정확히 1개"); (4) **MEDIUM-4 validateTransition 호출**: REQ-CONFIRM-EFFECTS-001/003/008 모두 raw UPDATE 직전에 `validateTransition` 호출 의무화, WHERE 절은 TOCTOU concurrency guard로 제한; (5) **MEDIUM-5 pending 상태 제거**: `instructor_responses.status` enum을 `{accepted, declined, conditional}`로 축소, DEFAULT 제거, "pending" 표면은 row 부재로만 표시 (REQ-CONFIRM-RESPONSES-001/003/004 갱신); (6) **MEDIUM-6 acceptance 누락 보강**: REQ-CONFIRM-RESPONSES-002 (인덱스 EXPLAIN), REQ-CONFIRM-RESPONSES-006 (BEFORE UPDATE trigger), REQ-CONFIRM-INQUIRIES-005 (URL filter multi-select), REQ-CONFIRM-INQUIRIES-006 (notFound URL tampering), REQ-CONFIRM-ASSIGNMENTS-006 (?include=history toggle) 5건 시나리오 신설; (7) **LOW-7**: §1.3 / §4.7 "5×4 매핑 테이블" 표기를 "6 매핑 케이스"(2 source_kind × 3 non-pending status)로 정정; (8) **LOW-8**: REQ-CONFIRM-NOTIFY-003 `body` truncation 200자 → 1000자로 확장 (운영자 conditional_note 손실 최소화).
- **2026-04-29 (v0.1.0)**: 초기 작성. SPEC-PROJECT-001(완료, 2026-04-28 머지)이 §2.7 REQ-PROJECT-ASSIGN에서 placeholder로 deferred한 "SPEC-INSTRUCTOR-CONFIRM-XXX"를 본 SPEC이 정식으로 수임한다. (1) `instructor_responses` 통합 응답 모델 — `source_kind` ∈ `{proposal_inquiry, assignment_request}` discriminator로 (a) SPEC-PROPOSAL-001(병렬 작성)이 발생시키는 사전 가용성 문의와 (b) SPEC-PROJECT-001 `assignInstructor` Server Action이 생성한 `notifications` 배정 요청을 강사 측에서 단일 모델로 통합 응답; (2) 강사 워크스페이스(SPEC-ME-001 `/me/*`) 산하 두 라우트 `/me/inquiries`(사전 문의) + `/me/assignments`(정식 배정 요청) — 각 페이지는 pending/accepted/declined/conditional 4-state 응답 패널 + `conditional_note` 텍스트 필드(conditional 시 필수); (3) Acceptance side-effects — 배정 요청 수락 시 `projects.instructor_id = self`, 상태 `assignment_review → assignment_confirmed` 전환, `lecture_sessions`(SPEC-PAYOUT-002 향후) 또는 SPEC-DB-001 `schedule_items`로 자동 INSERT(`schedule_kind = 'system_lecture'`); 사전 문의 수락 시는 `proposal_inquiries.status = 'accepted'`만 표기하고 `schedule_items` 생성은 보류; (4) Notification + email-stub — 신규 `notification_type` enum 5개(`assignment_accepted`, `assignment_declined`, `inquiry_accepted`, `inquiry_declined`, `inquiry_conditional`)를 마이그레이션으로 추가, 응답 발생 시 운영자에게 in-app `notifications` row 1건 INSERT + 콘솔 로그 `[notif] <type> → operator_id=<uuid> source_id=<uuid>`(ADR-005 이메일 스텁 기조 유지); (5) 1시간 변경 윈도 — `responded_at + 1h` 이내에만 응답 변경 가능, 이후 final lock(운영자 force-reset은 admin only로 본 SPEC 외부); (6) RLS — instructor self-only SELECT/UPDATE, instructor B의 row 노출 0; (7) Idempotency — 더블 클릭/네트워크 재시도 시 동일 status 재INSERT 금지, transactional UPSERT 사용. SPEC-PROJECT-001 `runRecommendationAction`/`assignInstructor` 흐름은 그대로 보존, 본 SPEC은 그 이후 강사가 응답하는 후행 단계. SPEC-PROPOSAL-001과는 sibling parallel 관계로 `proposal_inquiries` 테이블 스키마는 SPEC-PROPOSAL-001이 정의하고 본 SPEC은 그 row를 read+UPDATE만 수행. 실제 이메일 발송, 외부 캘린더 연동, 응답 분석 대시보드, AI 자동 응답, 다강사 팀 응답은 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

알고링크 PM이 직접 설명한 비즈니스 프로세스의 핵심 통점인 **"강사 입장에서 다음 일정 관리가 구두로만 이뤄져 어려움"** 을 시스템 측 단일 응답 흐름으로 해소한다. 본 SPEC의 산출물은 (a) SPEC-PROJECT-001 §2.7이 deferred한 강사 confirm 흐름을 수임하는 `instructor_responses` 통합 응답 모델 — `source_kind` discriminator + 두 명시적 nullable FK(`project_id`, `proposal_inquiry_id`) + `CHECK XOR` + per-source partial UNIQUE 인덱스로 referential integrity 강제, (b) `/me/inquiries`(SPEC-PROPOSAL-001 사전 가용성 문의 응답) + `/me/assignments`(SPEC-PROJECT-001 정식 배정 요청 응답) 두 단일-시스템 라우트, (c) 3-state 응답 라이프사이클(`accepted | declined | conditional`; "pending"은 row 부재로 표현) + `conditional_note` 자유 입력 + 1시간 변경 윈도 + 윈도 내 status 다운그레이드 시 보상 트랜잭션, (d) 수락 시 자동 부수효과(배정 요청은 `validateTransition` 통과 후 `projects.instructor_id` 갱신 + 상태 전환 + `schedule_items` 자동 INSERT, 사전 문의는 `proposal_inquiries.status` 표기만), (e) 5종 신규 `notification_type`(`assignment_accepted/declined`, `inquiry_accepted/declined/conditional`) + `notifications` 테이블에 `source_kind`/`source_id` 컬럼 + partial UNIQUE 인덱스로 정확히 1행 보장 + ADR-005 이메일 스텁 콘솔 로그, (f) instructor self-only RLS 보장 + 트랜잭션 idempotency, (g) 한국어 UI + Asia/Seoul + WCAG 2.1 AA 일관 적용이다.

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
  - `20260429000010_instructor_responses.sql` — `instructor_responses` 테이블 신설 (id uuid PK, source_kind text CHECK IN ('proposal_inquiry','assignment_request'), `project_id uuid REFERENCES projects(id) ON DELETE CASCADE` (nullable), `proposal_inquiry_id uuid REFERENCES proposal_inquiries(id) ON DELETE CASCADE` (nullable), instructor_id uuid FK, status text CHECK IN ('accepted','declined','conditional') (NOT NULL, NO DEFAULT), conditional_note text nullable, responded_at timestamptz nullable, created_at timestamptz default now(), updated_at timestamptz default now()) + `CHECK XOR` 제약(source_kind ↔ FK 컬럼 일관) + 인덱스 `(instructor_id, status)` + 두 partial UNIQUE 인덱스(`(project_id, instructor_id) WHERE project_id IS NOT NULL` / `(proposal_inquiry_id, instructor_id) WHERE proposal_inquiry_id IS NOT NULL`) + RLS policy (instructor self-only) + UPDATE trigger `updated_at = now()`
  - `20260429000011_notification_types_confirm.sql` — `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_accepted'`, `'assignment_declined'`, `'inquiry_accepted'`, `'inquiry_declined'`, `'inquiry_conditional'` (5 신규 enum 값)
  - `20260429000012_notifications_idempotency.sql` — `notifications` 테이블에 `source_kind text NULL` + `source_id uuid NULL` 컬럼 추가 + `CREATE UNIQUE INDEX idx_notifications_idempotency ON notifications (recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL` partial UNIQUE 인덱스로 동시 응답 retry 시 정확히 1행 보장 (HIGH-3 fix)
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
  - `state-machine.test.ts` — null → accepted/declined/conditional 전환 + 윈도 내 양방향 전환, 1시간 윈도 boundary (REQ-CONFIRM-RESPONSES-003 갱신)
  - `side-effects.test.ts` — 배정 수락 시 schedule_items 생성 케이스, 사전 문의는 schedule 생성 안 함, accept→decline downgrade 보상 효과 (computeAcceptDowngradeEffects 등)
  - `notification-mapping.test.ts` — 6 매핑 케이스(2 source_kind × 3 status) 전체 커버 (LOW-7 정정)
- 통합 테스트 (`tests/integration/`):
  - `responses-flow.test.ts` — 운영자가 배정 요청 → 강사 수락 → schedule_items + notifications + project status 전환 검증 + accept→decline 보상 트랜잭션 + idempotency 정확히-1행 검증
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
- ✅ `instructor_responses` 마이그레이션 정합: `pnpm db:migrate` PASS, RLS 정책 instructor self-only 검증 통과, `CHECK XOR (project_id, proposal_inquiry_id)` 제약 검증 통과(violating row INSERT 시 23514 에러), 두 partial UNIQUE 인덱스 동작 검증
- ✅ `notification_type` enum 5개 신규 값 추가: 마이그레이션 후 `SELECT enum_range(NULL::notification_type)` 결과에 5개 포함
- ✅ `notifications` 테이블 idempotency 마이그레이션 정합: `source_kind`, `source_id` 컬럼 존재 + `idx_notifications_idempotency` partial UNIQUE 인덱스 존재, 동일 (`recipient_user_id`, `source_kind`, `source_id`, `type`) 조합으로 동시 INSERT 시 정확히 1행만 commit (HIGH-3)
- ✅ `instructor_responses.status` enum: `{accepted, declined, conditional}` 3개 값만 허용, 'pending' INSERT 시도 시 CHECK 위반 (MEDIUM-5)
- ✅ `/me/inquiries` 페이지 렌더링: 강사가 받은 사전 문의 미응답(row 부재) 목록 정확히 표시, 응답 패널 키보드 네비게이션 동작
- ✅ `/me/assignments` 페이지 렌더링: 강사가 받은 정식 배정 요청 미응답 목록 정확히 표시, 응답 패널 동작
- ✅ 수락 부수효과 (배정): Server Action이 `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: self })` 통과를 사전 검증 후 `instructor_responses` UPSERT + `projects.instructor_id` UPDATE + `projects.status = 'assignment_confirmed'` + `schedule_items` 1건 이상 INSERT(`schedule_kind = 'system_lecture'`) + `notifications` 1건 INSERT(`type = 'assignment_accepted'`, `recipient_user_id = operator_user_id`, `source_kind = 'assignment_request'`, `source_id = project_id`) 모두 단일 트랜잭션 내 실행 (MEDIUM-4)
- ✅ 수락 부수효과 (사전 문의): `instructor_responses` UPSERT + `proposal_inquiries.status = 'accepted'` + `notifications` 1건 INSERT(`type = 'inquiry_accepted'`, `source_kind = 'proposal_inquiry'`, `source_id = inquiry_id`) — `schedule_items` 미생성
- ✅ 거절 부수효과: `instructor_responses` status='declined' + 운영자 notifications INSERT(`type = 'assignment_declined' | 'inquiry_declined'`) + 콘솔 로그
- ✅ Conditional 부수효과: status='conditional' + `conditional_note` 5자 이상 zod 검증 + 운영자 notifications INSERT(`type = 'inquiry_conditional'` 또는 `assignment_*` — 매핑은 §5.4) + 콘솔 로그
- ✅ 1시간 변경 윈도: `responded_at + 1h` 이내 응답 변경 가능, 1시간 경과 후 UI는 응답을 final lock 표시 + 변경 시도 시 한국어 에러 `"응답 변경 가능 시간이 지났습니다."`
- ✅ Accept→Decline 보상 트랜잭션 (HIGH-2): 윈도 내 accepted → declined/conditional 전환 시 `validateTransition` 호출(또는 documented bypass) → `projects.status` reset → `projects.instructor_id` clear → 직전 accept이 INSERT한 `schedule_items` 행 하드 삭제 → `instructor_responses.status` UPDATE 새 상태 → 새 `notifications` row INSERT 모두 단일 트랜잭션
- ✅ Idempotency (응답): 동일 (`source_kind`, source FK, `instructor_id`) 조합으로 더블 클릭 시 partial UNIQUE 인덱스 충돌 → ON CONFLICT DO UPDATE → `instructor_responses` 단일 row만 존재
- ✅ Idempotency (알림 — HIGH-3): 동일 응답 재시도 시 partial UNIQUE 인덱스 `idx_notifications_idempotency` 충돌 → ON CONFLICT DO NOTHING → `notifications` 중복 INSERT 0건, 정확히 1행만 존재
- ✅ RLS 격리: instructor B 토큰으로 instructor A의 `instructor_responses` row SELECT 시 0행 반환, UPDATE 시 RLS deny
- ✅ 콘솔 로그 포맷: `[notif] assignment_accepted → operator_id=<uuid> source_id=<uuid>` 정확히 출력 (5개 type 모두)
- ✅ 단위 테스트: state-machine, side-effects, notification-mapping 모두 PASS, 라인 커버리지 ≥ 85%
- ✅ 통합 테스트: 운영자 배정 → 강사 수락 → 부수효과 시나리오 + 보상 트랜잭션 + idempotency 시나리오 모두 PASS
- ✅ Asia/Seoul 표시: 모든 timestamp(요청 시각, 응답 시각, 변경 윈도 카운트다운) KST 형식 일관 적용
- ✅ 한국어 UI: 라벨/버튼/에러/toast 모두 한국어, 영문 평문 노출 0건
- ✅ axe DevTools: `/me/inquiries`, `/me/assignments` critical 0건, serious 0건
- ✅ Lighthouse Accessibility ≥ 95

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `RESPONSES`, `INQUIRIES`, `ASSIGNMENTS`, `EFFECTS`, `NOTIFY`, `RESPONSE-WINDOW`, `RLS`.

### 2.1 REQ-CONFIRM-RESPONSES — 통합 응답 모델 + 라이프사이클

**REQ-CONFIRM-RESPONSES-001 (Ubiquitous) — HIGH-1 + MEDIUM-5 fix**
The system **shall** define a unified `instructor_responses` table with columns:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `source_kind text NOT NULL CHECK (source_kind IN ('proposal_inquiry', 'assignment_request'))`
- `project_id uuid NULL REFERENCES projects(id) ON DELETE CASCADE` (set when `source_kind = 'assignment_request'`)
- `proposal_inquiry_id uuid NULL REFERENCES proposal_inquiries(id) ON DELETE CASCADE` (set when `source_kind = 'proposal_inquiry'`)
- `instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE`
- `status text NOT NULL CHECK (status IN ('accepted', 'declined', 'conditional'))` — no DEFAULT; "pending" surface is represented by absence of a row
- `conditional_note text`
- `responded_at timestamptz NOT NULL DEFAULT now()` — every persisted row represents an active response
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`

The table **shall** carry a `CHECK` constraint named `instructor_responses_source_xor` enforcing exactly one of `(project_id, proposal_inquiry_id)` is non-null and matches `source_kind`:
```sql
CHECK (
  (source_kind = 'assignment_request' AND project_id IS NOT NULL AND proposal_inquiry_id IS NULL) OR
  (source_kind = 'proposal_inquiry'   AND project_id IS NULL     AND proposal_inquiry_id IS NOT NULL)
)
```

Idempotency **shall** be enforced via two partial UNIQUE indexes (one per source kind):
```sql
CREATE UNIQUE INDEX uniq_instructor_responses_assignment
  ON instructor_responses (project_id, instructor_id)
  WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_instructor_responses_inquiry
  ON instructor_responses (proposal_inquiry_id, instructor_id)
  WHERE proposal_inquiry_id IS NOT NULL;
```

**Rationale (HIGH-1)**: A single `source_id uuid` column without an FK leaves the table open to orphan rows when the referenced project or proposal_inquiry is deleted. Two explicit nullable FKs + XOR CHECK + partial UNIQUE indexes give Drizzle, PostgREST, and Supabase tooling first-class FK introspection while preserving the polymorphic discriminator. **Rationale (MEDIUM-5)**: A "pending" enum value is dead state — no acceptance scenario or REQ inserts a row with status='pending'. The pending surface is just "no row exists yet"; removing the value tightens the state machine.

**REQ-CONFIRM-RESPONSES-002 (Ubiquitous)**
The system **shall** create the index `idx_instructor_responses_by_instructor (instructor_id, status)` to support `/me/inquiries` and `/me/assignments` inbox queries (instructor + status filter). Per-source lookups are served by the two partial UNIQUE indexes defined in REQ-CONFIRM-RESPONSES-001 and require no additional non-unique index. `EXPLAIN ANALYZE` of `/me/assignments` and `/me/inquiries` server query plans **shall** show usage of the appropriate index (verified in M6 integration test, scenario 16 — see acceptance.md).

**REQ-CONFIRM-RESPONSES-003 (Ubiquitous) — MEDIUM-5 fix**
The system **shall** implement a state machine via `src/lib/responses/state-machine.ts` exporting `validateStatusTransition(from: ResponseStatus | null, to: ResponseStatus): { ok: true } | { ok: false; reason: string }`. Allowed transitions:
- `null → accepted | declined | conditional` (first response; "pending" = null)
- `accepted ↔ declined`, `accepted ↔ conditional`, `declined ↔ conditional` — only when the change window (REQ-CONFIRM-RESPONSE-WINDOW) is open
- transitions outside this set return `{ ok: false, reason }` with a Korean message

**REQ-CONFIRM-RESPONSES-004 (Unwanted Behavior)**
**If** a response is submitted with `status = 'conditional'` and `conditional_note` is missing, empty, or shorter than 5 characters, **then** the Server Action **shall** reject the request with the Korean message `"조건부 응답에는 5자 이상의 메모를 입력해주세요."` and **shall not** persist any row.

**REQ-CONFIRM-RESPONSES-005 (Ubiquitous)**
The `instructor_responses` table **shall** be created with RLS enabled and a policy `instructor_responses_self_only` that allows `SELECT`, `INSERT`, `UPDATE`, `DELETE` only when `auth.uid() IN (SELECT user_id FROM instructors WHERE id = instructor_responses.instructor_id)`; all other roles **shall** receive zero rows on `SELECT` and permission-denied on writes. (DELETE is included to allow the boundary CASCADE in REQ-CONFIRM-EFFECTS-008 reverse-compensation to operate without RLS bypass.)

**REQ-CONFIRM-RESPONSES-006 (Event-Driven)**
**When** an `instructor_responses` row is updated, the database **shall** automatically set `updated_at = now()` via a `BEFORE UPDATE` trigger named `set_updated_at_instructor_responses`; the application code **shall not** manage `updated_at` directly. The trigger fires on every UPDATE statement and is verified via the acceptance scenario "trigger fires on UPDATE" (see acceptance.md scenario 17).

**REQ-CONFIRM-RESPONSES-007 (Ubiquitous)**
The system **shall** provide a typed domain module `src/lib/responses/index.ts` exporting `ResponseSourceKind`, `ResponseStatus` (`'accepted' | 'declined' | 'conditional'`), `InstructorResponse`, and pure functions for state transition validation; the module **shall not** depend on Drizzle, Supabase, or React.

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

### 2.4 REQ-CONFIRM-EFFECTS — 수락 부수효과 + 보상 트랜잭션

**REQ-CONFIRM-EFFECTS-001 (Event-Driven) — MEDIUM-4 fix**
**When** an instructor responds to an `assignment_request` with `status = 'accepted'`, the Server Action **shall** first call SPEC-PROJECT-001 `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: self })` and abort with the returned Korean reason if `{ ok: false }` is received (example: `"강사를 배정해야 컨펌 단계로 이동할 수 있습니다."` — though `instructorId = self` should always satisfy this). Only on `{ ok: true }` **shall** the action execute within a single PostgreSQL transaction: (a) UPSERT into `instructor_responses` (status='accepted', responded_at = now(), `project_id = $projectId`, `proposal_inquiry_id = NULL`); (b) UPDATE `projects SET instructor_id = self, status = 'assignment_confirmed', updated_at = now() WHERE id = $projectId AND status = 'assignment_review'` — the WHERE clause acts as a TOCTOU concurrency guard, **not** as a substitute for `validateTransition`; (c) INSERT one or more `schedule_items` rows with `schedule_kind = 'system_lecture'`, `instructor_id = self`, `project_id = $projectId`, `starts_at = projects.education_start_at`, `ends_at = projects.education_end_at`; (d) INSERT one `notifications` row addressed to `projects.operator_id` with `type = 'assignment_accepted'`, `source_kind = 'assignment_request'`, `source_id = $projectId` to engage the partial UNIQUE idempotency index (REQ-CONFIRM-NOTIFY-002).

**REQ-CONFIRM-EFFECTS-002 (Event-Driven)**
**When** an instructor responds to a `proposal_inquiry` with `status = 'accepted'`, the system **shall** execute within a single transaction: (a) UPSERT into `instructor_responses` (status='accepted', `proposal_inquiry_id = $inquiryId`, `project_id = NULL`); (b) UPDATE `proposal_inquiries SET status = 'accepted'` (column owned by SPEC-PROPOSAL-001); (c) INSERT one `notifications` row addressed to the operator who initiated the inquiry with `type = 'inquiry_accepted'`, `source_kind = 'proposal_inquiry'`, `source_id = $inquiryId`. The system **shall NOT** create any `schedule_items` rows because the proposal is not yet won. The transaction **shall NOT** require a `validateTransition` call because the proposal_inquiries lifecycle is owned by SPEC-PROPOSAL-001 and operates outside the SPEC-PROJECT-001 13-stage enum.

**REQ-CONFIRM-EFFECTS-003 (Event-Driven) — MEDIUM-4 fix**
**When** the response status is `declined` or `conditional` for either source kind **and** no prior `instructor_responses` row exists for `(source FK, instructor_id)` (first-response decline/conditional), the system **shall** UPSERT `instructor_responses` and INSERT a single `notifications` row addressed to the operator with the corresponding type from §2.5 mapping table. The system **shall NOT** modify `projects.instructor_id`, `projects.status`, or `proposal_inquiries.status`. (The case where a prior `accepted` row exists and is downgraded to `declined`/`conditional` is governed by REQ-CONFIRM-EFFECTS-008 and requires reverse-compensation.)

**REQ-CONFIRM-EFFECTS-004 (Ubiquitous)**
The pure-function module `src/lib/responses/side-effects.ts` **shall** export `computeAssignmentAcceptanceEffects(project: ProjectSnapshot): { scheduleItems: ScheduleItemDraft[]; nextStatus: ProjectStatus }` and `computeInquiryAcceptanceEffects(inquiry: InquirySnapshot): { inquiryStatus: 'accepted' }`; both functions **shall** be free of IO and **shall** be unit-tested.

**REQ-CONFIRM-EFFECTS-005 (Unwanted Behavior)**
**If** the transaction fails at any step (e.g., `schedule_items` INSERT violates EXCLUSION constraint due to overlap with another `system_lecture`), **then** the entire transaction **shall** roll back; the user **shall** see a Korean error toast describing the conflict (e.g., `"이미 등록된 강의 일정과 겹쳐 자동 등록에 실패했습니다. 운영자에게 문의해주세요."`) and the response **shall not** be recorded.

**REQ-CONFIRM-EFFECTS-006 (State-Driven)**
**While** the project's `education_start_at` or `education_end_at` is null at the time of acceptance, the system **shall** still record the response and transition the project status, but **shall** skip `schedule_items` creation and **shall** display a non-blocking warning banner `"강의 시작/종료일이 미정이어서 일정 등록이 보류되었습니다."`.

**REQ-CONFIRM-EFFECTS-007 (Optional Feature)**
**Where** SPEC-PAYOUT-002 introduces a `lecture_sessions` table for finer-grained per-session scheduling, the side-effect logic **shall** be refactored to derive `schedule_items` from `lecture_sessions`; until then, the M-1 acceptance flow uses `projects.education_start_at` / `education_end_at` as the single session window.

**REQ-CONFIRM-EFFECTS-008 (Event-Driven) — HIGH-2 + MEDIUM-4 fix**
**When** an instructor changes their response on an `assignment_request` from `accepted` to `declined` or `conditional` within the 1-hour change window (REQ-CONFIRM-RESPONSE-WINDOW-002), the Server Action **shall** execute the following compensating side-effects within a single PostgreSQL transaction (atomic, all-or-nothing):

1. UPDATE `instructor_responses` SET `status = $newStatus`, `conditional_note = $note (if conditional, else NULL)`, `responded_at = now()` WHERE the row's `(project_id, instructor_id)` matches.
2. Reset `projects` row: UPDATE `projects SET instructor_id = NULL, status = 'assignment_review', updated_at = now() WHERE id = $projectId AND status = 'assignment_confirmed'`. The WHERE clause acts as a TOCTOU concurrency guard.
3. Hard-DELETE the `schedule_items` rows that were inserted by the prior accept: DELETE FROM `schedule_items WHERE project_id = $projectId AND instructor_id = self AND schedule_kind = 'system_lecture'`.
4. INSERT a new `notifications` row reflecting the new status (per §2.5 mapping), with `source_kind = 'assignment_request'`, `source_id = $projectId`, exercising the partial UNIQUE idempotency index (REQ-CONFIRM-NOTIFY-002).
5. Emit a `console.warn` audit line `[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>` regardless of NODE_ENV.

The Server Action **shall** also call `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` BEFORE executing step 2. If `validateTransition` returns `{ ok: false }` (the current SPEC-PROJECT-001 ALLOWED_TRANSITIONS graph **does not** include the `assignment_confirmed → assignment_review` reverse edge — see Risk table §8), the Server Action **shall** invoke a **documented bypass path** named `__bypassValidateTransitionForResponseDowngrade` exported from `src/lib/projects/status-machine.ts` (added by SPEC-PROJECT-AMEND-001 follow-up; if not yet present, the implementation MUST stub the bypass with a `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up: backward transition not yet supported in ALLOWED_TRANSITIONS graph` annotation). The bypass write **shall** still trigger SPEC-DB-001's `project_status_history` trigger so the reverse transition is recorded for audit.

For `proposal_inquiry` source kind, the analogous downgrade path **shall** UPDATE `instructor_responses.status` and `proposal_inquiries.status = 'pending'` (revert to the SPEC-PROPOSAL-001 default) within the same transaction; no `schedule_items` rows exist for proposal inquiries (REQ-CONFIRM-EFFECTS-002), so the DELETE step is a no-op.

**Cross-reference**: SPEC-PROJECT-001 `validateTransition` **must** be amended to allow `assignment_confirmed → assignment_review` to fully eliminate the bypass; this is tracked under SPEC-PROJECT-AMEND-001 follow-up (see §8 Risks).

### 2.5 REQ-CONFIRM-NOTIFY — 운영자 알림 + 이메일 스텁

**REQ-CONFIRM-NOTIFY-001 (Ubiquitous)**
The system **shall** introduce 5 new `notification_type` enum values via migration `20260429000011_notification_types_confirm.sql` using `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '<value>'` for each of: `assignment_accepted`, `assignment_declined`, `inquiry_accepted`, `inquiry_declined`, `inquiry_conditional`.

**REQ-CONFIRM-NOTIFY-002 (Ubiquitous) — HIGH-3 fix**
The mapping from `(source_kind, status)` to `notification_type` **shall** be defined in `src/lib/responses/notification-mapping.ts` as 6 cases (2 source_kind × 3 non-pending status):

| `source_kind` | `status` | `notification_type` |
|---------------|----------|---------------------|
| `assignment_request` | `accepted` | `assignment_accepted` |
| `assignment_request` | `declined` | `assignment_declined` |
| `assignment_request` | `conditional` | `assignment_declined` |
| `proposal_inquiry` | `accepted` | `inquiry_accepted` |
| `proposal_inquiry` | `declined` | `inquiry_declined` |
| `proposal_inquiry` | `conditional` | `inquiry_conditional` |

(Note: assignment conditional maps to `assignment_declined` because operator must re-issue request; SPEC-NOTIF-RULES-001 future work may add a dedicated `assignment_conditional` enum value.)

To make duplicate-prevention provable from schema (HIGH-3), migration `20260429000012_notifications_idempotency.sql` **shall** add columns `source_kind text NULL` and `source_id uuid NULL` to the existing `notifications` table and create a partial UNIQUE index:
```sql
ALTER TABLE notifications
  ADD COLUMN source_kind text NULL,
  ADD COLUMN source_id uuid NULL;
CREATE UNIQUE INDEX idx_notifications_idempotency
  ON notifications (recipient_user_id, source_kind, source_id, type)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;
```

The columns are nullable so existing `notifications` rows from SPEC-PROJECT-001 (e.g., `assignment_request` notifications dispatched before this migration) are not affected. The partial UNIQUE index activates only when both `source_kind` and `source_id` are populated by SPEC-CONFIRM-001 INSERTs (REQ-CONFIRM-NOTIFY-003).

**REQ-CONFIRM-NOTIFY-003 (Event-Driven) — HIGH-3 + LOW-8 fix**
**When** any response is recorded, the system **shall** INSERT one `notifications` row in the same transaction as the response using the `ON CONFLICT (recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL DO NOTHING` clause, with the following column values:
- `recipient_user_id = operator_user_id` (resolved via `projects.operator_id → users.id` for assignments or `proposal_inquiries.created_by_user_id` for inquiries)
- `type = mapResponseToNotificationType(sourceKind, status)`
- `source_kind = sourceKind` (`'assignment_request'` or `'proposal_inquiry'`)
- `source_id = projectId` for assignments, `inquiryId` for inquiries
- `title` = Korean templated string (e.g., `"강사 응답: {프로젝트명} 수락"`)
- `body` = Korean detail including instructor name and full `conditional_note` truncated to **1000자** (raised from 200자 per LOW-8 to minimize operator-visible information loss for long conditional notes); truncation indicated with trailing `…(생략)` when applied
- `link_url = '/projects/<id>'` for assignments or `/proposals/<id>` for inquiries

The `ON CONFLICT DO NOTHING` clause with the partial UNIQUE index from REQ-CONFIRM-NOTIFY-002 ensures concurrent retries (double-submit, network re-deliver) result in **exactly one** notification row per `(recipient_user_id, source_kind, source_id, type)` tuple — replacing the previous "1개 또는 2개 허용" behavior.

**REQ-CONFIRM-NOTIFY-004 (Event-Driven)**
**When** a notification is INSERTed, the system **shall** also emit a console-log line in the format `[notif] <notification_type> → operator_id=<uuid> source_id=<uuid>` to stdout via `console.log`, preserving ADR-005's email-stub boundary; the log line **shall** appear regardless of NODE_ENV. The console log fires **even when** the INSERT is a no-op due to ON CONFLICT (so retries are still observable in logs), with an additional `[notif:dedup]` marker on no-op rows.

**REQ-CONFIRM-NOTIFY-005 (Unwanted Behavior)**
**If** the operator user record is deleted or `recipient_user_id` cannot be resolved, **then** the notification INSERT **shall** be skipped (not raise) and a `console.warn` line **shall** be emitted; the response transaction **shall** still commit so the instructor's choice is not lost.

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

**REQ-CONFIRM-RESPONSE-WINDOW-005 (Ubiquitous) — HIGH-1 + HIGH-3 fix**
The system **shall** ensure idempotency on Server Action re-invocation at TWO layers: (1) `instructor_responses` is deduplicated by the two partial UNIQUE indexes on `(project_id, instructor_id) WHERE project_id IS NOT NULL` and `(proposal_inquiry_id, instructor_id) WHERE proposal_inquiry_id IS NOT NULL` (REQ-CONFIRM-RESPONSES-001); and (2) `notifications` is deduplicated by `idx_notifications_idempotency` on `(recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL` (REQ-CONFIRM-NOTIFY-002). Double-clicks, network retries, or concurrent submissions from multiple tabs **shall** result in **exactly one** `instructor_responses` row and **exactly one** `notifications` row per `(source, instructor, type)` tuple — no "1 or 2" outcomes.

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
  - `CREATE TABLE instructor_responses` — 컬럼 10종 (id, source_kind, project_id, proposal_inquiry_id, instructor_id, status, conditional_note, responded_at, created_at, updated_at) + 두 nullable FK + `CHECK instructor_responses_source_xor` + `CHECK status IN ('accepted','declined','conditional')` (no DEFAULT)
  - 두 partial UNIQUE 인덱스: `uniq_instructor_responses_assignment (project_id, instructor_id) WHERE project_id IS NOT NULL` + `uniq_instructor_responses_inquiry (proposal_inquiry_id, instructor_id) WHERE proposal_inquiry_id IS NOT NULL`
  - 일반 인덱스: `idx_instructor_responses_by_instructor (instructor_id, status)`
  - `ALTER TABLE instructor_responses ENABLE ROW LEVEL SECURITY`
  - `CREATE POLICY instructor_responses_self_only` (SELECT/INSERT/UPDATE/DELETE)
  - `CREATE TRIGGER set_updated_at_instructor_responses` (BEFORE UPDATE)
- `supabase/migrations/20260429000011_notification_types_confirm.sql`
  - `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_accepted'`
  - (4 추가 enum value, 동일 패턴)
- `supabase/migrations/20260429000012_notifications_idempotency.sql` — HIGH-3 fix
  - `ALTER TABLE notifications ADD COLUMN source_kind text NULL, ADD COLUMN source_id uuid NULL`
  - `CREATE UNIQUE INDEX idx_notifications_idempotency ON notifications (recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL`

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

- `tests/unit/responses/state-machine.test.ts` — 3-state 전환 매트릭스(null+3상태) + 1시간 윈도 boundary (MEDIUM-5 후 'pending' 제거)
- `tests/unit/responses/side-effects.test.ts` — 배정 수락 schedule 생성 / 사전 문의 수락은 schedule 미생성 / accept→downgrade 보상(schedule_items 산출) (HIGH-2)
- `tests/unit/responses/notification-mapping.test.ts` — 6 매핑 케이스(2 × 3) 전체 커버 (LOW-7)
- `tests/integration/responses-flow.test.ts` — 통합 시나리오:
  1. 운영자 배정 → 강사 수락 → 부수효과 검증 (schedule_items + notifications + project status)
  2. 강사 거절 (first response) → operator notif + projects 미변경
  3. conditional note 5자 미만 reject
  4. 윈도 내 accept → decline downgrade → 보상 트랜잭션 (projects.status reset, schedule_items 삭제, notif 신규 INSERT) — REQ-CONFIRM-EFFECTS-008
  5. 윈도 외 변경 시도 reject
  6. 강사 B의 강사 A row 접근 RLS 0행
  7. schedule_items EXCLUSION 충돌 → 트랜잭션 롤백
  8. 더블 클릭 idempotency → instructor_responses 정확히 1행 + notifications 정확히 1행 (HIGH-3)
  9. notifications partial UNIQUE index 동시 INSERT 정확히-1 검증
  10. CHECK XOR 위반 INSERT 시도 → 23514 (HIGH-1)
  11. project_id CASCADE → instructor_responses CASCADE 삭제 검증 (HIGH-1)
  12. proposal_inquiry_id CASCADE 동일 검증 (HIGH-1)
  13. BEFORE UPDATE trigger updated_at 갱신 (REQ-RESPONSES-006, MEDIUM-6)
  14. EXPLAIN ANALYZE on /me/inquiries query uses idx_instructor_responses_by_instructor (REQ-RESPONSES-002, MEDIUM-6)

### 4.8 변경 (참고)

- SPEC-PROJECT-001 산출물 (`src/app/(app)/(operator)/projects/[id]/assign/actions.ts` 등) — 0 변경
- SPEC-PROJECT-001 status-machine — **1 변경**: `src/lib/projects/status-machine.ts` `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` backward edge 추가 (SPEC-PROJECT-AMEND-001 v0.1.1 통합 적용). 함수 본문 + 다른 키 변경 0건. **이 변경은 SPEC-PROJECT-AMEND-001 산출물이지만 본 SPEC implementation과 동일 PR 처리** (게이트 5.3 사용자 결정).
- SPEC-DB-001 산출물 (`projects`, `notifications`, `schedule_items` 테이블) — 0 변경 (enum 5개 추가 + notifications 2 컬럼 추가만)
- SPEC-AUTH-001 산출물 (`requireRole`, `getCurrentUser`) — 0 변경, 그대로 사용
- SPEC-ME-001 산출물 (`/me/*` 라우트 그룹, instructor 사이드바) — `src/lib/nav.ts` instructorNav에 "응답" 섹션(2건: 배정 요청 + 사전 문의) 추가

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

### 5.2 source 매핑 + 조회 전략 (HIGH-1 fix)

`/me/inquiries` 페이지 데이터 흐름 (proposal_inquiry_id FK 사용):

```
1. requireRole('instructor') → getCurrentUser() → instructorId
2. SELECT pi.*, ir.status, ir.responded_at, ir.conditional_note
   FROM proposal_inquiries pi
   LEFT JOIN instructor_responses ir
     ON ir.proposal_inquiry_id = pi.id
    AND ir.instructor_id = $instructorId
   WHERE pi.instructor_id = $instructorId
   ORDER BY pi.created_at DESC
3. 클라이언트 측 필터: ?status=accepted,declined 등 (REQ-CONFIRM-INQUIRIES-005)
   "미응답"은 ir.status IS NULL로 표현
```

`/me/assignments` 페이지 데이터 흐름 (project_id FK 사용):

```
1. requireRole('instructor') → instructorId
2. SELECT p.*, c.company_name, n.created_at AS request_created_at,
          air.top3_jsonb, ir.status, ir.responded_at, ir.conditional_note
   FROM projects p
   JOIN clients c ON c.id = p.client_id
   LEFT JOIN LATERAL (
     SELECT created_at FROM notifications
     WHERE recipient_user_id = $userId AND type = 'assignment_request'
       AND source_id = p.id
     ORDER BY created_at DESC LIMIT 1
   ) n ON true
   LEFT JOIN ai_instructor_recommendations air
     ON air.project_id = p.id
   LEFT JOIN instructor_responses ir
     ON ir.project_id = p.id
    AND ir.instructor_id = $instructorId
   WHERE p.instructor_id = $instructorId
     AND p.status IN ('assignment_review', 'assignment_confirmed')
   ORDER BY n.created_at DESC NULLS LAST
```

LATERAL JOIN now uses `notifications.source_id = p.id` directly (cleaner than the previous `link_url LIKE` parsing) thanks to the new `source_id` column added by migration `20260429000012_*`.

### 5.3 트랜잭션 + idempotency (HIGH-1 + HIGH-3 fix)

`respondToAssignment` Server Action 핵심 SQL (Drizzle `db.transaction`):

```sql
BEGIN;
  -- 0. (Server Action precondition) call validateTransition('assignment_review', 'assignment_confirmed', { instructorId: self })
  --    abort if { ok: false }. (MEDIUM-4)

  -- 1. UPSERT response — partial UNIQUE on (project_id, instructor_id) WHERE project_id IS NOT NULL
  INSERT INTO instructor_responses (
    source_kind, project_id, proposal_inquiry_id, instructor_id, status, conditional_note, responded_at
  ) VALUES ('assignment_request', $projectId, NULL, $instructorId, $status, $note, now())
  ON CONFLICT (project_id, instructor_id) WHERE project_id IS NOT NULL
  DO UPDATE SET
    status = EXCLUDED.status,
    conditional_note = EXCLUDED.conditional_note,
    responded_at = now()
  WHERE (now() - instructor_responses.responded_at) <= INTERVAL '1 hour'  -- within window
  RETURNING (xmax = 0) AS inserted, *;  -- inserted=true on first INSERT, false on UPDATE path

  -- 2a. (accepted only) UPDATE projects (concurrency guard via WHERE), INSERT schedule_items
  -- 2b. (downgrade accept→decline/conditional within window) → REQ-CONFIRM-EFFECTS-008 path:
  --     UPDATE projects SET instructor_id=NULL, status='assignment_review' (validateTransition + bypass)
  --     DELETE FROM schedule_items WHERE project_id=$projectId AND instructor_id=self AND schedule_kind='system_lecture'
  -- 2c. (decline/conditional first response) Skip project update

  -- 3. INSERT operator notification — partial UNIQUE on (recipient_user_id, source_kind, source_id, type)
  INSERT INTO notifications (recipient_user_id, type, source_kind, source_id, title, body, link_url)
  VALUES ($operatorUserId, $notificationType, 'assignment_request', $projectId, $title, $body, $linkUrl)
  ON CONFLICT (recipient_user_id, source_kind, source_id, type)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL
  DO NOTHING;
  -- (HIGH-3) ON CONFLICT DO NOTHING ensures concurrent retries produce exactly 1 notification row

COMMIT;
```

WHERE 절의 `(now() - responded_at) <= INTERVAL '1 hour'`이 1시간 윈도 enforcement를 DB 차원에서 보장한다(클라이언트 timestamp 신뢰 X). 'pending' 상태가 제거되었으므로 이전의 `responded_at IS NULL OR within 1h` 분기는 `within 1h` 단일 조건으로 단순화된다 (응답 row 부재 = INSERT 경로, 응답 row 존재 = UPDATE 경로 조건부).

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
| **SPEC-PROJECT-001 ALLOWED_TRANSITIONS 그래프에 `assignment_confirmed → assignment_review` 역방향 엣지 부재** (HIGH-2 cross-reference) — **해결됨 (v0.2.1, 2026-04-29)** | (이전: accept→decline 1시간 윈도 보상 트랜잭션이 bypass 함수 필요) | **SPEC-PROJECT-AMEND-001 v0.1.1**이 동일 PR `feature/SPEC-CONFIRM-001`에서 함께 머지되어 `ALLOWED_TRANSITIONS.assignment_confirmed`에 `'assignment_review'` backward edge 추가됨. REQ-CONFIRM-EFFECTS-008 reverse compensation은 정식 `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출로 `{ ok: true }` 받아 정상 동작. `__bypassValidateTransitionForResponseDowngrade` 함수는 코드베이스에 작성되지 않음 (시나리오 B). `console.warn` 감사 라인은 bypass와 독립적으로 유지 (`[response:downgrade] ...`) |
| **HIGH-1 fix가 SPEC-PROPOSAL-001 머지 시점에 `proposal_inquiry_id` FK 대상 테이블 부재** | M1 마이그레이션 `REFERENCES proposal_inquiries(id)` 실행 실패 | M1을 SPEC-PROPOSAL-001 머지 후로 순서 의존. SPEC-PROPOSAL-001이 `proposal_inquiries(id)` PK 컬럼을 정확히 동일 이름으로 정의하는지 plan.md M1 게이트에서 검증. SPEC-PROPOSAL-001이 충분히 지연되면 본 SPEC M4(`/me/assignments`만 단독 출시)는 `proposal_inquiry_id` 컬럼을 NULL로 둔 채 schema는 정의하되 FK 제약은 별도 후속 마이그레이션으로 분리하는 옵션 검토 |
| **HIGH-3 fix가 기존 `notifications` 행에 `source_kind`/`source_id` 컬럼 NULL** | partial UNIQUE 인덱스 `WHERE source_kind IS NOT NULL` 절로 자동 우회 | 기존 SPEC-PROJECT-001 `assignment_request` notif 행은 `source_kind=NULL`이므로 인덱스 진입 안 함. 본 SPEC INSERT만 partial UNIQUE 활성. 회귀 0건. SPEC-NOTIF-001 후속에서 backfill 검토 |

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
