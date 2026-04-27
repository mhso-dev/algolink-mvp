# SPEC-PROJECT-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 본 SPEC은 `quality.development_mode: tdd`에 따라 manager-tdd 에이전트가 RED-GREEN-REFACTOR 사이클로 진행한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 (`status: completed`) — `projects`, `project_status_history`, `instructor_skills`, `schedule_items`, `satisfaction_reviews`, `ai_instructor_recommendations`, `notifications`, `users`, `clients`, `instructors`, `skill_categories` 테이블 + RLS + 트리거 모두 적용됨
- ✅ SPEC-AUTH-001 완료 (`status: completed`) — `(operator)/layout.tsx`에서 `requireRole(['operator', 'admin'])` 가드 동작, `getCurrentUser()` 헬퍼 사용 가능, JWT custom claim에 `role` 주입됨
- ✅ SPEC-LAYOUT-001 완료 (`status: implemented`) — `<AppShell userRole>` 컴포넌트, 운영자 사이드바 5종 메뉴 (Projects 포함), UI 프리미티브 11종, 디자인 토큰
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩
- ✅ `.env.local`에 `ANTHROPIC_API_KEY` 환경변수 (없으면 M1에서 추가)

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (deps + migrations + types) → 모든 후속 마일스톤의 선행
- M2 (도메인 순수 함수: status-flow + recommendation) → M3·M4·M5의 선행
- M3 (DB 쿼리 레이어) → M4·M5·M7의 선행
- M4 (Server Actions) → M5 (UI 컴포넌트)·M7 (페이지 와이어링)의 선행
- M5 (UI 컴포넌트) → M7 (페이지)의 선행
- M6 (AI 통합 + fallback) → M4 recommendation action의 일부, 병렬 가능
- M7 (페이지 와이어링) → M8 (E2E 통합 테스트)의 선행
- M8 (통합 테스트 + 시나리오 1-7) → M9 (a11y + Lighthouse)의 선행

### 1.3 후속 SPEC을 위한 산출물 약속

- `validateTransition(from, to, project)`은 SPEC-INSTRUCTOR-CONFIRM-XXX이 강사 컨펌 흐름에서 재사용
- `runRecommendation` Server Action 인터페이스는 SPEC-AI-* 후속 SPEC이 동일 시그니처 채택
- `ai_instructor_recommendations.adopted_instructor_id` 갱신 패턴은 SPEC-AI-RECOMMEND-EVAL-XXX의 KPI 분석 대시보드가 의존
- `assignment_request` notification type은 SPEC-NOTIF-001이 이메일 어댑터 첫 핸들러로 채택
- `src/lib/recommendation/` 순수 함수는 SPEC-AI-RECOMMEND-V2 (가중치 학습) 베이스라인

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 의존성 + 마이그레이션 + 타입 [Priority: High]

**산출물:**
- `package.json` 의존성 추가:
  - `@anthropic-ai/sdk` (latest, peer of node 20+)
- `.env.example` 업데이트:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ANTHROPIC_MODEL_RECOMMEND=claude-sonnet-4-6
  ```
- 신규 마이그레이션:
  - `supabase/migrations/20260427000090_project_required_skills.sql`:
    - `CREATE TABLE public.project_required_skills (project_id uuid REFERENCES projects(id) ON DELETE CASCADE, skill_id uuid REFERENCES skill_categories(id), PRIMARY KEY (project_id, skill_id))`
    - leaf-only CHECK 트리거 (skill_categories tier가 leaf일 때만 INSERT 허용)
    - RLS 활성화 + operator/admin SELECT/INSERT/UPDATE/DELETE 정책
  - `supabase/migrations/20260427000091_notification_type_assignment_request.sql`:
    - `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'assignment_request';`
- TypeScript 타입 정의:
  - `src/lib/recommendation/types.ts`:
    ```ts
    export type CandidateScore = {
      instructorId: string;
      skillMatch: number;       // [0, 1]
      availability: 0 | 1;
      satisfaction: number;     // [0, 1]
      finalScore: number;
    };
    export type RecommendationCandidate = CandidateScore & {
      reason: string;
      source: 'claude' | 'fallback';
      matchedSkillIds: string[];
    };
    export type RecommendationResult = {
      projectId: string;
      candidates: RecommendationCandidate[];  // 0..3
      model: string | null;
      createdAt: string;
    };
    ```
  - `src/lib/projects/types.ts`:
    ```ts
    export const USER_STEPS = ['의뢰', '강사매칭', '요청', '컨펌', '진행', '종료', '정산'] as const;
    export type UserStep = typeof USER_STEPS[number];
    ```

**검증:**
- `pnpm install` 무오류
- `pnpm tsc --noEmit` 0 type 에러
- `supabase db reset` 무오류, 마이그레이션 적용됨
- `psql -c "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'notification_type'::regtype"` → `assignment_request` 포함

**연관 EARS:** REQ-PROJECT-CREATE-004 (junction 테이블), REQ-PROJECT-ASSIGN-004 (enum value)

---

### M2 — 도메인 순수 함수 (RED → GREEN) [Priority: High]

**TDD 사이클: RED — 실패하는 테스트 먼저 작성**

**산출물 (테스트 먼저):**
- `tests/unit/projects/status-flow.test.ts`:
  - `userStepFromEnum(status)` 모든 13개 enum value 매핑 검증 (exhaustive)
  - `defaultEnumForUserStep('의뢰')` → `'proposal'`
- `tests/unit/projects/validate-transition.test.ts`:
  - `validateTransition('proposal', 'assignment_confirmed', { instructor_id: null })` → `{ ok: false, reason: "강사를 배정해야..." }`
  - `validateTransition('education_done', 'settlement_in_progress', ...)` → `{ ok: true }`
  - `validateTransition('proposal', 'in_progress', ...)` → `{ ok: false }` (graph 누락)
- `tests/unit/recommendation/skill-match.test.ts`:
  - 강사가 required 2개 모두 보유 (expert + advanced) → skillMatch ≈ 0.95
  - 강사가 1개만 보유 (beginner) → skillMatch = 0.4 / 2 = 0.2
  - 강사가 0개 보유 → skillMatch = 0
- `tests/unit/recommendation/availability.test.ts`:
  - schedule_items 미존재 → 1
  - `unavailable` 일정 + 프로젝트 기간 오버랩 → 0
  - `system_lecture` + 프로젝트 기간 오버랩 → 0
  - `personal` 일정 오버랩 → 1 (개인 일정은 강의 가능)
- `tests/unit/recommendation/score.test.ts`:
  - `finalScore = 0.5*skillMatch + 0.3*availability + 0.2*satisfaction` 정확 계산
  - satisfaction 리뷰 0건 → 0.6 prior 사용
- `tests/unit/recommendation/rank.test.ts`:
  - 4명 후보 → Top-3 반환
  - 동점 시 instructorId 사전순 stable sort
  - 후보 2명만 있을 때 → Top-2 반환

**TDD 사이클: GREEN — 테스트 통과시키는 최소 구현**

**산출물 (구현):**
- `src/lib/projects/status-flow.ts` — `USER_STEPS`, `userStepFromEnum`, `defaultEnumForUserStep`, `ALLOWED_TRANSITIONS` graph
- `src/lib/projects/validate-transition.ts` — `validateTransition(from, to, project): { ok, reason? }`
- `src/lib/recommendation/skill-match.ts` — `computeSkillMatch(required, instructorSkills): { score, matchedIds }`
- `src/lib/recommendation/availability.ts` — `computeAvailability(scheduleItems, projectRange): 0 | 1`
- `src/lib/recommendation/score.ts` — `computeScore(skillMatch, availability, satisfaction): finalScore`
- `src/lib/recommendation/rank.ts` — `rankTopN(candidates, n): RecommendationCandidate[]`
- `src/lib/recommendation/index.ts` — barrel export

**TDD 사이클: REFACTOR — 중복 제거, 가독성 개선**

- `src/lib/recommendation/constants.ts` — `WEIGHTS = { skill: 0.5, availability: 0.3, satisfaction: 0.2 }`, `PROFICIENCY_WEIGHT = { beginner: 0.4, intermediate: 0.7, advanced: 0.9, expert: 1.0 }`
- TypeScript exhaustiveness check (switch with `never` default) for enum 매핑

**검증:**
- `pnpm vitest run tests/unit/projects tests/unit/recommendation` — 모든 테스트 PASS
- `pnpm vitest --coverage` — recommendation + projects 모듈 라인 커버리지 ≥ 85%
- 모든 함수가 React/Next/Supabase/Anthropic SDK import 0건 (순수성 검증)

**연관 EARS:** REQ-PROJECT-STATUS-001~004, REQ-PROJECT-RECOMMEND-002, -008

---

### M3 — DB 쿼리 레이어 (Drizzle) [Priority: High]

**산출물:**
- `src/db/queries/projects.ts`:
  - `listProjects(filters, page): { items, total }`
  - `getProjectById(id): Project | null`
  - `insertProject(input): Project`
  - `updateProject(id, input, expectedUpdatedAt): { ok, project? }`
  - `transitionProjectStatus(id, to, force?): { ok, reason? }`
- `src/db/queries/instructors.ts`:
  - `fetchCandidatesBySkills(requiredSkillIds): Instructor[]` (적어도 1개 매칭)
  - `fetchSchedule(instructorIds, [start, end]): ScheduleItem[]`
  - `fetchReviewStats(instructorIds): Record<id, { mean, count }>`
- `src/db/queries/recommendations.ts`:
  - `insertRecommendation(projectId, top3, model): { id }`
  - `getLatestRecommendation(projectId): Row | null`
  - `markAdopted(recommendationId, instructorId): void`
- `src/db/queries/assignments.ts`:
  - `assignInstructor({ projectId, instructorId, recommendationId }): Promise<{ ok, error? }>` — 트랜잭션 (drizzle `db.transaction`)

**TDD 사이클:**
- RED: integration test `tests/integration/db/projects-queries.test.ts`에서 RLS 동작 검증 (operator role에서 SELECT 성공, instructor role에서 다른 강사 row 0 rows)
- GREEN: 쿼리 함수 구현
- REFACTOR: drizzle relational query syntax 통일, 인덱스 활용 검증

**검증:**
- `pnpm vitest run tests/integration/db` PASS
- 트랜잭션 롤백 시뮬레이션: `notifications` INSERT 강제 실패 시 `projects.instructor_id` 변경 없음 검증

**연관 EARS:** REQ-PROJECT-LIST-001~004, REQ-PROJECT-CREATE-003, REQ-PROJECT-EDIT-002, REQ-PROJECT-RLS-002, -004, REQ-PROJECT-ASSIGN-001

---

### M4 — Server Actions [Priority: High]

**산출물:**
- `src/app/(operator)/projects/new/actions.ts`:
  - `createProject(formData): { ok, projectId? } | { ok: false, errors }`
  - zod 검증 → DB INSERT → revalidatePath → redirect
- `src/app/(operator)/projects/[id]/edit/actions.ts`:
  - `updateProject({ id, input, expectedUpdatedAt }): { ok, error? }`
  - `transitionStatus({ id, to, force? }): { ok, reason? }` — calls `validateTransition` then DB UPDATE
- `src/app/(operator)/projects/[id]/recommend/actions.ts`:
  - `runRecommendation(projectId): RecommendationResult`
  - 단계: fetchProject → fetchCandidates → score+rank → claudeReason ?? fallback → insertRecommendation → revalidatePath
- `src/app/(operator)/projects/[id]/assign/actions.ts`:
  - `assignInstructor({ projectId, instructorId, recommendationId, force? }): { ok, error? }`
  - 추천 결과 검증 (force가 아닌 한 Top-3에 포함 필수) → 트랜잭션 호출 → console.log → revalidatePath

**TDD 사이클:**
- RED: integration test `tests/integration/projects-flow.test.ts`에서 시나리오 1, 4, 5 부분 검증
- GREEN: 액션 구현
- REFACTOR: 에러 핸들링 통일, 한국어 메시지 `src/lib/projects/errors.ts`로 추출

**검증:**
- 단위/통합 테스트 PASS
- `console.log("[notif] assignment_request → ...")` 출력 확인
- DB row 갱신 확인

**연관 EARS:** REQ-PROJECT-CREATE-002~005, REQ-PROJECT-EDIT-002~004, REQ-PROJECT-STATUS-005, -006, REQ-PROJECT-RECOMMEND-001~009, REQ-PROJECT-ASSIGN-001~006

---

### M5 — UI 컴포넌트 (shadcn/ui + RHF) [Priority: High]

**산출물:**
- `src/components/projects/ProjectFiltersBar.tsx` — 검색·필터 컨트롤 (status multi-select, operator/client dropdown, date range, search input)
- `src/components/projects/ProjectStatusBadge.tsx` — `userStepFromEnum` 결과를 한국어 라벨 + semantic color
- `src/components/projects/ProjectStatusStepper.tsx` — 7단계 horizontal stepper, `aria-current="step"` for active
- `src/components/projects/ProjectForm.tsx` — react-hook-form + zod, mode prop (`'create' | 'edit'`), `expected_updated_at` hidden field for edit mode
- `src/components/projects/RecommendationCard.tsx` — 강사 1명 카드 (점수 progress bar, 사유 텍스트, 매칭 skill chips, "배정 요청" 버튼)
- `src/components/projects/RecommendationSection.tsx` (server component) — fetch latest recommendation + render cards or "추천 실행" CTA
- `src/components/projects/RecommendationSkeleton.tsx` — `role="status"` aria-live skeleton
- `src/components/projects/AssignmentHistoryList.tsx` — 과거 추천·배정 이력 리스트

**TDD 사이클:**
- 컴포넌트 단위 테스트는 react-testing-library 또는 Storybook visual test 옵션. 본 SPEC은 visual snapshot 대신 통합 시나리오에서 DOM 검증
- Storybook stories 추가 (옵션, SPEC-LAYOUT-001 패턴 따름)

**검증:**
- Storybook 또는 dev 환경에서 모든 컴포넌트가 키보드만으로 조작 가능
- `<Label htmlFor>` 연결, `aria-invalid`, `aria-describedby` 적용

**연관 EARS:** REQ-PROJECT-LIST-002, REQ-PROJECT-DETAIL-001~006, REQ-PROJECT-A11Y-001~007

---

### M6 — Claude API 통합 + 폴백 [Priority: High] [병렬 가능]

**산출물:**
- `src/ai/client.ts` — `getAnthropicClient()` singleton, prompt caching enabled config
- `src/ai/prompts/recommend-instructor.ts` — system prompt 상수:
  ```
  당신은 교육 컨설팅 회사 알고링크의 강사 매칭 전문가입니다.
  주어진 프로젝트와 Top-3 강사 후보(점수 포함)에 대해, 각 강사가 왜 적합한지 한국어로 1-2문장으로 설명하세요.
  ...응답 schema: { candidates: [{ instructorId, reason }] }...
  ```
  - `cache_control: { type: 'ephemeral' }` marker
- `src/ai/parsers/recommend-instructor.ts` — Claude 응답 → `Map<instructorId, reason>` + zod 검증
- `src/ai/fallback.ts`:
  ```ts
  export function fallbackReason(c: CandidateScore, matchedCount: number, totalRequired: number, mean: number): string {
    const availability = c.availability === 1 ? ', 가용 일정 OK' : ', 일정 충돌 가능';
    return `기술스택 ${matchedCount}/${totalRequired}건 일치, 만족도 ${mean.toFixed(1)}/5${availability}`;
  }
  ```

**TDD 사이클:**
- RED: `tests/unit/ai/parsers.test.ts` — 잘못된 schema 응답 → throw, 정상 응답 → parsed
- RED: `tests/unit/ai/fallback.test.ts` — 정확한 한국어 템플릿 출력
- GREEN: 구현
- REFACTOR: 타임아웃 (8초), 1회 retry 로직 + Promise.race

**검증:**
- 정상 키 + 정상 응답: source='claude' 반환
- 무효 키: source='fallback' 반환, console.warn 1건
- zod 실패: source='fallback'로 강등

**연관 EARS:** REQ-PROJECT-RECOMMEND-003, -004

---

### M7 — 페이지 와이어링 [Priority: High]

**산출물:**
- `src/app/(operator)/projects/page.tsx` — RSC로 listProjects 호출 + `<ProjectFiltersBar>` + `<ProjectsTable>` + 페이지네이션
- `src/app/(operator)/projects/new/page.tsx` — `<ProjectForm mode="create" action={createProject} />`
- `src/app/(operator)/projects/[id]/page.tsx` — RSC, getProjectById + ProjectStatusStepper + RecommendationSection + AssignmentHistoryList + 상태 전환 컨트롤
- `src/app/(operator)/projects/[id]/edit/page.tsx` — `<ProjectForm mode="edit" defaultValues={...} action={updateProject} />`

**검증:**
- 모든 페이지가 `(operator)/layout.tsx` 가드 통과 (operator/admin만)
- `notFound()` 동작 (id 없음 또는 soft-deleted)

**연관 EARS:** REQ-PROJECT-LIST-001, REQ-PROJECT-CREATE-001, REQ-PROJECT-DETAIL-001~002, REQ-PROJECT-EDIT-001, REQ-PROJECT-RLS-001

---

### M8 — 통합 테스트 + 시나리오 1-7 [Priority: High]

**산출물:**
- `tests/integration/projects-flow.test.ts`:
  - 시나리오 1 (등록 → 상세) 검증
  - 시나리오 2 (정상 추천) 검증 — Anthropic SDK 모킹으로 정상 응답 시뮬레이션
  - 시나리오 3 (폴백) 검증 — Anthropic SDK throw 시뮬레이션
  - 시나리오 4 (1-클릭 배정) 검증 — DB row 갱신 + console.log spy
  - 시나리오 5 (전환 거부) 검증
  - 시나리오 6 (필터·페이지네이션) 검증
  - 시나리오 7 (instructor silent redirect) — Playwright 또는 next-test-utils
- `tests/integration/projects-edge.test.ts`:
  - EC-1, EC-2, EC-3, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14, EC-15
- 테스트 환경:
  - 로컬 Supabase + `supabase db reset` 사이클
  - Anthropic SDK 모킹 (`vi.mock('@anthropic-ai/sdk')`)

**검증:**
- 모든 시나리오 PASS
- 모든 EC PASS
- KPI 쿼리 (EC-13) 결과 검증

**연관 EARS:** acceptance.md 시나리오 1-7 + EC-1~15

---

### M9 — 접근성 + Lighthouse 폴리시 [Priority: Medium]

**산출물:**
- 3 페이지 (`/projects`, `/projects/new`, `/projects/<id>`)에 axe DevTools 적용
- 발견된 critical/serious 이슈 0건 도달
- Lighthouse Accessibility ≥ 95 측정
- 키보드 only 흐름 매뉴얼 검증 (Tab → Enter → Esc)
- 스크린리더 (VoiceOver/NVDA) 추천 카드 announce 흐름 검증

**검증:**
- axe report 첨부
- Lighthouse JSON 결과 첨부

**연관 EARS:** REQ-PROJECT-A11Y-001~007

---

### M10 — 한국어 에러 + 디스클레이머 + 문서화 [Priority: Medium]

**산출물:**
- `src/lib/projects/errors.ts` — 한국어 메시지 6종 단일 출처:
  - `STATUS_NEED_INSTRUCTOR`
  - `STATUS_NEED_EDUCATION_DONE`
  - `STALE_UPDATE`
  - `ASSIGN_NOT_IN_TOP3`
  - `ASSIGN_FAILED_GENERIC`
  - `END_BEFORE_START`
- `src/lib/projects/disclaimers.ts` — `RECOMMENDATION_DISCLAIMER`
- `docs/recommendation-engine.md` — 가중치 결정 근거 + 향후 학습형 가중치 마이그레이션 가이드 (옵션, plan 차원)
- README 또는 CHANGELOG 업데이트는 `/moai sync` 단계에서 manager-docs가 처리

**검증:**
- `grep -rn "이메일\|비밀번호\|만족도" src/app/(operator)/projects` 결과가 모두 `errors.ts` 경유 (인라인 한국어 문자열 없음)

**연관 EARS:** REQ-PROJECT-ERROR (cross-cutting), REQ-PROJECT-RECOMMEND-010

---

## 3. RED-GREEN-REFACTOR 적용 가이드

### 3.1 마일스톤 별 사이클 매핑

| 마일스톤 | RED (실패 테스트) | GREEN (최소 구현) | REFACTOR (개선) |
|----------|------------------|-------------------|------------------|
| M2 | unit test 13개 (status-flow + validate-transition + 4 recommendation) | 순수 함수 7개 | constants 추출, exhaustiveness check, 타입 narrowing |
| M3 | integration test 4개 (RLS + 트랜잭션) | 쿼리 함수 12개 | drizzle relational syntax 통일, 인덱스 hint |
| M4 | integration scenario test 6개 | Server Action 5개 | 에러 메시지 추출, zod 스키마 공유 |
| M6 | unit test 2개 (parsers + fallback) | client + prompt + parser + fallback | 타임아웃 + retry, prompt caching tuning |
| M8 | E2E scenario 7 + EC 15 | (M3-M7의 산출물이 모두 통과해야 함) | flake 제거, fixture 정리 |

### 3.2 매 사이클 종료 시 검증

- 모든 테스트가 GREEN인지 확인 (`pnpm vitest run`)
- 새로 추가된 코드의 라인 커버리지가 임계값 이상
- TypeScript `--strict` + `--noEmit` 통과
- ESLint critical 0
- 새 코드의 한국어 사용자 메시지가 단일 출처(`errors.ts`)에 등록됨

---

## 4. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Anthropic SDK API 응답 schema 변경 | 추천 사유 missing | zod 강제 검증 + fallback 즉시 발동. 모니터링: `console.warn` 발생률 |
| 추천 후보 fetch가 N+1 쿼리 발생 | 성능 저하 | drizzle relational query로 1쿼리에 instructor + skills + reviews join. 통합 테스트에서 실제 SQL log 확인 |
| `project_required_skills` junction 테이블 마이그레이션이 SPEC-DB-001 seed와 충돌 | seed 깨짐 | 본 SPEC 마이그레이션은 SPEC-DB-001 timestamp 이후. seed 데이터에 `project_required_skills` row를 추가하지 않음 (시나리오 1이 직접 INSERT) |
| `notification_type` enum 값 추가 → 기존 데이터 호환성 | 운영 중 enum 추가 | `ADD VALUE IF NOT EXISTS`로 idempotent. ordering 미보장 (SPEC-DB-001 §6 위험과 일관) |
| 동시성 보호 (낙관적 locking)가 race condition으로 누설 | 데이터 손실 | `expected_updated_at` 비교를 SQL `WHERE` 절에 포함하여 atomic. affected rows = 0이면 명시적 stale 응답 |
| Server Action 타임아웃 (Vercel 10초) | 추천 timeout | Claude 8초 + DB 1초 + 여유 1초. 8초 초과 시 fallback 즉시 |
| 단위 테스트 mock-heavy로 실제 동작 미검증 | 통합 시 실패 | M8에서 실제 Supabase + 모킹된 Anthropic SDK 조합으로 통합 검증. 단위 테스트는 순수 함수만 |
| 추천 결과 stale 캐시 (revalidatePath 누락) | UI가 갱신 안 됨 | 모든 mutation 액션 끝에 `revalidatePath(\`/projects/${id}\`)` + `revalidatePath('/projects')`. ESLint custom rule 또는 코드 리뷰 체크 |
| Claude prompt가 한국어 강사명 토큰화 비효율 → 비용 증가 | 운영 비용 | system prompt만 caching 활성, user message는 instructor_id (UUID)와 skill_id로만 전달 (이름 미포함). 사유 생성 후 UI에서 이름 매핑 |
| 강사 캘린더 (`schedule_items.unavailable`) seed 부재로 가용성 상시 1 | 추천 점수 왜곡 | seed에 INS-B의 unavailable row를 추가하거나 통합 테스트에서 fixture로 INSERT. 또는 SPEC-ME-001 완료 후 보강 |

---

## 5. Definition of Done (DoD)

본 SPEC이 `status: completed`로 전환되기 위한 체크리스트:

- [ ] M1 — 의존성 + 마이그레이션 + 타입 적용 완료
- [ ] M2 — 도메인 순수 함수 7개 + 단위 테스트 18개 모두 PASS, 라인 커버리지 ≥ 85%
- [ ] M3 — DB 쿼리 12개 + RLS/트랜잭션 통합 테스트 4개 PASS
- [ ] M4 — Server Action 5개 (create/update/transition/recommend/assign) 동작
- [ ] M5 — UI 컴포넌트 8개 키보드 접근 가능
- [ ] M6 — Claude 정상 + fallback 양 경로 검증
- [ ] M7 — 4개 페이지(`page`, `new`, `[id]`, `[id]/edit`) 모두 가드 통과
- [ ] M8 — acceptance.md 시나리오 1-7 + EC-1~15 모두 PASS
- [ ] M9 — axe critical 0 / Lighthouse ≥ 95 (3 페이지)
- [ ] M10 — 한국어 에러 6종 단일 출처 + 디스클레이머 노출
- [ ] `pnpm build` / `pnpm tsc --noEmit` / `pnpm exec eslint` 0 error
- [ ] `pnpm vitest run` 모든 테스트 PASS
- [ ] `supabase db reset` 무오류 + 마이그레이션 90/91 적용
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/app/(operator)/projects src/lib/recommendation` → 0 hit
- [ ] `grep -r "ANTHROPIC_API_KEY" .next/static/` → 0 hit
- [ ] KPI 쿼리(EC-13)로 1순위 채택률 산출 가능 검증
- [ ] `.moai/specs/SPEC-PROJECT-001/spec.md` `status` 필드를 `draft` → `completed`로 업데이트
- [ ] HISTORY 항목에 완료 시점 entry 추가

---

## 6. 후속 SPEC 진입점 (Next Steps After Completion)

본 SPEC 완료 후 다음 SPEC들이 활성화 가능:

- **SPEC-INSTRUCTOR-CONFIRM-XXX**: 강사가 `notifications.assignment_request`를 수신하여 수락/거절 흐름 + 프로젝트 status를 `assignment_confirmed`로 자동 전환
- **SPEC-NOTIF-001**: 이메일/SMS/카카오 어댑터 (`assignment_request` notification 1차 핸들러)
- **SPEC-REVIEW-001**: 만족도 입력 UI (`satisfaction_reviews` INSERT) — 추천 점수 데이터 소스 보강
- **SPEC-SETTLEMENT-001**: 정산 처리 UI (`settlement_in_progress` → `task_done` 흐름 + 금액 계산)
- **SPEC-AI-RECOMMEND-EVAL-XXX**: KPI 대시보드 (1순위 채택률, 추천-배정 lag time)
- **SPEC-ADMIN-001**: 강사 데이터 admin UI (force assignment 등 본 SPEC의 admin override 경로 UI)

---

_End of SPEC-PROJECT-001 plan.md_
