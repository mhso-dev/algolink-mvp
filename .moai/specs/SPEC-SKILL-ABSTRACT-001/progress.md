# SPEC-SKILL-ABSTRACT-001 Progress

- Started: 2026-04-29
- Branch: feature/SPEC-SKILL-ABSTRACT-001
- Methodology: TDD (RED-GREEN-REFACTOR) per quality.yaml development_mode
- Harness level: standard (auto-detected: multi-domain, file_count > 3)
- Effort level: xhigh (UltraThink activated: 4 domains, 30+ files, schema change, ultrathink keyword)
- Mode: Full Pipeline (multi-domain feature)

## Phase Checkpoints

- Phase 0.9 (JIT Language Detection): pending
- Phase 0.95 (Scale-Based Mode Selection): pending
- Phase 1 (Strategy/Analysis): pending → manager-strategy
- Phase 1.5 (Task Decomposition): pending
- Phase 1.6 (Acceptance Criteria Init): pending — 9 AC items
- Phase 1.7 (Stub Scaffolding): N/A — modification-only SPEC
- Phase 1.8 (MX Context Scan): pending
- Phase 2B (TDD Implementation): pending → manager-tdd
  - SPEC plan.md 6 sub-phases:
    - P1 DB schema + migration (5 files)
    - P2 Domain logic (9 files)
    - P3 UI components (9 files)
    - P4 Server Actions + pages (7 files)
    - P5 Test updates (7 files)
    - P6 Final verification + MX tags
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
| AC-1 | pending | `pnpm db:verify` 18/18 PASS |
| AC-2 | pending | skill_categories 9 row, tier/parent_id 컬럼 부재 |
| AC-3 | pending | instructor_skills 컬럼 (instructor_id, skill_id, created_at), proficiency 부재 |
| AC-4 | pending | 강사 9 chip 다중선택 후 새로고침 시 유지 |
| AC-5 | pending | 운영자 프로젝트 생성 → 추천 Top-3 binary score 노출 |
| AC-6 | pending | 추천 후보 source/model = "fallback" 보존 |
| AC-7 | pending | typecheck 0 / test PASS / lint warning 0 / @MX 태그 ≥ 6 |
| AC-8 | pending | ai_instructor_recommendations forward-only (DELETE 0건) |
| AC-9 | pending | callClaude 비회귀 (SPEC-INSTRUCTOR-001 보존) |

## Risks (from plan.md §5)

- Migration history 깨짐 risk → forward-only, 기존 SQL 미수정 (단 e2e_seed 예외)
- PROFICIENCY_WEIGHT import 누락 risk → grep 전수 검사 필요
- 추천 동점 강사 증가 → tiebreaker로 결정, 회귀 아님
- callClaude 회귀 risk → src/lib/ai/claude.ts 절대 미수정

## Memory Notes

- main 직접 머지 금지 (memory: project_deploy_workflow.md)
- production push가 Vercel 자동 배포 트리거
- vercel.json git.deploymentEnabled.main: false (preview build 비활성화 commit 1a12876)
