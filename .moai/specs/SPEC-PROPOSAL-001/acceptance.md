# SPEC-PROPOSAL-001 Acceptance Criteria

## Scope

본 문서는 Given/When/Then 형식으로 SPEC-PROPOSAL-001의 수용 기준을 정의한다. 각 시나리오는 통합 테스트(`src/app/(app)/(operator)/proposals/__tests__/integration.test.ts`)와 1:1 매핑되며, REQ ID 추적성을 유지한다.

---

## Scenario 1: 운영자가 신규 제안서 초안을 등록한다

**Refs**: REQ-PROPOSAL-ENTITY-001, REQ-PROPOSAL-ENTITY-006, REQ-PROPOSAL-ENTITY-007

**Given**:
- operator 역할 사용자가 로그인되어 있다
- `clients` 테이블에 1개 이상 row 존재 (`client_X`)
- `skill_categories` 테이블에 leaf node 2개 존재 (`skill_A`, `skill_B`)

**When**:
- operator가 `/proposals/new` 페이지 이동
- 폼에 `title="2026년 5월 데이터 분석 강의 제안"`, `client_id=client_X`, `proposed_period_start=2026-05-15`, `proposed_period_end=2026-05-30`, `proposed_business_amount_krw=5000000`, `proposed_hourly_rate_krw=200000`, `required_skill_ids=[skill_A, skill_B]`, `notes="고객사 협의안 반영"` 입력
- 제출 버튼 클릭

**Then**:
- `proposals` 테이블에 1행 INSERT
  - `status = 'draft'`
  - `operator_id = currentUser.id`
  - `submitted_at IS NULL`
  - `decided_at IS NULL`
  - `converted_project_id IS NULL`
- `proposal_required_skills` 테이블에 2행 INSERT (`(<new_id>, skill_A)`, `(<new_id>, skill_B)`)
- 같은 트랜잭션 내 commit
- HTTP 302 redirect → `/proposals/<new_id>`

**Edge Case (Then)**:
- `proposed_period_end < proposed_period_start` 입력 시 zod 검증 실패 → `"종료일은 시작일 이후여야 합니다."` 한국어 에러 표시 → DB INSERT 0건

---

## Scenario 2: 운영자가 초안 제안서를 제출 상태로 전환한다 (draft → submitted)

**Refs**: REQ-PROPOSAL-ENTITY-004, REQ-PROPOSAL-DETAIL-003

**Given**:
- `proposals` 테이블에 1행 존재 (`status='draft'`, `submitted_at=NULL`)

**When**:
- operator가 `/proposals/<id>` 상세 페이지에서 "제출" 버튼 클릭
- Server Action `transitionProposalStatus({ to: 'submitted' })` 호출

**Then**:
- `proposals.status = 'submitted'` 갱신
- `proposals.submitted_at = now()` 설정
- `proposals.updated_at` 자동 갱신
- 상세 페이지 새로고침 → status badge "제출됨" 표시
- "수주" / "실주" / "취소" 버튼 노출, "제출" 버튼 사라짐

---

## Scenario 3: 운영자가 후보 강사 3명에게 일괄 사전 문의를 발송한다

**Refs**: REQ-PROPOSAL-INQUIRY-001, REQ-PROPOSAL-INQUIRY-003, REQ-PROPOSAL-INQUIRY-007

**Given**:
- `proposals` 테이블에 1행 존재 (`id=P1`, `status='draft' 또는 'submitted'`)
- `instructors` 테이블에 3명 존재 (`instr_A`, `instr_B`, `instr_C`), 각각 `users` row 연결 (`user_A`, `user_B`, `user_C`)
- `proposal_inquiries` 테이블에 (`P1`, `instr_*`) 페어 row 0건

**When**:
- operator가 `/proposals/P1` 상세 페이지의 "강사 사전 문의" 버튼 클릭
- 모달에서 `instr_A, instr_B, instr_C` 선택, `proposed_time_slot_start=2026-05-15T09:00:00+09:00`, `proposed_time_slot_end=2026-05-15T18:00:00+09:00`, `question_note="해당 시간대에 강의 가능하신가요?"` 입력
- "보내기" 버튼 클릭
- Server Action `dispatchInquiries({ proposalId: 'P1', instructorIds: ['instr_A','instr_B','instr_C'], ... })` 호출

**Then**:
- 단일 트랜잭션 commit
- `proposal_inquiries` 테이블에 3행 INSERT, 각 `(P1, instr_X, status='pending', proposed_time_slot_*, question_note)`
- `notifications` 테이블에 3행 INSERT, 각 `(recipient_id=user_X, type='inquiry_request', title="<제안서 제목> 강의 가능 여부 사전 문의", body=..., link_url='/me/inquiries/<inquiry_id>')`
- 콘솔 로그 3행 출력:
  - `[notif] inquiry_request → instructor_id=<instr_A_uuid> proposal_id=<P1_uuid>`
  - `[notif] inquiry_request → instructor_id=<instr_B_uuid> proposal_id=<P1_uuid>`
  - `[notif] inquiry_request → instructor_id=<instr_C_uuid> proposal_id=<P1_uuid>`
- 응답 보드 갱신: `대기 중` 컬럼에 3명 표시

**Edge Case 3a (중복 디스패치)**:

**Given**: Scenario 3 완료 후, `proposal_inquiries (P1, instr_A)` row 1건 존재

**When**: operator가 다시 `instr_A, instr_D` 선택하여 디스패치

**Then**:
- unique 제약 `(proposal_id, instructor_id)` 위반 → 트랜잭션 전체 롤백
- `proposal_inquiries` 추가 INSERT 0건 (instr_D도 INSERT 안 됨)
- `notifications` 추가 INSERT 0건
- 한국어 에러 `"이미 사전 문의를 보낸 강사입니다."` (중복 instructor ID 목록 포함) 반환

**Edge Case 3b (frozen 제안서 디스패치)**:

**Given**: `proposals.status = 'won'` (또는 `'lost'`, `'withdrawn'`)

**When**: operator가 디스패치 시도

**Then**:
- 한국어 에러 `"확정된 제안서에는 추가 문의를 보낼 수 없습니다."` 반환
- `proposal_inquiries` INSERT 0건
- `notifications` INSERT 0건

---

## Scenario 4: 운영자가 수주 제안서를 프로젝트로 변환한다 (Won → Project)

**Refs**: REQ-PROPOSAL-CONVERT-001, REQ-PROPOSAL-CONVERT-002, REQ-PROPOSAL-CONVERT-003, REQ-PROPOSAL-CONVERT-004, REQ-PROPOSAL-CONVERT-005, REQ-PROPOSAL-CONVERT-006, REQ-PROPOSAL-CONVERT-007

**Given**:
- `proposals` 테이블에 1행 존재 (`id=P1`, `status='submitted'`, `title="2026년 5월 데이터 분석 강의 제안"`, `client_id=client_X`, `operator_id=user_O`, `proposed_period_start=2026-05-15`, `proposed_period_end=2026-05-30`, `proposed_business_amount_krw=5000000`, `proposed_hourly_rate_krw=200000`, `converted_project_id=NULL`)
- `proposal_required_skills (P1, skill_A)`, `(P1, skill_B)` 2행
- `proposal_inquiries` 테이블에 3행 (`P1, instr_A, accepted`), `(P1, instr_B, declined)`, `(P1, instr_C, accepted)` (instr_A, instr_C가 수락)

**When**:
- operator가 `/proposals/P1` 상세 페이지에서 "수주" 버튼 클릭
- 확인 다이얼로그 통과
- Server Action `convertProposalToProject({ proposalId: 'P1' })` 호출

**Then** (단일 트랜잭션 — canonical 6-step per spec.md §5.4 / REQ-PROPOSAL-CONVERT-001):

**Step 1**: `SELECT id, status, converted_project_id FROM proposals WHERE id = 'P1' FOR UPDATE` 행 잠금 획득 (REQ-PROPOSAL-CONVERT-001 / REQ-PROPOSAL-CONVERT-007 READ COMMITTED).

**Step 2**: 멱등성/상태 체크 통과 (`converted_project_id IS NULL` AND `status = 'submitted'`).

**Step 3**: `projects` 테이블에 1행 INSERT RETURNING id
   - `id = <new_pid>`
   - `title = "2026년 5월 데이터 분석 강의 제안"`
   - `client_id = client_X`
   - `operator_id = user_O`
   - `start_date = 2026-05-15`
   - `end_date = 2026-05-30`
   - `business_amount_krw = 5000000`
   - `instructor_fee_krw = 0` (시간 추정 미지원, 운영자가 후속 입력)
   - `status = 'proposal'` (SPEC-PROJECT-001 13단계 enum의 시작)
   - `instructor_id = NULL`
   - `project_type = 'education'` (기본값)

**Step 4**: `project_required_skills (<new_pid>, skill_A)`, `(<new_pid>, skill_B)` 2행 INSERT (proposal_required_skills로부터 복사).

**Step 5**: `ai_instructor_recommendations` 테이블에 1행 INSERT (accepted ≥ 1 이므로)
   - `project_id = <new_pid>`
   - `top3_jsonb = [{instructorId: instr_A, ...source:"fallback", reason:"사전 문의에서 수락한 후보 강사"}, {instructorId: instr_C, ...}]`
   - `model = 'manual_from_proposal'`
   - `adopted_instructor_id = NULL`

**Step 6**: `proposals` UPDATE (Step 3에서 생성된 `<new_pid>`를 `converted_project_id`에 set — FK 순서 보장)
   - `status = 'won'`
   - `decided_at = now()`
   - `converted_project_id = <new_pid>`

**Post-COMMIT**:
- 트랜잭션 commit (모든 6 step 원자적 적용)
- HTTP 302 redirect → `/projects/<new_pid>`
- SPEC-PROJECT-001 detail 페이지에서 신규 project 정상 표시

**Edge Case 4a (멱등성 — REQ-PROPOSAL-CONVERT-003)**:

**Given**: Scenario 4 완료 후 (`proposals.converted_project_id = existing_pid IS NOT NULL`)

**When**: operator가 동일 제안서에 대해 "수주" 재시도 (예: 새로고침 후 재클릭, 또는 다른 탭)

**Then**:
- Step 1 행 잠금 후 Step 2에서 `converted_project_id IS NOT NULL` 관측
- **멱등 early-return 분기 진입**: 한국어 메시지 `"이미 프로젝트로 변환된 제안서입니다. (project_id=<existing_pid>)"`
- `projects` 신규 INSERT **0건** (중복 row 미생성)
- `proposals` 변경 **0건**
- redirect → `/projects/<existing_pid>` (동일 deep link, 사용자 관점 idempotent 성공)

**Edge Case 4b (status != submitted — REQ-PROPOSAL-CONVERT-002)**:

**Given**: `proposals.status = 'draft'` (제출 전) 또는 `'lost'`/`'withdrawn'`/`'won'`

**When**: operator가 "수주" 시도

**Then**:
- Step 1 행 잠금 후 Step 2에서 `status != 'submitted'` 관측
- 한국어 에러 `"제출 상태의 제안서만 수주 처리할 수 있습니다."` 반환
- 트랜잭션 ROLLBACK
- DB 변경 **0건**

**Edge Case 4c (accepted 강사 0명)**:

**Given**: `proposals.status='submitted'`, `proposal_inquiries` 모든 행이 `pending` 또는 `declined` 또는 `conditional` 상태 (accepted 0건)

**When**: operator가 "수주" → 변환 액션 호출

**Then**:
- Step 1, 2, 3, 4, 6 동일 수행
- **Step 5 (`ai_instructor_recommendations` INSERT) skip** (accepted 0명이므로 `WHERE EXISTS (...)` 분기 false)
- 변환 자체는 성공, redirect 정상

**Edge Case 4d (동시 변환 race condition — REQ-PROPOSAL-CONVERT-001 / REQ-PROPOSAL-CONVERT-003 / REQ-PROPOSAL-CONVERT-007 / HIGH-1 race 방어)**:

**Given**:
- `proposals` row P (`status='submitted'`, `converted_project_id IS NULL`)
- 두 `convertProposalToProject(P.id)` 호출이 거의 동시에 시작 (예: 더블클릭 또는 두 operator 탭에서 동시 클릭)

**When**: 두 트랜잭션 T1, T2가 병행 실행 (READ COMMITTED 격리)
- T1: Step 1 `SELECT ... FOR UPDATE` 행 잠금 획득 (T2는 차단됨)
- T1: Step 2 멱등 체크 통과 → Step 3~6 실행 → COMMIT (`converted_project_id = pid_1` 셋)
- T1 COMMIT 직후 T2의 Step 1 차단 해제됨

**Then**:
- T1: `projects` 신규 row 1건 생성, `proposals.converted_project_id = pid_1` 셋, redirect → `/projects/pid_1`
- T2: Step 1 차단 해제 후 행 재읽기 시 `converted_project_id = pid_1 IS NOT NULL` 관측
- T2: 멱등 early-return 분기 → `projects` 신규 INSERT **0건** → redirect → `/projects/pid_1` (T1과 동일)
- 최종 상태: 정확히 **1 projects row** 생성, 두 호출 모두 동일 `pid_1` 반환, lost-update 없음
- 통합 테스트: `Promise.all([convert(P), convert(P)])`로 race 재현 후 `SELECT count(*) FROM projects WHERE id = pid_1` = 1 검증

---

## Scenario 5: 실주 또는 취소된 제안서는 frozen 상태로 어떤 변경도 거부한다

**Refs**: REQ-PROPOSAL-ENTITY-005, REQ-PROPOSAL-DETAIL-005

**Given**:
- `proposals.status = 'lost'` (또는 `'withdrawn'`, `'won'`)

**When**:
- operator가 다음 중 임의의 작업 시도:
  - (a) `/proposals/<id>/edit` 페이지에서 폼 제출
  - (b) 디스패치 모달에서 강사 추가 시도
  - (c) status 전환 (예: `lost → submitted`) 시도

**Then**:
- (a) 한국어 에러 `"확정된 제안서는 수정할 수 없습니다."` 반환, DB 변경 0건
- (b) 한국어 에러 `"확정된 제안서에는 추가 문의를 보낼 수 없습니다."` 반환, DB 변경 0건
- (c) `validateProposalTransition` 호출 → `{ ok: false, reason: "허용되지 않은 상태 전환입니다." }` 반환, DB 변경 0건
- 상세 페이지에 frozen 배지 + (won인 경우) `/projects/<converted_project_id>` 딥링크 표시

---

## Scenario 6: 강사 응답 결과가 응답 보드에 반영된다 (sibling SPEC-CONFIRM-001 핸드오프 검증)

**Refs**: REQ-PROPOSAL-INQUIRY-008, REQ-PROPOSAL-DETAIL-006

**Given**:
- `proposals (P1, status='submitted')`
- `proposal_inquiries (P1, instr_A, status='pending')`, `(P1, instr_B, status='pending')`, `(P1, instr_C, status='pending')` 3행

**When** (sibling SPEC-CONFIRM-001 또는 직접 SQL 시뮬레이션):
- `instr_A` 사용자가 SPEC-CONFIRM-001 화면에서 수락
- 결과적으로 `proposal_inquiries WHERE id=<inquiry_A>` row가 `status='accepted'`, `responded_at=now()`, `responded_by_user_id=user_A`로 UPDATE
- `instr_B`는 거절 (`status='declined'`)
- `instr_C`는 조건부 응답 (`status='conditional'`, `conditional_note='2시간 단축 가능'`)

**Then**:
- operator가 `/proposals/P1` 상세 페이지 새로고침 (또는 revalidate)
- 응답 보드 4 컬럼:
  - `대기 중`: 0명
  - `수락`: 1명 (instr_A, responded_at 표시)
  - `거절`: 1명 (instr_B)
  - `조건부`: 1명 (instr_C, conditional_note "2시간 단축 가능" excerpt 표시)

**Note**: 본 SPEC은 응답 입력 화면을 빌드하지 않으며, 본 시나리오의 "When" 단계에서 수행되는 UPDATE는 sibling SPEC-CONFIRM-001의 책임이다. 통합 테스트에서는 SQL 직접 UPDATE로 시뮬레이션한다.

---

## Scenario 7: RLS — instructor 토큰은 /proposals 라우트에 접근 불가, 본인 inquiries만 조회 가능

**Refs**: REQ-PROPOSAL-RLS-001, REQ-PROPOSAL-RLS-002, REQ-PROPOSAL-RLS-005

**Given**:
- instructor 역할 사용자 `instr_A` 로그인 (`auth.jwt() ->> 'role' = 'instructor'`)
- `proposals` 테이블에 10행 존재
- `proposal_inquiries` 테이블에 (`P1, instr_A`), (`P1, instr_B`), (`P2, instr_A`) 3행

**When (a)**:
- instructor가 브라우저에서 `/proposals` URL 접근

**Then (a)**:
- SPEC-AUTH-001 `(operator)/layout.tsx` 가드 → silent redirect to instructor home (`/me/dashboard`)
- HTTP 200으로 응답하지 않고 redirect 응답

**When (b)** (직접 RLS 검증):
- instructor가 인증된 supabase client로 `SELECT * FROM proposals` 쿼리

**Then (b)**:
- RLS 정책 `proposals_operator_admin_all`이 `auth.jwt() ->> 'role' IN ('operator', 'admin')` 조건 미충족 → 0 rows 반환

**When (c)**:
- instructor가 `SELECT * FROM proposal_inquiries WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())` 쿼리

**Then (c)**:
- RLS 정책 `proposal_inquiries_instructor_self_select` 통과 → 본인 instructor_id가 매칭하는 2 rows (`P1+instr_A`, `P2+instr_A`) 반환
- `(P1, instr_B)` row는 노출되지 않음

---

## Scenario 8: 첨부 파일 업로드 — Storage + files 메타 일관성

**Refs**: REQ-PROPOSAL-ENTITY-008, REQ-PROPOSAL-RLS-004

**Given**:
- `proposals` 1행 (`id=P1`, `status='draft'`)
- Storage 버킷 `proposal-attachments` 존재 (마이그레이션 M1에서 생성)

**When (a)**:
- operator가 `/proposals/P1/edit`에서 PDF 파일 (`size=3MB`, `mime=application/pdf`) 업로드

**Then (a)**:
- Storage object 생성 경로 `proposal-attachments/<P1>/<uuid>.pdf`
- `files` 테이블에 1행 INSERT
  - `storage_path = 'proposal-attachments/<P1>/<uuid>.pdf'`
  - `mime_type = 'application/pdf'`
  - `size_bytes = 3145728`
  - `owner_id = currentUser.id`
  - `kind = 'proposal_attachment'` (file_kind enum)
- 상세 페이지에 다운로드 링크(파일명 + 크기) 표시
- 다운로드 클릭 시 signed URL 생성 (TTL 60초)

**Edge Case 8a (mime 위반)**:

**When**: `.exe` 또는 `.docx` 등 허용 외 mime 업로드 시도

**Then**: 한국어 에러 `"PDF, PNG, JPG 파일만 업로드 가능합니다."` 반환, Storage 업로드 0건, `files` INSERT 0건

**Edge Case 8b (size 초과)**:

**When**: 6MB 파일 업로드 시도

**Then**: 한국어 에러 `"파일 크기는 5MB 이하여야 합니다."` 반환, 업로드 거부

**Edge Case 8c (Storage 업로드 성공 후 files INSERT 실패)**:

**When**: Storage upload OK 후 DB INSERT 실패 (예: 일시적 connection 에러)

**Then**: 보상 로직 `deleteOrphanFile(storagePath)` 호출하여 Storage object 삭제 → 일관성 복구

---

## Scenario 9: 스키마 불변량 — proposal_status 5-value enum + proposal_required_skills junction

**Refs**: REQ-PROPOSAL-ENTITY-002, REQ-PROPOSAL-ENTITY-003

**Given**:
- 마이그레이션 `20260429000010_proposals.sql` 적용 완료

**When (a) — enum 5-value 검증**:
- `SELECT enum_range(NULL::proposal_status)::text[]` 실행

**Then (a)**:
- 결과 = exactly `{draft, submitted, won, lost, withdrawn}` (5개 정확히, 추가/누락 0)
- 신규 SPEC 없이 `ALTER TYPE proposal_status ADD VALUE` 시도가 본 SPEC에서는 발생하지 않음

**When (b) — junction 무결성 검증**:
- `proposals` 1행 + `skill_categories` 2행 사전 존재
- `proposal_required_skills (proposal_id, skill_id)` 2행 INSERT
- 동일 `(proposal_id, skill_id)` 페어 재INSERT 시도

**Then (b)**:
- 첫 INSERT 성공 (PK 복합 키)
- 재INSERT 시도 PK 위반 (SQLSTATE `23505`)
- `proposal_id`로 참조된 `proposals` 삭제 시 → 본 SPEC은 soft delete만 하므로 ON DELETE CASCADE는 hard delete 시나리오에서만 발동되며, 정상 운영 흐름에서는 발동하지 않음 (검증을 위해 통합 테스트에서 SQL `DELETE FROM proposals WHERE id = ...` 후 junction row 0건 확인)
- `skill_id`로 참조된 `skill_categories` 삭제 시도 → ON DELETE RESTRICT로 거부됨 (마스터 데이터 보호)

---

## Scenario 10: 리스트 페이지 — RSC + 페이지네이션 + URL params + 표시 컬럼

**Refs**: REQ-PROPOSAL-LIST-001, REQ-PROPOSAL-LIST-002, REQ-PROPOSAL-LIST-003, REQ-PROPOSAL-LIST-004

**Given**:
- operator 토큰 + `clients` 1행 (`client_X`, `company_name="테스트 고객사"`)
- `users` 1행 (operator_id에 매칭, `display_name="홍운영"`)
- `proposals` 50행 사전 시딩 — 25행 `status='draft'`, 25행 `status='submitted'`, 1행 `deleted_at IS NOT NULL`

**When (a) — RSC + pagination**:
- operator가 `/proposals?page=1` 접근

**Then (a)**:
- React Server Component로 server-side rendering (HTML에 데이터 포함, `'use client'` 디렉티브 없음)
- 한 페이지 정확히 20행 표시 (50행 중 deleted_at 1행 제외 → 49행, 첫 페이지 20행)
- 각 row 표시 컬럼: 제목 (`title`), 고객사 (`clients.company_name`), 담당자 (`users.display_name`), 상태 (한국어 라벨 + 색상 배지), 기간 (`proposed_period_start ~ proposed_period_end`), 사업비 (`proposed_business_amount_krw`, KRW 표시), 등록일 (`created_at`, KST)
- 두 번째 페이지: `/proposals?page=2` 20행, 세 번째 페이지: `/proposals?page=3` 9행

**When (b) — URL params 필터**:
- operator가 `/proposals?status=draft&q=알고&client_id=<client_X>&period_from=2026-05-01&period_to=2026-05-31&page=1` 접근

**Then (b)**:
- WHERE 절: `status = 'draft' AND title ILIKE '%알고%' AND client_id = client_X AND proposed_period_start BETWEEN '2026-05-01' AND '2026-05-31'`
- multi-select status: `?status=draft,submitted` → `status IN ('draft', 'submitted')` (rendered as `status = ANY(...)`)
- `deleted_at IS NOT NULL` 행 0건 노출 (REQ-PROPOSAL-LIST-004)
- 결과 0건 시 빈 상태 화면 + 한국어 안내 메시지

**Edge Case 10a (페이지 초과 — REQ-PROPOSAL-LIST-005)**:

**Given**: 총 49 rows, 페이지 크기 20 → 마지막 페이지 = 3

**When**: operator가 `/proposals?page=999` 접근

**Then**: HTTP 302 redirect → `/proposals?page=3` (마지막 유효 페이지)

---

## Scenario 11: 상세 페이지 — 7 섹션 + soft-delete notFound + state-driven 버튼

**Refs**: REQ-PROPOSAL-DETAIL-001, REQ-PROPOSAL-DETAIL-002, REQ-PROPOSAL-DETAIL-004

**Given**:
- `proposals` row P1 (`status='submitted'`)
- `proposal_required_skills` 2행, `proposal_inquiries` 3행 (각 status 다른 값), `files` 1행 (kind='proposal_attachment')

**When (a) — 7 섹션 정상 렌더링**:
- operator가 `/proposals/P1` 접근

**Then (a)**: 페이지에 다음 7 섹션 모두 렌더링됨 (REQ-PROPOSAL-DETAIL-001):
1. 요약 헤더 (제목·고객사·담당자·상태 배지·기간·사업비)
2. 상태 컨트롤 (status='submitted'이므로 "수주" / "실주" / "취소" 버튼 노출 — REQ-PROPOSAL-DETAIL-004; "제출" 버튼 비노출)
3. 기술스택 태그 리스트 (proposal_required_skills 2개)
4. 첨부 파일 다운로드 링크 (files 1개)
5. 사전 강사 문의 디스패치 패널 (`"강사 사전 문의"` CTA, status='submitted'이므로 활성)
6. 응답 보드 (`proposal_inquiries` 3행을 status별 4 컬럼으로 그룹)
7. Won → Project 변환 컨트롤 (`ConvertToProjectButton`, status='submitted'이므로 노출)

**When (b) — submitted 상태 전용 버튼**:
- 상세 페이지 상태 컨트롤 영역의 버튼 목록 검사

**Then (b)** (REQ-PROPOSAL-DETAIL-004):
- 버튼 표시: "수주" + "실주" + "취소"
- 버튼 미표시: "제출" (이미 submitted 상태)
- "수주" 클릭 → `convertProposalToProject` Server Action 호출

**Edge Case 11a (soft-delete — REQ-PROPOSAL-DETAIL-002)**:

**Given**: `proposals (id=P_DEL, deleted_at = '2026-04-29 10:00:00+09:00')`

**When**: operator가 `/proposals/P_DEL` 접근

**Then**:
- `getCurrentUser()` 통과 (SPEC-AUTH-001)
- 상세 쿼리: `SELECT * FROM proposals WHERE id = P_DEL AND deleted_at IS NULL` → 0 rows
- Next.js `notFound()` 호출 → HTTP 404 응답 + 표준 404 페이지 렌더링

**Edge Case 11b (id 없음 — REQ-PROPOSAL-DETAIL-002)**:

**Given**: `proposals` 테이블에 `P_NONEXISTENT` row 없음

**When**: operator가 `/proposals/P_NONEXISTENT` 접근

**Then**: 동일하게 `notFound()` → HTTP 404

---

## Scenario 12: inquiry_status 4-value enum + 추천 후보만 보기 토글

**Refs**: REQ-PROPOSAL-INQUIRY-002, REQ-PROPOSAL-INQUIRY-006

**Given**:
- 마이그레이션 `20260429000020_proposal_inquiries.sql` 적용 완료
- `instructors` 5명 (`instr_1`~`instr_5`), 각 `instructor_skills`에 다른 skill 할당
- `proposals` row P1 + `proposal_required_skills (P1, skill_A)`, `(P1, skill_B)` 2행
- `instr_1`: skill_A, skill_B 보유 (overlap=2)
- `instr_2`: skill_A 보유 (overlap=1)
- `instr_3`: skill_C만 보유 (overlap=0)
- `instr_4`: skill_B 보유 (overlap=1)
- `instr_5`: skill 미할당 (overlap=0)

**When (a) — enum 4-value 검증**:
- `SELECT enum_range(NULL::inquiry_status)::text[]` 실행

**Then (a)**:
- 결과 = exactly `{pending, accepted, declined, conditional}` (4개 정확히)

**When (b) — 추천 후보만 보기 토글 OFF**:
- operator가 `/proposals/P1`에서 `InquiryDispatchModal` 열기, 토글 OFF

**Then (b)**:
- instructor multi-select에 5명 모두(instr_1~instr_5) 표시 (필터 없음)

**When (c) — 추천 후보만 보기 토글 ON (REQ-PROPOSAL-INQUIRY-006)**:
- 동일 모달에서 토글 ON

**Then (c)**:
- instructor multi-select에 `instr_1, instr_2, instr_4` 만 표시 (`proposal_required_skills` ∩ `instructor_skills` ≠ ∅)
- `instr_3, instr_5` 비표시 (overlap=0)
- 그러나 토글은 UX 편의 — 사용자가 토글 OFF 후 재선택 시 어떤 instructor도 선택 가능 (제약 없음, REQ-PROPOSAL-INQUIRY-006의 "shall not restrict" 조항)

---

## Scenario 13: convert.ts 순수성 + 변환 거부 — REQ-PROPOSAL-CONVERT-002 / REQ-PROPOSAL-CONVERT-006

**Refs**: REQ-PROPOSAL-CONVERT-002, REQ-PROPOSAL-CONVERT-006

**Given**:
- `src/lib/proposals/convert.ts` 모듈 (`buildProjectFromProposal`, `buildAcceptedRecommendationFromInquiries`)

**When (a) — 순수 함수 검증 (REQ-PROPOSAL-CONVERT-006)**:
- 단위 테스트 `convert.test.ts`에서 `buildProjectFromProposal(proposalRecord)` 호출 (Drizzle/Supabase mock 없이, 순수 TypeScript object 입력)
- 동일 입력으로 100회 호출

**Then (a)**:
- 100회 호출 모두 동일 출력 (referential transparency)
- import 트리에 `drizzle-orm`, `@supabase/*`, `next/*` 의존성 0건 (`grep -l "drizzle\|supabase\|next" src/lib/proposals/convert.ts` → 0 hits, except possibly type-only imports)
- 사이드 이펙트 0건 (네트워크/DB/파일시스템/console 출력 없음)
- 입력 객체 mutation 0건 (`Object.freeze()` 통과)

**When (b) — status != 'submitted' 거부 (REQ-PROPOSAL-CONVERT-002)**:
- `proposals (id=P, status='draft')` (또는 `'lost'`, `'withdrawn'`, `'won'`)
- `convertProposalToProject({ proposalId: P })` 호출

**Then (b)**:
- §5.4 Step 1 행 잠금 후 Step 2에서 status 체크 실패
- 한국어 에러 `"제출 상태의 제안서만 수주 처리할 수 있습니다."` 반환
- 트랜잭션 ROLLBACK, DB 변경 0건

---

## Scenario 14: signal view — 컬럼 정의 + non-materialized + RLS pass-through + 헬퍼 export

**Refs**: REQ-PROPOSAL-SIGNAL-001, REQ-PROPOSAL-SIGNAL-002, REQ-PROPOSAL-SIGNAL-004

**Given**:
- 마이그레이션 `20260429000060_instructor_inquiry_history_view.sql` 적용 완료
- `instructors` 3명 (`instr_A`, `instr_B`, `instr_C`)
- `proposal_inquiries` 6행:
  - `(_, instr_A, accepted, responded_at = now() - 30 days)`
  - `(_, instr_A, accepted, responded_at = now() - 100 days)` ← 90일 윈도우 밖
  - `(_, instr_A, declined, responded_at = now() - 10 days)`
  - `(_, instr_B, pending, responded_at = NULL)`
  - `(_, instr_B, accepted, responded_at = now() - 50 days)`
  - `(_, instr_C, pending, responded_at = NULL)`

**When (a) — view 컬럼 정의 (REQ-PROPOSAL-SIGNAL-001)**:
- `\d+ instructor_inquiry_history` (Postgres) 또는 `information_schema.columns` 조회

**Then (a)**: 다음 컬럼만 정확히 노출 (5개)
- `instructor_id uuid`
- `prior_accepted_count_90d bigint`
- `prior_declined_count_90d bigint`
- `prior_pending_count bigint`
- `last_responded_at timestamptz`

**When (b) — non-materialized 검증 (REQ-PROPOSAL-SIGNAL-002)**:
- `SELECT relkind FROM pg_class WHERE relname = 'instructor_inquiry_history'`

**Then (b)**:
- `relkind = 'v'` (regular view), NOT `'m'` (materialized view)
- 새 row INSERT 후 `REFRESH MATERIALIZED VIEW` 호출 없이도 즉시 반영됨 (query-time aggregation)

**When (c) — RLS pass-through 검증 (REQ-PROPOSAL-SIGNAL-002)**:
- instructor 토큰으로 `SELECT * FROM instructor_inquiry_history WHERE instructor_id = <other instructor>` 쿼리

**Then (c)**:
- view는 underlying `proposal_inquiries`의 RLS를 우회하지 않음
- instructor self-only RLS 정책에 의해 본인 instructor_id 외 row 0건 (또는 카운트 0)
- `SECURITY DEFINER`가 아닌 `SECURITY INVOKER` view (Postgres 기본)이거나, 명시적으로 RLS 활성

**When (d) — 헬퍼 export 계약 (REQ-PROPOSAL-SIGNAL-004)**:
- `import { selectInstructorPriorAcceptedCount } from 'src/lib/proposals/signal'`
- TypeScript signature 확인: `(instructorId: string, windowDays?: number) => Promise<number>` (default `windowDays = 90`)

**Then (d)**:
- 호출 `selectInstructorPriorAcceptedCount(instr_A_id)` → `Promise<1>` (90일 내 accepted 1건)
- 호출 `selectInstructorPriorAcceptedCount(instr_A_id, 365)` → `Promise<2>` (365일 내 accepted 2건)
- 호출 `selectInstructorPriorAcceptedCount(instr_C_id)` → `Promise<0>`
- `src/lib/recommend/score.ts` 또는 `runRecommendationAction` 어디에서도 이 헬퍼를 import하지 않음 (`grep -r "selectInstructorPriorAcceptedCount" src/lib/recommend/` → 0 hits)

---

## Scenario 15: SPEC-CONFIRM-001 contract surface 검증

**Refs**: REQ-PROPOSAL-INQUIRY-008, REQ-PROPOSAL-INQUIRY-009

**Given**:
- SPEC-PROPOSAL-001 implementation 완료 + SPEC-CONFIRM-001 머지 완료
- `proposal_inquiries` row PI1 (`proposal_id=P1, instructor_id=instr_A, status='pending'`)

**When (a) — contract 컬럼만 read (REQ-PROPOSAL-INQUIRY-008)**:
- 본 SPEC의 `InquiryResponseBoard.tsx` 코드 grep:
  - `grep -r "instructor_responses" src/components/proposals/ src/lib/proposals/ src/app/(app)/(operator)/proposals/`

**Then (a)**:
- 0 hits — 본 SPEC은 `instructor_responses` 테이블을 직접 read/write 하지 않음
- `InquiryResponseBoard`는 `proposal_inquiries` 테이블의 `status`, `responded_at`, `responded_by_user_id`, `conditional_note`만 SELECT

**When (b) — 핸드오프 흐름 검증 (REQ-PROPOSAL-INQUIRY-009)**:
- `instr_A` 사용자가 SPEC-CONFIRM-001 `/me/inquiries`에서 PI1에 대해 "수락" 응답 입력
- (CONFIRM-001 트랜잭션 내부): INSERT INTO `instructor_responses (instructor_id=instr_A.id, project_id=NULL, proposal_inquiry_id=PI1.id, status='accepted', responded_at=now(), ...)` + UPDATE `proposal_inquiries SET status='accepted', responded_at=now(), responded_by_user_id=instr_A.user_id WHERE id=PI1.id` (Pattern A: 두 nullable FK + CHECK XOR — proposal inquiry는 project_id=NULL)

**Then (b)**:
- 본 SPEC의 `/proposals/P1` 응답 보드는 revalidate 후 `instr_A`를 `수락` 컬럼에 표시
- 본 SPEC은 `instructor_responses` 테이블을 조회하지 않고도 정상 동작 (계약은 `proposal_inquiries.status` 컬럼)
- 통합 테스트(integration.test.ts)에서 CONFIRM-001 미머지 환경 시뮬레이션: SQL 직접 UPDATE `UPDATE proposal_inquiries SET status='accepted', responded_at=now(), responded_by_user_id=user_A WHERE id=PI1.id`로 응답 시뮬레이션 가능 (Scenario 6 Note 참조)

**Edge Case 15a (CONFIRM-001 미머지 환경)**:

**Given**: SPEC-PROPOSAL-001만 단독 머지 (CONFIRM-001 미머지) — R-7 비상 상황

**Then**:
- 디스패치는 정상 동작 (본 SPEC 단독 흐름)
- 강사가 알림 클릭 → `/me/inquiries/<id>` 라우트 미존재 → 404
- `proposal_inquiries.status` 영구 `pending` 잔존 → 응답 보드는 `대기 중` 컬럼에만 표시
- 운영자 admin DB 작업으로 status 수동 갱신 가능 (RLS는 operator/admin FOR ALL 정책 통과)

---

## Scenario 16: RLS — service-role 클라이언트 미사용 (REQ-PROPOSAL-RLS-003)

**Refs**: REQ-PROPOSAL-RLS-003

**Given**:
- 본 SPEC implementation 완료
- 코드베이스 `src/lib/proposals/`, `src/app/(app)/(operator)/proposals/`, `src/components/proposals/`

**When**:
- 다음 grep 명령 실행:
  - `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/lib/proposals/ src/app/(app)/(operator)/proposals/ src/components/proposals/`
  - `grep -r "createClient.*service" src/lib/proposals/`
  - `grep -rE "createServiceRole|serviceRoleClient" src/lib/proposals/ src/app/(app)/(operator)/proposals/`

**Then**:
- 모든 grep 0 hits — 본 SPEC 영역 어디에서도 service-role Supabase client를 생성/사용하지 않음
- 모든 DB 작업은 user-scoped server client (`createServerClient` from `@supabase/ssr`)을 통해 RLS 인가 경로로 흐름
- 변환 액션 (`convertProposalToProject`) 또한 user-scoped client로 트랜잭션 실행 → operator/admin RLS 정책이 INSERT/UPDATE 인가 (REQ-PROPOSAL-RLS-002)

---

## Quality Gate — Definition of Done

본 SPEC의 모든 acceptance scenario PASS + 다음 게이트 만족 시 implementation 완료로 간주한다:

- [ ] `pnpm typecheck` 0 에러
- [ ] `pnpm lint` 0 critical
- [ ] `pnpm test:unit` 모든 케이스 PASS, `src/lib/proposals/` 라인 커버리지 ≥ 85%
- [ ] `pnpm test` integration test (시나리오 1~8 매핑) PASS
- [ ] `pnpm build` 0 에러
- [ ] `npx supabase start && pnpm db:verify` 18/18 + 본 SPEC 신규 항목 PASS
- [ ] SPEC-RECOMMEND-001 회귀: `src/lib/recommend/__tests__/score.test.ts` 모든 케이스 PASS, 가중치 0 변동
- [ ] SPEC-PROJECT-001 회귀: `projects` 테이블 schema 변경 0건, `src/lib/projects/__tests__/` PASS
- [ ] SPEC-DB-001 회귀: 기존 18 검증 PASS
- [ ] axe DevTools `/proposals`, `/proposals/new`, `/proposals/[id]` critical 0건
- [ ] Lighthouse Accessibility ≥ 95
- [ ] 한국어 UI + Asia/Seoul 시간대 표시 일관성
- [ ] MX 태그 추가: `@MX:ANCHOR` (validateProposalTransition, createProposal, listProposals, dispatchInquiries, convertProposalToProject), `@MX:WARN` (dispatchInquiries race, convertProposalToProject 트랜잭션, uploadProposalAttachment 일관성)

---

## Edge Cases Catalog (검증 필요)

본 SPEC의 critical edge cases 요약:

| EC ID | 시나리오 | 대응 |
|-------|---------|------|
| EC-01 | period_end < period_start | zod 거부 + 한국어 에러 |
| EC-02 | 중복 (proposal_id, instructor_id) 디스패치 | unique 제약 + 전체 롤백 + 한국어 에러 |
| EC-03 | frozen 제안서(won/lost/withdrawn) 수정/디스패치/변환 시도 | 모두 한국어 에러 반환, DB 변경 0건 |
| EC-04 | won 변환 멱등성 (converted_project_id IS NOT NULL 재호출) | 한국어 에러, projects 신규 INSERT 0건 |
| EC-05 | accepted 강사 0명 변환 | ai_instructor_recommendations INSERT skip, projects 변환은 성공 |
| EC-06 | accepted 강사 4명 이상 변환 | top3_jsonb는 최대 3명까지만 (capped at 3) |
| EC-07 | instructor 토큰으로 /proposals 접근 | silent redirect (route guard) |
| EC-08 | instructor가 RLS 우회 시도 (직접 SELECT) | RLS 정책 0 rows 반환 |
| EC-09 | 첨부 mime/size 위반 | 한국어 에러, Storage/files 0건 |
| EC-10 | 첨부 Storage 성공 + DB 실패 | 보상 deleteOrphanFile 호출 |
| EC-11 | 페이지 초과 요청 (page=999) | last valid page로 redirect |
| EC-12 | deleted_at IS NOT NULL 행 노출 | 0건 (filter 적용) |
| EC-13 | 동시 수정 (낙관적 동시성) | `expected_updated_at` 비교 → stale 한국어 에러 |
| EC-14 | 시그널 view 조회 (instructor 0건) | 0 또는 (0,0,0,NULL) row 반환 |
| EC-15 | SPEC-RECOMMEND-001 회귀 | score.ts 결과 0 변동, 모든 기존 테스트 PASS |
| EC-16 | 동시 변환 race (두 호출 병행 — Scenario 4d) | SELECT FOR UPDATE 직렬화 + 멱등 early-return → 정확히 1 projects row, 두 호출 동일 project_id |
| EC-17 | CONFIRM-001 미머지 단독 머지 (Scenario 15a) | 디스패치 정상, 알림 dead-link, status 'pending' 잔존, admin DB 수동 보정 |
| EC-18 | service-role 클라이언트 사용 시도 (Scenario 16) | grep 0 hits로 차단, 모든 DB 작업은 user-scoped client + RLS |

---

문서 끝.
