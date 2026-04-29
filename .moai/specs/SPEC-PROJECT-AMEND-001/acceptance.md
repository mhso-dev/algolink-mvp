# SPEC-PROJECT-AMEND-001 Acceptance Criteria

각 시나리오는 Given / When / Then 형식이다. 모든 시나리오는 단위 테스트 또는 통합 테스트로 검증한다. SPEC-CONFIRM-001 §M6 통합 테스트와 연계된 시나리오는 동일 PR `feature/SPEC-CONFIRM-001` 내에서 manager-tdd가 SPEC-CONFIRM-001 implementation 단계에 작성한다.

---

## Scenario 1: ALLOWED_TRANSITIONS 그래프 정식 backward edge 통과

**REQ**: REQ-AMEND-TRANSITIONS-001, REQ-AMEND-TRANSITIONS-002

**Given**

- `src/lib/projects/status-machine.ts`의 `ALLOWED_TRANSITIONS.assignment_confirmed` 배열이 본 SPEC 머지로 인해 `["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"]` 4개 항목을 포함한다
- `validateTransition` 함수는 변경 없이 그대로다 (그래프 lookup만 사용)

**When**

- 단위 테스트 환경에서 다음 두 호출을 실행한다:
  - case A: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })`
  - case B: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'instructor-uuid-123' })`

**Then**

- case A 결과: `{ ok: true }` 반환 (정확히 일치)
- case B 결과: `{ ok: true }` 반환 (REQ-PROJECT-STATUS-003 가드는 `to === 'assignment_confirmed'`에만 적용되므로 backward edge는 `instructorId` 무관)
- 두 케이스 모두 `result.ok === true` 그리고 `(result as any).reason === undefined`
- TypeScript 컴파일 에러 0건 (`pnpm typecheck`)

---

## Scenario 2: Bypass 함수 잔존 0건 (grep 회귀 가드)

**REQ**: REQ-AMEND-BYPASS-001, REQ-AMEND-BYPASS-002, REQ-AMEND-TESTS-004

**Given**

- 본 SPEC + SPEC-CONFIRM-001 implementation이 동일 PR `feature/SPEC-CONFIRM-001` 에서 머지되었다
- 이전 단계(머지 전)에서 SPEC-CONFIRM-001 v0.2.0이 `__bypassValidateTransitionForResponseDowngrade` documented bypass 경로를 도입했었거나, 본 SPEC 시나리오 B(bypass 코드베이스에 상존하지 않음)대로 처음부터 정식 경로로 작성되었다

**When**

- 다음 grep 명령을 실행한다:
  ```bash
  grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/
  ```

**Then**

- grep 결과 행 수 === 0 (정확히 0행, 정의 + 호출 + import 모두 부재)
- 추가 검증: `grep -rn "// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up" src/` 도 0행 (해당 WARN 주석은 더 이상 적용되지 않음)
- (옵션) CI 또는 lint 단계에서 동일 grep을 회귀 가드로 추가 권장 (본 SPEC 범위 외)

---

## Scenario 3: SPEC-CONFIRM-001 §HIGH-2 reverse compensation 정상 동작 (bypass 미사용)

**REQ**: REQ-AMEND-TESTS-003, SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008

**Given**

- DB에 다음이 셋업되어 있다:
  - `projects` 행 1개: `id = $projectId`, `status = 'assignment_review'`, `instructor_id = $instructorId` (강사 배정됨)
  - `instructor_responses` 행 0개 (강사 미응답 상태)
- 강사 토큰으로 SPEC-CONFIRM-001 `respondToAssignment({ projectId, status: 'accepted' })` Server Action을 호출하여:
  - `instructor_responses` row 1개 INSERT (status='accepted', responded_at = T0)
  - `projects.status` UPDATE → `'assignment_confirmed'` (forward edge, validateTransition 통과)
  - `schedule_items` 1개 INSERT (`schedule_kind = 'system_lecture'`)
  - 운영자 `notifications` 1개 INSERT (`type = 'assignment_accepted'`)
- 시간이 T0 + 30분 (1시간 변경 윈도 내) 경과한다

**When**

- 강사 토큰으로 SPEC-CONFIRM-001 `respondToAssignment({ projectId, status: 'declined' })` Server Action을 다시 호출한다 (응답 다운그레이드)
- Server Action 내부에서 REQ-CONFIRM-EFFECTS-008 보상 트랜잭션이 실행된다:
  - step 1: `instructor_responses` UPDATE (status='declined', responded_at = T0+30m)
  - step 2: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출 → **본 SPEC 적용으로 `{ ok: true }` 반환** (bypass 미사용)
  - step 2 (cont.): `projects` UPDATE (`instructor_id = NULL`, `status = 'assignment_review'`)
  - step 3: `schedule_items` 하드 DELETE (직전 accept이 INSERT한 행)
  - step 4: 새 `notifications` 1개 INSERT (`type = 'assignment_declined'`)
  - step 5: `console.warn` 감사 라인 출력 (`[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=declined`)
- 트랜잭션 commit

**Then**

- 트랜잭션이 정상 commit (예외 발생 0건)
- `instructor_responses.status` === `'declined'` (UPDATE 반영)
- `projects.status` === `'assignment_review'` (backward edge 적용)
- `projects.instructor_id` === `NULL` (clear 됨)
- `schedule_items` 직전 INSERT 행 0개 존재 (하드 DELETE 됨)
- `notifications` 새 행 1개 존재 (`type = 'assignment_declined'`, `source_kind = 'assignment_request'`, `source_id = $projectId`)
- 콘솔 로그 `[response:downgrade] ...` 1회 출력
- **bypass 함수 호출 0건** — Server Action 코드가 `validateTransition` 정식 경로만 사용 (코드 inspection 또는 grep)
- 통합 테스트는 SPEC-CONFIRM-001 plan.md M6 시나리오 4로 자동화

---

## Scenario 4: project_status_history 트리거 audit trail 자동 기록

**REQ**: REQ-AMEND-AUDIT-001, REQ-AMEND-AUDIT-002

**Given**

- Scenario 3와 동일한 셋업 (강사 accept 후 1시간 윈도 내 decline)
- SPEC-DB-001의 `project_status_history` 트리거가 `projects.status` UPDATE에 반응하도록 정의되어 있다 (기존 트리거, 변경 없음)

**When**

- Scenario 3의 forward 단계 (강사 accept) 가 commit되어 `projects.status: assignment_review → assignment_confirmed` UPDATE 발생
- Scenario 3의 backward 단계 (강사 decline) 가 commit되어 `projects.status: assignment_confirmed → assignment_review` UPDATE 발생

**Then**

- 다음 SQL 쿼리 결과는 정확히 2행:
  ```sql
  SELECT from_status, to_status, changed_at
  FROM project_status_history
  WHERE project_id = $projectId
  ORDER BY changed_at ASC;
  ```
- 첫 번째 행: `from_status = 'assignment_review'`, `to_status = 'assignment_confirmed'` (forward, 강사 accept 시점)
- 두 번째 행: `from_status = 'assignment_confirmed'`, `to_status = 'assignment_review'` (backward, 강사 decline 시점)
- `changed_at` 시각 순서가 ASC로 정렬되어 audit trail 시계열 검증 가능
- backward edge UPDATE에 별도 트리거 변경 없이 자동 기록됨 (REQ-AMEND-AUDIT-002 — backward와 forward 행 shape 동일)

---

## Scenario 5: TypeScript exhaustiveness 보존 (`Record<ProjectStatus, ...>` 키 누락 0건)

**REQ**: REQ-AMEND-TRANSITIONS-003, REQ-AMEND-EXHAUSTIVE-001, REQ-AMEND-EXHAUSTIVE-002

**Given**

- `src/lib/projects/types.ts`(또는 동등 위치)에 정의된 `ProjectStatus` enum이 14개 값을 포함한다:
  - `proposal`, `contract_confirmed`, `lecture_requested`, `instructor_sourcing`, `assignment_review`, `assignment_confirmed`, `education_confirmed`, `recruiting`, `progress_confirmed`, `in_progress`, `education_done`, `settlement_in_progress`, `task_done`, `instructor_withdrawn`
- `ALLOWED_TRANSITIONS` 가 `Record<ProjectStatus, readonly ProjectStatus[]>` 타입으로 선언되어 있다

**When**

- 본 SPEC 적용 후 `pnpm typecheck` (즉 `tsc --noEmit`) 명령을 실행한다
- 단위 테스트에서 `Object.keys(ALLOWED_TRANSITIONS).length` 를 평가한다

**Then**

- `tsc --noEmit` 0 에러 (모든 14개 키 존재 + 모든 값이 valid `ProjectStatus[]` array)
- `Object.keys(ALLOWED_TRANSITIONS).length === 14`
- 14개 키 모두 존재 검증 — 단위 테스트:
  ```typescript
  const expectedKeys: ProjectStatus[] = [
    'proposal', 'contract_confirmed', 'lecture_requested', 'instructor_sourcing',
    'assignment_review', 'assignment_confirmed', 'education_confirmed', 'recruiting',
    'progress_confirmed', 'in_progress', 'education_done', 'settlement_in_progress',
    'task_done', 'instructor_withdrawn',
  ];
  expectedKeys.forEach((key) => {
    expect(ALLOWED_TRANSITIONS).toHaveProperty(key);
    expect(Array.isArray(ALLOWED_TRANSITIONS[key])).toBe(true);
  });
  ```
- 만약 본 SPEC 머지 시 14개 키 중 하나라도 누락되거나 typo가 발생하면 `tsc --noEmit` 컴파일 에러로 즉시 차단됨 (REQ-AMEND-EXHAUSTIVE-002)

---

## Scenario 6: 다른 ALLOWED transitions 회귀 0건

**REQ**: REQ-AMEND-TESTS-002

**Given**

- 본 SPEC 적용 전 SPEC-PROJECT-001 + SPEC-PAYOUT-002 단위 테스트가 모두 PASS 상태
- 본 SPEC 적용으로 `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 만 추가됨, 다른 13개 키는 변경 없음

**When**

- `pnpm test:unit` 전체 실행
- 다음 forward edge 케이스를 단위 테스트에서 호출한다:
  - case A: `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: 'some-uuid' })` (forward edge, 강사 배정 시)
  - case B: `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: null })` (강사 미배정 시 — REQ-PROJECT-STATUS-003 가드 작동)
  - case C: `validateTransition('assignment_confirmed', 'education_confirmed', { instructorId: 'some-uuid' })` (forward edge)
  - case D: `validateTransition('assignment_confirmed', 'recruiting', { instructorId: 'some-uuid' })` (forward edge)
  - case E: `validateTransition('assignment_confirmed', 'instructor_withdrawn', { instructorId: 'some-uuid' })` (regression entry)
  - case F: `validateTransition('task_done', 'in_progress', { instructorId: 'some-uuid' })` (불허 전환)
  - case G: `validateTransition('education_done', 'settlement_in_progress', { instructorId: 'some-uuid' })` (REQ-PROJECT-STATUS-004 가드)

**Then**

- case A: `{ ok: true }` (forward edge 보존)
- case B: `{ ok: false, reason: '강사를 배정해야 컨펌 단계로 이동할 수 있습니다.' }` (REQ-PROJECT-STATUS-003 가드 보존)
- case C: `{ ok: true }` (다른 forward edge 보존)
- case D: `{ ok: true }` (다른 forward edge 보존)
- case E: `{ ok: true }` (regression entry 보존)
- case F: `{ ok: false, reason: '허용되지 않은 상태 전환입니다.' }` (불허 전환 보존)
- case G: `{ ok: true }` (REQ-PROJECT-STATUS-004 가드 PASS — `from === 'education_done'`)
- SPEC-PROJECT-001 기존 단위 테스트 회귀 0건 (모든 케이스 PASS 유지)
- SPEC-PAYOUT-002 단위 테스트 (`userStepFromEnum`, etc.) 회귀 0건

---

## Quality Gates / Definition of Done

### Build & Type

- [ ] `pnpm build` 0 에러
- [ ] `pnpm typecheck` 0 에러 (TypeScript exhaustiveness 보존 — 14 keys)
- [ ] `pnpm lint` 0 에러 / 0 경고 (`src/lib/projects/` 영역)

### Unit Tests

- [ ] 신규 4종 케이스 (REQ-AMEND-TESTS-001 A/B/C/D) PASS
- [ ] SPEC-PROJECT-001 기존 단위 테스트 회귀 0건
- [ ] SPEC-PAYOUT-002 단위 테스트 회귀 0건
- [ ] `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4` + `includes('assignment_review')` PASS
- [ ] `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null }) → { ok: true }` PASS
- [ ] `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'uuid' }) → { ok: true }` PASS
- [ ] `validateTransition('assignment_review', 'assignment_review', { instructorId: null }) → { ok: false }` PASS (자기참조 회귀 가드)

### Integration Tests (SPEC-CONFIRM-001 §M6 위임)

- [ ] SPEC-CONFIRM-001 §M6 통합 테스트 시나리오 4 (1시간 윈도 내 accept→decline 보상 트랜잭션) bypass 미사용으로 PASS
- [ ] `project_status_history` 트리거가 backward edge UPDATE 행 자동 INSERT (`from_status='assignment_confirmed'`, `to_status='assignment_review'`) 검증
- [ ] backward edge 적용 후 forward edge 재실행도 정상 동작 (Scenario 3 후 강사 재배정 → assignment_confirmed forward 전환 가능)

### Code Quality

- [ ] `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` → 0행 (Scenario 2)
- [ ] `grep -rn "// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up" src/` → 0행
- [ ] 변경 파일 수: 정확히 2개 (`status-machine.ts` + `status-machine.test.ts`) + (동일 PR 내) SPEC-CONFIRM-001 implementation의 bypass 호출 라인 교체
- [ ] 다른 ALLOWED_TRANSITIONS 키 변경 0건 (회귀 가드)
- [ ] `validateTransition` 함수 본문 변경 0건 (회귀 가드)
- [ ] `ProjectStatus` enum 변경 0건
- [ ] `TransitionContext` / `TransitionResult` 타입 변경 0건

### Documentation

- [ ] HISTORY 항목 갱신 (구현 완료 시점, status `draft → completed`)
- [ ] (선택, 동일 PR 내 별도 commit) SPEC-CONFIRM-001 v0.2.1 doc-only amendment로 §4.8 affected files + §8 Risks 마지막 행 갱신

---

## Manual QA Checklist (선택)

운영자 시나리오 1건을 수동 QA로 추가 검증 (SPEC-CONFIRM-001 implementation과 통합 시):

- [ ] 운영자가 `/projects/[id]`에서 강사 배정 → 강사가 `/me/assignments`에서 수락 → projects.status → assignment_confirmed 확정
- [ ] 강사가 1시간 윈도 내 응답 변경 ("응답 변경" 버튼) → "거절" 클릭 → 보상 트랜잭션 commit 확인
- [ ] DB에서 `projects.status === 'assignment_review'`, `projects.instructor_id === NULL`, `schedule_items` 행 0개, `notifications` 새 행 1개, `project_status_history` 새 행 1개 (backward edge) 검증
- [ ] 운영자가 동일 프로젝트에 강사 재추천/재배정 (forward edge `assignment_review → assignment_confirmed`) 정상 동작

---

_End of acceptance.md_
