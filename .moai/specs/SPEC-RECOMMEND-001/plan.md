# SPEC-RECOMMEND-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 manager-tdd RED-GREEN-REFACTOR 사이클별 작업 단위, 의존성, 위험을 정의한다. `.moai/config/sections/quality.yaml`의 `development_mode: tdd`(brownfield TDD)를 따른다. 시간 추정은 사용하지 않으며 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-PROJECT-001 (`status: completed`, v1.0.0) — 추천 도메인 베이스라인. `score.ts`, `engine.ts`, `actions.ts`, `recommendation-panel.tsx`, `errors.ts:PROJECT_ERRORS` 모두 존재.
- ✅ SPEC-INSTRUCTOR-001 (`status: completed`, v1.1.0) — `src/lib/ai/claude.ts:callClaude` 활성 사용처. 본 SPEC은 모듈을 보존하므로 회귀 없음.
- ✅ SPEC-DB-001 (`status: completed`) — `ai_instructor_recommendations`, `instructor_skills`, `schedule_items`, `project_required_skills` 스키마. 본 SPEC은 변경하지 않음.
- ✅ Vitest / `node:test` 인프라 — `src/lib/recommend/__tests__/*.test.ts` 이미 동작.
- ✅ TypeScript 5.9 + Next.js 16 + React 19 + Server Actions.

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (도메인 정렬 RED-GREEN)이 M2 (engine RED-GREEN)와 M3 (actions RED-GREEN)의 선행
- M2와 M3은 병렬 가능 (서로 다른 파일)
- M4 (UI/disclaimer 변경)는 M3 완료 후
- M5 (REFACTOR + MX 태그 + 회귀 검증)은 M1-M4 완료 후

### 1.3 후속 SPEC을 위한 산출물 약속

- 본 SPEC은 신규 export를 추가하지 않는다. 모든 변경은 기존 함수의 동작 갱신 + UI 텍스트 변경에 한정.
- `RecommendationCandidate.source` 유니언은 보존하므로 후속 SPEC이 `"claude"` 분기를 재활성화할 수 있다.

---

## 2. 마일스톤 분해 (Milestones, manager-tdd 사이클)

### M1 — `rankTopN` tier sort 정책 [Priority: High]

**대응 EARS:** REQ-RECOMMEND-001 / REQ-RECOMMEND-002 / REQ-RECOMMEND-003 / REQ-RECOMMEND-009 (보존 검증).

#### M1.1 RED — 실패 테스트 작성

대상 파일: `src/lib/recommend/__tests__/score.test.ts`

추가/교체할 테스트:

1. **신규 테스트**: `rankTopN: tier-1 (availability) 우선 정렬`
   - 시나리오: 두 후보가 동일 finalScore이지만 `availability=1`/`availability=0`. tier-1 키로 `availability=1`이 1순위.
   - 케이스 데이터: `ins-Z` (skill 우수, schedule_kind=`unavailable` 기간 내 → availability=0, finalScore=0.85), `ins-A` (skill 동일, schedule 없음 → availability=1, finalScore=0.85). 단, 동일 finalScore를 만들기 위해 satisfaction을 다르게 설정해야 하므로 정확한 finalScore 동등 케이스보다는 "tier-1만으로 결정되는 케이스"로 작성.
   - 더 명확한 케이스: `ins-A` (availability=0, finalScore=0.85), `ins-B` (availability=1, finalScore=0.62). 기존 정책에서는 `ins-A` 1순위, 신규 정책에서는 `ins-B` 1순위.
   - 검증: `assert.equal(top[0].instructorId, "ins-B")`, `assert.equal(top[0].availability, 1)`.

2. **신규 테스트**: `rankTopN: tier-2 (finalScore) 결정 — availability 동일 시`
   - 시나리오: 두 후보 모두 `availability=1`이지만 finalScore가 다름. tier-2 키로 finalScore 큰 후보가 1순위.
   - 케이스: `ins-A` (skillMatch 0.5, satisfaction 0.6), `ins-B` (skillMatch 0.95, satisfaction 0.9). 둘 다 schedule 없음.
   - 검증: `assert.equal(top[0].instructorId, "ins-B")` (finalScore 큰 쪽), `assert.equal(top[1].instructorId, "ins-A")`.

3. **갱신 테스트**: `rankTopN: tier-3 (instructorId asc) — (availability, finalScore) 동일 시`
   - 기존 `rankTopN: 동점 시 instructorId 사전순 stable sort` 테스트의 의미를 보존하되, 새 비교자 통과를 검증. 기존 케이스(`ins-Z`, `ins-A` 동일 score) 그대로 재사용 가능.
   - 검증: 기존 assertion 보존.

4. **신규 테스트**: `rankTopN: 3-tier 통합 시나리오 (3명 동일 (availability, finalScore))`
   - 시나리오: 3명 후보 모두 `availability=1`, finalScore=0.7. `ins-C`, `ins-A`, `ins-B` 순서 입력.
   - 검증: `assert.deepEqual(top.map(t => t.instructorId), ["ins-A", "ins-B", "ins-C"])`.

5. **보존 테스트**: `rankTopN: 4명 → Top-3, skillMatch=0 후보 제외` (REQ-RECOMMEND-002)
   - 기존 테스트의 정렬 결과 assertion이 단일 키 정렬에 의존하지 않는지 검토. 기존 케이스(`ins-A` skillMatch 0.95, `ins-B` skillMatch 0.45, `ins-D` skillMatch 0.2, 모두 schedule 없음)에서 모든 후보가 `availability=1`이므로 tier-2 finalScore 정렬 결과와 단일 키 정렬 결과가 동일. 기존 assertion 그대로 PASS 예상.

**RED 검증**: `pnpm test src/lib/recommend/__tests__/score.test.ts` 실행 시 신규 테스트 4개가 실패해야 한다(현재 단일 키 정렬은 tier-1을 무시하므로 신규 테스트 1번이 실패).

#### M1.2 GREEN — 최소 변경으로 통과

대상 파일: `src/lib/recommend/score.ts`

변경 위치: `rankTopN` 함수의 `scored.sort(...)` 비교자 (현재 5라인).

변경 전:
```ts
scored.sort((a, b) => {
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  return a.instructorId.localeCompare(b.instructorId);
});
```

변경 후:
```ts
scored.sort((a, b) => {
  // Tier-1: availability desc (1 before 0)
  if (b.availability !== a.availability) return b.availability - a.availability;
  // Tier-2: finalScore desc
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  // Tier-3: instructorId asc (deterministic tiebreak)
  return a.instructorId.localeCompare(b.instructorId);
});
```

`skillMatch === 0` 필터(`.filter((s) => s.skillMatch > 0)`)는 보존한다.

**GREEN 검증**: `pnpm test src/lib/recommend/__tests__/score.test.ts` 모든 테스트 PASS.

---

### M2 — `engine.ts` reasonGen=null 동작 보강 검증 [Priority: High]

**대응 EARS:** REQ-RECOMMEND-004 (engine 측면).

`engine.ts:generateRecommendations`는 이미 `if (reasonGen && top.length > 0)` 가드로 `null` reasonGen을 정확히 처리한다. 본 마일스톤은 코드 변경 없이 **회귀 가드 테스트만 추가**한다.

#### M2.1 RED — 회귀 가드 테스트 작성

대상 파일: `src/lib/recommend/__tests__/engine.test.ts`

기존 테스트(`generateRecommendations: ReasonGenerator 없을 때 fallback 사용`)는 `result.candidates`가 모두 `source: "fallback"`임을 검증한다. 다음 회귀 가드를 추가:

1. **신규 테스트**: `generateRecommendations: reasonGen=null 시 외부 호출 없음 + model=null 보장`
   - 시나리오: spy 기반 ReasonGenerator (호출 카운트 감지) — 단, `null`을 전달하므로 spy도 호출되지 않아야 한다.
   - 케이스: `null`을 전달하고 `result.model === null`, `result.candidates.every(c => c.source === "fallback")` 검증.
   - 핵심: 이 테스트는 **현재도 PASS** 한다(기존 동작 보존). RED 단계로 넣는 것이 아니라 회귀 가드로 추가.

2. **신규 테스트**: `generateRecommendations: tier sort 결과가 candidates 배열 순서로 유지됨`
   - 시나리오: 입력 후보 3명 (`(avail=0, score=0.85)`, `(avail=1, score=0.62)`, `(avail=1, score=0.55)`). 결과 `candidates[0]`이 `availability=1, finalScore=0.62` 후보임을 검증.
   - 이 테스트는 score 도메인 테스트와 중복되나 engine 레벨에서도 정렬 결과가 보존됨을 확인한다.

#### M2.2 GREEN — 코드 변경 없음 (No-op)

`engine.ts`는 변경하지 않는다. 모든 테스트 PASS.

---

### M3 — `actions.ts` AI 호출 비활성 [Priority: High]

**대응 EARS:** REQ-RECOMMEND-004 (action 측면), REQ-RECOMMEND-005, REQ-RECOMMEND-007 (claude.ts 보존 측면).

#### M3.1 RED — 통합 테스트 작성

대상 파일: `src/app/(app)/(operator)/projects/[id]/__tests__/actions.test.ts` (신규)

테스트 환경: Supabase client mock(in-memory query builder) + `getCurrentUser` mock. `process.env.ANTHROPIC_API_KEY` 설정 여부를 명시적으로 분기.

추가할 테스트:

1. **신규 테스트**: `runRecommendationAction: ANTHROPIC_API_KEY 설정 + 후보 존재 → 모든 source="fallback"`
   - 시나리오: `ANTHROPIC_API_KEY="test-key"` 환경, 매칭 후보 2명 존재.
   - 검증:
     - `res.ok === true`
     - `res.candidates.every(c => c.source === "fallback")`
     - `res.model === null` (engine이 reasonGen=null 케이스에서 model=null 반환)

2. **신규 테스트**: `runRecommendationAction: INSERT payload.model === "fallback"`
   - 시나리오: 위와 동일 환경. supabase mock이 INSERT payload를 capture.
   - 검증: capture된 INSERT의 `model` 필드가 정확히 `"fallback"` (문자열).

3. **신규 테스트**: `runRecommendationAction: buildClaudeReasonGenerator 미호출 (spy)`
   - 구현 방안: `vi.mock("@/lib/ai/claude", ...)` 또는 module-level proxy로 `buildClaudeReasonGenerator` spy 설치.
   - 검증: spy.callCount === 0.
   - 대안: spy 설치가 어렵다면 actions.ts 소스 정적 검사(`grep "buildClaudeReasonGenerator" src/app/.../actions.ts | wc -l === 0`)를 별도 lint-style 테스트로 추가.

4. **회귀 가드 테스트**: `runRecommendationAction: 매칭 후보 0명 → res.candidates 빈 배열`
   - SPEC-PROJECT-001 기존 EX-13 동작 보존.

#### M3.2 GREEN — `actions.ts` 변경

대상 파일: `src/app/(app)/(operator)/projects/[id]/actions.ts`

변경 1 — import 제거:
```ts
// 변경 전
import { buildClaudeReasonGenerator } from "@/lib/ai/claude";

// 변경 후 (제거)
```

변경 2 — `runRecommendationAction` 본문에서 reasonGen 변수 제거 + `null` 직접 전달:
```ts
// 변경 전
const reasonGen = buildClaudeReasonGenerator();
const result = await generateRecommendations(
  projectInput,
  candidates,
  reasonGen,
  3,
);

// 변경 후
const result = await generateRecommendations(
  projectInput,
  candidates,
  null,
  3,
);
```

INSERT 구문(`model: result.model ?? "fallback"`)은 보존한다. `result.model`이 항상 `null`이므로 자연스럽게 `"fallback"`이 저장된다.

**GREEN 검증**: M3.1 테스트 모두 PASS.

---

### M4 — `RecommendationPanel` UI 변경 + disclaimer 문구 [Priority: Medium]

**대응 EARS:** REQ-RECOMMEND-006.

#### M4.1 RED — 컴포넌트 테스트 작성

대상 파일: `src/components/projects/__tests__/recommendation-panel.test.tsx` (신규 또는 기존 확장)

테스트 도구: React Testing Library + Vitest. Server Action은 mock.

추가할 테스트:

1. **신규 테스트**: `RecommendationPanel: 헤더 텍스트 "강사 추천" (no "AI")`
   - 검증: `screen.getByText("강사 추천")` 존재, `screen.queryByText(/AI 강사 추천/)` 부재.

2. **신규 테스트**: `RecommendationPanel: model 배지 미렌더링`
   - 시나리오: `runRecommendationAction` mock이 `model: "fallback"` 반환.
   - 검증: 헤더 인근에 `<Badge>{model}</Badge>` 형태의 텍스트 부재 (`screen.queryByText("fallback")` null in header).

3. **신규 테스트**: `RecommendationPanel: 후보별 source 배지 미렌더링 ("AI 사유" / "룰 기반" 모두 부재)`
   - 시나리오: `initialCandidates`에 `source: "fallback"` 후보 2명 주입.
   - 검증: `screen.queryByText("AI 사유")` null, `screen.queryByText("룰 기반")` null.

4. **신규 테스트**: `RecommendationPanel: 로딩 문구 "추천을 생성하고 있습니다…" (no "AI가")`
   - 시나리오: 추천 버튼 클릭 후 pending 상태에서 로딩 영역 검사.
   - 검증: `screen.getByRole("status")` 텍스트가 정확히 `"추천을 생성하고 있습니다…"`.

5. **신규 테스트**: `RecommendationPanel: disclaimer prop이 새 문구로 전달됨 (사용처 검증)`
   - 시나리오: `props.disclaimer = "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다."` 주입.
   - 검증: `screen.getByText("강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.")` 존재.

6. **신규 테스트**: `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER 상수 검증`
   - 별도 단위 테스트로 `import { PROJECT_ERRORS } from "@/lib/projects/errors"`.
   - 검증: `assert.equal(PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER, "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.")`.

#### M4.2 GREEN — UI 코드 변경

대상 파일 1: `src/components/projects/recommendation-panel.tsx`

변경 1 — 헤더 텍스트 (라인 104):
```tsx
// 변경 전
AI 강사 추천
{model && (
  <Badge variant="secondary" className="ml-2 text-[10px]">
    {model}
  </Badge>
)}

// 변경 후
강사 추천
```

변경 2 — model state 제거 (결정 D-2 적용):
```tsx
// 변경 전
const [model, setModel] = React.useState<string | null>(null);
...
setModel(res.model ?? null);

// 변경 후 (둘 다 제거)
```

변경 3 — 후보별 source 배지 제거 (라인 169-174):
```tsx
// 변경 전
<Badge
  variant={c.source === "claude" ? "info" : "secondary"}
  className="text-[10px]"
>
  {c.source === "claude" ? "AI 사유" : "룰 기반"}
</Badge>

// 변경 후 (Badge 블록 전체 제거)
```

변경 4 — 로딩 문구 (라인 127):
```tsx
// 변경 전
AI가 추천을 생성하고 있습니다…

// 변경 후
추천을 생성하고 있습니다…
```

대상 파일 2: `src/lib/projects/errors.ts` (라인 16-17)

```ts
// 변경 전
RECOMMENDATION_DISCLAIMER:
  "AI 추천은 참고용이며 최종 배정은 담당자가 결정합니다.",

// 변경 후
RECOMMENDATION_DISCLAIMER:
  "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.",
```

**GREEN 검증**: M4.1 테스트 모두 PASS.

---

### M5 — REFACTOR + MX 태그 갱신 + 회귀 검증 [Priority: Medium]

#### M5.1 사전 자체 리뷰 (Pre-submission Self-Review)

`workflow-modes.md` Pre-submission Self-Review 게이트를 통과한다:

- 단일 비교자 단순화 가능성 검토 — 비교자는 이미 4라인이며 추가 단순화 여지 없음(early-return 분기 3개가 가독성/성능 모두 최적).
- `actions.ts`의 `null` 직접 전달 vs 변수 보관 — `null`을 직접 전달하여 reasonGen 변수 자체를 제거 (현재 GREEN 변경 사항).
- `recommendation-panel.tsx`의 `model` state — 결정 D-2에 따라 완전 제거(코드 단순화).

#### M5.2 MX 태그 갱신

대상 1: `src/lib/recommend/score.ts` `rankTopN` 상단 (라인 115-118 영역).

```ts
// @MX:ANCHOR: SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-001/002/003 — 3-tier 안정 정렬.
// @MX:REASON: KPI(1순위 채택률 ≥ 60%) 분자가 top3_jsonb[0]에 의존하므로 정렬 결정성 필수.
// @MX:SPEC: SPEC-RECOMMEND-001
// @MX:SPEC: SPEC-PROJECT-001 (가중치 FROZEN — REQ-RECOMMEND-007 보존)
```

기존 `// @MX:ANCHOR: SPEC-PROJECT-001 §5.4 ...` 코멘트는 score.ts 파일 상단(라인 1-3)에 있으며 이는 보존한다. `rankTopN` 함수 직전에 위 ANCHOR 주석을 추가/갱신한다.

대상 2: `src/lib/recommend/engine.ts` 상단 (라인 1).

```ts
// @MX:ANCHOR: SPEC-PROJECT-001 §5.3 REQ-PROJECT-RECOMMEND-001/003/004 — Top-3 + 사유 생성 + 폴백.
// @MX:REASON: 추천 결과의 단일 entry point. AI 실패 시에도 폴백으로 결과를 보장한다.
// @MX:NOTE: SPEC-RECOMMEND-001 — runRecommendationAction이 reasonGen=null 전달 → 항상 fallback 분기.
// @MX:SPEC: SPEC-RECOMMEND-001
```

대상 3: `src/app/(app)/(operator)/projects/[id]/actions.ts` `runRecommendationAction` 직전.

```ts
// @MX:NOTE: SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-004/005 — buildClaudeReasonGenerator 비활성.
// @MX:REASON: AI 사유 비용/지연 vs KPI 가치 미검증 단계. 룰 기반 폴백을 단일 노출 경로로 사용.
// @MX:SPEC: SPEC-RECOMMEND-001
/** Top-3 추천 실행 + ai_instructor_recommendations INSERT. */
```

대상 4: `src/components/projects/recommendation-panel.tsx` 상단 (라인 3).

```tsx
// SPEC-PROJECT-001 §2.6/§2.7 — 추천 결과 표시 + 1-클릭 배정 버튼.
// SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-006 — AI 어휘 제거 + model/source 배지 미노출.
```

대상 5: `src/lib/projects/errors.ts` 상단 (라인 1).

```ts
// SPEC-PROJECT-001 — 한국어 에러 메시지 단일 출처 (REQ-PROJECT-ERROR).
// SPEC-RECOMMEND-001 — RECOMMENDATION_DISCLAIMER 문구에서 "AI" 어휘 제거 (REQ-RECOMMEND-006).
// 인라인 한국어 문자열 사용 금지. 모든 사용자 메시지는 본 모듈 경유.
```

#### M5.3 회귀 검증

실행 명령:

1. `pnpm typecheck` — 0 type 에러 (특히 `RecommendationPanel` model state 제거 후 `Props` 인터페이스 일관성).
2. `pnpm test` — 다음 모두 PASS:
   - `src/lib/recommend/__tests__/score.test.ts` (신규 + 기존)
   - `src/lib/recommend/__tests__/engine.test.ts` (신규 + 기존)
   - `src/lib/recommend/__tests__/kpi.test.ts` (보존, REQ-RECOMMEND-008 회귀 가드)
   - `src/lib/ai/__tests__/instructor-summary.test.ts` (SPEC-INSTRUCTOR-001 보존, REQ-RECOMMEND-007 회귀 가드)
   - `src/app/(app)/(operator)/projects/[id]/__tests__/actions.test.ts` (신규)
   - `src/components/projects/__tests__/recommendation-panel.test.tsx` (신규)
3. `pnpm lint` — recommend / projects / components/projects / app/(operator) 0 warning.
4. (선택) `npx supabase start && pnpm db:verify` — 18/18 PASS 유지(DB 변경 없음 회귀 가드).
5. (선택) `pnpm dev` 후 `/projects/{id}` 페이지 수동 검증:
   - 헤더가 "강사 추천"으로 노출.
   - 추천 실행 후 model 배지 미노출.
   - 후보별 "AI 사유"/"룰 기반" 배지 미노출.
   - 로딩 영역에 "추천을 생성하고 있습니다…" 노출.
   - disclaimer 텍스트가 새 문구로 노출.

#### M5.4 Drift Guard

`workflow-modes.md` Drift Guard에 따라 본 SPEC의 modified files 집계:

- `src/lib/recommend/score.ts` (1)
- `src/lib/recommend/__tests__/score.test.ts` (2)
- `src/lib/recommend/__tests__/engine.test.ts` (3)
- `src/app/(app)/(operator)/projects/[id]/actions.ts` (4)
- `src/app/(app)/(operator)/projects/[id]/__tests__/actions.test.ts` (5, 신규)
- `src/components/projects/recommendation-panel.tsx` (6)
- `src/components/projects/__tests__/recommendation-panel.test.tsx` (7, 신규 또는 확장)
- `src/lib/projects/errors.ts` (8)
- `src/lib/recommend/engine.ts` (코멘트만, MX 태그 갱신 — 9)

총 9개 파일. 본 SPEC의 plan 문서 기준 변경 범위 내. 추가 파일 수정이 필요하면 plan을 업데이트한다.

---

## 3. 위험 (Implementation Risks)

| ID | 위험 | 완화 |
|----|------|------|
| IR-1 | `actions.ts` 통합 테스트 환경 구축 부담 (Supabase mock + cookies + getCurrentUser mock) | (a) 기존 SPEC-PROJECT-001 시점에 `actions.ts` 통합 테스트가 존재하지 않을 가능성 → 본 SPEC에서 최소 mock 헬퍼를 신규 도입. (b) 대안으로 actions 정적 검사(`buildClaudeReasonGenerator` import 부재 + `null` literal 인자 검사)를 lint-style 테스트로 추가. |
| IR-2 | `recommendation-panel.test.tsx` 신규 도입 (RTL 인프라 검증 필요) | (a) `package.json` devDependencies에 `@testing-library/react`, `@testing-library/jest-dom` 또는 vitest equivalent 존재 여부 확인. (b) 미존재 시 본 SPEC에서 단위 컴포넌트 테스트 인프라를 도입(M4 RED 단계 선행). 대안으로 4개 UI 변경을 acceptance.md의 수동 시나리오로 보강. |
| IR-3 | tier sort 변경이 SPEC-PROJECT-001 acceptance를 회귀 | SPEC-PROJECT-001 acceptance 시나리오 재확인 — 추천 결과 순서 assertion이 단일 키 정렬에 의존하면 tier sort 적용 후 깨질 수 있다. 검증 후 발견 시 SPEC-PROJECT-001 acceptance를 본 SPEC sync phase에서 갱신(또는 별도 PR로 분리). |
| IR-4 | `RecommendationPanel` model state 제거 후 `RecommendActionResult.model` 타입 미사용 경고 | (a) `RecommendActionResult.model: string \| null \| undefined` 시그니처는 보존(타입 호환). (b) 클라이언트가 사용하지 않더라도 INSERT 결과 응답으로는 유효. lint warning 발생 시 변수 destructure에서 제외. |
| IR-5 | env `ANTHROPIC_API_KEY` 부재 환경에서도 동일 동작 회귀 가드 부족 | 본 SPEC 변경 후 `runRecommendationAction`은 `ANTHROPIC_API_KEY`를 read하지 않는다(`buildClaudeReasonGenerator` 미호출). 따라서 env 변수 부재/존재 케이스 동작이 동일. M3.1 테스트 1번에서 명시적으로 `ANTHROPIC_API_KEY="test-key"` 케이스를 검증한다. |

---

## 4. 검증 체크리스트 (Definition of Done)

본 SPEC `status: completed` 전환 전 다음 모두 PASS:

- [ ] M1 모든 score.test.ts 케이스 PASS (tier-1, tier-2, tier-3, 통합)
- [ ] M2 engine.test.ts reasonGen=null 회귀 가드 PASS
- [ ] M3 actions.test.ts 통합 테스트 PASS (source="fallback" + model="fallback" + buildClaudeReasonGenerator 미호출)
- [ ] M4 recommendation-panel.test.tsx UI 변경 검증 PASS + PROJECT_ERRORS 상수 검증 PASS
- [ ] M5.3 `pnpm typecheck` / `pnpm test` / `pnpm lint` 모두 0 에러/warning
- [ ] M5.3 SPEC-INSTRUCTOR-001 `instructor-summary.test.ts` 회귀 PASS (claude.ts 보존 검증)
- [ ] M5.3 kpi.test.ts 회귀 PASS (REQ-RECOMMEND-008)
- [ ] M5.2 모든 MX 태그 갱신 완료 (5개 파일)
- [ ] acceptance.md 모든 시나리오 PASS (수동 검증 포함)
- [ ] (sync phase 위임) product.md §F-202 라벨 갱신 + CHANGELOG 항목 추가

---

문서 끝.
