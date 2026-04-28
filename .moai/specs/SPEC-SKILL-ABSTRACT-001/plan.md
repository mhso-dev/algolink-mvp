# SPEC-SKILL-ABSTRACT-001 — 구현 계획 (Plan)

**Status**: draft
**Created**: 2026-04-29
**Author**: 철
**Methodology**: TDD (RED-GREEN-REFACTOR) per `quality.development_mode` (`.moai/config/sections/quality.yaml`)

---

## 1. 목적 및 범위 요약

3-tier 기술 분류(large/medium/small)를 9개 추상 카테고리(단일 레벨)로 단순화하고, 강사 기술 매핑에서 proficiency를 완전히 제거한다. 구체적 요구사항은 `spec.md` §3 (REQ-SKILL-* 12종) 참조.

**불변 (FROZEN)**: 9개 카테고리 이름·sort_order·UUID, proficiency 완전 제거, 데이터 전체 초기화, tier/parent_id 컬럼 자체 제거, 추천 가중치(0.5/0.3/0.2), 정렬 정책.

---

## 2. Phase 분할 (Priority-based, no time estimate)

### Phase 1 (Priority: High) — DB 스키마 + 마이그레이션

**목표**: DB 레이어를 새 모델로 전환. 본 Phase 종료 시 `pnpm db:verify`가 새 스키마와 정합해야 함.

**작업 단위:**

1. `src/db/enums.ts`
   - `proficiency` pgEnum export 제거 (코드+타입+DB type)
   - `skillTier` pgEnum export 제거
2. `src/db/schema/skill-taxonomy.ts`
   - `skillCategories.tier`, `parentId` 컬럼 제거
   - `instructorSkills.proficiency` 컬럼 제거
   - 인덱스 제거 (`idx_skill_categories_tier`, `idx_skill_categories_parent`)
   - UNIQUE 제약 변경: `unique(tier, parent_id, name)` → `unique(name)`
3. (신규) `supabase/migrations/2026042900XXXX_skill_abstract.sql`
   - 단계 A: TRUNCATE `instructor_skills`, `project_required_skills` (CASCADE 사용 안 함; FK는 ON DELETE CASCADE로 이미 정의됨)
   - 단계 B: `DROP TRIGGER IF EXISTS` 모든 leaf-only 트리거 (`enforce_skill_leaf_only` 등)
   - 단계 C: `ALTER TABLE skill_categories DROP COLUMN tier`, `DROP COLUMN parent_id`
   - 단계 D: `ALTER TABLE instructor_skills DROP COLUMN proficiency`
   - 단계 E: `DROP TYPE IF EXISTS proficiency CASCADE`, `DROP TYPE IF EXISTS skill_tier CASCADE`
   - 단계 F: `DROP INDEX IF EXISTS idx_skill_categories_tier`, `idx_skill_categories_parent`
   - 단계 G: 기존 `skill_categories` row 삭제 후 9개 row INSERT (UUID 고정, idempotent `ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order`)
   - 단계 H: UNIQUE 제약 갱신 (`ALTER TABLE skill_categories DROP CONSTRAINT ... ADD CONSTRAINT ... UNIQUE(name)`)
4. `supabase/migrations/20260428000020_e2e_seed_phase2.sql`
   - 기존 small leaf UUID 참조를 새 9개 카테고리 UUID로 교체
   - proficiency 컬럼 INSERT 제거
5. `pnpm db:verify` 스크립트 — 검증 케이스 갱신 (9개 row, 컬럼 부재 검사 추가)

**검증 (Phase 1 종료 시):**
- `npx supabase db reset && npx supabase db push` 무오류
- `pnpm db:verify` 18/18 PASS
- `psql` 직접 조회: `SELECT count(*) FROM skill_categories` = 9
- `\d skill_categories` 출력에 `tier`, `parent_id` 컬럼 부재
- `\d instructor_skills` 출력에 `proficiency` 컬럼 부재

**Risks (Phase 1):**
- TRUNCATE 누락 시 FK 무결성 오류. → 마이그레이션 SQL 단계 A를 단계 C/D보다 먼저 실행.
- 기존 마이그레이션을 직접 수정하면 `db reset`이 깨질 수 있음. → 새 forward 마이그레이션 파일에서만 `ALTER`/`DROP`. 단, e2e seed는 새 UUID로 갱신해야 함 (기존 UUID 참조 시 FK 위반).

### Phase 2 (Priority: High) — 도메인 로직

**목표**: TypeScript 도메인 코드에서 proficiency/3-tier 의존을 제거. typecheck 통과.

**작업 단위:**

1. `src/lib/recommend/types.ts` — `PROFICIENCY_WEIGHT` 상수 제거. `InstructorSkill` 타입에서 proficiency 필드 제거.
2. `src/lib/recommend/score.ts` — `computeSkillMatch` 분자: `Σ(matched proficiency_weight) / required_count` → `matched_count / required_count` (Set 기반 교집합 카디널리티). 빈 required 케이스 분기 보존.
3. `src/lib/recommend/engine.ts` — proficiency 의존 코드(있다면) 제거. `rankTopN` 정렬 로직 변경 없음.
4. `src/lib/instructor/skill-tree.ts` — 트리 구성 로직 제거 또는 단일 list 반환 함수로 단순화.
5. `src/lib/instructor/skill-queries.ts` — `loadLargeCategories`, `loadMediumByLarge`, `loadSmallByMedium` 헬퍼 제거. `loadAllSkillCategories(): Promise<SkillCategory[]>` 단일 함수로 대체.
6. `src/lib/instructor/queries.ts` — `upsertInstructorSkills(instructorId, skillIds)` 시그니처에서 proficiency 인자 제거. 내부 INSERT문도 `(instructor_id, skill_id)`만.
7. `src/lib/instructor/types.ts` — `InstructorSkillInput` 인터페이스에서 `proficiency` 필드 제거.
8. `src/lib/validation/instructor.ts` — Zod schema에서 proficiency 필드 제거.
9. `src/lib/validation/project.ts` — required_skills 스키마는 `z.array(z.string().uuid()).max(9)` 정도로 단순화 검토.

**검증 (Phase 2 종료 시):**
- `pnpm typecheck` 0 error
- `pnpm lint` warning 0
- `pnpm test src/lib/recommend src/lib/instructor src/lib/validation` PASS

**Risks (Phase 2):**
- `PROFICIENCY_WEIGHT`을 import하는 다른 모듈 누락 시 typecheck 실패. → Phase 2 시작 시 grep로 모든 import 경로 식별.
- `computeSkillMatch` 시그니처 변경이 호출자에게 전파되어야 함. → 호출자 모두 동시 수정.

### Phase 3 (Priority: High) — UI 컴포넌트

**목표**: SkillsPicker 및 관련 폼/필터/테이블을 9개 chip 단일선택 UI로 전환.

**작업 단위:**

1. `src/components/instructor/skills-picker.tsx` — 전면 재작성. props: `categories: SkillCategory[]`, `selected: Set<string>`, `onChange: (next: Set<string>) => void`. 단일 Card 안에 9개 chip을 sort_order로 렌더, 클릭 시 toggle.
2. `src/components/instructor/instructor-form.tsx` — proficiency select 제거. `SkillsPicker` 통합.
3. `src/components/instructor/instructor-list-filters.tsx` — 3-tier 트리 필터 제거, 9개 chip 다중선택 컴포넌트(또는 SkillsPicker 재사용) 적용.
4. `src/components/instructor/instructor-list-table.tsx` — proficiency 컬럼 제거, 강사 카테고리 chip 표시.
5. `src/components/projects/project-create-form.tsx` — required_skills 섹션을 9개 chip 다중선택으로.
6. `src/components/projects/project-edit-form.tsx` — 동일.
7. `src/components/projects/recommendation-panel.tsx` — 강사 chip만 표시, proficiency 배지 제거.
8. `src/components/resume/resume-form.tsx` — proficiency 입력 제거.
9. `src/components/instructor/me-resume-form.tsx` — proficiency 입력 제거. 9개 chip 통합.

**검증 (Phase 3 종료 시):**
- `pnpm typecheck` 0 error
- `pnpm dev` 수동 확인:
  - `/me/resume` 페이지에서 9개 chip 노출, 다중 선택, 저장, 새로고침 시 유지
  - `/instructors` 리스트 필터 동작
  - `/projects/new` 폼에서 required_skills 9개 chip 노출

**Risks (Phase 3):**
- SkillsPicker 재사용 시 controlled/uncontrolled 패턴 혼재 가능. → controlled (외부 state) 단일 패턴 채택.
- 모바일 레이아웃에서 9개 chip wrap이 어색할 수 있음. → flex-wrap + min-width 보장.

### Phase 4 (Priority: High) — Server Action + 페이지

**목표**: server action에서 proficiency 입력 제거 + 9개 카테고리 로딩.

**작업 단위:**

1. `src/app/(app)/(operator)/projects/new/page.tsx` — `loadAllSkillCategories()` 호출, props 전달.
2. `src/app/(app)/(operator)/projects/new/actions.ts` — `createProject` action에서 required_skills 입력 검증/INSERT.
3. `src/app/(app)/(operator)/projects/[id]/edit/page.tsx` + `actions.ts` — 동일 패턴.
4. `src/app/(app)/(operator)/projects/[id]/actions.ts` — recommend 트리거 변경 없음 (binary score 자동 적용).
5. `src/app/(app)/(operator)/instructors/new/actions.ts` — proficiency 입력 제거. `upsertInstructorSkills(instructorId, skillIds)` 호출.
6. `src/app/(app)/(operator)/instructors/page.tsx` — 필터 props 갱신.
7. `src/app/(app)/(instructor)/me/resume/page.tsx` + `actions.ts` — proficiency 제거, 9개 chip.

**검증 (Phase 4 종료 시):**
- `pnpm dev` 수동: 강사 회원가입 → 9개 chip 선택 → 저장 → DB 확인 (instructor_skills 정확히 INSERT)
- 운영자 프로젝트 생성 → 추천 실행 → Top-3 강사 노출 (binary 점수)

### Phase 5 (Priority: Medium) — 테스트 갱신

**목표**: 단위/통합 테스트를 binary 매칭 + 9개 카테고리 fixture로 갱신.

**작업 단위:**

1. `src/lib/recommend/__tests__/score.test.ts`
   - 케이스 A: required = [c1, c2, c3], 강사 보유 = [c1, c2] → skillMatch = 2/3
   - 케이스 B: required = [], 강사 보유 = [c1] → skillMatch = 0
   - 케이스 C: required = [c1], 강사 보유 = [] → skillMatch = 0
   - 케이스 D: required = [c1, c2], 강사 보유 = [c1, c2, c3] → skillMatch = 1.0 (분자 cap 검증)
2. `src/lib/recommend/__tests__/engine.test.ts`
   - rankTopN 정렬 정책 보존 검증 (`availability desc → finalScore desc → instructorId asc`)
   - 동점 케이스(같은 binary skillMatch) 추가하여 tiebreaker 명확화
3. `src/lib/recommend/__tests__/recommendation-panel-text.test.ts`
   - proficiency 표기 케이스 제거. `source="fallback"`/`model="fallback"` 표기 보존 확인.
4. `src/lib/recommend/__tests__/action-integration.test.ts`
   - 9개 카테고리 시드 fixture 사용
   - 운영자가 required = [c1, c4, c8] 선택 시 매칭 강사 Top-3 정렬 검증
5. `src/lib/validation/__tests__/me-resume.test.ts`
   - proficiency 필드 검증 케이스 제거
6. `src/lib/validation/__tests__/project.test.ts`
   - required_skills 검증 갱신 (UUID 형식, 0~9개)
7. `src/app/(app)/(operator)/projects/__tests__/integration.test.ts`
   - 9개 카테고리 기반 추천 흐름 e2e

**검증 (Phase 5 종료 시):**
- `pnpm test` 전체 PASS
- `pnpm test --coverage` 본 SPEC 변경 라인 85%+ (현행 quality.yaml 기준)

### Phase 6 (Priority: Medium) — 최종 검증 + MX 태그

**목표**: 전체 정합성 확인 및 추적성 태그 부착.

**작업 단위:**

1. `pnpm typecheck` 0 error
2. `pnpm lint` warning 0
3. `pnpm test` PASS
4. `pnpm db:verify` 18/18 PASS
5. `pnpm build` 성공
6. `pnpm dev` 수동 시나리오 (acceptance.md AC-1 ~ AC-9 전부)
7. `ai_instructor_recommendations` row count 변동 검증 (마이그레이션 전후 동일)
8. MX 태그 부착:
   - `@MX:SPEC: SPEC-SKILL-ABSTRACT-001`을 변경된 anchor 함수에 추가
   - 대상: `computeSkillMatch`, `loadAllSkillCategories`, `upsertInstructorSkills`, `SkillsPicker` default export, instructor `createInstructor` action, project `createProject`/`updateProject` action
   - 기존 SPEC 태그(`@MX:SPEC: SPEC-DB-001` 등)는 유지 (다중 SPEC 태그 허용)

**검증 (Phase 6 종료 시):**
- 모든 acceptance 시나리오 PASS
- `grep -r "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/` 으로 태그 부착 확인

---

## 3. 기술적 접근 (Technical Approach)

### 3.1 마이그레이션 전략 — Forward-only

기존 `_30_initial_schema.sql`, `_50_triggers.sql`, `_70_seed.sql`을 **직접 수정하지 않는다**. 새 마이그레이션 파일(`_skill_abstract.sql`)에서 `ALTER`/`DROP`/`INSERT`로 forward 적용한다. 이유:

- `npx supabase db reset`이 모든 마이그레이션을 순차 실행하므로 기존 파일 수정 시 history 깨짐.
- 운영 환경은 Vercel + Supabase Cloud로, 새 마이그레이션 파일만 push하면 자동 적용.
- 단, `_e2e_seed_phase2.sql`은 e2e 환경에서만 실행되므로 새 UUID로 직접 갱신해도 안전.

### 3.2 데이터 초기화 정책

`instructor_skills`, `project_required_skills`만 TRUNCATE한다. 다음은 **건드리지 않는다**:

- `instructors` (강사 프로필) — 보존
- `projects` (프로젝트) — 보존
- `ai_instructor_recommendations` — 보존 (forward-only)

강사가 다시 9개 chip에서 자기 카테고리를 재선택해야 하는 부담은 의도된 트레이드오프 (best-effort 매핑보다 명시적 재입력이 데이터 품질 우월).

### 3.3 binary 매칭 구현 디테일

```ts
// src/lib/recommend/score.ts (의사코드, 최종 형태는 implementation 단계에서 결정)
export function computeSkillMatch(
  instructorSkillIds: ReadonlySet<string>,
  requiredSkillIds: readonly string[],
): number {
  if (requiredSkillIds.length === 0) return 0;
  let matched = 0;
  for (const id of requiredSkillIds) {
    if (instructorSkillIds.has(id)) matched += 1;
  }
  return matched / requiredSkillIds.length;
}
```

- Set 기반 lookup으로 O(N+M) 보장.
- 분자가 분모를 초과하지 않음 (REQ-SKILL-MATCH-DUPLICATE 자동 만족).
- proficiency import 0건 (REQ-SKILL-MATCH-BINARY-002).

### 3.4 SkillsPicker 재사용

3개 화면(강사 폼, 강사 리스트 필터, 프로젝트 폼)에서 동일 컴포넌트를 재사용한다. controlled API로 통일:

```tsx
<SkillsPicker
  categories={categories}
  selected={selected}        // Set<string>
  onChange={(next) => setSelected(next)}
  ariaLabel="기술 카테고리 선택"
/>
```

추천 패널(`recommendation-panel.tsx`)은 read-only 표시이므로 별도 prop(`readOnly`) 또는 단순 chip 리스트 컴포넌트로 분리.

### 3.5 MX 태그 정책

다중 SPEC 태그 허용. 예:

```ts
/**
 * @MX:NOTE 강사 보유 스킬과 필수 스킬의 binary 교집합 비율
 * @MX:ANCHOR computeSkillMatch
 * @MX:SPEC: SPEC-DB-001
 * @MX:SPEC: SPEC-PROJECT-001
 * @MX:SPEC: SPEC-SKILL-ABSTRACT-001
 */
export function computeSkillMatch(...) { ... }
```

`@MX:SPEC: SPEC-SKILL-ABSTRACT-001`을 추가하되 기존 태그는 유지.

---

## 4. 마일스톤 순서 (Milestone Ordering)

```
Phase 1 (DB) → Phase 2 (도메인) → Phase 3 (UI) → Phase 4 (Server Action)
                                                            │
                                                            ▼
                                                       Phase 5 (테스트)
                                                            │
                                                            ▼
                                                       Phase 6 (검증/MX)
```

- **Phase 1 → 2 의존**: Phase 2 typecheck는 Phase 1 schema(`enums.ts`, `skill-taxonomy.ts`) 변경에 의존.
- **Phase 2 → 3 의존**: SkillsPicker는 Phase 2의 `loadAllSkillCategories`, `InstructorSkillInput` 타입에 의존.
- **Phase 3 → 4 의존**: server action은 폼 컴포넌트 props 시그니처에 의존.
- **Phase 4 → 5 의존**: integration 테스트는 server action 동작에 의존.
- **Phase 5 → 6**: 6번 Phase는 전체 누적 검증.

---

## 5. Risks & Mitigations

| Risk | 영향 | 완화책 |
|------|------|--------|
| 기존 마이그레이션 history 깨짐 | high | 기존 파일 미수정 원칙. 새 forward 파일만 추가 (단 e2e seed 예외) |
| `PROFICIENCY_WEIGHT` import 누락 | medium | Phase 2 시작 시 `grep -r "PROFICIENCY_WEIGHT" src/` 전수 식별 |
| SkillsPicker controlled/uncontrolled 혼재 | medium | controlled 단일 패턴, props 인터페이스 명시 |
| 추천 동점 강사 증가 | low | tiebreaker(`availability desc → finalScore desc → instructorId asc`)가 결정 — 회귀 아님 |
| `ai_instructor_recommendations` 과거 row가 사라진 small UUID 참조 | low | top3_jsonb는 jsonb이고 FK 없음. 표시 시 lookup 실패 케이스만 graceful fallback |
| Vercel preview build 실패 (DATABASE_URL 미설정) | medium | 본 SPEC 범위 밖. SPEC 작성/run 단계는 main이 아닌 feat 브랜치에서 작업 |
| callClaude 회귀 (SPEC-INSTRUCTOR-001) | high | claude.ts와 그 호출 경로는 본 SPEC 작업에서 절대 수정 금지. Phase 6 검증에 회귀 시나리오 포함 |
| db:verify 스크립트 동기화 실패 | medium | Phase 1 작업에 `pnpm db:verify` 케이스 갱신 명시 |

---

## 6. Dependencies / Blockers

- **선행 SPEC**: SPEC-DB-001 (completed) — 본 SPEC의 ALTER 대상 스키마를 정의함. 선행 마이그레이션이 적용된 환경 필요.
- **공존 SPEC**: SPEC-PROJECT-001 §5.4 (completed, FROZEN). SPEC-RECOMMEND-001 (draft). 본 SPEC은 두 SPEC의 가중치/정렬 정책을 깨지 않도록 검증 필수.
- **외부 의존성 변경 없음**: Supabase 버전, Drizzle ORM, Next.js 모두 그대로.
- **블로커 없음**.

---

## 7. 검증 명령어 모음 (Phase 6 사용)

```bash
# DB 검증
pnpm db:verify
psql -c "SELECT count(*) FROM skill_categories"          # 9
psql -c "SELECT count(*) FROM instructor_skills"         # 0 (TRUNCATE 직후) 또는 강사 재입력 후 양수
psql -c "\d skill_categories"                            # tier/parent_id 부재
psql -c "\d instructor_skills"                           # proficiency 부재
psql -c "SELECT typname FROM pg_type WHERE typname IN ('proficiency','skill_tier')"  # 0 row

# 코드 품질
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# 수동 시나리오
pnpm dev
# → /me/resume → 9개 chip 선택 → 저장 → 새로고침
# → /instructors → 필터 동작
# → /projects/new → required_skills 선택 → 추천 실행
# → /projects/{id} → 추천 패널에서 강사 chip 표시 (proficiency 없음)

# 회귀 회피
grep -r "PROFICIENCY_WEIGHT" src/      # 0 hit
grep -r "skillTier\|skill_tier" src/   # 0 hit (db/schema 제외)
grep -r "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/  # anchor 함수 모두 hit
```

---

## 8. 후속 SPEC 후보 (Out of Scope, 메모)

- 카테고리 9개를 운영자 화면에서 동적 추가/수정하는 UI (현재는 시드로 고정)
- SkillsPicker에 카테고리별 설명 툴팁 추가
- 모바일에서 chip 그리드 → 가로 스크롤 또는 dropdown 전환
- 추천 사유(rationale) AI 생성 활성화 (SPEC-RECOMMEND-001 fallback 해제)

---

**End of plan.md**
