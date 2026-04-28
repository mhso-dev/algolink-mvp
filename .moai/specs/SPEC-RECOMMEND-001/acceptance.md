# SPEC-RECOMMEND-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-RECOMMEND-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

### 환경 (단위/통합 테스트)

- 추천 도메인 단위 테스트(`src/lib/recommend/__tests__/*.test.ts`)는 supabase 의존성 없음. `node:test` + `node --test` 또는 vitest로 직접 실행.
- `actions.ts` 통합 테스트는 supabase client mock(in-memory query builder) + `getCurrentUser` mock 사용. 로컬 supabase 컨테이너는 필요하지 않다.
- UI 컴포넌트 테스트는 React Testing Library + Vitest(또는 동급) 환경에서 실행. Server Action은 mock.

### 환경 (수동 시나리오)

- 로컬 supabase 컨테이너 가동: `npx supabase start` (또는 cloud Supabase 연결).
- 시드 데이터: SPEC-DB-001 seed + SPEC-PROJECT-001 acceptance 시드(추천 검증용 강사/스킬/프로젝트 — 이미 보유).
- 사용자: SPEC-AUTH-001 시드의 operator/admin 사용자 (`operator@algolink.test` / `admin@algolink.test`).
- 브라우저: Chromium 최신, 쿠키 활성, JavaScript 활성.
- 환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`. `ANTHROPIC_API_KEY`는 **설정해도 무관**(본 SPEC 변경 후 추천 도메인은 더 이상 사용하지 않음).
- 서버: `pnpm dev`.

### 시드 데이터 — 정렬 정책 검증용 강사 4명

본 SPEC 검증을 위해 다음 4명 강사 시드 가정(SPEC-PROJECT-001 acceptance 시드와 호환되도록 instructorId 패턴 사용).

| instructorId 패턴 | 이름 | 보유 스킬 (proficiency) | 일정 (kind/start/end) | 만족도 (mean / count) |
|------------------|------|------------------------|----------------------|---------------------|
| `aaaaaaaa-...` (`ins-A`) | 강사 A | python(expert), django(advanced) | (없음) | 4.6 / 8 |
| `bbbbbbbb-...` (`ins-B`) | 강사 B | python(advanced), django(advanced) | unavailable 2026-05-12 ~ 2026-05-13 (프로젝트 기간 내) | 4.6 / 8 |
| `cccccccc-...` (`ins-C`) | 강사 C | python(beginner) | (없음) | 3.0 / 2 |
| `dddddddd-...` (`ins-D`) | 강사 D | typescript(expert) | (없음) | 5.0 / 1 |

프로젝트 검증용:
- `requiredSkillIds: [skill-python, skill-django]`
- `startAt: 2026-05-10T00:00:00Z`, `endAt: 2026-05-14T00:00:00Z`

기대 점수(WEIGHTS = `{skill: 0.5, availability: 0.3, satisfaction: 0.2}`, PROFICIENCY_WEIGHT 적용):

- `ins-A`: skillMatch = (1.0 + 0.9) / 2 = 0.95, availability = 1, satisfaction = (4.6-1)/4 = 0.9 → finalScore = 0.5*0.95 + 0.3*1 + 0.2*0.9 = **0.955**
- `ins-B`: skillMatch = (0.9 + 0.9) / 2 = 0.9, availability = **0** (unavailable 오버랩), satisfaction = 0.9 → finalScore = 0.5*0.9 + 0.3*0 + 0.2*0.9 = **0.63**
- `ins-C`: skillMatch = 0.4 / 2 = 0.2, availability = 1, satisfaction = (3.0-1)/4 = 0.5 → finalScore = 0.5*0.2 + 0.3*1 + 0.2*0.5 = **0.5**
- `ins-D`: skillMatch = **0** (typescript 미요구) → 후보 풀에서 제외(REQ-RECOMMEND-002)

---

## 시나리오 1 — REQ-RECOMMEND-001 / 003: tier-1 정렬 — 동일 finalScore에서 availability=1 우선

**대응 EARS:** REQ-RECOMMEND-001 (tier-1 우선), REQ-RECOMMEND-003 (tiebreak 결정성).

### Given

`rankTopN` 단위 테스트 환경. 다음 두 후보:

- `ins-X` (instructorId: `xxxxxxxx-...`): `availability=0, finalScore=0.62`
- `ins-Y` (instructorId: `yyyyyyyy-...`): `availability=1, finalScore=0.62`

(동일 finalScore를 만들기 위해 satisfaction을 조정하고 unavailable 일정으로 ins-X의 availability를 0으로 낮춘다.)

### When

`rankTopN(project, [ins-X, ins-Y], 3)` 호출.

### Then

- `top.length === 2`
- `top[0].instructorId === "yyyyyyyy-..."` (availability=1 우선)
- `top[0].availability === 1`
- `top[1].instructorId === "xxxxxxxx-..."` (availability=0 후순위)
- `top[1].availability === 0`

### Test Mapping

`src/lib/recommend/__tests__/score.test.ts` 신규 케이스: `rankTopN: tier-1 (availability) 우선 정렬`.

---

## 시나리오 2 — REQ-RECOMMEND-001: tier-2 정렬 — availability 동일 시 finalScore 큰 후보 우선

**대응 EARS:** REQ-RECOMMEND-001 (tier-2 결정).

### Given

다음 두 후보 모두 `availability=1`:

- `ins-A` (instructorId: `aaaaaaaa-...`): skillMatch=0.95, satisfaction=0.9, finalScore = **0.955**
- `ins-C` (instructorId: `cccccccc-...`): skillMatch=0.2, satisfaction=0.5, finalScore = **0.5**

### When

`rankTopN(project, [ins-C, ins-A], 3)` 호출 (입력 순서 의도적으로 score 낮은 것 먼저).

### Then

- `top[0].instructorId === "aaaaaaaa-..."` (finalScore 큰 쪽)
- `top[1].instructorId === "cccccccc-..."`
- `top[0].finalScore > top[1].finalScore`

### Test Mapping

`score.test.ts` 신규 케이스: `rankTopN: tier-2 (finalScore) 결정 — availability 동일 시`.

---

## 시나리오 3 — REQ-RECOMMEND-003: tier-3 (instructorId asc) — (availability, finalScore) 동일 시

**대응 EARS:** REQ-RECOMMEND-003.

### Given

3명 후보 모두 동일 스킬셋(python expert + django advanced) + schedule 없음 + 동일 satisfaction. 입력 순서 `[ins-C, ins-A, ins-B]`(instructorId UUID 정렬상 A<B<C).

### When

`rankTopN(project, [ins-C, ins-A, ins-B], 3)` 호출.

### Then

- `top.map(t => t.instructorId).join(",") === "aaaaaaaa-...,bbbbbbbb-...,cccccccc-..."` (instructorId asc)
- 모든 후보의 `(availability, finalScore)` 동일.

### Test Mapping

`score.test.ts` 갱신/보존 케이스: `rankTopN: 동점 시 instructorId 사전순 stable sort` (tier-3 fallback 동작 검증).

---

## 시나리오 4 — REQ-RECOMMEND-002: skillMatch=0 후보 제외 (availability 무관)

**대응 EARS:** REQ-RECOMMEND-002.

### Given

다음 4명 후보:

- `ins-A` (skillMatch=0.95, availability=1)
- `ins-B` (skillMatch=0.9, availability=0)
- `ins-C` (skillMatch=0.2, availability=1)
- `ins-D` (skillMatch=0, availability=1) — typescript만 보유, requiredSkillIds 미매칭

### When

`rankTopN(project, [ins-A, ins-B, ins-C, ins-D], 3)` 호출.

### Then

- `top.length === 3` (ins-D 제외)
- `top.some(t => t.instructorId === "dddddddd-...")` === `false`
- 정렬 결과: `[ins-A (avail=1, score=0.955), ins-C (avail=1, score=0.5), ins-B (avail=0, score=0.63)]`
  - tier-1으로 ins-A, ins-C가 ins-B보다 상위.
  - tier-2로 ins-A가 ins-C보다 상위.
  - ins-B는 availability=0 그룹에 단독, 마지막.

### Test Mapping

`score.test.ts` 신규/갱신 케이스: `rankTopN: skillMatch=0 제외 + tier sort 통합 시나리오`. 기존 `4명 → Top-3, skillMatch=0 후보 제외` 테스트의 시드를 본 시나리오에 맞게 갱신(또는 신규 테스트 추가).

---

## 시나리오 5 — REQ-RECOMMEND-002: 매칭 후보 0명 시나리오

**대응 EARS:** REQ-RECOMMEND-002 (0명 케이스), REQ-RECOMMEND-006(연동 — UX 메시지).

### Given

프로젝트 requiredSkillIds: `[skill-python]`. 후보 풀: `[ins-D (typescript only)]`.

### When

`rankTopN(project, [ins-D], 3)` 호출.

### Then (단위)

- `top.length === 0` (skillMatch=0 필터로 모든 후보 제외).

### Then (E2E, RecommendationPanel 통합)

- `runRecommendationAction(projectId)` → `res.candidates.length === 0`
- `RecommendationPanel` UI에 `"기술스택을 만족하는 후보가 0명입니다."` 텍스트 노출.

### Test Mapping

`score.test.ts`: 단위 회귀(빈 배열 반환).
`recommendation-panel.test.tsx`: 0명 케이스 UX 메시지.

---

## 시나리오 6 — REQ-RECOMMEND-004: ANTHROPIC_API_KEY 설정 시에도 모든 사유 source="fallback"

**대응 EARS:** REQ-RECOMMEND-004.

### Given

- `process.env.ANTHROPIC_API_KEY = "sk-ant-test-key"` 설정.
- 매칭 후보 2명 (ins-A, ins-C).
- supabase mock이 후보 데이터를 정상 반환.

### When

`runRecommendationAction(projectId)` 호출.

### Then

- `res.ok === true`
- `res.candidates.length === 2`
- `res.candidates.every(c => c.source === "fallback")` === `true`
- `res.candidates.every(c => c.reason.length > 0 && c.reason.includes("기술스택"))` === `true` (fallbackReason 한국어 패턴)
- `res.model === null`
- (spy 가능 시) `buildClaudeReasonGenerator` mock 호출 카운트 === 0.

### Test Mapping

`actions.test.ts` 신규 케이스: `runRecommendationAction: ANTHROPIC_API_KEY 설정 + 후보 존재 → 모든 source="fallback"`.

---

## 시나리오 7 — REQ-RECOMMEND-005: ai_instructor_recommendations.model 컬럼이 "fallback" 리터럴

**대응 EARS:** REQ-RECOMMEND-005.

### Given

- 시나리오 6과 동일 환경.
- supabase mock의 `from("ai_instructor_recommendations").insert(...)`가 payload를 capture.

### When

`runRecommendationAction(projectId)` 호출 후 INSERT capture 검사.

### Then

- capture된 INSERT payload의 `model` 필드 === `"fallback"` (정확한 문자열 일치).
- `top3_jsonb` 필드는 정렬된 candidates 배열을 담고 있어야 함.
- `project_id` 필드 === 입력 `projectId`.

### Test Mapping

`actions.test.ts` 신규 케이스: `runRecommendationAction: INSERT payload.model === "fallback"`.

---

## 시나리오 8 — REQ-RECOMMEND-006(1, 2): 헤더 "강사 추천" + model 배지 미렌더링

**대응 EARS:** REQ-RECOMMEND-006 항목 1 (헤더 텍스트), 항목 2 (model 배지 제거).

### Given

`RecommendationPanel`을 다음 props로 렌더링:

```ts
{
  projectId: "proj-test",
  hasInstructor: false,
  initialCandidates: [],
  recommendationId: null,
  adoptedInstructorId: null,
  disclaimer: "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.",
}
```

### When

컴포넌트 마운트.

### Then

- `screen.getByText("강사 추천")` 존재.
- `screen.queryByText(/AI 강사 추천/)` === `null` (헤더에서 "AI" 어휘 부재).
- 헤더 영역에 model 값을 표시하는 `<Badge>` DOM 노드 부재(예: `screen.queryByText("fallback")`이 헤더 area selector에서 null).

### Test Mapping

`recommendation-panel.test.tsx` 신규 케이스: `RecommendationPanel: 헤더 텍스트 "강사 추천"` + `model 배지 미렌더링`.

---

## 시나리오 9 — REQ-RECOMMEND-006(3): 후보별 source 배지 미렌더링

**대응 EARS:** REQ-RECOMMEND-006 항목 3.

### Given

`RecommendationPanel`을 `initialCandidates`에 2명 후보(`source: "fallback"`) 주입하여 렌더링.

### When

컴포넌트 마운트 + 후보 리스트 렌더 완료.

### Then

- `screen.queryAllByText("AI 사유").length === 0`
- `screen.queryAllByText("룰 기반").length === 0`
- 후보별 `<li>` 안에 점수 라벨 / 일정 OK·충돌 라벨은 보존(다른 메타 라벨은 영향받지 않음).

### Test Mapping

`recommendation-panel.test.tsx` 신규 케이스: `RecommendationPanel: 후보별 source 배지 미렌더링`.

---

## 시나리오 10 — REQ-RECOMMEND-006(4): 로딩 문구 "추천을 생성하고 있습니다…"

**대응 EARS:** REQ-RECOMMEND-006 항목 4.

### Given

`RecommendationPanel` 렌더링 + `runRecommendationAction` mock이 pending Promise 반환.

### When

"추천 실행" 버튼 클릭 → 컴포넌트 `loading=true` 상태로 진입.

### Then

- `screen.getByRole("status")`의 텍스트 콘텐츠가 정확히 `"추천을 생성하고 있습니다…"`.
- `screen.queryByText(/AI가 추천을/)` === `null`.

### Test Mapping

`recommendation-panel.test.tsx` 신규 케이스: `RecommendationPanel: 로딩 문구 (no "AI가")`.

---

## 시나리오 11 — REQ-RECOMMEND-006(5): disclaimer 문구

**대응 EARS:** REQ-RECOMMEND-006 항목 5.

### Given

```ts
import { PROJECT_ERRORS } from "@/lib/projects/errors";
```

### When

상수 검사 + `RecommendationPanel`에 `disclaimer={PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER}` 전달.

### Then

- `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER === "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다."`
- 렌더 결과: `screen.getByText("강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.")` 존재.
- "AI 추천" 어휘 부재: `screen.queryByText(/AI 추천은/)` === `null`.
- "최종 배정은 담당자가 결정" 캐비엣 보존: 새 문구에 해당 구문 포함.

### Test Mapping

- `errors.test.ts`(신규 또는 추가): `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER` 상수 검증.
- `recommendation-panel.test.tsx`: disclaimer prop 렌더 검증.

---

## 시나리오 12 — REQ-RECOMMEND-007: claude.ts 보존 + SPEC-INSTRUCTOR-001 회귀 가드

**대응 EARS:** REQ-RECOMMEND-007.

### Given

- `src/lib/ai/claude.ts` 모듈 존재.
- SPEC-INSTRUCTOR-001 강사 만족도 요약 테스트(`src/lib/ai/__tests__/instructor-summary.test.ts`) 존재.

### When

1. `import { callClaude, ClaudeError, buildClaudeReasonGenerator } from "@/lib/ai/claude";` 컴파일 에러 부재.
2. `pnpm test src/lib/ai/__tests__/instructor-summary.test.ts` 실행.

### Then

- 모든 import가 valid (TypeScript 0 에러).
- `instructor-summary.test.ts`의 모든 테스트 PASS (callClaude 활용 경로 회귀 없음).
- `WEIGHTS`, `PROFICIENCY_WEIGHT`, `SATISFACTION_PRIOR` 상수 값 변경 없음 (score.test.ts 가중치 검증 테스트 보존 PASS).

### Test Mapping

- 회귀 가드: `instructor-summary.test.ts` 전체 PASS.
- 회귀 가드: `score.test.ts` 기존 가중치 검증(`computeFinalScore: 가중치 0.5/0.3/0.2 검증`) PASS.

---

## 시나리오 13 — REQ-RECOMMEND-008: KPI 산출식 안정성 + baseline shift 가시화

**대응 EARS:** REQ-RECOMMEND-008.

### Given

- `src/lib/recommend/kpi.ts` 모듈 (변경 없음).
- 기존 `kpi.test.ts` 케이스 (EC-13 정확 케이스 3/4 = 0.75 등).

### When

`pnpm test src/lib/recommend/__tests__/kpi.test.ts` 실행.

### Then

- 모든 기존 kpi.test.ts 케이스 PASS (`computeTop1AcceptanceRate` 동작 변경 없음).
- (수동 검증) 정책 변경 시점 이전 INSERT된 `ai_instructor_recommendations` row의 `model` 컬럼 값(예: `claude-sonnet-4-6`) 보존 — `pnpm exec` 또는 supabase SQL로 확인.
- **baseline shift 메모**: 본 시나리오에서 KPI 측정값 자체가 정책 변경 전후 다를 수 있음을 인지(시나리오 1처럼 `availability=0`인 강사가 단일 키 정렬에서 1순위였다가 tier sort에서 후순위로 이동하면 `top3_jsonb[0]`이 바뀐다). 이는 SPEC §8 R-1 위험으로 문서화되어 있으며 **acceptance 실패가 아니다**.

### Test Mapping

- `kpi.test.ts` 회귀 PASS (코드 변경 없음).

---

## 시나리오 14 — REQ-RECOMMEND-009: schedule_kind 시맨틱 보존

**대응 EARS:** REQ-RECOMMEND-009.

### Given

기존 `score.test.ts` 케이스:

- `computeAvailability: personal 일정은 무시 → 1`
- `computeAvailability: system_lecture 오버랩 → 0`
- `computeAvailability: unavailable 오버랩 → 0`
- `computeAvailability: 기간 외 일정 → 1`
- `computeAvailability: 일정 없음 → 1`

### When

`pnpm test src/lib/recommend/__tests__/score.test.ts` 실행.

### Then

- 위 5개 케이스 모두 PASS (코드 변경 없음).
- `personal` schedule_kind는 `availability` 계산에서 여전히 무시됨.
- `system_lecture`/`unavailable` 오버랩만 `availability=0` 결과를 만듦.

### Test Mapping

- `score.test.ts` 기존 `computeAvailability` 케이스 5개 회귀 PASS.

---

## 시나리오 15 — End-to-End (수동): 운영자 추천 실행 → UI 검증

**대응 EARS:** REQ-RECOMMEND-001 ~ REQ-RECOMMEND-006 통합 (수동 검증).

### Given

- 로컬 supabase 컨테이너 가동 + SPEC-PROJECT-001 acceptance 시드 + 본 SPEC 시드 데이터(강사 4명).
- `pnpm dev` 서버 실행 (`http://localhost:3000`).
- Operator 로그인 (`operator@algolink.test`).
- 검증 대상 프로젝트: `requiredSkillIds: [skill-python, skill-django]`, `startAt: 2026-05-10`, `endAt: 2026-05-14`. `instructor_id` 미배정 상태.

### When

1. `/projects/{projectId}` 페이지 진입.
2. `RecommendationPanel`의 "추천 실행" 버튼 클릭.
3. 추천 결과 렌더 완료 대기.

### Then

UI 시각 확인:

- ✅ Card 헤더: "강사 추천" (no "AI", no model 배지).
- ✅ disclaimer 영역: "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다."
- ✅ 로딩 중 표시: "추천을 생성하고 있습니다…" (no "AI가").
- ✅ 결과 리스트 3개 후보(시드에 따라 ins-A, ins-C, ins-B 순서 — tier sort 결과).
  - `top[0]`: 강사 A (점수 96점, 일정 OK)
  - `top[1]`: 강사 C (점수 50점, 일정 OK)
  - `top[2]`: 강사 B (점수 63점, 일정 충돌)
- ✅ 후보별 "AI 사유"/"룰 기반" 배지 미노출.
- ✅ 후보별 fallbackReason 한국어 문구 노출 (`기술스택 N/M건 일치, ..., 가용 일정 OK|일정 충돌 가능`).
- ✅ "배정 요청" 버튼 정상 작동.

DB 시각 확인 (psql 또는 Supabase Studio):

```sql
SELECT model, top3_jsonb->0->>'instructorId' AS top1_id
FROM ai_instructor_recommendations
WHERE project_id = '<projectId>'
ORDER BY created_at DESC
LIMIT 1;
```

- ✅ `model` 컬럼 === `"fallback"` (정확히 이 문자열).
- ✅ `top1_id` === `ins-A` instructorId (tier sort 결과).

### Test Mapping

- 자동 테스트로 위 시각 검증을 완전히 대체할 수 없음. acceptance.md의 마지막 수동 게이트로 운영.

---

## 시나리오 16 — 회귀 가드: SPEC-INSTRUCTOR-001 강사 만족도 요약 정상 동작

**대응 EARS:** REQ-RECOMMEND-007.

### Given

- 본 SPEC 적용 후 `pnpm dev` 서버 실행.
- `ANTHROPIC_API_KEY` 설정.
- SPEC-INSTRUCTOR-001 시드의 강사(`/instructors/[id]`)에 만족도 리뷰 3건 이상 존재.

### When

`/instructors/[id]` 페이지 진입 → AI 만족도 요약 섹션 렌더 대기.

### Then

- ✅ AI 만족도 요약 카드가 정상 렌더 (`callClaude` 정상 호출).
- ✅ 모델명/생성 timestamp 노출 (`claude-sonnet-4-6`, KST).
- ✅ console에 `ClaudeError` 또는 `[recommendation] Claude reason generation failed` 로그 부재.
- 본 SPEC 변경이 SPEC-INSTRUCTOR-001 AI 요약 경로에 회귀를 일으키지 않음을 확인.

### Test Mapping

- 자동: `instructor-summary.test.ts` 전체 PASS (시나리오 12 참조).
- 수동: 위 E2E 검증.

---

## Definition of Done — 전체 acceptance 통과 기준

본 SPEC `status: completed` 전환 전 다음 모두 PASS:

- [ ] 시나리오 1 — tier-1 정렬 (자동)
- [ ] 시나리오 2 — tier-2 정렬 (자동)
- [ ] 시나리오 3 — tier-3 정렬 (자동)
- [ ] 시나리오 4 — skillMatch=0 제외 + tier 통합 (자동)
- [ ] 시나리오 5 — 0명 케이스 UX (자동 + 수동)
- [ ] 시나리오 6 — source="fallback" 단일화 (자동, actions 통합)
- [ ] 시나리오 7 — model="fallback" persistence (자동, actions 통합)
- [ ] 시나리오 8 — 헤더 + model 배지 (자동, RTL)
- [ ] 시나리오 9 — source 배지 미노출 (자동, RTL)
- [ ] 시나리오 10 — 로딩 문구 (자동, RTL)
- [ ] 시나리오 11 — disclaimer 문구 (자동, RTL + 상수)
- [ ] 시나리오 12 — claude.ts 보존 + INSTRUCTOR 회귀 (자동)
- [ ] 시나리오 13 — KPI 회귀 + baseline shift 인지 (자동 + 수동)
- [ ] 시나리오 14 — schedule_kind 시맨틱 보존 (자동)
- [ ] 시나리오 15 — E2E 운영자 추천 실행 (수동)
- [ ] 시나리오 16 — INSTRUCTOR 만족도 요약 회귀 (수동)

---

문서 끝.
