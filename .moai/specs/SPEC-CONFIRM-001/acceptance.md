---
spec_id: SPEC-CONFIRM-001
version: 0.2.0
created: 2026-04-29
updated: 2026-04-29
author: 철
---

# Acceptance: SPEC-CONFIRM-001 Given/When/Then 시나리오

## HISTORY

- **2026-04-29 (v0.2.0)**: plan-auditor FAIL 결정에 따른 재정의. (1) 시나리오 1 — `instructor_responses` row 부재로 "미응답" 표현 (MEDIUM-5); (2) 시나리오 2/3/5 — `source_id` → `project_id` / `proposal_inquiry_id` FK 컬럼 사용 (HIGH-1); (3) 시나리오 6a 재작성 — accept→decline 1시간 윈도 다운그레이드 시 보상 트랜잭션 실행(projects reset + schedule_items DELETE + 신규 notif INSERT) — REQ-CONFIRM-EFFECTS-008 (HIGH-2); (4) 시나리오 8 단언 — "1개 또는 2개" → "정확히 1개" (HIGH-3); (5) 시나리오 16~20 신규 — REQ-CONFIRM-RESPONSES-002(인덱스 EXPLAIN), REQ-CONFIRM-RESPONSES-006(BEFORE UPDATE trigger), REQ-CONFIRM-INQUIRIES-005(URL multi-select filter), REQ-CONFIRM-INQUIRIES-006(notFound URL tampering), REQ-CONFIRM-ASSIGNMENTS-006(?include=history toggle) 매핑 (MEDIUM-6); (6) 시나리오 4 — body 200자 → 1000자 truncation 명시 (LOW-8); (7) 시나리오 21 신규 — CHECK XOR 위반 / FK CASCADE / partial UNIQUE 직접 검증 (HIGH-1).
- **2026-04-29 (v0.1.0)**: 초기 작성.

본 문서는 SPEC-CONFIRM-001의 수용 기준을 Given/When/Then 형식으로 명세한다. 각 시나리오는 통합 테스트 또는 수동 검증의 진입점이며, plan.md M6 통합 테스트의 단위 시나리오로 매핑된다.

## 1. 핵심 시나리오 (정상 흐름)

### 시나리오 1 — 강사가 사전 가용성 문의 inbox에서 미응답 항목을 확인

**REQ 매핑**: REQ-CONFIRM-INQUIRIES-001, REQ-CONFIRM-INQUIRIES-002, REQ-CONFIRM-RLS-001, REQ-CONFIRM-RESPONSES-001 (MEDIUM-5)

**Given**:
- 강사 A(`instructor_id = ia`)가 `auth.uid() = ua`로 로그인된 상태
- SPEC-PROPOSAL-001 흐름으로 운영자 O가 강사 A에게 사전 문의 1건 발송
  - `proposal_inquiries (id = pi1, instructor_id = ia, requested_start = '2026-05-10 09:00 KST', requested_end = '2026-05-10 18:00 KST', skill_stack = ['React 18'], operator_memo = '5월 중순 가능 여부 확인 부탁드립니다.', created_by_user_id = uo, status = 'pending')`
- 강사 A의 `instructor_responses` row는 **아직 없음** (응답 미수행 = row 부재)

**When**:
- 강사 A가 `/me/inquiries`에 진입

**Then**:
- 페이지에 카드 1건 표시
  - 제목 = pi1 source 문서 제목
  - 요청 일정 범위 = `2026-05-10 09:00 KST ~ 2026-05-10 18:00 KST`
  - 기술스택 태그 = `[React 18]`
  - 운영자 메모 = `"5월 중순 가능 여부 확인 부탁드립니다."`
  - 응답 상태 배지 = `"미응답"` (이는 `instructor_responses` row 부재로 표현; `status` 컬럼에 'pending' 값은 존재하지 않음, MEDIUM-5)
  - ResponsePanel의 3 버튼(수락/거절/조건부) 모두 enabled
- URL filter 기본값 = "미응답"(row가 없는 inquiry만, REQ-CONFIRM-INQUIRIES-005 default)

---

### 시나리오 2 — 강사가 사전 가용성 문의를 수락하면 운영자에게 알림이 가고 schedule은 생성되지 않음

**REQ 매핑**: REQ-CONFIRM-INQUIRIES-003, REQ-CONFIRM-EFFECTS-002, REQ-CONFIRM-NOTIFY-003, REQ-CONFIRM-NOTIFY-004

**Given**:
- 시나리오 1 상태
- `instructor_responses` row 0개 (UPSERT 대상)

**When**:
- 강사 A가 inquiry pi1의 ResponsePanel "수락" 버튼 클릭
- 확인 다이얼로그에서 "확인" 클릭
- `respondToInquiry({ inquiryId: 'pi1', status: 'accepted' })` Server Action 호출

**Then**:
- 단일 트랜잭션 내에서:
  - `instructor_responses` 1 row INSERT: `(source_kind='proposal_inquiry', project_id=NULL, proposal_inquiry_id='pi1', instructor_id='ia', status='accepted', conditional_note=null, responded_at=now())` (HIGH-1: project_id NULL, proposal_inquiry_id 채워짐, CHECK XOR 만족)
  - `proposal_inquiries.status` = `'accepted'` (pi1)
  - `notifications` 1 row INSERT: `(recipient_user_id='uo', type='inquiry_accepted', source_kind='proposal_inquiry', source_id='pi1', title='강사 응답: <문의 제목> 수락', body='강사 A님이 사전 문의를 수락하였습니다.', link_url='/proposals/<pi1_proposal_id>')` — `ON CONFLICT (recipient_user_id, source_kind, source_id, type) DO NOTHING` (HIGH-3)
  - `schedule_items` row 0건 (제안 미수주 단계이므로 미생성) — REQ-CONFIRM-EFFECTS-002 단언
- stdout에 `[notif] inquiry_accepted → operator_id=uo source_id=pi1` 출력
- 강사 UI: 카드 응답 상태 배지 = `"수락"`, 1시간 카운트다운 시작
- toast = `"응답이 저장되었습니다."`

---

### 시나리오 3 — 강사가 정식 배정 요청을 거절하면 프로젝트 풀로 환원, 운영자가 알림 받음

**REQ 매핑**: REQ-CONFIRM-ASSIGNMENTS-003, REQ-CONFIRM-EFFECTS-003, REQ-CONFIRM-NOTIFY-002 (assignment_declined)

**Given**:
- SPEC-PROJECT-001 §2.7 흐름으로 운영자 O가 강사 A에게 1-클릭 배정 발송 완료
  - `projects (id='p1', operator_id='uo', instructor_id='ia', status='assignment_review', education_start_at='2026-06-01 09:00 KST', education_end_at='2026-06-03 18:00 KST', business_amount_krw=5000000)`
  - `notifications (recipient_id='ua', type='assignment_request', source_id='p1')` 이미 INSERT됨
  - `instructor_responses` row 0개

**When**:
- 강사 A가 `/me/assignments` 진입 → assignment-card 1건 표시
- "거절" 버튼 클릭 → 확인 다이얼로그 → 확정
- `respondToAssignment({ projectId: 'p1', status: 'declined' })` 호출

**Then**:
- 단일 트랜잭션 내:
  - `instructor_responses` 1 row INSERT: `(source_kind='assignment_request', project_id='p1', proposal_inquiry_id=NULL, instructor_id='ia', status='declined', responded_at=now())` (HIGH-1: project_id 채워짐, CHECK XOR 만족)
  - `projects.instructor_id` = 변경 없음(여전히 'ia') — 운영자가 unassign 별도 처리 필요
  - `projects.status` = 변경 없음(`assignment_review` 유지)
  - `schedule_items` 0건 INSERT
  - `notifications` 1 row INSERT: `(recipient_user_id='uo', type='assignment_declined', source_kind='assignment_request', source_id='p1', title='강사 응답: <프로젝트 제목> 거절', body='강사 A님이 배정 요청을 거절하였습니다.', link_url='/projects/p1')` — `ON CONFLICT DO NOTHING` (HIGH-3)
- stdout에 `[notif] assignment_declined → operator_id=uo source_id=p1`
- 강사 UI: 응답 상태 배지 = `"거절"`, 1시간 카운트다운 시작
- 운영자가 `/notifications` 페이지에서 알림 수신 → SPEC-PROJECT-001 §2.6 추천 다시 실행 흐름으로 진입 가능 (본 SPEC 외)

---

### 시나리오 4 — 강사 조건부 응답 시 conditional_note 5자 미만이면 reject

**REQ 매핑**: REQ-CONFIRM-RESPONSES-004 (note 검증), REQ-CONFIRM-INQUIRIES-003 / REQ-CONFIRM-ASSIGNMENTS-003

**Given**:
- 시나리오 1 상태 (사전 문의 pi1, instructor A pending)

**When (4a — note 너무 짧음)**:
- 강사 A가 "조건부" 클릭 → textarea 활성화
- "OK" (2자, 5자 미만) 입력 후 저장 클릭

**Then (4a)**:
- Server Action zod 검증 fail → return `{ ok: false, reason: "조건부 응답에는 5자 이상의 메모를 입력해주세요." }`
- DB 변경 0건 (`instructor_responses`, `notifications` 모두 미INSERT)
- 강사 UI에 한국어 에러 toast 표시
- ResponsePanel 상태 유지 (textarea 값 보존)

**When (4b — 정상 입력)**:
- 강사가 "5/3은 가능, 5/4는 18시 이후만 가능합니다." (28자) 입력 후 저장

**Then (4b)**:
- 트랜잭션 내:
  - `instructor_responses` INSERT: `(source_kind='proposal_inquiry', proposal_inquiry_id='pi1', project_id=NULL, status='conditional', conditional_note='5/3은 가능, 5/4는 18시 이후만 가능합니다.', responded_at=now())` (HIGH-1)
  - `notifications` INSERT: `(recipient_user_id='uo', type='inquiry_conditional', source_kind='proposal_inquiry', source_id='pi1', body='[조건부] 강사 A님: 5/3은 가능, 5/4는 18시 이후만 가능합니다.')` (body **1000자** 한도 truncation 적용 — LOW-8: 200자 → 1000자로 확장; truncation 발생 시 끝에 `…(생략)` 추가)
- stdout `[notif] inquiry_conditional → operator_id=uo source_id=pi1`
- (배정 요청 케이스라면 type=assignment_declined, body에 `[조건부]` 접두사 — spec.md §5.4)

---

### 시나리오 5 — 강사가 정식 배정 요청을 수락하면 schedule_items가 자동 생성됨

**REQ 매핑**: REQ-CONFIRM-EFFECTS-001 (배정 수락 6종 부수효과)

**Given**:
- 시나리오 3과 동일한 초기 상태 (project p1, status=assignment_review)
- 강사 A의 `schedule_items`에 동일 시간대(2026-06-01 ~ 06-03) 충돌 없음

**When**:
- 강사 A가 `/me/assignments`에서 "수락" 클릭

**Then**:
- Server Action이 먼저 `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: 'ia' })` 호출 → `{ ok: true }` 확인 (MEDIUM-4)
- 단일 트랜잭션 내 작업 모두 완료:
  1. `instructor_responses` INSERT: `(source_kind='assignment_request', project_id='p1', proposal_inquiry_id=NULL, instructor_id='ia', status='accepted', responded_at=now())` (HIGH-1)
  2. `projects` UPDATE: `(instructor_id='ia', status='assignment_confirmed', updated_at=now())` WHERE id='p1' AND status='assignment_review' (일치 row 1개) — WHERE 절은 TOCTOU concurrency guard, validateTransition 대체 아님 (MEDIUM-4)
  3. `schedule_items` INSERT: `(instructor_id='ia', project_id='p1', schedule_kind='system_lecture', starts_at='2026-06-01 09:00 KST', ends_at='2026-06-03 18:00 KST')` 1 row
  4. `notifications` INSERT: `(recipient_user_id='uo', type='assignment_accepted', source_kind='assignment_request', source_id='p1', title='강사 응답: <프로젝트 제목> 수락', link_url='/projects/p1')` — `ON CONFLICT DO NOTHING` (HIGH-3)
  5. stdout `[notif] assignment_accepted → operator_id=uo source_id=p1`
- 강사 UI: 카드에 녹색 banner `"배정이 확정되었습니다. 일정에 자동 등록되었습니다."` + `/me/calendar` 링크
- 응답 상태 배지 = `"수락"`, 1시간 카운트다운
- `/me/calendar` 진입 시 새 이벤트 표시 (system_lecture, 파란색)

---

### 시나리오 6 — 1시간 변경 윈도 내 응답 변경 OK + 보상 트랜잭션 / 윈도 외 reject

**REQ 매핑**: REQ-CONFIRM-RESPONSE-WINDOW-001/002/003/004, REQ-CONFIRM-EFFECTS-008 (HIGH-2 fix)

**Given (6a — 윈도 내 accept→decline 보상 트랜잭션)**:
- 시나리오 5 직후 상태:
  - `instructor_responses (project_id='p1', instructor_id='ia', status='accepted', responded_at=T0)`
  - `projects (id='p1', status='assignment_confirmed', instructor_id='ia')`
  - `schedule_items (project_id='p1', instructor_id='ia', schedule_kind='system_lecture', starts_at='2026-06-01 09:00 KST', ends_at='2026-06-03 18:00 KST')` 1 row 존재
  - `notifications (type='assignment_accepted', source_id='p1')` 1 row 존재
- 현재 시각 = T0 + 30분 (윈도 내)

**When (6a)**:
- 강사 A가 일정 충돌 발견 → `/me/assignments`에서 "응답 변경" 버튼 클릭
- ResponsePanel 재오픈 → "거절" 선택 → 저장
- Server Action `respondToAssignment({ projectId: 'p1', status: 'declined' })` 호출
- Server Action이 기존 응답 조회 → status='accepted' 발견 → **downgrade 분기** 진입 (REQ-CONFIRM-EFFECTS-008)

**Then (6a — 보상 트랜잭션 단일 atomic 실행)**:
- Server Action이 `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출 → SPEC-PROJECT-001 ALLOWED_TRANSITIONS 그래프에 역방향 엣지 부재로 `{ ok: false }` 반환 → `__bypassValidateTransitionForResponseDowngrade('p1', 'assignment_review')` documented bypass 호출 + `console.warn("[transition:bypass] project_id=p1 from=assignment_confirmed to=assignment_review reason=response-downgrade")` audit 라인 출력
- 단일 트랜잭션 내:
  1. `instructor_responses` UPDATE (partial UNIQUE 동일 row): `(status='declined', conditional_note=NULL, responded_at=now())` — BEFORE UPDATE trigger가 updated_at 자동 갱신
  2. `projects` UPDATE: `(instructor_id=NULL, status='assignment_review', updated_at=now())` WHERE id='p1' AND status='assignment_confirmed' (TOCTOU concurrency guard) — `project_status_history` 트리거가 자동 기록
  3. `schedule_items` DELETE: WHERE project_id='p1' AND instructor_id='ia' AND schedule_kind='system_lecture' → 1 row 삭제 (이전 accept이 INSERT한 row)
  4. `notifications` INSERT: `(recipient_user_id='uo', type='assignment_declined', source_kind='assignment_request', source_id='p1', body='강사 A님이 응답을 변경하였습니다: 거절')` — partial UNIQUE 인덱스: 이전 accepted notif는 `type='assignment_accepted'`이므로 충돌 없음, declined는 신규 INSERT 성공
- stdout `[response:downgrade] project_id=p1 instructor_id=ia from=accepted to=declined`
- stdout `[notif] assignment_declined → operator_id=uo source_id=p1`
- 트랜잭션 commit 후 최종 상태:
  - `projects.instructor_id` = NULL
  - `projects.status` = 'assignment_review'
  - `schedule_items` 0건 (이전 row 하드 삭제)
  - `instructor_responses.status` = 'declined' (1 row)
  - `notifications` 2건: 이전 'assignment_accepted' (audit 보존) + 신규 'assignment_declined'
- 운영자 측 inbox는 가장 최근 알림(declined)을 신뢰; 이전 accepted notif는 historical
- 강사 UI: 응답 상태 배지 = "거절"

**Given (6b — 윈도 외 reject)**:
- 시나리오 5 직후 상태, 현재 시각 = T0 + 1h 1분 (윈도 만료)

**When (6b)**:
- 강사 A가 강제로 (브라우저 stale tab에서) Server Action 재호출 시도

**Then (6b)**:
- Server Action: DB UPSERT의 WHERE 절(`(now() - responded_at) <= INTERVAL '1 hour'`) 미일치 → 0 row affected
- return `{ ok: false, reason: "응답 변경 가능 시간이 지났습니다. 운영자에게 문의해주세요." }`
- DB 변경 0건 (projects, schedule_items, notifications 모두 무변경)
- UI에 한국어 에러 toast + ResponsePanel disabled 상태 + "응답 확정" 배지

---

### 시나리오 7 — RLS: 강사 B가 강사 A의 응답에 접근 시도 → 0행 / permission denied

**REQ 매핑**: REQ-CONFIRM-RLS-002, REQ-CONFIRM-RLS-003

**Given**:
- 강사 A의 `instructor_responses` row 1개 존재 (`id='r1', instructor_id='ia'`)
- 강사 B(`instructor_id='ib', auth.uid()='ub'`) 로그인 상태
- 강사 B가 r1의 UUID를 어떻게든 알고 있음 (URL tampering, DevTools 등)

**When (7a — SELECT 시도)**:
- 강사 B의 user-scoped Supabase client로 `SELECT * FROM instructor_responses WHERE id = 'r1'`

**Then (7a)**:
- RLS policy `instructor_responses_self_only` 적용 → 0 rows 반환
- 페이지에 카드 미표시
- UI: `notFound()` 또는 빈 inbox 표시

**When (7b — UPDATE 시도)**:
- 강사 B가 `respondToAssignment({ projectId: '<강사 A의 프로젝트 ID>', status: 'declined' })` 호출 시도

**Then (7b)**:
- Server Action 내부 SELECT WHERE id='ia' AND auth.uid()='ub' → 0 rows
- 또는 UPSERT INSERT 시도 시 RLS deny
- return `{ ok: false, reason: "본인 응답만 수정할 수 있습니다." }`
- DB 변경 0건

---

### 시나리오 8 — Idempotency: 더블 클릭 / 네트워크 retry 시 정확히 1 row + 정확히 1 notification

**REQ 매핑**: REQ-CONFIRM-RESPONSE-WINDOW-005, REQ-CONFIRM-NOTIFY-002, REQ-CONFIRM-NOTIFY-003 (HIGH-3 fix)

**Given**:
- 시나리오 5 초기 상태 (강사 A 응답 row 부재 = 미응답)

**When**:
- 강사 A가 "수락" 버튼을 빠르게 2회 클릭 (브라우저 debounce 우회 또는 네트워크 retry 시뮬레이션)
- 두 번째 클릭이 첫 번째 응답 도착 전에 트리거되어 두 개의 Server Action이 거의 동시에 실행됨

**Then**:
- 첫 번째 트랜잭션: `instructor_responses` INSERT 성공 (partial UNIQUE on `(project_id, instructor_id) WHERE project_id IS NOT NULL` 신규 row, HIGH-1)
- 두 번째 트랜잭션: 동일 partial UNIQUE 충돌 → `ON CONFLICT (project_id, instructor_id) WHERE project_id IS NOT NULL DO UPDATE` 경로 → 동일 status로 UPDATE (실질 변경 없음)
- 최종 `instructor_responses` rows = **정확히 1개**
- 최종 `notifications` rows = **정확히 1개** (HIGH-3 fix):
  - 첫 번째 트랜잭션: `notifications` INSERT 성공 (`recipient_user_id='uo', source_kind='assignment_request', source_id='p1', type='assignment_accepted'`)
  - 두 번째 트랜잭션: 동일 partial UNIQUE `idx_notifications_idempotency` 충돌 → `ON CONFLICT ... DO NOTHING` → 신규 row INSERT 무발생
  - stdout: 첫 번째 응답은 `[notif] assignment_accepted → ...`, 두 번째 응답은 `[notif:dedup] assignment_accepted → ...` (동일 source 재시도 audit)
- 강사 UI: 응답 상태 = "수락" 1건만 표시
- 운영자 inbox: 알림 정확히 1건 (이전 SPEC v0.1.0의 "1개 또는 2개 허용" 제거)

**보강 케이스**:
- 동일 클릭이 동일 status 재전송이면 멱등 (no-op + dedup 로그)
- 동일 클릭이 다른 status 전환이면 (e.g., 1차 "수락" 후 2차 "거절") → REQ-CONFIRM-EFFECTS-008 다운그레이드 보상 트랜잭션 (시나리오 6a 흐름)

---

## 2. 추가 시나리오 (엣지 케이스)

### 시나리오 9 — schedule_items EXCLUSION 충돌 시 트랜잭션 롤백

**REQ 매핑**: REQ-CONFIRM-EFFECTS-005

**Given**:
- 강사 A의 `schedule_items`에 이미 `(starts_at='2026-06-02 09:00', ends_at='2026-06-02 12:00', schedule_kind='unavailable')` row 존재 (강사 본인이 미리 등록한 강의 불가 일정)
- 운영자가 `projects (education_start_at='2026-06-01 09:00 KST', education_end_at='2026-06-03 18:00 KST')` 배정 요청

**When**:
- 강사 A가 "수락" 클릭

**Then**:
- 트랜잭션 내 `schedule_items` INSERT 시도 → EXCLUSION constraint 위반 (overlap) → exception
- 전체 트랜잭션 롤백
- `instructor_responses` row 미생성, `projects` 미변경, `notifications` 미INSERT
- Server Action return `{ ok: false, reason: "이미 등록된 강의 일정과 겹쳐 자동 등록에 실패했습니다. 운영자에게 문의해주세요." }`
- 강사 UI에 한국어 에러 toast
- ResponsePanel 상태 유지 (다시 시도 또는 conditional 응답 가능)

---

### 시나리오 10 — `projects.education_start_at` null인 경우 schedule_items 미생성 + 경고 banner

**REQ 매핑**: REQ-CONFIRM-EFFECTS-006

**Given**:
- `projects (id='p2', education_start_at=null, education_end_at=null, status='assignment_review')`
- 강사 A에게 배정 요청 발송됨

**When**:
- 강사 A가 "수락" 클릭

**Then**:
- 트랜잭션:
  - `instructor_responses` UPSERT 성공
  - `projects.instructor_id`, `status` UPDATE 성공
  - `schedule_items` INSERT **skip** (REQ-CONFIRM-EFFECTS-006 단언, side-effects.ts 순수 함수가 빈 배열 반환)
  - `notifications` INSERT 성공 (`assignment_accepted`)
- 강사 UI: 응답 상태 = "수락" + 노란색 비차단 경고 banner `"강의 시작/종료일이 미정이어서 일정 등록이 보류되었습니다."`
- 운영자가 추후 `projects` 일정 확정 후 별도 작업으로 schedule_items 보강 (운영자 admin UI는 본 SPEC 외)

---

### 시나리오 11 — 운영자가 강사 A 배정 후 다른 강사 B로 재배정 → 강사 A 응답 시 reject

**REQ 매핑**: REQ-CONFIRM-ASSIGNMENTS-005

**Given**:
- 처음 운영자가 강사 A에게 배정 요청 발송 (`projects.instructor_id='ia'`)
- 강사 A 응답 전, 운영자가 마음을 바꿔 강사 B에게 재배정 → `projects.instructor_id='ib'`로 UPDATE (SPEC-PROJECT-001 §2.7 REQ-PROJECT-ASSIGN-006 reassign 경로)
- 강사 A의 stale `/me/assignments` 페이지에는 여전히 카드 표시됨

**When**:
- 강사 A가 stale 카드의 "수락" 클릭

**Then**:
- Server Action `respondToAssignment` 내부 사전 검증: `SELECT instructor_id FROM projects WHERE id='p1'` → 'ib' (강사 A의 'ia'와 불일치)
- return `{ ok: false, reason: "이미 다른 강사에게 재배정된 프로젝트입니다." }`
- DB 변경 0건
- 강사 UI에 한국어 에러 toast + 자동 새로고침 안내 또는 카드 자동 제거

---

### 시나리오 12 — operator user 삭제 후 강사 응답 시 notification skip + commit

**REQ 매핑**: REQ-CONFIRM-NOTIFY-005

**Given**:
- 운영자 O가 SPEC-AUTH-001 흐름으로 비활성화 또는 삭제됨 (auth.users row 삭제)
- 강사 A에게는 이미 배정 요청 알림이 발송된 상태 (예전에 INSERT됨)
- 강사 A 응답 시 `projects.operator_id='uo'`이지만 users 테이블에 'uo'가 없음

**When**:
- 강사 A가 "거절" 클릭

**Then**:
- Server Action 트랜잭션:
  - `instructor_responses` UPSERT 성공
  - `notifications` INSERT 시도 → recipient_id='uo' FK 위반 (또는 application-level pre-check fail) → notification INSERT **skip**
  - stderr에 `console.warn("[notif:skip] operator_id=uo not found for source_id=p1")` 출력
  - 트랜잭션 commit (응답은 보존)
- 강사 UI: 응답 상태 = "거절" 표시 (정상 동작)
- 알림 손실은 운영자 admin 측에서 별도 audit (본 SPEC 외)

---

## 3. 비기능 시나리오

### 시나리오 13 — 한국어 일관성 + Asia/Seoul KST 표시

**REQ 매핑**: REQ-ME-A11Y-004/005 패턴 재사용

**Given**:
- 본 SPEC의 모든 사용자 노출 텍스트

**When**:
- 강사가 `/me/inquiries`, `/me/assignments` 진입

**Then**:
- 모든 라벨/버튼/배지/에러/toast 한국어
- 영문 평문 노출 0건 (Supabase 에러 코드 직노출 금지)
- 모든 시각 표시 KST 형식 (`2026-05-10 09:00 KST` 또는 `2026년 5월 10일 09:00`)
- UTC 표시 0건

---

### 시나리오 14 — 접근성 (axe DevTools + 키보드)

**REQ 매핑**: REQ-CONFIRM-INQUIRIES-001 / ASSIGNMENTS-001 (server component) + 일반 a11y 가이드

**Given**:
- 강사가 `/me/inquiries` 또는 `/me/assignments` 진입
- 스크린리더 사용 또는 키보드 only 모드

**Then**:
- axe DevTools critical = 0
- Lighthouse Accessibility ≥ 95
- 모든 버튼/textarea Tab 도달 가능
- ResponsePanel의 conditional textarea에 `<Label htmlFor>` + `aria-describedby` 적용
- 카운트다운 영역에 `role="timer"` + `aria-live="polite"` (선택)
- 응답 상태 배지에 `aria-label` 한국어 명시 ("미응답" / "수락" / "거절" / "조건부 응답")

---

### 시나리오 15 — 콘솔 로그 5개 type 정확한 포맷

**REQ 매핑**: REQ-CONFIRM-NOTIFY-004

**Given**:
- 5개 응답 시나리오 각각

**Then**:
- `[notif] assignment_accepted → operator_id=<uuid> source_id=<uuid>` (시나리오 5)
- `[notif] assignment_declined → operator_id=<uuid> source_id=<uuid>` (시나리오 3, 시나리오 4 conditional 케이스, 시나리오 6a downgrade)
- `[notif] inquiry_accepted → operator_id=<uuid> source_id=<uuid>` (시나리오 2)
- `[notif] inquiry_declined → operator_id=<uuid> source_id=<uuid>` (사전 문의 거절 케이스)
- `[notif] inquiry_conditional → operator_id=<uuid> source_id=<uuid>` (시나리오 4b)

추가 audit 라인 (HIGH-2 / HIGH-3):
- `[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>` (시나리오 6a)
- `[transition:bypass] project_id=<uuid> from=assignment_confirmed to=assignment_review reason=response-downgrade` (시나리오 6a)
- `[notif:dedup] <type> → operator_id=<uuid> source_id=<uuid>` (시나리오 8 동시 재시도)

UUID는 정상 36자 hyphen-delimited 형식, NODE_ENV 무관 출력.

---

## 4. 신규 보강 시나리오 (MEDIUM-6, HIGH-1 traceability)

### 시나리오 16 — REQ-CONFIRM-RESPONSES-002 인덱스 EXPLAIN 검증

**REQ 매핑**: REQ-CONFIRM-RESPONSES-002 (MEDIUM-6 fix)

**Given**:
- 강사 A의 `instructor_responses` 행 100건 이상 존재 (다양한 source_kind, status)
- M1 마이그레이션이 `idx_instructor_responses_by_instructor (instructor_id, status)` 인덱스를 생성한 상태

**When**:
- `EXPLAIN ANALYZE SELECT * FROM instructor_responses WHERE instructor_id = $1 AND status = 'accepted'` 실행 (`/me/inquiries`/`/me/assignments` 쿼리 패턴)

**Then**:
- 출력에 `Index Scan using idx_instructor_responses_by_instructor` 또는 `Bitmap Index Scan` 라인 존재
- Sequential scan 미사용 (대량 데이터 환경에서 성능 보장)
- 두 partial UNIQUE 인덱스(per-source) 또한 source-scoped lookup 시 사용됨 검증 (FK lookup 시):
  - `EXPLAIN ANALYZE SELECT * FROM instructor_responses WHERE project_id = $1 AND instructor_id = $2` → `Index Scan using uniq_instructor_responses_assignment`
  - `EXPLAIN ANALYZE SELECT * FROM instructor_responses WHERE proposal_inquiry_id = $1 AND instructor_id = $2` → `Index Scan using uniq_instructor_responses_inquiry`

---

### 시나리오 17 — REQ-CONFIRM-RESPONSES-006 BEFORE UPDATE trigger 검증

**REQ 매핑**: REQ-CONFIRM-RESPONSES-006 (MEDIUM-6 fix)

**Given**:
- `instructor_responses` 1 row 존재 (`updated_at = T0`)
- M1 마이그레이션이 `set_updated_at_instructor_responses` BEFORE UPDATE trigger를 설치한 상태

**When**:
- 어플리케이션 코드가 `UPDATE instructor_responses SET status = 'declined' WHERE id = ...` 실행 (애플리케이션은 `updated_at`을 명시 갱신하지 **않음**)

**Then**:
- 트리거 발화 → `updated_at = now()` (T1, T1 > T0)
- 후속 `SELECT updated_at` 결과 = T1 (애플리케이션 코드 변경 없이 자동 갱신)
- `pg_trigger`에 `set_updated_at_instructor_responses` 등록 확인 (메타데이터 검증)

---

### 시나리오 18 — REQ-CONFIRM-INQUIRIES-005 URL multi-select status / date range filter

**REQ 매핑**: REQ-CONFIRM-INQUIRIES-005 (MEDIUM-6 fix)

**Given**:
- 강사 A의 `proposal_inquiries` 5건:
  - pi1: 응답 row 없음 (미응답)
  - pi2: response status='accepted', responded_at='2026-04-25 10:00 KST'
  - pi3: response status='declined', responded_at='2026-04-26 10:00 KST'
  - pi4: response status='conditional', responded_at='2026-04-27 10:00 KST'
  - pi5: response status='accepted', responded_at='2026-04-28 10:00 KST'

**When (18a — multi-select status filter)**:
- 강사 A가 `/me/inquiries?status=accepted,conditional` URL 진입

**Then (18a)**:
- 결과 카드: pi2, pi4, pi5 (3건). pi1(미응답), pi3(declined) 제외
- URL 파라미터가 server component에서 zod로 검증 + `status` 컬럼에 `IN ('accepted', 'conditional')` 적용

**When (18b — date range filter)**:
- 강사 A가 `/me/inquiries?responded_from=2026-04-26&responded_to=2026-04-27` URL 진입

**Then (18b)**:
- 결과 카드: pi3, pi4 (responded_at이 4/26~4/27 범위)
- URL 파라미터 zod 검증 + `responded_at BETWEEN $1 AND $2` 적용
- 미응답(pi1)은 `responded_at IS NULL`이므로 범위 검색에서 제외

**When (18c — default 미응답 only)**:
- 강사 A가 `/me/inquiries` (필터 없음) 진입

**Then (18c)**:
- 기본 동작: `instructor_responses` row 부재인 inquiry만 표시 (= pi1만 1건)
- "미응답"이 default 표시

---

### 시나리오 19 — REQ-CONFIRM-INQUIRIES-006 URL tampering notFound

**REQ 매핑**: REQ-CONFIRM-INQUIRIES-006 (MEDIUM-6 fix)

**Given**:
- 강사 A의 `proposal_inquiries` 1건 (pi1)
- 강사 B(`instructor_id = ib`)는 다른 instructor의 inquiry pi-other에 대한 UUID를 어떻게든 알고 있음

**When**:
- 강사 B가 `/me/inquiries/pi-other` (강사 B에게 보내지지 **않은** inquiry UUID) 직접 진입

**Then**:
- RLS에 의해 `proposal_inquiries WHERE id = 'pi-other' AND instructor_id = 'ib'` 0 rows 반환
- Next.js `notFound()` 호출 → 한국어 404 페이지 `"문의를 찾을 수 없습니다."` 렌더
- 외부 ID 존재 여부를 노출하지 **않음** (information leak 방지)

---

### 시나리오 20 — REQ-CONFIRM-ASSIGNMENTS-006 ?include=history toggle

**REQ 매핑**: REQ-CONFIRM-ASSIGNMENTS-006 (MEDIUM-6 fix)

**Given**:
- 강사 A의 `instructor_responses` 3 rows on `assignment_request`:
  - r1: project_id='p_old1', status='accepted', responded_at='2026-04-01 10:00 KST' (1시간 윈도 외 final lock)
  - r2: project_id='p_old2', status='declined', responded_at='2026-04-15 10:00 KST' (final lock)
  - r3: project_id='p_recent', status='accepted', responded_at='2026-04-29 10:00 KST' (윈도 내)

**When (20a — default)**:
- 강사 A가 `/me/assignments` 진입 (filter 없음)

**Then (20a)**:
- 기본 동작: 미응답 + 윈도 내 응답만 표시
- r3 (p_recent, 윈도 내) 표시. r1/r2는 final lock 상태로 제외
- 카운트: 1건

**When (20b — ?include=history)**:
- 강사 A가 `/me/assignments?include=history` 진입

**Then (20b)**:
- 모든 응답 표시: r1, r2, r3
- final lock 응답(r1, r2)은 read-only 카드 (응답 패널 disabled, "응답 확정" 배지)
- r3 (윈도 내)은 정상 응답 카드 (응답 변경 affordance enabled)
- 카운트: 3건

---

### 시나리오 21 — HIGH-1 schema 직접 검증 (CHECK XOR + FK CASCADE + partial UNIQUE)

**REQ 매핑**: REQ-CONFIRM-RESPONSES-001 (HIGH-1 fix)

**Given (21a — CHECK XOR 위반)**:
- M1 마이그레이션 실행 후

**When (21a-i)**:
- `INSERT INTO instructor_responses (source_kind, project_id, proposal_inquiry_id, instructor_id, status) VALUES ('assignment_request', NULL, NULL, 'ia', 'accepted')` 시도

**Then (21a-i)**:
- PostgreSQL `23514 check_violation` 에러 + 제약 이름 `instructor_responses_source_xor`
- row 생성 실패

**When (21a-ii)**:
- `INSERT INTO instructor_responses (source_kind, project_id, proposal_inquiry_id, instructor_id, status) VALUES ('assignment_request', 'p1', 'pi1', 'ia', 'accepted')` 시도 (양쪽 모두 채워짐)

**Then (21a-ii)**:
- `23514 check_violation` 에러
- row 생성 실패

**When (21a-iii)**:
- `INSERT INTO instructor_responses (source_kind, project_id, proposal_inquiry_id, instructor_id, status) VALUES ('proposal_inquiry', 'p1', NULL, 'ia', 'accepted')` 시도 (source_kind와 FK 컬럼 불일치)

**Then (21a-iii)**:
- `23514 check_violation` 에러
- row 생성 실패

**Given (21b — FK CASCADE on projects DELETE)**:
- `instructor_responses (project_id='p1', status='accepted')` 1 row 존재
- 운영자 admin이 `DELETE FROM projects WHERE id = 'p1'` 실행 (운영자 admin path 외부, 검증 시나리오용)

**Then (21b)**:
- FK `ON DELETE CASCADE`에 의해 instructor_responses row 자동 삭제
- 후속 `SELECT FROM instructor_responses WHERE project_id = 'p1'` → 0 rows
- orphan row 0건 (HIGH-1 fix 검증)

**Given (21c — FK CASCADE on proposal_inquiries DELETE)**:
- `instructor_responses (proposal_inquiry_id='pi1', status='conditional')` 1 row
- SPEC-PROPOSAL-001이 `DELETE FROM proposal_inquiries WHERE id = 'pi1'` 실행

**Then (21c)**:
- FK CASCADE → instructor_responses row 자동 삭제
- 후속 `SELECT WHERE proposal_inquiry_id = 'pi1'` → 0 rows

**Given (21d — partial UNIQUE 동작)**:
- `instructor_responses (project_id='p1', instructor_id='ia', status='accepted')` 1 row 존재

**When (21d-i)**:
- 동일 `(project_id='p1', instructor_id='ia')`로 INSERT 재시도

**Then (21d-i)**:
- partial UNIQUE 인덱스 `uniq_instructor_responses_assignment` 충돌 → `23505 unique_violation` (또는 ON CONFLICT 처리)
- row 추가 생성 안 됨

**When (21d-ii)**:
- 다른 강사 `(project_id='p1', instructor_id='ib')`로 INSERT (다른 instructor 동일 project)

**Then (21d-ii)**:
- partial UNIQUE 미충돌 (instructor_id 다름)
- row 정상 INSERT (1 project ↔ N instructor 응답 가능, 향후 multi-instructor SPEC 확장 대비)

---

## 5. Definition of Done

본 SPEC의 모든 시나리오가 통과해야 다음 조건이 성립한다:

- [ ] 시나리오 1-8: 핵심 흐름 모두 PASS (M6 통합 테스트, HIGH-1/HIGH-2/HIGH-3/MEDIUM-4/MEDIUM-5 검증 포함)
- [ ] 시나리오 9-12: 엣지 케이스 모두 PASS
- [ ] 시나리오 13-15: 비기능 검증 통과
- [ ] 시나리오 16-21 (MEDIUM-6 + HIGH-1 보강): EXPLAIN, trigger, URL filter, notFound, ?include=history, CHECK XOR, FK CASCADE, partial UNIQUE 모두 PASS
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 전체 PASS
- [ ] 단위 테스트 라인 커버리지 ≥ 85% (responses 모듈)
- [ ] axe DevTools `/me/inquiries`, `/me/assignments` critical 0건
- [ ] Lighthouse Accessibility ≥ 95
- [ ] 기존 SPEC(SPEC-PROJECT-001, SPEC-AUTH-001, SPEC-ME-001, SPEC-DB-001) 회귀 0건
- [ ] 한국어 + KST 일관성 검증 PASS
- [ ] RLS 격리 검증 PASS (instructor B → instructor A row 0행)
- [ ] 마이그레이션 3개 (instructor_responses + 5 enum value + notifications_idempotency) + `instructor_responses` 테이블 정합 검증
- [ ] SPEC-PROJECT-AMEND-001 follow-up 트래킹 (assignment_confirmed → assignment_review 그래프 보완)

---

_End of SPEC-CONFIRM-001 acceptance.md_
