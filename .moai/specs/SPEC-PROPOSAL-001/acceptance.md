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

**Refs**: REQ-PROPOSAL-CONVERT-001, REQ-PROPOSAL-CONVERT-004, REQ-PROPOSAL-CONVERT-005

**Given**:
- `proposals` 테이블에 1행 존재 (`id=P1`, `status='submitted'`, `title="2026년 5월 데이터 분석 강의 제안"`, `client_id=client_X`, `operator_id=user_O`, `proposed_period_start=2026-05-15`, `proposed_period_end=2026-05-30`, `proposed_business_amount_krw=5000000`, `proposed_hourly_rate_krw=200000`, `converted_project_id=NULL`)
- `proposal_required_skills (P1, skill_A)`, `(P1, skill_B)` 2행
- `proposal_inquiries` 테이블에 3행 (`P1, instr_A, accepted`), `(P1, instr_B, declined)`, `(P1, instr_C, accepted)` (instr_A, instr_C가 수락)

**When**:
- operator가 `/proposals/P1` 상세 페이지에서 "수주" 버튼 클릭
- 확인 다이얼로그 통과
- Server Action `convertProposalToProject({ proposalId: 'P1' })` 호출

**Then** (단일 트랜잭션):
1. `projects` 테이블에 1행 INSERT
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
2. `project_required_skills (<new_pid>, skill_A)`, `(<new_pid>, skill_B)` 2행 INSERT
3. `ai_instructor_recommendations` 테이블에 1행 INSERT (accepted ≥ 1 이므로)
   - `project_id = <new_pid>`
   - `top3_jsonb = [{instructorId: instr_A, ...source:"fallback", reason:"사전 문의에서 수락한 후보 강사"}, {instructorId: instr_C, ...}]`
   - `model = 'manual_from_proposal'`
   - `adopted_instructor_id = NULL`
4. `proposals` UPDATE
   - `status = 'won'`
   - `decided_at = now()`
   - `converted_project_id = <new_pid>`
5. 트랜잭션 commit
6. HTTP 302 redirect → `/projects/<new_pid>`
7. SPEC-PROJECT-001 detail 페이지에서 신규 project 정상 표시

**Edge Case 4a (멱등성)**:

**Given**: Scenario 4 완료 후 (`proposals.converted_project_id IS NOT NULL`)

**When**: operator가 동일 제안서에 대해 "수주" 재시도

**Then**:
- 한국어 에러 `"이미 프로젝트로 변환된 제안서입니다."` 반환
- `projects` 신규 INSERT 0건
- `proposals` 변경 0건

**Edge Case 4b (status != submitted)**:

**Given**: `proposals.status = 'draft'` (제출 전)

**When**: operator가 "수주" 시도

**Then**:
- 한국어 에러 `"제출 상태의 제안서만 수주 처리할 수 있습니다."` 반환
- DB 변경 0건

**Edge Case 4c (accepted 강사 0명)**:

**Given**: `proposals.status='submitted'`, `proposal_inquiries` 모든 행이 `pending` 또는 `declined` 또는 `conditional` 상태 (accepted 0건)

**When**: operator가 "수주" → 변환 액션 호출

**Then**:
- Scenario 4의 Then 1, 2, 4단계는 동일 수행
- 3단계 (`ai_instructor_recommendations` INSERT)는 **skip** (accepted 0명이므로)
- 변환 자체는 성공, redirect 정상

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

---

문서 끝.
