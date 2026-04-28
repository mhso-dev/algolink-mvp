# SPEC-SKILL-ABSTRACT-001 Progress

- Started: 2026-04-29
- Branch: feature/SPEC-SKILL-ABSTRACT-001
- Methodology: TDD (RED-GREEN-REFACTOR) per quality.yaml development_mode
- Harness level: standard (auto-detected: multi-domain, file_count > 3)
- Effort level: xhigh (UltraThink activated: 4 domains, 30+ files, schema change, ultrathink keyword)
- Mode: Full Pipeline (multi-domain feature)

## Phase Checkpoints

- Phase 0.9 (JIT Language Detection): completed → TypeScript (Next.js 16 + Drizzle)
- Phase 0.95 (Scale-Based Mode Selection): completed → Full Pipeline (multi-domain, 30+ files)
- Phase 1 (Strategy/Analysis): completed → manager-strategy 보고 receipted
- Phase 1.5 (Task Decomposition): completed → 18 atomic tasks (tasks.md)
- Phase 1.6 (Acceptance Criteria Init): completed → 9 AC entries in progress.md
- Phase 1.7 (Stub Scaffolding): N/A — modification-only SPEC
- Phase 1.8 (MX Context Scan): completed → 변경 파일들의 기존 @MX 태그 확인 (computeSkillMatch SPEC-PROJECT-001 등)
- Phase 2B (TDD Implementation): in_progress → completed Phase 1+2 (T-01~T-10) + 일부 cascade fix
  - T-01 (db-verify.ts 검증 케이스 갱신): completed
  - T-02 (enums.ts proficiency/skillTier 제거): completed
  - T-03 (skill-taxonomy.ts schema 갱신): completed
  - T-04 (forward 마이그레이션 SQL): completed
  - T-05 (e2e seed + supabase-types.ts 재생성): completed
  - T-06 (score.test.ts binary 케이스): completed
  - T-07 (recommend types.ts + score.ts binary 단순화): completed
  - T-08 (skill-tree.ts/skill-queries.ts 단순화): completed
  - T-09 (instructor/queries.ts 단순화 — 변경 최소): completed (queries.ts는 이미 proficiency 미사용)
  - T-10 (validation 스키마 + tests): completed
  - 추가 cascade fix (typecheck blocking):
    - skills-picker.tsx 9-chip 단순화 (T-11 부분 선구현)
    - me-skills-picker-section.tsx 신규 client wrapper (T-11)
    - me/resume/page.tsx + actions.ts (T-12, T-15 부분)
    - projects/[id]/actions.ts skillsByInstructor 단순화 (T-17 부분)
    - instructors/new/actions.ts proficiency 인자 제거 (T-15 부분)
    - engine.test.ts, action-integration.test.ts, integration.test.ts proficiency 제거 (T-17/T-18)
  - 잔여: T-11~T-18 일부 — instructor-form, list-filters, project forms, recommendation-panel 등
- Phase 2.5 (TRUST 5 Validation): pending → manager-quality
- Phase 2.7 (Re-planning Gate): pending
- Phase 2.75 (Pre-Review Quality Gate): pending
- Phase 2.8a (Active Quality Evaluation): pending → evaluator-active
- Phase 2.8b (TRUST 5 Static Verification): pending
- Phase 2.9 (MX Tag Update): pending
- Phase 3 (Git Operations): pending → manager-git
- Phase 4 (Completion + Sync handoff): pending

## Acceptance Criteria (from acceptance.md)

| AC | Status | Description |
|----|--------|-------------|
| AC-1 | passed | `pnpm db:verify` 24/24 PASS (마이그레이션 적용 후) |
| AC-2 | passed | skill_categories 9 row, tier/parent_id 컬럼 부재 (psql 검증 + db:verify AC-SKILL-ABS-01~03) |
| AC-3 | passed | instructor_skills 컬럼 (instructor_id, skill_id, created_at), proficiency 부재 (AC-SKILL-ABS-04) |
| AC-4 | partial | UI 컨트롤러 구현 (me-skills-picker-section + skills-picker). 수동 시나리오 검증 보류 (Phase 3) |
| AC-5 | partial | binary 점수 산출 검증 완료 (score.test 22/22 + integration.test 10/10). UI 통합 보류 (Phase 4) |
| AC-6 | preserved | source/model='fallback' 정책 보존 (engine.test 회귀 없음) |
| AC-7 | partial | typecheck 0 / lint 0 (SPEC 외 1 pre-existing) / test:unit 523/529 (6 pre-existing) / @MX 태그 8개 |
| AC-8 | preserved | ai_instructor_recommendations row count 변동 없음 (forward-only 마이그레이션) |
| AC-9 | preserved | claude.ts 변경 없음 (`git diff main -- src/lib/ai/claude.ts` empty) |

## Verification Results

### Phase 1 검증
- `psql -c "SELECT count(*) FROM skill_categories"` = 9 ✓
- `\d skill_categories` 출력에 tier/parent_id 부재 ✓
- `\d instructor_skills` 출력에 proficiency 부재 ✓
- `pg_type proficiency/skill_tier` = 0 row ✓
- `db:verify`: 24/24 PASS

### Phase 2 검증
- `pnpm typecheck`: 0 error ✓
- `pnpm lint`: 0 new warning (1 pre-existing error in login-form.tsx) ✓
- `pnpm test:unit`: 523/529 pass (6 pre-existing failures, 0 새로 도입) ✓
- score.test 22/22 PASS ✓
- engine.test PASS ✓
- action-integration.test PASS ✓
- validation/me-resume.test PASS ✓
- validation/project.test 새 max(9) 케이스 PASS ✓
- projects/integration.test 10/10 PASS ✓

### grep 회귀 회피
- `grep -rn "PROFICIENCY_WEIGHT" src/` = 0 hit ✓
- `grep -rn "skillTier\|skill_tier" src/` = 0 hit ✓
- `grep -rln "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/` = 8 file hit ✓ (>= 6 required)
- `git diff main -- src/lib/ai/claude.ts` = empty ✓

## Risks (from plan.md §5)

- Migration history 깨짐 risk → forward-only, 기존 SQL 미수정 (단 e2e_seed 예외)
- PROFICIENCY_WEIGHT import 누락 risk → grep 전수 검사 완료, 0 hit
- 추천 동점 강사 증가 → tiebreaker로 결정, 회귀 아님
- callClaude 회귀 risk → src/lib/ai/claude.ts 절대 미수정 ✓

## Memory Notes

- main 직접 머지 금지 (memory: project_deploy_workflow.md)
- production push가 Vercel 자동 배포 트리거
- vercel.json git.deploymentEnabled.main: false (preview build 비활성화 commit 1a12876)
- 본 SPEC 마이그레이션은 supabase_migrations.schema_migrations에 manual record 필요
  (`docker exec ... INSERT INTO supabase_migrations.schema_migrations` 사용)
- supabase db reset 명령은 hook으로 차단됨 — docker exec psql 사용

## 잔여 작업 (Phase 3+ in 후속 commit)

Phase 3 (UI 컴포넌트, T-13/T-14):
- instructor-form.tsx: SkillsPicker 새 props 통합
- instructor-list-filters.tsx: 9 chip 다중선택 필터
- instructor-list-table.tsx: proficiency 컬럼 제거
- project-create-form.tsx, project-edit-form.tsx: 9 chip required_skills
- recommendation-panel.tsx: proficiency 배지 제거
- me-resume-form.tsx, resume-form.tsx: proficiency 입력 제거

Phase 4 (Server Action + 페이지, T-16):
- projects/new/page.tsx, actions.ts: 9 chip 로딩
- projects/[id]/edit/page.tsx, actions.ts: 동일

Phase 5+6: 회귀 검증 + 최종 MX 태그 보충
