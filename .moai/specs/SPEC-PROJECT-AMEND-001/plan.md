---
spec_id: SPEC-PROJECT-AMEND-001
version: 0.1.0
created: 2026-04-29
updated: 2026-04-29
author: 철
---

# Plan: SPEC-PROJECT-AMEND-001 ALLOWED_TRANSITIONS Backward Edge 구현 계획

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. 단일 마일스톤 M1 — `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가 + 임시 bypass 함수 제거 + 단위 테스트 4종 추가. 의존성: SPEC-CONFIRM-001 implementation (REQ-CONFIRM-EFFECTS-008) 통합 — 동일 PR `feature/SPEC-CONFIRM-001`에서 처리. SPEC-CONFIRM-001 v0.2.1 doc-only amendment(§4.8 affected files 노트 갱신, §HIGH-2 risk 행 상태 갱신)는 별도 commit 또는 별도 amendment SPEC으로 처리 가능.

---

## 1. 개요

본 plan은 SPEC-PROJECT-AMEND-001 의 단일 마일스톤 M1 — ALLOWED_TRANSITIONS 그래프 확장 + 임시 bypass 함수 제거 + 단위 테스트 4종 추가 — 를 구현하기 위한 계획이다. 시간 추정은 사용하지 않으며, 우선순위 라벨(High) + 의존성 표기로 작업 순서를 정의한다.

브라운필드 환경(Next.js 16 + Supabase + Drizzle 기존 코드베이스) + TDD 모드(quality.development_mode = tdd)에 맞춰 RED-GREEN-REFACTOR 사이클을 적용한다. 본 SPEC은 변경 범위가 매우 작으므로(1라인 그래프 추가 + 단위 테스트 4종 + bypass 제거) 단일 마일스톤으로 충분하다.

---

## 2. 마일스톤 분해

| ID | 제목 | Priority | 산출물 |
|----|------|----------|--------|
| M1 | ALLOWED_TRANSITIONS 확장 + bypass 제거 + 단위 테스트 추가 | High | `src/lib/projects/status-machine.ts` 변경 + `src/lib/projects/__tests__/status-machine.test.ts` 변경 |

---

## 3. 마일스톤 상세

### M1: ALLOWED_TRANSITIONS 확장 + bypass 제거 + 단위 테스트 (Priority: High)

**목표**: SPEC-PROJECT-001 `ALLOWED_TRANSITIONS` 그래프에 `assignment_confirmed → assignment_review` 정식 backward edge 추가, SPEC-CONFIRM-001 v0.2.0 §HIGH-2 임시 bypass 함수 정의/호출 모두 제거, 신규 단위 테스트 4종 PASS, 기존 테스트 회귀 0건.

**선행 조건**:

- SPEC-PROJECT-001 머지 완료 (`validateTransition` + `ALLOWED_TRANSITIONS` 정의 보유) ✅
- SPEC-PAYOUT-002 머지 완료 (`instructor_withdrawn` 14번째 enum value 추가됨) ✅
- SPEC-DB-001 머지 완료 (`project_status_history` 트리거 정의 보유) ✅
- SPEC-CONFIRM-001 v0.2.0 머지 또는 동일 PR(`feature/SPEC-CONFIRM-001`)에서 병행 처리 (REQ-CONFIRM-EFFECTS-008 implementation이 본 SPEC backward edge를 활용) ✅ (게이트 5.3 사용자 결정)

**작업 항목**:

1. **(Pre-RED)** 기존 코드 읽기:
   - `src/lib/projects/status-machine.ts` 전체 파일 — `ALLOWED_TRANSITIONS` 정의 + `validateTransition` 함수 + 가드 로직 확인
   - `src/lib/projects/__tests__/status-machine.test.ts` (또는 동등 위치) — 기존 단위 테스트 패턴 + describe 구조 확인
   - `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` — bypass 함수가 코드베이스에 잔존하는지 확인. 잔존 시 정의 위치 + 호출 사이트 모두 식별

2. **RED**: 신규 단위 테스트 4종 작성 (REQ-AMEND-TESTS-001 A/B/C/D)
   - Test A: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` → `{ ok: true }`
   - Test B: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' })` → `{ ok: true }`
   - Test C: `validateTransition('assignment_review', 'assignment_review', { instructorId: null })` → `{ ok: false, reason: '현재 상태와 동일한 단계로 전환할 수 없습니다.' }` (자기참조 거부 회귀 가드)
   - Test D: `ALLOWED_TRANSITIONS.assignment_confirmed.includes('assignment_review') === true` + `length === 4`
   - `pnpm test src/lib/projects/__tests__/status-machine.test.ts` 실행 → Test A/B/D fail (그래프 미확장), Test C는 PASS (자기참조 거부는 기존 가드)

3. **GREEN**: ALLOWED_TRANSITIONS 그래프 확장
   - `src/lib/projects/status-machine.ts` line 96 `assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn"],` 를 `assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"],` 로 변경
   - JSDoc/주석에 backward edge 의미 설명 추가:
     ```typescript
     /**
      * 허용된 상태 전환 그래프 (REQ-PROJECT-STATUS-002).
      * 자유 전환을 막아 워크플로우 무결성을 강제한다.
      *
      * SPEC-PAYOUT-002 §M6 — `instructor_withdrawn`은 강사 재배정 단계로의 regression entry이며,
      * 다른 status에서 자유롭게 전환되지 않는다. 진입은 `withdrawInstructorAction` Server Action으로만,
      * 회복은 다시 `lecture_requested`/`instructor_sourcing`로의 forward 전환만 허용.
      *
      * SPEC-PROJECT-AMEND-001 — `assignment_confirmed → assignment_review` backward edge는
      * SPEC-CONFIRM-001 §HIGH-2 1시간 변경 윈도 내 강사 응답 다운그레이드(accepted → declined/conditional)
      * 보상 트랜잭션 (REQ-CONFIRM-EFFECTS-008)의 정식 경로다. 그 외 호출 사이트에서 사용 금지.
      */
     ```
   - `pnpm test src/lib/projects/__tests__/status-machine.test.ts` 재실행 → 4종 모두 PASS

4. **GREEN (cont.)**: 임시 bypass 함수 제거
   - `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` 실행
   - 잔존 시:
     - `src/lib/projects/status-machine.ts` 의 함수 정의 제거 (export 라인 + 구현 라인)
     - 호출 사이트 (예: `src/app/(app)/(instructor)/me/assignments/actions.ts`, `src/lib/responses/...`)의 import 제거 + 호출을 정식 `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 로 교체
     - 인접한 `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up: backward transition not yet supported in ALLOWED_TRANSITIONS graph` 주석 제거 (이제 backward edge가 정식이므로 WARN 불필요)
   - `console.warn` 감사 라인은 SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 step 5의 무관한 부분이므로 그대로 유지 (`[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>`)
   - 동일 PR에서 SPEC-CONFIRM-001 implementation과 병행 처리되므로 시나리오 B (bypass 코드베이스에 상존하지 않음) 채택. 잔존 0건이 자연스러운 결과
   - `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` 재실행 → 0행 확인

5. **REFACTOR**: 가독성 개선 (최소화 원칙)
   - 본 SPEC의 변경 범위를 의도적으로 최소화. `validateTransition` 함수 본문 변경 0건, 다른 ALLOWED_TRANSITIONS 항목 변경 0건
   - 주석만 정리 (line 86-89의 SPEC-PAYOUT-002 주석 옆에 SPEC-PROJECT-AMEND-001 주석 추가)
   - `pnpm test:unit` 전체 실행 → SPEC-PROJECT-001 기존 단위 테스트 + SPEC-PAYOUT-002 단위 테스트 + 신규 4종 모두 PASS 확인
   - `pnpm typecheck` → 0 에러 (TypeScript exhaustiveness 보존)
   - `pnpm lint` → 0 에러 / 0 경고
   - `pnpm build` → 0 에러

6. **(Optional) 통합 검증**: SPEC-CONFIRM-001 §M6 통합 테스트가 동일 PR에서 작성되는 경우, accept→decline 보상 트랜잭션 시나리오가 bypass 미사용으로 PASS하는지 확인. 본 SPEC은 단위 레벨 게이트만 책임지며, 통합 레벨 검증은 SPEC-CONFIRM-001 plan.md M6의 책임.

**검증**:

- [ ] `pnpm test src/lib/projects/__tests__/status-machine.test.ts` 신규 4종 + 기존 케이스 모두 PASS
- [ ] `pnpm test:unit` 전체 0 failure (회귀 0건)
- [ ] `pnpm typecheck` 0 에러
- [ ] `pnpm lint` 0 에러
- [ ] `pnpm build` 0 에러
- [ ] `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` → 0행
- [ ] `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4` 단위 테스트 PASS
- [ ] (통합) SPEC-CONFIRM-001 §M6 시나리오 4 (accept→decline 보상 트랜잭션) bypass 미사용 PASS — SPEC-CONFIRM-001 plan.md M6 책임
- [ ] (통합) SPEC-DB-001 `project_status_history` 트리거가 backward edge UPDATE 행 자동 INSERT — SPEC-CONFIRM-001 plan.md M6 책임

**TDD 사이클**:

- RED: 4종 단위 테스트 작성 후 Test A/B/D fail
- GREEN: ALLOWED_TRANSITIONS 1라인 추가 후 모두 PASS + bypass 제거 후에도 PASS
- REFACTOR: 주석 정리, 다른 변경 0건

**M1 Acceptance Gate** [HARD]:

1. **단위 테스트 PASS**: 신규 4종 + SPEC-PROJECT-001 기존 단위 테스트 모두 PASS
2. **회귀 0건**: SPEC-PROJECT-001 / SPEC-PAYOUT-002 / SPEC-CONFIRM-001 (동일 PR 내 implementation) 단위 테스트 모두 PASS
3. **bypass 잔존 0건**: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` 결과 0행
4. **TypeScript exhaustiveness 보존**: `pnpm typecheck` 0 에러, `ALLOWED_TRANSITIONS` 타입 `Record<ProjectStatus, readonly ProjectStatus[]>` 유지
5. **빌드 / 린트 0 에러**: `pnpm build && pnpm lint` PASS

---

## 4. 정의된 (Definition of Done)

본 SPEC의 완료 조건:

### 코드 변경

- [ ] `src/lib/projects/status-machine.ts` line 96 (또는 동등 위치)의 `assignment_confirmed` 배열에 `'assignment_review'` 추가됨
- [ ] 인접한 JSDoc/주석에 SPEC-PROJECT-AMEND-001 backward edge 설명 추가됨
- [ ] 함수 정의 `__bypassValidateTransitionForResponseDowngrade` 제거됨 (있었다면)
- [ ] 모든 호출 사이트(`grep -rn "__bypass..." src/ tests/`)에서 정식 `validateTransition` 호출로 교체됨
- [ ] `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up` 주석 제거됨 (있었다면)

### 단위 테스트

- [ ] 신규 4종 케이스 추가 (REQ-AMEND-TESTS-001 A/B/C/D)
- [ ] `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` → `{ ok: true }` PASS
- [ ] `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' })` → `{ ok: true }` PASS (REQ-PROJECT-STATUS-003 가드 미적용 검증)
- [ ] `validateTransition('assignment_review', 'assignment_review', { instructorId: null })` → `{ ok: false }` PASS (자기참조 거부)
- [ ] `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4` + `includes('assignment_review')` PASS
- [ ] SPEC-PROJECT-001 기존 단위 테스트 회귀 0건

### 통합 검증 (SPEC-CONFIRM-001 plan.md M6에 위임)

- [ ] SPEC-CONFIRM-001 §M6 통합 테스트 시나리오 4 (1시간 윈도 내 accept→decline 보상 트랜잭션) bypass 미사용으로 PASS
- [ ] `project_status_history` 트리거가 backward edge UPDATE 행 자동 INSERT (`from_status='assignment_confirmed'`, `to_status='assignment_review'`)

### 회귀 게이트

- [ ] `pnpm typecheck` 0 에러
- [ ] `pnpm lint` 0 에러 / 0 경고 (`src/lib/projects/` 영역)
- [ ] `pnpm test:unit` 전체 PASS (SPEC-PROJECT-001 + SPEC-PAYOUT-002 + 신규 4종)
- [ ] `pnpm build` 0 에러

### Code Quality

- [ ] `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` → 0행
- [ ] 변경 파일 수: 정확히 2개 (`status-machine.ts` + `status-machine.test.ts`) + 동일 PR 내 SPEC-CONFIRM-001 implementation 파일들의 bypass 호출 라인 교체
- [ ] 다른 ALLOWED_TRANSITIONS 항목 변경 0건 (회귀 가드)
- [ ] `validateTransition` 함수 본문 변경 0건 (회귀 가드)
- [ ] `ProjectStatus` enum 변경 0건

### Documentation

- [ ] HISTORY 항목 갱신 (구현 완료 시점, 본 SPEC v0.1.0 status `draft → completed` 또는 PR 머지 후 별도 amendment)
- [ ] (선택) SPEC-CONFIRM-001 v0.2.1 doc-only amendment로 §4.8 affected files 노트 갱신 + §8 Risks 마지막 행 상태를 "해결됨" 으로 변경 — 동일 PR 내 별도 commit으로 처리 가능

---

## 5. 의존성 / 순서

본 SPEC은 단일 마일스톤이므로 의존성 그래프는 단순하다.

```
SPEC-PROJECT-001 (완료) ─┐
SPEC-PAYOUT-002 (완료) ──┼─→ SPEC-PROJECT-AMEND-001 M1 ─→ SPEC-CONFIRM-001 §M6 통합 검증 (동일 PR)
SPEC-DB-001 (완료) ──────┘
SPEC-CONFIRM-001 v0.2.0 (병행) ─┘
```

- SPEC-PROJECT-001, SPEC-PAYOUT-002, SPEC-DB-001는 모두 머지 완료 상태이므로 본 SPEC은 즉시 진행 가능
- SPEC-CONFIRM-001 implementation(`feature/SPEC-CONFIRM-001` PR)과 병행 처리되며, manager-tdd가 SPEC-CONFIRM-001 §HIGH-2 구현 시 본 SPEC의 backward edge가 이미 정의되어 있다고 가정하고 작성하면 자연스럽게 bypass 미사용 경로가 만들어짐

---

## 6. SPEC-CONFIRM-001 / SPEC-PROJECT-001 보존 체크리스트

각 마일스톤 종료 시 다음을 확인한다:

### SPEC-PROJECT-001 보존

- [ ] `ProjectStatus` enum 13개 값 + SPEC-PAYOUT-002의 `instructor_withdrawn` (총 14개) 정의 그대로 보존
- [ ] `validateTransition` 함수 시그니처 + 본문 로직 (REQ-PROJECT-STATUS-002~004 가드) 변경 없음
- [ ] `ALLOWED_TRANSITIONS.assignment_review`(forward edge) 변경 없음
- [ ] 다른 12개 키(`proposal`, `contract_confirmed`, ..., `task_done`, `instructor_withdrawn`) 변경 없음
- [ ] `TransitionContext` 인터페이스 / `TransitionResult` 타입 변경 없음
- [ ] SPEC-PROJECT-001 단위 테스트 회귀 0건

### SPEC-CONFIRM-001 보존

- [ ] REQ-CONFIRM-EFFECTS-008 보상 트랜잭션 step 1-5의 step 의미 변경 없음
- [ ] `console.warn` 감사 로그 (`[response:downgrade] ...`) 그대로 유지
- [ ] `instructor_responses` 마이그레이션 + 두 partial UNIQUE 인덱스 + RLS 정책 변경 없음
- [ ] `notifications` partial UNIQUE 인덱스 변경 없음
- [ ] SPEC-CONFIRM-001 §M6 통합 테스트 시나리오 4 PASS

### SPEC-DB-001 보존

- [ ] `project_status_history` 트리거 정의 변경 없음
- [ ] backward edge UPDATE도 forward edge UPDATE와 동일하게 history 행 INSERT (트리거 정의가 모든 UPDATE에 반응하므로 변경 불필요)

### SPEC-PAYOUT-002 보존

- [ ] `instructor_withdrawn` enum value 정의 변경 없음
- [ ] `userStepFromEnum('instructor_withdrawn') === '강사매칭'` 매핑 변경 없음
- [ ] SPEC-PAYOUT-002 단위 테스트 회귀 0건

---

## 7. Re-planning Triggers

(`.claude/rules/moai/workflow/spec-workflow.md` Re-planning Gate 적용)

다음 상황에서 재계획:

- `__bypassValidateTransitionForResponseDowngrade` grep 결과 잔존 → 호출 사이트 식별 후 정식 경로 교체 + 재검증
- TypeScript `tsc --noEmit` 에러 → exhaustiveness 위반 또는 타입 불일치 발견 → `ProjectStatus` enum 정의 확인 후 재시도
- SPEC-CONFIRM-001 §M6 통합 테스트가 backward edge 추가 후에도 fail → SPEC-DB-001 트리거 정의 확인 (트리거가 forward 전환에만 반응하도록 잘못 정의되어 있다면 별도 SPEC-DB-001 amendment 필요)
- SPEC-PROJECT-001 기존 단위 테스트 회귀 발생 → ALLOWED_TRANSITIONS 다른 항목 우발적 변경 검출 → 즉시 revert 후 재시도

---

## 8. 참고 자료

- [`spec.md`](./spec.md) — EARS 요구사항 + 영향 범위 + 기술 접근
- [`acceptance.md`](./acceptance.md) — Given/When/Then 시나리오 6건
- [`spec-compact.md`](./spec-compact.md) — EARS + 시나리오 압축본
- `.moai/specs/SPEC-PROJECT-001/spec.md` — 기준선
- `.moai/specs/SPEC-CONFIRM-001/spec.md` v0.2.0 §HIGH-2 — bypass 도입 배경
- `src/lib/projects/status-machine.ts` — 본 SPEC 변경 대상

---

_End of plan.md_
