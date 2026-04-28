---
id: SPEC-RECOMMEND-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: medium
issue_number: null
---

# SPEC-RECOMMEND-001: 강사 추천 정렬 정책 변경 + AI 사유 생성 비활성

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성. SPEC-PROJECT-001 v1.0.0(`status: completed`, `[F-202]` AI 강사 추천 ✅)의 후속 정책 SPEC. (1) `rankTopN`의 단일 키 정렬(`finalScore desc, instructorId asc`)을 3-tier 안정 정렬(`availability desc → finalScore desc → instructorId asc`)로 교체하여 일정 미충돌 강사를 상단 우선 노출, (2) `runRecommendationAction` Server Action이 `buildClaudeReasonGenerator()` 호출을 중단하고 `generateRecommendations`에 `null` ReasonGenerator를 전달하여 모든 추천 사유를 룰 기반 폴백으로 단일화, (3) `ai_instructor_recommendations.model` 컬럼은 항상 리터럴 `"fallback"` 저장(기존 `result.model ?? "fallback"` 분기의 fallback 가지로 단일화), (4) `RecommendationPanel` UI에서 "AI" 어휘를 제거(헤더 "AI 강사 추천" → "강사 추천", model 배지 제거, "AI 사유"/"룰 기반" 후보별 배지 제거, 로딩 문구 "AI가 추천을 생성하고 있습니다…" → "추천을 생성하고 있습니다…"), (5) `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER` 문구를 AI 한정 표현 없이 "최종 배정은 담당자가 결정한다" 캐비엣을 보존하도록 수정한다. SPEC-PROJECT-001 §5.4 가중치(`{skill: 0.5, availability: 0.3, satisfaction: 0.2}`)와 `computeAvailability`의 schedule_kind 시맨틱(`personal` 무시, `system_lecture`/`unavailable` 충돌 검사) 및 DB 스키마는 모두 보존한다. SPEC-INSTRUCTOR-001 §2.4 강사 만족도 요약(`callClaude` + `instructor-summary.ts` 경로)은 본 SPEC의 변경 범위 밖이며 영향받지 않는다. `src/lib/ai/claude.ts` 모듈과 `callClaude` export는 보존하며 `buildClaudeReasonGenerator` export 자체도 (사용처가 사라지더라도) 유지하여 추후 재활성화 시 진입점을 보존한다.

---

## 1. 목적과 배경

### 1.1 목적 (Goal)

알고링크 MVP `[F-202]` 강사 추천 결과 노출 정책을 (a) **일정 미충돌 강사 우선 정렬**과 (b) **AI 추천 사유 비활성(룰 기반 단일화)** 두 축으로 조정한다. 본 SPEC의 산출물은 (1) `src/lib/recommend/score.ts:rankTopN`의 비교자(comparator) 교체 — 단일 키 정렬에서 `availability desc → finalScore desc → instructorId asc` 3-tier 사전식 안정 정렬로 변경, (2) `src/app/(app)/(operator)/projects/[id]/actions.ts:runRecommendationAction`에서 `buildClaudeReasonGenerator()` 호출 제거 및 `generateRecommendations(_, _, null, 3)`로 호출 형태 변경, (3) `RecommendationPanel` 클라이언트 컴포넌트에서 AI 어휘 제거 및 model/source 배지 제거, (4) `src/lib/projects/errors.ts:PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER` 문구의 AI 의존 표현 제거이며 인덱스 추가/마이그레이션/가중치 변경/`claude.ts` 삭제는 전혀 발생하지 않는다.

### 1.2 배경 (Background)

SPEC-PROJECT-001은 `[F-202]`를 (i) 가중합 점수(`0.5*skill + 0.3*availability + 0.2*satisfaction`)에 의한 Top-3 산출, (ii) Anthropic Claude API 기반 후보별 사유 생성, (iii) API 실패 시 룰 기반 폴백으로 정의했고, 운영 결과 두 가지 운영적 이슈가 식별되었다.

1. **정렬 정책 vs UX 기대 불일치**: 가중합 단일 키 정렬은 `0.3 * availability` 가중치가 `0.5 * skill`보다 작기 때문에, 스킬 매칭이 매우 강한 강사가 일정 충돌(`availability=0`) 상태여도 1순위로 노출될 수 있다. 운영자는 "일정 충돌 강사는 사실상 배정 불가이므로 우선 후순위로 보고 싶다"는 일관된 피드백을 보냈다. 가중치 자체를 조정하면 SPEC-PROJECT-001의 KPI(`1순위 채택률 ≥ 60%`) baseline 변형 폭이 크고 §5.4 FROZEN 약속을 위반한다. 정렬 단계에서만 `availability`를 우선 분리하는 tier sort가 가중치 보존과 UX 기대를 모두 만족한다.

2. **AI 사유 노출의 비용 대비 가치 미검증**: Claude API 호출은 추천 1회당 약 1초 추가 지연 + 토큰 비용을 발생시키나, KPI 검증 기간 동안 "AI 사유" 배지가 채택률을 끌어올린다는 계량적 근거가 확보되지 않았다. 추가로 `engine.ts`의 폴백 경로는 이미 운영 검증된 한국어 문구(`기술스택 N/M건 일치, 만족도 X/5, 가용 일정 OK|일정 충돌 가능`)를 산출하므로, 룰 기반 폴백을 단일 노출 경로로 두면 응답 지연/비용/일관성이 모두 개선된다. 단, `src/lib/ai/claude.ts`는 SPEC-INSTRUCTOR-001 §2.4 강사 만족도 요약 경로에서 `callClaude` export를 활성 사용 중이므로 모듈/심볼 자체는 보존해야 한다.

본 SPEC은 (1) 가중치 변경 없이 정렬 단계만 분리하고, (2) 추천 도메인의 AI 호출 경로만 비활성화하며, (3) DB 스키마/마이그레이션/`claude.ts` 모듈은 일체 변경하지 않는다.

### 1.3 비목표 (Non-goals)

- 추천 점수 가중치(`{skill: 0.5, availability: 0.3, satisfaction: 0.2}`) 변경 — SPEC-PROJECT-001 §5.4 FROZEN 약속 보존.
- DB 스키마/인덱스/RLS 정책 변경 — `ai_instructor_recommendations` 테이블의 컬럼/제약은 그대로.
- `src/lib/ai/claude.ts` 모듈 삭제 또는 `callClaude` export 변경 — SPEC-INSTRUCTOR-001 의존성 보존.
- SPEC-INSTRUCTOR-001 강사 만족도 요약 기능 변경 — 본 SPEC은 추천 도메인만 다룬다.
- 일정 충돌(`availability=0`) 강사를 Top-3에서 제외 — 정렬 후순위로만 두며 후보 풀에는 잔류한다.
- 비매칭(`skillMatch=0`) 강사 보충 노출 — 현행처럼 제외 유지.

---

## 2. 범위

### In Scope

- `src/lib/recommend/score.ts:rankTopN` — 비교자 교체(1행 단일 키 정렬 → 3-tier 안정 정렬), `skillMatch === 0` 필터 보존, 동일 시간/공간 복잡도(O(n log n) sort).
- `src/lib/recommend/__tests__/score.test.ts` — 기존 `rankTopN: 동점 시 instructorId 사전순 stable sort`/`rankTopN: 4명 → Top-3, skillMatch=0 후보 제외` 테스트 의미를 보존하며 tier sort 검증 케이스 추가/교체.
- `src/lib/recommend/__tests__/engine.test.ts` — `generateRecommendations(_, _, null, 3)` 호출 시 모든 후보 `source: "fallback"` + `model: null` 검증(이미 존재) + `actions.ts`가 항상 `null`을 전달함을 추적하는 별도 케이스 추가는 actions 테스트에서 처리.
- `src/app/(app)/(operator)/projects/[id]/actions.ts:runRecommendationAction` — `buildClaudeReasonGenerator` import/호출 제거, `generateRecommendations(projectInput, candidates, null, 3)` 호출, 기존 `model: result.model ?? "fallback"` INSERT 구문은 보존(분기의 fallback 가지로 자연 수렴).
- `src/components/projects/recommendation-panel.tsx` — 헤더 텍스트, model 배지 렌더, 후보별 source 배지, 로딩 문구 4개 지점 수정. `model` state 보존 여부는 §6 결정에 따른다.
- `src/lib/projects/errors.ts:PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER` — 문구 한 줄 변경.
- 본 SPEC 디렉터리(`spec.md` / `plan.md` / `acceptance.md`).

### Out of Scope (제외 사항)

- **DB 마이그레이션**: 신규 컬럼/인덱스/제약 추가 없음. `ai_instructor_recommendations` 스키마 그대로.
- **추천 점수 가중치 변경**: SPEC-PROJECT-001 §5.4의 `{skill: 0.5, availability: 0.3, satisfaction: 0.2}` FROZEN.
- **`src/lib/ai/claude.ts` 모듈 삭제 또는 `callClaude` export 제거**: SPEC-INSTRUCTOR-001 §2.4 의존성 보존.
- **SPEC-INSTRUCTOR-001 강사 만족도 요약(`instructor-summary*`) 영역**: 본 SPEC 변경 범위 밖, AI 호출 경로 그대로 유지.
- **admin 전용 추천 라우트 / API 신설**: 운영자/관리자 양쪽 모두 기존 `runRecommendationAction` 단일 경로(`ensureOperator()`)를 사용한다.
- **비매칭(`skillMatch=0`) 강사 보충 노출**: 0명 시나리오에서 추가 후보 표시 없이 기존 `"기술스택을 만족하는 후보가 0명입니다."` UX 유지.
- **일정 충돌 강사를 Top-3에서 제외**: 정렬 후순위 배치만 수행하며 `availability=0`도 매칭 시 후보로 잔류한다.
- **KPI 산출식(`computeTop1AcceptanceRate`) 변경**: `top3_jsonb[0]` 인덱스 비교 로직은 그대로(영향은 §8 위험 항목 참고).
- **`buildClaudeReasonGenerator` export 자체의 삭제**: 사용처가 사라지더라도 모듈 내 함수는 보존(추후 재활성화 진입점).
- **`RecommendationCandidate.source` 타입 유니언 축소**: `"claude" | "fallback"` 유니언 보존(전·후방 호환).

---

## 3. EARS 요구사항 (EARS Requirements)

본 SPEC은 1개 도메인(`RECOMMEND`)으로 단일화한다. 모든 REQ는 SPEC-PROJECT-001 기존 요구사항을 보존하면서 정렬·UI·외부 호출 정책만 갱신한다.

### REQ-RECOMMEND-001 (Ubiquitous, Sort Policy)

The system **shall** rank instructor candidates in `rankTopN(project, candidates, n)` using a 3-tier lexicographic stable sort with the following key order:

1. Tier-1 key: `availability` descending (1 before 0)
2. Tier-2 key: `finalScore` descending (existing weighted score `0.5*skillMatch + 0.3*availability + 0.2*satisfaction`)
3. Tier-3 key: `instructorId` ascending (deterministic tiebreak)

The sort **shall** preserve `O(n log n)` complexity (single `Array.prototype.sort` call with a single comparator).

### REQ-RECOMMEND-002 (Ubiquitous, Filter Preservation)

The system **shall** continue to exclude candidates with `skillMatch === 0` from the ranked list before slicing Top-N. **If** the filter step would yield zero candidates, **then** `rankTopN` **shall** return an empty array and the calling Server Action **shall** surface the existing UX `"기술스택을 만족하는 후보가 0명입니다."` (via `RECOMMEND_NO_CANDIDATE_TEMPLATE` or empty-array branch in `RecommendationPanel`).

### REQ-RECOMMEND-003 (Ubiquitous, Stable Tiebreak)

**Where** two or more candidates have identical `(availability, finalScore)` pairs, the system **shall** order them deterministically by `instructorId` ascending using `String.prototype.localeCompare` (matching the existing tiebreak convention).

### REQ-RECOMMEND-004 (Ubiquitous, AI Reason Disabled)

The system **shall** invoke `generateRecommendations(projectInput, candidates, null, 3)` from `runRecommendationAction`, passing `null` as the `reasonGen` argument. The system **shall not** call `buildClaudeReasonGenerator()` from `runRecommendationAction`. As a consequence, every `RecommendationCandidate.source` produced by `runRecommendationAction` **shall** equal `"fallback"`.

### REQ-RECOMMEND-005 (Ubiquitous, Persistence Default)

**When** `runRecommendationAction` INSERTs a row into `public.ai_instructor_recommendations`, the system **shall** persist the literal string `"fallback"` in the `model` column. (This is the existing fallback branch of `model: result.model ?? "fallback"`; with `result.model` always `null` under REQ-RECOMMEND-004, the column receives `"fallback"` deterministically.)

### REQ-RECOMMEND-006 (Event-Driven, UI Decoupling)

**When** the `RecommendationPanel` client component renders, the system **shall** apply the following UI mutations relative to the SPEC-PROJECT-001 baseline:

1. The `<CardTitle>` text **shall** read `"강사 추천"` (no leading "AI").
2. The model `<Badge>` adjacent to the title **shall not** be rendered (DOM removal, not visibility toggle).
3. Each candidate row **shall not** render the `c.source === "claude" ? "AI 사유" : "룰 기반"` `<Badge>` (DOM removal).
4. The loading region (`role="status"`) **shall** display `"추천을 생성하고 있습니다…"` (no leading "AI가").
5. The disclaimer text supplied via `props.disclaimer` (sourced from `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER`) **shall** read `"강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다."` — the AI-specific qualifier is removed while the human-decision-final caveat is preserved.

### REQ-RECOMMEND-007 (Unwanted Behavior, Dependency Preservation)

The system **shall not** remove or modify exports of `src/lib/ai/claude.ts`. Specifically, `callClaude`, `ClaudeError`, and `buildClaudeReasonGenerator` **shall** remain exported as in the SPEC-PROJECT-001 baseline. The system **shall not** modify the SPEC-PROJECT-001 §5.4 score weights `{skill: 0.5, availability: 0.3, satisfaction: 0.2}` or the `PROFICIENCY_WEIGHT`/`SATISFACTION_PRIOR` constants; these remain FROZEN.

### REQ-RECOMMEND-008 (Unwanted Behavior, KPI Computation Stability)

The system **shall not** modify `src/lib/recommend/kpi.ts:computeTop1AcceptanceRate` or the `TOP1_ACCEPTANCE_RATE_SQL` constant. The KPI computation method (`top3_jsonb[0].instructorId === adopted_instructor_id`) **shall** remain unchanged. **Note**: because Tier-1 sort by `availability` reorders Top-3 relative to the prior single-key ordering, the instructor at `top3_jsonb[0]` may differ from prior policy for projects where the highest-`finalScore` candidate had `availability=0`; this is an expected baseline shift documented in §8 and is **not** a defect of this SPEC.

### REQ-RECOMMEND-009 (State-Driven, Schedule Kind Semantics)

**While** computing `availability` for a candidate, the system **shall** continue to ignore `personal` schedule items and **shall** flag overlap only on `system_lecture` and `unavailable` items, preserving the SPEC-PROJECT-001 `computeAvailability` invariant. This SPEC introduces no change to `score.ts:computeAvailability`.

---

## 4. 비기능 요구사항

- **성능**: `rankTopN`의 정렬 단계는 `O(n log n)` 단일 `sort` 호출을 유지한다. tier 비교자는 분기 4개(availability 차이 → finalScore 차이 → localeCompare 결과)로 추가 할당이 없다. AI 호출 제거에 따라 `runRecommendationAction` 평균 응답 시간이 약 1초 단축된다(Claude API 8초 timeout 폴백 경로 제거 효과).
- **가관측성**: `RecommendationCandidate.source`는 운영 추적 분포가 `{claude: 0%, fallback: 100%}`로 단일화된다. `ai_instructor_recommendations.model` 분포도 `"fallback"` 단일 값으로 정렬되어 후속 분석 SQL 단순화에 기여한다.
- **호환성**: TypeScript 타입 `RecommendationCandidate.source: "claude" | "fallback"` 유니언과 `RecommendationResult.model: string | null` 시그니처는 보존한다. `engine.ts:generateRecommendations`의 함수 시그니처(`reasonGen: ReasonGenerator | null`)도 보존하므로 외부 호출 형태는 변경되지 않는다.
- **로컬화**: 한국어 UI 문구 변경은 `PROJECT_ERRORS.RECOMMENDATION_DISCLAIMER` 단일 출처 + `recommendation-panel.tsx` 인라인 4개 지점에 한정된다. SPEC-PROJECT-001의 한국어 단일 출처 원칙(`PROJECT_ERRORS`)을 위반하지 않는다.
- **접근성**: 로딩 영역의 `role="status"` + `aria-live="polite"`는 보존된다. 후보별 source 배지 제거에 따라 `aria-label`/`sr-only` 텍스트 변경은 없다(원래 배지에 별도 ARIA 속성 부여되지 않음).

---

## 5. 데이터 모델 (변경 없음)

본 SPEC은 데이터 모델/스키마를 변경하지 않는다. 보존되는 핵심 객체:

- `public.ai_instructor_recommendations` 테이블: `(id, project_id, top3_jsonb, model, adopted_instructor_id, created_at)` 컬럼 그대로. `model` 컬럼의 도메인 값 분포만 운영 결과상 `"fallback"` 단일화.
- `public.instructor_skills`, `public.schedule_items`, `public.satisfaction_reviews`, `public.project_required_skills` 등 추천 입력 테이블: 일체 변경 없음.
- TypeScript 도메인 타입(`RecommendationCandidate`, `RecommendationResult`, `CandidateScore`, `CandidateInput`, `ProjectInput`, `ReasonGenerator`): 시그니처 유지.

---

## 6. 의존성 / 결정 사항

### 6.1 외부 SPEC 의존성

- **SPEC-PROJECT-001 (`status: completed`, v1.0.0)**: 본 SPEC은 SPEC-PROJECT-001의 §5.4 가중치/도메인 타입/Server Action 진입점/`RecommendationPanel` UI 베이스라인을 전제로 한다. 본 SPEC은 SPEC-PROJECT-001 문서를 수정하지 않는다(closed SPEC). 정책 분기는 본 SPEC이 단일 출처가 된다.
- **SPEC-INSTRUCTOR-001 (`status: completed`, v1.1.0)**: §2.4 강사 만족도 요약은 `callClaude` export를 활성 사용한다. 본 SPEC은 `claude.ts` 모듈을 보존하므로 SPEC-INSTRUCTOR-001 회귀 없음.
- **SPEC-DB-001 (`status: completed`)**: `ai_instructor_recommendations`, `schedule_items.schedule_kind`, `instructor_skills`, `project_required_skills` 테이블 스키마. 변경 없음.
- **SPEC-NOTIFY-001**: `assignInstructorAction`은 본 SPEC 영향 범위 밖이며, `runRecommendationAction`만 변경 대상. 알림 트리거 경로 회귀 없음.

### 6.2 결정 사항

- **결정 D-1: SPEC ID 분리 vs SPEC-PROJECT-001 amendment** — SPEC-PROJECT-001은 `status: completed`이고 §5.4 가중치는 FROZEN으로 약속되어 있다. closed SPEC을 amendment하는 대신 새 SPEC(`SPEC-RECOMMEND-001`)을 생성하여 정책 분기를 명시적으로 추적한다. 기존 SPEC은 정책 baseline의 단일 진실로 보존된다.
- **결정 D-2: `RecommendationPanel.model` state 처리** — `model` 배지가 DOM에서 제거되므로 클라이언트 state `const [model, setModel] = React.useState<string | null>(null);`는 더 이상 렌더에 사용되지 않는다. **선택**: state 자체를 제거(코드 단순화 우선). `setModel(res.model ?? null)` 호출도 함께 제거한다. `RecommendActionResult.model` 필드는 보존(타입 호환).
- **결정 D-3: `buildClaudeReasonGenerator` export 보존** — 사용처가 사라지더라도 함수 자체는 `claude.ts`에 남겨둔다. (a) 추후 재활성화 시 진입점을 유지, (b) `instructor-summary` 경로의 `callClaude`와 동일 모듈에 위치하여 모듈 응집도 유지, (c) 코드 삭제로 인한 리뷰 부담 최소화.
- **결정 D-4: `engine.ts` 변경 여부** — `generateRecommendations(reasonGen=null)` 분기는 이미 `if (reasonGen && top.length > 0)` 가드로 정확히 처리된다. `engine.ts`는 본 SPEC에서 코드 변경 없이 통과한다(테스트만 추가).

---

## 7. 마이그레이션 영향

- **DB 마이그레이션**: 없음. SPEC-DB-001의 스키마 그대로 사용한다.
- **데이터 마이그레이션**: 없음. 본 SPEC 적용 시점 이전에 INSERT된 `ai_instructor_recommendations` row(`model = 'claude-sonnet-4-6'` 등)는 **보존**한다. 본 SPEC은 forward-only 정책이며 과거 row의 `model` 값을 재작성하지 않는다.
- **세션/캐시 무효화**: 없음. 추천 결과는 매 호출마다 재계산되며 클라이언트 캐시 의존 없음.
- **환경 변수**: 변경 없음. `ANTHROPIC_API_KEY`가 설정되어 있어도 `runRecommendationAction`은 더 이상 추천 도메인에서 호출하지 않는다(SPEC-INSTRUCTOR-001 강사 요약 경로에서는 계속 사용).

---

## 8. 위험 및 완화 (Risks and Mitigations)

| ID | 위험 | 영향 | 완화 |
|----|------|-----|------|
| R-1 | KPI baseline shift | `top3_jsonb[0]`이 변경되어 `computeTop1AcceptanceRate`의 분자(1순위 채택 건수)가 정책 변경 전후로 비교 불가능해진다. | (a) SPEC-PROJECT-001 KPI 시계열에 정책 변경 시점 마커를 기록(`.moai/project/product.md` §5 KPI 메모 또는 운영 노트). (b) 정책 변경 이후의 측정만 새 baseline으로 채택. (c) `kpi.ts`/SQL은 변경하지 않으므로 자동화 파이프라인 회귀 없음. |
| R-2 | 일정 충돌 강사가 Top-3에서 보이지 않는 것으로 오해 | 운영자가 "왜 강사 X가 Top-3에 안 보이지?"를 일정 충돌이 아니라 시스템 버그로 오인할 수 있다. | (a) `RecommendationPanel`의 후보 메타 라인에 `일정 OK | 충돌` 표기는 그대로 유지(이미 `c.availability ? "OK" : "충돌"` 렌더). (b) `availability=0` 후보가 Top-3에 진입한 케이스(매칭 후보 ≤ 3명)에서도 동일 라벨이 노출되어 운영자가 충돌 강사 후순위 배치를 직관적으로 인지. |
| R-3 | 룰 기반 사유의 가시성 증가에 따른 문구 미묘함 노출 | 기존에는 Claude 응답이 다수 노출되어 룰 기반 문구는 backup 위치였으나, 이제 100% 룰 기반이 노출된다. `fallbackReason`의 한국어 문구(`기술스택 N/M건 일치, 만족도 X/5, 가용 일정 OK`)가 단일 사유 출처가 된다. | (a) `fallbackReason` 한국어 문구는 SPEC-PROJECT-001 acceptance 검증을 통과한 텍스트. 본 SPEC에서 문구 수정 없음. (b) 후속 SPEC에서 운영 피드백을 수집해 별도 문구 개선 SPEC을 발행. |
| R-4 | `availability=0` 강사가 Top-3 상단에 노출(매칭 후보 ≤ 3명) | 매칭 후보가 3명 미만이고 그 중 일부가 일정 충돌인 경우, tier sort에서 후순위에 배치되지만 여전히 표시된다. | (a) `RecommendationPanel`의 후보 메타에 `일정 충돌` 라벨이 항상 노출되므로 운영자가 충돌 인지. (b) `assignInstructorAction`은 추천 결과 포함 여부만 확인하므로 충돌 강사 배정도 기술적으로 가능(force flag 없이도). 이는 SPEC-PROJECT-001에서 이미 수용된 동작이며 본 SPEC에서 변경하지 않는다. |
| R-5 | 인덱스 0 (1순위)의 finalScore가 인덱스 1보다 낮은 역전 케이스 | tier sort에서 `availability=1, finalScore=0.62`가 `availability=0, finalScore=0.85`보다 위에 위치한다. 운영자가 "왜 점수가 낮은 강사가 1순위?"를 의문할 수 있다. | (a) 후보 메타 라인의 `점수 N점` 라벨을 통해 운영자가 직접 비교 가능. (b) 본 SPEC §1.2에서 "일정 미충돌 우선" 정책 사유를 기록. (c) 추후 운영 노트로 정책 사유를 운영자 가이드에 반영. |

---

## 9. 추적성 (Traceability)

| REQ ID | 변경 대상 코드 | 검증 테스트 |
|--------|--------------|-----------|
| REQ-RECOMMEND-001 | `src/lib/recommend/score.ts:rankTopN` (비교자 교체) | `src/lib/recommend/__tests__/score.test.ts` (tier sort 신규 케이스) |
| REQ-RECOMMEND-002 | `src/lib/recommend/score.ts:rankTopN` (`skillMatch === 0` 필터 보존) | `score.test.ts` 기존 `4명 → Top-3, skillMatch=0 후보 제외` 테스트 (보존) |
| REQ-RECOMMEND-003 | `src/lib/recommend/score.ts:rankTopN` (Tier-3 instructorId asc) | `score.test.ts` 기존 `동점 시 instructorId 사전순` (의미 보존하며 갱신) |
| REQ-RECOMMEND-004 | `src/app/(app)/(operator)/projects/[id]/actions.ts:runRecommendationAction` | `actions.ts` 통합 테스트 또는 characterization 테스트 (신규) + `engine.test.ts` 기존 `ReasonGenerator 없을 때 fallback` (보존) |
| REQ-RECOMMEND-005 | `actions.ts:runRecommendationAction` (INSERT 호출) | actions 통합 테스트에서 INSERT payload `model: "fallback"` 검증 |
| REQ-RECOMMEND-006 | `src/components/projects/recommendation-panel.tsx` (4개 지점) + `src/lib/projects/errors.ts:RECOMMENDATION_DISCLAIMER` | `recommendation-panel.test.tsx`(신규 또는 확장) — 헤더 텍스트, model 배지 부재, source 배지 부재, 로딩 문구, disclaimer 검증 |
| REQ-RECOMMEND-007 | `src/lib/ai/claude.ts` (보존) + `score.ts` 가중치 상수 (보존) | `score.test.ts` 기존 가중치 검증 테스트 (보존) + `instructor-summary.test.ts`(SPEC-INSTRUCTOR-001) 회귀 PASS |
| REQ-RECOMMEND-008 | `src/lib/recommend/kpi.ts` (변경 없음) | `kpi.test.ts` 기존 테스트 모두 PASS (회귀 없음) |
| REQ-RECOMMEND-009 | `src/lib/recommend/score.ts:computeAvailability` (변경 없음) | `score.test.ts` 기존 `personal 일정은 무시` / `system_lecture 오버랩` / `unavailable 오버랩` 테스트 (보존) |

---

## 10. 문서 영향 (Documentation Impact)

본 SPEC의 sync phase(SPEC-RECOMMEND-001 적용 직후 `/moai sync` 실행)에서 다음 문서를 동기화한다. 본 spec.md 작성 단계에서는 어떤 외부 문서도 수정하지 않는다.

1. **`.moai/project/product.md`**:
   - §F-202 "AI 강사 추천 ✅"의 "AI" 어휘 제거 검토 ("강사 추천 ✅"). 단, 후속 SPEC에서 AI 사유 재활성화 시 되돌릴 수 있도록 변경 이력을 product.md HISTORY 또는 §F-202 본문 각주에 기록.
   - §5 KPI "강사 추천 1순위 채택률 ≥ 60%"는 문구 보존(KPI 산출식 자체가 변경되지 않음). 단, 정책 변경 시점 마커(2026-04-28 SPEC-RECOMMEND-001 적용)를 메모로 추가.
2. **`.moai/specs/SPEC-PROJECT-001/spec.md`**: 변경 금지(closed SPEC). 본 SPEC이 정책 분기 단일 출처가 됨.
3. **`src/lib/recommend/score.ts:rankTopN` 상단 docstring + `@MX:ANCHOR`**: tier sort 정책 + `@MX:SPEC: SPEC-RECOMMEND-001` 추가 (sync phase에서 갱신).
4. **`src/lib/recommend/engine.ts` 상단 `@MX:ANCHOR`**: `@MX:SPEC` 라인에 SPEC-RECOMMEND-001 추가 — 사유 생성기 비활성화 정책의 진입점.
5. **`src/app/(app)/(operator)/projects/[id]/actions.ts:runRecommendationAction` 상단**: `@MX:NOTE: SPEC-RECOMMEND-001 — buildClaudeReasonGenerator 호출 비활성` 신규 추가.
6. **`src/components/projects/recommendation-panel.tsx` 상단 주석**: SPEC 참조 라인에 SPEC-RECOMMEND-001 추가.
7. **CHANGELOG**: SPEC-RECOMMEND-001 적용 항목(정렬 정책 변경 + AI 사유 비활성)을 sync phase에서 기록.

---

## 11. 로컬 검증 노트

본 SPEC 작업은 로컬 supabase 컨테이너(`npx supabase start`) 환경에서 수행한다. DB 마이그레이션이 없으므로 `pnpm db:verify`(SPEC-DB-001 검증 스크립트)는 본 SPEC 적용 전후 동일하게 18/18 PASS를 유지해야 하며, 본 SPEC 자체는 supabase 컨테이너 의존성을 새로 도입하지 않는다.

추천 도메인 단위 테스트(`src/lib/recommend/__tests__/*.test.ts`)는 모두 supabase 의존성 없이 순수 도메인 함수만 검증하므로(REQ-PROJECT-RECOMMEND-008 순수성 보존), 컨테이너 미기동 상태에서도 `pnpm test` 실행이 가능하다. `actions.ts` 통합 테스트는 supabase mock(또는 in-memory client)을 사용하여 컨테이너 의존성을 회피한다.

검증 명령(GREEN 단계 종료 시점):

1. `pnpm typecheck` — 0 type 에러
2. `pnpm test` — 추천 도메인 단위 테스트 + actions 통합 테스트 모두 PASS
3. `pnpm lint` — recommend/projects 도메인 0 warning
4. (선택, DB 변경 없음 검증) `npx supabase start && pnpm db:verify` — 18/18 PASS 유지
5. (선택, 수동 검증) `pnpm dev` 후 `/projects/{id}` 페이지에서 RecommendationPanel UI 변경 사항 시각 확인

---

문서 끝.
