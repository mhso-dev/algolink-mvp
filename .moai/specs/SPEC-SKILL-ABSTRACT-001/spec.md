---
id: SPEC-SKILL-ABSTRACT-001
version: 0.1.0
status: draft
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: null
---

# SPEC-SKILL-ABSTRACT-001: 강사 기술 분류 단순화 (9개 추상 카테고리)

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. 3-tier(large/medium/small) 매우 세분화된 기술 분류 체계를 9개 추상 카테고리(단일 레벨)로 단순화. 동시에 강사 보유 기술의 숙련도(proficiency) 개념을 완전히 제거하여 추천 점수를 보유=1/미보유=0 binary 매칭으로 단순화.
- **Supersede 관계**:
  - **SPEC-DB-001 §2.4 REQ-DB001-SKILL-TAXONOMY**: 3-tier 분류 + leaf-only 매핑 + proficiency enum 정의를 본 SPEC이 supersede. SPEC-DB-001 문서 자체는 수정하지 않으며, 본 SPEC HISTORY로만 supersede 관계 기록.
  - **SPEC-ME-001 §2.4 REQ-ME-SKILL-001 ~ REQ-ME-SKILL-005**: 강사 마이페이지의 large/medium/small Tabs 기반 SkillsPicker UI를 단일 chip 다중선택 UI로 supersede.
  - **SPEC-INSTRUCTOR-001 §2.1 (강사 리스트 필터 부분)**: 3-tier 트리 기반 필터 일부를 9개 카테고리 다중선택 칩 필터로 supersede. callClaude 기반 만족도 요약 로직(REQ-INSTRUCTOR-CLAUDE-*)은 본 SPEC 영향권 밖, 그대로 보존.
- **Frozen by user decision (변경 금지)**: 9개 카테고리 이름·sort_order·UUID 정책, proficiency 완전 제거, 데이터 전체 초기화(TRUNCATE), tier/parent_id 컬럼 자체 제거.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink 플랫폼의 강사 기술 분류 체계를 단순화한다. 기존 `large(대분류) → medium(중분류) → small(소분류)` 3-tier 트리(예: 12 + 30+ + 30+ row)에서 단일 레벨 9개 추상 카테고리로 전환하고, 동시에 강사 기술 매핑에서 숙련도(proficiency) 개념을 완전히 제거하여 추천 매칭 로직을 보유=1/미보유=0 binary로 단순화한다.

본 SPEC은 SPEC-DB-001의 skill taxonomy 부분을 supersede하며, 이미 구현된 SkillsPicker UI(SPEC-ME-001)와 추천 엔진(SPEC-PROJECT-001 §5.4 / SPEC-RECOMMEND-001)에 영향을 주지만, 추천 가중치(0.5/0.3/0.2)와 정렬 정책(`availability desc → finalScore desc → instructorId asc`)은 그대로 보존한다.

### 1.2 배경 (Background)

현재 시드(`supabase/migrations/20260427000070_seed.sql`)는 large 12개, medium 30+개, small 30+개로 구성되어 있고, 강사는 small leaf만 매핑할 수 있도록 트리거(`supabase/migrations/20260427000050_triggers.sql`)로 강제된다. 그러나 운영 과정에서 다음 문제가 드러났다:

1. **분류 불명확성**: large/medium 단계가 강사 본인에게도, 운영자에게도 모호하다. "데이터 분석 vs 데이터 사이언스 vs AI·ML"의 경계가 small 레벨에서는 거의 무의미하게 섞인다.
2. **세분화 비용**: small 레벨이 매우 세분화(예: TensorFlow / PyTorch / Keras 별도)되어 있어 강사 본인이 "이 기술이 어디 들어가는지" 판단하기 어렵고 입력 부담이 크다.
3. **숙련도 효용 부족**: proficiency(beginner/intermediate/advanced 등) 가중치는 자기보고 기반이라 신뢰도가 낮고, 추천 매칭 점수에 노이즈를 더한다. 운영자 인터뷰에서도 "보유 여부만으로 충분"하다는 피드백이 일관되었다.
4. **UI 복잡도**: 3-tier Tabs UI는 모바일에서 특히 깊이감 인지가 어렵고, 입력 완료까지 클릭 횟수가 많다.

이를 단일 레벨 9개 카테고리로 전환하면 강사는 자기 전문 영역을 빠르게 다중 선택할 수 있고, 운영자/추천 엔진 모두 단순한 chip 비교만으로 매칭을 수행한다.

### 1.3 범위 (Scope)

**In Scope:**

- 9개 추상 카테고리(단일 레벨) 시드 정의 및 마이그레이션 적용
- `skill_categories.tier`, `skill_categories.parent_id`, `skillTier` pgEnum 컬럼/타입 자체 제거
- `instructor_skills.proficiency` 컬럼 및 `proficiency` pgEnum 자체 제거
- `instructor_skills`, `project_required_skills` 테이블 TRUNCATE (forward-only reset)
- 추천 엔진의 skillMatch 분자 단순화: `Σ(matched proficiency_weight) / required_count` → `matched_count / required_count`
- SkillsPicker UI를 단일 Card 안의 9개 chip 다중 선택으로 전환
- 강사 리스트 필터(`instructor-list-filters.tsx`)와 프로젝트 생성/편집 폼(`project-create-form.tsx`, `project-edit-form.tsx`)을 동일 chip 다중선택 UI로 통일
- `recommendation-panel.tsx` skill 표기 단순화 (proficiency badge 제거, chip만 노출)
- 영향받는 단위/통합 테스트 갱신 (binary 매칭 기준)

**Out of Scope (Exclusions — What NOT to Build):**

- **추천 가중치 변경**: `{skill: 0.5, availability: 0.3, satisfaction: 0.2}`는 SPEC-PROJECT-001 §5.4 FROZEN. 본 SPEC은 분자 계산 방식만 변경.
- **정렬 정책 변경**: `availability desc → finalScore desc → instructorId asc` (SPEC-RECOMMEND-001) 그대로 유지.
- **callClaude / Claude API 통합**: `src/lib/ai/claude.ts` 및 SPEC-INSTRUCTOR-001의 강사 만족도 요약 로직은 무관하게 보존.
- **AI 추천 사유(rationale) 텍스트 생성**: SPEC-RECOMMEND-001의 `source="fallback"`/`model="fallback"` 정책 유지. AI 사유 활성화는 별도 SPEC.
- **과거 추천 기록 삭제**: `ai_instructor_recommendations.top3_jsonb`는 forward-only로 보존 (DELETE/UPDATE 금지).
- **기존 강사 기술 데이터 마이그레이션**: 기존 small leaf 매핑을 새 카테고리로 best-effort 변환하지 않는다. 강사가 새 카테고리로 재선택하도록 한다.
- **카테고리 추가/수정 UI**: 9개 카테고리는 시드로 고정. 운영자 화면에서 카테고리 CRUD 제공하지 않음.
- **다중 선택 개수 제한**: 강사가 9개 모두 선택해도 시스템적 제한 없음 (UX 가이드만 제공).
- **i18n / 영문 카테고리명**: 한국어 단일. 다국어는 별도 SPEC.

### 1.4 성공 지표 (Success Criteria)

- ✅ `pnpm db:verify` 18/18 PASS (DB 검증 스크립트가 새 스키마와 정합)
- ✅ `skill_categories` 테이블에 정확히 9개 row, `tier`/`parent_id` 컬럼 부재
- ✅ `instructor_skills` 컬럼이 `(instructor_id, skill_id, created_at)`만 존재 (proficiency 부재)
- ✅ `pnpm typecheck` 0 error, `pnpm lint` warning 0
- ✅ `pnpm test` 모든 단위/통합 테스트 PASS
- ✅ 강사가 9개 chip을 다중 선택 후 저장 → 새로고침 시 선택 상태 정확 복원
- ✅ 운영자가 새 프로젝트의 required_skills를 9개 chip 중에서 선택 → 추천 실행 시 매칭 강사 Top-3가 binary 점수로 산출되어 노출
- ✅ `ai_instructor_recommendations` 과거 row 보존 확인 (DELETE 0건)
- ✅ callClaude export 활성, SPEC-INSTRUCTOR-001 강사 만족도 요약 회귀 없음

---

## 2. 도메인 모델 (Domain Model)

### 2.1 9개 카테고리 표준안 (Frozen)

| sort_order | 이름 (Korean) | UUID 리터럴 |
|------------|---------------|-------------|
| 1 | 데이터 분석 | `30000000-0000-0000-0000-000000000001` |
| 2 | 데이터 사이언스 | `30000000-0000-0000-0000-000000000002` |
| 3 | AI·ML | `30000000-0000-0000-0000-000000000003` |
| 4 | 백엔드 | `30000000-0000-0000-0000-000000000004` |
| 5 | 프론트엔드 | `30000000-0000-0000-0000-000000000005` |
| 6 | 풀스택 | `30000000-0000-0000-0000-000000000006` |
| 7 | 모바일 | `30000000-0000-0000-0000-000000000007` |
| 8 | 인프라·DevOps | `30000000-0000-0000-0000-000000000008` |
| 9 | 클라우드 | `30000000-0000-0000-0000-000000000009` |

UUID prefix `30`은 기존 large(`10`)/medium(`11`)/small(`12`) prefix와 충돌하지 않음. idempotent seed(`ON CONFLICT (id) DO NOTHING` 또는 `ON CONFLICT DO UPDATE` 패턴) 적용.

### 2.2 신규 테이블 구조

**`skill_categories` (after migration)**

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | uuid PK | 위 9개 UUID 고정 |
| `name` | text NOT NULL UNIQUE | 위 표 이름 |
| `sort_order` | integer NOT NULL | 1~9 |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | |

제거 대상: `tier`, `parent_id`, `unique(tier, parent_id, name)`, `idx_skill_categories_tier`, `idx_skill_categories_parent`, leaf-only enforcement 트리거.

**`instructor_skills` (after migration)**

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `instructor_id` | uuid FK → instructors.id ON DELETE CASCADE | PK 일부 |
| `skill_id` | uuid FK → skill_categories.id ON DELETE CASCADE | PK 일부 |
| `created_at` | timestamptz default now() | |

PK는 `(instructor_id, skill_id)` 복합. `proficiency` 컬럼 제거.

**`project_required_skills`**: 컬럼 변경 없음. FK는 그대로 `skill_categories.id`를 참조 (자동으로 9개 카테고리 중 하나).

### 2.3 제거 대상 enum

- `proficiency` pgEnum (`src/db/enums.ts`): export, type, DB type 모두 제거. `DROP TYPE IF EXISTS proficiency CASCADE`.
- `skillTier` pgEnum (`src/db/enums.ts`): export, type, DB type 모두 제거. `DROP TYPE IF EXISTS skill_tier CASCADE`.

두 enum을 import하는 모든 코드 경로는 본 SPEC의 변경 범위 안에서 모두 제거 또는 대체된다.

---

## 3. 요구사항 (EARS Requirements)

### 3.1 카테고리 데이터 모델

- **REQ-SKILL-CATEGORY-001 (Ubiquitous)**: `skill_categories` 테이블은 단일 레벨 9개 row만 보유한다. `tier` 컬럼과 `parent_id` 컬럼이 존재하지 않는다.
- **REQ-SKILL-CATEGORY-002 (Ubiquitous)**: `skill_categories`의 정확한 9개 항목은 §2.1 표 그대로(이름·sort_order·UUID)이다. UUID는 idempotent 시드 키로 사용한다.
- **REQ-SKILL-CATEGORY-003 (Ubiquitous)**: `skill_categories.name`에 UNIQUE 제약이 적용된다. `unique(tier, parent_id, name)` 복합 제약은 제거된다.
- **REQ-SKILL-CATEGORY-004 (Unwanted Behavior)**: skill_tier pgEnum과 leaf-only enforcement 트리거는 DB에 존재하지 않는다. `pg_type`/`pg_trigger` 조회 시 부재가 보장된다.

### 3.2 강사 기술 매핑

- **REQ-SKILL-INSTRUCTOR-MAP-001 (Ubiquitous)**: `instructor_skills`는 PK `(instructor_id, skill_id)`를 갖는다. 동일 강사가 같은 카테고리를 두 번 보유할 수 없다.
- **REQ-SKILL-INSTRUCTOR-MAP-002 (Ubiquitous)**: `instructor_skills`에 `proficiency` 컬럼이 존재하지 않는다. `information_schema.columns` 조회 시 부재가 보장된다.
- **REQ-SKILL-INSTRUCTOR-MAP-003 (Event-Driven)**: 강사가 `/me/resume` 또는 `/instructors/new` 폼에서 9개 chip 중 N개를 선택하고 저장 버튼을 누르면, 시스템은 해당 강사의 기존 row 전부 삭제 후 새 선택을 INSERT 한다 (full-replace upsert).
- **REQ-SKILL-INSTRUCTOR-MAP-004 (Event-Driven)**: 강사가 같은 카테고리를 UI에서 두 번 토글하면, 시스템은 두 번째 토글에서 해당 chip을 비선택 상태로 되돌린다 (UI는 set-based selection).

### 3.3 프로젝트 필수 기술

- **REQ-SKILL-PROJECT-MAP-001 (Ubiquitous)**: `project_required_skills`는 `(project_id, skill_id)` 매핑을 보존한다. FK 대상은 새 9개 카테고리 중 하나이다.
- **REQ-SKILL-PROJECT-MAP-002 (Event-Driven)**: 운영자가 새 프로젝트 생성 폼에서 9개 chip 중 N개를 선택하고 저장하면, 시스템은 해당 프로젝트의 `project_required_skills` row를 새 선택으로 full-replace 한다.

### 3.4 추천 매칭 (Binary)

- **REQ-SKILL-MATCH-BINARY-001 (Ubiquitous)**: `computeSkillMatch(instructorSkills, requiredSkillIds)`는 `requiredSkillIds`에 포함된 카테고리 중 강사가 보유한 개수를 분자로, `requiredSkillIds.length`를 분모로 하는 비율(0.0~1.0)을 반환한다.
- **REQ-SKILL-MATCH-BINARY-002 (Ubiquitous)**: 매칭 계산에 proficiency 가중치(또는 `PROFICIENCY_WEIGHT` 상수)를 사용하지 않는다. 보유=1, 미보유=0이다.
- **REQ-SKILL-MATCH-EMPTY (Ubiquitous)**: `requiredSkillIds.length === 0`인 경우 `computeSkillMatch`는 `0`을 반환한다 (현행 동작 보존).
- **REQ-SKILL-MATCH-DUPLICATE (Unwanted Behavior)**: 강사가 동일 카테고리를 중복 보유할 수 없으므로 (REQ-SKILL-INSTRUCTOR-MAP-001), 분자가 `requiredSkillIds.length`를 초과하지 않는다.

### 3.5 추천 엔진 보존

- **REQ-SKILL-RECOMMEND-PRESERVE-001 (Ubiquitous)**: 추천 가중치는 `skillMatch * 0.5 + availability * 0.3 + satisfaction * 0.2`로 보존된다 (SPEC-PROJECT-001 §5.4 FROZEN).
- **REQ-SKILL-RECOMMEND-PRESERVE-002 (Ubiquitous)**: `rankTopN`의 정렬은 `availability desc → finalScore desc → instructorId asc`로 보존된다 (SPEC-RECOMMEND-001).
- **REQ-SKILL-RECOMMEND-PRESERVE-003 (Ubiquitous)**: `availability` 및 `satisfaction` 점수 산출 로직은 변경하지 않는다.
- **REQ-SKILL-RECOMMEND-PRESERVE-004 (Ubiquitous)**: 추천 후보의 `source`/`model` 필드는 SPEC-RECOMMEND-001 정책에 따라 `fallback`을 유지한다.

### 3.6 마이그레이션 / 데이터 초기화

- **REQ-SKILL-MIGRATION-RESET (Event-Driven)**: 본 SPEC의 마이그레이션 적용 시, 시스템은 `instructor_skills` 및 `project_required_skills` 테이블을 TRUNCATE 한 후, `skill_categories`를 새 9개 row로 교체한다.
- **REQ-SKILL-MIGRATION-FORWARD-ONLY (Unwanted Behavior)**: 마이그레이션은 `ai_instructor_recommendations` 테이블의 row를 삭제·갱신하지 않는다. 과거 추천 결과는 그대로 보존된다.
- **REQ-SKILL-MIGRATION-IDEMPOTENT (Event-Driven)**: 동일 마이그레이션을 재실행해도 9개 row 결과가 변하지 않는다 (`ON CONFLICT (id)` 처리).
- **REQ-SKILL-ENUM-REMOVAL (Unwanted Behavior)**: 마이그레이션 완료 후 `proficiency` 및 `skill_tier` pgEnum이 DB에서 제거되어 있다. TypeScript 코드에서 두 enum을 import하는 경로는 모두 제거되어 컴파일이 성공한다.

### 3.7 UI 단순화

- **REQ-SKILL-UI-SIMPLE-001 (Event-Driven)**: 사용자가 `SkillsPicker` 컴포넌트를 렌더할 때, 시스템은 단일 Card 안에 9개 chip을 sort_order 순으로 표시한다. Tabs(large/medium/small), 검색 입력, medium 그룹 헤더는 표시되지 않는다.
- **REQ-SKILL-UI-SIMPLE-002 (Event-Driven)**: 사용자가 chip을 클릭하면, 시스템은 해당 카테고리 ID를 선택 상태(set)에 toggle in/out 하고 시각적 active 상태(예: `data-selected=true`)를 갱신한다.
- **REQ-SKILL-UI-SIMPLE-003 (Ubiquitous)**: SkillsPicker는 proficiency select/배지/슬라이더를 포함하지 않는다.
- **REQ-SKILL-UI-FILTERS (Event-Driven)**: 운영자가 `/instructors` 리스트 필터 UI를 사용할 때, 시스템은 동일한 9개 chip 다중선택 컴포넌트를 노출하고, 선택된 카테고리를 ANY-match 필터로 적용한다.
- **REQ-SKILL-UI-PROJECT (Event-Driven)**: 운영자가 새 프로젝트 생성/편집 폼의 required_skills 섹션을 사용할 때, 시스템은 동일한 9개 chip 다중선택 컴포넌트를 노출한다.
- **REQ-SKILL-UI-RECOMMEND (Event-Driven)**: `recommendation-panel.tsx`가 추천 결과를 렌더할 때, 시스템은 강사의 보유 카테고리만 chip으로 표시하고 proficiency 배지를 표시하지 않는다.

### 3.8 코드 보존 / 비파괴

- **REQ-SKILL-CLAUDE-PRESERVE (Unwanted Behavior)**: `src/lib/ai/claude.ts`의 `callClaude` export는 본 SPEC 변경에 의해 제거되거나 시그니처 변경되지 않는다. SPEC-INSTRUCTOR-001의 강사 만족도 요약 회귀를 야기하지 않는다.
- **REQ-SKILL-RECOMMEND-PANEL-TEXT (Unwanted Behavior)**: `recommendation-panel-text.test.ts`가 검증하는 텍스트 출력 규칙(`source="fallback"`, `model="fallback"` 표기 등 SPEC-RECOMMEND-001 계약)은 본 SPEC에 의해 변경되지 않는다.

### 3.9 추적성 (MX 태그)

- **REQ-SKILL-MX-TAG (State-Driven)**: 본 SPEC 범위에서 변경되거나 새로 작성된 anchor 함수(예: `computeSkillMatch`, `loadSkillCategories`, `SkillsPicker` default export, instructor 폼 server action)에는 `@MX:SPEC: SPEC-SKILL-ABSTRACT-001` 태그를 추가한다. 기존 SPEC 태그가 있다면 함께 유지한다 (다중 SPEC 태그 허용).

---

## 4. 영향 분석 (Impact Analysis)

### 4.1 변경 파일 목록 (이미 식별됨)

**DB / 스키마:**
- `src/db/enums.ts` — `proficiency`, `skillTier` pgEnum 제거
- `src/db/schema/skill-taxonomy.ts` — `tier`/`parent_id` 컬럼 제거, `proficiency` 컬럼 제거, 인덱스/UNIQUE 갱신
- `src/db/schema/project-required-skills.ts` — 변경 없음(검증만)

**마이그레이션:**
- `supabase/migrations/20260427000030_initial_schema.sql` — 신규 마이그레이션이 모두 덮어쓰므로 직접 수정하지 않고, 새 forward 마이그레이션 파일에서 ALTER/DROP 처리
- `supabase/migrations/20260427000050_triggers.sql` — leaf-only enforcement 트리거 DROP
- `supabase/migrations/20260427000070_seed.sql` — 신규 마이그레이션이 새 시드로 교체
- `supabase/migrations/20260427000090_project_required_skills.sql` — FK 대상 무결성 검증
- `supabase/migrations/20260428000020_e2e_seed_phase2.sql` — 새 카테고리 ID 기반으로 갱신
- (신규) `supabase/migrations/2026042900XXXX_skill_abstract.sql` — TRUNCATE + DROP COLUMN/TYPE/TRIGGER + 새 9개 시드

**도메인 로직:**
- `src/lib/instructor/skill-tree.ts` — 트리 구성 로직을 단순 list 로딩으로 단순화
- `src/lib/instructor/skill-queries.ts` — large/medium 조회 헬퍼 제거
- `src/lib/instructor/queries.ts` — 강사 skill 매핑 조회/저장 함수에서 proficiency 제거
- `src/lib/instructor/types.ts` — `InstructorSkillInput.proficiency` 필드 제거
- `src/lib/recommend/score.ts` — `computeSkillMatch` 분자 단순화
- `src/lib/recommend/engine.ts` — proficiency 의존 제거 (있을 시)
- `src/lib/recommend/types.ts` — `PROFICIENCY_WEIGHT` 상수 제거
- `src/lib/validation/instructor.ts` — proficiency Zod schema 필드 제거
- `src/lib/validation/project.ts` — required_skills 스키마는 그대로 (FK 대상만 9개 카테고리로 좁힘)

**UI:**
- `src/components/instructor/skills-picker.tsx` — 9개 chip 단일 Card UI로 재작성
- `src/components/instructor/instructor-form.tsx` — proficiency select 제거, SkillsPicker props 정합
- `src/components/instructor/instructor-list-filters.tsx` — 9개 chip 다중선택 필터로 단순화
- `src/components/instructor/instructor-list-table.tsx` — 컬럼 표시에서 proficiency 제거
- `src/components/projects/project-create-form.tsx` — 9개 chip 다중선택 컴포넌트 사용
- `src/components/projects/project-edit-form.tsx` — 동일
- `src/components/projects/recommendation-panel.tsx` — 강사 chip만 표시, proficiency 제거
- `src/components/resume/resume-form.tsx` — proficiency 입력 제거
- `src/components/instructor/me-resume-form.tsx` — proficiency 입력 제거

**페이지/Server Action:**
- `src/app/(app)/(operator)/projects/new/page.tsx` + `actions.ts` — 9개 카테고리 로딩, proficiency 제거
- `src/app/(app)/(operator)/projects/[id]/edit/page.tsx` + `actions.ts` — 동일
- `src/app/(app)/(operator)/projects/[id]/actions.ts` — recommend 트리거에서 변경 없음 (binary 점수 자동 적용)
- `src/app/(app)/(operator)/instructors/new/actions.ts` — proficiency 입력 제거
- `src/app/(app)/(operator)/instructors/page.tsx` — 필터 props 갱신
- `src/app/(app)/(instructor)/me/resume/page.tsx` + `actions.ts` — proficiency 입력 제거

**테스트:**
- `src/lib/recommend/__tests__/score.test.ts` — binary 매칭 케이스로 갱신
- `src/lib/recommend/__tests__/engine.test.ts` — 정렬/가중치 보존 검증 + binary 매칭 통합
- `src/lib/recommend/__tests__/recommendation-panel-text.test.ts` — proficiency 표기 케이스 제거
- `src/lib/recommend/__tests__/action-integration.test.ts` — 9개 카테고리 시드 기반 fixture
- `src/lib/validation/__tests__/me-resume.test.ts` — proficiency 필드 제거
- `src/lib/validation/__tests__/project.test.ts` — required_skills 검증 갱신
- `src/app/(app)/(operator)/projects/__tests__/integration.test.ts` — 9개 카테고리 기반 추천 흐름

### 4.2 정합성 보장 (Related SPECs)

| SPEC | 영향 | 본 SPEC의 처리 |
|------|------|---------------|
| SPEC-DB-001 (completed) | §2.4 supersede | 문서 비변경. 본 SPEC HISTORY에만 기록 |
| SPEC-PROJECT-001 (completed) | §5.4 가중치 FROZEN | 가중치 변경 없음. skillMatch 분자만 binary화. KPI 산출식·top3_jsonb 인덱스 비교 보존 |
| SPEC-RECOMMEND-001 (draft) | 정렬 정책 보존 | 변경 없음. score scale 변동만 acceptance에 명시 |
| SPEC-INSTRUCTOR-001 (completed) | 리스트 필터 UI 단순화 | 9개 카테고리 chip 필터로 supersede. callClaude 보존 |
| SPEC-ME-001 (completed) | SkillsPicker UI 단순화 | 단일 chip 다중선택으로 supersede |

### 4.3 추천 점수 분포 변동 (정성 분석)

기존: `skillMatch ∈ [0, 1]`, 분자가 proficiency_weight 합이라 동일 매칭 강사 간 점수 차이가 생김.
이후: `skillMatch ∈ {0, 1/N, 2/N, ..., N/N}` (N = required_count). 분자가 정수이므로 동점 강사가 늘어날 수 있다.

→ 동점 발생 시 정렬 tiebreaker(`availability desc → finalScore desc → instructorId asc`)가 그대로 결정. SPEC-RECOMMEND-001 정책에 부합하므로 회귀 아님.

---

## 5. 수용 기준 요약 (Summary)

상세 시나리오는 `acceptance.md`에 Given-When-Then 형식으로 정의한다. 핵심 9개:

- AC-1 `pnpm db:verify` 18/18 PASS
- AC-2 skill_categories 9 row, tier/parent_id 컬럼 부재
- AC-3 instructor_skills 컬럼 (instructor_id, skill_id, created_at)
- AC-4 강사 chip 다중선택 후 새로고침 시 선택 유지
- AC-5 운영자 프로젝트 생성 → 추천 Top-3 노출
- AC-6 모든 추천 후보 source="fallback" + model="fallback"
- AC-7 typecheck 0 error / test PASS / lint warning 0
- AC-8 ai_instructor_recommendations 과거 row 보존 (DELETE 0)
- AC-9 callClaude 활성, SPEC-INSTRUCTOR-001 회귀 없음

---

## 6. 관련 문서 (References)

- `.moai/specs/SPEC-DB-001/spec.md` (§2.4 supersede 대상)
- `.moai/specs/SPEC-PROJECT-001/spec.md` (§5.4 FROZEN 가중치)
- `.moai/specs/SPEC-RECOMMEND-001/spec.md` (정렬 정책)
- `.moai/specs/SPEC-INSTRUCTOR-001/spec.md` (리스트 필터, callClaude 보존)
- `.moai/specs/SPEC-ME-001/spec.md` (SkillsPicker UI)
- `supabase/migrations/20260427000050_triggers.sql` (leaf-only 트리거 — 제거 대상)
- `supabase/migrations/20260427000070_seed.sql` (기존 3-tier 시드 — 교체 대상)
- `src/db/enums.ts` (`proficiency`, `skillTier` — 제거 대상)
- `src/lib/recommend/score.ts` (`computeSkillMatch` — 단순화 대상)
- `src/components/instructor/skills-picker.tsx` (UI — 재작성 대상)
