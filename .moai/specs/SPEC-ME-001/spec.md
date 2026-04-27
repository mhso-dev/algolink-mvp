---
id: SPEC-ME-001
version: 0.1.0
status: draft
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-ME-001: 강사 개인영역 (Instructor Personal Workspace — Dashboard / Resume / Calendar / Settlements)

## HISTORY

- **2026-04-27 (v0.1.0)**: 초기 작성. SPEC-AUTH-001(완료) / SPEC-LAYOUT-001(완료) / SPEC-DB-001(완료) 위에서 강사(`instructor`) 페르소나의 개인영역 4개 도메인을 한 번에 명세한다. (1) 대시보드(`/me`) — 다가오는 일정 + 미정산 합계 위젯, (2) 이력서 관리(`/me/resume`) — 양식 입력 + AI 파싱(Claude API + cache) + 강의 가능 기술스택 + PDF 다운로드(개인정보 마스킹) + 첨부파일, (3) 일정 관리(`/me/calendar`) — 월/주 뷰 + 시스템 강의 + 개인 일정 + 강의 불가 등록(추천 회피용), (4) 정산 조회(`/me/settlements`) — 인건비(3.3%/8.8%) / 세금계산서 분기 + 본인 지급 정보 등록(통장사본 첨부, pgcrypto 암호화), (5) 설정(`/me/settings`) — 지급 정보 편집 진입점. 한국어 단일 + Asia/Seoul 타임존 + WCAG 2.1 AA. AI 파싱 fallback(Claude API 장애 시 수동 입력) 보장. SPEC-DB-001의 통합 마이그레이션을 그대로 재사용하며 누락 컬럼이 발견될 경우 SPEC-DB-002로 분리.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

알고링크 외부 강의 전문가(`instructor` 페르소나)가 본인 영역에서 (a) 향후 일정과 미정산 금액을 한눈에 파악하고, (b) 이력서를 양식 기반 또는 AI 파싱 기반으로 작성·수정·증빙 첨부하며, (c) 캘린더에서 시스템 강의(`schedule_kind = 'system_lecture'`)와 개인 일정(`personal`)·강의 불가(`unavailable`)을 함께 관리하여 추천 알고리즘이 회피하도록 신호를 주고, (d) 본인 정산 내역을 조회하면서 지급에 필요한 통장사본·계좌·주민/사업자등록번호를 pgcrypto로 암호화 저장하는, **강사 단독 self-service 워크스페이스**를 빌드한다.

본 SPEC은 운영자(operator)·관리자(admin) 전용 화면을 빌드하지 않으며, 강사가 다른 강사·고객사 데이터에 접근하는 기능도 제공하지 않는다. 페르소나 분리 + RLS(SPEC-DB-001) + 라우트 가드(SPEC-AUTH-001 `/me/*` instructor only)로 본인 데이터 외 노출 0을 보장한다.

### 1.2 배경 (Background)

`.moai/project/product.md` §2.1, §3.1의 [F-101]/[F-102]/[F-103]/[F-104] 4개 기능이 본 SPEC의 직접 대응이다. 선행 SPEC(SPEC-DB-001 통합 마이그레이션 + SPEC-AUTH-001 `/me/*` 가드 + SPEC-LAYOUT-001 `<AppShell userRole="instructor">`)이 모두 `main`에 머지되어 있어 본 SPEC은 frontend + Server Action + AI 통합 + Storage 통합 + (선택적) Drizzle query 확장에 집중한다.

데이터 모델은 SPEC-DB-001의 다음 테이블을 재사용한다(신규 마이그레이션 금지):

- `users` — 강사 사용자(role = 'instructor'), `id` = `auth.users.id`
- `instructors` — 강사 프로필 1:1 (user_id FK), `resident_number_enc`/`bank_account_enc`/`business_number_enc`/`withholding_tax_rate_enc` (bytea, pgcrypto)
- `educations` / `work_experiences` / `teaching_experiences` / `instructor_projects` / `certifications` / `publications` / `other_activities` — 이력서 7개 섹션
- `instructor_skills` (M:N) + `skill_categories` (3-tier: large/medium/small) — 강의 가능 기술스택/도메인
- `schedule_items` — 일정 (`schedule_kind` enum: `system_lecture` | `personal` | `unavailable`)
- `settlements` + `settlement_status_history` — 정산 (settlement_flow: `corporate`(세금계산서, 0%) | `government`(인건비, 3.3% / 8.8%))
- `files` — Storage 파일 메타 (이력서 첨부, 통장사본 등)
- `ai_resume_parses` — AI 파싱 결과 캐시 (`input_file_hash` UNIQUE)
- `pii_access_log` — 민감정보 복호화 감사 로그

SPEC-AUTH-001의 `getCurrentUser()` / `requireRole('instructor')` / `<AppShell userRole>`이 본 SPEC의 모든 server component / Server Action 진입점에서 사용된다. PR #9 (df31eb5 / 3f8cce2) 이후 instructor `ROLE_HOME = '/me'`로 정합화되어 있어 대시보드는 `/me/page.tsx`이다.

AI 파싱은 SPEC §6 product.md의 "Claude API 장애 시 수동 입력 경로 항상 유지" 제약을 따른다. Claude API 호출 전 `input_file_hash`(SHA-256)로 `ai_resume_parses` 캐시 조회 → hit 시 캐시 반환, miss 시 Claude Sonnet 4.6 + prompt caching 호출 → 결과를 `ai_resume_parses` UPSERT.

### 1.3 범위 (Scope)

**In Scope:**

- `src/app/(instructor)/me/page.tsx` — 대시보드(다가오는 일정 + 미정산 합계 위젯)
- `src/app/(instructor)/me/resume/` — 이력서 7개 섹션 CRUD + AI 파싱(`/me/resume/import`) + 기술스택 체크리스트 + PDF 다운로드(`/me/resume/export`, 개인정보 마스킹 옵션) + 첨부파일 업로드
- `src/app/(instructor)/me/calendar/` — 월/주 뷰 캘린더 + system_lecture(read-only) + personal/unavailable CRUD
- `src/app/(instructor)/me/settlements/` — 정산 리스트 + 상세 + 본인 지급 정보 등록 진입점
- `src/app/(instructor)/me/settings/` — 지급 정보 편집(통장사본 업로드 + 주민/사업자번호 + 계좌, pgcrypto 암호화)
- `src/lib/instructor/`(순수 도메인): `resume-pdf.ts`(PDF 생성), `resume-mask.ts`(주민번호/계좌/연락처 마스킹), `settlement-summary.ts`(정산 합계 계산), `schedule-conflict.ts`(개인↔시스템 일정 충돌 검사 — 표시용)
- `src/lib/validation/instructor.ts` — zod 스키마 (이력서 7섹션 + 일정 + 지급 정보)
- `src/db/queries/instructor/` — 본인 instructors row 조회/생성, 이력서 섹션 read/write, schedules read/write, settlements read, files read/write
- `src/ai/parsers/resume.ts` + `src/ai/prompts/resume-parse.ts`(이미 structure.md에 예약됨) — 이력서 PDF/DOCX/TXT → 구조화 JSON
- `src/components/instructor/` — `<DashboardWidgets>`, `<ResumeForm>` (7섹션 탭 + 자동 저장), `<ResumeImportDialog>` (드롭존 + 파싱 진행), `<SkillsPicker>` (3-tier tree), `<CalendarView>` (FullCalendar 래퍼), `<UnavailableEditor>`, `<SettlementsTable>`, `<PayoutSettingsForm>` (민감정보 마스킹 입력)
- Storage 버킷 정책 재사용: 강사 본인만 read/write 가능한 `resume-attachments`, `payout-documents` 버킷 (SPEC-DB-001에서 정의되지 않은 경우 추가, 단 마이그레이션 신규 금지 → SPEC-DB-002로 분리)
- 한국어 라벨/플레이스홀더/에러 메시지, Asia/Seoul 타임존 일관 적용
- WCAG 2.1 AA: 키보드 네비게이션, ARIA, focus, 색상 대비, screen reader 라이브 리전

**Out of Scope (Exclusions — What NOT to Build):**

- **운영자/관리자가 강사 이력서를 수정하는 UI**: read-only 조회는 SPEC-INSTR-OP-001(별도)로 위임. 본 SPEC은 강사 self-write만.
- **AI 강사 추천 알고리즘**: `ai_instructor_recommendations` 테이블 활용 → SPEC-RECO-001.
- **만족도 평가 입력**: `satisfaction_reviews` 작성 UI는 운영자 영역 → SPEC-SAT-001.
- **AI 만족도 요약 표시**: `ai_satisfaction_summaries` → 강사 본인이 자기 평점을 보는지 여부는 비즈니스 결정 미정. 본 SPEC은 표시하지 않음.
- **프로필 이메일/비밀번호 변경 UI**: SPEC-AUTH-001의 in-session password change(REQ-AUTH-PASSWORD-006)와 통합 시점 결정 → 본 SPEC은 placeholder만 두고 실제 구현은 SPEC-AUTH-001 후속 마일스톤 또는 SPEC-ME-002로 위임.
- **이메일 알림 발송**: 강의 제안/정산 요청 등 외부 트리거 → SPEC-NOTIF-001. 본 SPEC은 인앱 알림 표시 placeholder만(`<TopBar>` 알림 벨 SPEC-LAYOUT-001).
- **실시간 동기화(Realtime)**: 다른 단말의 일정 변경이 즉시 반영되는 기능 미제공. 새로고침 또는 TanStack Query refetch에 위임.
- **이력서 버전 관리 / Diff**: 단일 active 이력서만. 변경 이력 추적 미제공.
- **이력서 공개 URL / 공유 링크**: 외부에 공유하는 public URL 미제공.
- **강의 가능 시간 정밀 정의(`available_hours_per_week` 등)**: 본 SPEC은 `unavailable` 시간만 등록. 가용성 계산은 추천 알고리즘(SPEC-RECO-001) 책임.
- **외부 캘린더 연동(Google Calendar, iCal)**: tech.md §2.4 추후 항목. 본 SPEC은 인앱 캘린더만.
- **반복 일정(RRULE)**: 일회성 + 다일 범위만. weekly/monthly 반복은 추후 SPEC.
- **다국어**: 한국어 단일.
- **Mobile-first 캘린더 UX**: 반응형은 SPEC-LAYOUT-001 breakpoint 토큰만 활용. 모바일 전용 캘린더 UI는 추후.
- **PDF 다운로드 시 디자인 커스터마이징(테마, 로고)**: 단일 기본 템플릿만.
- **AI 파싱 모델 fallback(OpenAI gpt-4o-mini)**: tech.md §2.3 옵션 항목, env 토글로 추후 활성화. 본 SPEC은 Claude 단일 + 수동 fallback.
- **연말정산 자료 자동 발급**: 정산 합계 표시까지만. 원천징수영수증 등 PDF 출력은 추후.
- **DB 스키마 변경**: SPEC-DB-001 통합 마이그레이션을 그대로 사용한다. 누락 컬럼 발견 시 SPEC-DB-002로 분리하며 본 SPEC은 차단된다.
- **신규 Drizzle 마이그레이션**: 금지. `pnpm db:generate` 결과로 새 SQL 파일이 생성되면 즉시 폐기하고 SPEC-DB-002로 위임.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, `pnpm tsc --noEmit` 0 type 에러, `pnpm lint` 0 critical
- ✅ 라우트 가드 통과: 미인증 시 `/login?next=...`, operator/admin이 `/me/*` 접근 시 `/dashboard`로 silent redirect (SPEC-AUTH-001 REQ-AUTH-GUARD-003 재검증)
- ✅ 대시보드 위젯: 다가오는 14일 내 system_lecture 일정 + status ∈ {pending, requested}인 settlements 합계가 정확히 표시
- ✅ 이력서 양식 입력: 7개 섹션(학력/경력/강의이력/자격/저서/프로젝트/기타) 각 섹션 add/edit/delete/reorder 동작
- ✅ AI 파싱: PDF 업로드 → 10초 이내 파싱 결과 표시(tech.md §5 목표) → 사용자 검토/수정 후 저장
- ✅ AI 파싱 캐시 hit: 동일 파일 재업로드 시 Claude API 호출 0건, `ai_resume_parses.input_file_hash` UNIQUE 활용
- ✅ AI 파싱 fallback: Claude API 장애 시 사용자에게 명확히 안내 + 수동 입력 폼은 정상 작동
- ✅ 기술스택 체크리스트: skill_categories 3-tier(large/medium/small) tree 표시, 강사가 small tier만 선택 가능, proficiency(beginner/intermediate/advanced/expert) 동시 입력
- ✅ PDF 다운로드: "개인정보 마스킹" 토글 OFF 시 평문, ON 시 주민번호 뒷자리 6자리 / 계좌 중간 자리 / 휴대폰 가운데 4자리 마스킹된 PDF 생성
- ✅ 캘린더 월/주 뷰 전환: FullCalendar 표준 인터랙션 동작, system_lecture는 read-only(클릭 시 프로젝트 상세 toast/popover만), personal/unavailable는 드래그/리사이즈/삭제 가능
- ✅ 강의 불가 등록: 시작/종료 시각 + 메모, schedule_items에 `schedule_kind = 'unavailable'`로 INSERT
- ✅ 정산 조회: status 필터(전체/정산전/정산요청/정산완료/보류) + settlement_flow 라벨(인건비 3.3%/8.8% / 세금계산서) + 합계 표시
- ✅ 정산 계산 단위 테스트(필수): `src/lib/instructor/settlement-summary.ts`의 합계·세후 금액 계산 100% 커버
- ✅ 지급 정보 등록: 본인 입력 시 application-level pgcrypto 암호화, 평문은 클라이언트 전송 후 서버 측에서 즉시 암호화
- ✅ 통장사본 업로드: Supabase Storage `payout-documents` 버킷에 강사 본인만 read/write 가능 RLS 적용
- ✅ 민감정보 복호화 감사: 강사 본인이 본인 데이터 조회 시 `pii_access_log`에 `read_self` row 1건 INSERT
- ✅ axe DevTools: `/me/*` 5개 페이지 critical 0건, serious 0건
- ✅ Lighthouse Accessibility ≥ 95
- ✅ 한국어 일관성: 라벨/버튼/에러/toast 모두 한국어, 영문 평문 노출 0건
- ✅ Asia/Seoul 타임존 일관성: 캘린더 일정 시각, 정산 일자, 이력서 날짜 모두 KST 표시. UTC 혼용 0건

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 8개 모듈로 구성된다: `DASH`(대시보드), `RESUME`(이력서), `AI`(이력서 AI 파싱), `SKILL`(기술스택), `CAL`(캘린더), `SET`(정산), `PAYOUT`(지급 정보), `A11Y`(접근성/i18n/시간대).

### 2.1 REQ-ME-DASH — 대시보드 (`/me`)

**REQ-ME-DASH-001 (Ubiquitous)**
The system **shall** render an instructor dashboard at `/me` (server component, behind SPEC-AUTH-001 `requireRole('instructor')`) consisting of (a) an "다가오는 일정" widget listing up to 5 nearest `schedule_items` with `instructor_id = self` AND `starts_at >= now()` ordered ASC, and (b) a "미정산 합계" widget summing `instructor_fee_krw - withholding_tax_amount_krw` for `settlements` with `instructor_id = self` AND `status IN ('pending', 'requested')`.

**REQ-ME-DASH-002 (State-Driven)**
**While** the instructor has zero upcoming schedules, the system **shall** display the empty-state message `"다가오는 일정이 없습니다."` instead of an empty list.

**REQ-ME-DASH-003 (State-Driven)**
**While** the instructor has zero unsettled items, the system **shall** display `"미정산 항목이 없습니다."` and a 0 KRW figure with appropriate aria-label.

**REQ-ME-DASH-004 (Event-Driven)**
**When** a dashboard widget link is clicked, the system **shall** navigate to the corresponding detail page (`/me/calendar` for the schedule widget, `/me/settlements` for the settlement widget).

**REQ-ME-DASH-005 (Optional Feature)**
**Where** the upcoming schedule widget contains a `system_lecture` row, the system **shall** display the linked project title (joined via `projects.title`) in addition to start/end timestamps.

**REQ-ME-DASH-006 (Unwanted Behavior)**
**If** the instructor's `instructors` row does not exist (race condition just after invitation acceptance), **then** the dashboard **shall** display a one-time guidance card directing them to `/me/resume` to complete their profile and **shall not** crash or render NaN.

### 2.2 REQ-ME-RESUME — 이력서 양식 + CRUD + PDF

**REQ-ME-RESUME-001 (Ubiquitous)**
The system **shall** provide a resume edit page at `/me/resume` exposing seven sections backed by SPEC-DB-001 tables: 학력 (`educations`), 경력 (`work_experiences`), 강의이력 (`teaching_experiences`), 자격 (`certifications`), 저서 (`publications`), 프로젝트 (`instructor_projects`), 기타활동 (`other_activities`).

**REQ-ME-RESUME-002 (Ubiquitous)**
The system **shall** ensure that the instructor's `instructors` row is upserted on first visit to `/me/resume` if missing, populating `(id = gen_random_uuid(), user_id = auth.uid(), name_kr = users.name_kr, email = users.email)`, so that all dependent tables (FK `instructor_id`) can be written.

**REQ-ME-RESUME-003 (Event-Driven)**
**When** the instructor adds, edits, or deletes a row in any of the seven resume sections via Server Action, the system **shall** validate the input via the corresponding zod schema in `src/lib/validation/instructor.ts` and persist via Drizzle to the matching table.

**REQ-ME-RESUME-004 (Ubiquitous)**
The system **shall** support reordering rows within each section via a `sort_order` integer column (already present on all seven tables); the UI **shall** render rows in `ORDER BY sort_order ASC, created_at ASC`.

**REQ-ME-RESUME-005 (Optional Feature)**
**Where** a resume section row supports attachments (e.g., 자격 증빙서, 저서 표지), the system **shall** allow the instructor to attach a file via Supabase Storage `resume-attachments` bucket; attachments **shall** reference `files.id` via a `file_id` column. (If `file_id` columns are absent on the seven tables, attachments are deferred to SPEC-DB-002 and this requirement becomes optional-disabled.)

**REQ-ME-RESUME-006 (Ubiquitous)**
The system **shall** provide a PDF download endpoint at `/me/resume/export` that renders the active resume as a single-template Korean A4 PDF using `pdf-lib` or `@react-pdf/renderer`; the document **shall** include the seven sections in fixed order, instructor's `name_kr`, contact (email, phone), and a "마지막 업데이트" timestamp.

**REQ-ME-RESUME-007 (State-Driven)**
**While** the export request includes the query parameter `mask=true`, the system **shall** apply the masking rules from `src/lib/instructor/resume-mask.ts`:
- 주민등록번호: 앞 6자리 + 뒤 7자리 마스킹 (`xxxxxx-*******`)
- 휴대폰: 가운데 4자리 마스킹 (`010-****-1234`)
- 이메일: local-part 첫 2자 + `***` + `@domain` (`mh***@gmail.com`)
- 계좌번호: 중간 자리 마스킹 (`123-****-7890`)
- 주소: 시/구까지만 표시, 상세 주소는 `***`

**REQ-ME-RESUME-008 (Unwanted Behavior)**
**If** the instructor attempts to write to or delete a row whose `instructor_id` does not match `getCurrentUser().instructorId`, **then** RLS **shall** reject the operation; the application **shall** present a Korean error toast `"본인 이력서만 수정할 수 있습니다."` without leaking the foreign instructor_id.

**REQ-ME-RESUME-009 (Ubiquitous)**
The system **shall** auto-save form drafts to `localStorage` with a 5-second debounce so unintentional navigation does not lose work; on next visit, the system **shall** offer to restore the draft.

**REQ-ME-RESUME-010 (Optional Feature)**
**Where** the instructor uploads a profile photo, the system **shall** persist it via Supabase Storage to `instructor-photos` bucket and write `instructors.photo_storage_path` and `photo_file_id`. (If bucket absent, deferred to SPEC-DB-002.)

### 2.3 REQ-ME-AI — 이력서 AI 파싱 (Claude API + 캐시 + Fallback)

**REQ-ME-AI-001 (Ubiquitous)**
The system **shall** provide a resume-import flow at `/me/resume/import` accepting PDF, DOCX, or TXT files up to 10 MB; uploaded files **shall** be temporarily stored in Supabase Storage (or in-memory) for parsing and **shall** be discarded after parsing unless the user explicitly chooses to attach them.

**REQ-ME-AI-002 (Ubiquitous)**
The system **shall** compute the SHA-256 hash of the uploaded file binary and **shall** look up `ai_resume_parses` by `input_file_hash`; if a row exists, the cached `parsed_json` **shall** be returned without calling the Claude API.

**REQ-ME-AI-003 (Event-Driven)**
**When** the cache misses, the system **shall** call the Claude API (`claude-sonnet-4-6` per `tech.md §2.3`) with prompt caching enabled, using the system prompt from `src/ai/prompts/resume-parse.ts`, and **shall** request a structured JSON response matching the seven resume sections.

**REQ-ME-AI-004 (Ubiquitous)**
The system **shall** UPSERT the parsing result into `ai_resume_parses (input_file_hash, instructor_id, parsed_json, model, tokens_used, created_at)` on every successful Claude call.

**REQ-ME-AI-005 (Event-Driven)**
**When** the Claude API returns a parse, the system **shall** present the parsed data in a side-by-side review UI (parsed JSON on left, editable form on right) and **shall** require the user to confirm before persisting; no row **shall** be auto-written to the seven resume tables without user confirmation.

**REQ-ME-AI-006 (Unwanted Behavior)**
**If** the Claude API returns an error (timeout, rate limit, 5xx, malformed JSON, network failure), **then** the system **shall** display the Korean message `"AI 파싱에 실패했습니다. 직접 입력해주세요."` and **shall** redirect the user to the manual `/me/resume` form with no data loss; the failure **shall** be logged to the application error log.

**REQ-ME-AI-007 (Ubiquitous)**
The system **shall** strip personally identifying numbers (주민등록번호, 사업자등록번호, 계좌번호) from the file content before sending to Claude using a regex pre-filter; only fields the Claude prompt requests **shall** be sent.

**REQ-ME-AI-008 (State-Driven)**
**While** an AI parse is in progress, the system **shall** display a progress indicator with elapsed time and **shall** allow the user to cancel; cancellation **shall** abort the in-flight `fetch` via `AbortController`.

**REQ-ME-AI-009 (Optional Feature)**
**Where** the instructor has previously imported a resume in the same session, the system **shall** offer "이전에 가져온 이력서를 불러오기" pulling from the most recent `ai_resume_parses` row by `instructor_id`.

### 2.4 REQ-ME-SKILL — 강의 가능 기술스택 / 도메인 체크리스트

**REQ-ME-SKILL-001 (Ubiquitous)**
The system **shall** render a 3-tier hierarchical skills picker on `/me/resume` (or a dedicated tab `/me/resume/skills`) showing `skill_categories` ordered by `tier` (large → medium → small) and `sort_order`; only `tier = 'small'` rows **shall** be selectable.

**REQ-ME-SKILL-002 (Event-Driven)**
**When** the instructor toggles a skill, the system **shall** prompt for `proficiency` (`beginner` | `intermediate` | `advanced` | `expert`) via inline radio group and **shall** UPSERT into `instructor_skills (instructor_id, skill_id, proficiency)` respecting the `uq_instructor_skills` constraint.

**REQ-ME-SKILL-003 (Event-Driven)**
**When** the instructor untoggles a skill, the system **shall** DELETE the row from `instructor_skills` for that `(instructor_id, skill_id)`.

**REQ-ME-SKILL-004 (Optional Feature)**
**Where** the instructor wants to filter the picker, the system **shall** provide a search input filtering small-tier skills client-side by `name` substring (case-insensitive).

**REQ-ME-SKILL-005 (Unwanted Behavior)**
**If** the instructor attempts to select a `tier = 'large'` or `tier = 'medium'` row, **then** the UI **shall** ignore the click and the row **shall** act as a non-interactive group header.

### 2.5 REQ-ME-CAL — 캘린더 (월/주 + system_lecture / personal / unavailable)

**REQ-ME-CAL-001 (Ubiquitous)**
The system **shall** render a calendar at `/me/calendar` with month and week views (FullCalendar v6) defaulting to month, locale `ko`, timezone `Asia/Seoul`, week start `Monday`.

**REQ-ME-CAL-002 (Ubiquitous)**
The calendar **shall** display all `schedule_items` rows with `instructor_id = self.instructor_id`, color-coded by `schedule_kind`: `system_lecture` (blue, primary token), `personal` (gray), `unavailable` (red, hatched).

**REQ-ME-CAL-003 (State-Driven)**
**While** an event has `schedule_kind = 'system_lecture'`, the calendar UI **shall** disable drag, resize, and delete operations and **shall** show a popover with the linked project title and a link to (read-only) project info if available; system-generated rows **shall** be modified only via the project workflow (out of scope).

**REQ-ME-CAL-004 (Event-Driven)**
**When** the instructor selects an empty time slot or clicks "새 일정", the system **shall** open a dialog to create a `personal` or `unavailable` schedule with fields: kind (radio), title (optional for personal, required-or-default `"강의 불가"` for unavailable), start (datetime-local KST), end (datetime-local KST), notes.

**REQ-ME-CAL-005 (Event-Driven)**
**When** the instructor saves a new or edited schedule, the system **shall** validate via zod (`starts_at < ends_at`, both within ±2 years from now) and INSERT/UPDATE into `schedule_items` with `instructor_id = self`; on success, the calendar **shall** refetch and re-render.

**REQ-ME-CAL-006 (Event-Driven)**
**When** the instructor drags or resizes a `personal` or `unavailable` event, the system **shall** persist the new `starts_at` / `ends_at` via Server Action and **shall** display optimistic UI; on save error, the event **shall** revert to its previous time and a Korean toast **shall** explain the failure.

**REQ-ME-CAL-007 (Event-Driven)**
**When** the instructor clicks delete on a `personal` or `unavailable` event, the system **shall** confirm via dialog, then DELETE the row; system_lecture rows **shall not** show a delete button.

**REQ-ME-CAL-008 (Optional Feature)**
**Where** a created `unavailable` schedule overlaps with an existing `system_lecture`, the system **shall** display a non-blocking warning toast `"이미 확정된 강의 일정과 겹칩니다."` but **shall** still allow the save; resolution is the operator's responsibility.

**REQ-ME-CAL-009 (Unwanted Behavior)**
**If** an instructor attempts to save a schedule with `ends_at <= starts_at` or with start/end more than 2 years from `now()`, **then** the validation **shall** reject the input with a specific Korean error message and **shall not** persist.

**REQ-ME-CAL-010 (Ubiquitous)**
The system **shall** persist all schedule timestamps as `timestamp with time zone` (already enforced by SPEC-DB-001) and **shall** convert to/from KST for display using `date-fns-tz` or `Intl.DateTimeFormat`; the user **shall** never see UTC strings.

### 2.6 REQ-ME-SET — 정산 조회

**REQ-ME-SET-001 (Ubiquitous)**
The system **shall** provide a settlements list page at `/me/settlements` showing all `settlements` rows with `instructor_id = self` joined to `projects(title, education_start_at, education_end_at, client_id → clients.company_name)`.

**REQ-ME-SET-002 (Ubiquitous)**
The list **shall** display columns: 프로젝트명, 고객사, 강의 기간, 정산 방식 (`settlement_flow`: 인건비/세금계산서), 원천세율 (`withholding_tax_rate`), 강사료 (`instructor_fee_krw`), 원천세 (`withholding_tax_amount_krw`), 세후 지급액 (`instructor_fee_krw - withholding_tax_amount_krw`), 상태 (`status`), 지급일 (`payout_sent_at`).

**REQ-ME-SET-003 (Optional Feature)**
**Where** the instructor wants to filter, the system **shall** provide filters by `status` (multi-select), `settlement_flow` (multi-select), and date range on `education_start_at`.

**REQ-ME-SET-004 (Ubiquitous)**
The system **shall** display a summary band above the list showing 총 강사료, 총 원천세, 총 세후 지급액, 미정산 합계 (status ∈ {pending, requested}); calculations **shall** be implemented in pure functions in `src/lib/instructor/settlement-summary.ts` with unit tests covering corporate (0%), government 3.30%, government 8.80% combinations.

**REQ-ME-SET-005 (Event-Driven)**
**When** the instructor clicks a row, the system **shall** navigate to a read-only detail page `/me/settlements/[id]` showing the full settlement, status history (`settlement_status_history`), and project metadata.

**REQ-ME-SET-006 (Unwanted Behavior)**
**If** the instructor attempts to load a `settlement_id` not owned by them, **then** RLS **shall** return zero rows and the page **shall** render a Korean 404-like state `"정산 내역을 찾을 수 없습니다."` without confirming the existence of foreign IDs.

**REQ-ME-SET-007 (Ubiquitous)**
The settlement list and detail **shall** be read-only for instructors; status transitions and amount edits are operator/admin operations (out of scope).

**REQ-ME-SET-008 (State-Driven)**
**While** a settlement has `settlement_flow = 'corporate'`, the UI **shall** label `withholding_tax_rate` as `세금계산서 (원천 0%)` and **shall** show a small icon/text indicator that this is a tax-invoice flow (no withholding).

### 2.7 REQ-ME-PAYOUT — 본인 지급 정보 등록 (pgcrypto 암호화)

**REQ-ME-PAYOUT-001 (Ubiquitous)**
The system **shall** provide a payout-settings form at `/me/settings/payout` (or `/me/settings`) where the instructor enters: 주민등록번호, 사업자등록번호 (선택, 세금계산서 대상 시), 거래은행 + 계좌번호 + 예금주, 통장사본 첨부, 원천징수율 선택 (`3.30` | `8.80` | `0` for corporate).

**REQ-ME-PAYOUT-002 (Ubiquitous)**
The system **shall** validate inputs via zod: 주민등록번호 (정확히 13자리, 체크섬 검증, 형식 `\d{6}-\d{7}`), 계좌번호 (숫자/하이픈 5–20자), 사업자등록번호 (정확히 10자리, 체크섬, `\d{3}-\d{2}-\d{5}`), 통장사본 (PDF/이미지, 5 MB 이하).

**REQ-ME-PAYOUT-003 (Event-Driven)**
**When** the instructor submits the payout form, the system **shall** (1) upload 통장사본 to Supabase Storage `payout-documents` bucket scoped to `instructor_id`, (2) call SPEC-DB-001 pgcrypto helper functions (`app.encrypt_pii(text)` or equivalent SECURITY DEFINER function) via RPC to encrypt 주민등록번호 → `resident_number_enc`, 계좌번호 → `bank_account_enc`, 사업자등록번호 → `business_number_enc`, 원천징수율 → `withholding_tax_rate_enc`, (3) UPDATE the instructor's `instructors` row.

**REQ-ME-PAYOUT-004 (Ubiquitous)**
The system **shall never** persist the plaintext PII values to any non-encrypted column or any log; client-side state **shall** clear plaintext as soon as the Server Action confirms persistence.

**REQ-ME-PAYOUT-005 (State-Driven)**
**While** rendering the payout form for editing, the system **shall** display the existing values in masked form (`xxxxxx-*******` for 주민번호, `123-****-7890` for 계좌, etc.) and **shall** require the instructor to type a fresh full value to update; partial edits **shall not** be allowed.

**REQ-ME-PAYOUT-006 (Event-Driven)**
**When** the system decrypts a PII column to render the masked preview, the system **shall** insert a `pii_access_log` row capturing `(actor_id = auth.uid(), target_table = 'instructors', target_id = self.instructor_id, columns = '<list>', reason = 'read_self', accessed_at = now())`.

**REQ-ME-PAYOUT-007 (Unwanted Behavior)**
**If** the instructor's role is not `instructor` or the target instructors row's `user_id != auth.uid()`, **then** the SECURITY DEFINER decryption function **shall** raise `permission denied` and the application **shall** present `"권한이 없습니다."`.

**REQ-ME-PAYOUT-008 (Optional Feature)**
**Where** SPEC-DB-001 has not yet exposed user-callable encryption RPC, the encryption **shall** be performed via a server-only Server Action that uses the service role key to call `pgp_sym_encrypt(...)` directly; this path is documented as a temporary bridge until SPEC-DB-002 publishes the canonical RPC.

**REQ-ME-PAYOUT-009 (Ubiquitous)**
The system **shall** allow the instructor to upload a new 통장사본 replacing the previous one; the previous file **shall** be deleted from Storage and `files` **shall** mark the old row as superseded (or DELETE if not referenced elsewhere).

### 2.8 REQ-ME-A11Y — 접근성 / 한국어 / 시간대

**REQ-ME-A11Y-001 (Ubiquitous)**
The system **shall** ensure every interactive control on `/me/*` (forms, buttons, calendar, dialog) is fully keyboard navigable in visual reading order and **shall** display a 2 px focus-ring on `:focus-visible` per SPEC-LAYOUT-001 design tokens.

**REQ-ME-A11Y-002 (Ubiquitous)**
The system **shall** associate every form input with a `<label htmlFor>` and **shall** expose validation errors with `aria-invalid="true"` + `aria-describedby="<error-id>"`; error `<p>` **shall** carry `role="alert"`.

**REQ-ME-A11Y-003 (Event-Driven)**
**When** an asynchronous action completes (save, AI parse done, settlement filter applied), the system **shall** announce the outcome via a `role="status"` (success) or `role="alert"` (error) live region in Korean.

**REQ-ME-A11Y-004 (Ubiquitous)**
The system **shall** localize all user-visible text in Korean per `.moai/config/sections/language.yaml conversation_language=ko`; English noise (Supabase error codes, library defaults) **shall not** be visible to users.

**REQ-ME-A11Y-005 (Ubiquitous)**
The system **shall** format dates, times, and currency in Korean conventions: 날짜 `YYYY년 M월 D일`, 시각 `HH:mm`, 금액 `1,234,567원`, 시간대 `Asia/Seoul`.

**REQ-ME-A11Y-006 (Optional Feature)**
**Where** dark mode is active (SPEC-LAYOUT-001 prefers-color-scheme), the calendar, tables, and form controls **shall** maintain ≥ 4.5:1 contrast and **shall** use SPEC-LAYOUT-001 color tokens (no hex codes inline).

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 운영자/관리자가 강사 이력서를 조회·수정 | SPEC-INSTR-OP-001 |
| AI 강사 추천 알고리즘 | SPEC-RECO-001 |
| 만족도 입력 UI (`satisfaction_reviews`) | SPEC-SAT-001 |
| AI 만족도 요약 강사 표시 | (검토 후 결정) |
| 이메일/비밀번호 변경 in-session | SPEC-AUTH-001 후속 또는 SPEC-ME-002 |
| 이메일/알림톡 외부 발송 | SPEC-NOTIF-001 |
| Realtime 동기화 (다중 단말) | (검토 후 결정) |
| 이력서 버전 관리 / Diff | (운영 단계) |
| 이력서 공개 URL / 공유 링크 | (검토 후 결정) |
| 외부 캘린더 연동 (Google/iCal) | (운영 단계) |
| 반복 일정 (RRULE) | (검토 후 결정) |
| 다국어 (i18n) | (영구 제외, 한국어 단일) |
| Mobile-first 캘린더 UX | (검토 후 결정) |
| PDF 디자인 커스터마이징 (테마/로고) | (운영 단계) |
| AI 모델 fallback (OpenAI gpt-4o-mini) | (env 토글, 운영 단계) |
| 연말정산 자료 자동 발급 (원천징수영수증 PDF) | (운영 단계) |
| Drizzle 신규 마이그레이션 / 컬럼 추가 | SPEC-DB-002 (필요 시) |
| `instructor-photos` / `resume-attachments` / `payout-documents` Storage 버킷 신규 생성 | SPEC-DB-002 (SPEC-DB-001 통합 마이그레이션이 누락한 경우) |
| `app.encrypt_pii` / `app.decrypt_pii` RPC 신설 | SPEC-DB-002 (현재 SPEC-DB-001의 pgcrypto helpers를 재사용; 누락 시 위임) |

---

## 4. 데이터 모델 매핑 (Data Model Mapping)

본 SPEC은 SPEC-DB-001 통합 마이그레이션의 다음 테이블만 사용한다(신규 마이그레이션 0건).

### 4.1 직접 read/write 테이블

| 테이블 | 본 SPEC 권한 | 비고 |
|--------|-------------|------|
| `users` | own R | 자기 row 표시(이름·이메일) |
| `instructors` | own R/W (자기 1 row) | 첫 방문 시 upsert (REQ-ME-RESUME-002) |
| `educations` | own R/W | sort_order 기반 정렬 |
| `work_experiences` | own R/W | |
| `teaching_experiences` | own R/W | |
| `certifications` | own R/W | |
| `publications` | own R/W | |
| `instructor_projects` | own R/W | |
| `other_activities` | own R/W | |
| `instructor_skills` | own R/W | UPSERT/DELETE |
| `skill_categories` | all R (마스터) | 읽기 전용, 시드 데이터 |
| `schedule_items` | own R/W (단, system_lecture는 R only) | DB 차원 차단은 RLS / 트리거 (선택) |
| `settlements` | own R | 강사는 read-only |
| `settlement_status_history` | own R | 정산 상세에서 표시 |
| `projects` | assigned R | settlement / schedule join 시 |
| `clients` | (none direct) | settlements join을 통해서만 노출 |
| `files` | own R/W | resume / payout 첨부 |
| `ai_resume_parses` | own R/W (자기 hash 캐시) | UNIQUE input_file_hash |
| `pii_access_log` | own INSERT (read 시 audit) | SECURITY DEFINER |

### 4.2 enum 사용

- `user_role` — `getCurrentUser().role === 'instructor'` 분기
- `schedule_kind` — `system_lecture` | `personal` | `unavailable`
- `settlement_flow` — `corporate` | `government`
- `settlement_status` — `pending` | `requested` | `paid` | `held`
- `proficiency` — `beginner` | `intermediate` | `advanced` | `expert`
- `skill_tier` — `large` | `medium` | `small`

### 4.3 RLS 가정 (SPEC-DB-001 기제공)

- instructor self-write: `auth.uid() IN (SELECT user_id FROM instructors WHERE id = <target>.instructor_id)`
- settlements / projects / schedule_items 필터링 RLS는 SPEC-DB-001이 이미 적용. 본 SPEC은 RLS 변경 0건.
- 누락 RLS 발견 시: SPEC-DB-002로 분리하고 본 SPEC은 차단.

### 4.4 Storage 버킷 가정

- `resume-attachments` — 강사 본인 read/write, 운영자 read
- `payout-documents` — 강사 본인 read/write only (가장 민감)
- `instructor-photos` — 강사 본인 read/write, 운영자 read

**위 3개 버킷이 SPEC-DB-001 산출물에 없으면 SPEC-DB-002로 분리한다.** 본 SPEC은 버킷이 존재한다는 전제로 진행하며, 부재 발견 시 M1 게이트에서 차단된다.

---

## 5. API 표면 (API Surface)

본 SPEC은 외부 REST/JSON API를 신설하지 않는다. 모든 데이터 변경은 **Next.js Server Action** 또는 **Drizzle 직접 호출 (RSC)**로 수행한다. 단, AI 파싱 fetch는 server-only fetch로 Anthropic SDK를 호출하므로 별도 라우트를 둔다.

### 5.1 Server Actions (`src/app/(instructor)/me/**/actions.ts`)

| 함수 | 입력 | 출력 | 사이드 이펙트 |
|------|------|------|--------------|
| `ensureInstructorRow()` | (none, auth 자동) | `Instructor` | `instructors` upsert |
| `addEducation(input)` | zod EducationInput | `Education` | `educations` INSERT |
| `updateEducation(id, input)` | id + zod EducationInput | `Education` | `educations` UPDATE (RLS) |
| `deleteEducation(id)` | id | `void` | `educations` DELETE (RLS) |
| `reorderEducations(orderedIds)` | uuid[] | `void` | sort_order UPDATE batch |
| (위 패턴 × 7 sections) | … | … | … |
| `toggleSkill(skillId, proficiency \| null)` | (skillId, proficiency) | `void` | `instructor_skills` UPSERT/DELETE |
| `createSchedule(input)` | zod ScheduleInput | `ScheduleItem` | `schedule_items` INSERT (kind ∈ personal\|unavailable) |
| `updateSchedule(id, input)` | id + zod | `ScheduleItem` | UPDATE (system_lecture는 RLS 또는 어플리케이션 검증으로 차단) |
| `deleteSchedule(id)` | id | `void` | DELETE (system_lecture 차단) |
| `parseResume(file)` | File (base64) | `ParsedResume \| { error }` | hash 계산 → cache lookup → Claude 호출 → `ai_resume_parses` UPSERT |
| `applyParsedResume(parsed, mapping)` | 사용자 검토 후 결과 | `void` | 7개 섹션 INSERT (사용자가 명시 확인한 항목만) |
| `submitPayoutSettings(input)` | zod PayoutInput + 파일 | `void` | Storage 업로드 + pgcrypto 암호화 + `instructors` UPDATE + `pii_access_log` INSERT |
| `requestPayoutSettingsView()` | (none) | `MaskedPayout` | 복호화 + 마스킹 + `pii_access_log` INSERT |

### 5.2 Route Handlers (`src/app/(instructor)/me/resume/export/route.ts`)

| 메서드 + 경로 | 입력 | 출력 |
|--------------|------|------|
| `GET /me/resume/export?mask=true\|false` | query | `application/pdf` 스트림 |

### 5.3 사용 외부 SDK

- `@anthropic-ai/sdk` — `messages.create({ model: 'claude-sonnet-4-6', system: [{ type: 'text', text: PROMPT, cache_control: { type: 'ephemeral' } }], ... })`
- `@supabase/ssr` — server / client / admin (서비스 롤은 통장사본 업로드 + pgcrypto RPC 호출 시)
- `@react-pdf/renderer` 또는 `pdf-lib` — PDF 출력 (M1 결정)
- `@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/timegrid` + `@fullcalendar/interaction`
- `date-fns` + `date-fns-tz` — Asia/Seoul 시간대 변환

---

## 6. UX 흐름 (User Flows)

### 6.1 첫 진입 — 신규 강사 온보딩

1. 강사가 SPEC-AUTH-001 초대 수락 → `/me`로 redirect
2. 대시보드 `/me`가 `getCurrentUser().role === 'instructor'` 검증
3. `instructors` row 미존재 → REQ-ME-DASH-006 일회성 카드 `"이력서를 작성해주세요."` 표시
4. 카드 클릭 → `/me/resume`로 이동, REQ-ME-RESUME-002 자동 upsert
5. 사용자가 [양식 직접 입력] 또는 [기존 이력서 업로드] 두 진입점 중 선택

### 6.2 이력서 AI 파싱 — Golden Path

1. `/me/resume/import` 진입
2. PDF 드롭존 → 10 MB 이하 검증 → SHA-256 hash 계산
3. `ai_resume_parses` 캐시 lookup → hit면 즉시 결과 표시, miss면 Claude 호출 (progress 표시)
4. 결과 review UI: 좌(파싱 JSON) / 우(편집 폼)
5. 사용자가 섹션별 토글로 적용할 항목 선택 → "확인 후 저장"
6. `applyParsedResume` Server Action이 7개 섹션 INSERT (사용자 확인분만)
7. 성공 toast `"이력서를 가져왔습니다."` + `/me/resume`로 redirect

### 6.3 AI 파싱 실패 fallback

1. Claude API timeout/error 발생
2. REQ-ME-AI-006 토스트 표시 + `/me/resume` 수동 폼으로 redirect (업로드 파일은 옵션으로 attach만 유지)
3. 사용자는 직접 입력으로 진행. 데이터 손실 0.

### 6.4 캘린더 — 강의 불가 등록

1. `/me/calendar` 월 뷰 진입 (FullCalendar)
2. 빈 시간 슬롯 클릭 → "새 일정" 다이얼로그
3. kind = `unavailable`, title = `"강의 불가"`(기본값), start/end 입력
4. 저장 → `schedule_items` INSERT + 캘린더 refetch
5. 추후 SPEC-RECO-001 추천이 이 시간을 회피

### 6.5 정산 조회

1. `/me/settlements` 리스트 진입
2. 상단 summary band: 총 강사료 / 총 원천세 / 총 세후 지급액 / 미정산 합계
3. 행 클릭 → `/me/settlements/[id]` 상세 + 상태 히스토리

### 6.6 지급 정보 등록

1. `/me/settings/payout` 진입
2. 첫 입력이면 빈 폼, 재방문이면 마스킹된 기존 값 + "변경하려면 새로 입력하세요" 안내
3. 통장사본 업로드 + 주민/사업자/계좌/원천세율 입력
4. 저장 → 서버 측 pgcrypto 암호화 + Storage 업로드 + `pii_access_log` INSERT
5. 성공 toast + 마스킹된 신 값 표시

---

## 7. 영향 범위 (Affected Files)

### 7.1 신규 파일

```
src/app/(instructor)/me/
├── page.tsx                                  # 대시보드
├── loading.tsx                               # Suspense fallback
├── resume/
│   ├── page.tsx                              # 7-section 양식
│   ├── actions.ts                            # CRUD Server Actions
│   ├── import/
│   │   ├── page.tsx                          # AI 파싱 진입
│   │   └── actions.ts                        # parseResume, applyParsedResume
│   ├── export/
│   │   └── route.ts                          # PDF GET handler (mask 토글)
│   └── skills/
│       └── page.tsx                          # (선택) 기술스택 단독 탭
├── calendar/
│   ├── page.tsx                              # FullCalendar 마운트
│   └── actions.ts                            # createSchedule/update/delete
├── settlements/
│   ├── page.tsx                              # 리스트
│   └── [id]/page.tsx                         # 상세
└── settings/
    ├── page.tsx                              # 진입(메뉴)
    └── payout/
        ├── page.tsx                          # 지급 정보 폼
        └── actions.ts                        # submitPayoutSettings, requestPayoutSettingsView

src/lib/instructor/
├── resume-pdf.tsx                            # PDF 컴포넌트 (@react-pdf/renderer)
├── resume-mask.ts                            # 마스킹 순수 함수
├── settlement-summary.ts                     # 합계 계산 (단위 테스트 대상)
├── schedule-conflict.ts                      # 표시용 충돌 검사

src/lib/validation/
└── instructor.ts                             # zod 스키마 (이력서/일정/지급)

src/db/queries/instructor/
├── ensure-row.ts
├── resume.ts                                 # 7개 섹션 read/write
├── skills.ts
├── schedules.ts
├── settlements.ts
└── files.ts

src/ai/parsers/
└── resume.ts                                 # 응답 → ParsedResume

src/ai/prompts/
└── resume-parse.ts                           # 시스템 프롬프트 (cache_control)

src/components/instructor/
├── DashboardWidgets.tsx
├── ResumeForm.tsx                            # 7-section tabs + 자동 저장
├── ResumeImportDialog.tsx
├── SkillsPicker.tsx                          # 3-tier tree
├── CalendarView.tsx                          # FullCalendar 래퍼
├── UnavailableEditor.tsx
├── SettlementsTable.tsx
└── PayoutSettingsForm.tsx
```

### 7.2 수정 파일

- `src/components/app/sidebar.tsx` — instructor 메뉴 4종(`/me`, `/me/resume`, `/me/calendar`, `/me/settlements`) + 설정 sub-link 활성화 (SPEC-LAYOUT-001 placeholder 채움)
- `src/db/schema/index.ts` — 신규 추가 0 (스키마 변경 금지). 단 `instructors`/`schedule_items`/`settlements` 등 누락된 type export가 있으면 추가만.

### 7.3 신규 의존성

- `@anthropic-ai/sdk`
- `@react-pdf/renderer` 또는 `pdf-lib` (M1에서 결정)
- `@fullcalendar/react` + plugins (`daygrid`, `timegrid`, `interaction`)
- `date-fns` + `date-fns-tz`
- (이미 있음) `zod`, `react-hook-form`, `@tanstack/react-query`

### 7.4 Storage 버킷 (확인 후 SPEC-DB-002 분리 가능)

- `resume-attachments` — 강사 본인 RW, 운영자 R
- `payout-documents` — 강사 본인 RW only
- `instructor-photos` — 강사 본인 RW, 운영자 R

### 7.5 변경 없음 (재사용)

- `supabase/migrations/*` — SPEC-DB-001 산출물, 0 변경
- `src/auth/**` — SPEC-AUTH-001 산출물 그대로 사용
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물 그대로 사용
- `src/components/app/{app-shell,topbar}.tsx` — 0 변경

---

## 8. 기술 접근 (Technical Approach)

### 8.1 instructor row 보장

`getCurrentUser()` 결과의 `role === 'instructor'`이지만 `instructors` row가 없을 가능성이 있다(invitation acceptance 직후). `/me/*` 모든 페이지의 server component 진입에서 `ensureInstructorRow()`를 호출(idempotent UPSERT)하고, 결과의 `instructor.id`를 RSC props로 하위에 전달.

### 8.2 AI 파싱 + 캐시 + Fallback

- 캐시: SHA-256(file binary) → `ai_resume_parses.input_file_hash` UNIQUE
- 호출: `@anthropic-ai/sdk`, system 프롬프트 + 파일 텍스트(PDF는 `pdf-parse`/`pdfjs-dist`로 텍스트 추출), prompt caching ephemeral
- Fallback: `try/catch` + 명시 timeout(15s, AbortController), 실패 시 사용자 명확 안내 + 수동 폼

### 8.3 PII 암호화

SPEC-DB-001의 `20260427000020_pgcrypto_functions.sql`를 우선 활용. helper RPC 명세가 user-callable이 아닌 경우 server-only Server Action에서 service role로 직접 `pgp_sym_encrypt`/`pgp_sym_decrypt` 호출 + `pii_access_log` INSERT. 모든 복호화는 마스킹 처리 후 클라이언트에 반환(평문 노출 금지).

### 8.4 캘린더 데이터 흐름

- 월/주 뷰 진입 시 가시 범위(`viewStart`–`viewEnd`)에 해당하는 `schedule_items` + 강사가 배정된 `projects.education_start_at`–`education_end_at`을 select.
- system_lecture 이벤트는 projects join 결과를 가공해서 합성하지 않고 SPEC-DB-001 트리거가 `schedule_items`에 자동 합성하는지 확인. 트리거 부재 시 본 SPEC은 join 가공으로 표시만 처리(저장은 변경 0).
- TanStack Query mutate → invalidate → refetch.

### 8.5 PDF 다운로드 + 마스킹

`@react-pdf/renderer`(서버 측 렌더 가능, RSC route handler에서 stream). 마스킹 순수 함수 → 입력 단계에서 적용 후 PDF 컴포넌트에 props로 전달. `mask=true` 쿼리스트링 토글.

### 8.6 우선순위 라벨 (시간 추정 금지)

- M1 (선행) → M2 (이력서 양식) → M3 (스킬) → M4 (캘린더) → M5 (정산 조회) → M6 (AI 파싱) → M7 (지급 정보 + PII) → M8 (PDF) → M9 (a11y / dark mode 검증) → M10 (단위 테스트 / 정산 합계).

---

## 9. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 미인증 → `/login?next=/me`로 redirect
- ✅ operator/admin이 `/me/*` 접근 → silent redirect to `/dashboard`
- ✅ 첫 방문 instructors upsert + 대시보드 위젯 정상
- ✅ 7개 섹션 CRUD + reorder 동작
- ✅ AI 파싱 캐시 hit/miss + Claude API 장애 시 fallback 폼 정상 작동
- ✅ 기술스택 small-tier 토글 + proficiency 저장
- ✅ 캘린더 system_lecture read-only, personal/unavailable CRUD
- ✅ 정산 리스트 + 합계 단위 테스트 100% pass
- ✅ 지급 정보 입력 → pgcrypto 암호화 + 통장사본 Storage 업로드 + `pii_access_log` 1건
- ✅ 마스킹 PDF 다운로드 검증 (주민번호/계좌/연락처 모두)
- ✅ axe DevTools 5개 페이지 critical 0
- ✅ Lighthouse Accessibility ≥ 95
- ✅ 한국어 + Asia/Seoul 일관성

---

## 10. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Storage 버킷 3종(`resume-attachments`/`payout-documents`/`instructor-photos`)이 SPEC-DB-001에 누락 | 첨부/통장사본 업로드 차단 | M1 게이트에서 확인. 누락 시 SPEC-DB-002로 분리하여 본 SPEC은 첨부 기능을 미빌드 상태로 출시 가능. |
| `app.encrypt_pii`/`app.decrypt_pii` user-callable RPC 부재 | 지급 정보 등록 차단 | SPEC-DB-001의 `20260427000020_pgcrypto_functions.sql`을 분석하여 (a) 이미 노출된 경우 그대로 사용, (b) 부재 시 service role + Server Action 우회 (REQ-ME-PAYOUT-008), (c) SPEC-DB-002로 RPC 신설 위임 |
| PDF 파싱 라이브러리(`pdf-parse` 등)의 한국어 PDF 텍스트 추출 품질 | AI 파싱 정확도 저하 | DOCX/TXT 우선 권장. PDF는 텍스트 추출 실패 시 사용자에게 안내. Claude의 vision 입력 활용 가능성은 운영 단계 평가. |
| Claude API 응답이 prompt에서 정의한 JSON schema와 다른 형태로 반환 | 파싱 실패 | zod로 응답 schema 강제 + tool use(JSON mode) 활용 + 실패 시 fallback 발동 |
| `ai_resume_parses.input_file_hash` UNIQUE가 동일 파일 다른 강사 캐시 hit | 다른 강사의 파싱 결과 노출 | hash는 파일 내용 기준이므로 충돌 자체는 안전. `instructor_id`는 row에 기록하지만 cache lookup은 `instructor_id = self`로 추가 필터. |
| FullCalendar v6 + Next.js 16 + React 19 호환성 | 빌드 실패 | M4에서 spike. 호환 이슈 시 `react-big-calendar` 또는 자체 구현으로 대체. |
| 정산 합계 계산에 BigInt(`bigint` 컬럼) 정밀도 | 금액 오차 | `src/lib/instructor/settlement-summary.ts`에서 모든 합계 BigInt로 처리. 단위 테스트 100% 강제. |
| 통장사본 PDF에 마스킹 없이 평문 주민번호 노출 | 개인정보 유출 | 통장사본 자체는 마스킹 안 함(원본 유지). 단 다운로드 시 강사 본인만 access. PDF 이력서 다운로드는 별도 flow에서 mask 토글로 보호. |
| RLS가 강사 self-write를 막는 정책 차이(SPEC-DB-001 RLS는 `users.id = auth.uid()` 또는 `instructors.user_id = auth.uid()` 기준) | CRUD 거부 | M1에서 RLS 정책 검토. 누락 시 SPEC-DB-002로 추가. |
| 자동 저장(localStorage) 충돌 | 데이터 손실 | timestamp + form version으로 가장 최신 draft만 보존. 사용자 명시 confirm으로 적용. |
| AI 파싱 비용 폭증(악의적 반복 업로드) | API 비용 | 캐시 + 동일 hash 재요청 시 0 호출 + 사용자별 일일 N회 rate limit (애플리케이션 단). MVP는 단순 limit, 운영 단계에 정교화. |
| 캘린더 시간대 혼선(서버 UTC vs 클라이언트 KST) | 일정 시각 오표시 | 모든 timestamps `timestamp with time zone` + `date-fns-tz`로 KST 변환. 단위 테스트 추가. |

---

## 11. 참고 자료 (References)

- `.moai/project/product.md`: F-101/F-102/F-103/F-104 + §6 제약(개인정보 마스킹/AI fallback)
- `.moai/project/structure.md`: `app/(instructor)/*`, `src/ai/`, `src/auth/`, `src/lib/`, `src/db/queries/`
- `.moai/project/tech.md`: ADR-002 Supabase, ADR-003 Drizzle, ADR-004 Claude
- `.moai/specs/SPEC-DB-001/spec.md`: 통합 스키마 + RLS + pgcrypto + Storage RLS
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole('instructor')`, `<AppShell userRole>`, `/me` ROLE_HOME
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: 디자인 토큰, UI 프리미티브 11종, sidebar instructor 메뉴 placeholder
- [`plan.md`](./plan.md): 마일스톤 분해 + 의존성 그래프 + 단위 테스트 매핑
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오
- 외부:
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  - https://supabase.com/docs/guides/database/postgres/row-level-security
  - https://supabase.com/docs/guides/storage/security/access-control
  - https://fullcalendar.io/docs/react
  - https://react-pdf.org

---

_End of SPEC-ME-001 spec.md_
