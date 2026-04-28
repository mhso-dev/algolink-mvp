---
id: SPEC-PROJECT-001
version: 1.2.0
status: completed
created: 2026-04-27
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-PROJECT-001: 교육 프로젝트 관리 + AI 강사 추천 (Project Management with AI Instructor Recommendation)

## HISTORY

- **2026-04-27 (v0.1.0)**: 초기 작성. Algolink MVP의 [F-202] 담당자 영역 핵심 기능. (1) operator/admin 역할이 사용하는 `(operator)/projects` 라우트 그룹 — 리스트(검색·필터·페이지네이션), 신규 등록 폼, 상세, 수정 페이지; (2) SPEC-DB-001의 13단계 `project_status` enum을 7단계 사용자 흐름(`의뢰 → 강사매칭 → 요청 → 컨펌 → 진행 → 종료 → 정산`)으로 mapping하고 상태 전환 검증 로직; (3) AI 강사 추천 엔진 — 기술스택 매칭 + 일정 가용성(`schedule_items.unavailable` 회피) + 만족도 평균을 가중치 조합하여 Top-3 후보 산출, Claude API로 추천 사유 생성, AI 장애 시 룰 기반 폴백; (4) 1-클릭 배정 요청 — `notifications` 테이블 인앱 알림 + 콘솔 로그(이메일은 SPEC-NOTIF-001 후속); (5) 추천 채택률 KPI 측정을 위한 `ai_instructor_recommendations.adopted_instructor_id` 활용. SPEC-DB-001(완료) `projects`/`project_status_history`/`schedule_items`/`satisfaction_reviews`/`ai_instructor_recommendations`/`notifications` 테이블 재사용. SPEC-AUTH-001(완료) `requireRole(['operator', 'admin'])` 가드 활용. 정산 상세(SPEC-SETTLEMENT-001), 이메일 발송(SPEC-NOTIF-001), 강사 CRUD(SPEC-INSTRUCTOR-001), 만족도 입력 UI(SPEC-REVIEW-001)는 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **담당자(operator) 영역 [F-202] 교육 프로젝트 관리**를 구축한다. 본 SPEC의 산출물은 (a) `(operator)/projects` 라우트 그룹의 리스트/신규/상세/수정 4개 페이지, (b) 13단계 enum을 사용자가 인지하는 7단계 워크플로우로 매핑하는 변환 레이어 + 허용된 상태 전환만을 강제하는 검증기, (c) 기술스택·일정·만족도 가중치 조합으로 Top-3 강사를 산출하는 추천 엔진(`src/lib/recommendation/`)과 Claude API 기반 추천 사유 생성 + 룰 기반 폴백, (d) 추천 결과를 `ai_instructor_recommendations` 테이블에 캐시하여 KPI(추천 1순위 채택률 ≥ 60%, `.moai/project/product.md` §5)를 SQL 집계로 측정 가능하게 하는 로깅, (e) Top-3 결과 중 1건을 선택하여 1-클릭으로 강사에게 인앱 알림(SPEC-DB-001 `notifications` 테이블)을 발송하고 콘솔 로그를 남기는 배정 요청 흐름, (f) operator/admin 외 역할 차단 + 강사가 본인 배정 건만 조회하는 RLS 정합성 유지, (g) 한국어 에러 UX, (h) WCAG 2.1 AA 접근성, (i) Asia/Seoul 시간대 표시이다.

본 SPEC은 강사 CRUD 화면, 만족도 입력 UI, 정산 처리 UI, 이메일 발송 인프라, 외부 채널(카카오/문자) 연동을 빌드하지 않는다.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.1 [F-202]는 담당자가 의뢰 접수부터 정산까지 단일 화면에서 관리할 수 있어야 하며, AI가 강사 Top-3을 추천하여 1-클릭으로 배정 요청을 보낼 수 있어야 한다고 명시한다. KPI는 (i) 의뢰→배정 평균 소요 시간 30분 → 5분, (ii) 강사 추천 1순위 채택률 ≥ 60%, (iii) 월 정산 처리 시간 50% 단축이다(§5).

기술 기반은 모두 SPEC-DB-001에서 마련되었다:

- `projects` 테이블: 13단계 `project_status` enum, `client_id`/`operator_id`/`instructor_id` FK, `business_amount_krw`/`instructor_fee_krw`/`margin_krw` (GENERATED), `project_type` enum (`education` | `material_development`), `start_date`/`end_date`
- `project_status_history` 테이블 + 트리거: 상태 변경 자동 기록
- `instructor_skills` 테이블: 강사-기술 N:M with `proficiency` enum (`beginner` | `intermediate` | `advanced` | `expert`)
- `schedule_items` 테이블: `schedule_kind = 'unavailable'`로 강사가 등록한 강의 불가 일정
- `satisfaction_reviews` 테이블: 1-5 score, instructor_id별 평균 집계 가능
- `ai_instructor_recommendations` 테이블: `project_id`, `top3_jsonb`, `adopted_instructor_id` (nullable) — KPI 측정 핵심 컬럼
- `notifications` 테이블: `recipient_id`, `notification_type` enum (`assignment_overdue`, `low_satisfaction_assignment` 등 5종 사전 정의)
- RLS: operator/admin SELECT/UPDATE 허용, instructor 본인 배정 건 SELECT만, 미인증 거부 (SPEC-DB-001 REQ-DB001-RLS-OPERATOR/INSTRUCTOR/DENY)

SPEC-AUTH-001은 `(operator)/layout.tsx`에 `requireRole(['operator', 'admin'])`을 강제하는 server layout 가드와 `getCurrentUser()` 헬퍼를 이미 제공하며, SPEC-LAYOUT-001은 `<AppShell userRole>` + 운영자 사이드바 5종 메뉴(Dashboard / Projects / Instructors / Clients / Settlements)를 제공한다. 본 SPEC은 그 중 "Projects" 메뉴의 콘텐츠를 채우는 작업이다.

13단계 enum이 사용자에게는 인지 부담이라 7단계 사용자 흐름으로 매핑한다:

| 사용자 단계 | 매핑된 `project_status` enum | 의미 |
|------------|----------------------------|------|
| 의뢰 | `proposal`, `contract_confirmed` | 의뢰 접수 + 계약 확정 |
| 강사매칭 | `lecture_requested`, `instructor_sourcing` | 강사 추천 수집 + 후보 결정 중 |
| 요청 | `assignment_review` | 강사에게 배정 요청 발송, 응답 대기 |
| 컨펌 | `assignment_confirmed`, `education_confirmed`, `recruiting` | 강사 컨펌 완료, 수강생 모집 |
| 진행 | `progress_confirmed`, `in_progress` | 강의 진행 중 |
| 종료 | `education_done` | 강의 종료, 정산 전 |
| 정산 | `settlement_in_progress`, `task_done` | 정산 진행 + 완료 |

AI 강사 추천 알고리즘은 `.moai/project/product.md` §시나리오 B의 "기술스택 + 일정 가용성 + 만족도 가중치"를 구체화한다. Claude Sonnet 4.6 (`.moai/project/tech.md` §2.3)을 사용하되, prompt caching으로 system prompt를 재사용하고, AI 실패 시 점수만 반환하는 폴백 경로를 보장한다. 추천 엔진은 순수 함수(`src/lib/recommendation/`)로 분리하여 단위 테스트 가능하도록 한다.

### 1.3 범위 (Scope)

**In Scope:**

- 라우트 (`src/app/(operator)/projects/`):
  - `page.tsx` — 리스트 (검색·필터·페이지네이션)
  - `new/page.tsx` + `actions.ts` — 등록 폼 + Server Action
  - `[id]/page.tsx` — 상세 (요약 카드 + 추천 섹션 + 배정 이력 + 상태 전환 컨트롤)
  - `[id]/edit/page.tsx` + `actions.ts` — 수정 폼 (상태/금액/일정/기술스택)
  - `[id]/recommend/actions.ts` — 추천 실행 Server Action (재실행 포함)
  - `[id]/assign/actions.ts` — 1-클릭 배정 요청 Server Action
- 도메인 로직 (`src/lib/recommendation/`):
  - `score.ts` — 후보별 점수 계산 (skill match × 0.5 + availability × 0.3 + satisfaction × 0.2)
  - `availability.ts` — `schedule_items` 기반 일정 충돌 회피 검사
  - `skill-match.ts` — `instructor_skills` × 프로젝트 `required_skill_ids` 매칭 + proficiency 가중
  - `rank.ts` — Top-N 정렬 + 동점 처리
  - `pure.ts` — 순수 함수 export 모음 (단위 테스트 진입점)
- 상태 전환 도메인 (`src/lib/projects/`):
  - `status-flow.ts` — 13단계 enum ↔ 7단계 user step 매핑 + 허용된 전환 그래프
  - `validate-transition.ts` — 상태 전환 사전 검증 (예: 강사 미배정 시 `progress_confirmed` 진입 차단)
- AI 통합 (`src/ai/`):
  - `client.ts` — Anthropic Claude SDK 인스턴스 (singleton, prompt caching 활성)
  - `prompts/recommend-instructor.ts` — system prompt 상수 (cache breakpoint 마커)
  - `parsers/recommend-instructor.ts` — Claude 응답 → `RecommendationReason[]` 변환 + zod 검증
  - `fallback.ts` — Claude 실패 시 스코어만 반환하고 사유는 룰 기반 텍스트로 생성
- 검증 (`src/lib/validation/`):
  - `project.ts` — zod schema (등록·수정 폼)
  - `recommendation.ts` — zod schema (Claude 응답 파싱)
- DB 쿼리 (`src/db/queries/`):
  - `projects.ts` — 리스트/단건/필터링/카운트
  - `recommendations.ts` — `ai_instructor_recommendations` INSERT/UPDATE (`adopted_instructor_id` 갱신)
  - `assignments.ts` — `instructor_id` 컬럼 갱신 + `notifications` INSERT (트랜잭션)
- UI 컴포넌트 (`src/components/projects/`):
  - `ProjectFiltersBar.tsx` — 검색·필터 컨트롤
  - `ProjectStatusBadge.tsx` — 7단계 한국어 라벨 + 색상
  - `ProjectStatusStepper.tsx` — 7단계 진행 비주얼라이저
  - `RecommendationCard.tsx` — 강사 1명에 대한 점수·사유·배정 버튼
  - `RecommendationSkeleton.tsx` — Claude API 호출 중 로딩 스켈레톤
  - `ProjectForm.tsx` — react-hook-form 기반 등록/수정 공용 폼 (모드 prop)
  - `AssignmentHistoryList.tsx` — 과거 추천·배정 이력
- 한국어 에러 매핑 (`src/lib/projects/errors.ts`)
- 단위 테스트 (`tests/unit/recommendation/*.test.ts`) — score, availability, skill-match, rank 4종
- 통합 테스트 (`tests/integration/projects-flow.test.ts`) — 등록 → 추천 → 배정 시나리오
- 한국어 UI, Asia/Seoul 표시 (`src/lib/format/datetime.ts` 재사용 또는 신규 추가)

**Out of Scope (Exclusions — What NOT to Build):**

- **강사 CRUD UI**: 강사 등록·이력서 편집·기술스택 관리 화면은 별도 SPEC-INSTRUCTOR-001. 본 SPEC은 SPEC-DB-001 seed가 만든 강사 데이터(샘플 3명)에 의존하며, 강사 데이터를 읽기만 한다.
- **만족도 입력 UI**: `satisfaction_reviews` INSERT 폼은 별도 SPEC-REVIEW-001. 본 SPEC은 기존 만족도 평균을 SELECT하여 추천 점수에 반영만 한다.
- **정산 처리 UI**: `settlement_in_progress` / `task_done` 단계로의 전환은 가능하지만, 정산 금액 계산·입금 확인·세금계산서는 SPEC-SETTLEMENT-001. 본 SPEC은 상태 전환만 다루고, 정산 상세 페이지는 placeholder 링크로만 노출.
- **이메일/SMS/카카오 발송 인프라**: 1-클릭 배정 요청은 인앱 알림(`notifications` INSERT) + 콘솔 로그(`console.log`)만 수행. 이메일·SMS·알림톡 어댑터는 SPEC-NOTIF-001 (후속).
- **추천 알고리즘 ML 학습**: 가중치(0.5/0.3/0.2)는 하드코딩. 학습형 가중치, 클러스터링, 콜드스타트 추천은 후속 SPEC.
- **벡터 임베딩 / 시맨틱 매칭**: `instructor_skills` 정확 매칭만 사용. pgvector 도입은 후속 SPEC (SPEC-DB-001 §1.3 Out of Scope와 동기화).
- **파일 업로드 (의뢰서 PDF 첨부)**: 시나리오 B의 "PDF 첨부 → AI 파싱"은 SPEC-AI-PROJECT-PARSE-XXX (후속). 본 SPEC은 텍스트 폼만.
- **실시간 협업**: 두 operator가 동시에 같은 프로젝트를 수정할 때 충돌 감지·실시간 동기화는 미제공. Last-write-wins + `updated_at` 기반 stale 경고만.
- **알림 트리거 자동화**: `assignment_overdue`(N시간 미응답), `schedule_conflict`, `low_satisfaction_assignment` 같은 자동 알림은 SPEC-NOTIF-RULES-001 (후속). 본 SPEC은 manual 1-클릭 배정 요청 시점에만 알림 1건 INSERT.
- **외부 ICS 캘린더 동기화**: 강사 일정 외부 동기화는 후속.
- **다국어**: 한국어 단일.
- **모바일 전용 UX**: 데스크톱 우선. 반응형은 SPEC-LAYOUT-001 가이드를 따르되, 모바일 전용 컴포넌트는 빌드하지 않음.
- **프로젝트 삭제 (hard delete)**: SPEC-DB-001은 핵심 엔티티에 soft delete 권장. 본 SPEC은 `status = 'task_done'` 후 archive 표기만 (별도 archive 테이블 X). 영구 삭제 UI 미제공.
- **프로젝트 복제 / 템플릿화**: 별도 SPEC.
- **재정렬 가능한 추천 (사용자 가중치 조정)**: 운영자가 가중치를 슬라이더로 조정하는 UI는 미제공. 추천 재실행은 동일 가중치로만.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 단위 테스트: `tests/unit/recommendation/` 모든 케이스 PASS, 라인 커버리지 ≥ 85% (recommendation 모듈)
- ✅ 통합 테스트: 등록 → 추천 → 배정 → 상태 전환 시나리오 PASS
- ✅ 추천 결과 caching: 동일 프로젝트의 동일 입력에서 추천 재실행 시 새 row 생성 + 이전 row의 `superseded_at` 표시(또는 `created_at` 기준 최신 1건 사용)
- ✅ 추천 폴백: Claude API 의도적 차단(`ANTHROPIC_API_KEY=invalid`) 시에도 Top-3 결과가 룰 기반으로 반환되고 사유는 "기술스택 N건 일치, 만족도 4.5/5, 가용 일정 OK" 같은 템플릿 텍스트
- ✅ 상태 전환 검증: 강사 미배정 상태에서 `요청` → `컨펌` 시도 시 한국어 에러 `"강사를 배정해야 컨펌 단계로 이동할 수 있습니다."` 반환, DB 변경 없음
- ✅ RLS 정합: instructor 토큰으로 `/projects` 접근 시 SPEC-AUTH-001 가드가 silent redirect → `/me/dashboard`. operator/admin은 정상 진입.
- ✅ 1-클릭 배정 후: (a) `projects.instructor_id` 갱신, (b) `notifications`에 강사 대상 1건 INSERT (`type = 'assignment_overdue'`는 부적합 → 본 SPEC에서 새 enum value `assignment_request` 추가 필요 여부는 §5에서 결정), (c) 콘솔 로그 `[notif] assignment_request → instructor_id=<uuid>`, (d) `ai_instructor_recommendations.adopted_instructor_id` 채워짐
- ✅ KPI 측정 가능: `SELECT count(*) filter (where adopted_instructor_id = (top3_jsonb->0->>'id')::uuid)::float / nullif(count(*), 0) FROM ai_instructor_recommendations` 쿼리로 1순위 채택률 산출 가능
- ✅ 페이지네이션: 100건 이상 프로젝트가 있을 때 페이지당 20건, 페이지 이동 시 URL `?page=N` 반영
- ✅ 검색 필터: 상태(7단계 multi-select), 담당자(operator_id), 고객사(client_id), 기간(start_date 범위) 4종 조합 동작
- ✅ 접근성: axe DevTools `/projects`, `/projects/new`, `/projects/[id]` critical 0건, Lighthouse Accessibility ≥ 95
- ✅ 키보드 only: 모든 폼 필드 Tab 도달, 추천 카드의 "배정 요청" 버튼 Enter 활성화
- ✅ Asia/Seoul 표시: `start_date`/`end_date`가 한국 시간대로 일관 표시 (예: `2026-05-01 09:00 KST`)
- ✅ 동시 수정 보호: 두 operator가 동일 프로젝트를 수정하려 할 때 stale 데이터 감지 → 한국어 경고 표시 (낙관적 동시성: `updated_at` 비교)

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 9개 모듈로 구성된다: `LIST`, `CREATE`, `DETAIL`, `EDIT`, `STATUS`, `RECOMMEND`, `ASSIGN`, `RLS`, `A11Y`.

### 2.1 REQ-PROJECT-LIST — 리스트 / 검색 / 필터

**REQ-PROJECT-LIST-001 (Ubiquitous)**
The system **shall** provide a project list page at `/projects` (under route group `(operator)`) accessible only to roles `operator` and `admin`, rendering server-side via React Server Components.

**REQ-PROJECT-LIST-002 (Ubiquitous)**
The system **shall** display each project row with: 제목 (`title`), 고객사 (`clients.name`), 담당자 (`users.display_name` for `operator_id`), 강사 (`instructors.display_name` for `instructor_id`, nullable), 상태 (7단계 라벨 with badge color), 시작일 (`start_date`), 사업비 (`business_amount_krw`).

**REQ-PROJECT-LIST-003 (Ubiquitous)**
The system **shall** support filters via URL query parameters: `status` (multi-select 7단계), `operator_id` (single select), `client_id` (single select), `start_from` / `start_to` (ISO 8601 date), `q` (case-insensitive partial match on `projects.title`).

**REQ-PROJECT-LIST-004 (Ubiquitous)**
The system **shall** paginate results with `page` (1-based) and fixed `pageSize = 20`, exposing total count for navigation controls.

**REQ-PROJECT-LIST-005 (State-Driven)**
**While** filter parameters are present in the URL, the system **shall** preserve them across page navigation, sort changes, and form submission.

**REQ-PROJECT-LIST-006 (Event-Driven)**
**When** a user clicks a row, the system **shall** navigate to `/projects/[id]` preserving the current filter state in the back-navigation history.

**REQ-PROJECT-LIST-007 (Unwanted Behavior)**
**If** the requested `page` exceeds total pages, **then** the system **shall** redirect to the last valid page rather than rendering an empty list.

**REQ-PROJECT-LIST-008 (Optional Feature)**
**Where** the operator wants a quick view of "내 담당 프로젝트만", the system **shall** provide a toggle that adds `operator_id = currentUser.id` to the filter set.

### 2.2 REQ-PROJECT-CREATE — 프로젝트 등록

**REQ-PROJECT-CREATE-001 (Ubiquitous)**
The system **shall** provide a project creation page at `/projects/new` with a form containing: 제목 (`title`, 1-200자), 고객사 선택 (`client_id`, dropdown of existing `clients`), 프로젝트 유형 (`project_type` enum), 시작일/종료일 (`start_date`/`end_date`, datetime-local), 기술스택 다중선택 (`required_skill_ids` 1-N from `skill_categories` leaf nodes), 사업비 (`business_amount_krw`, integer ≥ 0), 강사비 (`instructor_fee_krw`, integer ≥ 0), 비고 (`notes`, optional textarea).

**REQ-PROJECT-CREATE-002 (Ubiquitous)**
The system **shall** validate the form via a zod schema in `src/lib/validation/project.ts`, returning Korean error messages for: required field missing, `end_date` ≤ `start_date`, `instructor_fee_krw` > `business_amount_krw` (warning, not blocker), `required_skill_ids.length === 0`.

**REQ-PROJECT-CREATE-003 (Event-Driven)**
**When** the form is submitted with valid data, the system **shall** insert a `projects` row with `status = 'proposal'`, `operator_id = currentUser.id`, `instructor_id = NULL`, redirect to `/projects/[id]` of the newly created project.

**REQ-PROJECT-CREATE-004 (Ubiquitous)**
The system **shall** persist `required_skill_ids` via a junction table (e.g., `project_required_skills` if created by SPEC-DB-001, otherwise via a `jsonb` column on `projects` named `required_skill_ids`); the chosen storage **shall** be documented in §5 Technical Approach.

**REQ-PROJECT-CREATE-005 (Unwanted Behavior)**
**If** the user is not authenticated as `operator` or `admin`, **then** the SPEC-AUTH-001 guard at `src/app/(operator)/layout.tsx` **shall** silently redirect to the role home (REQ-AUTH-GUARD-003).

**REQ-PROJECT-CREATE-006 (Optional Feature)**
**Where** the operator wants to clone an existing project's structure, the system **shall not** provide cloning in MVP (out of scope, deferred to a follow-up SPEC).

### 2.3 REQ-PROJECT-DETAIL — 상세 페이지

**REQ-PROJECT-DETAIL-001 (Ubiquitous)**
The system **shall** provide a project detail page at `/projects/[id]` rendering server-side, with sections: (a) 요약 헤더 (제목·고객사·담당자·상태·기간·예산), (b) 7단계 상태 stepper, (c) 기술스택 태그 리스트, (d) 강사 추천 섹션, (e) 배정 이력, (f) 상태 전환 컨트롤.

**REQ-PROJECT-DETAIL-002 (Ubiquitous)**
The system **shall** call `getCurrentUser()` (SPEC-AUTH-001) and verify the project is not soft-deleted (`deleted_at IS NULL`); when soft-deleted or not found, return Next.js `notFound()`.

**REQ-PROJECT-DETAIL-003 (State-Driven)**
**While** `projects.instructor_id` is null, the system **shall** display "강사 미배정" badge and **shall** show the AI 추천 섹션 with a "추천 실행" CTA.

**REQ-PROJECT-DETAIL-004 (State-Driven)**
**While** `projects.instructor_id` is non-null, the system **shall** display the assigned instructor's name + 만족도 평균 + 직전 추천 결과(있다면), and **shall** hide the "추천 실행" CTA but **shall** preserve the past `ai_instructor_recommendations` row in the 배정 이력 섹션.

**REQ-PROJECT-DETAIL-005 (Ubiquitous)**
The system **shall** display all timestamps (`start_date`, `end_date`, `created_at`, `updated_at`) in Asia/Seoul timezone with format `YYYY-MM-DD HH:mm KST` via `src/lib/format/datetime.ts`.

**REQ-PROJECT-DETAIL-006 (Optional Feature)**
**Where** the project has past `project_status_history` rows, the system **shall** render them as a chronological timeline below the stepper.

### 2.4 REQ-PROJECT-EDIT — 수정

**REQ-PROJECT-EDIT-001 (Ubiquitous)**
The system **shall** provide a project edit page at `/projects/[id]/edit` reusing `ProjectForm` in `mode: "edit"`, pre-filling all fields from the current row.

**REQ-PROJECT-EDIT-002 (Event-Driven)**
**When** the form is submitted, the system **shall** include `expected_updated_at` (sent as a hidden field) in the Server Action; the action **shall** compare it with `projects.updated_at` and reject the update if they differ, returning the Korean message `"다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요."`.

**REQ-PROJECT-EDIT-003 (Unwanted Behavior)**
**If** the edit attempts to change `status` directly, **then** the system **shall** route the change through the §2.5 status transition validator (REQ-PROJECT-STATUS-002), not through the generic edit action.

**REQ-PROJECT-EDIT-004 (State-Driven)**
**While** the project status is `task_done` (정산 완료), the system **shall** disable all edit controls except "되돌리기" (admin only), preventing financial data tampering after settlement.

### 2.5 REQ-PROJECT-STATUS — 상태 워크플로우 + 전환 검증

**REQ-PROJECT-STATUS-001 (Ubiquitous)**
The system **shall** define a TypeScript module `src/lib/projects/status-flow.ts` exporting: `USER_STEPS = ['의뢰', '강사매칭', '요청', '컨펌', '진행', '종료', '정산'] as const`, a mapping `userStepFromEnum(status: ProjectStatus): UserStep`, and an inverse `defaultEnumForUserStep(step: UserStep): ProjectStatus` (returns the canonical entry per step, e.g., `의뢰 → proposal`).

**REQ-PROJECT-STATUS-002 (Ubiquitous)**
The system **shall** define an allowed-transition graph as `ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]>` covering all 13 enum values; transitions outside the graph **shall** be rejected by `validateTransition(from, to, project): { ok: true } | { ok: false; reason: string }`.

**REQ-PROJECT-STATUS-003 (Unwanted Behavior)**
**If** the transition target is `assignment_confirmed` and `projects.instructor_id IS NULL`, **then** `validateTransition` **shall** return `{ ok: false, reason: "강사를 배정해야 컨펌 단계로 이동할 수 있습니다." }`.

**REQ-PROJECT-STATUS-004 (Unwanted Behavior)**
**If** the transition target is `settlement_in_progress` and `projects.status` is not `education_done`, **then** `validateTransition` **shall** return `{ ok: false, reason: "강의 종료 후에만 정산을 시작할 수 있습니다." }`.

**REQ-PROJECT-STATUS-005 (Event-Driven)**
**When** a user submits a status change via the detail page control, the system **shall** call `validateTransition`, perform the UPDATE only on `{ ok: true }`, and rely on SPEC-DB-001's `project_status_history` trigger to record the change automatically.

**REQ-PROJECT-STATUS-006 (Optional Feature)**
**Where** an admin needs to override an invalid transition (operational recovery), the system **shall** provide a `force=true` parameter callable only by admins; the override **shall** still be logged via `project_status_history` and additionally emit a `console.warn` audit line.

**REQ-PROJECT-STATUS-007 (Ubiquitous)**
The system **shall** display the 7-step user flow as a horizontal stepper component (`ProjectStatusStepper`) with the active step highlighted via `aria-current="step"`.

### 2.6 REQ-PROJECT-RECOMMEND — AI 강사 추천 엔진

**REQ-PROJECT-RECOMMEND-001 (Ubiquitous)**
The system **shall** provide a Server Action at `src/app/(operator)/projects/[id]/recommend/actions.ts` that, given a `projectId`, (1) loads the project's `required_skill_ids`, `start_date`, `end_date`; (2) fetches candidate instructors who have at least one matching `instructor_skills` row; (3) computes a score per candidate via `src/lib/recommendation/score.ts`; (4) returns Top-3 sorted by score descending with stable tiebreak on `instructor_id`.

**REQ-PROJECT-RECOMMEND-002 (Ubiquitous)**
The scoring function **shall** combine three sub-scores in [0, 1] with fixed weights:
- `skillMatch` (weight 0.5): proportion of `required_skill_ids` matched, weighted by `proficiency` (`beginner=0.4, intermediate=0.7, advanced=0.9, expert=1.0`)
- `availability` (weight 0.3): `1.0` if no `schedule_items` row with `schedule_kind IN ('system_lecture', 'unavailable')` overlaps the project's `[start_date, end_date]`; else `0.0`
- `satisfaction` (weight 0.2): mean of `satisfaction_reviews.score` for the instructor, normalized to [0, 1] via `(mean - 1) / 4`; if no reviews exist, default to `0.6` (neutral prior)

**REQ-PROJECT-RECOMMEND-003 (Event-Driven)**
**When** the recommend action is invoked, the system **shall** call Anthropic Claude API (`claude-sonnet-4-6`) with a system prompt (cached) and a user message containing the Top-3 candidate JSON to produce a Korean human-readable reason for each candidate; the result **shall** match a zod schema and be merged into the response.

**REQ-PROJECT-RECOMMEND-004 (Unwanted Behavior)**
**If** the Claude API call fails (timeout, 5xx, parse error, missing API key), **then** the system **shall** fall back to a rule-based reason template in `src/ai/fallback.ts` (`"기술스택 ${matched}/${total}건 일치, 만족도 ${mean.toFixed(1)}/5${availability ? ', 가용 일정 OK' : ', 일정 충돌 가능'}"`) and **shall not** raise an error to the user; the failure **shall** be logged via `console.warn`.

**REQ-PROJECT-RECOMMEND-005 (Ubiquitous)**
The system **shall** persist the recommendation result by INSERTING into `ai_instructor_recommendations` with: `project_id`, `top3_jsonb` (full candidate array including scores, sub-scores, reason, source = `'claude' | 'fallback'`), `model` (`claude-sonnet-4-6` or `null`), `created_at`; `adopted_instructor_id` is left null until §2.7 assignment occurs.

**REQ-PROJECT-RECOMMEND-006 (State-Driven)**
**While** a project has multiple `ai_instructor_recommendations` rows, the detail page **shall** display the most recent (`ORDER BY created_at DESC LIMIT 1`) as the "현재 추천", and earlier rows in the 배정 이력 섹션as historical records.

**REQ-PROJECT-RECOMMEND-007 (Unwanted Behavior)**
**If** there are fewer than 3 candidates with at least one matching skill, **then** the system **shall** return however many exist (0, 1, or 2) and display a Korean notice `"기술스택을 만족하는 후보가 N명입니다."`.

**REQ-PROJECT-RECOMMEND-008 (Ubiquitous)**
The recommendation engine `src/lib/recommendation/` **shall** be implemented as pure functions independent of React, Next.js, Supabase, and Claude SDK — its inputs are plain TypeScript types (`Project`, `Instructor[]`, `Schedule[]`, `Review[]`) and its output is `RecommendationResult`. Side effects (DB IO, Claude API) live in the Server Action layer.

**REQ-PROJECT-RECOMMEND-009 (Optional Feature)**
**Where** the operator clicks "추천 다시 실행" on the detail page, the system **shall** create a new `ai_instructor_recommendations` row (not update existing); the previous row remains for KPI auditing.

**REQ-PROJECT-RECOMMEND-010 (Ubiquitous)**
The system **shall** include a Korean disclaimer in the recommendation UI: `"AI 추천은 참고용이며 최종 배정은 담당자가 결정합니다."`.

### 2.7 REQ-PROJECT-ASSIGN — 1-클릭 배정 요청

**REQ-PROJECT-ASSIGN-001 (Ubiquitous)**
The system **shall** provide a Server Action at `src/app/(operator)/projects/[id]/assign/actions.ts` accepting `{ projectId, instructorId, recommendationId }`; the action **shall** wrap (a) `projects.instructor_id` UPDATE, (b) `ai_instructor_recommendations.adopted_instructor_id` UPDATE, (c) `notifications` INSERT in a single PostgreSQL transaction.

**REQ-PROJECT-ASSIGN-002 (Event-Driven)**
**When** assignment succeeds, the system **shall** also `console.log("[notif] assignment_request → instructor_id=<uuid> project_id=<uuid>")` to mark the email-stub boundary, and **shall** transition the project status from the current step to `assignment_review` if the current status is in `{lecture_requested, instructor_sourcing}`.

**REQ-PROJECT-ASSIGN-003 (Unwanted Behavior)**
**If** the chosen `instructorId` does not appear in the latest `ai_instructor_recommendations.top3_jsonb` for the project, **then** the action **shall** reject with `"추천 결과에 포함되지 않은 강사는 배정할 수 없습니다. 추천을 다시 실행하세요."`; admin override (`force=true`) **shall** bypass this check.

**REQ-PROJECT-ASSIGN-004 (Ubiquitous)**
The system **shall** introduce a new `notification_type` enum value `assignment_request` via a new migration if not already present in SPEC-DB-001's enum; the notification body **shall** include the project title, start/end dates, and a deep link to `/me/dashboard` (instructor home for confirmation flow, deferred to SPEC-INSTRUCTOR-CONFIRM-XXX).

**REQ-PROJECT-ASSIGN-005 (Unwanted Behavior)**
**If** `notifications` INSERT fails (DB error, RLS rejection), **then** the entire transaction **shall** roll back; the user **shall** see Korean error `"배정에 실패했습니다. 잠시 후 다시 시도해주세요."` and the project state **shall** be unchanged.

**REQ-PROJECT-ASSIGN-006 (Optional Feature)**
**Where** the operator wants to reassign (the project already has an `instructor_id`), the system **shall** require an explicit confirmation dialog `"기존 배정을 해제하고 새 강사에게 요청합니다. 계속하시겠습니까?"`; on confirm, the previous `notifications` row remains for audit but a new one is created.

### 2.8 REQ-PROJECT-RLS — 역할 가드 + 데이터 격리

**REQ-PROJECT-RLS-001 (Ubiquitous)**
The system **shall** rely on SPEC-AUTH-001's `(operator)/layout.tsx` guard for the primary access control to `/projects/*`; the layout **shall** call `requireRole(['operator', 'admin'])` and silent-redirect on mismatch.

**REQ-PROJECT-RLS-002 (Ubiquitous)**
The system **shall** rely on SPEC-DB-001's existing RLS policies (REQ-DB001-RLS-OPERATOR, REQ-DB001-RLS-INSTRUCTOR, REQ-DB001-RLS-DENY) without modification; queries from operator/admin sessions **shall** see all projects, while instructor sessions reaching a leaked URL **shall** receive zero rows.

**REQ-PROJECT-RLS-003 (Unwanted Behavior)**
**If** an instructor somehow reaches `/projects/[id]` (e.g., via a stale browser tab where role was downgraded), **then** the route group guard **shall** redirect first; even if the guard fails (defense in depth), RLS **shall** return zero rows and the page **shall** call `notFound()`.

**REQ-PROJECT-RLS-004 (Ubiquitous)**
The system **shall not** introduce any service-role (`SUPABASE_SERVICE_ROLE_KEY`) Supabase client in this SPEC; all DB operations **shall** use the user-scoped server client to keep RLS as the authoritative authorization layer.

### 2.9 REQ-PROJECT-A11Y — 접근성 (WCAG 2.1 AA)

**REQ-PROJECT-A11Y-001 (Ubiquitous)**
The system **shall** ensure all forms (`/projects/new`, `/projects/[id]/edit`) are fully keyboard navigable: every input, select, multi-select chip, button reachable via Tab in visual reading order, with Enter submitting the form.

**REQ-PROJECT-A11Y-002 (Ubiquitous)**
The system **shall** label every input using SPEC-LAYOUT-001's `<Label htmlFor>` and expose validation errors via `aria-invalid="true"` + `aria-describedby="<error-id>"`, with the error `<p>` having `role="alert"`.

**REQ-PROJECT-A11Y-003 (Ubiquitous)**
The status stepper component **shall** mark the active step with `aria-current="step"` and provide a hidden Korean text label (`<span class="sr-only">현재 단계: 강사매칭</span>`) for screen reader users.

**REQ-PROJECT-A11Y-004 (Ubiquitous)**
The recommendation cards **shall** be reachable via keyboard tab order, each with a clear focus ring (SPEC-LAYOUT-001 2px outline), and the "배정 요청" button **shall** announce score and reason via `aria-describedby`.

**REQ-PROJECT-A11Y-005 (Ubiquitous)**
The list table **shall** include `<caption>` with the current filter description (e.g., "교육 프로젝트 목록 - 상태: 강사매칭, 진행"), `<thead>` with `scope="col"`, and per-row link wrapping that announces the project title.

**REQ-PROJECT-A11Y-006 (Event-Driven)**
**When** Claude API is awaiting response during recommendation, the system **shall** show a skeleton with `role="status"` and `aria-live="polite"` announcing `"AI가 추천을 생성하고 있습니다..."`; on completion, the live region **shall** announce `"추천 ${count}건이 준비되었습니다."`.

**REQ-PROJECT-A11Y-007 (Ubiquitous)**
The system **shall** maintain SPEC-LAYOUT-001 contrast ratios (4.5:1 body, 3:1 large/UI) on all status badges in both light and dark mode; the 7-step badge color palette **shall** be defined as semantic tokens (e.g., `--badge-status-progress`).

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 강사 CRUD UI / 이력서 등록 | SPEC-INSTRUCTOR-001 |
| 만족도 입력 폼 | SPEC-REVIEW-001 |
| 정산 금액 계산 / 입금 확인 / 세금계산서 | SPEC-SETTLEMENT-001 |
| 이메일/SMS/카카오 발송 어댑터 | SPEC-NOTIF-001 |
| 자동 알림 트리거 (`assignment_overdue` 미응답 등) | SPEC-NOTIF-RULES-001 |
| 의뢰 PDF 첨부 → AI 파싱 | SPEC-AI-PROJECT-PARSE-XXX |
| 추천 알고리즘 ML 학습 / 가중치 운영자 조정 | (검토 후 결정) |
| 벡터 임베딩 / 시맨틱 강사-기술 매칭 | (후속, pgvector 도입 시) |
| 프로젝트 hard delete UI | (영구 삭제는 admin DB 작업으로) |
| 프로젝트 복제 / 템플릿화 | (후속) |
| 실시간 협업 (WebSocket 동기화) | (후속) |
| 외부 ICS 캘린더 동기화 | (후속) |
| 모바일 전용 UX | SPEC-LAYOUT-001 반응형 가이드만 따름 |
| 다국어 (i18n) | 한국어 단일 (product.md §3.3) |
| 강사 confirm 흐름 (강사가 배정 요청을 수락/거절) | SPEC-INSTRUCTOR-CONFIRM-XXX |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 라우트 (operator route group)

- `src/app/(operator)/projects/page.tsx` — 리스트
- `src/app/(operator)/projects/new/page.tsx`
- `src/app/(operator)/projects/new/actions.ts` — `createProject` Server Action
- `src/app/(operator)/projects/[id]/page.tsx` — 상세
- `src/app/(operator)/projects/[id]/edit/page.tsx`
- `src/app/(operator)/projects/[id]/edit/actions.ts` — `updateProject`, `transitionStatus`
- `src/app/(operator)/projects/[id]/recommend/actions.ts` — `runRecommendation`
- `src/app/(operator)/projects/[id]/assign/actions.ts` — `assignInstructor`

### 4.2 신규 도메인 모듈 (`src/lib/`)

- `src/lib/projects/status-flow.ts` — 7단계 매핑 + 전환 그래프
- `src/lib/projects/validate-transition.ts` — `validateTransition(from, to, project)`
- `src/lib/projects/errors.ts` — 한국어 에러 매핑
- `src/lib/recommendation/score.ts` — 점수 계산
- `src/lib/recommendation/skill-match.ts`
- `src/lib/recommendation/availability.ts`
- `src/lib/recommendation/rank.ts`
- `src/lib/recommendation/types.ts` — `Candidate`, `RecommendationResult` 등 도메인 타입
- `src/lib/recommendation/index.ts` — public API
- `src/lib/validation/project.ts` — zod schemas
- `src/lib/validation/recommendation.ts`

### 4.3 신규 AI 통합 (`src/ai/`)

- `src/ai/client.ts` — Anthropic SDK singleton + prompt caching enabled
- `src/ai/prompts/recommend-instructor.ts` — system prompt (cache breakpoint)
- `src/ai/parsers/recommend-instructor.ts` — Claude → `RecommendationReason[]` + zod
- `src/ai/fallback.ts` — 룰 기반 사유 템플릿

### 4.4 신규 DB 쿼리 (`src/db/queries/`)

- `src/db/queries/projects.ts` — list/getById/insert/update/transitionStatus
- `src/db/queries/recommendations.ts` — insert/getLatestForProject/markAdopted
- `src/db/queries/assignments.ts` — assign(트랜잭션) + notification INSERT
- `src/db/queries/instructors.ts` — fetchCandidatesBySkills, fetchSchedule, fetchReviewStats (read-only)

### 4.5 신규 UI 컴포넌트 (`src/components/projects/`)

- `src/components/projects/ProjectFiltersBar.tsx`
- `src/components/projects/ProjectStatusBadge.tsx`
- `src/components/projects/ProjectStatusStepper.tsx`
- `src/components/projects/ProjectForm.tsx` (mode: 'create' | 'edit')
- `src/components/projects/RecommendationCard.tsx`
- `src/components/projects/RecommendationSection.tsx` (server component, fetch + render)
- `src/components/projects/RecommendationSkeleton.tsx`
- `src/components/projects/AssignmentHistoryList.tsx`

### 4.6 신규 마이그레이션 (조건부)

- `supabase/migrations/20260427000090_project_required_skills.sql` — 필요 시 junction 테이블 추가 (§5.2 결정)
- `supabase/migrations/20260427000091_notification_type_assignment_request.sql` — `notification_type` enum에 `assignment_request` 값 추가 (`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_request';`)

### 4.7 신규 테스트

- `tests/unit/recommendation/score.test.ts`
- `tests/unit/recommendation/availability.test.ts`
- `tests/unit/recommendation/skill-match.test.ts`
- `tests/unit/recommendation/rank.test.ts`
- `tests/unit/projects/status-flow.test.ts`
- `tests/unit/projects/validate-transition.test.ts`
- `tests/integration/projects-flow.test.ts` — 등록 → 추천 → 배정 시나리오

### 4.8 변경 파일

- `package.json` — `@anthropic-ai/sdk` 의존성 추가 (이미 있을 시 skip)
- `.env.example` — `ANTHROPIC_API_KEY` 항목 추가
- `src/lib/format/datetime.ts` — `formatKstDateTime(date)` 헬퍼 (없으면 신규 추가)

### 4.9 변경 없음 (참고)

- `src/auth/**` — SPEC-AUTH-001 산출물, 그대로 사용
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물, 그대로 사용
- `src/db/schema/**` — SPEC-DB-001 산출물, schema 변경 없음 (junction 테이블 신설 시 SQL only로 추가)

---

## 5. 기술 접근 (Technical Approach)

### 5.1 13단계 ↔ 7단계 매핑

7단계는 사용자 인지용 표시 레이어, 13단계는 DB 저장 단위. 한 user step이 여러 enum에 매핑되는 경우(예: `의뢰 → {proposal, contract_confirmed}`) stepper UI는 가장 최근 enum의 자식 위치에 highlight한다. 사용자가 stepper의 다음 단계를 클릭하면 해당 user step의 "기본 enum"으로 전환을 시도(`defaultEnumForUserStep`); 세분화된 enum 전환은 detail 페이지의 하위 dropdown에서 가능(예: `의뢰` step 내 `proposal ↔ contract_confirmed`).

### 5.2 `required_skill_ids` 저장 방식 결정

두 옵션:
- **옵션 A (권장):** `project_required_skills (project_id uuid, skill_id uuid, PRIMARY KEY)` junction 테이블 신설. SPEC-DB-001은 이 테이블을 명시하지 않았으므로 본 SPEC에서 마이그레이션 추가.
- **옵션 B:** `projects.required_skill_ids jsonb` 컬럼 추가. JSON 배열로 저장. 쿼리 시 `?` 연산자 활용.

옵션 A를 채택한다. 이유: (i) FK 제약으로 deleted skill 참조 방지, (ii) 추천 엔진의 candidate 쿼리에서 일반 join이 jsonb operator보다 인덱스 활용 우수, (iii) 향후 `required_skill_proficiency` 같은 metadata 추가 여지. 대신 `instructor_skills`처럼 leaf 노드 강제 트리거 동일 적용.

### 5.3 추천 엔진 데이터 흐름

```
[Server Action: runRecommendation]
   ↓
1. fetchProject(projectId)                    -- src/db/queries/projects.ts
2. fetchCandidatesBySkills(required_skill_ids) -- src/db/queries/instructors.ts
3. fetchSchedule(candidate_ids, [start, end]) -- src/db/queries/instructors.ts
4. fetchReviewStats(candidate_ids)            -- src/db/queries/instructors.ts
   ↓
5. score(project, candidates, schedules, reviews)  -- src/lib/recommendation/score.ts (PURE)
   ↓
6. rank(scored, top: 3)                        -- src/lib/recommendation/rank.ts (PURE)
   ↓
7. claudeReason(top3) ?? fallbackReason(top3)  -- src/ai/* + src/lib/recommendation/*
   ↓
8. INSERT ai_instructor_recommendations        -- src/db/queries/recommendations.ts
   ↓
9. revalidatePath(`/projects/${id}`)           -- Next.js cache invalidation
   ↓
10. return RecommendationResult to client
```

순수 함수 5-6은 단위 테스트 100% 커버. IO 1-4·8은 통합 테스트.

### 5.4 점수 함수

```
finalScore = 0.5 * skillMatch + 0.3 * availability + 0.2 * satisfaction
```

세부:
- `skillMatch ∈ [0, 1]`: `Σ (matched_proficiency_weight) / required_skill_count`. matched 강사가 가진 skill의 `proficiency`를 weight로 변환(`expert=1.0, advanced=0.9, intermediate=0.7, beginner=0.4`). 미매칭 skill은 0 기여.
- `availability ∈ {0, 1}`: 단순 boolean. 부분 충돌은 SPEC-DB-001의 EXCLUSION constraint 정책과 일관되게 binary로 평가. 추후 SPEC에서 partial overlap 비율로 정교화 가능.
- `satisfaction ∈ [0, 1]`: `(mean - 1) / 4`. mean is over `satisfaction_reviews.score` (1..5). 리뷰 0건 → 0.6 (neutral). 리뷰 1건만 있어도 사용 (cold start prior 단순화).

### 5.5 Claude API 통합

- `@anthropic-ai/sdk` Node SDK
- 모델: `claude-sonnet-4-6`
- Prompt caching: system prompt (역할 + 응답 schema 정의)에 `cache_control: { type: 'ephemeral' }` marker, 1시간 TTL. 동일 프로젝트 추천 재실행 시 시스템 프롬프트 토큰 95% 캐시 히트.
- Output schema: zod로 검증
  ```
  z.object({
    candidates: z.array(z.object({
      instructorId: z.string().uuid(),
      reason: z.string().min(10).max(280)
    })).length(3 또는 N)
  })
  ```
- 타임아웃: 8초. 8초 초과 시 fallback.
- 429 (rate limit) 시 1회 재시도 후 fallback.

### 5.6 룰 기반 폴백

```
"기술스택 ${matched}/${total}건 일치, 만족도 ${mean.toFixed(1)}/5${availability ? ', 가용 일정 OK' : ', 일정 충돌 가능'}"
```
이때 source 필드는 `'fallback'`. UI는 "AI 사유 생성 실패 — 점수 기반 요약" 보조 라벨을 작게 표시.

### 5.7 1-클릭 배정 트랜잭션

```sql
BEGIN;
  UPDATE projects SET instructor_id = $1, status = CASE WHEN status IN ('lecture_requested','instructor_sourcing') THEN 'assignment_review' ELSE status END WHERE id = $2;
  UPDATE ai_instructor_recommendations SET adopted_instructor_id = $1 WHERE id = $3;
  INSERT INTO notifications (recipient_id, type, title, body, link_url) VALUES ($1, 'assignment_request', $4, $5, $6);
COMMIT;
```

Drizzle ORM의 `db.transaction(async (tx) => { ... })` 블록으로 구현. 한 곳이라도 실패하면 전체 롤백.

### 5.8 동시성 / Stale 보호

- 수정 폼 제출 시 hidden input `expected_updated_at` (ISO timestamp) 포함
- Server Action에서 `UPDATE ... WHERE id = $1 AND updated_at = $2` 실행
- affected rows = 0 일 때 stale 응답 반환

### 5.9 한국어 + Asia/Seoul

- `src/lib/format/datetime.ts`의 `formatKstDateTime(d: Date)` → `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })`
- 모든 status badge / step label / error message는 한국어 상수
- DB는 `timestamptz` 그대로 저장, 표시 레이어에서만 KST 변환

### 5.10 의존성

- `@anthropic-ai/sdk` (신규)
- (이미 있음) `react-hook-form`, `zod`, `drizzle-orm`, `@supabase/ssr` (SPEC-AUTH-001 산출물 재사용)
- (이미 있음) shadcn/ui primitives (SPEC-LAYOUT-001 산출물)
- 추가 마이그레이션 도구 불필요 (Supabase CLI 사용)

---

## 6. UX 흐름 요약 (UX Flow Summary)

### 6.1 신규 의뢰 등록 → AI 추천 → 배정

1. operator가 사이드바 "Projects" 클릭 → `/projects` 도달
2. 우상단 "신규 의뢰" 버튼 → `/projects/new`
3. 폼 입력 (제목·고객사·일정·기술스택·금액) → 제출 → `/projects/<id>` 상세 페이지
4. 상세 페이지 "강사 추천 실행" CTA 클릭 → 스켈레톤 표시 (`role="status"`)
5. ~3초 후 Top-3 카드 표시 (점수·사유·매칭 skill 태그)
6. 1순위 카드의 "배정 요청" 버튼 클릭 → 확인 다이얼로그 → 확정
7. 페이지 새로고침 → 상태 `요청` 단계 → "강사 미배정" 라벨 사라지고 강사 이름 + 만족도 표시
8. 강사 컨펌 이후(SPEC-INSTRUCTOR-CONFIRM-XXX) operator가 detail 페이지 stepper에서 "컨펌"으로 수동 전환

### 6.2 리스트 검색

1. operator가 `/projects` 진입 → 기본 페이지 (페이지 1, 모든 상태)
2. 상단 필터 바에서 상태 multi-select "진행" + 담당자 "본인" 선택
3. URL이 `/projects?status=in_progress&operator_id=<self>&page=1`로 갱신
4. 결과 테이블 갱신 (RSC re-render)

### 6.3 상태 전환 (강사 미배정 시 거부)

1. operator가 강사 미배정 상태에서 stepper "컨펌" 클릭
2. Server Action `transitionStatus({ to: 'assignment_confirmed' })` 호출
3. `validateTransition` → `{ ok: false, reason: "강사를 배정해야 컨펌 단계로 이동할 수 있습니다." }`
4. UI에 toast 표시 (`<Alert role="alert">`)
5. DB 변경 없음

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 등록 → 자동 redirect → 상세 페이지 도달
- ✅ AI 추천 실행 → Top-3 카드 표시 (Claude 또는 fallback)
- ✅ Claude API 차단 환경에서도 Top-3 + 룰 기반 사유 반환
- ✅ 강사 미배정 상태에서 `컨펌` 전환 시도 → 한국어 거부 메시지
- ✅ 1-클릭 배정 → `notifications` 1건 INSERT + `adopted_instructor_id` 갱신 + 콘솔 로그
- ✅ 리스트 필터 + 페이지네이션 동작
- ✅ instructor 토큰으로 `/projects` 접근 → silent redirect (SPEC-AUTH-001 가드)
- ✅ 동시 수정 충돌 → stale 메시지 표시 + DB 변경 없음
- ✅ axe DevTools 3 페이지 critical 0
- ✅ Lighthouse Accessibility ≥ 95
- ✅ 단위 테스트 ≥ 85% line coverage (recommendation 모듈)
- ✅ KPI 쿼리 동작: `adopted_instructor_id` 기반 1순위 채택률 산출 가능

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Claude API 비용 증가 (추천 재실행 남용) | 운영 비용 | (i) prompt caching 활성으로 system 토큰 95% 절감, (ii) "추천 다시 실행" 버튼에 confirmation, (iii) `ai_instructor_recommendations` row를 1시간 내 동일 input 시 재사용하는 옵션 검토(후속) |
| Claude 응답 schema 위반 (zod 실패) | 추천 미표시 | zod 실패 시 fallback 경로로 자동 전환. `console.warn`으로 모델 버전 + 응답 일부 로깅하여 추후 prompt 보정 |
| 강사 가용성 binary 평가 | 일정 부분 충돌 강사를 0점 처리 | MVP는 binary로 단순화. partial overlap 비율 계산은 후속 SPEC. UI에 "일정 일부 겹침" 경고 표시 옵션은 fallback reason에 포함 |
| 만족도 0 리뷰 강사 cold start | 신규 강사가 추천에서 누락 | 0건 강사에 0.6 prior 부여 → satisfaction 점수 0.6 보장 → 기술/일정 매칭 우수 시 Top-3 진입 가능 |
| 13단계 enum 중 누락된 user step 매핑 | UI 표시 오류 | `userStepFromEnum` 모든 13개 enum value 커버 + exhaustiveness check (TypeScript `never` switch) + 단위 테스트 필수 |
| `required_skill_ids` junction 테이블 추가 마이그레이션과 SPEC-DB-001 충돌 | DB 무결성 | 본 SPEC 마이그레이션은 SPEC-DB-001 timestamp 이후로 prefix(`20260427000090+`); SPEC-DB-001은 변경 없음 |
| `notification_type` enum에 `assignment_request` 추가 마이그레이션 | 운영 중 enum 추가 | `ALTER TYPE ... ADD VALUE IF NOT EXISTS`로 무중단 추가. ordering 미보장 (SPEC-DB-001 §6 위험 항목과 일관) |
| 동시성 보호 없이 두 operator가 동일 프로젝트 수정 | 데이터 손실 | `expected_updated_at` 비교로 Last-write 거부. 한국어 stale 메시지로 새로고침 안내 |
| operator가 AI 추천 결과를 거치지 않고 SQL UPDATE로 직접 강사 배정 | KPI(채택률) 왜곡 | `adopted_instructor_id`가 NULL인 경우 1순위 채택 미카운트로 처리. Admin UI 별도(SPEC-ADMIN-001)에서만 force 가능. 또한 DB 트리거로 `instructor_id` 변경 시 가장 최근 추천의 `adopted_instructor_id`를 자동 채우는 옵션 검토(후속) |
| `schedule_items.unavailable`이 강사 캘린더 SPEC-ME-001 미구현 상태 | 가용성 평가 미완 | SPEC-DB-001 schedule_items 테이블은 존재. seed 데이터 또는 admin이 직접 INSERT한 row를 인식. SPEC-ME-001 완료 전에는 `system_lecture` 충돌만 효과적으로 검사됨 (acceptable degradation). |
| 추천 엔진 결과가 RLS 통과 못 하는 강사 (instructor 본인이 logout) | 추천 비표시 | candidate 쿼리는 server-side service-role 미사용. operator/admin 토큰의 RLS는 `instructors` SELECT 전체 허용이므로 영향 없음 |
| `project_status_history` 트리거가 `force=true` admin 우회 시에도 정확히 기록 | 감사 무결성 | SPEC-DB-001 트리거는 컬럼 변경에만 반응하므로 우회 여부와 무관하게 항상 기록. `force` 메타데이터는 별도 `console.warn`으로만 노출 |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: F-202 교육 프로젝트 관리, §시나리오 B, §5 KPI (1순위 채택률 ≥ 60%)
- `.moai/project/structure.md`: `src/lib/recommendation/`, `src/ai/`, `(operator)/projects/` 디렉토리 설계
- `.moai/project/tech.md`: ADR Claude Sonnet 4.6, prompt caching, fallback 정책
- `.moai/specs/SPEC-DB-001/spec.md`: `projects` 13단계 enum, RLS 정책, `ai_instructor_recommendations`, `notifications`, `schedule_items`, `satisfaction_reviews`
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole(['operator', 'admin'])`, `getCurrentUser()`, silent redirect
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: `<AppShell userRole>`, sidebar Projects 메뉴, UI 프리미티브
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 (정상/폴백/거부)
- [`plan.md`](./plan.md): 마일스톤 분해 + RED-GREEN-REFACTOR 사이클
- 외부 (verified 2026-04-27):
  - https://docs.anthropic.com/claude/docs/prompt-caching
  - https://orm.drizzle.team/docs/transactions
  - https://www.w3.org/WAI/WCAG21/quickref/

---

---

## Implementation Notes

> 2026-04-28 backfill — main 브랜치에 머지 완료된 구현 기록. 리스트 검색/필터/페이지네이션 + Edit 풀폼 완료. 일부 항목 deferred.

### 머지된 커밋

| 해시 | 메시지 |
|------|--------|
| `59643de` | merge: SPEC-PROJECT-001 — 프로젝트 관리 + AI 강사 추천 (M1-M7) |
| `72b0f64` | feat(project): SPEC-PROJECT-001 M1+M2 — 마이그레이션 + 도메인 순수 함수 + 단위 테스트 |
| `c352ffa` | feat(project): SPEC-PROJECT-001 M3-M7 — Server Actions + 라우트 + 추천/배정/상태전환 UI |
| `17d4b5f` | feat(projects): SPEC-PROJECT-001 §2.1 — 리스트 검색·필터·페이지네이션 |
| `65290f7` | feat(projects): SPEC-PROJECT-001 §2.4/§2.3 — Edit 풀폼 + 동시성 + 배정 이력 |
| `79b20ec` | merge: SPEC-PROJECT-001 잔여 — 리스트 필터/페이지네이션 + Edit 풀폼 + 배정 이력 |

### 구현 완료된 마일스톤

- **M1**: DB 마이그레이션 — `project_required_skills` junction 테이블, `notification_type` enum `assignment_request` 추가
- **M2**: 도메인 순수 함수 + 단위 테스트
  - `src/lib/projects/status-machine.ts` (7단계 매핑 + 전환 그래프, `@MX:ANCHOR`)
  - `src/lib/recommend/score.ts`, `engine.ts`, `types.ts` (추천 엔진)
  - `src/lib/projects/errors.ts` (한국어 에러 상수)
- **M3**: Server Actions — `createProject`, `runRecommendation`, `assignInstructor`, `transitionStatus`
- **M4**: 리스트 페이지 (`/projects`) — 검색·필터·페이지네이션 (`src/lib/projects/list-query.ts`)
- **M5**: 신규 등록 폼 (`/projects/new`) + zod validation
- **M6**: 상세 페이지 (`/projects/[id]`) — 추천 섹션, 배정 이력, 상태 stepper
- **M7**: Edit 풀폼 (`/projects/[id]/edit`) + 낙관적 동시성 (`expected_updated_at`)

### Deferred Items

| 항목 | 이유 | 후속 경로 |
|------|------|----------|
| **검색 `q` 파라미터 ILIKE 구현** | 리스트 페이지 URL 파라미터 파싱 완료, DB 쿼리 ILIKE 부분 stub | 다음 SPEC 재개 시 완성 |
| **Playwright E2E 시나리오** | 빌드 우선, E2E 환경 미구성 | SPEC-E2E-001 또는 별도 작업 |
| **통합 테스트 (`projects-flow.test.ts`)** | SPEC §4.7 명시, 단위 테스트만 완성 | 후속 coverage SPEC |

### Unplanned Additions

| 항목 | 내용 |
|------|------|
| `src/lib/projects/list-queries.ts` (복수) | `list-query.ts`와 별도로 Supabase select chain 헬퍼 분리 |
| `src/components/projects/project-edit-form.tsx` | edit 전용 폼 컴포넌트 (SPEC은 mode prop 단일 `ProjectForm` 명시) |
| `src/components/projects/project-create-form.tsx` | create 전용 폼 컴포넌트 |
| `next-param.test.ts` 회귀 수정 | PR #9 사전 존재 회귀를 SPEC-PROJECT-001 브랜치에서 수정 포함 |

### 잔여 구현 항목

_(이전 backfill 시점의 잔여 항목 중 통합 테스트와 KPI 모듈이 2026-04-28 구현 완료됨.)_

| 항목 | 상태 | 비고 |
|------|------|------|
| 리스트 `q` 검색 ILIKE 쿼리 완전 구현 | ⏳ deferred | stub 상태 유지 |
| Playwright E2E golden path | ⏳ deferred | SPEC-E2E-001로 위임 |

---

## Implementation Notes (Backfill 2 — 2026-04-28)

### 신규 커밋 2건 (backfill 534fba3 이후)

| 커밋 | 요약 |
|------|------|
| `9ad42c3` | test(project): SPEC-PROJECT-001 — KPI module + integration scenarios 1~7 |
| `9affe74` | feat(project): SPEC-PROJECT-001 — KPI rank 로깅 + index export + test:unit 등록 |

### KPI 모듈 (9ad42c3)

구현 파일:
- `src/lib/recommend/kpi.ts` — 1순위 채택률 KPI 계산 순수 함수
  - `calculateAdoptionRate(recommendations)` — `adopted_instructor_id === top3[0].id` 비율 산출
  - `SPEC §1.4 성공 지표` SQL 집계 쿼리와 동일 결과 보장
- `src/lib/recommend/__tests__/kpi.test.ts` — 179 lines, 12종 단위 테스트
  - EC-01~EC-12: 정상 케이스 (60% 임계, 0건, 1건, 전체 채택 등)
  - EC-13: 75% 케이스 (0.75 소수점 정밀도 검증)

통합 테스트 (`src/app/(app)/(operator)/projects/__tests__/integration.test.ts` — 335 lines):
- 시나리오 1: 프로젝트 등록 → 추천 실행 → Top-3 결과 검증
- 시나리오 2: 추천 폴백 (API key invalid) → 룰 기반 사유 반환
- 시나리오 3: 1-클릭 배정 → DB 트랜잭션 (projects.instructor_id + notifications + adopted_instructor_id)
- 시나리오 4: 상태 전환 검증 — 강사 미배정 시 컨펌 차단
- 시나리오 5: 리스트 필터링 — status + operator_id + 기간 복합 쿼리
- 시나리오 6: 페이지네이션 — 100건 이상 시 pageSize=20, URL page 파라미터
- 시나리오 7: KPI 집계 — 1순위 채택률 0.6 이상 검증

### KPI rank 로깅 (9affe74)

변경 파일:
- `src/lib/recommend/index.ts` — kpi 모듈 public re-export (`export * from './kpi'`)
- `package.json` — `test:unit` 스크립트에 `operator/projects` 통합 테스트 경로 등록
- `src/app/(app)/(operator)/projects/[id]/actions.ts` — `assignInstructor` Server Action에 채택 rank 산출 + console.log에 `rank=N` 포함
  - `top3_jsonb` 배열에서 `adopted_instructor_id` 위치를 indexOf로 산출 (0-based → 1-based)
  - 로그 형식: `[notif] assignment_request → instructor_id=<uuid> project_id=<uuid> rank=<1|2|3|null>`
  - rank=null 은 추천 외 강사 강제 배정(admin force) 케이스

### 통합 검증 결과 (2026-04-28 최종)

- `pnpm typecheck`: PASS (0 type errors)
- `pnpm lint`: PASS (0 critical)
- `pnpm test:unit`: PASS (332 tests — KPI 12종 + integration 7종 포함)
- `pnpm build`: PASS (0 errors)

### 완료 상태 요약

| 마일스톤 | 상태 | 비고 |
|---------|------|------|
| M1 도메인 + 마이그레이션 | ✅ 완료 | |
| M2 순수 함수 + 단위 테스트 | ✅ 완료 | |
| M3 Server Actions + 라우트 | ✅ 완료 | |
| M4 추천/배정/상태전환 UI | ✅ 완료 | |
| M5 리스트 필터/페이지네이션 | ✅ 완료 | q ILIKE stub 상태 |
| M6 Edit 풀폼 + 동시성 | ✅ 완료 | |
| M7 배정 이력 + RLS 검증 | ✅ 완료 | |
| M10 KPI 모듈 + integration test | ✅ 완료 | 2026-04-28 |
| E2E Playwright | ⏳ deferred | SPEC-E2E-001 |

_End of SPEC-PROJECT-001 spec.md_
