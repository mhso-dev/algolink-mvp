# SPEC-ME-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-ME-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-AUTH-001 admin bootstrap 완료 + SPEC-DB-001 seed 적용 + SPEC-DB-002 Storage 버킷 적용된 경우):

| 사용자 | 이메일 | 비밀번호 | role | 비고 |
|--------|--------|---------|------|------|
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` | 정산 데이터 INSERT 사용 |
| Instructor A | `instructor.a@algolink.test` | `InstructorPass!2026` | `instructor` | 본 SPEC 주 검증 사용자 |
| Instructor B | `instructor.b@algolink.test` | `InstructorPass!2026` | `instructor` | RLS 격리 검증용 |
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` | 라우트 가드 검증 |

브라우저 환경: Chromium 최신, 쿠키 활성, 시간대 `Asia/Seoul`, 한국어 로케일.
환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `ANTHROPIC_API_KEY=<test key>`.
서버: `pnpm dev` 또는 production build.

테스트 데이터 시드(SPEC-DB-001 seed + 본 SPEC 추가):
- Instructor A에 배정된 `projects` 2건 (status = `progress_confirmed`, `education_done`)
- 위 projects 각각에 대응하는 `settlements` 2건 (1건 corporate / 0%, 1건 government / 3.30%)
- Instructor A의 `schedule_items`: 미래 5건 (system_lecture 2 + personal 1 + unavailable 2)
- Instructor B의 `schedule_items`: 미래 3건
- skill_categories: large 5개, medium 20개, small 60개 시드

---

## 시나리오 1 — 신규 강사 첫 진입 + instructors row upsert + 빈 대시보드

**대응 EARS:** REQ-ME-DASH-001, -002, -003, -006, REQ-ME-RESUME-002

### Given

- Instructor A가 SPEC-AUTH-001 초대 수락 직후 상태 (auth.users + public.users 존재, public.instructors 미존재)
- 브라우저는 Instructor A 세션으로 로그인됨

### When

1. 브라우저가 `/me`로 이동
2. Server Component가 `getCurrentUser()` → role = 'instructor' 확인
3. Server Component가 `ensureInstructorRow()` 호출 → `instructors` UPSERT (id = uuid, user_id = auth.uid, name_kr = users.name_kr, email = users.email)
4. 대시보드 위젯 query 실행 (upcoming schedules / unsettled sum)

### Then

- ✅ `public.instructors`에 Instructor A의 row가 정확히 1건 존재 (이전에 없었음)
- ✅ 대시보드에 "다가오는 일정이 없습니다." 메시지 표시
- ✅ "미정산 합계" 위젯에 `0원` 표시 + `aria-label`이 `"미정산 합계 0원"`
- ✅ REQ-ME-DASH-006 일회성 카드 `"이력서를 작성해주세요."` + `/me/resume`로의 링크 버튼 표시
- ✅ 페이지 응답 200, console 0 errors, sidebar instructor 메뉴 4종 노출

---

## 시나리오 2 — operator/admin이 `/me/*` 접근 시 silent redirect

**대응 EARS:** SPEC-AUTH-001 REQ-AUTH-GUARD-003 재검증 (본 SPEC 의존)

### Given

- Operator(`operator@algolink.test`)로 로그인된 세션

### When

1. 브라우저가 `/me`, `/me/resume`, `/me/calendar`, `/me/settlements`, `/me/settings/payout`을 각각 직접 GET 요청

### Then

- ✅ 모두 HTTP 307로 `/dashboard`로 redirect
- ✅ 응답 본문에 `/me/*`의 콘텐츠 흔적 없음 (HTML title, meta 등)
- ✅ 403 / 404 페이지가 노출되지 않음 (silent redirect)

---

## 시나리오 3 — 이력서 양식: 학력 섹션 add / edit / reorder / delete

**대응 EARS:** REQ-ME-RESUME-001, -003, -004, REQ-ME-A11Y-002

### Given

- Instructor A 로그인, `instructors` row 존재, `educations` 0건

### When

1. `/me/resume` 접속 → "학력" 탭 클릭
2. "학력 추가" 버튼 클릭 → 다이얼로그
3. school = "서울대학교", major = "컴퓨터공학", degree = "학사", start_date = 2010-03-02, end_date = 2014-02-28 입력 → 저장
4. (3을 동일 폼 형식으로 2건 더 반복: 석사 / 박사)
5. "박사" row의 ↑ 버튼 2회 → 학사 → 박사 → 석사 순으로 변경
6. 학사 row의 "수정" → degree = "B.S." → 저장
7. 석사 row의 "삭제" → 확인 다이얼로그 → 삭제

### Then

- ✅ `educations` 테이블에 Instructor A의 row 정확히 2건 (학사 / 박사)
- ✅ `sort_order` 값이 학사 < 박사 순으로 보장 (작은 값이 위로 정렬)
- ✅ 학사의 degree = "B.S." (UPDATE 반영)
- ✅ 다른 강사(B)의 educations에 영향 0
- ✅ axe DevTools `/me/resume` critical 0건
- ✅ 입력 검증 에러 시 `aria-invalid="true"`, `aria-describedby="..."`, `role="alert"` 노출
- ✅ Tab 키만으로 모든 인풋·버튼 도달 가능

---

## 시나리오 4 — AI 이력서 파싱 (캐시 miss → Claude 호출 → 검토 → 적용)

**대응 EARS:** REQ-ME-AI-001, -002, -003, -004, -005, -007

### Given

- Instructor A 로그인, 이력서 PDF 파일(`fixtures/sample-resume.pdf`, 약 200KB) 준비
- `ai_resume_parses` 테이블에 해당 파일의 hash 미존재
- ANTHROPIC_API_KEY 유효, 모델 `claude-sonnet-4-6` 호출 가능

### When

1. `/me/resume/import` 접속 → 드롭존에 PDF 드롭
2. 클라이언트가 SHA-256 hash 계산 → Server Action `parseResume(file)` 호출
3. Server Action이 `ai_resume_parses` lookup → miss
4. PII pre-filter (주민/계좌/사업자번호 정규식) 적용 후 Claude API 호출 (prompt caching ON)
5. Claude가 7-section JSON 응답
6. zod 검증 통과 → `ai_resume_parses` UPSERT (input_file_hash, instructor_id, parsed_json, model='claude-sonnet-4-6', tokens_used)
7. UI가 review 화면 표시 (좌: 파싱 JSON / 우: 편집 폼)
8. 사용자가 "학력 3건 적용 / 자격 1건 제외" 토글 → "확인 후 저장"
9. `applyParsedResume(parsed, mapping)` 실행

### Then

- ✅ Claude API 호출 1회만 발생 (네트워크 탭 또는 로그 검증)
- ✅ `ai_resume_parses`에 신 row 1건 (input_file_hash UNIQUE)
- ✅ `educations` INSERT 3건, `certifications` INSERT 0건 (사용자 토글 OFF한 항목 미반영)
- ✅ Claude로 전송된 페이로드에 주민번호/계좌번호/사업자등록번호 패턴 0건 (REQ-ME-AI-007)
- ✅ 파싱 응답시간(client→server→client) ≤ 10초 (tech.md §5)
- ✅ 성공 toast `"이력서를 가져왔습니다."` + `/me/resume`로 redirect

---

## 시나리오 5 — AI 파싱 캐시 hit (동일 파일 재업로드)

**대응 EARS:** REQ-ME-AI-002, -004

### Given

- 시나리오 4 완료 직후 (`ai_resume_parses`에 row 1건)

### When

1. 동일 PDF를 `/me/resume/import`에 다시 업로드
2. SHA-256 hash가 시나리오 4와 동일
3. Server Action lookup → hit

### Then

- ✅ Claude API 호출 0건 (네트워크 탭 / `tokens_used` 갱신 없음 검증)
- ✅ 응답시간 ≤ 1초
- ✅ review 화면이 시나리오 4와 동일한 데이터로 표시

---

## 시나리오 6 — Claude API 장애 시 fallback (수동 입력 경로)

**대응 EARS:** REQ-ME-AI-006, product.md §6

### Given

- Claude API 호출이 강제로 실패하도록 mock (`ANTHROPIC_API_KEY=invalid` 또는 fault injection)

### When

1. 새로운 hash의 PDF를 `/me/resume/import`에 업로드
2. parseResume Server Action이 Claude 호출 시 401 반환
3. 15초 timeout 또는 즉시 실패

### Then

- ✅ 토스트 메시지 `"AI 파싱에 실패했습니다. 직접 입력해주세요."` (Korean, role="alert")
- ✅ 사용자가 `/me/resume`로 자동 또는 1-click redirect
- ✅ 수동 입력 폼이 정상 렌더 (이전 데이터 유지, 손실 0)
- ✅ application error log에 원본 에러 코드 기록 (사용자에게 노출되지 않음)

---

## 시나리오 7 — 기술스택 체크리스트 + proficiency 저장

**대응 EARS:** REQ-ME-SKILL-001, -002, -003, -005

### Given

- skill_categories 시드 적용 (large `백엔드`, medium `Java/Spring`, small `Spring Boot`, `Spring Data JPA`, `Spring Security` 등)
- Instructor A `instructor_skills` 0건

### When

1. `/me/resume/skills` 접속
2. 좌측 tree에서 `백엔드 → Java/Spring` 펼침
3. `Spring Boot` 체크 → proficiency 라디오 `expert` 선택 → 자동 저장
4. `Spring Data JPA` 체크 → `advanced` 선택
5. `Java/Spring` (medium tier) 체크 시도

### Then

- ✅ `instructor_skills` row 정확히 2건 INSERT
- ✅ `(instructor_id, skill_id) UNIQUE` 제약 위반 0
- ✅ medium tier 클릭 시 토글 동작 안 함 (UI 차단), DB 변경 0
- ✅ 새로고침 후 두 항목 + proficiency 그대로 표시

---

## 시나리오 8 — 캘린더 월 뷰 + system_lecture read-only + unavailable 등록

**대응 EARS:** REQ-ME-CAL-001, -002, -003, -004, -005, -007, -010

### Given

- Instructor A의 `schedule_items`: 미래 system_lecture 2건 (2026-05-10 09:00–18:00, 2026-05-15 13:00–17:00)

### When

1. `/me/calendar` 접속 (월 뷰, locale=ko, week start Monday, TZ Asia/Seoul)
2. 5월 view에 system_lecture 2건이 blue 색상으로 표시되는지 확인
3. system_lecture 이벤트 클릭 → popover에 프로젝트 제목 + read-only 표시
4. 5월 20일 빈 슬롯 클릭 → "새 일정" 다이얼로그
5. kind = `unavailable`, title = `"강의 불가"`(기본), start = 2026-05-20 09:00 KST, end = 2026-05-20 18:00 KST → 저장
6. 5월 20일 이벤트가 캘린더에 빨간 hatched로 즉시 표시
7. 동일 이벤트 클릭 → "삭제" 버튼 → 확인 → 삭제

### Then

- ✅ 5월 20일 unavailable INSERT 시점 `schedule_items`에 row 추가 (`schedule_kind = 'unavailable'`, `instructor_id = self`)
- ✅ system_lecture popover에 삭제 버튼 미존재
- ✅ system_lecture 드래그/리사이즈 시도 → DOM에서 차단 (FullCalendar editable=false)
- ✅ 삭제 후 row가 DB에서 제거
- ✅ 모든 시각 표시가 KST (`HH:mm` 한국어 포맷), UTC 문자열 노출 0
- ✅ axe DevTools critical 0

---

## 시나리오 9 — 캘린더 검증: ends_at <= starts_at 거부

**대응 EARS:** REQ-ME-CAL-009

### Given

- Instructor A 로그인, `/me/calendar` 진입

### When

1. "새 일정" 다이얼로그 → start = 2026-05-20 18:00, end = 2026-05-20 09:00 (역순) 입력
2. 저장 클릭

### Then

- ✅ 클라이언트 zod 검증이 즉시 차단 → `aria-invalid="true"` + 한국어 에러 `"종료 시각은 시작 시각보다 뒤여야 합니다."`
- ✅ Server Action이 호출되지 않거나, 호출되어도 zod 재검증으로 거부
- ✅ DB INSERT 0건

---

## 시나리오 10 — 정산 조회 + 합계 + corporate(0%) / government(3.30%) 분기

**대응 EARS:** REQ-ME-SET-001, -002, -004, -005, -008

### Given

- Instructor A 정산 시드:
  - Settlement 1: project = "Java 입문", flow = `corporate`, withholding = 0, instructor_fee = 1,000,000원, status = `pending`
  - Settlement 2: project = "Spring 심화", flow = `government`, withholding = 3.30, instructor_fee = 800,000원, status = `paid`

### When

1. `/me/settlements` 접속

### Then

- ✅ 리스트에 2건 표시, 컬럼: 프로젝트명 / 고객사 / 강의 기간 / 정산 방식 / 원천세율 / 강사료 / 원천세 / 세후 / 상태 / 지급일
- ✅ Settlement 1 행: 정산 방식 = `세금계산서 (원천 0%)`, 원천세 = `0원`, 세후 = `1,000,000원`, 상태 = `정산전`
- ✅ Settlement 2 행: 정산 방식 = `인건비`, 원천세율 = `3.30%`, 원천세 = `26,400원`, 세후 = `773,600원`, 상태 = `정산완료`
- ✅ 상단 summary band: 총 강사료 `1,800,000원` / 총 원천세 `26,400원` / 총 세후 `1,773,600원` / 미정산 합계 `1,000,000원`
- ✅ Settlement 2 행 클릭 → `/me/settlements/{id}` 상세 + status_history 표시
- ✅ Instructor B의 settlements 0건 (RLS 격리 검증)

---

## 시나리오 11 — 지급 정보 입력 + pgcrypto 암호화 + 통장사본 업로드 + pii_access_log

**대응 EARS:** REQ-ME-PAYOUT-001~009

### Given

- Instructor A 로그인, `instructors` row 존재, `resident_number_enc` 등 모두 NULL
- Storage 버킷 `payout-documents` 존재, RLS 적용 (강사 본인 RW only)

### When

1. `/me/settings/payout` 접속 → 빈 폼 표시 (마스킹 없음)
2. 주민번호 = `900101-1234567`, 계좌 = `우리은행 1002-123-456789`, 예금주 = `홍길동`, 사업자번호 = (공란), 원천세율 = `3.30`, 통장사본 = `bankbook.pdf` (200KB)
3. "저장" 클릭
4. 저장 완료 후 페이지가 다시 로드 (또는 router refresh)

### Then

- ✅ Storage `payout-documents/{instructor_id}/bankbook-{timestamp}.pdf`로 업로드 성공
- ✅ `instructors`의 `resident_number_enc`, `bank_account_enc`, `withholding_tax_rate_enc` 모두 NOT NULL (bytea)
- ✅ `pii_access_log`에 (actor_id = auth.uid, target_table = 'instructors', target_id = self, columns 포함, reason = 'read_self', accessed_at = now()) row 1건
- ✅ 폼이 다시 렌더되며 주민번호 = `900101-*******`, 계좌 = `1002-***-***6789` 등 마스킹 표시
- ✅ 평문 주민번호 / 계좌가 어디에도 평문으로 남아있지 않음 (DB select * → 모두 enc; localStorage / sessionStorage 0; React state도 commit 후 clear)

---

## 시나리오 12 — 지급 정보 RLS: 다른 강사 instructors row 수정 차단

**대응 EARS:** REQ-ME-PAYOUT-007, REQ-ME-RESUME-008

### Given

- Instructor A 로그인
- Instructor B의 `instructors.id`를 알고 있다고 가정

### When

1. Instructor A가 직접 fetch / Server Action을 통해 Instructor B의 `instructors.id`로 update payout을 시도

### Then

- ✅ Supabase RLS가 거부 (0 rows updated 또는 permission denied)
- ✅ UI 토스트 `"본인 정보만 수정할 수 있습니다."` 또는 `"권한이 없습니다."` (한국어, 정확한 메시지는 spec.md error mapping 따름)
- ✅ Instructor B의 `instructors` row 변경 0
- ✅ `pii_access_log`에 의심 시도 기록 (선택적, 운영 단계)

---

## 시나리오 13 — PDF 다운로드 + 마스킹 토글

**대응 EARS:** REQ-ME-RESUME-006, -007

### Given

- Instructor A의 이력서 7개 섹션이 적당히 채워져 있음 (학력 2 / 경력 1 / 강의이력 3 / 자격 1 / 저서 1 / 프로젝트 2 / 기타 1)
- 휴대폰 = `010-1234-5678`, 이메일 = `instructor.a@algolink.test`, 주소 = `서울특별시 강남구 테헤란로 123`

### When

1. `/me/resume`에서 "PDF 다운로드 (평문)" 버튼 → `/me/resume/export?mask=false` GET
2. 다운로드된 PDF 검사
3. "PDF 다운로드 (마스킹)" 버튼 → `/me/resume/export?mask=true` GET
4. 다운로드된 PDF 검사

### Then

- ✅ 평문 PDF: 휴대폰/이메일/주소가 그대로 표시
- ✅ 마스킹 PDF: 휴대폰 = `010-****-5678`, 이메일 = `in***@algolink.test`, 주소 = `서울특별시 강남구 ***`, (지급 정보가 포함되면) 주민번호 `xxxxxx-*******`, 계좌 `1002-****-****6789`
- ✅ 두 PDF 모두 7개 섹션 정상 렌더, 한국어 폰트 깨짐 0
- ✅ Content-Type = `application/pdf`, Content-Disposition = `attachment; filename="이력서_{name_kr}_{YYYYMMDD}.pdf"`

---

## 시나리오 14 — 한국어 + Asia/Seoul 일관성

**대응 EARS:** REQ-ME-A11Y-004, -005, REQ-ME-CAL-010

### Given

- Instructor A의 `schedule_items` 1건: `starts_at = 2026-05-20T00:00:00+00:00` (UTC midnight)
- 운영 환경 시간대 무관 (서버 UTC, 클라이언트 KST 가정)

### When

1. `/me/calendar` 접속
2. `/me/settlements` 접속
3. `/me/resume` PDF 다운로드 (마지막 업데이트 시각 표시)

### Then

- ✅ 캘린더에서 해당 일정이 `2026-05-20 09:00 KST` 위치에 표시 (UTC midnight + 9h)
- ✅ 정산 리스트 강의 기간 컬럼이 `2026년 5월 20일` 형태
- ✅ PDF "마지막 업데이트" 행이 `2026년 4월 27일 14:35` 형태
- ✅ 모든 페이지에서 영문 timestamp(`2026-05-20T...`)가 사용자 표시 영역에 노출 0

---

## 시나리오 15 — 자동 저장 draft 복원

**대응 EARS:** REQ-ME-RESUME-009

### Given

- Instructor A가 `/me/resume` 학력 폼에 5개 입력 후 저장 직전 상태

### When

1. 학력 row를 입력 중 5초 경과 → localStorage에 draft 저장 (debounce)
2. 사용자가 실수로 `/me/calendar`로 이동
3. 다시 `/me/resume`로 복귀

### Then

- ✅ 화면 상단에 `"임시저장된 입력 내용이 있습니다. 복원하시겠습니까? [복원] [버리기]"` 다이얼로그 / 배너 표시
- ✅ "복원" 클릭 시 입력값 그대로 폼에 채움
- ✅ "버리기" 클릭 시 localStorage entry 삭제

---

## Edge Cases (EC-1 ~ EC-12)

EC-1 — 동일 hash 다른 강사 캐시 hit 격리:
- Instructor A가 업로드한 PDF를 Instructor B가 동일 파일로 업로드
- Cache는 hash 기준이지만 lookup 시 `instructor_id = self.instructor_id` 추가 필터 → B는 자기 row가 없으면 cache miss로 Claude 호출 (또는 정책상 hash hit 허용)
- 결정 사항: 본 SPEC은 hash 기준 hit 허용 (다른 강사가 만든 캐시도 재활용). `instructor_id` 컬럼은 audit 기록용으로 첫 강사로 유지. 보안 영향 0 (PDF 내용은 hash 충돌 없는 한 동일).

EC-2 — instructors row가 race로 두 번 INSERT:
- ensureInstructorRow가 동시에 2회 실행 → UNIQUE(user_id) 제약 또는 ON CONFLICT 처리로 1건만 보존

EC-3 — 큰 PDF (10 MB 초과):
- 클라이언트에서 즉시 거부 + 한국어 에러 `"파일 크기가 10 MB를 초과합니다."`

EC-4 — DOCX/TXT 외 형식 업로드:
- mime type / 확장자 검증 실패 → `"지원하지 않는 파일 형식입니다. PDF, DOCX, TXT만 가능합니다."`

EC-5 — Claude 응답이 schema와 다른 형태:
- zod 검증 실패 → REQ-ME-AI-006 fallback 발동

EC-6 — settlements 0건 강사:
- 리스트가 빈 상태 + summary band 모두 `0원` 표시

EC-7 — settlement_status_history 0건 settlement:
- 상세 페이지 history 섹션에 `"히스토리가 없습니다."` 표시

EC-8 — schedule_items가 매우 많은 강사 (100건 이상):
- 가시 범위(viewStart-viewEnd) 필터링으로 query 부담 제한
- LCP < 2.5초 유지 (tech.md §5)

EC-9 — 마스킹 PDF 다운로드 시 이메일 local-part가 1자:
- `a***@domain` 형태로 graceful 처리 (입력 길이 보호)

EC-10 — 통장사본 5 MB 초과:
- 클라이언트 즉시 거부 + `"통장사본은 5 MB 이하만 가능합니다."`

EC-11 — 주민번호 체크섬 실패:
- zod refine으로 차단 + `"주민등록번호 형식이 올바르지 않습니다."`

EC-12 — Storage 버킷 부재 (SPEC-DB-002 미적용):
- M1 게이트에서 차단. 본 SPEC 시작 전 운영자가 SPEC-DB-002 완료 필요.

---

## 비기능 요구사항 검증 (Non-functional Verification)

### 접근성 (WCAG 2.1 AA)

axe DevTools 실행 페이지 5종:
- `/me`
- `/me/resume`
- `/me/calendar`
- `/me/settlements`
- `/me/settings/payout`

게이트:
- ✅ critical 0건
- ✅ serious 0건
- ✅ moderate ≤ 5건 (광고/외부 임베드 등 제외 항목)

키보드 only 순회 검증:
- Tab 순서 = 시각 순서
- 모든 인터랙티브 요소 도달 가능
- 캘린더 이벤트도 키보드 navigation 지원 (FullCalendar accessibility plugin)

스크린리더 검증:
- VoiceOver(macOS) 또는 NVDA(Windows)로 폼 / 버튼 / 상태 변경 announce 확인

색상 대비 (light + dark):
- 본문 4.5:1 이상
- 큰 텍스트 / UI 3:1 이상

### 성능 (tech.md §5 목표)

| 지표 | 목표 | 측정 페이지 |
|------|------|------------|
| LCP | < 2.5s | `/me`, `/me/calendar`, `/me/settlements` |
| CRUD API p95 | < 300ms | 이력서 add/edit/delete |
| AI 파싱 (캐시 miss) | < 10s | `/me/resume/import` |
| AI 파싱 (캐시 hit) | < 1s | 동일 PDF 재업로드 |

### Lighthouse

- Performance ≥ 80 (모바일)
- Accessibility ≥ 95
- Best Practices ≥ 90
- SEO ≥ 90

---

## 단위 테스트 (Vitest, 필수)

### `src/lib/instructor/settlement-summary.ts`

[HARD] 100% 라인/브랜치 커버. 본 SPEC의 정산 계산은 product.md §6 "회계 정확성: 정산 금액 계산은 단위 테스트 필수" 준수.

테스트 케이스:
- corporate(0%) 1건: instructor_fee_krw, withholding 0, profit, 세후 정확
- government(3.30%) 1건: floor((instructor_fee_krw * 3.30) / 100) 정확 (반올림 X, floor)
- government(8.80%) 1건: floor((instructor_fee_krw * 8.80) / 100) 정확
- 혼합 합계: corporate 1 + government 3.30% 1 + government 8.80% 1
- 빈 배열: 모든 합계 0n (BigInt)
- 큰 금액 BigInt 정밀도: 1조원대도 정확
- status 필터: pending/requested만 미정산 합계 포함, paid/held 제외
- 음수 금액 입력 → 명시적 에러 throw

### `src/lib/instructor/resume-mask.ts`

테스트 케이스:
- 주민번호: `900101-1234567` → `900101-*******`
- 휴대폰: `010-1234-5678` → `010-****-5678`
- 휴대폰 dash 없음: `01012345678` → `010****5678`
- 이메일: `instructor.a@algolink.test` → `in***@algolink.test`
- 이메일 짧은 local: `ab@x.com` → `ab***@x.com` (graceful)
- 계좌: `1002-123-456789` → `1002-***-***6789`
- 주소: `서울특별시 강남구 테헤란로 123` → `서울특별시 강남구 ***`
- 빈 문자열 / null → 빈 문자열 (no throw)

### `src/lib/instructor/schedule-conflict.ts` (선택, 표시용)

테스트 케이스:
- system_lecture와 unavailable 시간 겹침 → `true`
- 미겹침 → `false`
- 경계(starts_at == ends_at) → `false`
- 다일 범위 부분 겹침 → `true`

### `src/lib/validation/instructor.ts`

테스트 케이스:
- 7개 섹션 zod schema가 정상값 통과
- 잘못된 날짜(end < start) 거부
- 주민번호 체크섬 실패 거부
- 사업자번호 체크섬 실패 거부
- 일정 ends_at <= starts_at 거부

### `src/ai/parsers/resume.ts`

테스트 케이스:
- 정상 Claude 응답 → ParsedResume 객체 반환
- schema 어긋난 응답 → throw
- 빈 응답 → throw

---

## Definition of Done (DoD)

- [ ] 시나리오 1–15 모두 PASS (수동 또는 Playwright)
- [ ] EC-1 ~ EC-12 검토 및 처리 결정 명시
- [ ] 단위 테스트 4개 모듈 100% 커버 + Vitest PASS
- [ ] axe DevTools 5개 페이지 critical 0
- [ ] Lighthouse Accessibility ≥ 95 (5개 페이지 평균)
- [ ] `pnpm tsc --noEmit` 0 type 에러
- [ ] `pnpm lint` 0 critical
- [ ] `pnpm build` 0 에러
- [ ] DB: 신규 마이그레이션 0건 검증 (`supabase/migrations/` diff 0)
- [ ] Storage 버킷 3종 RLS 검증 (외부 강사 row access 0건)
- [ ] `pii_access_log` row 생성 검증 (시나리오 11)
- [ ] product.md §6 모든 제약 준수 검증 (개인정보 마스킹 / AI fallback / 회계 단위 테스트 / 한국어)
- [ ] @MX:NOTE / @MX:WARN / @MX:ANCHOR 태그 적절히 부여 (Server Action / 정산 계산 / Storage 업로드 / pgcrypto 호출)
- [ ] SPEC-AUTH-001 / SPEC-LAYOUT-001 / SPEC-DB-001 회귀 0건

---

_End of SPEC-ME-001 acceptance.md_
