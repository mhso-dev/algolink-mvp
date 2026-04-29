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

**목표**: `lecture_sessions`, `settlement_sessions` 신규 테이블 + `projects` 컬럼 추가 + **(필수)** `project_status` enum에 `instructor_withdrawn` 추가 (v0.1.1부터 필수 — REQ-EXCEPT-007 협응).

**산출물**:

- `supabase/migrations/20260429xxxxxx_lecture_sessions.sql`
  - `lecture_session_status` enum 정의
  - `lecture_sessions` 테이블 + 인덱스 3종 (project_date, instructor_date, deleted)
  - RLS 정책 3종 (admin all / operator rw / instructor self select)
  - **CHECK `hours > 0 AND hours <= 24`** (REQ-PAYOUT002-SESSIONS-001 / -008)
  - **`original_session_id ... ON DELETE RESTRICT`** (LOW-7 fix — 감사 추적 보존)
- `supabase/migrations/20260429xxxxxx_projects_hourly_rate.sql`
  - `projects.hourly_rate_krw bigint NOT NULL DEFAULT 0 CHECK (>= 0)`
  - `projects.instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 100)`
  - 데이터 이행 가이드 주석
- `supabase/migrations/20260429xxxxxx_settlement_sessions_link.sql`
  - junction 테이블 + RLS 정책 3종
  - **UNIQUE INDEX `settlement_sessions_lecture_session_unique` ON `(lecture_session_id)`** (REQ-PAYOUT002-LINK-006 — concurrent generate race-condition DB-layer 방지)
- **(필수)** `supabase/migrations/20260429xxxxxx_project_status_instructor_withdrawn.sql`
  - `ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'instructor_withdrawn';`
  - **비가역(one-way) 마이그레이션 — staging dry-run 후 sign-off 필수**

**검증**:

- `npx supabase db reset` 무오류
- `pnpm db:verify` (기존 시드 + 새 마이그레이션) 통과
- 다른 강사 토큰으로 lecture_sessions SELECT 시 0행 (RLS 검증)
- `INSERT INTO lecture_sessions (project_id, date, hours) VALUES (..., 1.3)` → CHECK 거부 (0.5 단위 위반)
- `INSERT INTO lecture_sessions (project_id, date, hours) VALUES (..., 25)` → CHECK 거부 (max 24 위반)
- 동일 `lecture_session_id`를 두 settlement_sessions 행에 link 시도 → UNIQUE 위반 (race 회귀 가드)

**M1 Acceptance Gate (v0.1.1 신설)** [HARD]:

1. **Rollback dry-run on staging**:
   - 모든 forward 마이그레이션을 staging에 적용 → `pnpm db:verify` PASS 확인
   - `npx supabase db reset` 또는 명시적 DOWN SQL 실행 (spec.md §4.2 표 참조)
   - 다시 forward 적용 → 동일 PASS 확인
   - lecture_sessions / projects.hourly_rate / settlement_sessions 마이그레이션은 가역(safe)임을 확인
2. **`instructor_withdrawn` enum 추가는 one-way migration으로 sign-off**:
   - PostgreSQL은 `ALTER TYPE ... DROP VALUE` 미지원 → post-deploy rollback 경로 없음
   - staging에서 backup-restore 사이클 1회 거쳐 unidirectional 특성 확인
   - 본 SPEC에서 production 적용 시 backup 가용성 사전 확인 필수
3. **status-flow.ts exhaustiveness check**:
   - SPEC-PROJECT-001의 `userStepFromEnum` switch에 `instructor_withdrawn` case가 추가되었는지 확인 (TypeScript `never` exhaustiveness)
   - 단위 테스트로 `userStepFromEnum('instructor_withdrawn') === '강사매칭'` 검증
4. **UNIQUE constraint stress test** (REQ-LINK-006):
   - 통합 테스트에서 두 동시 generate 트랜잭션을 시뮬레이션 (예: `Promise.all([generate(...), generate(...)])`) → 두 번째가 23505로 실패함을 검증

**TDD 사이클**:

- RED: RLS 검증 SQL 테스트 (다른 강사 토큰에서 SELECT 시도) — 검증 환경 부재로 거부 기대 + `hours=25` CHECK 거부 케이스 + UNIQUE 위반 케이스
- GREEN: 마이그레이션 적용 후 검증 통과
- REFACTOR: 중복 정책 통합, 인덱스 명명 일관화

---

### M2: 산식 순수 함수 (Priority: High)

**목표**: `src/lib/payouts/calculator.ts` 4개 순수 함수 + 단위 테스트 100% 커버. **정수 산술(integer arithmetic) 채택으로 IEEE-754 부동소수점 drift 차단**.

**산출물**:

- `src/lib/payouts/calculator.ts`
  - `calculateInstructorFeePerHour(hourlyRateKrw, sharePct)` → `floor((rate × Math.round(pct × 100)) / 10000)` (정수 산술)
  - `calculateTotalBilledHours(sessions)` → status='completed' AND deleted_at=null만 합산
  - `calculateBusinessAmount(hourlyRateKrw, totalHours)` → `floor(rate × totalHours)` (`.5` 분모 차단)
  - `calculateInstructorFee(feePerHour, totalHours)` → `floor(feePerHour × totalHours)` (`.5` 분모 차단)
  - 모든 함수에 `@MX:ANCHOR` 태그 (fan_in 예상 ≥ 3)
  - `// floor only, never round` 주석 + IEEE-754 drift 방지 주석 (v0.1.1)
- `src/lib/payouts/__tests__/calculator.test.ts`
  - SPEC §2.3 REQ-PAYOUT002-CALC-005의 8+ 케이스 (a~h):
    - (a) `(100000, 70) → 70000`
    - (b) `(80000, 66.67) → 53336`
    - (c) sessions filter `[completed:2.0, completed:1.5, planned:1.0, canceled:1.0, rescheduled:2.0] → 3.5`
    - (d) `(*, 0) → 0`
    - (e) `(0, *) → 0`
    - **(f) IEEE-754 drift regression: `(1000, 32.3) → 323` (정수 산술이 부동소수점 식 322보다 1원 높게 산출)**
    - (g) cascade: `(80000, 66.67, 4.5) → fee_per_hour=53336, business=360000, fee=floor(53336×4.5)=240012`
    - (h) `(*, 33.33)` integer 변환 정확성: `Math.round(33.33 × 100) === 3333`
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
- (회귀) `(1000, 32.3) → 323` 케이스 PASS는 정수 산술 채택 여부의 게이트키퍼

---

### M3: 세션 도메인 모듈 (Priority: High)

**목표**: `src/lib/sessions/*` — 타입, 쿼리, 상태머신, validation, 에러 메시지.

**산출물**:

- `src/lib/sessions/types.ts` — `LectureSession`, `LectureSessionStatus`, `SessionInput`
- `src/lib/sessions/status-machine.ts` — 전환 검증 (`planned → completed/canceled/rescheduled`만 허용, 그 외 동결)
- `src/lib/sessions/validation.ts` — zod 스키마 (date + hours: `min(0).step(0.5).max(24)` — REQ-PAYOUT002-SESSIONS-003 + SESSIONS-008 + status). DB CHECK와 application-layer 매칭으로 defense-in-depth.
- `src/lib/sessions/queries.ts` — listSessionsByProject / bulkUpsertSessions / cancelSession / rescheduleSession / bulkCancelFutureSessions
- `src/lib/sessions/errors.ts` — 한국어 에러 단일 출처
- `src/lib/sessions/index.ts` — barrel export
- `src/lib/sessions/__tests__/status-machine.test.ts` — 모든 from×to 조합 (4×4=16)
- `src/lib/sessions/__tests__/validation.test.ts` — 0.5 단위 거부 / **max 24 거부 (hours=25 → reject with `"강의 시수는 24시간을 초과할 수 없습니다."`)** / 음수 거부 / share_pct 0~100 범위 외 거부
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
  - 미청구 세션 스캔 SQL (settlement_sessions 미link 조건 — UI 미리보기용 early reject)
  - 프로젝트별 그룹핑
  - 산식 적용 (calculator.ts 호출)
  - 트랜잭션으로 settlements + settlement_sessions INSERT
  - **UNIQUE 위반(SQLSTATE 23505) catch 핸들러** — race condition 발생 시 한국어 에러 `"이 강의는 이미 다른 정산에 청구되었습니다. 새로 고침 후 다시 시도해주세요."` 반환 (REQ-PAYOUT002-LINK-006)
- `src/lib/payouts/__tests__/generate.test.ts` — 미청구 스캔 + 이중 청구 방지 + flow 별 INSERT + **race-condition 시뮬레이션 (`Promise.all` 두 generate 호출 → 한쪽만 성공)**
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

- `src/components/projects/RescheduleDialog.tsx` — 새 날짜 입력 + 사유 (notes inherit-and-amend UX, REQ-EXCEPT-002)
- `src/components/projects/InstructorWithdrawalDialog.tsx` — 사유 입력 + 미래 세션 일괄 취소 미리보기
- `src/app/(app)/(operator)/projects/[id]/edit/actions.ts`에 추가 액션:
  - `cancelSessionAction(sessionId, reason?)` — status → canceled (사유 notes 추가)
  - `rescheduleSessionAction(sessionId, newDate, notes?)` — 트랜잭션 (원본 → rescheduled, 새 row INSERT with `original_session_id` + **`notes` 인계** — 운영자 amend 가능, REQ-EXCEPT-002 LOW-8)
  - `withdrawInstructorAction(projectId, reason)` — 트랜잭션 (미래 planned → canceled + project status → instructor_withdrawn)
- 프로젝트 상세 페이지에 "강사 중도 하차" 배너 추가
- **`src/lib/projects/status-flow.ts` 확장 (REQ-PAYOUT002-EXCEPT-007)**:
  - `userStepFromEnum` switch 문에 `case 'instructor_withdrawn': return '강사매칭';` 추가
  - TypeScript exhaustiveness check (`never` default) 통과 검증
  - 단위 테스트 `userStepFromEnum('instructor_withdrawn') === '강사매칭'`
- `src/lib/projects/status-machine.ts` 확장 — `instructor_withdrawn` 상태 등록 (전환 규칙은 SPEC-PROJECT-001과 협의: → `lecture_requested` 또는 `instructor_sourcing` 으로 재진입 가능)

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

- `src/app/(app)/(operator)/settlements/generate/__tests__/integration.test.ts` — acceptance.md의 17개 시나리오 PASS
- 시나리오 1: 5회 강의 → completed → generate → settlement 1건 + 5 link
- 시나리오 2: 결강 1회 → 정산에서 제외
- 시나리오 3: 일정 변경 → 원본 제외, 새 세션 청구 (notes 인계 검증 포함)
- 시나리오 4: 다중 프로젝트 동시 generate → settlements 2건 INSERT
- 시나리오 5: 같은 기간 두 번 generate → 두 번째 0건 (미리보기 단계 차단)
- 시나리오 6: 강사 중도 하차 → 미래 일괄 canceled, 과거 보존, project status='instructor_withdrawn'
- 시나리오 7: 산식 정합 (정수 산술, IEEE-754 drift 회귀 case 포함)
- 시나리오 8: RLS — instructor 토큰으로 다른 강사 sessions SELECT 시 0행
- 시나리오 9: SPEC-PAYOUT-001 보존 (settlement 4-state, 세율 검증, 매입매출 위젯 정상 동작)
- **시나리오 10 (HIGH-2 회귀)**: concurrent generate race — `Promise.all([generate(...), generate(...)])` → 한쪽만 성공, 반대편은 23505 unique violation으로 ROLLBACK + 한국어 에러
- **시나리오 11 (MEDIUM-5)**: 0.5 단위 hours 거부 (`hours=1.3`) + max 24 거부 (`hours=25`)
- **시나리오 12 (MEDIUM-5)**: completed/canceled/rescheduled 세션의 status freeze (planned로 되돌리기 시도 → 거부)
- **시나리오 13 (MEDIUM-5)**: share_pct > 100 거부 + share_pct < 0 거부 (zod schema)
- **시나리오 14 (MEDIUM-5)**: settlement_sessions에 link된 lecture_session 하드삭제 시도 → ON DELETE RESTRICT 거부
- **시나리오 15 (MEDIUM-5)**: instructor 토큰으로 settlement_sessions SELECT 시 본인 settlement에 link된 row만 반환 (RLS join)
- **시나리오 16 (MEDIUM-5)**: service-role Supabase client 미사용 검증 (grep `createServiceClient` → 0 hit in payouts/sessions modules)
- **시나리오 17 (MEDIUM-5)**: settlement_flow defaulting — 프로젝트에 flow 메타데이터 있으면 default, 없으면 운영자가 미리보기에서 그룹별 선택
- **시나리오 18 (MEDIUM-6)**: `userStepFromEnum('instructor_withdrawn') === '강사매칭'` exhaustiveness 검증

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
- `.moai/specs/SPEC-PAYOUT-002/spec.md` HISTORY 업데이트 (v0.1.1 amendments 적용 노트 + 구현 완료 노트)
- v0.1.1 회귀 가드 검증:
  - calculator: `(1000, 32.3) → 323` 케이스 PASS (정수 산술 채택 게이트키퍼)
  - settlement_sessions: `Promise.all` 동시 generate → 한쪽만 성공
  - status-flow.ts: `userStepFromEnum('instructor_withdrawn') === '강사매칭'`
  - `hours=25` 거부 + DB CHECK + zod 두 layer 검증
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
