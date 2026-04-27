---
id: SPEC-INSTRUCTOR-001
version: 0.1.0
status: draft
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-INSTRUCTOR-001: 담당자용 강사 관리 (Operator Instructor Management)

## HISTORY

- **2026-04-27 (v0.1.0)**: 초기 작성. 알고링크 MVP `[F-203] 강사 관리` 명세. (1) `/instructors` 강사 리스트(검색·필터·정렬·페이지네이션), (2) `/instructors/[id]` 강사 상세(기본정보 + 진행 이력 + AI 만족도 요약), (3) `/instructors/new` 강사 메타데이터 등록(초대 발급은 SPEC-AUTH-001에 위임), (4) Anthropic Claude API 기반 AI 만족도 요약 + 24h DB 캐시(`public.ai_satisfaction_summaries` 재사용) + API 장애 시 평균 점수 폴백, (5) operator/admin 전용 라우트 가드(SPEC-AUTH-001 `requireRole(['operator','admin'])`), (6) `instructors_safe` view를 통한 PII 마스킹 기본 + 정산 합계는 `settlements` 집계, (7) 한국어/Asia/Seoul/WCAG 2.1 AA 베이스를 명세한다. SPEC-DB-001(완료) + SPEC-AUTH-001(완료) + SPEC-LAYOUT-001(완료) 후속. SPEC-PROJECT-001(미작성)이 본 SPEC의 만족도 데이터를 추천 엔진에서 소비. SPEC-ME-001(미작성)이 강사 본인 이력서 편집을 담당.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

알고링크 MVP의 **담당자(operator/admin) 강사 관리 화면**을 구축한다. 본 SPEC의 산출물은 (a) `/instructors` 리스트 페이지로 이름·기술스택·강의 횟수·정산 합계·만족도 평균·마지막 강의일 6개 컬럼 노출 + 검색(이름/기술스택/도메인) + 만족도 범위 필터 + 정렬 + 페이지네이션, (b) `/instructors/[id]` 상세 페이지로 기본정보(이력서 링크, 연락처) + 진행 이력 테이블(프로젝트, 기간, 만족도) + AI 누적 만족도 요약(강점/약점/추천 분야) + AI 폴백 시 평균 점수 표시, (c) `/instructors/new` 등록 페이지로 강사 메타데이터(이름, 이메일, 연락처, 기본 기술스택) 입력 후 SPEC-AUTH-001 `inviteUserByEmail` 흐름으로 위임하는 "등록 + 초대" 통합 진입점, (d) `src/lib/ai/instructor-summary.ts`로 Claude API를 호출하여 누적 만족도 코멘트를 강점/약점/추천 분야 3섹션으로 요약하고 `public.ai_satisfaction_summaries`에 24h 캐시 + Prompt Caching 활용, (e) operator/admin 전용 라우트 가드 + RLS(SPEC-DB-001 `instructors_operator_select` 등)로 권한 분리, (f) SPEC-LAYOUT-001 `<AppShell>`의 `[F-203]` sidebar 항목(`/instructors`) wiring, (g) 한국어 UI + Asia/Seoul 타임존 + WCAG 2.1 AA + axe DevTools critical 0 + Lighthouse Accessibility ≥ 95이다.

본 SPEC은 강사 메타데이터 화면만 빌드하며, **강사 본인의 이력서 편집/일정/정산 본인 화면**(`/me/*`)은 SPEC-ME-001로 위임한다. **AI 강사 추천 엔진**(`[F-202]`)은 SPEC-PROJECT-001이 본 SPEC의 만족도 평균 컬럼을 데이터 소비자로 소비한다.

### 1.2 배경 (Background)

`.moai/project/product.md` `[F-203]`은 (1) 강사진 조회/등록, (2) 강사 클릭 시 진행 이력(교육 횟수, 정산 합계, 만족도 평균), (3) AI 만족도 요약(누적 만족도 코멘트 → Claude API 요약)을 명시한다. `.moai/project/product.md` 6장 제약 사항은 "AI 응답 fallback: Claude API 장애 시 수동 입력 경로 항상 유지"를 강제하므로, 본 SPEC은 AI 요약 미생성/실패 시 평균 점수 + 최근 코멘트 N건 표시 폴백을 반드시 구현한다.

데이터 모델은 SPEC-DB-001 `20260427000030_initial_schema.sql`로 이미 확정되어 본 SPEC은 신규 마이그레이션을 발생시키지 않는다. 활용 테이블: `instructors`, `instructor_skills`, `skill_categories`, `instructor_projects`(또는 `projects.instructor_id`), `satisfaction_reviews`(score 1-5 + comment), `ai_satisfaction_summaries`(summary_text + model + generated_at), `settlements`(instructor_fee_krw 집계). PII 컬럼(`resident_number_enc`, `bank_account_enc`)은 `bytea` 암호화 + `instructors_safe` view로 기본 차단되며 본 SPEC의 화면은 PII 컬럼을 절대 SELECT하지 않는다.

라우트는 SPEC-LAYOUT-001 `src/lib/nav.ts`가 이미 `{ href: "/instructors", label: "강사 관리" }`를 operator/admin nav에 등록했고, SPEC-AUTH-001이 `(operator)/layout.tsx`에 `requireRole(['operator', 'admin'])` 가드를 박아둔 상태이므로, 본 SPEC은 `src/app/(operator)/instructors/` 하위 페이지만 추가하면 가드/네비/AppShell 통합이 자동으로 동작한다.

### 1.3 범위 (Scope)

**In Scope:**

- `src/app/(operator)/instructors/page.tsx` — 리스트 페이지 (Server Component)
- `src/app/(operator)/instructors/[id]/page.tsx` — 상세 페이지 (Server Component)
- `src/app/(operator)/instructors/[id]/loading.tsx` — Suspense fallback
- `src/app/(operator)/instructors/[id]/summary-section.tsx` — AI 요약 섹션 (서버 컴포넌트, Suspense 경계)
- `src/app/(operator)/instructors/new/page.tsx` — 등록 폼 (initial metadata + email)
- `src/app/(operator)/instructors/new/actions.ts` — `createInstructorAndInvite(formData)` Server Action
- `src/app/(operator)/instructors/[id]/actions.ts` — `regenerateSummary(instructorId)` Server Action (강제 재생성)
- `src/lib/instructor/queries.ts` — Drizzle 쿼리 헬퍼:
  - `listInstructorsForOperator(filters): Promise<InstructorListRow[]>` — JOIN + GROUP BY로 6개 컬럼 한 번에 집계
  - `getInstructorDetailForOperator(id): Promise<InstructorDetail | null>` — 기본정보 + projects/reviews
  - `getRecentReviewComments(instructorId, limit=5): Promise<ReviewComment[]>` — 폴백용
- `src/lib/instructor/types.ts` — `InstructorListRow`, `InstructorListFilter`, `InstructorDetail`, `SummaryFallback`
- `src/lib/instructor/skills.ts` — `getAllSkillCategories()`, 검색용 trigram or ILIKE
- `src/lib/ai/instructor-summary.ts`:
  - `generateInstructorSummary(instructorId): Promise<{ summary: string; model: string; cached: boolean }>`
  - `getOrGenerateSummary(instructorId): Promise<SummaryResult>` — 24h 캐시 우선
  - `buildSummaryPrompt(reviews): { system: string; user: string }` — Prompt Caching 친화 (system은 캐시 가능)
  - 실패 시 `{ kind: 'fallback', avgScore, recentComments }` 반환
- `src/lib/validation/instructor.ts` — zod schemas: `instructorCreateSchema`, `instructorListFilterSchema`
- `src/components/instructor/instructor-list-table.tsx` — shadcn/ui Table + 정렬 헤더
- `src/components/instructor/instructor-list-filters.tsx` — 검색/만족도 범위 필터 UI
- `src/components/instructor/skill-multiselect.tsx` — 기술스택 멀티 선택 (등록 폼 + 필터 공용)
- `src/components/instructor/satisfaction-summary-card.tsx` — AI 요약 + 폴백 분기 카드
- `src/components/instructor/instructor-history-table.tsx` — 진행 이력 테이블
- `src/components/instructor/pagination.tsx` — 공용 페이지네이션 (또는 SPEC-LAYOUT-001 기존 컴포넌트 재사용)
- 한국어 라벨 + ARIA 라벨 + role/aria-live 영역
- `acceptance.md` Given/When/Then 시나리오 + axe/Lighthouse 게이트

**Out of Scope (Exclusions — What NOT to Build):**

- **신규 DB 마이그레이션**: SPEC-DB-001 스키마로 충분. 만일 인덱스 부족이 acceptance에서 발견되면 SPEC-DB-002로 분리한다 (본 SPEC은 코드만).
- **강사 본인 이력서 편집/조회 UI**: `/me/resume`, `/me/dashboard`, `/me/schedule`, `/me/settlement` 4종은 SPEC-ME-001 범위. 본 SPEC은 operator 측 "이력서 보기" 링크만 노출(클릭 시 상세 view 화면은 SPEC-ME-001과 통합 또는 별도 SPEC).
- **강사 이력서 PDF 다운로드 (마스킹 옵션 포함)**: `[F-102]` 항목, SPEC-ME-001 범위.
- **강사 삭제 / 비활성화 / soft delete UI**: 본 SPEC은 list/detail/create만. delete는 admin UI(SPEC-ADMIN-001)로 위임. `instructors.deleted_at`은 list 쿼리에서 `IS NULL` 필터만 적용.
- **강사 메타데이터 인라인 편집**: 등록 후 수정은 별도 SPEC-INSTRUCTOR-EDIT-XXX (또는 본 SPEC v1.1 후속). MVP는 등록 후 운영자가 SQL/admin UI로 보정.
- **AI 강사 추천 엔진**: `[F-202]` Top-3 추천 + 1-클릭 배정은 SPEC-PROJECT-001. 본 SPEC은 추천 엔진이 소비할 만족도 평균 컬럼을 노출만 함.
- **강사 PII (주민번호/계좌) 표시 / 편집**: `instructors_safe` view 사용으로 PII 컬럼은 처음부터 SELECT하지 않음. 정산 화면(SPEC-SETTLEMENT-001)에서 마스킹 후 표시.
- **이메일 템플릿 변경**: 초대 발송은 SPEC-AUTH-001 `inviteUserByEmail`에 100% 위임. 본 SPEC은 초대 트리거 이외 이메일 흐름 미빌드.
- **만족도 입력 / 수정 UI**: 만족도 review 입력은 프로젝트 종료 시점 워크플로우(SPEC-PROJECT-001)에서 발생. 본 SPEC은 read-only 집계만.
- **Realtime / 실시간 갱신**: Supabase Realtime 미사용. 페이지 새로고침/네비게이션으로 갱신.
- **캘린더 뷰 / 강사별 일정 표시**: SPEC-PROJECT-001 (담당자 메인 대시보드 월력) 범위.
- **Bulk action (다중 선택 + 일괄 처리)**: 미구현.
- **CSV/Excel export**: MVP 미포함.
- **AI 요약 사용자 피드백 (좋아요/싫어요)**: 본 SPEC은 단방향 표시만. 정확도 검증은 acceptance 항목에 의해 **운영자 수동 검증**으로 제한.
- **AI 모델 사용자 선택 UI**: `claude-sonnet-4-6` 고정 (`.moai/project/tech.md` ADR-004). 폴백 모델 선택 미제공.
- **OpenAI fallback API**: tech.md 5절 옵션이지만 본 SPEC 범위 밖. Claude 실패 시 평균 점수 폴백만.
- **새로운 skill_categories 추가 UI**: `skill_categories` 테이블 seed에 의존. 신규 카테고리 추가는 admin SQL/별도 SPEC.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드/타입/린트 무오류: `pnpm build`, `pnpm tsc --noEmit`, `pnpm lint` 0 critical
- ✅ 라우트 가드: instructor 토큰으로 `/instructors`, `/instructors/[id]`, `/instructors/new` 접근 시 SPEC-AUTH-001 `requireRole`이 `/me/dashboard`로 silent redirect (응답 본문에 instructor 데이터 미노출)
- ✅ 리스트 6개 컬럼 정상 표시: 이름, 기술스택(top 3 + N more), 강의 횟수, 정산 합계(KRW), 만족도 평균(소수점 1자리 + N reviews), 마지막 강의일(YYYY-MM-DD, Asia/Seoul)
- ✅ 검색 동작: 이름 ILIKE 쿼리, 기술스택 필터(N개 동시 선택 OR), 만족도 범위 필터(min-max 슬라이더 또는 select)
- ✅ 정렬: 이름 / 강의 횟수 / 만족도 평균 / 마지막 강의일 4종 컬럼 헤더 클릭 시 ASC/DESC 토글
- ✅ 페이지네이션: 1페이지 20명 + 이전/다음 + 총 N명 표시
- ✅ 상세 페이지 진행 이력 테이블: 프로젝트명, 기간(시작-종료), 만족도(score/5 + 코멘트 1줄 truncate)
- ✅ AI 만족도 요약: Claude API 호출 성공 시 강점/약점/추천 분야 3섹션 한국어 표시 + 모델/생성일 메타
- ✅ AI 캐시 동작: 24시간 이내 재방문 시 동일 요약 표시 (DB row의 `generated_at` 검증), 24h 초과 시 백그라운드 재생성
- ✅ AI 폴백: Claude API 장애(타임아웃/5xx) 시 만족도 평균 + 최근 코멘트 5건 표시 + 명시적 안내 배너 ("AI 요약을 사용할 수 없어 평균 점수와 최근 코멘트로 대체합니다.")
- ✅ AI 요약 정확도 검증: acceptance.md에 운영자 수동 검증 절차 명시 (3명 강사 샘플)
- ✅ 등록 흐름: `/instructors/new` 폼 입력 → `instructors` INSERT + SPEC-AUTH-001 `inviteUserByEmail` 호출 → operator 화면에 success toast → 신규 강사가 초대 수락 후 `instructors.user_id`가 자동 매핑(handle_new_user trigger 또는 명시 UPDATE)
- ✅ 한국어 UI: 모든 라벨, 에러 메시지, 빈 상태(empty state) 한국어
- ✅ Asia/Seoul 타임존: 마지막 강의일, AI 요약 생성일 모두 KST 표시
- ✅ 접근성: axe DevTools `/instructors`, `/instructors/[id]`, `/instructors/new` 3페이지 critical 0건
- ✅ Lighthouse Accessibility ≥ 95 (3페이지 평균)
- ✅ 키보드 only: Tab으로 모든 인터랙션 도달, Enter 정렬/페이지 이동, Esc로 dropdown 닫기
- ✅ AppShell 통합: sidebar `/instructors` active highlight, 페이지 타이틀 "강사 관리"

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 8개 모듈로 구성된다: `LIST`, `DETAIL`, `CREATE`, `AI`, `GUARD`, `DATA`, `A11Y`, `ERROR`.

### 2.1 REQ-INSTRUCTOR-LIST — 리스트 페이지

**REQ-INSTRUCTOR-LIST-001 (Ubiquitous)**
The system **shall** provide a server-rendered list page at `/instructors` that displays a paginated table of instructors with exactly six columns: 이름(name_kr), 기술스택(top 3 skill_categories names + "+N more"), 강의 횟수(count of distinct projects with status `education_done` or beyond), 정산 합계(SUM of `settlements.instructor_fee_krw` in KRW), 만족도 평균(AVG of `satisfaction_reviews.score` rounded to 1 decimal + total review count), 마지막 강의일(MAX of project end date, formatted YYYY-MM-DD in Asia/Seoul).

**REQ-INSTRUCTOR-LIST-002 (Ubiquitous)**
The system **shall** filter out soft-deleted instructors (`deleted_at IS NOT NULL`) from the list by default with no UI option to view them.

**REQ-INSTRUCTOR-LIST-003 (Event-Driven)**
**When** the operator enters text in the name search input, the system **shall** filter instructors whose `name_kr` matches the input via case-insensitive partial match (`ILIKE %query%`).

**REQ-INSTRUCTOR-LIST-004 (Event-Driven)**
**When** the operator selects one or more skill categories in the skill filter, the system **shall** display only instructors who have at least one matching row in `instructor_skills` (OR semantics across selected categories).

**REQ-INSTRUCTOR-LIST-005 (Event-Driven)**
**When** the operator adjusts the satisfaction range filter (min-max, default 1-5), the system **shall** filter instructors whose computed `AVG(score)` falls within the inclusive range; instructors with zero reviews **shall** be excluded only when the minimum is greater than 0.

**REQ-INSTRUCTOR-LIST-006 (Event-Driven)**
**When** the operator clicks a sortable column header (name, lecture count, avg satisfaction, last lecture date), the system **shall** toggle the sort direction (asc/desc) for that column and reset other columns to default order, encoding the choice in URL query params (`?sort=avg_score&dir=desc`).

**REQ-INSTRUCTOR-LIST-007 (Ubiquitous)**
The system **shall** paginate the list at 20 instructors per page with previous/next controls and a "총 N명" total count, encoding the current page in URL query param (`?page=2`).

**REQ-INSTRUCTOR-LIST-008 (Unwanted Behavior)**
**If** zero instructors match the active filters, **then** the system **shall** display the empty state message `"조건에 맞는 강사가 없습니다."` with a "필터 초기화" link, and **shall not** show an error.

**REQ-INSTRUCTOR-LIST-009 (Ubiquitous)**
The system **shall** render each row as a clickable link to `/instructors/[id]` with the entire row navigable via Enter key when focused.

**REQ-INSTRUCTOR-LIST-010 (Optional Feature)**
**Where** an instructor has zero reviews, the system **shall** display `"-"` for the satisfaction column and `"강의 이력 없음"` for the last lecture date column rather than rendering empty cells.

### 2.2 REQ-INSTRUCTOR-DETAIL — 상세 페이지

**REQ-INSTRUCTOR-DETAIL-001 (Ubiquitous)**
The system **shall** provide a server-rendered detail page at `/instructors/[id]` that loads the instructor by primary key (UUID) and renders three sections: 기본 정보, 진행 이력, AI 만족도 요약.

**REQ-INSTRUCTOR-DETAIL-002 (Ubiquitous)**
The 기본 정보 section **shall** display: 이름, 영문명(if present), 이메일, 전화번호, 기술스택(all categories), 등록일(`created_at`), 이력서 보기 링크(placeholder for SPEC-ME-001 integration; if SPEC-ME-001 is not yet implemented, render a disabled button with tooltip `"이력서 화면은 SPEC-ME-001 후속 작업입니다."`).

**REQ-INSTRUCTOR-DETAIL-003 (Ubiquitous)**
The 진행 이력 section **shall** display a table with columns: 프로젝트명(projects.title), 기간(start_date - end_date, Asia/Seoul, YYYY-MM-DD), 만족도(score/5), 코멘트(satisfaction_reviews.comment truncated to 80 chars with full text in tooltip). Rows **shall** be sorted by project end date descending.

**REQ-INSTRUCTOR-DETAIL-004 (Unwanted Behavior)**
**If** the instructor has no completed projects, **then** the 진행 이력 section **shall** display the empty state `"아직 진행한 강의가 없습니다."` instead of an empty table.

**REQ-INSTRUCTOR-DETAIL-005 (Unwanted Behavior)**
**If** the requested instructor id does not exist or the row is soft-deleted, **then** the page **shall** return Next.js `notFound()` triggering the 404 handler, and **shall not** render any partial information about the existence of the id.

**REQ-INSTRUCTOR-DETAIL-006 (Ubiquitous)**
The page **shall** wrap the AI 만족도 요약 section in a React Suspense boundary so that initial paint of 기본 정보 + 진행 이력 is not blocked by Claude API latency; the Suspense fallback **shall** display a `<Skeleton>` matching the summary card dimensions.

**REQ-INSTRUCTOR-DETAIL-007 (Ubiquitous)**
The page header **shall** include a back link `"← 강사 목록"` pointing to `/instructors` that preserves the previous list filter/sort/page query params via URL state.

### 2.3 REQ-INSTRUCTOR-CREATE — 강사 등록

**REQ-INSTRUCTOR-CREATE-001 (Ubiquitous)**
The system **shall** provide an instructor creation page at `/instructors/new` accessible to operator and admin roles, with a form containing: 이름(필수, name_kr), 영문명(선택, name_en), 이메일(필수, unique), 전화번호(선택), 기본 기술스택(선택, 다중).

**REQ-INSTRUCTOR-CREATE-002 (Event-Driven)**
**When** the operator submits the form, the system **shall** validate inputs via zod (`instructorCreateSchema` in `src/lib/validation/instructor.ts`) including email format, name length 1-100, and phone format `^[0-9-+()\s]{6,20}$`.

**REQ-INSTRUCTOR-CREATE-003 (Event-Driven)**
**When** validation passes, the system **shall** (1) INSERT a row into `public.instructors` with `name_kr`, `name_en`, `email`, `phone`, `created_by = auth.uid()`, `user_id = NULL`; (2) INSERT N rows into `public.instructor_skills` for selected categories; (3) call SPEC-AUTH-001 `inviteUserByEmail(email, { invited_role: 'instructor', metadata: { instructor_id } })` via the service role client; (4) all four operations **shall** execute within a single Supabase RPC or sequential calls with manual rollback on failure.

**REQ-INSTRUCTOR-CREATE-004 (Unwanted Behavior)**
**If** the email already exists in `public.instructors` or `auth.users`, **then** the system **shall** display the Korean message `"이미 등록된 이메일입니다."` and **shall not** create the instructor row or invitation.

**REQ-INSTRUCTOR-CREATE-005 (Event-Driven)**
**When** the invitation succeeds, the system **shall** redirect to `/instructors/[id]` of the newly created instructor with a success toast `"강사를 등록하고 초대 메일을 발송했습니다."`.

**REQ-INSTRUCTOR-CREATE-006 (Unwanted Behavior)**
**If** the `inviteUserByEmail` call fails after the `instructors` row is created, **then** the system **shall** delete the `instructors` row (rollback), surface the Korean error `"초대 발송에 실패했습니다. 잠시 후 다시 시도해주세요."`, and log the failure to `auth_events` with `event_type = 'invitation_issued'` is **not** written (only successful issuance is logged).

**REQ-INSTRUCTOR-CREATE-007 (Event-Driven)**
**When** the invitee accepts the invitation (SPEC-AUTH-001 set-password flow), the system **shall** rely on a database trigger or the SPEC-AUTH-001 accept-invite Server Action to UPDATE `public.instructors.user_id = auth.user.id` based on email match, ensuring the instructor row is linked to the authenticated user; this linkage logic **shall** be implemented in the SPEC-AUTH-001 accept-invite Server Action by reading `metadata.instructor_id` from the invitation.

### 2.4 REQ-INSTRUCTOR-AI — AI 만족도 요약

**REQ-INSTRUCTOR-AI-001 (Ubiquitous)**
The system **shall** provide a function `getOrGenerateSummary(instructorId): Promise<SummaryResult>` in `src/lib/ai/instructor-summary.ts` that returns the AI-generated satisfaction summary for an instructor, where `SummaryResult` is one of `{ kind: 'ai', summary: string, model: string, generatedAt: Date }`, `{ kind: 'fallback', avgScore: number | null, recentComments: ReviewComment[] }`, or `{ kind: 'empty' }`.

**REQ-INSTRUCTOR-AI-002 (State-Driven)**
**While** a row exists in `public.ai_satisfaction_summaries` for the instructor with `generated_at >= now() - interval '24 hours'`, the system **shall** return the cached summary without calling the Claude API.

**REQ-INSTRUCTOR-AI-003 (Event-Driven)**
**When** no fresh cache exists and the instructor has at least 3 satisfaction reviews with non-empty comments, the system **shall** call the Anthropic Claude API via `@anthropic-ai/sdk` with model `claude-sonnet-4-6` to generate a Korean summary structured as 강점 / 약점 / 추천 분야 three sections.

**REQ-INSTRUCTOR-AI-004 (Ubiquitous)**
The Claude API call **shall** include Anthropic Prompt Caching (`cache_control: { type: 'ephemeral' }`) on the system prompt portion to reduce repeat-call cost per `.moai/project/tech.md` ADR-004.

**REQ-INSTRUCTOR-AI-005 (Event-Driven)**
**When** the Claude API call succeeds, the system **shall** UPSERT the result into `public.ai_satisfaction_summaries` with `instructor_id`, `summary_text`, `model`, `generated_at = now()` and return `{ kind: 'ai', ... }`.

**REQ-INSTRUCTOR-AI-006 (Unwanted Behavior)**
**If** the Claude API call fails (timeout > 30s, 5xx response, network error), **then** the system **shall** return `{ kind: 'fallback', avgScore, recentComments }` with the most recent 5 review comments (or fewer if total reviews < 5), and **shall not** throw an exception that prevents the detail page from rendering.

**REQ-INSTRUCTOR-AI-007 (Unwanted Behavior)**
**If** the instructor has fewer than 3 reviews with non-empty comments, **then** the system **shall** return `{ kind: 'empty' }` without calling the Claude API, and the UI **shall** display `"AI 요약은 만족도 코멘트가 3건 이상 누적된 후 생성됩니다."`.

**REQ-INSTRUCTOR-AI-008 (Ubiquitous)**
The summary card UI **shall** display the model name (`claude-sonnet-4-6`) and generation timestamp (Asia/Seoul, "YYYY-MM-DD HH:mm") below the summary text so operators can assess freshness.

**REQ-INSTRUCTOR-AI-009 (Optional Feature)**
**Where** an operator triggers the "재생성" button on the detail page, the system **shall** invoke the `regenerateSummary` Server Action which forces a Claude API call (bypassing the 24h cache), updates the row, and revalidates the detail page; this action **shall** be rate-limited to once per minute per instructor at the application layer.

**REQ-INSTRUCTOR-AI-010 (Ubiquitous)**
The system **shall** strip PII from the prompt sent to Claude: only `score`, `comment`, project title, and project end date are included; instructor name, email, phone, resident number, bank account **shall not** appear in the prompt body or system instructions.

**REQ-INSTRUCTOR-AI-011 (Unwanted Behavior)**
**If** a fallback path is rendered, **then** the UI **shall** display the explicit Korean banner `"AI 요약을 사용할 수 없어 평균 점수와 최근 코멘트로 대체합니다."` with `role="status"` so screen readers announce the degraded state.

### 2.5 REQ-INSTRUCTOR-GUARD — 라우트 가드

**REQ-INSTRUCTOR-GUARD-001 (Ubiquitous)**
The system **shall** place all instructor management routes under the `(operator)` route group so SPEC-AUTH-001's `requireRole(['operator', 'admin'])` server layout guard applies automatically; no per-page guard call is required.

**REQ-INSTRUCTOR-GUARD-002 (Unwanted Behavior)**
**If** an instructor-role user accesses `/instructors`, `/instructors/[id]`, or `/instructors/new`, **then** SPEC-AUTH-001 GUARD-003 **shall** silently redirect to `/me/dashboard` and the response **shall not** include any HTML referencing other instructors' data.

**REQ-INSTRUCTOR-GUARD-003 (Ubiquitous)**
The system **shall** rely on SPEC-DB-001 RLS policies (`instructors_operator_select`, `instructors_operator_insert`, `instructors_operator_update`) for database-layer access control; application-layer queries **shall** use the standard authenticated Supabase client (not service role) except for the `inviteUserByEmail` call in REQ-INSTRUCTOR-CREATE-003.

**REQ-INSTRUCTOR-GUARD-004 (Unwanted Behavior)**
**If** an operator attempts to view a soft-deleted instructor by direct id navigation (`/instructors/{deletedId}`), **then** the page **shall** return `notFound()` since `deleted_at IS NULL` is enforced in the query, and **shall not** reveal that the id once existed.

### 2.6 REQ-INSTRUCTOR-DATA — 데이터 모델 / 쿼리

**REQ-INSTRUCTOR-DATA-001 (Ubiquitous)**
The system **shall** reuse SPEC-DB-001 schema without introducing new migrations: `public.instructors`, `public.instructor_skills`, `public.skill_categories`, `public.projects` (with `instructor_id`), `public.satisfaction_reviews`, `public.ai_satisfaction_summaries`, `public.settlements`.

**REQ-INSTRUCTOR-DATA-002 (Ubiquitous)**
The list query **shall** be implemented in `src/lib/instructor/queries.ts` `listInstructorsForOperator(filters)` as a single Drizzle `select` with LEFT JOINs and GROUP BY on instructor id to compute lecture count, settlement total, average score, and last lecture date in one round trip.

**REQ-INSTRUCTOR-DATA-003 (Ubiquitous)**
The list query **shall** select columns only from `public.instructors_safe` view (or equivalent column whitelist) so that PII columns (`resident_number_enc`, `bank_account_enc`, `business_number_enc`, `withholding_tax_rate_enc`) are never read, even though RLS would block them.

**REQ-INSTRUCTOR-DATA-004 (Unwanted Behavior)**
**If** the list query takes longer than 1.0s on the production-equivalent dataset (50 clients, 100 instructors, ~500 projects per `.moai/project/product.md` 1.2 규모), **then** the implementation **shall** be revised to add covering indexes (proposed as SPEC-DB-002) before the SPEC is marked completed.

**REQ-INSTRUCTOR-DATA-005 (Ubiquitous)**
All timestamps in user-facing display **shall** be rendered in Asia/Seoul timezone using `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` or equivalent `date-fns-tz` formatting, never raw UTC.

**REQ-INSTRUCTOR-DATA-006 (Ubiquitous)**
The settlement total column **shall** display KRW with thousands separator (e.g., `12,345,000원`) and **shall** sum only `settlements.status` values that represent paid or in-progress payment states (not draft).

**REQ-INSTRUCTOR-DATA-007 (Ubiquitous)**
The lecture count column **shall** count only projects whose status is `education_done`, `settlement_in_progress`, or `task_done` (i.e., the lecture has actually been delivered), per the `project_status` enum from SPEC-DB-001.

### 2.7 REQ-INSTRUCTOR-A11Y — 접근성

**REQ-INSTRUCTOR-A11Y-001 (Ubiquitous)**
The system **shall** ensure all three pages (`/instructors`, `/instructors/[id]`, `/instructors/new`) are fully keyboard navigable: every search input, filter, sort header, pagination button, table row, and form field reachable via Tab, with Enter activating the action.

**REQ-INSTRUCTOR-A11Y-002 (Ubiquitous)**
The list table **shall** use semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col">` markup; sortable column headers **shall** have `aria-sort="ascending" | "descending" | "none"` attributes reflecting the active sort state.

**REQ-INSTRUCTOR-A11Y-003 (Ubiquitous)**
The skill multiselect, satisfaction range filter, and form inputs **shall** be associated with `<label htmlFor>` elements; validation errors **shall** be exposed via `aria-invalid="true"` and `aria-describedby` pointing to a `role="alert"` paragraph.

**REQ-INSTRUCTOR-A11Y-004 (Event-Driven)**
**When** an asynchronous filter or sort change updates the table contents, the system **shall** announce the result count via a `role="status" aria-live="polite"` region (e.g., `"15명의 강사가 검색되었습니다."`).

**REQ-INSTRUCTOR-A11Y-005 (Ubiquitous)**
The system **shall** maintain SPEC-LAYOUT-001's contrast and focus-ring requirements (4.5:1 body, 3:1 large/UI, 2px focus outline) on all three pages in both light and dark modes.

**REQ-INSTRUCTOR-A11Y-006 (Ubiquitous)**
The AI summary card **shall** use heading hierarchy `<h2>AI 만족도 요약</h2>` followed by `<h3>강점</h3>`, `<h3>약점</h3>`, `<h3>추천 분야</h3>` so screen readers can navigate sections via heading shortcut.

### 2.8 REQ-INSTRUCTOR-ERROR — 에러 UX (한국어)

**REQ-INSTRUCTOR-ERROR-001 (Ubiquitous)**
The system **shall** display Korean error messages for all user-facing failure scenarios; English Supabase or Anthropic SDK error messages **shall not** appear in the UI.

**REQ-INSTRUCTOR-ERROR-002 (Ubiquitous)**
The system **shall** use the following exact Korean messages:
- 빈 검색 결과: `"조건에 맞는 강사가 없습니다."`
- 강사 미존재 (404): `"존재하지 않는 강사입니다."`
- AI 요약 사용 불가: `"AI 요약을 사용할 수 없어 평균 점수와 최근 코멘트로 대체합니다."`
- AI 요약 데이터 부족: `"AI 요약은 만족도 코멘트가 3건 이상 누적된 후 생성됩니다."`
- 등록 폼 이메일 중복: `"이미 등록된 이메일입니다."`
- 등록 폼 이메일 형식 오류: `"올바른 이메일 형식을 입력해주세요."`
- 등록 폼 이름 누락: `"이름을 입력해주세요."`
- 초대 발송 실패: `"초대 발송에 실패했습니다. 잠시 후 다시 시도해주세요."`
- 만족도 범위 입력 오류: `"최소 만족도는 최대 만족도보다 작거나 같아야 합니다."`
- 일반 네트워크 실패: `"네트워크 연결을 확인하고 다시 시도해주세요."`

**REQ-INSTRUCTOR-ERROR-003 (Unwanted Behavior)**
**If** an unmapped error occurs, **then** the system **shall** display the generic Korean fallback `"알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요."` and log the original error to the application error log.

**REQ-INSTRUCTOR-ERROR-004 (Ubiquitous)**
The system **shall** never log raw `satisfaction_reviews.comment` content alongside instructor PII; AI prompt construction (REQ-INSTRUCTOR-AI-010) and error logging **shall** keep the two domains separated.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 강사 본인 화면 (`/me/*` 4종: dashboard/resume/schedule/settlement) | SPEC-ME-001 |
| 강사 이력서 PDF 다운로드 + 마스킹 옵션 | SPEC-ME-001 |
| 강사 메타데이터 인라인 편집 (등록 후 수정) | SPEC-INSTRUCTOR-EDIT-XXX (후속) |
| 강사 삭제 / soft delete UI | SPEC-ADMIN-001 |
| AI 강사 추천 엔진 (`[F-202]` Top-3) | SPEC-PROJECT-001 |
| 만족도 입력 / 수정 UI | SPEC-PROJECT-001 (프로젝트 종료 워크플로우) |
| 강사 PII (주민번호/계좌) 표시 / 편집 | SPEC-SETTLEMENT-001 (마스킹 후 정산 화면) |
| 신규 DB 마이그레이션 (인덱스 추가 등) | SPEC-DB-002 (acceptance에서 성능 미달 시 분리) |
| 이메일 템플릿 디자인 변경 | SPEC-AUTH-001 (운영 단계) |
| Realtime / 실시간 갱신 | (검토 후 결정) |
| 캘린더 / 강사별 일정 표시 | SPEC-PROJECT-001 |
| Bulk action / CSV export | (운영 단계, MVP 외) |
| AI 요약 사용자 피드백 (좋아요/싫어요) | (검토 후 결정) |
| OpenAI fallback API 통합 | (운영 단계, tech.md 옵션) |
| 새로운 skill_categories 추가 UI | SPEC-ADMIN-001 또는 admin SQL |
| 외부 채널 자동 의뢰 입력 (`product.md` 3.2 Out-of-Scope) | (MVP 이후) |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 파일 (페이지 + 액션)

- `src/app/(operator)/instructors/page.tsx` — 리스트 페이지
- `src/app/(operator)/instructors/loading.tsx` — list Skeleton
- `src/app/(operator)/instructors/[id]/page.tsx` — 상세 페이지
- `src/app/(operator)/instructors/[id]/loading.tsx` — detail Skeleton
- `src/app/(operator)/instructors/[id]/summary-section.tsx` — Suspense 경계 안의 AI 섹션
- `src/app/(operator)/instructors/[id]/actions.ts` — `regenerateSummary` Server Action
- `src/app/(operator)/instructors/new/page.tsx` — 등록 폼
- `src/app/(operator)/instructors/new/actions.ts` — `createInstructorAndInvite`
- `src/app/(operator)/instructors/not-found.tsx` — 404 (강사 미존재)

### 4.2 신규 파일 (도메인 로직)

- `src/lib/instructor/queries.ts` — `listInstructorsForOperator`, `getInstructorDetailForOperator`, `getRecentReviewComments`
- `src/lib/instructor/types.ts` — `InstructorListRow`, `InstructorListFilter`, `InstructorDetail`, `ReviewComment`, `SummaryResult`
- `src/lib/instructor/skills.ts` — `getAllSkillCategories()`
- `src/lib/instructor/format.ts` — KRW formatter, KST date formatter (또는 SPEC-LAYOUT-001 공용 유틸 재사용)
- `src/lib/ai/instructor-summary.ts` — Claude API 호출 + 캐시 + 폴백
- `src/lib/ai/anthropic-client.ts` (신규 또는 기존 재사용) — `@anthropic-ai/sdk` 클라이언트 팩토리, `import 'server-only'`
- `src/lib/validation/instructor.ts` — zod schemas

### 4.3 신규 파일 (컴포넌트)

- `src/components/instructor/instructor-list-table.tsx`
- `src/components/instructor/instructor-list-filters.tsx`
- `src/components/instructor/skill-multiselect.tsx`
- `src/components/instructor/satisfaction-range-slider.tsx` (또는 select 한 쌍)
- `src/components/instructor/satisfaction-summary-card.tsx`
- `src/components/instructor/satisfaction-fallback-card.tsx`
- `src/components/instructor/instructor-history-table.tsx`
- `src/components/instructor/instructor-form.tsx`
- `src/components/instructor/pagination.tsx` (또는 SPEC-LAYOUT-001 기존 재사용)

### 4.4 수정 파일

- `src/app/(operator)/instructors/` 디렉토리는 신규이므로 SPEC-AUTH-001 `(operator)/layout.tsx`의 `requireRole(['operator', 'admin'])` 가드를 자동 상속
- (선택) SPEC-AUTH-001 `accept-invite/set-password/actions.ts` — REQ-INSTRUCTOR-CREATE-007의 `instructors.user_id` 매핑 로직을 추가 (invitation metadata 기반). 실제 코드 변경 시 SPEC-AUTH-001 v1.1 또는 hook function으로 분리 검토.
- `package.json` — `@anthropic-ai/sdk` 의존성 추가 (이미 존재 시 skip)
- `.env.example` — `ANTHROPIC_API_KEY` 항목 추가

### 4.5 변경 없음 (참고)

- `supabase/migrations/**` — SPEC-DB-001 산출물, 본 SPEC은 신규 마이그레이션 없음
- `src/db/schema/instructor.ts`, `review.ts`, `settlement.ts` — Drizzle 스키마 그대로 사용
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물
- `src/lib/nav.ts` — SPEC-LAYOUT-001에 이미 `/instructors` 항목 등록됨
- `src/auth/*` — SPEC-AUTH-001 산출물 그대로 사용

---

## 5. 기술 접근 (Technical Approach)

### 5.1 단일 쿼리 집계 전략

`listInstructorsForOperator`는 다음 SQL 의도로 Drizzle을 작성:
- `instructors_safe` 또는 `instructors`(컬럼 화이트리스트)에서 시작
- LEFT JOIN `instructor_skills` + `skill_categories` (top-3 결과는 array_agg + array_length 또는 분리 쿼리)
- LEFT JOIN `projects` ON `projects.instructor_id = instructors.id AND projects.status IN ('education_done', 'settlement_in_progress', 'task_done')` → `count(distinct)` for 강의 횟수, `max(end_date)` for 마지막 강의일
- LEFT JOIN `satisfaction_reviews` → `avg(score)`, `count(*)` for 만족도
- LEFT JOIN `settlements` ON `instructor_id` AND status valid → `sum(instructor_fee_krw)` for 정산 합계
- WHERE `deleted_at IS NULL` AND filter conditions
- GROUP BY `instructors.id`
- ORDER BY 정렬 컬럼 + secondary `name_kr ASC`
- LIMIT 20 OFFSET (page-1)*20

기술스택 top-3는 별도 쿼리 또는 `lateral join + array_agg(... ORDER BY ... LIMIT 3)` 패턴 (Postgres). 성능 위험 시 SPEC-DB-002로 covering index 분리.

### 5.2 AI 요약 캐시 + 폴백 흐름

```
getOrGenerateSummary(instructorId):
  1. SELECT FROM ai_satisfaction_summaries WHERE instructor_id = $1 AND generated_at > now() - interval '24 hours' LIMIT 1
     → hit이면 return { kind: 'ai', ...cached }
  2. SELECT FROM satisfaction_reviews WHERE instructor_id = $1 AND comment IS NOT NULL AND comment <> '' ORDER BY created_at DESC LIMIT 50
     → 0~2건이면 return { kind: 'empty' }
  3. buildSummaryPrompt(reviews) → Anthropic SDK messages.create({
       model: 'claude-sonnet-4-6',
       system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
       messages: [{ role: 'user', content: USER_PROMPT_WITH_REVIEWS }],
       max_tokens: 1024,
     })
     → try / catch (timeout 30s)
  4. 성공: UPSERT ai_satisfaction_summaries, return { kind: 'ai', summary, model, generatedAt }
  5. 실패: return { kind: 'fallback', avgScore: AVG(score), recentComments: top 5 with score+comment+project_title }
```

`SYSTEM_PROMPT`: 한국어 강의 만족도 분석 어시스턴트 페르소나 + 출력 포맷(강점/약점/추천 분야 markdown 헤더). 정적이므로 prompt cache hit.

### 5.3 PII 분리

- AI prompt에는 `score`, `comment`, `project.title`, `project.end_date`만 포함
- 강사 이름/이메일/전화는 prompt에 포함하지 않음 (REQ-INSTRUCTOR-AI-010)
- summary_text는 일반 식별자만 포함하여 저장 ("이 강사의 강점은..." 형태로 user_id 미참조)

### 5.4 등록 흐름의 트랜잭션성

Supabase는 PostgreSQL 트랜잭션을 직접 노출하지 않으므로:
- INSERT instructors → 성공 시 instructor_id 획득
- INSERT instructor_skills (다중) — 개별 실패 시 best-effort
- inviteUserByEmail — 실패 시 instructor 행 DELETE (compensating action)
- 운영자 화면 toast로 실패 안내, 부분 실패는 admin 점검 대상으로 logging

향후 단일 RPC function으로 옮길지 acceptance에서 결정.

### 5.5 user_id 자동 매핑

SPEC-AUTH-001 `accept-invite/set-password/actions.ts`가 `metadata.instructor_id`를 읽고 `UPDATE instructors SET user_id = auth.user.id WHERE id = $instructor_id AND user_id IS NULL` 호출. 본 SPEC은 그 책임을 SPEC-AUTH-001 v1.1로 위임하되, 임시 대안으로 `handle_new_user` trigger에서 email 매칭 fallback을 제공할 수 있음.

### 5.6 Suspense 경계

상세 페이지 RSC 트리:
```
<Page>
  <Header />
  <BasicInfoSection />          // immediate
  <HistoryTableSection />       // immediate
  <Suspense fallback={<SummarySkeleton/>}>
    <SummarySection instructorId={id} /> // await getOrGenerateSummary()
  </Suspense>
</Page>
```

Claude latency가 30s까지 가더라도 사용자는 즉시 기본 정보를 볼 수 있음.

### 5.7 의존성

- `@anthropic-ai/sdk` (latest, server only)
- `date-fns` + `date-fns-tz` (Asia/Seoul 포맷, 이미 존재 시 skip)
- (이미 있음) `drizzle-orm`, `react-hook-form`, `zod`, `@radix-ui/*` (shadcn 베이스), `lucide-react`

---

## 6. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 리스트 6개 컬럼 정상 표시
- ✅ 검색/필터/정렬/페이지네이션 동작
- ✅ Empty state 메시지 한국어
- ✅ 상세 페이지 3섹션 + Suspense + 404 동작
- ✅ AI 요약 정상 생성 + 24h 캐시 + Claude API 장애 시 폴백
- ✅ 등록 → 초대 발송 → 신규 강사 수락 → user_id 매핑 end-to-end
- ✅ 라우트 가드 (instructor 차단)
- ✅ axe DevTools critical 0 + Lighthouse ≥ 95
- ✅ AI 요약 정확도 운영자 수동 검증 3건

---

## 7. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| 단일 집계 쿼리가 100명 데이터에서 1s 초과 | UX (LCP) | 인덱스 추가(SPEC-DB-002), 또는 강사별 통계 materialized view 도입. acceptance.md 성능 게이트로 검증. |
| Claude API rate limit 또는 장애로 폴백이 빈번하게 노출 | 사용자 신뢰 | 24h 캐시로 실제 호출 빈도 최소화. 폴백 배너로 명시적 안내. 운영 단계 모니터링 add. |
| AI 요약이 부정확 / 환각 | 의사결정 오류 | acceptance에 운영자 수동 검증 3건 게이트. 요약 카드에 model + 생성일 명시. 평점 평균과 함께 표시하여 cross-check 가능. |
| 등록 후 invitation 실패 시 instructor row 잔존 | 데이터 정합성 | compensating DELETE. acceptance.md에 실패 시뮬레이션 시나리오 포함. |
| `user_id` 매핑 누락 (accept-invite 액션이 metadata 미처리) | 강사 본인 화면 진입 불가 | SPEC-AUTH-001 v1.1로 명시 위임. trigger fallback (email match) 검토. |
| RLS 정책이 GROUP BY 쿼리에서 의도 외 행 노출 | 정보 누설 | SPEC-DB-001 RLS는 instructors 테이블에 admin all + operator select를 제공하므로 안전. acceptance EC로 instructor 역할 차단 검증. |
| AI prompt에 PII 포함되는 회귀 | 개인정보 보호 위반 | `buildSummaryPrompt` 단위 테스트로 instructor 이름/이메일/전화가 prompt 출력에 포함되지 않음을 assertion. |
| skill multiselect UX (100+ 카테고리 시 느림) | UX | `cmdk` 기반 검색형 multi-select 사용 또는 카테고리 그룹화. seed 카테고리 N개 측정 후 결정. |
| 정산 합계의 status 정의가 SPEC-DB-001과 미스매치 | 잘못된 통계 | REQ-INSTRUCTOR-DATA-006 명시 + acceptance EC에 SQL 검증. SPEC-DB-001 settlement_status enum 정의 검토. |
| 진행 이력 테이블이 50+ 프로젝트일 때 페이지 길어짐 | UX | 상세 페이지의 진행 이력은 paginate 또는 collapse(최근 10건 + "더 보기"). MVP는 collapse. |
| 24h 캐시 경계에서 동시 다중 호출 발생 (cache stampede) | API 비용 | 첫 호출이 row 작성 후 후속 호출은 cached read. 가벼운 advisory lock 또는 best-effort race acceptable. |
| Anthropic SDK 업데이트로 prompt cache 인터페이스 변경 | 빌드 실패 | `@anthropic-ai/sdk` 버전 pin + acceptance에 SDK smoke test. |

---

## 8. 참고 자료 (References)

- `.moai/project/product.md`: `[F-203]` 강사 관리, 1.2 규모 (100명), 6장 AI fallback 제약
- `.moai/project/tech.md`: ADR-004 Claude API + Prompt Caching, 4장 PII 마스킹, 5장 성능 목표
- `.moai/project/structure.md`: `src/lib/`, `src/ai/` 격리 원칙
- `.moai/specs/SPEC-DB-001/`: `instructors`, `instructor_skills`, `satisfaction_reviews`, `ai_satisfaction_summaries`, `settlements` 스키마 + RLS 정책
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole`, `(operator)` route group, `inviteUserByEmail` 흐름
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: `<AppShell userRole>`, sidebar `/instructors` nav 등록, UI primitives
- (예정) `.moai/specs/SPEC-ME-001/spec.md`: 강사 본인 이력서 화면 — 본 SPEC의 "이력서 보기" 링크 대상
- (예정) `.moai/specs/SPEC-PROJECT-001/spec.md`: AI 강사 추천 엔진 — 본 SPEC의 만족도 평균 데이터 소비자
- 외부 (verified 2026-04-27):
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  - https://docs.anthropic.com/en/api/messages
  - https://supabase.com/docs/guides/auth/row-level-security
  - https://orm.drizzle.team/docs/select#aggregations-and-grouping

---

_End of SPEC-INSTRUCTOR-001 spec.md_
