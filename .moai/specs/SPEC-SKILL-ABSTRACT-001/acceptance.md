# SPEC-SKILL-ABSTRACT-001 — Acceptance Criteria

**Status**: draft
**Created**: 2026-04-29
**Author**: 철

요구사항(`spec.md` §3 REQ-SKILL-*)에 대한 수용 기준을 Given-When-Then 시나리오로 정의한다. 각 시나리오는 관찰 가능한 증거(쿼리 결과, 명령어 출력, UI 상태)를 명시한다.

---

## AC-1. DB 검증 스크립트 정합성 (REQ-SKILL-CATEGORY-001~004, REQ-SKILL-INSTRUCTOR-MAP-002, REQ-SKILL-MIGRATION-RESET, REQ-SKILL-ENUM-REMOVAL)

**Given** 본 SPEC의 마이그레이션이 모두 적용된 로컬 Supabase 인스턴스
  AND `pnpm db:verify` 스크립트가 새 9개 카테고리 / proficiency 부재 / tier 부재를 검사하도록 갱신된 상태

**When** `npx supabase db reset && pnpm db:verify` 실행

**Then**
- 마이그레이션이 무오류로 적용된다.
- `pnpm db:verify` 출력의 마지막 줄이 `18/18 PASS` (또는 18 케이스 중 본 SPEC 추가분 포함 N/N PASS)로 종료된다.
- exit code = 0.

**Evidence**: 터미널 stdout 캡처. `echo $?` = 0.

---

## AC-2. skill_categories 9 row + 컬럼 부재 (REQ-SKILL-CATEGORY-001, REQ-SKILL-CATEGORY-002, REQ-SKILL-CATEGORY-003)

**Given** AC-1 PASS 상태

**When** 다음 SQL 실행:
```sql
SELECT id, name, sort_order FROM skill_categories ORDER BY sort_order;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'skill_categories' ORDER BY ordinal_position;
```

**Then**
- 첫 번째 쿼리는 정확히 9 row를 반환:
  - `(30000000-0000-0000-0000-000000000001, '데이터 분석', 1)`
  - `(30000000-0000-0000-0000-000000000002, '데이터 사이언스', 2)`
  - `(30000000-0000-0000-0000-000000000003, 'AI·ML', 3)`
  - `(30000000-0000-0000-0000-000000000004, '백엔드', 4)`
  - `(30000000-0000-0000-0000-000000000005, '프론트엔드', 5)`
  - `(30000000-0000-0000-0000-000000000006, '풀스택', 6)`
  - `(30000000-0000-0000-0000-000000000007, '모바일', 7)`
  - `(30000000-0000-0000-0000-000000000008, '인프라·DevOps', 8)`
  - `(30000000-0000-0000-0000-000000000009, '클라우드', 9)`
- 두 번째 쿼리 결과에 `tier`, `parent_id` 컬럼이 **없다**.
- 결과에 포함된 컬럼: `id`, `name`, `sort_order`, `created_at`, `updated_at`.

**Evidence**: `psql` 출력 캡처.

---

## AC-3. instructor_skills 컬럼 구조 (REQ-SKILL-INSTRUCTOR-MAP-001, REQ-SKILL-INSTRUCTOR-MAP-002)

**Given** AC-1 PASS 상태

**When**
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'instructor_skills' ORDER BY ordinal_position;
SELECT a.attname FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = 'instructor_skills'::regclass AND i.indisprimary;
```

**Then**
- 첫 쿼리 결과 컬럼은 정확히 `instructor_id`, `skill_id`, `created_at`만 존재한다. `proficiency` 컬럼은 부재.
- 두 번째 쿼리는 PK 구성으로 `instructor_id`, `skill_id` 두 컬럼을 반환 (복합 PK).

**Evidence**: `psql` 출력 캡처.

---

## AC-4. 강사 9개 chip 다중선택 후 영속성 (REQ-SKILL-UI-SIMPLE-001~003, REQ-SKILL-INSTRUCTOR-MAP-003)

**Given** 로그인된 강사 사용자, `/me/resume` 페이지 진입
  AND 사전 조건: `instructor_skills`에 해당 강사의 row가 0개 (TRUNCATE 직후 상태)

**When**
1. SkillsPicker 컴포넌트에서 `데이터 분석`, `백엔드`, `클라우드` chip 3개를 클릭하여 선택 상태로 만든다.
2. `저장` 버튼을 클릭한다.
3. 페이지를 hard reload (Cmd+Shift+R) 한다.

**Then**
- 클릭한 3개 chip은 시각적 active 상태(`data-selected=true` 또는 background 색상 변경)로 표시된다.
- 저장 후 토스트/리다이렉트 등 성공 피드백이 출력된다.
- DB 쿼리 `SELECT skill_id FROM instructor_skills WHERE instructor_id = '<해당 강사>'` 결과가 정확히 3개 row, 위 3개 카테고리 UUID와 일치한다.
- reload 후 SkillsPicker가 동일한 3개 chip을 active 상태로 복원한다.
- SkillsPicker DOM에 proficiency select/배지/슬라이더 element가 부재 (`querySelector('[data-test-id="proficiency-select"]')` = null).
- SkillsPicker는 단일 Card 안에 9개 chip만 노출 (Tabs/검색 input 부재).

**Evidence**: 브라우저 스크린샷 + DB 쿼리 결과 캡처 + DOM 스냅샷.

---

## AC-5. 운영자 프로젝트 생성 → 추천 Top-3 노출 (REQ-SKILL-UI-PROJECT, REQ-SKILL-PROJECT-MAP-002, REQ-SKILL-MATCH-BINARY-001, REQ-SKILL-RECOMMEND-PRESERVE-001~004)

**Given** 운영자 사용자 로그인
  AND e2e seed가 적용되어 강사 4명이 다음과 같이 9개 카테고리 중 일부 보유:
  - 강사 A: `[데이터 분석, AI·ML]`
  - 강사 B: `[백엔드, 풀스택]`
  - 강사 C: `[프론트엔드]`
  - 강사 D: `[모바일, 클라우드]`

**When**
1. `/projects/new` 진입.
2. required_skills 섹션에서 9개 chip 중 `[데이터 분석, AI·ML, 백엔드]` 3개를 선택.
3. 나머지 필수 입력 후 `생성` 버튼 클릭.
4. 생성된 프로젝트 상세 페이지(`/projects/{id}`)에서 추천 패널을 확인.

**Then**
- 프로젝트가 정상 생성된다.
- `project_required_skills` 테이블에 해당 프로젝트와 3개 카테고리 UUID가 INSERT된다.
- 추천 패널에 Top-3 강사가 노출된다.
- 강사 A의 skillMatch 점수 = 2/3 ≈ 0.667 (분자 = 강사 A 보유와 required의 교집합 카디널리티 = 2: 데이터 분석, AI·ML).
- 강사 B의 skillMatch 점수 = 1/3 ≈ 0.333.
- 강사 C, D의 skillMatch 점수 = 0.
- 최종 정렬은 `availability desc → finalScore desc → instructorId asc` 순서를 따른다.
- 강사 chip은 카테고리 이름만 표시되며 proficiency 배지는 부재.

**Evidence**: 추천 패널 스크린샷 + DB row 검증 + 점수 로그(`console.log` 또는 score.test 단위 검증).

---

## AC-6. 추천 후보 source/model 표기 보존 (REQ-SKILL-RECOMMEND-PRESERVE-004, REQ-SKILL-RECOMMEND-PANEL-TEXT)

**Given** AC-5 PASS 상태

**When** 추천 패널에 노출된 Top-3 강사 카드 또는 `ai_instructor_recommendations.top3_jsonb`의 새 row를 검사

**Then**
- 모든 후보의 `source` 필드 = `"fallback"`.
- 모든 후보의 `model` 필드 = `"fallback"`.
- (SPEC-RECOMMEND-001 정합) AI rationale 텍스트 필드는 비어있거나 fallback 메시지.

**Evidence**: `SELECT top3_jsonb FROM ai_instructor_recommendations WHERE project_id = '<생성된 프로젝트>'` 출력 + 패널 텍스트 스크린샷.

---

## AC-7. 코드 품질 (REQ-SKILL-MATCH-BINARY-001~002, REQ-SKILL-ENUM-REMOVAL, REQ-SKILL-MX-TAG)

**Given** 본 SPEC의 모든 Phase(1~6) 구현 완료

**When** 다음 명령어를 순차 실행:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
grep -r "PROFICIENCY_WEIGHT" src/
grep -r "skill_tier\|skillTier" src/ --exclude-dir=node_modules
grep -r "@MX:SPEC: SPEC-SKILL-ABSTRACT-001" src/
```

**Then**
- `pnpm typecheck` exit code = 0, error 0건.
- `pnpm lint` exit code = 0, warning 0건.
- `pnpm test` 모든 테스트 PASS (단위 + 통합).
- `pnpm build` 성공.
- `grep "PROFICIENCY_WEIGHT"` 결과 = 0 hit (완전 제거 확인).
- `grep "skill_tier\|skillTier"` 결과 = 0 hit (drizzle 스키마 정의 부분 포함, 모두 제거).
- `grep "@MX:SPEC: SPEC-SKILL-ABSTRACT-001"` 결과 ≥ 6 hit (`computeSkillMatch`, `loadAllSkillCategories`, `upsertInstructorSkills`, `SkillsPicker`, project create/update action, instructor create action 등 anchor 함수).

**Evidence**: 각 명령어 stdout + exit code 캡처.

---

## AC-8. ai_instructor_recommendations forward-only 보존 (REQ-SKILL-MIGRATION-FORWARD-ONLY)

**Given** 마이그레이션 적용 직전 `ai_instructor_recommendations` row count = N (N ≥ 0)
  AND 적용 직전 row의 `top3_jsonb` 샘플을 backup 파일에 export

**When** 본 SPEC 마이그레이션 적용 (`npx supabase db push` 또는 `npx supabase db reset`은 별도 — reset 시는 자연스럽게 0으로 초기화되므로 본 시나리오는 cloud/dev 환경에서만 검증)

**Then**
- 마이그레이션 적용 후 `SELECT count(*) FROM ai_instructor_recommendations` = N (변동 없음).
- 사전 export한 샘플 row의 `top3_jsonb` 내용이 변경되지 않았다.
- `model`, `source`, `created_at` 등 메타데이터 컬럼이 변경되지 않았다.

**Note**: 로컬 `db reset` 시나리오에서는 이 AC를 검증할 수 없다(reset이 모든 row 삭제). cloud/dev 환경 또는 `supabase db push`로 마이그레이션만 적용하는 시나리오에서 검증한다.

**Evidence**: 마이그레이션 전후 `count(*)` 비교 + 표본 row diff.

---

## AC-9. callClaude 비회귀 (REQ-SKILL-CLAUDE-PRESERVE)

**Given** 본 SPEC 적용 후 dev 서버 실행 중
  AND 강사 만족도 요약을 트리거하는 SPEC-INSTRUCTOR-001 흐름이 활성

**When**
1. `src/lib/ai/claude.ts` 파일을 열어 `callClaude` export 시그니처 확인.
2. 강사 만족도 요약 화면(예: `/instructors/{id}` 상세 또는 SPEC-INSTRUCTOR-001에서 정의된 진입점)을 사용한다.
3. `pnpm test src/lib/ai` 실행.

**Then**
- `callClaude` export가 그대로 존재하며 시그니처 변경이 없다 (git diff로 검증: `git diff main -- src/lib/ai/claude.ts` = 변경 없음).
- 강사 만족도 요약이 정상 호출되고 응답이 표시된다 (또는 fallback 메시지가 SPEC-INSTRUCTOR-001 정책대로 표시).
- `src/lib/ai/__tests__/*` 테스트 (있을 경우) 전부 PASS.
- 본 SPEC의 변경 파일 목록(spec.md §4.1)에 `src/lib/ai/claude.ts` 또는 `src/lib/ai/__tests__/*`가 포함되지 않았음을 git diff로 확인.

**Evidence**: `git diff main -- src/lib/ai/` 출력 = empty + 만족도 요약 동작 스크린샷.

---

## Definition of Done (DoD)

본 SPEC은 다음 모든 조건이 충족될 때 완료(`status: completed`)로 전환한다:

1. **AC-1 ~ AC-9 전부 PASS** (각 시나리오의 evidence가 PR 또는 progress.md에 첨부됨).
2. **TRUST 5 통과**:
   - **Tested**: 변경 라인 85%+ coverage (Phase 5 테스트 갱신 완료).
   - **Readable**: ESLint warning 0, 명명 일관성 (chip / category / skill 용어 통일).
   - **Unified**: Prettier/lint pass, import 정렬.
   - **Secured**: RLS 정책 변경 없음 (skill_categories는 read-only public, instructor_skills는 owner-only — 현행 보존). proficiency 제거가 보안 회귀를 야기하지 않음.
   - **Trackable**: `@MX:SPEC: SPEC-SKILL-ABSTRACT-001` 태그 ≥ 6 hit, conventional commit (`feat(skill): simplify taxonomy to 9 abstract categories (SPEC-SKILL-ABSTRACT-001)`) 사용.
3. **회귀 검증**:
   - SPEC-PROJECT-001 §5.4 가중치 (0.5/0.3/0.2) 변경 없음 (`grep` 또는 코드 리뷰).
   - SPEC-RECOMMEND-001 정렬 정책 변경 없음.
   - SPEC-INSTRUCTOR-001 callClaude 변경 없음.
4. **문서**:
   - 본 SPEC `status: draft` → `status: completed` 갱신.
   - `version: 0.1.0` → `version: 1.0.0` 갱신 (실제 구현 완료 시).
   - `updated` 필드 갱신.
   - HISTORY에 완료 항목 추가.
5. **데이터**:
   - `instructor_skills`, `project_required_skills` TRUNCATE 적용됨.
   - `skill_categories` = 9 row, 새 UUID + 이름 + sort_order.
   - `ai_instructor_recommendations` row count 변동 없음.
6. **머지 게이트**: PR가 main 브랜치에 직접 머지되지 않고 production push로만 배포됨 (memory: `project_deploy_workflow.md` 정합).

---

## 검증 책임 (Owner)

- **Phase 1 ~ 4 구현 책임**: manager-tdd → expert-backend / expert-frontend (per quality.yaml development_mode)
- **Phase 5 테스트 갱신**: expert-testing
- **Phase 6 최종 검증**: manager-quality + 사용자 수동 시나리오

---

**End of acceptance.md**
