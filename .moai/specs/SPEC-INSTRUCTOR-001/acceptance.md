# SPEC-INSTRUCTOR-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-INSTRUCTOR-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap 완료 + 테스트 강사/리뷰 seed 추가):

| 사용자 | 이메일 | 비밀번호 | role | 비고 |
|--------|--------|---------|------|------|
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` | SPEC-AUTH-001 M11 CLI 생성 |
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` | seed |
| Instructor | `instructor@algolink.test` | `InstructorPass!2026` | `instructor` | seed |

테스트 데이터 seed (acceptance 전용 SQL 또는 dev seed 확장):

| 이름 | 이메일 | 기술스택 | 강의 횟수 | 정산 합계(KRW) | 평균 만족도 (review N건) | 마지막 강의일 |
|------|--------|----------|----------|---------------|-------------------------|--------------|
| 김리액트 | `kim@test.local` | React, TypeScript | 5 | 12,000,000 | 4.6 (5건) | 2026-03-15 |
| 박파이썬 | `park@test.local` | Python, Django | 8 | 22,400,000 | 4.2 (10건) | 2026-04-10 |
| 이백엔드 | `lee@test.local` | Node.js, AWS | 3 | 7,500,000 | 3.5 (3건) | 2026-02-28 |
| 신입강사 | `new@test.local` | Java | 0 | 0 | - (0건) | - |
| 코멘트부족 | `noc@test.local` | Go | 2 | 4,800,000 | 4.0 (2건, 코멘트 1건만) | 2026-04-05 |
| 삭제된강사 | `deleted@test.local` | C++ | 1 | 1,500,000 | 3.0 (1건) | 2026-01-15 (deleted_at SET) |

총 6명 + SPEC-DB-001 기존 seed 강사 (실제 100명 부하 검증은 EC-perf 시나리오)

브라우저 환경: Chromium 최신, 쿠키 활성, JavaScript 활성.
환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `ANTHROPIC_API_KEY=<valid key>`.
서버: `pnpm dev` 또는 production build.

---

## 시나리오 1 — Operator가 강사 리스트를 조회 (6컬럼 정상 표시)

**대응 EARS:** REQ-INSTRUCTOR-LIST-001/002/007/009/010, REQ-INSTRUCTOR-GUARD-001, REQ-INSTRUCTOR-DATA-001/005/006/007

### Given

- Operator(`operator@algolink.test`)가 시스템에 로그인된 상태
- 데이터베이스에 위 6명 + 기존 seed 강사 존재
- `삭제된강사`는 `deleted_at IS NOT NULL`

### When

1. Operator가 sidebar의 "강사 관리" 메뉴 클릭 (또는 `/instructors`로 직접 이동)
2. `(operator)/layout.tsx`의 `requireRole(['operator', 'admin'])` 통과
3. `listInstructorsForOperator({ page: 1, pageSize: 20, sort: 'name_kr', dir: 'asc' })` 호출
4. 페이지 렌더링

### Then

- ✅ 페이지 타이틀 "강사 관리" 표시
- ✅ AppShell sidebar의 "/instructors" 항목이 active highlight 상태
- ✅ 테이블 컬럼 헤더: 이름 / 기술스택 / 강의 횟수 / 정산 합계 / 만족도 평균 / 마지막 강의일 6개
- ✅ `김리액트` 행: 기술스택 "React, TypeScript", 강의 횟수 5, 정산 합계 "12,000,000원", 만족도 평균 "4.6 (5)", 마지막 강의일 "2026-03-15"
- ✅ `박파이썬` 행: 강의 횟수 8, 정산 합계 "22,400,000원", 만족도 평균 "4.2 (10)", 마지막 강의일 "2026-04-10"
- ✅ `신입강사` 행: 강의 횟수 0, 정산 합계 "0원", 만족도 평균 "-", 마지막 강의일 "강의 이력 없음"
- ✅ `삭제된강사` 행이 **표시되지 않는다** (deleted_at 필터)
- ✅ "총 N명" 표시 (deleted 제외 카운트)
- ✅ 정산 합계가 모두 thousands separator + "원" 접미사 (예: `12,000,000원`)
- ✅ 마지막 강의일이 Asia/Seoul YYYY-MM-DD 포맷
- ✅ 모든 행이 클릭 가능 (포커스 시 Enter로 detail 진입)

---

## 시나리오 2 — 검색 / 필터 / 정렬 / 페이지네이션 동작

**대응 EARS:** REQ-INSTRUCTOR-LIST-003/004/005/006/007, REQ-INSTRUCTOR-A11Y-002/004

### Given

- 시나리오 1 상태 (`/instructors` 페이지 진입 완료)

### When (2-A: 이름 검색)

1. 검색 input에 `"김"` 입력 (debounce 300ms)
2. URL이 `?name=%EA%B9%80`로 업데이트
3. `listInstructorsForOperator({ name: '김', ... })` 재호출

### Then (2-A)

- ✅ `김리액트`만 표시 (또는 이름에 "김" 포함된 강사만)
- ✅ aria-live 영역에 `"1명의 강사가 검색되었습니다."` 메시지 announce
- ✅ "필터 초기화" 링크 활성

### When (2-B: 기술스택 필터)

1. skill multiselect 열고 `"React"` + `"Python"` 선택
2. URL이 `?skillIds=<react-id>,<python-id>`로 업데이트

### Then (2-B)

- ✅ React 또는 Python 보유 강사 모두 표시 (OR 의미)
- ✅ `김리액트`(React), `박파이썬`(Python) 모두 표시
- ✅ `이백엔드`(Node.js, AWS) 미표시

### When (2-C: 만족도 범위 필터)

1. 만족도 범위를 `4.0 ~ 5.0`으로 설정

### Then (2-C)

- ✅ 평균 만족도 4.0 이상 강사만 표시: `김리액트`(4.6), `박파이썬`(4.2), `코멘트부족`(4.0)
- ✅ `이백엔드`(3.5) 미표시
- ✅ `신입강사`(0건) — min이 0보다 크므로 미표시 (REQ-INSTRUCTOR-LIST-005)

### When (2-D: 정렬)

1. "강의 횟수" 컬럼 헤더 클릭 → URL `?sort=lecture_count&dir=desc`
2. 다시 클릭 → `?dir=asc`

### Then (2-D)

- ✅ DESC 시 `박파이썬`(8) → `김리액트`(5) → `이백엔드`(3) 순
- ✅ ASC 시 역순
- ✅ 헤더의 `aria-sort="descending"` 또는 `"ascending"` 속성 검증
- ✅ 다른 정렬 가능 컬럼 헤더의 aria-sort는 `"none"`

### When (2-E: 페이지네이션)

1. seed에 강사를 25명 이상 만든 상태 (또는 pageSize=2 임시 변경)
2. "다음" 버튼 클릭 → URL `?page=2`

### Then (2-E)

- ✅ 다음 페이지 행이 표시됨
- ✅ "총 N명" 카운트 일관
- ✅ 1페이지에서 "이전" 버튼 disabled
- ✅ 마지막 페이지에서 "다음" 버튼 disabled

---

## 시나리오 3 — 빈 결과 + 필터 초기화

**대응 EARS:** REQ-INSTRUCTOR-LIST-008, REQ-INSTRUCTOR-ERROR-002

### Given

- `/instructors` 페이지

### When

1. 검색에 `"존재하지않는이름XYZ"` 입력
2. 결과 0건

### Then

- ✅ 화면에 정확히 `"조건에 맞는 강사가 없습니다."` 표시
- ✅ "필터 초기화" 링크 노출
- ✅ "필터 초기화" 클릭 → URL의 모든 query param 제거 → 전체 리스트 복원
- ✅ 에러 페이지/스피너가 아닌 정상 empty state 컴포넌트 (HTTP 200)

---

## 시나리오 4 — 강사 상세 페이지 (3섹션 정상 + AI 요약)

**대응 EARS:** REQ-INSTRUCTOR-DETAIL-001~007, REQ-INSTRUCTOR-AI-001/002/003/005/008/010, REQ-INSTRUCTOR-A11Y-006

### Given

- Operator 로그인
- `김리액트` 강사 (review 5건, 코멘트 모두 채워짐)
- `public.ai_satisfaction_summaries`에 해당 instructor row 미존재 (cache miss)
- 유효한 `ANTHROPIC_API_KEY` 설정

### When

1. `/instructors`에서 `김리액트` 행 클릭
2. `/instructors/<uuid>`로 이동
3. RSC가 `getInstructorDetailForOperator(id)` await
4. 기본 정보 + 진행 이력 즉시 paint
5. Suspense fallback (Skeleton) 표시되며 `getOrGenerateSummary` 백그라운드 실행
6. Claude API 호출 → 응답 수신 → UPSERT `ai_satisfaction_summaries`
7. SummarySection 렌더 완료

### Then

- ✅ 페이지 타이틀 또는 H1: "김리액트"
- ✅ "← 강사 목록" back link 노출
- ✅ 기본 정보 섹션: 이름, 영문명(있다면), 이메일, 전화번호, 기술스택 chips, 등록일 (KST), "이력서 보기" 링크 (또는 disabled with tooltip "이력서 화면은 SPEC-ME-001 후속 작업입니다.")
- ✅ 진행 이력 테이블: 5개 프로젝트 row (end_date desc), 각 행에 프로젝트명/기간/score/comment(80자 truncate)
- ✅ AI 만족도 요약 섹션:
  - h2 "AI 만족도 요약"
  - h3 "강점" + 요약 텍스트
  - h3 "약점" + 요약 텍스트
  - h3 "추천 분야" + 요약 텍스트
  - 메타: "claude-sonnet-4-6 · 2026-04-27 14:32 (KST)" (실제 시각)
  - "재생성" 버튼
- ✅ AI 요약 텍스트는 한국어
- ✅ AI 요약에 강사 이름/이메일/전화 절대 미포함 (PII)
- ✅ DB 검증: `SELECT * FROM ai_satisfaction_summaries WHERE instructor_id = $kim_id` → 1 row, `generated_at` ≈ now

---

## 시나리오 5 — AI 요약 24h 캐시 적중

**대응 EARS:** REQ-INSTRUCTOR-AI-002

### Given

- 시나리오 4 완료 직후 (cache row 존재, generated_at < 24h)

### When

1. 페이지 새로고침 또는 다른 페이지로 갔다가 다시 `/instructors/<kim_id>` 진입
2. `getOrGenerateSummary` 호출

### Then

- ✅ Claude API 호출이 **발생하지 않는다** (네트워크 모니터에서 anthropic.com 호출 0건)
- ✅ 표시되는 summary 텍스트가 시나리오 4와 정확히 동일
- ✅ 메타 timestamp가 시나리오 4와 동일 (재생성되지 않음)

---

## 시나리오 6 — AI 요약 폴백 (Claude API 장애)

**대응 EARS:** REQ-INSTRUCTOR-AI-006/011, REQ-INSTRUCTOR-ERROR-002

### Given

- Operator 로그인
- `박파이썬` 강사 (review 10건, 코멘트 채워짐)
- `ai_satisfaction_summaries`에 해당 row 미존재 (cache miss)
- `ANTHROPIC_API_KEY=invalid_key_for_test` 또는 mock으로 5xx 강제

### When

1. `/instructors/<park_id>` 진입
2. `getOrGenerateSummary` 호출
3. Anthropic SDK가 401/5xx/timeout 에러 throw
4. 폴백 분기 실행

### Then

- ✅ 페이지가 정상 렌더링됨 (HTTP 200, error boundary 미사용)
- ✅ AI 요약 자리에 폴백 카드 노출:
  - `role="status"` 배너: `"AI 요약을 사용할 수 없어 평균 점수와 최근 코멘트로 대체합니다."`
  - 평균 점수 "4.2 / 5.0 (10건)"
  - 최근 코멘트 5건 리스트 (각 row: project title + score + comment)
- ✅ DB에 새 `ai_satisfaction_summaries` row가 생성되지 않음
- ✅ 응답 본문에 영어 에러 메시지나 stack trace 미노출

---

## 시나리오 7 — AI 요약 데이터 부족 (review < 3 with comment)

**대응 EARS:** REQ-INSTRUCTOR-AI-007, REQ-INSTRUCTOR-ERROR-002

### Given

- Operator 로그인
- `코멘트부족` 강사 (review 2건, 코멘트 1건만 non-empty)

### When

1. `/instructors/<noc_id>` 진입
2. `getOrGenerateSummary` 호출
3. comment IS NOT NULL AND <> '' 조건 만족 review가 1건 → kind: 'empty'

### Then

- ✅ Claude API 호출이 발생하지 않는다
- ✅ 화면에 정확히 `"AI 요약은 만족도 코멘트가 3건 이상 누적된 후 생성됩니다."` 메시지 노출
- ✅ 진행 이력 섹션은 정상 렌더링 (review 2건 표시)
- ✅ 폴백 카드 노출되지 **않음** (별개 분기)

---

## 시나리오 8 — 신규 강사 등록 + 초대 발송 + user_id 매핑

**대응 EARS:** REQ-INSTRUCTOR-CREATE-001~007, REQ-INSTRUCTOR-ERROR-002

### Given

- Operator 로그인
- `instructors` 테이블과 `auth.users`에 `newteacher@algolink.test` 미존재

### When

1. Operator가 `/instructors`에서 "강사 등록" 버튼 클릭 → `/instructors/new` 진입
2. 폼 입력: 이름 `최강사`, 영문명 `Choi Teacher`, 이메일 `newteacher@algolink.test`, 전화 `010-1234-5678`, 기술스택 `React`, `TypeScript` 선택
3. "등록 + 초대 발송" 버튼 클릭
4. Server Action `createInstructorAndInvite` 실행
5. (a) zod 검증 통과 → (b) email 중복 체크 통과 → (c) INSERT instructors → (d) INSERT instructor_skills 2건 → (e) `inviteUserByEmail(newteacher@..., { invited_role: 'instructor', metadata: { instructor_id } })` 성공
6. Server Action이 `revalidatePath` + `redirect(/instructors/<new_id>)` 수행
7. (운영자 시점 이후) 신규 강사가 이메일에서 초대 링크 클릭 → SPEC-AUTH-001 set-password 흐름 수행 → 비밀번호 설정 완료
8. SPEC-AUTH-001 accept-invite Server Action이 `metadata.instructor_id`를 읽고 `UPDATE instructors SET user_id = auth.user.id WHERE id = $instructor_id` 실행

### Then (운영자 측)

- ✅ 운영자 화면이 `/instructors/<new_id>` 상세 페이지로 이동
- ✅ Success toast `"강사를 등록하고 초대 메일을 발송했습니다."` 노출
- ✅ DB 검증:
  - `instructors`에 `최강사` row 1건 (`name_kr='최강사'`, `email='newteacher@...'`, `created_by=<operator_id>`, `user_id IS NULL`)
  - `instructor_skills`에 해당 instructor_id 2 row (React + TypeScript)
  - `auth.users`에 `newteacher@...` 1 row (`email_confirmed_at IS NULL` until accept)
  - `user_invitations`에 `email = newteacher@..., invited_role = instructor` row, metadata에 `instructor_id` 포함
- ✅ `auth_events`에 `event_type = 'invitation_issued'` 1 row

### Then (강사 수락 후)

- ✅ `instructors.user_id`가 신규 사용자의 auth user id와 일치하도록 UPDATE됨
- ✅ 신규 강사가 `/me/dashboard` 진입 가능 (SPEC-ME-001 작업 후 검증, 본 SPEC에서는 user_id 매핑만 검증)
- ✅ Operator 측 `/instructors` 리스트에 `최강사` 행 노출 (강의 횟수 0, 만족도 -)

---

## 시나리오 9 — 등록 폼 이메일 중복 거부

**대응 EARS:** REQ-INSTRUCTOR-CREATE-004, REQ-INSTRUCTOR-ERROR-002

### Given

- Operator 로그인
- 시나리오 8 완료 (`newteacher@algolink.test` 이미 등록)

### When

1. Operator가 `/instructors/new` 재진입
2. 동일 이메일 `newteacher@algolink.test` 입력 후 등록 시도

### Then

- ✅ Server Action이 이메일 중복 감지 → `{ ok: false, error: '이미 등록된 이메일입니다.' }` 반환
- ✅ 폼 상단 또는 이메일 필드 옆 alert에 `"이미 등록된 이메일입니다."` 표시
- ✅ DB에 신규 row 추가되지 **않음** (instructors, instructor_skills, auth.users, user_invitations 모두 변동 없음)
- ✅ 페이지 redirect 발생하지 않음 (폼 상태 유지)

---

## 시나리오 10 — 등록 후 invitation 실패 → instructor row rollback

**대응 EARS:** REQ-INSTRUCTOR-CREATE-006

### Given

- Operator 로그인
- Anthropic 외 Supabase 측 `inviteUserByEmail`이 5xx 반환하도록 mock (또는 service role key 임시 무효화)
- `failingteacher@algolink.test` 미등록

### When

1. `/instructors/new`에서 정상 입력 + 제출
2. INSERT instructors 성공 → INSERT instructor_skills 성공 → `inviteUserByEmail` 실패 (5xx)
3. compensating action: DELETE instructors WHERE id = $newId

### Then

- ✅ 화면에 `"초대 발송에 실패했습니다. 잠시 후 다시 시도해주세요."` 에러 메시지
- ✅ DB 검증: `instructors`에 `failingteacher@...` row 미존재 (rollback 완료)
- ✅ `instructor_skills`에 관련 row 미존재 (CASCADE 또는 명시적 DELETE)
- ✅ `auth_events`에 `invitation_issued` row 생성되지 **않음**
- ✅ Operator는 폼 페이지에 머무름 (재시도 가능)

---

## 시나리오 11 — Instructor 역할이 strenger 라우트 접근 시 silent redirect

**대응 EARS:** REQ-INSTRUCTOR-GUARD-001/002 (SPEC-AUTH-001 GUARD-003 inheritance)

### Given

- Instructor(`instructor@algolink.test`) 로그인 상태

### When

1. URL을 `/instructors`, `/instructors/<any_id>`, `/instructors/new`로 직접 변경

### Then

- ✅ 모든 3개 path에서 HTTP 307 redirect to `/me/dashboard`
- ✅ 응답 본문에 다른 강사의 이름/이메일/만족도 데이터 절대 미노출
- ✅ DevTools Network 탭에서 응답 status 307, body 비어있음
- ✅ "권한 없음", "403", "Forbidden" 등 텍스트 미노출
- ✅ 브라우저 주소창이 `/me/dashboard`로 변경됨

---

## 시나리오 12 — Soft-deleted 강사 직접 접근

**대응 EARS:** REQ-INSTRUCTOR-DETAIL-005, REQ-INSTRUCTOR-GUARD-004

### Given

- Operator 로그인
- `삭제된강사` 강사 (`deleted_at IS NOT NULL`)
- 해당 instructor의 UUID를 운영자가 알고 있음

### When

1. `/instructors/<deleted_id>`로 직접 이동

### Then

- ✅ Next.js `notFound()` 트리거 → `not-found.tsx` 렌더
- ✅ 화면에 `"존재하지 않는 강사입니다."` 메시지
- ✅ 응답 HTTP 404
- ✅ 응답 본문에 강사의 이름/이메일/만족도 절대 미노출

---

## 추가 검증 (Edge Cases & Quality Gates)

### EC-1 — 만족도 범위 입력 오류 (min > max)

- **Given**: `/instructors` 페이지
- **When**: 만족도 min=4.5, max=2.0 입력 시도
- **Then**: zod validator로 차단, `"최소 만족도는 최대 만족도보다 작거나 같아야 합니다."` 에러. URL 미변경.

### EC-2 — 만족도 범위 0 review 강사 처리

- **Given**: 시나리오 1 상태
- **When**: 만족도 범위 `0.0 ~ 5.0` (min=0)
- **Then**: `신입강사`(0건) 포함됨 (REQ-INSTRUCTOR-LIST-005 단서)

### EC-3 — AI 요약 PII 미포함 (단위 테스트 + e2e)

- **Given**: `김리액트` 강사 row + 5건 review
- **When**: `buildSummaryPrompt(reviews)` 호출 (단위 테스트)
- **Then**: 반환된 system + user 텍스트 어느 곳에도 `김리액트`, `kim@test.local`, `010-` 등 PII 미포함. `expect(prompt.toString()).not.toContain('김리액트')` 등.
- **Given**: 시나리오 4 상태 (실제 요약 생성 후)
- **When**: `summary_text` 검증
- **Then**: 강사 이름/이메일/전화 미포함

### EC-4 — auth_events RLS 검증 (instructor 차단)

- **Given**: instructor 로그인
- **When**: SQL `SELECT * FROM public.instructors`
- **Then**: SPEC-DB-001 RLS `instructors_self_select`로 자신의 row만 반환. 다른 강사 row 0 rows.

### EC-5 — Operator/Admin RLS 검증

- **Given**: operator 로그인
- **When**: SQL `SELECT * FROM public.instructors WHERE deleted_at IS NULL`
- **Then**: 모든 활성 강사 row 반환. PII bytea 컬럼은 SELECT되지만 view 사용 시 미포함.

### EC-6 — 정산 합계 status 정의 검증

- **Given**: 강사 X에 대해 settlements가 다양한 status (`requested`, `completed`, `pending`, `draft` 등)
- **When**: list 쿼리의 정산 합계 컬럼
- **Then**: REQ-INSTRUCTOR-DATA-006이 정의한 paid/in-progress status만 SUM에 포함. SQL로 직접 비교 검증.

### EC-7 — AI 재생성 버튼 rate limit

- **Given**: `/instructors/<kim_id>` 상세 페이지, AI 요약 정상 표시
- **When**: "재생성" 버튼을 1초 간격으로 3회 클릭
- **Then**: 첫 호출만 Claude API 실제 호출, 2-3번째는 rate limit 메시지 또는 disabled. DB row가 한 번만 UPSERT됨.

### EC-8 — Asia/Seoul 타임존 표시

- **Given**: 시나리오 1 상태, server timezone이 UTC
- **When**: 마지막 강의일이 UTC 2026-03-14T18:00:00Z인 강사
- **Then**: 화면에 `2026-03-15` 표시 (KST = UTC+9)

### EC-9 — list 쿼리 성능 (100명 부하)

- **Given**: dev seed에 강사 100명 + 각 강사당 5-20 reviews + 3-10 settlements 적재
- **When**: `/instructors` 페이지 진입 (page=1, sort=name_kr)
- **Then**: 서버 응답 시간 < 1.0s (REQ-INSTRUCTOR-DATA-004). 미달 시 EXPLAIN ANALYZE + SPEC-DB-002 분리 결정.

### EC-10 — AI 요약 정확도 운영자 수동 검증

- **Given**: 시나리오 4 완료 상태, 김리액트/박파이썬/이백엔드 3명 요약 생성됨
- **When**: 운영자가 각 강사의 review 코멘트를 직접 읽고 AI 요약과 대조
- **Then**: 3명 모두 다음 항목 충족:
  - 강점 섹션이 실제 긍정 코멘트 키워드와 1개 이상 일치
  - 약점 섹션이 실제 부정/개선 코멘트 키워드와 1개 이상 일치 (또는 review가 모두 긍정인 경우 "특별한 약점 없음" 명시)
  - 추천 분야가 강사의 실제 기술스택과 일관됨
  - 환각(review에 없는 사실 진술) 0건
- 운영자가 P/F 판정 + 코멘트를 progress.md에 기록

---

## 품질 게이트 (Quality Gates)

본 SPEC이 `status: completed`로 전환되기 위한 자동 검증:

| 게이트 | 명령 또는 도구 | 통과 기준 |
|--------|---------------|----------|
| Build | `pnpm build` | 0 error, 0 critical warning |
| Type | `pnpm tsc --noEmit` | 0 error |
| Lint | `pnpm exec eslint .` | 0 critical |
| Unit tests | `pnpm vitest run src/lib/instructor src/lib/ai` | 모두 PASS |
| 마이그레이션 | (변경 없음) | SPEC-DB-001 그대로 |
| Accessibility (axe DevTools) | `/instructors`, `/instructors/[id]`, `/instructors/new` | critical 0건 / serious 0건 (3개 페이지) |
| Lighthouse Accessibility | 3개 페이지 | 평균 ≥ 95 |
| 시나리오 | 본 문서 시나리오 1-12 | 모두 PASS |
| Edge cases | EC-1 ~ EC-10 | 모두 PASS |
| 성능 | EC-9 100명 seed list 쿼리 | < 1.0s |
| AI 정확도 | EC-10 운영자 수동 검증 | 3/3 명 PASS |
| Service role key 비노출 | `grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static/` | 0 hit (SPEC-AUTH-001 검증 동일) |
| Anthropic 키 비노출 | `grep -r "ANTHROPIC_API_KEY\|sk-ant-" .next/static/` | 0 hit |

---

## Definition of Done (인수 기준)

본 SPEC은 다음을 모두 만족할 때 사용자가 `/moai sync SPEC-INSTRUCTOR-001`을 실행할 수 있다:

- [ ] plan.md §5의 DoD 22개 항목 모두 ✓
- [ ] 본 acceptance.md의 시나리오 1-12 모두 PASS
- [ ] 본 acceptance.md의 EC-1 ~ EC-10 모두 PASS
- [ ] 품질 게이트 표의 모든 항목 통과
- [ ] AI 요약 정확도 운영자 수동 검증 3명 통과 + progress.md에 기록
- [ ] SPEC-AUTH-001의 accept-invite 액션에 `metadata.instructor_id` 기반 user_id 매핑 추가 완료 (또는 trigger fallback)
- [ ] `.moai/specs/SPEC-INSTRUCTOR-001/spec.md`의 `status` 필드를 `draft` → `completed`로 변경
- [ ] `.moai/specs/SPEC-INSTRUCTOR-001/spec.md`의 `updated` 필드를 완료 일자로 갱신
- [ ] HISTORY 항목에 완료 시점 entry 추가

---

_End of SPEC-INSTRUCTOR-001 acceptance.md_
