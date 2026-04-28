# SPEC-SKILL-ABSTRACT-001 — Task Decomposition

**SPEC**: SPEC-SKILL-ABSTRACT-001
**Methodology**: TDD (RED-GREEN-REFACTOR)
**Harness Level**: standard
**Total atomic tasks**: 18

각 task는 단일 TDD RED-GREEN-REFACTOR 사이클 내에서 완결된다. Phase 의존성은 plan.md §4 마일스톤 순서 준수.

---

## Task Summary Matrix

| Task ID | Description | Requirement | Dependencies | Planned Files | Status |
|---------|-------------|-------------|--------------|---------------|--------|
| T-01 | scripts/db-verify.ts에 새 검증 케이스 추가 (RED) | REQ-SKILL-CATEGORY-001~004, REQ-SKILL-INSTRUCTOR-MAP-002, REQ-SKILL-ENUM-REMOVAL | - | scripts/db-verify.ts | pending |
| T-02 | src/db/enums.ts에서 proficiency, skillTier pgEnum 제거 | REQ-SKILL-ENUM-REMOVAL | T-01 | src/db/enums.ts | pending |
| T-03 | src/db/schema/skill-taxonomy.ts: tier/parent_id/proficiency 컬럼 제거 + UNIQUE 변경 | REQ-SKILL-CATEGORY-001~003, REQ-SKILL-INSTRUCTOR-MAP-001~002 | T-02 | src/db/schema/skill-taxonomy.ts | pending |
| T-04 | 신규 forward 마이그레이션 SQL 작성 (TRUNCATE + DROP COL/TYPE/TRIGGER + 9 row INSERT) | REQ-SKILL-MIGRATION-RESET, REQ-SKILL-MIGRATION-IDEMPOTENT, REQ-SKILL-CATEGORY-002 | T-03 | supabase/migrations/2026042900XXXX_skill_abstract.sql (NEW) | pending |
| T-05 | e2e seed (20260428000020_e2e_seed_phase2.sql) 새 9개 카테고리 UUID로 갱신 + supabase-types.ts 재생성 | REQ-SKILL-MIGRATION-RESET | T-04 | supabase/migrations/20260428000020_e2e_seed_phase2.sql, src/db/supabase-types.ts | pending |
| T-06 | score.test.ts: binary 매칭 테스트 케이스로 갱신 (RED) | REQ-SKILL-MATCH-BINARY-001~002, REQ-SKILL-MATCH-EMPTY, REQ-SKILL-MATCH-DUPLICATE | T-05 | src/lib/recommend/__tests__/score.test.ts | pending |
| T-07 | recommend/types.ts + score.ts: PROFICIENCY_WEIGHT 제거, computeSkillMatch binary화 (GREEN) | REQ-SKILL-MATCH-BINARY-001~002, REQ-SKILL-RECOMMEND-PRESERVE-001~003 | T-06 | src/lib/recommend/types.ts, src/lib/recommend/score.ts | pending |
| T-08 | skill-tree.ts + skill-queries.ts: 3-tier 트리 로직 단순화, loadAllSkillCategories 단일 함수 | REQ-SKILL-CATEGORY-001 | T-07 | src/lib/instructor/skill-tree.ts, src/lib/instructor/skill-queries.ts, src/lib/instructor/__tests__/skill-tree.test.ts | pending |
| T-09 | instructor/queries.ts + types.ts: upsertInstructorSkills 시그니처에서 proficiency 제거 | REQ-SKILL-INSTRUCTOR-MAP-003 | T-07 | src/lib/instructor/queries.ts, src/lib/instructor/types.ts | pending |
| T-10 | validation 스키마 갱신 (instructor.ts, project.ts) | REQ-SKILL-INSTRUCTOR-MAP-003, REQ-SKILL-PROJECT-MAP-002 | T-07 | src/lib/validation/instructor.ts, src/lib/validation/project.ts, src/lib/validation/__tests__/me-resume.test.ts, src/lib/validation/__tests__/project.test.ts | pending |
| T-11 | SkillsPicker 재작성 (단일 Card 9 chip controlled API) | REQ-SKILL-UI-SIMPLE-001~003 | T-08, T-09 | src/components/instructor/skills-picker.tsx | pending |
| T-12 | instructor-form / me-resume-form: proficiency 입력 제거, SkillsPicker 통합 | REQ-SKILL-UI-SIMPLE-003, REQ-SKILL-INSTRUCTOR-MAP-003 | T-11 | src/components/instructor/instructor-form.tsx, src/components/instructor/me-resume-form.tsx, src/components/resume/resume-form.tsx | pending |
| T-13 | instructor-list-filters / list-table: 9 chip 다중선택 + proficiency 컬럼 제거 | REQ-SKILL-UI-FILTERS | T-11 | src/components/instructor/instructor-list-filters.tsx, src/components/instructor/instructor-list-table.tsx | pending |
| T-14 | project-create/edit-form + recommendation-panel: 9 chip + proficiency 배지 제거 | REQ-SKILL-UI-PROJECT, REQ-SKILL-UI-RECOMMEND | T-11 | src/components/projects/project-create-form.tsx, src/components/projects/project-edit-form.tsx, src/components/projects/recommendation-panel.tsx | pending |
| T-15 | operator instructors/new actions + me/resume actions: proficiency 입력 제거 | REQ-SKILL-INSTRUCTOR-MAP-003 | T-09, T-12 | src/app/(app)/(operator)/instructors/new/actions.ts, src/app/(app)/(instructor)/me/resume/actions.ts, src/app/(app)/(instructor)/me/resume/page.tsx, src/app/(app)/(operator)/instructors/page.tsx | pending |
| T-16 | operator projects new/edit page+actions: 9 chip + tier filter 제거 | REQ-SKILL-PROJECT-MAP-002, REQ-SKILL-UI-PROJECT | T-10, T-14 | src/app/(app)/(operator)/projects/new/page.tsx, src/app/(app)/(operator)/projects/new/actions.ts, src/app/(app)/(operator)/projects/[id]/edit/page.tsx, src/app/(app)/(operator)/projects/[id]/edit/actions.ts | pending |
| T-17 | projects/[id]/actions.ts: skillsByInstructor 수집에서 proficiency 제거 + integration test 갱신 | REQ-SKILL-MATCH-BINARY-001, REQ-SKILL-RECOMMEND-PRESERVE-001~004, REQ-SKILL-RECOMMEND-PANEL-TEXT | T-16 | src/app/(app)/(operator)/projects/[id]/actions.ts, src/app/(app)/(operator)/projects/__tests__/integration.test.ts, src/lib/recommend/__tests__/action-integration.test.ts | pending |
| T-18 | engine.test + recommendation-panel-text 회귀 검증 + Phase 6 최종 검증 + MX 태그 부착 | REQ-SKILL-RECOMMEND-PRESERVE-002, REQ-SKILL-RECOMMEND-PANEL-TEXT, REQ-SKILL-CLAUDE-PRESERVE, REQ-SKILL-MX-TAG, REQ-SKILL-MIGRATION-FORWARD-ONLY | T-17 | src/lib/recommend/__tests__/engine.test.ts, src/lib/recommend/__tests__/recommendation-panel-text.test.ts, MX 태그 부착 anchor 함수들 | pending |

---

## Task Detail

### T-01 — db-verify.ts에 새 검증 케이스 추가 (RED)

**Phase**: 1 (DB)
**TDD cycle**:
- **RED**: 다음 검증 케이스를 scripts/db-verify.ts에 추가하고, 기존 `tier='large'` 검사 케이스(AC-DB001-SKILL-01~03)를 갱신한다. 현재 마이그레이션 적용 상태에서 `pnpm db:verify` 실행 → FAIL 확인.
  - skill_categories 정확히 9 row + 9개 UUID/이름/sort_order 일치
  - skill_categories에 tier, parent_id 컬럼 부재 (information_schema)
  - instructor_skills에 proficiency 컬럼 부재
  - pg_type에 proficiency, skill_tier enum 부재
  - leaf-only enforcement 트리거 부재
- **GREEN**: 후속 task에서 마이그레이션이 적용되면 PASS 전환.
- **REFACTOR**: 기존/새 케이스 정렬, 출력 메시지 정합성.

**Acceptance**: db-verify.ts 변경분 컴파일 통과 + 현재 스키마에서 새 케이스 FAIL 출력.
**Risk**: 기존 케이스 갱신 누락 시 마이그레이션 적용 후 SQL 에러로 verify 실패.

---

### T-02 — src/db/enums.ts에서 proficiency, skillTier pgEnum 제거

**Phase**: 1
**TDD cycle**:
- **RED**: 본 변경 자체가 PROFICIENCY_WEIGHT (T-07까지 미해결) 등 import 의존성을 끊는다. typecheck 실패 발생 → 의존성 그래프 검증.
- **GREEN**: 두 export 라인 제거.
- **REFACTOR**: 관련 주석 정리.

**Acceptance**: enums.ts에서 두 pgEnum export 부재.
**Risk**: 동일 PR 내에서 T-03~T-10이 함께 적용되지 않으면 typecheck 광범위 실패. T-02부터 T-10은 단일 commit/PR로 함께 적용 권장.

---

### T-03 — skill-taxonomy.ts: tier/parent_id/proficiency 컬럼 + UNIQUE 변경

**Phase**: 1
**TDD cycle**:
- **RED**: db-verify.ts (T-01) 갱신 케이스가 ts schema와 정합 가능 여부 검증.
- **GREEN**: skillCategories에서 tier, parentId 컬럼 정의 제거 + idx_skill_categories_tier/parent 제거 + `unique(tier, parent_id, name)` → `unique(name)`. instructorSkills에서 proficiency 컬럼 제거.
- **REFACTOR**: 주석 갱신, FK 정의 검증.

**Acceptance**: skill-taxonomy.ts 컴파일 통과 + drizzle-kit check 통과 (스키마와 마이그 정합 — T-04 적용 후 실제 정합).
**Risk**: drizzle 자동 생성 파일과 수동 마이그 파일 간 sync 깨짐. T-04 완료 후 drizzle-kit check 실행 권장.

---

### T-04 — 신규 forward 마이그레이션 SQL 작성

**Phase**: 1
**TDD cycle**:
- **RED**: `npx supabase db reset` 시 새 SQL이 누락된 상태에서 db-verify FAIL 유지.
- **GREEN**: `supabase/migrations/2026042900XXXX_skill_abstract.sql` 생성. 단계 A→H 순서:
  - A: TRUNCATE instructor_skills, project_required_skills
  - B: DROP TRIGGER IF EXISTS enforce_skill_leaf_only ON instructor_skills (또는 trigger 함수까지 DROP); DROP TRIGGER IF EXISTS (project_required_skills의 leaf-only check trigger)
  - C: ALTER TABLE skill_categories DROP COLUMN tier, DROP COLUMN parent_id (CASCADE 필요 시)
  - D: ALTER TABLE instructor_skills DROP COLUMN proficiency
  - E: DROP TYPE IF EXISTS proficiency CASCADE; DROP TYPE IF EXISTS skill_tier CASCADE
  - F: DROP INDEX IF EXISTS idx_skill_categories_tier, idx_skill_categories_parent
  - G: DELETE FROM skill_categories; INSERT 9 row WITH UUID 고정 + ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order
  - H: ALTER TABLE skill_categories DROP CONSTRAINT uq_skill_categories_tier_parent_name; ADD CONSTRAINT uq_skill_categories_name UNIQUE(name)
- **REFACTOR**: 단계별 주석, idempotent 검증을 위해 동일 SQL 두 번 실행해도 결과 동일한지 확인.

**Acceptance**: `npx supabase db reset && pnpm db:verify` 18/18 PASS (또는 갱신된 N/N PASS).
**Risk**:
- TRUNCATE 누락 시 DROP COLUMN이 FK CASCADE로 막힐 수 있음 → 단계 A를 반드시 C/D 앞에 배치.
- supabase/migrations/20260427000090_project_required_skills.sql의 leaf-only check trigger를 단계 B에서 함께 DROP 필요. 이 SQL 파일은 직접 수정하지 않고 새 forward 마이그에서 DROP.

---

### T-05 — e2e seed 갱신 + supabase-types.ts 재생성

**Phase**: 1
**TDD cycle**:
- **RED**: e2e seed가 기존 small UUID(예: `12000000-...`) 참조 시 새 카테고리 UUID와 불일치로 FK 위반 → `db reset` 실패.
- **GREEN**:
  1. 20260428000020_e2e_seed_phase2.sql에서 small leaf UUID 참조를 새 9개 카테고리 UUID로 교체.
  2. instructor_skills/project_required_skills INSERT문에서 proficiency 컬럼 제거.
  3. `npx supabase gen types typescript --local > src/db/supabase-types.ts` 실행하여 자동 생성 타입 재생성 (proficiency, skill_tier enum 제거 반영).
- **REFACTOR**: 주석에 새 UUID 매핑 표 추가.

**Acceptance**: `npx supabase db reset` 무오류 + supabase-types.ts에 proficiency/skill_tier enum 부재 + grep "skill_tier" src/db/supabase-types.ts → 0 hit.
**Risk**: supabase-types.ts 자동 생성 명령이 로컬 supabase 인스턴스 의존. 인스턴스 미실행 시 수동 타입 편집 필요.

---

### T-06 — score.test.ts: binary 매칭 테스트 (RED)

**Phase**: 2
**TDD cycle**:
- **RED**: 기존 테스트(`computeSkillMatch: 2/2 매칭 (expert+advanced)` 등 proficiency 가중치 의존 케이스)를 binary 케이스로 전면 갱신. 새 케이스:
  - 케이스 A: required=[c1,c2,c3], 강사=[c1,c2] → 2/3 ≈ 0.6667
  - 케이스 B: required=[], 강사=[c1] → 0
  - 케이스 C: required=[c1], 강사=[] → 0
  - 케이스 D: required=[c1,c2], 강사=[c1,c2,c3] → 1.0 (cap)
  - 케이스 E (deduplicate): 강사 set 기반이므로 분자 ≤ 분모 (REQ-SKILL-MATCH-DUPLICATE)
  - 시그니처 변경: `InstructorSkillInput.proficiency` 필드 부재
- 현재 score.ts 코드(PROFICIENCY_WEIGHT 사용)에서는 컴파일 또는 assertion FAIL → RED 확정.
- **GREEN**: T-07에서 score.ts 변경.
- **REFACTOR**: 테스트 헬퍼 정리.

**Acceptance**: pnpm test:unit src/lib/recommend/__tests__/score.test.ts → 새 케이스 컴파일은 가능하지만 assertion FAIL 상태.
**Risk**: typecheck도 FAIL (Proficiency 타입 import 의존). T-07과 동시 적용 권장.

---

### T-07 — recommend/types.ts + score.ts: binary 단순화 (GREEN)

**Phase**: 2
**TDD cycle**:
- **RED**: T-06 테스트 FAIL 상태 유지.
- **GREEN**:
  - types.ts: `Proficiency` 타입 export 제거, `InstructorSkillInput.proficiency` 필드 제거, `PROFICIENCY_WEIGHT` 상수 제거. WEIGHTS, SATISFACTION_PRIOR는 보존.
  - score.ts: `computeSkillMatch` 시그니처는 유지(`(required, instructorSkills)` → `{score, matchedSkillIds}`). 분자 계산을 `instructorSkillIds.has(reqId) ? 1 : 0` 누적 합으로 변경. PROFICIENCY_WEIGHT import 제거. 빈 required 분기 보존.
  - `computeAvailability`, `computeSatisfaction`, `computeFinalScore`, `scoreCandidate`, `rankTopN`은 변경 없음 (REQ-SKILL-RECOMMEND-PRESERVE-001~003 보존).
- **REFACTOR**: Set<string> 기반 lookup으로 O(N+M) 명시. JSDoc 갱신.

**Acceptance**: pnpm test:unit src/lib/recommend → score.test.ts PASS + engine.test.ts 정렬 정책 회귀 없음.
**Risk**: engine.test.ts가 InstructorSkillInput.proficiency 사용 중 → T-18에서 별도 갱신.

---

### T-08 — skill-tree.ts + skill-queries.ts 단순화

**Phase**: 2
**TDD cycle**:
- **RED**: skill-tree.ts의 buildSkillTree, filterSkillTree, indexSelections, collectSmallSkillIds 함수가 tier 의존 — Phase 1 schema 변경 후 typecheck 실패.
- **GREEN**:
  - skill-tree.ts: 3-tier 빌더 함수 모두 제거. `SkillCategory` 타입 (id, name, sortOrder)만 export. 또는 파일 자체 삭제 후 types를 skill-queries.ts로 이동.
  - skill-queries.ts: `getAllSkillCategories()` 단일 함수로 단순화. tier/parentId 매핑 제거. `getMySkills()` proficiency 필드 제거. 반환 타입 `Array<{ skillId: string }>`.
  - skill-tree.test.ts: 의미 상실하면 삭제, 또는 sort/filter/index 단순 케이스만 유지.
- **REFACTOR**: 호출자 (SkillsPicker, me/resume page) sync 확인.

**Acceptance**: pnpm typecheck 통과. skill-tree.test.ts PASS or 삭제.
**Risk**: SkillsPicker가 buildSkillTree import 중 — T-11에서 동시 갱신.

---

### T-09 — instructor/queries.ts + types.ts: upsertInstructorSkills 시그니처 단순화

**Phase**: 2
**TDD cycle**:
- **RED**: queries.ts에서 instructor_skills SELECT/INSERT 시 proficiency 컬럼 의존. Phase 1 적용 후 SQL 에러 또는 타입 에러.
- **GREEN**:
  - queries.ts: SELECT 절에서 proficiency 제거. `getInstructorDetailForOperator` 등에서 proficiency 미반환. upsert가 있다면 시그니처 `(instructorId: string, skillIds: string[]) => Promise<void>`.
  - types.ts: `InstructorSkillInput.proficiency` 필드 제거.
- **REFACTOR**: skillsMap 빌드 로직 단순화.

**Acceptance**: pnpm typecheck 통과 + 호출자 컴파일 정합.
**Risk**: actions.ts (Phase 4)에서 호출 — 시그니처 변경 전파 필요.

---

### T-10 — validation 스키마 + tests 갱신

**Phase**: 2
**TDD cycle**:
- **RED**: me-resume.test.ts와 project.test.ts의 proficiency 검증 케이스 → typecheck FAIL.
- **GREEN**:
  - validation/instructor.ts: skillUpdateInputSchema에서 proficiency 필드 제거. `z.object({ skillId: z.string().uuid() })` 정도로 단순화. 또는 array 형태 `skillIds: z.array(z.uuid()).max(9)` 신설.
  - validation/project.ts: required_skills 스키마 검증 — 변경 없음 또는 max(9) 제약 추가.
  - me-resume.test.ts: proficiency 입력 케이스 제거.
  - project.test.ts: required_skills 케이스 (UUID 형식, 0~9개) 갱신.
- **REFACTOR**: zod 스키마 메시지 한국어 정합성.

**Acceptance**: pnpm test:unit src/lib/validation PASS.
**Risk**: full-replace upsert 전제 — actions.ts에서 array 입력 처리.

---

### T-11 — SkillsPicker 재작성 (단일 Card 9 chip controlled API)

**Phase**: 3
**TDD cycle**:
- **RED**: 기존 SkillsPicker는 buildSkillTree 의존 + Tabs/검색/proficiency select — Phase 1/2 적용 후 typecheck 실패.
- **GREEN**: 전면 재작성. props:
  ```ts
  interface SkillsPickerProps {
    categories: ReadonlyArray<{ id: string; name: string; sortOrder: number }>;
    selected: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
    ariaLabel?: string;
    readOnly?: boolean;
  }
  ```
  - 단일 Card 안에 9개 chip (button 또는 toggle)을 sort_order 순으로 렌더.
  - 클릭 시 onChange로 새 Set 반환.
  - 시각적 active: data-selected 속성 + bg/border 변경.
  - readOnly=true 시 비클릭 표시만 (recommendation-panel 재사용용).
  - Tabs/검색 input/proficiency select 부재.
- **REFACTOR**: tailwind 클래스 정리, accessibility 검증 (aria-pressed).

**Acceptance**: pnpm typecheck 통과. pnpm dev → /me/resume에서 9 chip 노출 확인.
**Risk**: controlled/uncontrolled 패턴 혼재 방지 — 항상 controlled. 부모가 `useState<Set<string>>` 보유.

---

### T-12 — instructor-form / me-resume-form / resume-form: proficiency 제거

**Phase**: 3
**TDD cycle**:
- **RED**: 기존 폼이 proficiency select 또는 SkillsPicker old API 사용 → typecheck FAIL.
- **GREEN**:
  - instructor-form.tsx: SkillsPicker 새 props 적용. proficiency select 제거.
  - me-resume-form.tsx: 동일. selectedSkillIds 상태를 `Set<string>`으로.
  - resume-form.tsx: proficiency 입력 제거 (있다면).
- **REFACTOR**: 폼 검증 메시지 일관성.

**Acceptance**: pnpm typecheck 통과 + pnpm dev /me/resume → SkillsPicker 동작.
**Risk**: react-hook-form Controller 패턴 적용 시 Set 직렬화 주의.

---

### T-13 — instructor-list-filters / list-table 갱신

**Phase**: 3
**TDD cycle**:
- **RED**: 기존 필터가 3-tier 트리 또는 proficiency 컬럼 의존 → typecheck FAIL.
- **GREEN**:
  - instructor-list-filters.tsx: 3-tier 트리 필터 제거. SkillsPicker 재사용 또는 동일한 chip 다중선택 컴포넌트 적용. URL query string sync.
  - instructor-list-table.tsx: proficiency 컬럼 제거 (있다면). 강사 카테고리 chip 표시.
- **REFACTOR**: ANY-match 필터 의미 (selected.size === 0 → 필터 미적용).

**Acceptance**: pnpm typecheck 통과 + pnpm dev /instructors → 9 chip 필터 동작.
**Risk**: 기존 URL query 파라미터 backward compat 깨짐 (large/medium/small 키 → skillIds로 통일).

---

### T-14 — project-create/edit-form + recommendation-panel

**Phase**: 3
**TDD cycle**:
- **RED**: project-create-form / edit-form의 required_skills 입력이 3-tier 트리 의존. recommendation-panel이 강사 proficiency 배지 표시.
- **GREEN**:
  - project-create-form.tsx: required_skills 섹션을 SkillsPicker로 교체.
  - project-edit-form.tsx: 동일.
  - recommendation-panel.tsx: 강사 chip만 표시 (readOnly=true SkillsPicker 또는 독립 chip 리스트). proficiency 배지 제거. source/model "fallback" 텍스트 정책 보존 (REQ-SKILL-RECOMMEND-PANEL-TEXT).
- **REFACTOR**: chip 컴포넌트 중복 제거.

**Acceptance**: pnpm typecheck 통과 + pnpm dev /projects/new → 9 chip 노출.
**Risk**: recommendation-panel-text.test.ts와 충돌 없음 — Phase 5에서 회귀 검증.

---

### T-15 — operator instructors/new + me/resume actions

**Phase**: 4
**TDD cycle**:
- **RED**: actions.ts에서 proficiency 입력 처리 코드가 Phase 2/3 적용 후 컴파일 실패.
- **GREEN**:
  - instructors/new/actions.ts: createInstructor에서 `proficiency: "intermediate" as const` 등 하드코딩 제거. `upsertInstructorSkills(instructorId, skillIds)` 호출.
  - me/resume/actions.ts: skillUpsert action에서 proficiency 분기 제거. full-replace upsert 패턴 (DELETE 전체 + INSERT skillIds).
  - me/resume/page.tsx: SkillsPicker 새 props 전달.
  - operator/instructors/page.tsx: 필터 props 갱신.
- **REFACTOR**: action 응답 타입 일관성.

**Acceptance**: pnpm typecheck 통과 + pnpm dev: 강사 회원가입 → 9 chip 선택 → 저장 → DB 확인.
**Risk**: full-replace 패턴이 동시성 안전한지 검증 (트랜잭션 권장).

---

### T-16 — operator projects new/edit page + actions

**Phase**: 4
**TDD cycle**:
- **RED**: projects/new/page.tsx, [id]/edit/page.tsx 안 inline tier filter 코드(`s.tier === "small"`)가 schema 변경 후 컴파일 실패.
- **GREEN**:
  - new/page.tsx: skill_categories 로딩에서 `tier` 필터 제거. `loadAllSkillCategories()` 결과 9 row 그대로 전달.
  - new/actions.ts: createProject에서 required_skills full-replace INSERT.
  - [id]/edit/page.tsx, [id]/edit/actions.ts: 동일.
- **REFACTOR**: skillCategoriesProp 타입 단순화.

**Acceptance**: pnpm typecheck 통과 + pnpm dev /projects/new → required_skills 9 chip.
**Risk**: 기존 프로젝트의 required_skills(small UUID 참조)가 TRUNCATE로 사라짐 — 운영자 재선택 필요. Frozen 결정 사항.

---

### T-17 — projects/[id]/actions.ts + integration tests

**Phase**: 4 + 5
**TDD cycle**:
- **RED**: [id]/actions.ts의 skillsByInstructor 수집 로직이 proficiency 필드 사용. integration.test.ts와 action-integration.test.ts가 proficiency fixture 사용 → FAIL.
- **GREEN**:
  - [id]/actions.ts: SELECT 절에서 proficiency 제거. skillsByInstructor map 타입 단순화: `Map<string, string[]>` (instructor_id → skill_id 배열).
  - integration.test.ts: 9개 카테고리 fixture 사용. AC-5의 점수 산출 시나리오 검증 (강사 A skillMatch=2/3, 강사 B=1/3 등).
  - action-integration.test.ts: 동일 갱신.
- **REFACTOR**: 추천 엔진 입력 빌드 함수 분리 가능 시 추출.

**Acceptance**: pnpm test:unit src/lib/recommend + pnpm test:unit projects __tests__ PASS. binary 점수 정확성 검증.
**Risk**: 기존 fixture가 large/medium/small UUID 참조 → 새 9 UUID로 일괄 교체 필요.

---

### T-18 — engine.test 회귀 + recommendation-panel-text 회귀 + Phase 6 final + MX 태그

**Phase**: 5 + 6
**TDD cycle**:
- **RED**:
  - engine.test.ts의 proficiency 가중치 의존 케이스 → assertion FAIL 또는 typecheck FAIL.
  - recommendation-panel-text.test.ts의 proficiency 표기 케이스 → FAIL.
- **GREEN**:
  - engine.test.ts: proficiency 필드 제거 + 정렬 정책(availability desc → finalScore desc → instructorId asc) 회귀 케이스 추가. 동점 강사 tiebreaker 검증.
  - recommendation-panel-text.test.ts: proficiency 표기 케이스 제거. source="fallback"/model="fallback" 표기 검증.
  - MX 태그 부착: `@MX:SPEC: SPEC-SKILL-ABSTRACT-001`을 다음 anchor 함수에 추가 (기존 SPEC 태그 유지):
    - src/lib/recommend/score.ts `computeSkillMatch`, `rankTopN`
    - src/lib/instructor/skill-queries.ts `getAllSkillCategories` (또는 새 단일 함수)
    - src/lib/instructor/queries.ts `upsertInstructorSkills` (있다면)
    - src/components/instructor/skills-picker.tsx default export
    - src/app/(app)/(operator)/projects/new/actions.ts `createProject`
    - src/app/(app)/(operator)/projects/[id]/edit/actions.ts `updateProject`
    - src/app/(app)/(operator)/instructors/new/actions.ts `createInstructor`
    - src/app/(app)/(instructor)/me/resume/actions.ts skill-upsert action
- **REFACTOR**:
  - 최종 정합성: pnpm typecheck / pnpm lint / pnpm test:unit / pnpm db:verify / pnpm build 전부 PASS.
  - 회귀 grep:
    - `grep -rn "PROFICIENCY_WEIGHT" src/` → 0 hit
    - `grep -rn "skillTier\|skill_tier" src/ --exclude-dir=node_modules` → 0 hit (supabase-types.ts 재생성 후)
    - `grep -rln "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/` → 6 hit 이상
    - `git diff main -- src/lib/ai/claude.ts` → empty (REQ-SKILL-CLAUDE-PRESERVE)
  - ai_instructor_recommendations row count 변동 없음 검증 (cloud 환경 또는 마이그 push 시).

**Acceptance**:
- AC-1 ~ AC-9 전부 PASS (acceptance.md 시나리오).
- TRUST 5 통과 (Tested/Readable/Unified/Secured/Trackable).
- pnpm dev 수동 시나리오 전부 PASS.

**Risk**: MX 태그 누락 시 AC-7 grep 검증 실패. 부착 대상 8개 위치 체크리스트화.

---

## 의존성 그래프 요약

```
T-01 (RED, db-verify)
  └─ T-02 (enums.ts) ──┐
       T-03 (schema.ts)─┼─→ T-04 (forward migration SQL) ─→ T-05 (e2e seed + supabase-types)
                                                                      │
                                                                      ▼
                                            T-06 (score.test RED) ─→ T-07 (types.ts + score.ts)
                                                                            ├─→ T-08 (skill-tree/queries)
                                                                            ├─→ T-09 (queries.ts + types.ts)
                                                                            └─→ T-10 (validation + tests)
                                                                                       │
                                                                                       ▼
                                                                                T-11 (SkillsPicker)
                                                                                  ├─→ T-12 (instructor-form 등)
                                                                                  ├─→ T-13 (list-filters/table)
                                                                                  └─→ T-14 (project forms + panel)
                                                                                                │
                                                                                                ▼
                                                                                       T-15 (instructor actions)
                                                                                       T-16 (project actions/pages)
                                                                                                │
                                                                                                ▼
                                                                                          T-17 ([id]/actions + integration)
                                                                                                │
                                                                                                ▼
                                                                                          T-18 (engine.test 회귀 + Phase 6 final + MX)
```

T-02 ~ T-10은 Phase 1+2 단일 commit/PR 권장 (typecheck 광범위 의존).
T-11 ~ T-14는 Phase 3 단일 commit/PR 권장.
T-15 ~ T-16은 병렬 가능.
T-18은 최종 회귀.

---

## Sprint Contract

**불필요** — harness=standard. evaluator-active는 SPEC 완료 후 final-pass mode로 한 번만 평가. per-Phase Sprint Contract 작성 안 함 (.claude/rules/moai/design/constitution.md §11 Sprint Contract Protocol은 thorough 모드 필수, standard 모드 optional).

---

## 검증 명령 시퀀스 (Phase 6 최종)

```bash
# 1. DB 정합성
npx supabase start
npx supabase db reset
pnpm db:verify   # 18/18 PASS (또는 갱신된 N/N)

# 2. 코드 품질
pnpm typecheck   # 0 error
pnpm lint        # 0 warning
pnpm test        # tsc --noEmit (실질 typecheck)
pnpm test:unit   # vitest/node:test 단위 테스트 PASS  ※ 필수
pnpm build       # next build 성공

# 3. 수동 시나리오
pnpm dev
# /me/resume → 9 chip 선택 → 저장 → 새로고침 → 유지
# /instructors → 9 chip 필터 → ANY-match 동작
# /projects/new → required_skills 9 chip → 추천 실행 → Top-3 노출
# /projects/{id} → 추천 패널 → 강사 chip만 (proficiency 배지 부재)

# 4. 회귀 회피 (grep)
grep -rn "PROFICIENCY_WEIGHT" src/                                  # 0 hit
grep -rn "skillTier\|skill_tier" src/ --exclude-dir=node_modules    # 0 hit
grep -rln "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/                  # ≥ 6 hit

# 5. callClaude 비회귀
git diff main -- src/lib/ai/claude.ts   # empty (변경 없음)

# 6. ai_instructor_recommendations 보존 (cloud / supabase db push 환경)
psql -c "SELECT count(*) FROM ai_instructor_recommendations"        # 마이그 전후 동일
```

---

**End of tasks.md**
