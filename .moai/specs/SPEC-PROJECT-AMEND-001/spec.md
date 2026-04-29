---
id: SPEC-PROJECT-AMEND-001
version: 0.1.1
status: completed
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: 22
---

# SPEC-PROJECT-AMEND-001: ALLOWED_TRANSITIONS Backward Edge for Reverse Compensation (assignment_confirmed → assignment_review)

## HISTORY

- **2026-04-29 (v0.1.1)**: 구현 완료. `src/lib/projects/status-machine.ts` `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가됨 (4번째 항목). 시나리오 B 채택 — `__bypassValidateTransitionForResponseDowngrade` 함수는 코드베이스에 작성되지 않았으며, SPEC-CONFIRM-001 v0.2.1 implementation도 처음부터 정식 `validateTransition` 경로 사용. 신규 단위 테스트 9개 추가(`src/lib/projects/__tests__/status-machine.test.ts`): A/B/C/D 4종 + 회귀 가드 5종 (forward edges 보존, exhaustiveness 14 keys). `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` 결과 0행 검증. typecheck PASS, build PASS, 전체 단위 테스트 회귀 0건. 동일 PR `feature/SPEC-CONFIRM-001` 머지로 audit trail 자동 기록(SPEC-DB-001 `project_status_history` 트리거).
- **2026-04-29 (v0.1.0)**: 초기 작성. SPEC-CONFIRM-001 v0.2.0 §HIGH-2 (REQ-CONFIRM-EFFECTS-008 reverse compensation transaction)이 도입한 임시 bypass 함수 `__bypassValidateTransitionForResponseDowngrade` (in `src/lib/projects/status-machine.ts`)를 정식 그래프 엣지 추가로 대체하는 follow-up amendment SPEC. (1) `ALLOWED_TRANSITIONS.assignment_confirmed`에 `'assignment_review'` 정식 backward edge 추가 — 1시간 변경 윈도 내 강사 accept→decline/conditional 전환 시 `validateTransition('assignment_confirmed', 'assignment_review')` 가 `{ ok: true }`를 반환하도록 정식 표현; (2) 임시 bypass 함수 정의/호출 모두 제거하고 모든 호출 사이트가 정식 `validateTransition` 경로 사용; (3) `project_status_history` 트리거(SPEC-DB-001)가 backward edge UPDATE 행도 자동 INSERT하므로 audit trail 보존; (4) 단위 테스트 신규 케이스 (`null → assignment_confirmed → assignment_review` 전환) + SPEC-CONFIRM-001 §M6 통합 테스트(accept→decline 1시간 윈도 보상)가 bypass 미사용으로 정상 PASS; (5) `ALLOWED_TRANSITIONS` 키 누락 없음 + TypeScript exhaustiveness 검증 보존; (6) 코드 변경 범위는 `src/lib/projects/status-machine.ts` 1파일 + 단위 테스트 1파일에 한정 (마이그레이션 / RLS / UI / Server Actions 변경 없음). SPEC-CONFIRM-001 §4.8 amendment 노트는 본 SPEC 머지 후 동일 PR(`feature/SPEC-CONFIRM-001`)에서 함께 반영. SPEC-PROJECT-001 spec.md 자체는 frozen 상태로 변경하지 않으며, 본 SPEC이 그 ALLOWED_TRANSITIONS 그래프 정의를 amendment 형태로 확장한다.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

SPEC-CONFIRM-001 v0.2.0 §HIGH-2가 도입한 1시간 변경 윈도 내 강사 응답 다운그레이드(accepted → declined/conditional) 보상 트랜잭션 (REQ-CONFIRM-EFFECTS-008)이 SPEC-PROJECT-001 정식 status machine을 우회하지 않고 자연스럽게 통과하도록 `ALLOWED_TRANSITIONS` 그래프에 `assignment_confirmed → assignment_review` 정식 backward edge를 추가한다. 본 SPEC의 산출물은 (a) `src/lib/projects/status-machine.ts`의 `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가, (b) SPEC-CONFIRM-001 v0.2.0 §HIGH-2 임시 bypass 함수 `__bypassValidateTransitionForResponseDowngrade` 정의 + 호출 사이트 모두 제거, (c) `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출이 `{ ok: true }`를 정식으로 반환함을 검증하는 단위 테스트 추가, (d) SPEC-CONFIRM-001 §M6 통합 테스트(accept→decline 1시간 윈도 보상)가 bypass 미사용으로 정상 PASS함을 검증, (e) `project_status_history` 트리거 (SPEC-DB-001)가 backward edge UPDATE 행을 자동 INSERT하여 audit trail이 보존됨을 검증, (f) 다른 ALLOWED 전환 회귀 0건이다.

본 SPEC은 마이그레이션, RLS 정책, UI, Server Actions, 신규 도메인 모듈을 빌드하지 않는다. 코드 변경 범위는 `src/lib/projects/status-machine.ts` 단일 파일 + 단위 테스트 파일 수정에 한정된다.

### 1.2 배경 (Background)

SPEC-CONFIRM-001 v0.2.0 §HIGH-2 (REQ-CONFIRM-EFFECTS-008)는 강사가 1시간 변경 윈도 내 `instructor_responses.status`를 `accepted`에서 `declined`/`conditional`로 변경할 때 다음 보상 트랜잭션을 정의했다:

1. `instructor_responses` UPDATE (status, conditional_note, responded_at)
2. `projects` UPDATE: `instructor_id = NULL`, `status = 'assignment_review'`
3. `schedule_items` 하드 DELETE (직전 accept이 INSERT한 system_lecture 행)
4. `notifications` INSERT (새 status 반영)
5. `console.warn` 감사 로그

이 트랜잭션의 step 2가 `projects.status` 를 `assignment_confirmed → assignment_review` 로 되돌리는데, **현재 SPEC-PROJECT-001 ALLOWED_TRANSITIONS 그래프(`src/lib/projects/status-machine.ts` line 90~106)에는 `assignment_confirmed → assignment_review` 역방향 엣지가 부재**하다. 다음은 본 SPEC 작성 시점의 그래프 발췌:

```typescript
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  // ...
  assignment_review: ["assignment_confirmed", "instructor_withdrawn"],
  assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn"],
  //                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                    'assignment_review' 부재 → backward edge 미정의
  // ...
};
```

따라서 SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008가 `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 를 호출하면 `{ ok: false, reason: '허용되지 않은 상태 전환입니다.' }` 를 반환받게 된다. SPEC-CONFIRM-001 v0.2.0은 이 게이트의 임시 우회를 위해 **documented bypass 함수** `__bypassValidateTransitionForResponseDowngrade` 를 `src/lib/projects/status-machine.ts` 에 추가하고, REQ-CONFIRM-EFFECTS-008 구현 시 이 bypass를 호출하면서 `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up: backward transition not yet supported in ALLOWED_TRANSITIONS graph` 주석과 `console.warn` 감사 라인을 강제했다. 이는 임시 조치이며 SPEC-CONFIRM-001 §HIGH-2 cross-reference에서 명시적으로 본 SPEC을 follow-up으로 위임했다 (spec.md §2.4 REQ-CONFIRM-EFFECTS-008 마지막 단락 + §8 Risks 마지막 행).

본 SPEC의 해결책은 backward edge를 **정식으로 그래프에 추가**하여 (a) bypass 함수 자체를 제거, (b) `validateTransition` 호출이 정상 경로로 통과, (c) `project_status_history` 트리거가 backward edge 행도 자동 기록(이미 트리거는 모든 UPDATE에 반응하므로 별도 변경 불필요), (d) 코드베이스에 `__bypassValidateTransitionForResponseDowngrade` 잔존 0건 검증이다. 이는 가장 단순한 (single-line graph extension + bypass 제거) follow-up이며 다른 워크플로우(예: assignment_review → assignment_confirmed forward 전환, 강사 미배정 가드)는 영향받지 않는다.

### 1.3 범위 (Scope)

**In Scope:**

- 코드 수정 (`src/lib/projects/status-machine.ts`):
  - `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가 (기존 3개 항목 → 4개 항목)
  - SPEC-CONFIRM-001 v0.2.0 §HIGH-2가 추가했을 임시 bypass 함수 `__bypassValidateTransitionForResponseDowngrade` 정의 제거 (만약 본 SPEC 머지 시점에 이미 추가되었다면)
  - 그래프 주석 업데이트 — `assignment_confirmed`의 backward edge가 응답 다운그레이드 보상 경로 (SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008)임을 명시
- 코드 수정 (`src/lib/projects/__tests__/status-machine.test.ts` 또는 `src/lib/projects/status-machine.test.ts`):
  - `null → assignment_confirmed → assignment_review` backward edge 통과 단위 테스트 신규 추가
  - `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 가 `{ ok: true }` 반환 검증
  - `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' })` 도 `{ ok: true }` 반환 (강사 배정 여부와 무관) 검증
  - `ALLOWED_TRANSITIONS` 키 누락 없음 + TypeScript exhaustiveness 보존 검증
  - 다른 ALLOWED transitions 회귀 검증 (기존 단위 테스트 모두 PASS)
- 호출 사이트 검증:
  - `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/` 결과 0건 (정의 + 호출 모두 제거됨)
  - SPEC-CONFIRM-001 응답 다운그레이드 트랜잭션 (`src/app/(app)/(instructor)/me/assignments/actions.ts` 또는 동등 위치)이 `validateTransition` 정식 경로 사용
- audit trail 보존 검증:
  - SPEC-DB-001 `project_status_history` 트리거가 backward edge UPDATE 행도 자동 INSERT 하는지 통합 테스트로 검증 (기존 트리거 정의가 모든 `projects.status` UPDATE에 반응하므로 별도 트리거 변경 없이 자동 동작 예상)
- SPEC-PROJECT-001 spec.md 자체는 frozen 상태로 직접 수정하지 않음. 본 SPEC이 그 ALLOWED_TRANSITIONS 그래프 정의를 amendment 형태로 확장하며, history는 본 SPEC HISTORY로 관리.

**Out of Scope (Exclusions — What NOT to Build):**

- **신규 마이그레이션**: 0건. `project_status_history` 트리거(SPEC-DB-001)가 이미 모든 UPDATE에 반응하므로 backward edge 추가에 따른 마이그레이션 불필요.
- **RLS 정책 변경**: 0건. `projects` 테이블 RLS는 그대로.
- **UI / 라우트 변경**: 0건. 운영자 측 강사 재배정 UI, 강사 측 응답 변경 UI는 SPEC-CONFIRM-001 산출물 그대로 사용.
- **신규 Server Actions**: 0건. SPEC-CONFIRM-001 산출물 그대로 사용 (단, bypass 함수 호출 라인이 정식 `validateTransition` 호출로 교체됨).
- **신규 도메인 모듈**: 0건.
- **`ALLOWED_TRANSITIONS` 다른 enum value backward edge 추가**: 본 SPEC은 `assignment_confirmed → assignment_review` 단일 backward edge에만 한정. 다른 backward edge (예: `instructor_sourcing → lecture_requested`, `education_confirmed → assignment_confirmed`) 가 필요하다면 별도 SPEC.
- **operator 측 force-reset / admin override UI**: 본 SPEC 범위 외. SPEC-ADMIN-001 또는 admin DB 작업으로 위임.
- **SPEC-PROJECT-001 spec.md 본문 수정**: SPEC-PROJECT-001은 frozen. 본 SPEC이 amendment 형태로 그래프를 확장하며, 머지 후 SPEC-CONFIRM-001 §4.8 affected files 섹션에만 `src/lib/projects/status-machine.ts` 변경 사실 명시 (관련 amendment는 SPEC-CONFIRM-001 v0.2.1으로 별도 처리).
- **다국어**: 한국어 단일 (project policy).

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, `pnpm typecheck` 0 type 에러 (TypeScript exhaustiveness check 보존 — `ALLOWED_TRANSITIONS`의 모든 `ProjectStatus` 키 정의 유지)
- ✅ ALLOWED_TRANSITIONS 확장 검증: `ALLOWED_TRANSITIONS.assignment_confirmed.includes('assignment_review') === true` (단위 테스트로 검증)
- ✅ validateTransition 통과: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` → `{ ok: true }`
- ✅ validateTransition 통과 (강사 배정 시): `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' })` → `{ ok: true }` (REQ-PROJECT-STATUS-003 가드는 `to === 'assignment_confirmed'` 단계에만 적용되므로 backward edge에는 영향 없음)
- ✅ Bypass 함수 잔존 0건: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/` 결과 0행
- ✅ Bypass 호출 사이트 모두 정식 `validateTransition` 경로로 전환 (SPEC-CONFIRM-001 산출물의 응답 다운그레이드 트랜잭션 코드)
- ✅ SPEC-CONFIRM-001 §M6 통합 테스트 시나리오 4 (1시간 윈도 내 accept→decline 보상 트랜잭션) 가 bypass 미사용으로 PASS
- ✅ project_status_history 트리거 audit trail: backward edge UPDATE 시점에 새 행이 자동 INSERT되어 `from_status='assignment_confirmed'`, `to_status='assignment_review'`, `changed_at` 기록 (통합 테스트 검증)
- ✅ ALLOWED_TRANSITIONS 다른 14개 키(13개 enum value + `instructor_withdrawn`) 정의 보존 — TypeScript `Record<ProjectStatus, readonly ProjectStatus[]>` exhaustiveness check 통과
- ✅ 다른 ALLOWED transitions 회귀 0건 — SPEC-PROJECT-001 기존 status-machine 단위 테스트 모두 PASS
- ✅ 단위 테스트 신규 케이스: `null → assignment_confirmed → assignment_review` 전환 + 강사 배정 여부 무관 + `from === to` 거부(`assignment_review → assignment_review` 자기참조 거부) 검증
- ✅ lint / typecheck / test:unit / build 모두 PASS

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 4개 모듈로 구성된다: `TRANSITIONS`, `BYPASS`, `AUDIT`, `TESTS`, `EXHAUSTIVE`.

### 2.1 REQ-AMEND-TRANSITIONS — ALLOWED_TRANSITIONS 그래프 확장

**REQ-AMEND-TRANSITIONS-001 (Ubiquitous)**
The system **shall** add `'assignment_review'` to the `ALLOWED_TRANSITIONS.assignment_confirmed` array in `src/lib/projects/status-machine.ts` such that the resulting array reads:

```typescript
assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"],
```

The new entry **shall** be placed at the end of the array to make the diff minimal and the addition self-documenting. The accompanying TypeScript comment **shall** annotate the new edge as the reverse-compensation path from SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 (1-hour change-window response downgrade compensation).

**REQ-AMEND-TRANSITIONS-002 (Ubiquitous)**
The function `validateTransition(from, to, ctx)` defined in `src/lib/projects/status-machine.ts` **shall** return `{ ok: true }` for the call `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })`. The function body **shall not** require any code changes other than the implicit lookup against the extended `ALLOWED_TRANSITIONS` graph; the existing guards (`from === to` rejection, `to === 'assignment_confirmed'` instructor presence guard, `to === 'settlement_in_progress'` source restriction) **shall** remain unchanged and untouched.

**REQ-AMEND-TRANSITIONS-003 (Ubiquitous)**
The system **shall** preserve TypeScript exhaustiveness for `ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]>` such that every `ProjectStatus` enum value (13 SPEC-PROJECT-001 values + `instructor_withdrawn` from SPEC-PAYOUT-002 = 14 keys) has a corresponding entry. No key **shall** be removed or renamed in this SPEC. Compile-time `tsc --noEmit` **shall** report zero errors after the edit.

### 2.2 REQ-AMEND-BYPASS — 임시 우회 경로 제거

**REQ-AMEND-BYPASS-001 (Unwanted Behavior)**
**If** any code in `src/` defines a function or named export `__bypassValidateTransitionForResponseDowngrade` (introduced as a temporary path by SPEC-CONFIRM-001 v0.2.0 §HIGH-2), **then** that definition **shall** be removed in the same diff that adds the backward edge to `ALLOWED_TRANSITIONS`. Post-removal verification: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/` returns **zero matches** (no definition, no import, no call site).

**REQ-AMEND-BYPASS-002 (Unwanted Behavior)**
**If** SPEC-CONFIRM-001 implementation code (e.g., `src/app/(app)/(instructor)/me/assignments/actions.ts` or its helper modules under `src/lib/responses/`) imports or calls `__bypassValidateTransitionForResponseDowngrade`, **then** every such import and call **shall** be replaced with a direct call to `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })`, and the surrounding `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up` annotation **shall** be removed since the warning is no longer applicable. The transaction step semantics **shall** remain identical to SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 (steps 1-5 unchanged), only the validation path is normalized.

**REQ-AMEND-BYPASS-003 (Ubiquitous)**
The system **shall** keep the `console.warn` audit log line `[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>` in SPEC-CONFIRM-001 REQ-CONFIRM-EFFECTS-008 step 5 — that log is independent of the validation path and serves as the operator-visible signal of a 1-hour-window response downgrade. The log line **shall** continue to fire regardless of `NODE_ENV`.

### 2.3 REQ-AMEND-AUDIT — project_status_history audit trail 보존

**REQ-AMEND-AUDIT-001 (Event-Driven)**
**When** the SPEC-CONFIRM-001 response-downgrade transaction performs `UPDATE projects SET status = 'assignment_review' WHERE id = $projectId AND status = 'assignment_confirmed'`, the SPEC-DB-001 `project_status_history` trigger **shall** automatically INSERT a new history row with `from_status = 'assignment_confirmed'`, `to_status = 'assignment_review'`, `changed_at = now()`, and the operator/instructor `actor_user_id` per the trigger's existing capture logic. No new trigger or trigger amendment is required by this SPEC because the existing trigger fires on every `projects.status` UPDATE. Verification: integration test asserts a `project_status_history` row exists with the expected from/to values after the downgrade transaction commits.

**REQ-AMEND-AUDIT-002 (Ubiquitous)**
The system **shall not** distinguish between forward and backward transitions in the `project_status_history` table — a backward edge UPDATE produces a row identical in shape to a forward edge UPDATE, with the discriminating evidence being the `from_status` / `to_status` pair itself. This preserves the audit semantic that "every status change is recorded once" without requiring a new column or flag.

### 2.4 REQ-AMEND-TESTS — 단위 + 통합 테스트 커버리지

**REQ-AMEND-TESTS-001 (Ubiquitous)**
The system **shall** add unit tests in `src/lib/projects/__tests__/status-machine.test.ts` (or whichever file currently houses `validateTransition` unit tests) covering the new backward edge:

- Test case A: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null }) → { ok: true }`
- Test case B: `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' }) → { ok: true }` (instructor presence is irrelevant for backward edge — REQ-PROJECT-STATUS-003 guard only applies when `to === 'assignment_confirmed'`)
- Test case C: `validateTransition('assignment_review', 'assignment_review', { instructorId: null }) → { ok: false, reason: '현재 상태와 동일한 단계로 전환할 수 없습니다.' }` (self-loop still rejected)
- Test case D: ALLOWED_TRANSITIONS-driven exhaustiveness probe — assert `ALLOWED_TRANSITIONS.assignment_confirmed.length === 4` and `ALLOWED_TRANSITIONS.assignment_confirmed.includes('assignment_review')` is `true`

**REQ-AMEND-TESTS-002 (Ubiquitous)**
The system **shall** verify that SPEC-PROJECT-001's existing status-machine unit test suite continues to PASS without modification (regression-zero for forward transitions). Specifically:

- All previously-allowed forward edges (e.g., `assignment_review → assignment_confirmed`, `assignment_confirmed → education_confirmed`, `assignment_confirmed → recruiting`, `assignment_confirmed → instructor_withdrawn`) **shall** continue to return `{ ok: true }` with the same input contracts.
- All previously-rejected transitions (e.g., `task_done → anything`) **shall** continue to return `{ ok: false }`.

**REQ-AMEND-TESTS-003 (Event-Driven)**
**When** SPEC-CONFIRM-001 §M6 integration test scenario 4 (1시간 변경 윈도 내 accept→decline 보상 트랜잭션) runs after this SPEC merges, the test **shall** PASS without invoking `__bypassValidateTransitionForResponseDowngrade`. The test **shall** assert (a) the response transaction commits successfully, (b) `projects.status` transitions back to `'assignment_review'` via the standard `validateTransition` path (no bypass call), (c) `schedule_items` rows are hard-DELETEd, (d) a new `notifications` row reflects the downgrade, (e) `project_status_history` records the backward edge.

**REQ-AMEND-TESTS-004 (Ubiquitous)**
The system **shall** perform a grep regression guard as part of the M1 acceptance: `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` returns zero matches. This guard **shall** be runnable manually as part of the verification checklist; CI integration is optional and out of scope for this SPEC.

### 2.5 REQ-AMEND-EXHAUSTIVE — TypeScript exhaustiveness 보존

**REQ-AMEND-EXHAUSTIVE-001 (Ubiquitous)**
The `ALLOWED_TRANSITIONS` constant **shall** retain its declared type `Record<ProjectStatus, readonly ProjectStatus[]>` after the edit. TypeScript `tsc --noEmit` **shall** verify that all 14 `ProjectStatus` enum values (`proposal`, `contract_confirmed`, `lecture_requested`, `instructor_sourcing`, `assignment_review`, `assignment_confirmed`, `education_confirmed`, `recruiting`, `progress_confirmed`, `in_progress`, `education_done`, `settlement_in_progress`, `task_done`, `instructor_withdrawn`) are present as keys with no missing keys (compile-time error if any key is missing).

**REQ-AMEND-EXHAUSTIVE-002 (Ubiquitous)**
The new entry `'assignment_review'` in `ALLOWED_TRANSITIONS.assignment_confirmed` **shall** be a valid `ProjectStatus` enum value such that the array remains `readonly ProjectStatus[]`. Adding a non-enum string (e.g., `'assignment_revied'` typo) **shall** produce a TypeScript compile-time error; this is the safety mechanism that prevents accidental regressions.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임하거나 영구 제외한다.

| 항목 | 위임 대상 / 사유 |
|------|-----------------|
| 신규 마이그레이션 | 0건. `project_status_history` 트리거(SPEC-DB-001)가 이미 모든 UPDATE에 반응하므로 backward edge 추가에 따른 마이그레이션 불필요. |
| 신규 RLS 정책 | 0건. `projects` 테이블 RLS는 그대로. |
| UI / 라우트 변경 | 0건. 운영자 측 강사 재배정 UI, 강사 측 응답 변경 UI는 SPEC-CONFIRM-001 산출물 그대로 사용. |
| 신규 Server Actions | 0건. SPEC-CONFIRM-001 산출물 그대로 사용 (단, bypass 함수 호출 라인이 정식 `validateTransition` 호출로 교체됨). |
| 신규 도메인 모듈 | 0건. 단일 파일(`src/lib/projects/status-machine.ts`) 1라인 추가 + 테스트 추가. |
| 다른 enum value backward edge 추가 (예: `instructor_sourcing → lecture_requested`) | 별도 SPEC 위임. 본 SPEC은 `assignment_confirmed → assignment_review` 단일 backward edge에 한정. |
| operator 측 force-reset / 응답 무효화 admin UI | SPEC-ADMIN-001 또는 admin DB 작업으로 위임. |
| SPEC-PROJECT-001 spec.md 본문 수정 | SPEC-PROJECT-001은 frozen. 본 SPEC이 amendment 형태로 그래프를 확장하며, SPEC-CONFIRM-001 §4.8 affected files 노트 갱신은 SPEC-CONFIRM-001 v0.2.1 별도 amendment로 처리. |
| `validateTransition` 함수 시그니처 변경 | 0건. 함수 본문은 ALLOWED_TRANSITIONS lookup만 사용하므로 그래프 확장만으로 새 edge를 자동 인식. |
| `__bypassValidateTransitionForResponseDowngrade` 폐기 알림 / migration log | 본 SPEC HISTORY 단락 + commit message로 충분. 별도 운영 알림 불필요. |
| 다국어 (i18n) | 한국어 단일. |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 파일

- 없음.

### 4.2 수정 파일

- `src/lib/projects/status-machine.ts`
  - `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가 (1 line addition + 주석 1줄 갱신)
  - SPEC-CONFIRM-001 v0.2.0 §HIGH-2 임시 bypass 함수 정의 제거 (만약 이미 추가된 경우; 본 SPEC 단일 PR에서 SPEC-CONFIRM-001 구현과 함께 처리되므로 bypass 정의가 코드에 잔존하지 않게 한다)
- `src/lib/projects/__tests__/status-machine.test.ts` (또는 동등 파일 위치)
  - 신규 테스트 케이스 4종 (REQ-AMEND-TESTS-001 A/B/C/D)
  - 기존 테스트 변경 0건 (regression-zero 보장)

### 4.3 변경 없음 (참고)

- 마이그레이션 (`supabase/migrations/`): 0건
- RLS 정책: 0건
- UI / 라우트 / Server Actions: 0건
- `src/lib/projects/types.ts` (`ProjectStatus` enum): 0건 (SPEC-PAYOUT-002에서 추가한 `instructor_withdrawn` 14번째 값 그대로)
- `src/lib/projects/status-flow.ts` (SPEC-PROJECT-001 7-step user mapping): 0건 (backward edge는 user step 매핑과 무관)
- `src/db/queries/projects/`: 0건
- SPEC-CONFIRM-001 산출물 (`src/app/(app)/(instructor)/me/assignments/actions.ts` 등): 본 SPEC 자체는 변경하지 않음. 단, 동일 PR(`feature/SPEC-CONFIRM-001`)에서 manager-tdd가 SPEC-CONFIRM-001 implementation 시 bypass 호출 라인을 정식 `validateTransition` 경로로 교체할 때 이 SPEC의 backward edge가 활용됨.

### 4.4 SPEC-CONFIRM-001 연계 (참고, 본 SPEC 산출물 아님)

본 SPEC 머지 후 동일 PR에서 SPEC-CONFIRM-001 v0.2.1 amendment (별도 작업)가 다음을 처리한다:

- SPEC-CONFIRM-001 spec.md §4.8 "변경 없음 (참고)" 섹션에 `src/lib/projects/status-machine.ts` 변경 사실 명시 (본 SPEC이 추가)
- SPEC-CONFIRM-001 spec.md REQ-CONFIRM-EFFECTS-008 마지막 단락의 "documented bypass path" 문구를 "정식 backward edge 경로 (SPEC-PROJECT-AMEND-001 적용 후)"로 갱신
- SPEC-CONFIRM-001 §8 Risks 테이블의 마지막 행 (HIGH-2 cross-reference) 상태를 "해결됨 (SPEC-PROJECT-AMEND-001 v0.1.0 머지)" 으로 갱신

본 amendment는 doc-only이며, 본 SPEC 코드 변경(`status-machine.ts` + 단위 테스트)과는 별도의 commit 또는 PR로 처리할 수 있다 (게이트 5.3 사용자 결정에 따라 동일 PR `feature/SPEC-CONFIRM-001` 내 처리).

---

## 5. 기술 접근 (Technical Approach)

### 5.1 그래프 확장 (Single-Line Addition)

`src/lib/projects/status-machine.ts` 의 `ALLOWED_TRANSITIONS` 정의에서 `assignment_confirmed` 행을 다음과 같이 변경:

```typescript
// Before
assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn"],

// After
assignment_confirmed: ["education_confirmed", "recruiting", "instructor_withdrawn", "assignment_review"],
//                                                                                  ^^^^^^^^^^^^^^^^^^^^
//                                                                                  SPEC-PROJECT-AMEND-001:
//                                                                                  reverse compensation path
//                                                                                  (SPEC-CONFIRM-001 §HIGH-2)
```

다른 `ALLOWED_TRANSITIONS` 항목은 모두 보존한다. `validateTransition` 함수 본문은 변경하지 않는다 — 함수가 그래프 lookup 결과만 사용하므로 자동으로 새 edge를 인식한다.

### 5.2 Bypass 함수 제거

본 SPEC 머지 시점에 `src/lib/projects/status-machine.ts` 또는 동등 위치에 `__bypassValidateTransitionForResponseDowngrade` 함수가 잔존하지 않도록 보장한다. 다음 두 시나리오가 가능하다:

- **시나리오 A**: SPEC-CONFIRM-001 implementation이 본 SPEC보다 먼저 머지되어 bypass 함수가 이미 코드베이스에 존재 → 본 SPEC PR에서 함수 정의 + 호출 사이트 모두 제거
- **시나리오 B**: SPEC-CONFIRM-001 implementation과 본 SPEC implementation이 동일 PR(`feature/SPEC-CONFIRM-001`)에서 동시 머지 → bypass 함수가 코드베이스에 잠시도 존재하지 않도록 manager-tdd가 SPEC-CONFIRM-001 §HIGH-2 구현 시 처음부터 정식 `validateTransition` 경로 사용

게이트 5.3 사용자 결정에 따라 시나리오 B를 채택한다. 본 SPEC + SPEC-CONFIRM-001 implementation + SPEC-CONFIRM-001 §4.8 amendment는 모두 동일 PR에서 처리되므로 bypass 함수 정의는 코드베이스에 상존하지 않는다.

검증 grep:

```bash
grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/
# 기대 결과: 0행
```

### 5.3 단위 테스트 신규 케이스

`src/lib/projects/__tests__/status-machine.test.ts` (또는 동등 위치) 에 다음 케이스를 추가:

```typescript
import { describe, it, expect } from 'vitest';
import { validateTransition, ALLOWED_TRANSITIONS } from '../status-machine';

describe('SPEC-PROJECT-AMEND-001 — assignment_confirmed → assignment_review backward edge', () => {
  it('REQ-AMEND-TESTS-001-A: returns { ok: true } with instructorId=null', () => {
    const result = validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null });
    expect(result).toEqual({ ok: true });
  });

  it('REQ-AMEND-TESTS-001-B: returns { ok: true } even when instructorId is set (REQ-PROJECT-STATUS-003 guard does not apply to backward edge)', () => {
    const result = validateTransition('assignment_confirmed', 'assignment_review', { instructorId: 'some-uuid' });
    expect(result).toEqual({ ok: true });
  });

  it('REQ-AMEND-TESTS-001-C: rejects self-loop (assignment_review → assignment_review)', () => {
    const result = validateTransition('assignment_review', 'assignment_review', { instructorId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('현재 상태와 동일한 단계로 전환할 수 없습니다.');
    }
  });

  it('REQ-AMEND-TESTS-001-D: ALLOWED_TRANSITIONS.assignment_confirmed contains assignment_review', () => {
    expect(ALLOWED_TRANSITIONS.assignment_confirmed).toContain('assignment_review');
    expect(ALLOWED_TRANSITIONS.assignment_confirmed.length).toBe(4); // education_confirmed, recruiting, instructor_withdrawn, assignment_review
  });
});
```

### 5.4 통합 테스트 (SPEC-CONFIRM-001 산출물 재사용)

본 SPEC은 자체 통합 테스트를 신규 추가하지 않는다. SPEC-CONFIRM-001 §M6 통합 테스트 시나리오 4 (1시간 변경 윈도 내 accept→decline 보상 트랜잭션) 가 본 SPEC 머지 후 bypass 미사용으로 PASS함을 검증하는 것이 통합 검증 게이트가 된다 (acceptance.md Scenario 3 참조).

### 5.5 audit trail 검증

SPEC-DB-001 `project_status_history` 트리거는 이미 모든 `projects.status` UPDATE에 반응하도록 정의되어 있다. backward edge UPDATE도 별도 트리거 변경 없이 자동으로 history 행 INSERT가 일어난다. SPEC-CONFIRM-001 §M6 통합 테스트가 다음을 추가 검증해야 한다 (SPEC-CONFIRM-001 acceptance.md 시나리오 4 또는 별도 시나리오):

```sql
-- After accept→decline 보상 트랜잭션 commit
SELECT from_status, to_status, changed_at
FROM project_status_history
WHERE project_id = $projectId
ORDER BY changed_at DESC
LIMIT 2;

-- 기대: 가장 최근 행이 (from='assignment_confirmed', to='assignment_review'),
--       그 다음 행이 (from='assignment_review', to='assignment_confirmed') (직전 accept이 INSERT)
```

이 검증은 본 SPEC의 acceptance.md Scenario 4에서 명시한다.

### 5.6 코드 변경 최소화 원칙

본 SPEC은 의도적으로 변경 범위를 1라인(그래프 확장) + 주석 + 단위 테스트로 제한한다. 다음을 변경하지 않는다:

- `validateTransition` 함수 시그니처
- `validateTransition` 함수 본문 로직 (그래프 lookup, REQ-PROJECT-STATUS-003/-004 가드)
- `ProjectStatus` enum 정의
- `TransitionContext` 인터페이스
- `TransitionResult` 타입
- 다른 ALLOWED_TRANSITIONS 항목

이로써 회귀 위험을 최소화하며, 모든 기존 단위 테스트와 통합 테스트가 변경 없이 PASS한다.

### 5.7 의존성

- 외부 라이브러리 신규 추가: 0건
- 기존 의존성: TypeScript 5.9, Vitest (기존 테스트 러너)
- SPEC 의존성:
  - SPEC-PROJECT-001 (완료, 머지됨): `validateTransition` + `ALLOWED_TRANSITIONS` 정의 보유
  - SPEC-PAYOUT-002 (완료, 머지됨): `instructor_withdrawn` enum value 추가됨
  - SPEC-DB-001 (완료, 머지됨): `project_status_history` 트리거 정의 보유
  - SPEC-CONFIRM-001 v0.2.0 (병렬 작성, 본 SPEC와 동일 PR): REQ-CONFIRM-EFFECTS-008 implementation이 본 SPEC의 backward edge를 활용

---

## 6. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ ALLOWED_TRANSITIONS 확장: `assignment_confirmed` 배열에 `'assignment_review'` 포함
- ✅ validateTransition 통과: backward edge 정식 경로
- ✅ Bypass 함수 잔존 0건 (grep 검증)
- ✅ Bypass 호출 모두 정식 validateTransition 경로
- ✅ SPEC-CONFIRM-001 §M6 통합 테스트 bypass 미사용 PASS
- ✅ project_status_history 트리거 backward edge 자동 기록
- ✅ TypeScript exhaustiveness 보존 (14 keys)
- ✅ 다른 ALLOWED transitions 회귀 0건
- ✅ lint / typecheck / test:unit / build 모두 PASS

---

## 7. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| 다른 곳에서 `__bypassValidateTransitionForResponseDowngrade` 함수를 사용하고 있을 가능성 (SPEC-CONFIRM-001 외 imports) | bypass 함수 제거 후 빌드 깨짐 (TypeScript ENOENT 에러) | `grep -rn "__bypassValidateTransitionForResponseDowngrade" src/ tests/` 실행 후 모든 호출 사이트를 정식 `validateTransition` 경로로 교체. 본 SPEC + SPEC-CONFIRM-001 implementation이 동일 PR에서 처리되므로 잔존 import 가능성은 낮으나 grep 검증을 acceptance gate로 강제 |
| `ALLOWED_TRANSITIONS.assignment_confirmed` 배열에 `'assignment_review'` 추가가 다른 forward 워크플로우(예: assignment_review → assignment_confirmed → education_confirmed)에 영향 | forward 흐름의 무결성 손실 | backward edge는 forward edge와 독립적. forward 흐름은 `ALLOWED_TRANSITIONS.assignment_review`(SPEC-PROJECT-001 line 95)에 정의되어 있으며 본 SPEC은 해당 라인 변경 없음. 단위 테스트로 forward 회귀 0건 검증 |
| `validateTransition` 함수의 REQ-PROJECT-STATUS-003 가드(`to === 'assignment_confirmed'` 시 instructorId 필수)가 backward edge에 잘못 적용 | backward edge 호출이 강사 미배정 시 `{ ok: false }` 반환 | 가드는 `to === 'assignment_confirmed'` 단계에만 적용. backward edge는 `to === 'assignment_review'`이므로 가드 우회 정상. 단위 테스트 REQ-AMEND-TESTS-001-A/-B로 검증 (instructorId=null/uuid 양쪽 모두 ok) |
| `project_status_history` 트리거가 backward edge UPDATE에 반응하지 않을 가능성 | audit trail 누락 | SPEC-DB-001 트리거 정의 검토: PostgreSQL `AFTER UPDATE OF status` 트리거는 어떤 상태 전환이든 반응. 통합 테스트로 (`SELECT FROM project_status_history WHERE ...`) 검증. 만약 트리거가 forward 전환에만 반응하도록 잘못 정의되어 있다면 별도 SPEC-DB-001 amendment 필요 (현재까지 그런 정의는 발견되지 않음) |
| TypeScript exhaustiveness가 `instructor_withdrawn` 14번째 키를 인식하지 못할 가능성 (SPEC-PAYOUT-002 머지 후) | tsc --noEmit 에러 | `ProjectStatus` enum이 SPEC-PAYOUT-002에서 14개 값으로 확장되었음을 SPEC-PROJECT-001 v0.2 amendment로 이미 반영. 본 SPEC은 `ALLOWED_TRANSITIONS.instructor_withdrawn` 항목을 손대지 않으므로 exhaustiveness 영향 없음 |
| SPEC-CONFIRM-001 §M6 통합 테스트가 본 SPEC 머지 전에 작성되어 bypass 함수 호출을 가정 | 테스트 코드가 bypass 함수 import → 본 SPEC 머지 후 빌드 깨짐 | 동일 PR에서 처리. manager-tdd가 SPEC-CONFIRM-001 implementation 시 처음부터 bypass 미사용 경로로 작성하도록 본 SPEC plan.md M1 acceptance gate가 명시 |
| 본 SPEC 머지 후 SPEC-CONFIRM-001 spec.md §4.8이 자동으로 갱신되지 않음 | 문서 inconsistency | SPEC-CONFIRM-001 v0.2.1 별도 amendment(doc-only)로 처리. 게이트 5.3 사용자 결정에 따라 동일 PR `feature/SPEC-CONFIRM-001` 내 처리되므로 시간차 inconsistency 윈도 0 |
| `assignment_review`에서 다시 다른 강사를 배정하는 흐름이 명확하지 않음 (재추천 → 재배정 사이클) | 운영자 UX 모호 | 본 SPEC 범위 외. 운영자가 `/projects/[id]`에서 추천 다시 실행 → `assignInstructor` Server Action 재호출하면 `assignment_review → assignment_confirmed` 정식 forward edge 활용. 본 SPEC은 backward edge만 추가하며 그 이후 재배정 흐름은 SPEC-PROJECT-001 기존 동작 그대로 |
| `null → assignment_confirmed → assignment_review` 라이프사이클이 강사가 동일 프로젝트에 다시 응답할 수 있게 함 | idempotency 또는 race condition 가능성 | SPEC-CONFIRM-001 REQ-CONFIRM-RESPONSES-001의 partial UNIQUE 인덱스 `uniq_instructor_responses_assignment (project_id, instructor_id) WHERE project_id IS NOT NULL`가 강사 1명당 프로젝트 1행만 허용 → 강사가 같은 프로젝트에 두 번 응답 시 UPSERT 경로로 같은 row 갱신. 본 SPEC의 backward edge는 이 idempotency를 그대로 보존 |

---

## 8. 참고 자료 (References)

- `.moai/specs/SPEC-PROJECT-001/spec.md`: `validateTransition` + `ALLOWED_TRANSITIONS` 그래프 정의 (REQ-PROJECT-STATUS-002~004), 본 SPEC이 amendment 형태로 확장하는 기준선
- `.moai/specs/SPEC-CONFIRM-001/spec.md` v0.2.0: §HIGH-2 REQ-CONFIRM-EFFECTS-008 reverse compensation 트랜잭션 정의 + cross-reference to SPEC-PROJECT-AMEND-001 (본 SPEC), §8 Risks 마지막 행
- `.moai/specs/SPEC-DB-001/spec.md`: `project_status_history` 트리거 정의 — 모든 `projects.status` UPDATE에 반응하여 history 행 자동 INSERT
- `.moai/specs/SPEC-PAYOUT-002/spec.md`: `instructor_withdrawn` enum value 추가로 `ProjectStatus` 14개 값 확장 (SPEC-PROJECT-001 amendment 통합)
- `src/lib/projects/status-machine.ts`: 본 SPEC 변경 대상 단일 파일
- `src/lib/projects/__tests__/status-machine.test.ts`: 본 SPEC 단위 테스트 추가 위치 (또는 동등 파일)
- [`plan.md`](./plan.md): 단일 마일스톤 M1 분해
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 6건
- [`spec-compact.md`](./spec-compact.md): EARS + 시나리오 압축본
- 외부 (verified 2026-04-29):
  - https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html (Record exhaustiveness)
  - https://www.postgresql.org/docs/16/trigger-definition.html (AFTER UPDATE 트리거 시맨틱)

---

_End of SPEC-PROJECT-AMEND-001 spec.md_
