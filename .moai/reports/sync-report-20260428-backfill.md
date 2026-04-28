# Sync Report — Backfill 2026-04-28

**실행일**: 2026-04-28
**Branch**: feature/spec-project-001
**대상**: SPEC-DASHBOARD-001, SPEC-INSTRUCTOR-001, SPEC-ME-001, SPEC-PROJECT-001
**모드**: Auto (질문 없음, 끝까지 실행)

---

## Phase 1.5 — 구현 vs SPEC 다이버전스 분석

| SPEC | 구현 완성도 | 상태 전환 | 주요 다이버전스 |
|------|------------|-----------|----------------|
| SPEC-DASHBOARD-001 | M1~M6 전체 완료 | `draft` → `completed` | FullCalendar 즉시 채택(스파이크 생략), 컴포넌트 네이밍 혼재(advisory) |
| SPEC-INSTRUCTOR-001 | M1~M6 전체 완료 | `draft` → `completed` | `link-user.ts` 미명세 추가, `satisfaction-range-slider.tsx` 미구현(text input 대체), `skills.ts` 미구현(inline 처리) |
| SPEC-ME-001 | M2/M4/M6 완료, M3/M5/M7/M8 지연 | `draft` → `in-progress` | `resume-mask.ts`, `settlement-summary.ts`, `pii-encrypt.ts` 사전 구현(prep), SkillsPicker/일정/정산/PDF 지연 |
| SPEC-PROJECT-001 | 핵심 기능 완료, 일부 지연 | `draft` → `in-progress` | `list-queries.ts`(복수형) 별도 추가, create/edit 폼 분리, `next-param.test.ts` 회귀 수정, q-ILIKE 일부 미완 |

---

## Phase 2.4 — Frontmatter 업데이트

| 파일 | 이전 status | 이후 status | 이전 version | 이후 version |
|------|------------|------------|-------------|-------------|
| SPEC-DASHBOARD-001/spec.md | draft | completed | 1.0.0 | 1.1.0 |
| SPEC-INSTRUCTOR-001/spec.md | draft | completed | 0.1.0 | 1.1.0 |
| SPEC-ME-001/spec.md | draft | in-progress | 0.1.0 | 1.1.0 |
| SPEC-PROJECT-001/spec.md | draft | in-progress | 0.1.0 | 1.1.0 |

updated: 모두 `2026-04-28` 으로 갱신.

---

## Phase 2.2.1 — Implementation Notes 섹션 추가

각 spec.md 하단에 `## Implementation Notes` 섹션 추가 완료:
- 커밋 목록 (git log 기준)
- 완료 마일스톤 체크리스트
- 지연 항목 테이블 (ME-001, PROJECT-001)
- 다이버전스 분석 (카테고리: scope_expansion, unplanned_addition, structural_change, deferred)
- 검증 결과 (단위 테스트 통과 여부, Vitest 273 tests)

---

## Phase 0.6 — MX Tag Validation

### P1 스캔 결과 (exported function fan_in >= 3, ANCHOR 누락)

| 파일 | 함수 | fan_in | 결과 |
|------|------|--------|------|
| `src/lib/dashboard/types.ts` | STATUS_COLUMN_MAP | ≥4 | ANCHOR 기존 존재 ✅ |
| `src/lib/recommend/score.ts` | scoreInstructor | ≥3 | ANCHOR 기존 존재 ✅ |
| `src/lib/instructor/settlement-summary.ts` | 주요 함수 | ≥3 | ANCHOR + WARN 기존 존재 ✅ |
| `src/lib/instructor/queries.ts` | 쿼리 함수들 | =2 | NOTE 추가 (P3 advisory, fan_in<3) |

**P1 위반: 0건** (기존 ANCHOR 태그 커버리지 우수)

### P2 스캔 결과 (async/await without try-catch)

- `app/(operator)/instructors/[id]/actions.ts` — try-catch 존재 ✅
- `app/(operator)/projects/[id]/actions.ts` — try-catch 존재 ✅
- `src/lib/ai/*.ts` — 에러 처리 패턴 적용 ✅

**P2 위반: 0건**

### 신규 MX 태그

| 파일 | 태그 | 내용 |
|------|------|------|
| `src/lib/instructor/queries.ts` | `@MX:NOTE` (P3 advisory) | 강사 도메인 기본 쿼리 허브, fan_in=2, 임계값 도달 시 ANCHOR 승격 |

---

## Phase 2.2.5 — Project Document Updates

### `.moai/project/tech.md`
- FullCalendar v6.1.20 버전 명시, 구성 패키지 나열
- @dnd-kit (core^6.3.1, sortable^10.0.0) 추가
- date-fns ^4.1.0 + date-fns-tz ^3.2.0 추가
- react-day-picker ^9.14.0 추가
- @anthropic-ai/sdk ^0.91.1 버전 명시 + Prompt Caching 설정 상세화
- ADR-006~ADR-008 추가 (FullCalendar, @dnd-kit, date-fns-tz 선택 근거)
- Version: 0.1.0 → 1.1.0

### `.moai/project/structure.md`
- `src/lib/`: 실제 구현된 디렉터리로 갱신 (dashboard, instructor, projects, recommend, ai, validation)
- `src/components/`: 실제 구현 반영 (app, dashboard, instructor, projects, resume)
- SPEC 완료 상태 마킹 (✅ / ⏳)
- Version: 0.1.0 → 1.1.0

### `.moai/project/product.md`
- F-101~F-104 구현 상태 마킹 (✅ 완료 / 🔄 부분 구현 / ⏳ 지연)
- F-201 완료 마킹 (SPEC-DASHBOARD-001)
- F-202 부분 구현 상세 (SPEC-PROJECT-001)
- F-203 완료 마킹 (SPEC-INSTRUCTOR-001)
- Version: 0.1.0 → 1.1.0

---

## Lessons Capture

3개 lesson을 `~/.claude/projects/.../memory/lessons.md`에 저장:

| ID | Category | 요약 |
|----|----------|------|
| LESSON-001 | workflow | Worktree isolation 경로 규칙 (절대경로 금지, 상대경로 사용) |
| LESSON-002 | architecture | 플레이스홀더 방지 — 미구현은 Deferred Items로 명시 |
| LESSON-003 | testing | 인증/가드 핵심 경로 변경 시 즉시 회귀 테스트 확인 |

---

## 변경 파일 목록

```
.moai/specs/SPEC-DASHBOARD-001/spec.md      # status+version+Implementation Notes
.moai/specs/SPEC-INSTRUCTOR-001/spec.md     # status+version+Implementation Notes
.moai/specs/SPEC-ME-001/spec.md             # status+version+Implementation Notes
.moai/specs/SPEC-PROJECT-001/spec.md        # status+version+Implementation Notes
.moai/project/tech.md                        # 신규 의존성, ADR 추가
.moai/project/structure.md                  # 실제 디렉터리 반영
.moai/project/product.md                    # F-101~F-203 구현 상태 마킹
src/lib/instructor/queries.ts               # @MX:NOTE 추가 (P3 advisory)
```

---

## @MX Tag Report — Backfill — 2026-04-28

### Tags Added (1)
- `src/lib/instructor/queries.ts`: `@MX:NOTE` [AUTO] — 강사 도메인 기본 쿼리 허브, fan_in 모니터링

### Tags Removed (0)

### Tags Updated (0)

### Attention Required
- `src/lib/instructor/queries.ts`: fan_in이 3에 도달하면 @MX:ANCHOR로 수동 승격 필요
- SPEC-ME-001 M3(SkillsPicker), M5(정산 조회): SPEC-DB-002 완료 후 재개 예정
- SPEC-PROJECT-001: q-파라미터 ILIKE 전체 구현, Playwright E2E 미완

---

Executed by: manager-docs
Report generated: 2026-04-28
