# SPEC-PAYOUT-002 Implementation Plan

## 0. 개요

본 plan.md는 SPEC-PAYOUT-002 (시간당 사업비 기반 자동 정산)의 마일스톤 분해와 TDD(RED-GREEN-REFACTOR) 사이클 적용 가이드이다. `.moai/config/sections/quality.yaml`의 `development_mode = tdd`를 따른다. SPEC-PAYOUT-001의 산출물(settlements 4-state 머신, 세율 검증, 매입매출 위젯, GENERATED 컬럼 read-only)은 변경하지 않고 확장만 한다.

---

## 1. 마일스톤 개요

| ID | 제목 | Priority | 산출물 |
|----|------|----------|--------|
| M1 | DB 마이그레이션 (lecture_sessions + projects 컬럼 + settlement_sessions junction) | High | 3+1 SQL 마이그레이션 + RLS 정책 |
| M2 | 산식 순수 함수 (calculator.ts) + 단위 테스트 (TDD RED→GREEN→REFACTOR) | High | `src/lib/payouts/calculator.ts` + 90% 커버 |
| M3 | 세션 도메인 모듈 (`src/lib/sessions/*`) — types/queries/status-machine/validation | High | sessions 도메인 + 단위 테스트 |
| M4 | 프로젝트 폼 확장 — 시급 + 분배율 + 세션 매트릭스 | High | `/projects/new`, `/projects/[id]/edit` 폼 + 신규 컴포넌트 |
| M5 | 정산 일괄 생성 (`/settlements/generate`) — 미리보기 + Server Action + 트랜잭션 | High | `/settlements/generate/page.tsx + actions.ts` + GenerateSettlementsForm |
| M6 | 예외 처리 — 결강 / 일정 변경 / 강사 중도 하차 | Medium | RescheduleDialog / InstructorWithdrawalDialog + actions |
| M7 | 통합 테스트 (DB-backed) + 시나리오 검증 | Medium | `src/app/(app)/(operator)/settlements/generate/__tests__/integration.test.ts` |
| M8 | 회귀 검증 + SPEC-PAYOUT-001 보존 확인 + 문서화 | Low | 회귀 테스트 PASS + sync 준비 |

---

## 2. 마일스톤 상세

### M1: DB 마이그레이션 (Priority: High)

**목표**: `lecture_sessions`, `settlement_sessions` 신규 테이블 + `projects` 컬럼 추가 + (선택) `project_status` enum에 `instructor_withdrawn` 추가.

**산출물**:

- `supabase/migrations/20260429xxxxxx_lecture_sessions.sql`
  - `lecture_session_status` enum 정의
  - `lecture_sessions` 테이블 + 인덱스 3종 (project_date, instructor_date, deleted)
  - RLS 정책 3종 (admin all / operator rw / instructor self select)
- `supabase/migrations/20260429xxxxxx_projects_hourly_rate.sql`
  - `projects.hourly_rate_krw bigint NOT NULL DEFAULT 0 CHECK (>= 0)`
  - `projects.instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 100)`
  - 데이터 이행 가이드 주석
- `supabase/migrations/20260429xxxxxx_settlement_sessions_link.sql`
  - junction 테이블 + 인덱스 + RLS 정책 3종
- (선택) `supabase/migrations/20260429xxxxxx_project_status_instructor_withdrawn.sql`
  - `project_status` enum에 값 추가 (SPEC-PROJECT-001 협응)

**검증**:

- `npx supabase db reset` 무오류
- `pnpm db:verify` (기존 시드 + 새 마이그레이션) 통과
- 다른 강사 토큰으로 lecture_sessions SELECT 시 0행 (RLS 검증)
- `INSERT INTO lecture_sessions (project_id, date, hours) VALUES (..., 1.3)` → CHECK 거부

**TDD 사이클**:

- RED: RLS 검증 SQL 테스트 (다른 강사 토큰에서 SELECT 시도) — 검증 환경 부재로 거부 기대
- GREEN: 마이그레이션 적용 후 검증 통과
- REFACTOR: 중복 정책 통합, 인덱스 명명 일관화

---

### M2: 산식 순수 함수 (Priority: High)

**목표**: `src/lib/payouts/calculator.ts` 4개 순수 함수 + 단위 테스트 100% 커버.

**산출물**:

- `src/lib/payouts/calculator.ts`
  - `calculateInstructorFeePerHour(hourlyRateKrw, sharePct)`
  - `calculateTotalBilledHours(sessions)`
  - `calculateBusinessAmount(hourlyRateKrw, totalHours)`
  - `calculateInstructorFee(feePerHour, totalHours)`
  - 모든 함수에 `@MX:ANCHOR` 태그 (fan_in 예상 ≥ 3)
  - `// floor only, never round` 주석
- `src/lib/payouts/__tests__/calculator.test.ts`
  - SPEC §2.3 REQ-PAYOUT002-CALC-005의 5+ 케이스 + 추가 edge case
  - 0.5 단위 hours 검증
  - status 필터링 (completed만 포함)

**TDD 사이클**:

- RED: calculator.test.ts 작성 후 모든 케이스 fail
- GREEN: 최소 구현으로 PASS
- REFACTOR: 중복 제거, 타입 추출 (LectureSessionLite 등)

**검증**:

- `pnpm test src/lib/payouts/__tests__/calculator.test.ts` 0 failure
- 커버리지 ≥ 90%
- typecheck 0 errors

---

### M3: 세션 도메인 모듈 (Priority: High)

**목표**: `src/lib/sessions/*` — 타입, 쿼리, 상태머신, validation, 에러 메시지.

**산출물**:

- `src/lib/sessions/types.ts` — `LectureSession`, `LectureSessionStatus`, `SessionInput`
- `src/lib/sessions/status-machine.ts` — 전환 검증 (`planned → completed/canceled/rescheduled`만 허용, 그 외 동결)
- `src/lib/sessions/validation.ts` — zod 스키마 (date + hours 0.5 단위 + status + max 24)
- `src/lib/sessions/queries.ts` — listSessionsByProject / bulkUpsertSessions / cancelSession / rescheduleSession / bulkCancelFutureSessions
- `src/lib/sessions/errors.ts` — 한국어 에러 단일 출처
- `src/lib/sessions/index.ts` — barrel export
- `src/lib/sessions/__tests__/status-machine.test.ts` — 모든 from×to 조합 (4×4=16)
- `src/lib/sessions/__tests__/validation.test.ts` — 0.5 단위 / max 24 / 음수 거부
- `src/lib/sessions/__tests__/queries.test.ts` — bulk ops (mock DB)

**TDD 사이클**:

- RED: status-machine.test.ts에서 모든 전환 케이스 작성 후 fail
- GREEN: ALLOWED_TRANSITIONS 그래프 정의로 PASS
- REFACTOR: 한국어 에러 상수 통합, status badge 라벨과 동기화

**검증**:

- 단위 테스트 PASS
- 커버리지 ≥ 90%

---

### M4: 프로젝트 폼 확장 (Priority: High)

**목표**: `/projects/new`, `/projects/[id]/edit`에 시급 + 분배율 + 세션 매트릭스 추가.

**산출물**:

- `src/lib/projects/validation.ts` 확장 — `hourly_rate_krw`, `instructor_share_pct` 필드 추가 (zod)
- `src/lib/projects/queries.ts` 확장 — INSERT/UPDATE 페이로드에 두 컬럼 포함, 기존 흐름 그대로
- `src/components/projects/HourlyRateField.tsx` — KRW 포맷 input
- `src/components/projects/InstructorSharePctField.tsx` — % 0-100 numeric input
- `src/components/projects/SessionMatrixEditor.tsx` — date+hours+status 매트릭스, [날짜 추가] 버튼
- `src/components/sessions/LectureSessionStatusBadge.tsx` — 4-status 한국어 배지
- `src/app/(app)/(operator)/projects/new/page.tsx` 확장
- `src/app/(app)/(operator)/projects/new/actions.ts` 확장 — bulk INSERT lecture_sessions
- `src/app/(app)/(operator)/projects/[id]/edit/page.tsx` 확장
- `src/app/(app)/(operator)/projects/[id]/edit/actions.ts` 확장 — bulk upsert lecture_sessions

**TDD 사이클**:

- RED: 폼 validation 테스트 (share_pct=150 거부, hours=1.3 거부)
- GREEN: zod refinement + 폼 컴포넌트
- REFACTOR: SessionMatrixEditor의 행 컴포넌트 분리

**검증**:

- `pnpm build` 0 에러
- 폼 제출 → DB 행 INSERT 확인 (수동 또는 통합 테스트)
- a11y: 라벨 + 키보드 only 동작

---

### M5: 정산 일괄 생성 (Priority: High)

**목표**: `/settlements/generate` 라우트 + Server Action + 미리보기 UI.

**산출물**:

- `src/lib/payouts/generate.ts` — `generateSettlementsForPeriod` 핵심 로직
  - 미청구 세션 스캔 SQL (settlement_sessions 미link 조건)
  - 프로젝트별 그룹핑
  - 산식 적용 (calculator.ts 호출)
  - 트랜잭션으로 settlements + settlement_sessions INSERT
- `src/lib/payouts/__tests__/generate.test.ts` — 미청구 스캔 + 이중 청구 방지 + flow 별 INSERT
- `src/components/payouts/GenerateSettlementsForm.tsx` — period selector + project filter + 미리보기 + 생성 버튼
- `src/components/payouts/SettlementGeneratePreviewTable.tsx` — 미리보기 테이블
- `src/app/(app)/(operator)/settlements/generate/page.tsx` — 신규 라우트
- `src/app/(app)/(operator)/settlements/generate/actions.ts` — Server Action

**TDD 사이클**:

- RED: generate.test.ts에서 5개 시나리오 작성 (정상 / 0건 / 이중 청구 / 다중 프로젝트 / flow override)
- GREEN: 트랜잭션 로직 구현
- REFACTOR: SQL 쿼리를 Drizzle relational query로 정리, 산식 호출은 calculator.ts 전적 위임

**검증**:

- 단위 테스트 PASS
- 미리보기 → 생성 클릭 → settlements 행 INSERT + settlement_sessions link 확인
- GENERATED 컬럼 INSERT 페이로드에서 제외 (grep 검증)

---

### M6: 예외 처리 (Priority: Medium)

**목표**: 결강 / 일정 변경 / 강사 중도 하차 3종 흐름.

**산출물**:

- `src/components/projects/RescheduleDialog.tsx` — 새 날짜 입력 + 사유
- `src/components/projects/InstructorWithdrawalDialog.tsx` — 사유 입력 + 미래 세션 일괄 취소 미리보기
- `src/app/(app)/(operator)/projects/[id]/edit/actions.ts`에 추가 액션:
  - `cancelSessionAction(sessionId)` — status → canceled
  - `rescheduleSessionAction(sessionId, newDate)` — 트랜잭션 (원본 → rescheduled, 새 row INSERT with original_session_id)
  - `withdrawInstructorAction(projectId, reason)` — 트랜잭션 (미래 planned → canceled + project status → instructor_withdrawn)
- 프로젝트 상세 페이지에 "강사 중도 하차" 배너 추가
- `src/lib/projects/status-machine.ts` 확장 — `instructor_withdrawn` 상태 등록

**TDD 사이클**:

- RED: 시나리오 테스트 (reschedule 후 원본 status=`rescheduled`, 새 row의 original_session_id 검증)
- GREEN: 트랜잭션 구현
- REFACTOR: 한국어 confirmation 메시지 통합, 사유 필드 컴포넌트 추출

**검증**:

- 통합 테스트 (M7)에서 3종 시나리오 PASS
- 강사 중도 하차 후 미래 세션이 모두 canceled, 과거 completed는 보존됨을 SQL로 확인

---

### M7: 통합 테스트 + 시나리오 검증 (Priority: Medium)

**목표**: DB-backed 통합 테스트로 end-to-end 시나리오 검증.

**산출물**:

- `src/app/(app)/(operator)/settlements/generate/__tests__/integration.test.ts` — acceptance.md의 8개 시나리오 PASS
- 시나리오 1: 5회 강의 → completed → generate → settlement 1건 + 5 link
- 시나리오 2: 같은 기간 두 번 generate → 두 번째 0건
- 시나리오 3: 결강 1회 → 정산에서 제외
- 시나리오 4: 일정 변경 → 원본 제외, 새 세션 청구
- 시나리오 5: 강사 중도 하차 → 미래 일괄 canceled, 과거 보존
- 시나리오 6: GENERATED 컬럼 INSERT 페이로드 제외 (grep + INSERT 시도 422 재현)
- 시나리오 7: SPEC-PAYOUT-001 보존 (settlement 4-state, 세율 검증, 매입매출 위젯 정상 동작)
- 시나리오 8: RLS — instructor 토큰으로 다른 강사 sessions SELECT 시 0행

**TDD 사이클**:

- RED: 통합 시나리오 작성 후 fail
- GREEN: M5/M6 산출물로 PASS
- REFACTOR: 시드 데이터 fixture 분리, 중복 setup 제거

**검증**:

- 통합 테스트 PASS
- 회귀: SPEC-PAYOUT-001 기존 단위 테스트 46건 PASS 유지

---

### M8: 회귀 + 문서 + sync 준비 (Priority: Low)

**목표**: 회귀 검증 + SPEC-PAYOUT-001 보존 확인 + 문서 업데이트.

**산출물**:

- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 0 에러
- SPEC-PAYOUT-001의 기존 테스트 (46건) PASS 유지
- `.moai/specs/SPEC-PAYOUT-002/spec.md` HISTORY 업데이트 (구현 완료 노트)
- (sync phase에서) `README.md`, `CHANGELOG.md`, `.moai/project/structure.md`, `.moai/project/product.md` 업데이트
- (sync phase에서) MX 태그 검증 (`@MX:ANCHOR` calculator, generate, status-machine)

**검증**:

- TRUST 5 게이트 PASS
- 회귀 무사
- 문서 일관성

---

## 3. TDD 사이클 가이드

본 SPEC은 `.moai/config/sections/quality.yaml` `development_mode = tdd`를 따른다 (브라운필드 enhancement 적용).

각 마일스톤마다:

1. **(Pre-RED)** 기존 코드 읽기 (`src/lib/payouts/queries.ts`, `src/lib/projects/queries.ts`, SPEC-PAYOUT-001/SPEC-DB-001 산출물) — 기존 동작 보존 확인
2. **RED** — 실패하는 테스트 작성. 한 번에 한 가지 동작.
3. **GREEN** — 최소 구현으로 통과.
4. **REFACTOR** — 중복 제거, SOLID, 가독성 개선. 테스트 PASS 유지.

---

## 4. 의존성 / 순서

```
M1 (마이그레이션) ─┬─→ M2 (calculator) ─┬─→ M5 (generate) ─┐
                  │                    │                   │
                  └─→ M3 (sessions) ──┴─→ M4 (project form) ─→ M6 (예외) ─→ M7 (통합) ─→ M8
```

- M1은 모든 후속 마일스톤의 prerequisite
- M2와 M3는 병렬 가능
- M4는 M1+M3 의존, M5는 M2+M3+M4 의존, M6는 M5 의존
- M7은 모든 marketing 완료 후, M8은 sync 직전

---

## 5. SPEC-PAYOUT-001 보존 체크리스트

각 마일스톤 종료 시 다음을 확인한다:

- [ ] `src/lib/payouts/status-machine.ts` (4-state 머신) 변경 없음
- [ ] `src/lib/payouts/tax-calculator.ts` (세율 검증) 변경 없음
- [ ] `src/lib/payouts/aggregations.ts` (매입매출 위젯) 변경 없음
- [ ] SPEC-PAYOUT-001의 단위 테스트 (status 16조합 + 세율 + aggregations) 모두 PASS
- [ ] settlements INSERT 경로에서 GENERATED 컬럼(`profit_krw`, `withholding_tax_amount_krw`) 제외 (grep 검증)
- [ ] `withholding_tax_rate`이 flow에 종속 (corporate=0, government ∈ {3.30, 8.80})

---

## 6. Re-planning Triggers

(`.claude/rules/moai/workflow/spec-workflow.md` Re-planning Gate 적용)

다음 상황에서 재계획:

- M2 calculator 단위 테스트가 3회 이상 stagnate (산식 floor/round 결정 재토론 필요)
- M5 generate가 트랜잭션 deadlock 또는 동시성 이슈 발견 시
- SPEC-PROJECT-001 status machine과 `instructor_withdrawn` 통합이 호환성 문제 발생
- SPEC-RECEIPT-001 진행 상황에 따라 settlement_flow enum 협응 필요 시

---

_End of plan.md_
