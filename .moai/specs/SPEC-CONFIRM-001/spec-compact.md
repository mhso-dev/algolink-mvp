---
spec_id: SPEC-CONFIRM-001
version: 0.1.0
created: 2026-04-29
updated: 2026-04-29
author: 철
---

# SPEC-CONFIRM-001 Compact (강사 응답 시스템)

SPEC-PROJECT-001 §2.7이 deferred한 "강사 confirm 흐름"을 정식 SPEC으로 승격. SPEC-PROPOSAL-001과 sibling 관계. 두 source(`proposal_inquiry`, `assignment_request`)를 단일 `instructor_responses` 모델로 통합 응답.

## REQ 요약 (7 모듈)

### REQ-CONFIRM-RESPONSES — 통합 응답 모델
- **001 (Ubiquitous)**: `instructor_responses` 테이블 정의 (id, source_kind, source_id, instructor_id, status, conditional_note, responded_at, created_at, updated_at) + UNIQUE (source_kind, source_id, instructor_id)
- **002**: 인덱스 (instructor_id, status), (source_kind, source_id)
- **003**: state-machine 모듈 + `validateStatusTransition` (pending → accepted/declined/conditional, 1시간 윈도 내 전환)
- **004 (Unwanted)**: conditional_note 5자 미만 시 reject + 한국어 에러
- **005**: RLS policy `instructor_responses_self_only` (instructor → instructors.user_id = auth.uid())
- **006 (Event)**: BEFORE UPDATE trigger `updated_at = now()`
- **007**: 도메인 모듈 IO-free 순수 함수

### REQ-CONFIRM-INQUIRIES — `/me/inquiries`
- **001**: server component 라우트 + `requireRole('instructor')` + proposal_inquiries LEFT JOIN instructor_responses
- **002**: 카드 컬럼 — 제목, 일정, 기술스택, 운영자 메모, 응답 상태/시각
- **003 (Event)**: ResponsePanel 클릭 → `respondToInquiry` Server Action
- **004 (State)**: pending 시 3 버튼 enabled, 비-pending 시 "응답 변경" 버튼
- **005 (Optional)**: URL filter `?status=pending` 등
- **006 (Unwanted)**: 다른 instructor row 접근 시 `notFound()` 한국어 메시지

### REQ-CONFIRM-ASSIGNMENTS — `/me/assignments`
- **001**: server component + projects + clients + ai_recommendations + 최근 notifications + instructor_responses LEFT JOIN
- **002**: 카드 컬럼 — 프로젝트, 클라이언트, 일정, 사업비, 추천 rank
- **003 (Event)**: `respondToAssignment` Server Action
- **004 (State)**: 수락 시 녹색 banner + `/me/calendar` 링크
- **005 (Unwanted)**: instructor_id 재배정 시 reject 한국어 에러
- **006 (Optional)**: `?include=history` 토글로 final-locked rows 조회

### REQ-CONFIRM-EFFECTS — 수락 부수효과
- **001 (Event)**: assignment 수락 시 6종 부수효과 (UPSERT response + UPDATE projects status='assignment_confirmed' + INSERT schedule_items 'system_lecture' + INSERT notifications 'assignment_accepted' + console.log) 단일 트랜잭션
- **002 (Event)**: inquiry 수락 시 (UPSERT response + UPDATE proposal_inquiries.status='accepted' + INSERT notifications 'inquiry_accepted' + console.log) — schedule_items 미생성
- **003 (Event)**: declined/conditional 시 projects 미변경, 운영자 알림만 INSERT
- **004**: 순수 함수 `computeAssignmentAcceptanceEffects`, `computeInquiryAcceptanceEffects`
- **005 (Unwanted)**: schedule_items EXCLUSION 충돌 시 트랜잭션 롤백 + 한국어 에러
- **006 (State)**: education_start_at null 시 schedule skip + 비차단 경고 banner
- **007 (Optional)**: SPEC-PAYOUT-002 lecture_sessions 도입 시 refactor

### REQ-CONFIRM-NOTIFY — 운영자 알림 + 이메일 스텁
- **001**: 5 신규 enum value 마이그레이션 (`assignment_accepted/declined`, `inquiry_accepted/declined/conditional`)
- **002**: source × status → notification_type 매핑 6 케이스 (assignment_conditional → assignment_declined, body에 `[조건부]` 접두사)
- **003 (Event)**: notifications INSERT 트랜잭션 동참 (recipient_id, type, title, body 한국어, link_url)
- **004 (Event)**: console.log `[notif] <type> → operator_id=<uuid> source_id=<uuid>` (NODE_ENV 무관)
- **005 (Unwanted)**: operator user 삭제 시 notification skip + console.warn + 응답 commit
- **006 (Optional)**: SPEC-NOTIF-001 adapter 도입 시 console.log 자리 대체

### REQ-CONFIRM-RESPONSE-WINDOW — 1시간 변경 윈도 + idempotency
- **001**: `CHANGE_WINDOW_HOURS = 1`, `isWithinChangeWindow(respondedAt, now?)` 순수 함수
- **002 (State)**: 1시간 경과 시 final lock + UI "응답 확정" 배지
- **003 (Unwanted)**: 윈도 외 변경 시도 시 reject 한국어 에러
- **004 (Event)**: 윈도 내 변경 시 row UPDATE + 새 notification INSERT (이전 알림은 audit 보존)
- **005**: UNIQUE 제약으로 더블 클릭 idempotent
- **006 (Optional)**: live countdown UI (mm:ss)

### REQ-CONFIRM-RLS — instructor self-only 격리
- **001**: SPEC-AUTH-001 `requireRole('instructor')` layout guard 활용
- **002**: instructor_responses RLS instructor self-only (defense in depth)
- **003 (Unwanted)**: 다른 instructor 접근 시 0행 / permission denied → 한국어 에러
- **004**: service-role 미사용 (user-scoped client만)
- **005 (Optional)**: admin override는 SPEC-ADMIN-001로 위임

---

## Given/When/Then 핵심 시나리오 (8개+)

### 시나리오 1 — 사전 문의 inbox 표시
- **Given**: 운영자 O가 강사 A에게 사전 문의(pi1) 발송 + instructor_responses row 0개
- **When**: 강사 A가 `/me/inquiries` 진입
- **Then**: 카드 1건 (제목 + 일정 KST + 기술스택 + 운영자 메모 + ResponsePanel 3 버튼 enabled), `?status=pending` 기본 적용

### 시나리오 2 — 사전 문의 수락 (schedule 미생성)
- **Given**: 시나리오 1 상태
- **When**: 강사 A "수락" 클릭 → `respondToInquiry({ inquiryId, status: 'accepted' })`
- **Then**: 단일 트랜잭션에서 `instructor_responses` INSERT + `proposal_inquiries.status='accepted'` + `notifications inquiry_accepted` INSERT + console.log + **schedule_items 0건** + 1시간 카운트다운

### 시나리오 3 — 정식 배정 거절
- **Given**: 운영자 O가 강사 A에게 배정 요청 발송 (project p1, status='assignment_review')
- **When**: 강사 A "거절" 클릭
- **Then**: `instructor_responses status='declined'` + `projects` 미변경 + `notifications assignment_declined` + console.log + 운영자 재추천 가능

### 시나리오 4 — 조건부 응답 (note 검증)
- **Given**: 시나리오 1 상태
- **When (4a)**: "조건부" + note 2자 ("OK") 입력
- **Then (4a)**: zod fail → reject "조건부 응답에는 5자 이상의 메모를 입력해주세요." + DB 변경 0건
- **When (4b)**: note 28자 입력 ("5/3은 가능, 5/4는 18시 이후만 가능합니다.")
- **Then (4b)**: `status='conditional'` + `notifications inquiry_conditional` body `[조건부] ...` 접두사 + console.log

### 시나리오 5 — 정식 배정 수락 (schedule 자동 생성)
- **Given**: project p1 (assignment_review, education_start_at + end_at 정상)
- **When**: 강사 A "수락" 클릭
- **Then**: 단일 트랜잭션 6 작업 — `instructor_responses` UPSERT + `projects status='assignment_confirmed'` + `schedule_items` 'system_lecture' INSERT + `notifications assignment_accepted` + console.log + 녹색 banner

### 시나리오 6 — 1시간 변경 윈도 boundary
- **Given (6a)**: 수락 후 T0+30분
- **When (6a)**: 강사 "응답 변경" → "거절"
- **Then (6a)**: `instructor_responses` UPDATE + 새 `notifications assignment_declined`
- **Given (6b)**: T0+1h+1분
- **When (6b)**: stale tab에서 변경 시도
- **Then (6b)**: DB UPSERT WHERE 절 미일치 → 0 rows + reject "응답 변경 가능 시간이 지났습니다."

### 시나리오 7 — RLS 격리
- **Given**: 강사 A의 response row 'r1', 강사 B 로그인
- **When (7a)**: 강사 B SELECT r1
- **Then (7a)**: RLS → 0 rows
- **When (7b)**: 강사 B `respondToAssignment` 강사 A 프로젝트 ID로 호출
- **Then (7b)**: 0 rows / permission denied → reject "본인 응답만 수정할 수 있습니다."

### 시나리오 8 — 더블 클릭 idempotency
- **Given**: 강사 A pending
- **When**: "수락" 버튼 빠른 2회 클릭
- **Then**: UNIQUE 제약 + ON CONFLICT DO UPDATE → `instructor_responses` row 1개만 존재 + 응답 상태 일관

### 시나리오 9 — schedule EXCLUSION 충돌
- **Given**: 강사 A에 unavailable 일정 + 운영자 배정 요청 시간 overlap
- **When**: 강사 A "수락"
- **Then**: 트랜잭션 롤백 (schedule INSERT 실패) + 응답 미저장 + 한국어 에러

### 시나리오 10 — education_start_at null
- **Given**: project (start/end null)
- **When**: 강사 "수락"
- **Then**: response + projects + notifications commit, **schedule skip** + 노란 경고 banner

### 시나리오 11 — instructor 재배정 후 stale 응답
- **Given**: 강사 A 배정 → 운영자가 강사 B로 재배정 → 강사 A stale 카드
- **When**: 강사 A "수락"
- **Then**: pre-check fail → reject "이미 다른 강사에게 재배정된 프로젝트입니다."

### 시나리오 12 — operator 삭제 시 notification skip
- **Given**: operator 삭제 후 강사 응답
- **When**: 강사 "거절"
- **Then**: response commit + notifications INSERT skip + console.warn

### 시나리오 13 — 한국어 + KST
- 모든 라벨/배지/에러 한국어, UTC 표시 0건

### 시나리오 14 — 접근성
- axe critical 0, Lighthouse a11y ≥ 95, 키보드 only 동작

### 시나리오 15 — 콘솔 로그 5개 type
- `[notif] {assignment_accepted|assignment_declined|inquiry_accepted|inquiry_declined|inquiry_conditional} → operator_id=<uuid> source_id=<uuid>` 정확 포맷

---

## Affected Files (요약)

### 신규 마이그레이션
- `supabase/migrations/20260429000010_instructor_responses.sql` — 테이블 + 인덱스 + RLS + trigger
- `supabase/migrations/20260429000011_notification_types_confirm.sql` — 5개 enum value

### 신규 도메인 모듈 (`src/lib/responses/`)
- `types.ts`, `state-machine.ts`, `side-effects.ts`, `notification-mapping.ts`, `errors.ts`, `index.ts`

### 신규 Server Actions + 페이지
- `src/app/(app)/(instructor)/me/inquiries/{page,loading,actions}.tsx|.ts`
- `src/app/(app)/(instructor)/me/assignments/{page,loading,actions}.tsx|.ts`

### 신규 DB Query
- `src/db/queries/responses/{responses,inquiries,assignments}.ts`

### 신규 UI 컴포넌트
- `src/components/instructor/{response-panel,inquiry-card,assignment-card,response-history-badge}.tsx`

### 사이드바 placeholder
- `src/components/app/sidebar.tsx` (instructor 메뉴 2종 추가)

### 신규 테스트
- `tests/unit/responses/{state-machine,side-effects,notification-mapping}.test.ts`
- `tests/integration/responses-flow.test.ts`

### 변경 없음 (재사용)
- SPEC-PROJECT-001 산출물 (`(operator)/projects/[id]/assign/actions.ts` 등)
- SPEC-DB-001 테이블 (notifications, schedule_items, projects)
- SPEC-AUTH-001 (requireRole, getCurrentUser)
- SPEC-ME-001 라우트 그룹

---

## Exclusions (5+ 항목)

1. **실제 이메일 발송** — Resend/SES 어댑터 → SPEC-NOTIF-001
2. **외부 캘린더 동기화** — Google/iCal/ICS export → 운영 단계
3. **응답 분석 대시보드** — 응답률/시간 통계 → SPEC-ANALYTICS-XXX
4. **AI 자동 응답 추천** — Claude 기반 자동 제안 → 검토 후 결정
5. **다강사 팀 응답** — 한 프로젝트 N강사 공동 응답 → 영구 제외 (1:1 유지)
6. **운영자 측 N시간 미응답 escalation** → SPEC-NOTIF-RULES-001
7. **admin force-reset / 응답 무효화** → SPEC-ADMIN-001
8. **양방향 conditional 협상 메시지 스레드** → 검토 후 결정
9. **응답 변경 audit history 테이블** → 운영 단계
10. **모바일 push 알림** → SPEC-NOTIF-001 후속
11. **다국어** → 영구 제외 (한국어 단일)
12. **broadcast inquiry (강사 N명 동시 발송)** → 검토 후 결정
13. **컬럼 모델 (source 테이블 직접 확장)** → §5.1에서 통합 테이블 채택, 영구 제외
14. **`assignment_conditional` 별도 enum** → §5.4에서 `assignment_declined`로 매핑, SPEC-NOTIF-RULES-001 위임
15. **모바일 전용 응답 UX** → 검토 후 결정

---

## 의존성

- **선행 (완료)**: SPEC-AUTH-001, SPEC-DB-001, SPEC-ME-001, SPEC-PROJECT-001
- **Sibling parallel**: SPEC-PROPOSAL-001 (`proposal_inquiries` 테이블 정의)
- **후속 (검토)**: SPEC-NOTIF-001 (이메일 어댑터), SPEC-NOTIF-RULES-001 (자동 escalation), SPEC-PAYOUT-002 (lecture_sessions refactor), SPEC-ADMIN-001 (admin override)

---

_End of SPEC-CONFIRM-001 spec-compact.md_
