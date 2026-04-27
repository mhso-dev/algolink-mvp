# SPEC-INSTRUCTOR-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 manager-tdd RED-GREEN-REFACTOR 사이클별 작업 단위, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 — `instructors`, `instructor_skills`, `skill_categories`, `projects`, `satisfaction_reviews`, `ai_satisfaction_summaries`, `settlements` 테이블 + `instructors_safe` view + RLS 정책 + seed 데이터
- ✅ SPEC-AUTH-001 완료 — `requireRole(['operator', 'admin'])`, `getCurrentUser`, `(operator)` route group server layout, `inviteUserByEmail` (`src/auth/admin.ts`)
- ✅ SPEC-LAYOUT-001 완료 — `<AppShell userRole>`, sidebar `/instructors` 항목 (`src/lib/nav.ts:40`), UI primitives (Table, Input, Select, Badge, Skeleton, Button, Form, Tooltip)
- ✅ Next.js 16 App Router + RSC + Server Actions
- ✅ Drizzle ORM + Supabase Postgres 16
- ✅ TanStack Query (필요 시 client-side filter UX), react-hook-form + zod

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (의존성 + env)이 모든 마일스톤의 선행
- M2 (도메인 타입 + 쿼리 헬퍼)는 M3-M7의 선행
- M3 (AI 요약 모듈)은 M5 (상세 페이지)의 선행
- M4 (리스트 페이지)와 M5 (상세 페이지)는 병렬 가능
- M6 (등록 폼)은 M2/M4 완료 후
- M7 (a11y/error 폴리시)는 M4/M5/M6 모든 페이지 완성 후
- M8 (acceptance 검증 + 문서)는 M7 완료 후

### 1.3 후속 SPEC을 위한 산출물 약속

- `src/lib/instructor/queries.ts`의 `listInstructorsForOperator`, `getInstructorDetailForOperator` → SPEC-PROJECT-001의 추천 엔진과 SPEC-DASHBOARD-001(담당자 메인 대시보드)이 import 가능
- `src/lib/ai/instructor-summary.ts` → SPEC-DASHBOARD-001 강사 카드 위젯, SPEC-ADMIN-001 분석에서 재사용
- `src/lib/ai/anthropic-client.ts` → 후속 AI 기능(이력서 파싱, 의뢰 파싱) 공용 클라이언트
- `src/components/instructor/skill-multiselect.tsx` → SPEC-PROJECT-001 프로젝트 등록 폼의 기술스택 입력에서 재사용
- 등록 폼의 `createInstructorAndInvite` 액션 패턴 → SPEC-CLIENT-001(고객사 등록 + 담당자 초대)에서 재현

---

## 2. 마일스톤 분해 (Milestones, manager-tdd 사이클)

### M1 — 의존성 + 환경 변수 [Priority: High]

**산출물:**
- `package.json` 의존성 추가 (이미 존재 시 skip):
  - `@anthropic-ai/sdk` (latest)
  - `date-fns-tz` (Asia/Seoul 포맷, 이미 존재 시 skip)
- `.env.example` 업데이트:
  ```
  ANTHROPIC_API_KEY=
  ```
- `.env.local`에 실제 키 설정 (운영자 수기, 본 SPEC 빌드 시점에는 임시 키 가능)

**검증 (RED-GREEN 없음, 환경 점검만):**
- `pnpm install` 무오류
- `pnpm tsc --noEmit` 0 type 에러
- 임시 스크립트 또는 `console.log(process.env.ANTHROPIC_API_KEY)` 검증 (production 빌드에서는 미노출)

**연관 EARS:** REQ-INSTRUCTOR-AI-003/004 (Claude SDK)

---

### M2 — 도메인 타입 + 쿼리 헬퍼 [Priority: High]

**산출물:**
- `src/lib/instructor/types.ts`:
  ```ts
  export type InstructorListRow = {
    id: string
    nameKr: string
    topSkills: string[]            // 최대 3
    totalSkillCount: number        // 전체 카테고리 수 (배지 +N more 용)
    lectureCount: number
    settlementTotalKrw: number
    avgScore: number | null        // 0 reviews면 null
    reviewCount: number
    lastLectureDate: Date | null
  }
  export type InstructorListFilter = {
    name?: string
    skillIds?: string[]
    scoreMin?: number              // 1.0 ~ 5.0
    scoreMax?: number
    sort?: 'name_kr' | 'lecture_count' | 'avg_score' | 'last_lecture_date'
    dir?: 'asc' | 'desc'
    page: number                   // 1-indexed
    pageSize: number               // default 20
  }
  export type InstructorDetail = {
    id: string
    nameKr: string
    nameEn: string | null
    email: string | null
    phone: string | null
    skills: { id: string; name: string }[]
    createdAt: Date
    userId: string | null
    history: InstructorHistoryRow[]
  }
  export type InstructorHistoryRow = {
    projectId: string
    projectTitle: string
    startDate: Date | null
    endDate: Date | null
    score: number | null
    comment: string | null
  }
  export type ReviewComment = {
    score: number
    comment: string
    projectTitle: string
    endDate: Date | null
  }
  export type SummaryResult =
    | { kind: 'ai'; summary: string; model: string; generatedAt: Date }
    | { kind: 'fallback'; avgScore: number | null; recentComments: ReviewComment[] }
    | { kind: 'empty' }
  ```

- `src/lib/instructor/queries.ts`:
  - `listInstructorsForOperator(filters): Promise<{ rows: InstructorListRow[]; total: number }>`
  - `getInstructorDetailForOperator(id): Promise<InstructorDetail | null>`
  - `getRecentReviewComments(instructorId, limit=5): Promise<ReviewComment[]>`
  - `instructors_safe` view 또는 컬럼 화이트리스트로 PII 차단
- `src/lib/instructor/skills.ts`:
  - `getAllSkillCategories(): Promise<{ id: string; name: string }[]>` — seed에서 로드
- `src/lib/instructor/format.ts`:
  - `formatKrw(value: number): string` — `12,345,000원`
  - `formatKstDate(date: Date | null, fmt: 'date' | 'datetime'): string`

**TDD 사이클:**
- RED: `src/lib/instructor/queries.test.ts` (Vitest + 테스트 DB)에 (a) 100명 강사 + 다양한 review/settlement seed로 list 6개 컬럼 정확성 (b) name search ILIKE (c) skill OR 필터 (d) score 범위 필터 (e) 정렬 4종 (f) page boundary 검증 (g) detail 미존재 → null (h) detail soft-deleted → null (i) PII 컬럼 비포함
- GREEN: Drizzle 쿼리 작성, `instructors_safe` 활용, GROUP BY/JOIN로 단일 쿼리 집계
- REFACTOR: lateral join / array_agg top-3 패턴, 인덱스 누락 시 EXPLAIN ANALYZE로 진단

**검증:**
- `pnpm vitest run src/lib/instructor` 통과
- 100명 seed에서 list 쿼리 < 1.0s (REQ-INSTRUCTOR-DATA-004)

**연관 EARS:** REQ-INSTRUCTOR-LIST-001/002/003/004/005/006/007/010, REQ-INSTRUCTOR-DETAIL-001/002/003/005, REQ-INSTRUCTOR-DATA-001/002/003/004/005/006/007

---

### M3 — AI 요약 모듈 (Claude API + 캐시 + 폴백) [Priority: High]

**산출물:**
- `src/lib/ai/anthropic-client.ts`:
  ```ts
  import 'server-only'
  import Anthropic from '@anthropic-ai/sdk'
  let _client: Anthropic | null = null
  export function getAnthropicClient(): Anthropic {
    if (!_client) {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
      _client = new Anthropic({ apiKey: key })
    }
    return _client
  }
  ```
- `src/lib/ai/instructor-summary.ts`:
  - `SYSTEM_PROMPT`: 한국어 분석 어시스턴트 페르소나 + 출력 포맷 (cache-eligible)
  - `buildSummaryPrompt(reviews: ReviewComment[]): { system: ContentBlock[]; user: string }` — system은 cache_control: ephemeral
  - `generateInstructorSummary(instructorId): Promise<{ summary: string; model: string }>` — 항상 새 호출
  - `getOrGenerateSummary(instructorId): Promise<SummaryResult>` — 24h 캐시 우선 + 폴백 + empty
  - 30s 타임아웃: `AbortSignal.timeout(30_000)` 또는 `Anthropic` 옵션
  - 에러 분류: timeout / 5xx / network / 4xx → fallback
  - 4xx auth/quota는 별도 로깅 (운영 알림 트리거)
- PII 분리 단위 테스트:
  - `buildSummaryPrompt` 호출 시 instructor 이름/이메일/전화가 prompt 출력 어디에도 포함되지 않음을 assertion

**TDD 사이클:**
- RED: `src/lib/ai/instructor-summary.test.ts`:
  - (a) 캐시 hit 시 SDK 호출 0회
  - (b) 캐시 miss + 3건 이상 review → SDK mock 호출 1회 + UPSERT 검증
  - (c) review < 3 → kind: 'empty', SDK 미호출
  - (d) SDK throws timeout → kind: 'fallback' with avg + top 5 comments
  - (e) SDK throws 5xx → fallback 동일
  - (f) SDK throws 4xx auth → fallback + error log assertion
  - (g) PII 미포함 검증 (instructor row를 mocking하여 prompt 본문에 이름 미포함)
- GREEN: 위 분기 로직 구현
- REFACTOR: error mapper 분리, 24h 캐시 윈도우 상수화

**검증:**
- `pnpm vitest run src/lib/ai` 통과
- 실제 Claude API 키로 1회 smoke test (수동, dev only): 5명 임시 review로 정상 응답 + 한국어 + 강점/약점/추천 분야 섹션 포함

**연관 EARS:** REQ-INSTRUCTOR-AI-001/002/003/004/005/006/007/008/010, REQ-INSTRUCTOR-ERROR-004

---

### M4 — 리스트 페이지 + 컴포넌트 [Priority: High]

**산출물:**
- `src/app/(operator)/instructors/page.tsx` (RSC):
  - searchParams 파싱 (name, skillIds, scoreMin, scoreMax, sort, dir, page)
  - `listInstructorsForOperator` 호출
  - `<InstructorListFilters>` + `<InstructorListTable>` + `<Pagination>` 렌더
  - 빈 결과 시 `<EmptyState>` 컴포넌트
- `src/app/(operator)/instructors/loading.tsx`:
  - 테이블 행 5개 분량 `<Skeleton>`
- `src/components/instructor/instructor-list-filters.tsx` (Client Component):
  - 이름 검색 input (debounce 300ms via `useDeferredValue`)
  - skill multiselect
  - 만족도 범위 (slider 또는 select pair) — Radix Slider 또는 두 개 select
  - URL state 업데이트 via `router.push` (Next.js navigation)
  - "필터 초기화" 버튼
- `src/components/instructor/instructor-list-table.tsx` (Server Component):
  - shadcn Table + 6개 컬럼
  - 정렬 가능한 4개 컬럼 헤더는 Link로 sort/dir 토글
  - aria-sort 속성
  - 행 클릭 → `/instructors/[id]` (Link wrapping `<tr>` 또는 row click handler)
- `src/components/instructor/skill-multiselect.tsx` (Client):
  - cmdk 기반 (또는 Radix Combobox + Checkbox)
  - 검색 가능, 다중 선택, 선택된 항목 chip 표시
- `src/components/instructor/pagination.tsx`:
  - 이전/다음 + 현재 페이지 / 총 페이지 / "총 N명"

**TDD 사이클:**
- RED: `src/app/(operator)/instructors/__tests__/page.test.tsx` — RSC 단위 테스트는 까다로우므로:
  - 컴포넌트 단위 테스트 (Testing Library + Vitest)
  - `<InstructorListFilters>`: input 변경 → URL 업데이트 검증
  - `<InstructorListTable>`: 정렬 헤더 클릭 → href 변경
  - 또는 Playwright e2e로 검증 (M8 통합)
- GREEN: 페이지 + 컴포넌트 구현
- REFACTOR: filter URL 직렬화 헬퍼 분리, debounce/throttle

**검증:**
- 운영자 토큰으로 `/instructors` 진입 → 6컬럼 정상 + seed 강사 N명 표시
- 검색/필터/정렬/페이지네이션 4종 인터랙션 동작
- 빈 결과 시 한국어 empty state
- aria-sort 속성 확인 (axe DevTools)

**연관 EARS:** REQ-INSTRUCTOR-LIST-001~010, REQ-INSTRUCTOR-A11Y-001/002/004

---

### M5 — 상세 페이지 + AI 섹션 [Priority: High]

**산출물:**
- `src/app/(operator)/instructors/[id]/page.tsx` (RSC):
  - `getInstructorDetailForOperator(params.id)` 호출
  - null이면 `notFound()`
  - 헤더: `← 강사 목록` (back link, query string 복원은 `referer` 또는 client-side history)
  - `<BasicInfoSection>` + `<HistoryTableSection>` + `<Suspense fallback={<SummarySkeleton/>}><SummarySection instructorId/></Suspense>`
- `src/app/(operator)/instructors/[id]/summary-section.tsx` (RSC, async):
  - `getOrGenerateSummary(instructorId)` await
  - `kind === 'ai'` → `<SatisfactionSummaryCard>`
  - `kind === 'fallback'` → `<SatisfactionFallbackCard>` + `role="status"` 배너
  - `kind === 'empty'` → empty state + 한국어 안내
- `src/app/(operator)/instructors/[id]/loading.tsx`:
  - 전체 상세 페이지 Skeleton
- `src/app/(operator)/instructors/[id]/actions.ts`:
  ```ts
  'use server'
  export async function regenerateSummary(instructorId: string): Promise<void> {
    // 1. requireRole(['operator', 'admin'])
    // 2. rate limit (1/min/instructor) — in-memory or DB based
    // 3. generateInstructorSummary (force, bypass 24h)
    // 4. revalidatePath(`/instructors/${instructorId}`)
  }
  ```
- `src/components/instructor/satisfaction-summary-card.tsx`:
  - 강점/약점/추천 분야 3섹션 (h3 hierarchy)
  - 모델 + 생성일 메타
  - "재생성" 버튼 → `regenerateSummary` 호출
- `src/components/instructor/satisfaction-fallback-card.tsx`:
  - 평균 점수 + 최근 코멘트 5건 카드
  - `role="status"` 배너로 폴백 명시
- `src/components/instructor/instructor-history-table.tsx`:
  - 진행 이력 테이블 + comment truncate + tooltip
- `src/app/(operator)/instructors/not-found.tsx`:
  - "존재하지 않는 강사입니다." + 목록으로 돌아가기 링크

**TDD 사이클:**
- RED:
  - 컴포넌트 단위 테스트: SummaryCard / FallbackCard / HistoryTable 렌더 분기
  - `regenerateSummary` 액션 단위 테스트 (instrumented mock SDK)
  - 404 분기 (Page에 mocked null 반환)
- GREEN: 페이지 + 컴포넌트 + 액션 구현
- REFACTOR: rate limit 모듈 분리, suspense boundary 명시

**검증:**
- 정상 강사 진입 → 3섹션 정상
- 존재하지 않는 id → 404 페이지
- AI 키 무효 환경에서 폴백 카드 + 배너
- review 2건 이하 강사 → empty state
- 키보드로 재생성 버튼 도달 + Enter 활성화

**연관 EARS:** REQ-INSTRUCTOR-DETAIL-001~007, REQ-INSTRUCTOR-AI-001/002/006/007/008/009/011, REQ-INSTRUCTOR-A11Y-006

---

### M6 — 강사 등록 폼 + 초대 액션 [Priority: High]

**산출물:**
- `src/app/(operator)/instructors/new/page.tsx`:
  - `<InstructorForm>` 렌더 (react-hook-form + zod)
  - 이름, 영문명, 이메일, 전화, 기술스택 multiselect
- `src/components/instructor/instructor-form.tsx`:
  - 입력 폼 + 검증 에러 + ARIA
- `src/lib/validation/instructor.ts`:
  - `instructorCreateSchema = z.object({ nameKr, nameEn?, email, phone?, skillIds })`
  - 에러 메시지 한국어
- `src/app/(operator)/instructors/new/actions.ts`:
  ```ts
  'use server'
  export async function createInstructorAndInvite(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    // 1. requireRole(['operator', 'admin'])
    // 2. zod parse
    // 3. 이메일 중복 체크 (instructors + auth.users)
    // 4. INSERT instructors → instructor_id 획득
    // 5. INSERT instructor_skills (다중)
    // 6. inviteUserByEmail(email, { invited_role: 'instructor', metadata: { instructor_id } })
    //    실패 시 DELETE instructors + return error
    // 7. revalidatePath('/instructors')
    // 8. redirect(`/instructors/${id}`) with success toast
  }
  ```
- (선택) SPEC-AUTH-001 `accept-invite/set-password/actions.ts` 보완:
  - `metadata.instructor_id`가 있으면 `UPDATE instructors SET user_id = auth.user.id WHERE id = $instructor_id` (REQ-INSTRUCTOR-CREATE-007)
  - 본 SPEC에서 코드 변경하되 SPEC-AUTH-001 v1.1 HISTORY 항목 추가

**TDD 사이클:**
- RED:
  - zod schema 단위 테스트 (이메일 형식, 이름 길이, 전화 정규식)
  - `createInstructorAndInvite` mock action 테스트:
    - 정상 케이스
    - 이메일 중복 → "이미 등록된 이메일입니다."
    - inviteUserByEmail 실패 → DELETE 검증
- GREEN: 액션 + 폼 구현
- REFACTOR: 에러 매퍼, redirect logic

**검증:**
- 정상 입력 → 강사 row + skills + 초대 발송 + redirect to detail
- 이메일 중복 → 에러 메시지
- 초대 실패 시뮬레이션 (mock SDK 5xx) → instructor row rollback
- accept-invite 완료 후 `instructors.user_id` 채워짐

**연관 EARS:** REQ-INSTRUCTOR-CREATE-001~007, REQ-INSTRUCTOR-ERROR-001/002/003

---

### M7 — 접근성 + 에러 UX 폴리시 [Priority: Medium]

**산출물:**
- 모든 폼/테이블/필터에 다음 패턴 적용 검증:
  - `<label htmlFor>` association
  - `aria-invalid`, `aria-describedby`
  - `role="alert"` (에러), `role="status"` (성공/폴백)
  - sortable header `aria-sort`
  - aria-live region for filter 결과 카운트
  - 키보드 only 순회 검증
- 에러 메시지 한국어 매핑 검증:
  - REQ-INSTRUCTOR-ERROR-002의 10종 메시지가 코드와 1:1 일치
- axe DevTools 스캔: `/instructors`, `/instructors/[id]`, `/instructors/new` 3페이지 critical 0
- Lighthouse Accessibility: 3페이지 평균 ≥ 95
- 다크 모드 대비비 검증 (SPEC-LAYOUT-001 토큰 활용)

**검증:**
- axe DevTools 0 critical
- Lighthouse a11y ≥ 95
- 키보드 only로 모든 인터랙션 도달

**연관 EARS:** REQ-INSTRUCTOR-A11Y-001~006, REQ-INSTRUCTOR-ERROR-001~004

---

### M8 — Acceptance 검증 + 문서 [Priority: Medium]

**산출물:**
- `acceptance.md`의 Given/When/Then 시나리오 1-7 + EC-1~10 모두 PASS 검증
- AI 요약 정확도 운영자 수동 검증 (3명 강사 샘플): 강점/약점이 실제 코멘트와 일치하는가
- `progress.md` (DoD 체크리스트 진행 기록)
- `.moai/docs/instructor-management.md` (선택, sync 단계로 위임 가능):
  - 도메인 다이어그램 (instructors → reviews/settlements/projects)
  - AI 요약 캐시 흐름
  - 후속 SPEC 핸드오프 가이드

**검증:**
- acceptance.md 모든 시나리오 PASS
- 운영자 수동 검증 3건 ✓
- DoD 체크리스트 모두 ✓

**연관 EARS:** (운영 항목, 명시 REQ 없음)

---

## 3. 진행 순서 (Sequencing)

```
M1 (deps + env)
   ↓
M2 (types + queries) ── TDD ─────┐
   ↓                              │
M3 (AI summary) ── TDD ──────────┤
   ↓                              │
   ├─→ M4 (list page + components) ── TDD
   │
   ├─→ M5 (detail page + AI section) ── TDD
   │       ↓
   │   (depends on M3)
   │
   └─→ M6 (create form + invite action) ── TDD
           ↓ (depends on M2)

M4, M5, M6 완료 후:
   ↓
M7 (a11y + error UX 폴리시)
   ↓
M8 (acceptance 검증 + 문서)
```

병렬 가능: M4 / M5 / M6 (단 M5는 M3 의존, M6는 M2 의존)

---

## 4. 위험 (Risks) 및 완화

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|-------|------|------|
| R1 | 단일 집계 쿼리가 100명 데이터에서 1s 초과 (REQ-INSTRUCTOR-DATA-004) | M | M | M2 RED 단계에서 100명 seed로 EXPLAIN ANALYZE. 인덱스 누락 시 SPEC-DB-002 분리. lateral join + materialized view 검토. |
| R2 | Anthropic API rate limit / 4xx auth → 운영 중 빈번 폴백 | M | M | 24h 캐시로 호출 빈도 최소화. 4xx는 별도 운영 로그. acceptance.md에 폴백 빈도 측정 노트. |
| R3 | AI 요약이 부정확 / 환각 (강점이 실제 코멘트와 무관) | M | H | acceptance에 운영자 수동 검증 3건 게이트. 모델/생성일 메타 표시. system prompt에 "review 텍스트에서만 추론, 외부 지식 사용 금지" 명시. |
| R4 | inviteUserByEmail 실패 시 instructor row rollback 누락 → 고아 row | L | M | M6 RED 단계 mock 실패 케이스로 검증. compensating DELETE 구현. |
| R5 | `user_id` 자동 매핑 누락 → 강사 본인 화면 진입 불가 | M | M | SPEC-AUTH-001 accept-invite 액션에 metadata 기반 UPDATE 추가 (M6에서 코드 변경 + SPEC-AUTH-001 HISTORY entry). 또는 trigger fallback. |
| R6 | RLS 정책이 GROUP BY 쿼리에서 의도 외 노출 | L | H | acceptance EC로 instructor 토큰 차단 검증 + admin/operator 통과 검증. |
| R7 | AI prompt에 PII 포함 회귀 | L | C | M3 단위 테스트에 instructor 이름/이메일/전화 미포함 assertion. 코드 리뷰 체크리스트. |
| R8 | skill multiselect UX (대량 카테고리 시 느림) | M | L | seed 카테고리 N개 측정 후 cmdk 검색형 채택. M4에서 측정. |
| R9 | 정산 합계의 status 정의 미스매치 (어느 status가 paid인가) | M | M | REQ-INSTRUCTOR-DATA-006에 명시 + SPEC-DB-001 settlement_status enum 재확인. acceptance EC에 SQL 검증. |
| R10 | 진행 이력 테이블이 50+ 프로젝트일 때 페이지 길어짐 | L | L | 최근 10건 + "더 보기" collapse 패턴. MVP는 단순 collapse. |
| R11 | 24h 캐시 경계에서 동시 다중 호출 (cache stampede) | L | L | 첫 호출이 row 작성, 후속 cached read. 약간의 race acceptable. 운영 시 advisory lock 검토. |
| R12 | Anthropic SDK 업데이트로 prompt cache 인터페이스 변경 | L | M | `@anthropic-ai/sdk` 버전 pin + M3 smoke test on update. |
| R13 | 운영자가 신규 등록 시 동일 이메일 race (operator A/B 동시) | L | L | DB UNIQUE constraint on `instructors.email`(또는 `auth.users.email`) 의존. acceptance EC로 검증. |
| R14 | Suspense fallback이 깜빡임으로 보임 | L | L | Skeleton 디자인으로 매끄럽게. 30s 한도 후에는 자동 fallback 카드로 전환. |

---

## 5. 완료 정의 (Definition of Done)

본 SPEC은 다음 모든 조건이 충족될 때 **완료**로 간주한다:

1. ✅ `pnpm build` 0 error / 0 warning (critical)
2. ✅ `pnpm tsc --noEmit` 0 type error
3. ✅ `pnpm exec eslint .` 0 critical
4. ✅ `pnpm vitest run src/lib/instructor src/lib/ai` 모든 단위 테스트 통과
5. ✅ 라우트 가드: instructor 토큰으로 `/instructors`, `/instructors/[id]`, `/instructors/new` 접근 시 silent redirect (응답에 강사 데이터 미노출)
6. ✅ 리스트 6개 컬럼 정상 표시 + 검색/필터/정렬/페이지네이션 동작
7. ✅ 상세 페이지 3섹션 정상 + 404 + Suspense fallback
8. ✅ AI 요약 정상 생성 + 24h 캐시 hit 검증 (DB row 검사)
9. ✅ AI 폴백 동작 (API 키 무효 환경에서 평균 점수 + 코멘트 5건 + 배너)
10. ✅ AI 요약 정확도 운영자 수동 검증 3명 강사 ✓
11. ✅ 등록 → 초대 발송 → 신규 강사 수락 → `instructors.user_id` 매핑 end-to-end
12. ✅ 등록 폼 검증 (이메일 중복, 형식 오류) 한국어 에러
13. ✅ 한국어 에러 메시지 10종 매핑 검증 (REQ-INSTRUCTOR-ERROR-002와 1:1)
14. ✅ Asia/Seoul 타임존 표시 검증 (마지막 강의일, AI 생성일)
15. ✅ axe DevTools `/instructors`, `/instructors/[id]`, `/instructors/new` 3페이지 critical 0
16. ✅ Lighthouse Accessibility ≥ 95 (3페이지 평균)
17. ✅ 키보드 only 순회 검증 (모든 인터랙션 도달)
18. ✅ AI prompt PII 미포함 단위 테스트 통과
19. ✅ AppShell sidebar `/instructors` active highlight 정상
20. ✅ list 쿼리 100명 seed에서 < 1.0s 측정 (또는 SPEC-DB-002 분리 결정)
21. ✅ `acceptance.md`의 Given/When/Then 시나리오 1-7 + EC-1~10 모두 PASS
22. ✅ SPEC-AUTH-001 accept-invite 액션의 metadata 기반 user_id 매핑 추가 완료 (또는 별도 trigger fallback)

---

_End of SPEC-INSTRUCTOR-001 plan.md_
