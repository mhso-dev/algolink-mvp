# SPEC-PROJECT-AMEND-001 Compact

ID: SPEC-PROJECT-AMEND-001
Title: ALLOWED_TRANSITIONS Backward Edge for Reverse Compensation (assignment_confirmed → assignment_review)
Status: draft
Author: 철
Priority: high
Created / Updated: 2026-04-29 (v0.1.0 — 초기 작성)

Extends (does not modify): SPEC-PROJECT-001 (`validateTransition` + `ALLOWED_TRANSITIONS` 정의 — frozen, 본 SPEC은 amendment 형태로 그래프만 확장)
Resolves (follow-up): SPEC-CONFIRM-001 v0.2.0 §HIGH-2 임시 bypass (`__bypassValidateTransitionForResponseDowngrade`) — 본 SPEC 머지로 정식 backward edge 채택, bypass 함수 정의 + 호출 사이트 모두 제거
Depends on: SPEC-PROJECT-001 (완료, 기준선), SPEC-PAYOUT-002 (완료, `instructor_withdrawn` 14번째 enum value), SPEC-DB-001 (완료, `project_status_history` 트리거)

---

## Summary

SPEC-CONFIRM-001 v0.2.0 §HIGH-2 (REQ-CONFIRM-EFFECTS-008)는 강사가 1시간 변경 윈도 내 `instructor_responses.status`를 accept→decline/conditional로 다운그레이드할 때 `projects.status`를 `assignment_confirmed → assignment_review`로 되돌리는 보상 트랜잭션을 정의했다. 그러나 SPEC-PROJECT-001 `ALLOWED_TRANSITIONS.assignment_confirmed = ["education_confirmed", "recruiting", "instructor_withdrawn"]`에 backward edge가 부재하여 `validateTransition`가 `{ ok: false }`를 반환했다. SPEC-CONFIRM-001 v0.2.0은 임시 bypass 함수 `__bypassValidateTransitionForResponseDowngrade`로 우회했으며 본 SPEC을 follow-up으로 위임했다.

본 SPEC의 산출물:
1. `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가 (1라인)
2. 임시 bypass 함수 정의 + 호출 사이트 모두 제거 (정식 `validateTransition` 경로로 교체)
3. `validateTransition('assignment_confirmed', 'assignment_review')` 단위 테스트 신규 4종 추가
4. `project_status_history` 트리거 (SPEC-DB-001)가 backward edge 행 자동 INSERT (트리거 변경 없음)
5. SPEC-CONFIRM-001 §M6 통합 테스트 (accept→decline 보상)가 bypass 미사용으로 PASS

코드 변경 범위: `src/lib/projects/status-machine.ts` 1파일 + 단위 테스트 1파일. 마이그레이션 / RLS / UI / Server Actions / 신규 도메인 모듈 변경 없음.

---

## EARS Requirements

### REQ-AMEND-TRANSITIONS — ALLOWED_TRANSITIONS 그래프 확장

- **REQ-AMEND-TRANSITIONS-001 (Ubiquitous)**: `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가, 결과 배열은 `["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"]` 4개 항목. 인접 JSDoc/주석에 backward edge가 SPEC-CONFIRM-001 §HIGH-2 응답 다운그레이드 보상 경로임을 명시.
- **REQ-AMEND-TRANSITIONS-002 (Ubiquitous)**: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출이 `{ ok: true }` 반환. 함수 본문 변경 없음 (그래프 lookup만 사용).
- **REQ-AMEND-TRANSITIONS-003 (Ubiquitous)**: `ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]>` exhaustiveness 보존 — 14개 키 (13 SPEC-PROJECT-001 + `instructor_withdrawn` SPEC-PAYOUT-002) 모두 정의 유지. `tsc --noEmit` 0 에러.

### REQ-AMEND-BYPASS — 임시 우회 경로 제거

- **REQ-AMEND-BYPASS-001 (Unwanted Behavior)**: `__bypassValidateTransitionForResponseDowngrade` 함수 정의가 코드베이스에 잔존하면 정의 제거. `grep -rn "__bypass..." src/ tests/` 0행 검증.
- **REQ-AMEND-BYPASS-002 (Unwanted Behavior)**: 모든 호출 사이트 (SPEC-CONFIRM-001 implementation의 응답 다운그레이드 트랜잭션 등)는 정식 `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 경로로 교체. 인접 `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up` 주석 제거.
- **REQ-AMEND-BYPASS-003 (Ubiquitous)**: SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 step 5의 `console.warn` 감사 라인 (`[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>`) 그대로 유지 (NODE_ENV 무관).

### REQ-AMEND-AUDIT — project_status_history audit trail 보존

- **REQ-AMEND-AUDIT-001 (Event-Driven)**: SPEC-CONFIRM-001 보상 트랜잭션의 `UPDATE projects SET status = 'assignment_review' WHERE id = $projectId AND status = 'assignment_confirmed'`에 SPEC-DB-001 `project_status_history` 트리거가 자동 반응하여 history 행 INSERT (`from_status='assignment_confirmed'`, `to_status='assignment_review'`, `changed_at=now()`). 트리거 변경 0건.
- **REQ-AMEND-AUDIT-002 (Ubiquitous)**: backward edge UPDATE도 forward edge UPDATE와 동일 shape의 history 행 INSERT (별도 컬럼 / 플래그 불필요).

### REQ-AMEND-TESTS — 단위 + 통합 테스트 커버리지

- **REQ-AMEND-TESTS-001 (Ubiquitous)**: `src/lib/projects/__tests__/status-machine.test.ts` (또는 동등) 에 4종 신규 케이스:
  - A: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null }) → { ok: true }`
  - B: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'uuid' }) → { ok: true }` (REQ-PROJECT-STATUS-003 가드는 to === 'assignment_confirmed'에만 적용)
  - C: `validateTransition('assignment_review', 'assignment_review', { instructorId: null }) → { ok: false, reason: '현재 상태와 동일한 단계로 전환할 수 없습니다.' }`
  - D: `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4 && includes('assignment_review')`
- **REQ-AMEND-TESTS-002 (Ubiquitous)**: SPEC-PROJECT-001 기존 단위 테스트 회귀 0건. forward edge 7+ 케이스 (`assignment_review → assignment_confirmed`, `assignment_confirmed → education_confirmed/recruiting/instructor_withdrawn`, REQ-PROJECT-STATUS-003/-004 가드) 모두 PASS 유지.
- **REQ-AMEND-TESTS-003 (Event-Driven)**: SPEC-CONFIRM-001 §M6 시나리오 4 (1시간 윈도 내 accept→decline 보상 트랜잭션) 가 bypass 미사용으로 PASS. 통합 테스트는 SPEC-CONFIRM-001 plan.md M6 책임.
- **REQ-AMEND-TESTS-004 (Ubiquitous)**: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` → 0행 회귀 가드. M1 acceptance gate.

### REQ-AMEND-EXHAUSTIVE — TypeScript exhaustiveness 보존

- **REQ-AMEND-EXHAUSTIVE-001 (Ubiquitous)**: `ALLOWED_TRANSITIONS` 14개 `ProjectStatus` 키 (proposal, contract_confirmed, lecture_requested, instructor_sourcing, assignment_review, assignment_confirmed, education_confirmed, recruiting, progress_confirmed, in_progress, education_done, settlement_in_progress, task_done, instructor_withdrawn) 모두 정의 유지.
- **REQ-AMEND-EXHAUSTIVE-002 (Ubiquitous)**: 신규 entry `'assignment_review'`는 valid `ProjectStatus` enum value. 비-enum string 추가 시 TypeScript 컴파일 에러로 즉시 차단.

---

## Acceptance Scenarios (Given-When-Then 요약)

### Scenario 1: backward edge 정식 통과 (REQ-AMEND-TRANSITIONS-001/-002)

- Given: 본 SPEC 적용 후 `ALLOWED_TRANSITIONS.assignment_confirmed = ["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"]`
- When: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null | 'uuid' })` 호출
- Then: 두 케이스 모두 `{ ok: true }` 반환

### Scenario 2: bypass 함수 잔존 0건 (REQ-AMEND-BYPASS-001/-002, REQ-AMEND-TESTS-004)

- Given: 본 SPEC + SPEC-CONFIRM-001 implementation이 동일 PR 머지
- When: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/`
- Then: 결과 0행 (정의 + 호출 + import 모두 부재)

### Scenario 3: SPEC-CONFIRM-001 §HIGH-2 reverse compensation 정상 동작 (REQ-AMEND-TESTS-003)

- Given: 강사 accept (T0) → 1시간 윈도 내 (T0+30m) 강사 decline 시도
- When: SPEC-CONFIRM-001 보상 트랜잭션 실행 — step 2의 `validateTransition` 호출이 `{ ok: true }` 반환 (bypass 미사용)
- Then: 트랜잭션 정상 commit. `instructor_responses.status = 'declined'`, `projects.status = 'assignment_review'`, `projects.instructor_id = NULL`, `schedule_items` 0행, `notifications` 새 행 1개, `console.warn` 1회

### Scenario 4: project_status_history 자동 audit trail (REQ-AMEND-AUDIT-001/-002)

- Given: Scenario 3와 동일 셋업
- When: forward (accept) + backward (decline) UPDATE 두 번 commit
- Then: `project_status_history` 정확히 2행. 첫 행 `(from='assignment_review', to='assignment_confirmed')`, 두 번째 행 `(from='assignment_confirmed', to='assignment_review')`. 트리거 변경 0건

### Scenario 5: TypeScript exhaustiveness 보존 (REQ-AMEND-EXHAUSTIVE-001/-002)

- Given: `ProjectStatus` enum 14개 값
- When: `pnpm typecheck` 실행
- Then: 0 에러. `Object.keys(ALLOWED_TRANSITIONS).length === 14`. 단위 테스트로 14개 키 존재 + array shape 검증

### Scenario 6: 다른 ALLOWED transitions 회귀 0건 (REQ-AMEND-TESTS-002)

- Given: 본 SPEC 적용 전 SPEC-PROJECT-001 + SPEC-PAYOUT-002 단위 테스트 PASS
- When: `pnpm test:unit` 전체 실행 + 7+ forward/거부 케이스 호출
- Then: case A `assignment_review → assignment_confirmed` (강사 배정 시) `{ ok: true }`, case B 강사 미배정 시 `{ ok: false, '강사를 배정해야 컨펌 단계로 이동할 수 있습니다.' }`, case C/D 다른 forward edge `{ ok: true }`, case F `task_done → in_progress` `{ ok: false, '허용되지 않은 상태 전환입니다.' }`. 회귀 0건

---

## Affected Files

- 수정: `src/lib/projects/status-machine.ts` (1라인 추가 + 주석 갱신, bypass 함수 제거)
- 수정: `src/lib/projects/__tests__/status-machine.test.ts` (단위 테스트 4종 추가)
- 변경 없음: 마이그레이션, RLS 정책, UI, 라우트, Server Actions, 신규 도메인 모듈, `ProjectStatus` enum, `TransitionContext` / `TransitionResult` 타입, `validateTransition` 함수 본문, 다른 `ALLOWED_TRANSITIONS` 항목

---

## Out of Scope (Exclusions — What NOT to Build)

- 신규 마이그레이션 0건 (`project_status_history` 트리거가 모든 UPDATE에 자동 반응)
- 신규 RLS 정책 0건
- UI / 라우트 / Server Actions / 도메인 모듈 변경 0건
- 다른 enum value backward edge 추가 (예: `instructor_sourcing → lecture_requested`) — 별도 SPEC 위임
- operator 측 force-reset / 응답 무효화 admin UI — SPEC-ADMIN-001 위임
- SPEC-PROJECT-001 spec.md 본문 수정 — frozen, amendment 형태로만 그래프 확장
- `validateTransition` 함수 시그니처 변경 0건
- 다국어 — 한국어 단일

---

## Definition of Done

### Build & Type
- `pnpm build` 0 에러
- `pnpm typecheck` 0 에러 (14 keys exhaustiveness 보존)
- `pnpm lint` 0 에러

### Unit Tests
- 신규 4종 (REQ-AMEND-TESTS-001 A/B/C/D) PASS
- SPEC-PROJECT-001 / SPEC-PAYOUT-002 기존 단위 테스트 회귀 0건
- `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4 && includes('assignment_review')` PASS

### Integration (SPEC-CONFIRM-001 §M6 위임)
- SPEC-CONFIRM-001 시나리오 4 (1시간 윈도 accept→decline 보상) bypass 미사용 PASS
- `project_status_history` backward edge 자동 INSERT 검증

### Code Quality
- `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` → 0행
- 변경 파일 정확히 2개 + (동일 PR 내) SPEC-CONFIRM-001 implementation의 bypass 호출 라인 교체
- 다른 ALLOWED_TRANSITIONS 항목 변경 0건 (회귀 가드)
- `validateTransition` 함수 본문 변경 0건

### Documentation
- HISTORY 갱신 (구현 완료 시점)
- (선택) SPEC-CONFIRM-001 v0.2.1 doc-only amendment로 §4.8 + §8 갱신 (별도 commit 가능)

---

## Risks (요약)

- 다른 곳에서 `__bypass...` 사용 가능성 → grep 검증 필수 (REQ-AMEND-TESTS-004)
- `project_status_history` 트리거가 backward edge에 반응하지 않을 가능성 → 통합 테스트 검증 (Scenario 4)
- TypeScript exhaustiveness `instructor_withdrawn` 14번째 키 누락 가능성 → `tsc --noEmit` 게이트 (Scenario 5)
- SPEC-CONFIRM-001 implementation 시 bypass 코드 잠시 잔존 가능성 → 동일 PR `feature/SPEC-CONFIRM-001` 처리로 시간차 0 (게이트 5.3)

---

_End of spec-compact.md_
