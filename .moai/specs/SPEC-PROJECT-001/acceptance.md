# SPEC-PROJECT-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-PROJECT-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap 완료):

### 사용자
| 사용자 | 이메일 | 비밀번호 | role |
|--------|--------|---------|------|
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` |
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` |
| Instructor (제 3자 접근 검증용) | `instructor@algolink.test` | `InstructorPass!2026` | `instructor` |

### 강사 후보 (SPEC-DB-001 seed가 생성)
| 강사 ID (별칭) | 이름 | `instructor_skills` | `satisfaction_reviews` 평균 | `schedule_items` (`unavailable`) |
|----------------|------|---------------------|------------------------------|-----------------------------------|
| INS-A | 강사 A | Python(expert), Django(advanced), PostgreSQL(intermediate) | 4.6/5 (8건) | 없음 |
| INS-B | 강사 B | Python(advanced), FastAPI(expert), Docker(advanced) | 4.2/5 (5건) | 2026-05-03 ~ 2026-05-05 |
| INS-C | 강사 C | TypeScript(expert), React(expert) | 0건 (cold start) | 없음 |
| INS-D | 강사 D | Python(beginner), Java(expert) | 3.0/5 (2건) | 없음 |

### 고객사
| 고객사 ID (별칭) | 이름 |
|------------------|------|
| CLI-1 | 알고고객사 (사업자) |
| CLI-2 | 정부기관 (예산) |

### 환경
- 브라우저: Chromium 최신, 쿠키 활성, JavaScript 활성
- 서버: `pnpm dev`
- DB: 로컬 Supabase (SPEC-DB-001 마이그레이션 + SPEC-AUTH-001 마이그레이션 + SPEC-PROJECT-001 신규 마이그레이션 적용 완료)
- 환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `ANTHROPIC_API_KEY=<유효키>`
- 시간: 시나리오 실행 시각 ≤ 2026-05-01 (강사 D의 일정 충돌 검증 등 시간 의존)

---

## 시나리오 1 — Operator가 신규 프로젝트를 등록하고 상세 페이지에 도달

**대응 EARS:** REQ-PROJECT-CREATE-001~005, REQ-PROJECT-DETAIL-001~003, REQ-PROJECT-RLS-001

### Given
- Operator가 `/dashboard`에 로그인되어 있음
- 데이터베이스에 동일 제목의 프로젝트가 존재하지 않음
- CLI-1 고객사가 `clients` 테이블에 존재
- 기술스택 `Python`, `Django`가 `skill_categories` (leaf node)에 존재

### When
1. Operator가 사이드바에서 "Projects" 클릭 → `/projects`로 이동
2. 우상단 "신규 의뢰" 버튼 클릭 → `/projects/new`로 이동
3. 폼에 다음 입력:
   - 제목: `Django 백엔드 부트캠프 2026 봄`
   - 고객사: `알고고객사`
   - 프로젝트 유형: `education`
   - 시작일: `2026-05-10 09:00`
   - 종료일: `2026-05-14 18:00`
   - 기술스택: `Python`, `Django` (2개 multi-select)
   - 사업비: `5,000,000`
   - 강사비: `3,000,000`
   - 비고: 빈칸
4. "등록" 버튼 클릭

### Then
- ✅ HTTP 307 redirect로 `/projects/<신규UUID>` 도달
- ✅ `projects` 테이블에 1행 INSERT: `status = 'proposal'`, `operator_id = (operator의 id)`, `instructor_id IS NULL`, `business_amount_krw = 5000000`, `instructor_fee_krw = 3000000`, `margin_krw = 2000000` (GENERATED)
- ✅ `project_required_skills`에 2행 INSERT (Python skill_id, Django skill_id)
- ✅ 상세 페이지 헤더에 "Django 백엔드 부트캠프 2026 봄" 표시, 고객사 "알고고객사" 표시
- ✅ status stepper에서 `의뢰` 단계가 활성화 (`aria-current="step"`)
- ✅ "강사 미배정" 배지 표시
- ✅ "강사 추천 실행" CTA 버튼 노출
- ✅ `start_date`, `end_date`가 KST 시간대로 표시 (예: `2026-05-10 09:00 KST`)
- ✅ `project_status_history`에 INSERT row 1건 (`from_status = NULL, to_status = 'proposal'`)

---

## 시나리오 2 — Top-3 AI 강사 추천 (정상 Claude 응답)

**대응 EARS:** REQ-PROJECT-RECOMMEND-001~006, -010, REQ-PROJECT-A11Y-006

### Given
- 시나리오 1이 완료되어 신규 프로젝트가 존재
- Operator가 해당 `/projects/<id>` 페이지에 머물러 있음
- `ANTHROPIC_API_KEY`가 유효
- 강사 INS-A, INS-B, INS-C, INS-D가 §사전 준비와 같이 존재
- 프로젝트 일정 `2026-05-10 ~ 2026-05-14`은 INS-B의 `unavailable` 일정 `2026-05-03 ~ 2026-05-05`와 겹치지 않음

### When
1. Operator가 "강사 추천 실행" 버튼 클릭
2. 화면에 `RecommendationSkeleton`이 표시되며 `aria-live="polite"`로 `"AI가 추천을 생성하고 있습니다..."` 안내
3. Server Action `runRecommendation`이 (a) 강사 candidate 4명 fetch, (b) 점수 계산, (c) Top-3 추출, (d) Claude API 호출, (e) `ai_instructor_recommendations` INSERT 수행
4. 응답 도착 후 라이브 영역이 `"추천 3건이 준비되었습니다."` 안내

### Then
- ✅ Top-3 카드가 점수 내림차순으로 표시
- ✅ 1순위는 **INS-A** (Python expert + Django advanced 매칭, satisfaction 4.6/5, 일정 OK → score ≈ 0.5×0.95 + 0.3×1.0 + 0.2×0.9 = 0.955)
- ✅ 2순위는 **INS-B** (Python advanced 매칭 + Django 미보유, 일정 OK, satisfaction 4.2 → score ≈ 0.5×0.45 + 0.3×1.0 + 0.2×0.8 = 0.685)
- ✅ 3순위는 **INS-D** (Python beginner + Django 미보유, 일정 OK, satisfaction 3.0 → score ≈ 0.5×0.20 + 0.3×1.0 + 0.2×0.5 = 0.500)
- ✅ INS-C는 Top-3에서 제외 (Python/Django 0건 매칭 → skillMatch=0 → 추천 후보 자격 미달)
- ✅ 각 카드에 한국어 사유 텍스트 (Claude 생성, 10~280자) 표시
- ✅ 카드 하단에 매칭된 skill 태그 (예: `Python`, `Django`)
- ✅ "AI 추천은 참고용이며 최종 배정은 담당자가 결정합니다." 디스클레이머 표시
- ✅ DB `ai_instructor_recommendations`에 1행 INSERT: `project_id`, `top3_jsonb` (3개 객체 with score/reason/source='claude'), `model = 'claude-sonnet-4-6'`, `adopted_instructor_id IS NULL`
- ✅ DevTools Network 탭에서 Anthropic API 호출 1건 확인 (cache hit 표시는 첫 호출이므로 부분일 수 있음)

---

## 시나리오 3 — Claude API 장애 시 룰 기반 폴백

**대응 EARS:** REQ-PROJECT-RECOMMEND-004, REQ-PROJECT-RECOMMEND-005 (source='fallback')

### Given
- 시나리오 1과 동일한 프로젝트가 존재 (또는 새 프로젝트 생성)
- 환경변수 `ANTHROPIC_API_KEY=invalid_dummy_key_xxx` (의도적 차단) 또는 Anthropic API 호스트를 hosts 파일로 차단

### When
1. Operator가 "강사 추천 실행" 버튼 클릭
2. Server Action 내부에서 Claude API 호출이 401 또는 타임아웃 실패
3. 시스템이 `fallback.ts`의 룰 기반 사유 템플릿으로 전환
4. `console.warn`에 `"[recommendation] Claude API failed, falling back to rule-based reason"` 로그 출력

### Then
- ✅ 사용자에게 에러가 노출되지 **않음** (toast 없음, 페이지 정상 렌더)
- ✅ Top-3 카드가 시나리오 2와 동일한 순위로 표시
- ✅ 각 카드의 사유 텍스트가 정확히 다음 형식: `"기술스택 ${matched}/${total}건 일치, 만족도 ${mean.toFixed(1)}/5, 가용 일정 OK"`
  - INS-A: `"기술스택 2/2건 일치, 만족도 4.6/5, 가용 일정 OK"`
  - INS-B: `"기술스택 1/2건 일치, 만족도 4.2/5, 가용 일정 OK"`
  - INS-D: `"기술스택 1/2건 일치, 만족도 3.0/5, 가용 일정 OK"` (Python beginner도 매칭 1건으로 카운트)
- ✅ UI에 `"AI 사유 생성 실패 — 점수 기반 요약"` 보조 라벨 작게 표시
- ✅ DB `ai_instructor_recommendations.top3_jsonb`의 각 항목 `source = 'fallback'`, `model IS NULL`
- ✅ 서버 로그에 `console.warn` 1건 (또는 그 이상)

---

## 시나리오 4 — 1-클릭 배정 요청 → notifications INSERT + 콘솔 로그

**대응 EARS:** REQ-PROJECT-ASSIGN-001~005, REQ-PROJECT-RECOMMEND-005 (`adopted_instructor_id` 갱신)

### Given
- 시나리오 2가 완료된 상태 (Top-3 카드 표시 중, `ai_instructor_recommendations`에 1행 존재)
- 1순위는 INS-A
- `notifications` 테이블 `assignment_request` enum value 가 마이그레이션으로 추가됨

### When
1. Operator가 1순위 카드의 "배정 요청" 버튼 클릭
2. 확인 다이얼로그 `"INS-A에게 배정 요청을 보냅니다. 계속하시겠습니까?"` 표시
3. "확인" 클릭
4. Server Action `assignInstructor({ projectId, instructorId: INS-A_id, recommendationId: <UUID> })` 호출
5. PostgreSQL 트랜잭션 시작:
   - `UPDATE projects SET instructor_id = INS-A_id, status = 'assignment_review' WHERE id = ...`
   - `UPDATE ai_instructor_recommendations SET adopted_instructor_id = INS-A_id WHERE id = ...`
   - `INSERT INTO notifications (recipient_id, type, title, body, link_url) VALUES (INS-A의 user_id, 'assignment_request', ...)`
6. 트랜잭션 COMMIT
7. `console.log("[notif] assignment_request → instructor_id=<INS-A의 id> project_id=<id>")` 출력
8. `revalidatePath` 후 페이지 새로고침

### Then
- ✅ `projects.instructor_id = INS-A_id` (DB SELECT 검증)
- ✅ `projects.status = 'assignment_review'` (이전: `'proposal'` → 트랜잭션에서 자동 전환되지 않음, 별도 검증 케이스로 분리; 단 시나리오에 따라 `lecture_requested/instructor_sourcing` 상태에서만 자동 전환됨; 본 시나리오에서는 status가 `proposal`이었으므로 자동 전환 미발생, 별도 status 전환 단계 필요 — REQ-PROJECT-ASSIGN-002 참조)
  - **수정 시나리오 4-A**: 시나리오 1에서 status를 `instructor_sourcing`으로 미리 변경한 뒤 배정 → 이때 `assignment_review`로 자동 전환됨
- ✅ `ai_instructor_recommendations.adopted_instructor_id = INS-A_id`
- ✅ `notifications` 테이블에 1행 INSERT:
  - `recipient_id = INS-A_id`
  - `type = 'assignment_request'`
  - `title` 에 프로젝트 제목 포함
  - `body` 에 `start_date`/`end_date` 포함
  - `link_url = '/me/dashboard'` (현재 MVP placeholder)
  - `read_at IS NULL`
- ✅ 서버 콘솔에 정확히 `"[notif] assignment_request → instructor_id=<UUID> project_id=<UUID>"` 출력
- ✅ 페이지 새로고침 후 헤더에 "강사 미배정" 사라지고 "강사 A (만족도 4.6/5)" 표시
- ✅ "강사 추천 실행" CTA가 사라지고 배정 이력 섹션에 직전 추천 결과가 표시 (`adopted` 표시 포함)
- ✅ `project_status_history`에 status 전환 1행 추가 (자동 전환된 경우)

---

## 시나리오 5 — 강사 미배정 상태에서 `컨펌` 전환 시도 거부

**대응 EARS:** REQ-PROJECT-STATUS-002, -003, REQ-PROJECT-EDIT-003

### Given
- 시나리오 1로 신규 프로젝트가 생성됨 (`status = 'proposal'`, `instructor_id IS NULL`)
- 시나리오 4의 배정 단계는 수행하지 않음

### When
1. Operator가 상세 페이지의 status stepper에서 직접 `컨펌` 단계를 클릭 (또는 dropdown으로 `assignment_confirmed` 선택)
2. Server Action `transitionStatus({ to: 'assignment_confirmed' })` 호출
3. `validateTransition('proposal', 'assignment_confirmed', project)` 실행
4. 검증 결과: `{ ok: false, reason: "강사를 배정해야 컨펌 단계로 이동할 수 있습니다." }`

### Then
- ✅ UI 상단에 빨간 배경의 `<Alert role="alert">`로 정확히 다음 메시지 표시: `"강사를 배정해야 컨펌 단계로 이동할 수 있습니다."`
- ✅ 페이지 stepper의 활성 단계는 `의뢰` (변경 없음)
- ✅ DB `projects.status = 'proposal'` (변경 없음)
- ✅ `project_status_history`에 새 row 추가되지 **않음**
- ✅ `console.warn` 또는 `console.log`에 status 전환 시도 흔적 없음 (validate 단계에서 차단)

---

## 시나리오 6 — 리스트 검색·필터·페이지네이션

**대응 EARS:** REQ-PROJECT-LIST-001~007

### Given
- DB에 25개 이상의 프로젝트가 존재 (seed 또는 시나리오 1 반복)
- 그 중 8개는 `status = 'in_progress'`
- 그 중 5개는 `operator_id = (현재 Operator의 id)`
- 검색어 `"부트캠프"`가 제목에 포함된 프로젝트 3개 존재

### When (6-A: 상태 필터)
1. Operator가 `/projects`에 진입 → 기본 페이지 (모든 상태, page=1)
2. 필터 바에서 상태 multi-select에서 `진행`만 선택
3. URL이 `/projects?status=in_progress&page=1`로 갱신

### Then (6-A)
- ✅ 결과 행 수가 8개 (또는 페이지당 limit 20 이하)
- ✅ 모든 행의 status 배지가 `진행` (한국어 라벨, badge color `--badge-status-progress`)
- ✅ 페이지네이션 컨트롤 표시 (총 8건 → 1페이지로 표시, "다음" 비활성)

### When (6-B: 담당자 필터 + 검색어 조합)
1. 6-A 결과에서 추가로 "내 프로젝트만" 토글 ON + 검색창에 `부트캠프` 입력 후 Enter
2. URL이 `/projects?status=in_progress&operator_id=<self>&q=%EB%B6%80%ED%8A%B8%EC%BA%A0%ED%94%84&page=1`

### Then (6-B)
- ✅ 결과 행 수 = (in_progress AND operator_id=self AND title ILIKE '%부트캠프%')
- ✅ 모든 행이 세 조건 모두 만족
- ✅ `<table caption>`에 `"교육 프로젝트 목록 - 상태: 진행, 내 담당, 검색: 부트캠프"` 같은 동적 캡션

### When (6-C: 페이지네이션 over-flow)
1. URL을 `/projects?page=999`로 직접 입력

### Then (6-C)
- ✅ HTTP 307 redirect로 마지막 유효 페이지(예: `?page=2`)로 이동
- ✅ 빈 결과가 표시되지 **않음**

---

## 시나리오 7 — Instructor가 `/projects` 접근 시 silent redirect

**대응 EARS:** REQ-PROJECT-RLS-001, -003 (SPEC-AUTH-001 REQ-AUTH-GUARD-003 재사용)

### Given
- Instructor(`instructor@algolink.test`)가 로그인된 상태
- 현재 페이지: `/me/dashboard`

### When
1. 브라우저 URL을 `/projects`로 직접 변경 후 Enter
2. middleware의 1차 가드 또는 `(operator)/layout.tsx` 가드가 role mismatch 감지

### Then
- ✅ HTTP 307 응답으로 `Location: /me/dashboard` 헤더 전송
- ✅ 응답 본문에 "권한 없음", "403", "Forbidden", `/projects` 등 어떤 텍스트도 노출되지 **않음**
- ✅ 프로젝트 리스트 콘텐츠가 렌더되지 **않음**
- ✅ 동일 동작이 `/projects/new`, `/projects/<random-uuid>`, `/projects/<random-uuid>/edit` 모두에 적용
- ✅ Instructor가 `/me/*` 4종 path는 정상 접근 가능 (regression 없음)

---

## 추가 검증 (Edge Cases & Quality Gates)

다음 항목은 7개 주요 시나리오와 별도로 검증한다.

### EC-1 — 후보 강사 0명 (모든 강사가 기술스택 미보유)

- **Given**: 신규 프로젝트의 `required_skill_ids`에 어떤 강사도 보유하지 않은 skill (예: `Cobol`)만 선택
- **When**: "강사 추천 실행" 클릭
- **Then**: Top-0 결과 + 한국어 안내 `"기술스택을 만족하는 후보가 0명입니다."` 표시. `ai_instructor_recommendations` row는 INSERT (top3_jsonb는 빈 배열). Claude API 호출 안 함.

### EC-2 — 후보 강사 2명 (Top-3 미만)

- **Given**: `required_skill_ids`에 매칭되는 강사가 정확히 2명만 존재
- **When**: "강사 추천 실행" 클릭
- **Then**: Top-2 카드 표시 + 한국어 안내 `"기술스택을 만족하는 후보가 2명입니다."`. `top3_jsonb`는 2개 객체.

### EC-3 — 동점 처리 (안정 정렬)

- **Given**: 두 강사 INS-A와 INS-A2가 동일 점수 (예: 0.8)
- **When**: 추천 실행
- **Then**: 정렬은 score 내림차순, 동점 시 `instructor_id` 사전순(stable). 동일 입력에서 결과 순서가 항상 같음.

### EC-4 — 추천 다시 실행 (이력 누적)

- **Given**: 시나리오 2 완료 후 `ai_instructor_recommendations` 1행 존재
- **When**: 사용자가 detail 페이지에서 "추천 다시 실행" 버튼 클릭 (확인 다이얼로그 후 확정)
- **Then**: `ai_instructor_recommendations`에 새 row INSERT (총 2행). detail 페이지의 "현재 추천"은 최신 row, "배정 이력" 섹션에 직전 row 표시. KPI 쿼리는 두 row 모두 카운트.

### EC-5 — 동시성 충돌 (낙관적 locking)

- **Given**: Operator A와 Operator B가 동시에 동일 프로젝트 `/projects/<id>/edit` 페이지를 열어 둠
- **When**: A가 사업비를 수정 후 저장 (성공) → B가 강사비를 수정 후 저장 시도
- **Then**: B의 Server Action이 `expected_updated_at !== current updated_at` 감지 → 한국어 메시지 `"다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요."` 표시. DB 변경 없음. A의 변경은 보존.

### EC-6 — `task_done` 상태에서 수정 차단

- **Given**: 프로젝트 status가 `task_done` (정산 완료)
- **When**: Operator가 `/projects/<id>/edit` 접근
- **Then**: 모든 form input이 `disabled`, "수정" 버튼 비활성. Admin 전용 "되돌리기" 버튼만 노출 (admin 로그인 시).

### EC-7 — Admin force=true 우회

- **Given**: 강사 미배정 상태의 프로젝트, Admin 로그인
- **When**: Admin이 `transitionStatus({ to: 'assignment_confirmed', force: true })` 호출 (UI는 admin에게만 노출되는 dropdown 또는 dev tool)
- **Then**: validateTransition 우회 → DB UPDATE 성공 → `project_status_history` 자동 기록 + 서버 콘솔에 `console.warn("[admin-override] status transition forced ...")` 출력. Operator role로는 동일 호출 시 거부.

### EC-8 — 추천 결과에 없는 강사 배정 시도 (operator)

- **Given**: 시나리오 2 완료 후 Top-3은 INS-A, INS-B, INS-D
- **When**: Operator가 dev tool로 Server Action에 `instructorId = INS-C_id` (Top-3에 없음) 전송
- **Then**: 거부 + 한국어 메시지 `"추천 결과에 포함되지 않은 강사는 배정할 수 없습니다. 추천을 다시 실행하세요."`. DB 변경 없음.

### EC-9 — 추천 결과에 없는 강사 배정 시도 (admin force)

- **Given**: 동일 상황, Admin 로그인 + `force=true`
- **When**: Admin이 INS-C 배정
- **Then**: 우회 성공 → `notifications` INSERT + `instructor_id` 갱신. 단 `adopted_instructor_id`는 NULL 유지 (KPI에 영향 안 미치도록).

### EC-10 — `notifications` INSERT 실패 시 트랜잭션 롤백

- **Given**: 시뮬레이션을 위해 `notifications` 테이블의 RLS를 임시 변경하여 INSERT 거부 시나리오 강제
- **When**: Operator가 1-클릭 배정 요청
- **Then**: 트랜잭션 ROLLBACK → `projects.instructor_id` 변경 없음 + `adopted_instructor_id` 변경 없음. 사용자에게 한국어 에러 `"배정에 실패했습니다. 잠시 후 다시 시도해주세요."` 표시. 콘솔에 에러 로그.

### EC-11 — `start_date >= end_date` 폼 검증

- **Given**: `/projects/new` 폼
- **When**: 시작일 `2026-05-14 09:00`, 종료일 `2026-05-10 18:00` 입력 후 제출
- **Then**: zod 검증 실패. 한국어 에러 `"종료일은 시작일보다 늦어야 합니다."` 종료일 input 아래 표시 (`role="alert"`). 폼 submit 미실행.

### EC-12 — `instructor_fee_krw > business_amount_krw` (warning, 차단 X)

- **Given**: 사업비 100만원, 강사비 200만원 입력
- **When**: 제출
- **Then**: zod 경고 표시 `"강사비가 사업비보다 큽니다. 마진이 음수가 됩니다. 그래도 등록하시겠습니까?"` 확인 다이얼로그. 확정 시 INSERT 성공 (margin은 GENERATED에서 음수). 사용자 의지 존중.

### EC-13 — KPI 쿼리 동작 검증

- **Given**: `ai_instructor_recommendations` 테이블에 5개 row 존재 (각 row는 Top-3 객체 배열을 `top3_jsonb`로 보유), 그 중 3 row는 `adopted_instructor_id`가 1순위와 동일, 1 row는 2순위와 동일, 1 row는 NULL
- **When**: 다음 SQL 실행
  ```sql
  SELECT
    count(*) filter (where adopted_instructor_id = (top3_jsonb->0->>'id')::uuid)::float
    / nullif(count(*) filter (where adopted_instructor_id IS NOT NULL), 0)
    AS top1_adoption_rate
  FROM ai_instructor_recommendations
  WHERE created_at >= now() - interval '90 days';
  ```
- **Then**: 결과 = `0.75` (3/4, NULL은 분모에서 제외). 본 SPEC의 KPI 측정 인프라가 동작함을 검증.

### EC-14 — 추천 시 `schedule_items.system_lecture` 충돌 회피

- **Given**: INS-A에게 시스템 강의 일정 `2026-05-12 09:00 ~ 2026-05-12 18:00` (`schedule_kind = 'system_lecture'`) row가 SPEC-DB-001 seed 또는 admin 추가
- **When**: 시작일 `2026-05-10`, 종료일 `2026-05-14` 프로젝트로 추천 실행
- **Then**: INS-A의 `availability = 0` → 점수 페널티 → INS-A가 1순위에서 밀리거나 Top-3 탈락 (다른 후보 점수에 따라)

### EC-15 — KST 시간대 일관 표시

- **Given**: 프로젝트의 `start_date`가 DB에 `2026-05-10T00:00:00+00:00` UTC로 저장
- **When**: 상세 페이지 진입
- **Then**: 화면에 `2026-05-10 09:00 KST`로 표시 (UTC + 9시간). 모든 timestamp 컬럼(시작/종료/생성/수정)이 동일 정책 적용.

---

## 품질 게이트 (Quality Gates)

본 SPEC이 `status: completed`로 전환되기 위한 자동 검증:

| 게이트 | 명령 또는 도구 | 통과 기준 |
|--------|---------------|----------|
| Build | `pnpm build` | 0 error, 0 critical warning |
| Type | `pnpm tsc --noEmit` | 0 error |
| Lint | `pnpm exec eslint src/app/(operator)/projects src/lib/recommendation src/lib/projects src/ai` | 0 critical |
| 단위 테스트 | `pnpm vitest run tests/unit/recommendation tests/unit/projects` | 모두 PASS |
| 단위 커버리지 | `pnpm vitest --coverage` | recommendation 모듈 라인 커버리지 ≥ 85% |
| 통합 테스트 | `pnpm vitest run tests/integration/projects-flow.test.ts` | PASS |
| 마이그레이션 | `supabase db reset` | 무오류 + seed 통과 + `project_required_skills`/`assignment_request` enum 적용 |
| 시나리오 | 본 문서 시나리오 1-7 | 모두 PASS |
| Edge cases | EC-1 ~ EC-15 | 모두 PASS |
| Accessibility (axe DevTools) | `/projects`, `/projects/new`, `/projects/<id>` 3 페이지 | critical 0 / serious 0 |
| Lighthouse Accessibility | 3 페이지 | 평균 ≥ 95 |
| KPI 쿼리 | EC-13의 SQL | 집계 결과가 산출됨 |
| Service role 비사용 | `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/app/(operator)/projects src/lib/recommendation` | 0 hit |
| Claude API key 비노출 | `grep -r "ANTHROPIC_API_KEY" .next/static/` | 0 hit |

---

## Definition of Done (인수 기준)

본 SPEC은 다음을 모두 만족할 때 사용자가 `/moai sync SPEC-PROJECT-001`을 실행할 수 있다:

- [ ] `plan.md`의 모든 마일스톤 DoD 항목 완료
- [ ] 본 acceptance.md의 시나리오 1-7 모두 PASS
- [ ] 본 acceptance.md의 EC-1 ~ EC-15 모두 PASS
- [ ] 품질 게이트 표의 모든 항목 통과
- [ ] `src/lib/recommendation/` 모듈 단위 테스트 라인 커버리지 ≥ 85%
- [ ] `(operator)/projects` 라우트 4종 모두 SPEC-AUTH-001 가드를 통과 (instructor/미인증 silent redirect)
- [ ] `ai_instructor_recommendations.adopted_instructor_id` 갱신 경로가 1-클릭 배정에서만 발동 (직접 SQL UPDATE는 KPI에 반영되지 않음을 확인)
- [ ] `notifications` INSERT 시 `recipient_id`가 강사의 `users.id`이고, `link_url`이 placeholder 경로
- [ ] 한국어 에러 메시지 6종 모두 `src/lib/projects/errors.ts`에서 단일 출처로 관리
- [ ] `.moai/specs/SPEC-PROJECT-001/spec.md`의 `status` 필드를 `draft` → `completed`로 변경
- [ ] `.moai/specs/SPEC-PROJECT-001/spec.md`의 `updated` 필드를 완료 일자로 갱신
- [ ] HISTORY 항목에 완료 시점 entry 추가

---

_End of SPEC-PROJECT-001 acceptance.md_
