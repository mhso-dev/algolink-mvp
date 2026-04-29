# SPEC-PAYOUT-002 Acceptance Criteria

각 시나리오는 Given / When / Then 형식이다. 모든 시나리오는 통합 테스트 또는 단위 테스트로 검증한다.

---

## Scenario 1: 세션 CRUD — planned 등록 → completed 마킹

**Given**
- operator가 `/projects/new`에 진입한다
- 신규 프로젝트의 시간당 사업비 100,000원, 강사 분배율 70%로 설정한다
- 세션 매트릭스에 `2026-05-03` (2.0h), `2026-05-10` (2.0h) 두 행을 추가한다

**When**
- 운영자가 [저장] 버튼을 클릭한다
- 폼이 제출되어 프로젝트가 생성되고 lecture_sessions 2건이 INSERT된다
- 이후 `/projects/[id]/edit`에서 첫 번째 세션의 status를 `planned` → `completed`로 변경하고 [저장] 클릭한다

**Then**
- 첫 번째 세션의 status는 `completed`이고 `updated_at`이 갱신된다
- 두 번째 세션의 status는 `planned`이고 변화가 없다
- DB에 `lecture_sessions` 2행 존재, 모두 `deleted_at IS NULL`
- 한국어 토스트 또는 알림 없음 (정상 흐름)

---

## Scenario 2: 결강 (canceled) — 정산 산정에서 자동 제외

**Given**
- 프로젝트 X에 lecture_sessions 5건이 있다
  - `2026-05-03` (2.0h, completed)
  - `2026-05-10` (2.0h, completed)
  - `2026-05-17` (2.0h, **canceled**)
  - `2026-05-24` (2.0h, completed)
  - `2026-05-31` (2.0h, completed)
- 시간당 사업비 100,000원, 강사 분배율 70%

**When**
- operator가 `/settlements/generate`에서 period=`2026-05`, 프로젝트 필터=프로젝트 X 선택
- [정산 생성] 버튼 클릭 → 확인

**Then**
- 미리보기에 "총 8.0시간 / 800,000원 / 강사비 560,000원"이 표시된다 (canceled 제외)
- settlement 1건이 INSERT되고 `business_amount_krw=800000`, `instructor_fee_krw=560000`
- settlement_sessions에 4건 link (canceled 세션은 link되지 않음)
- 한국어 성공 메시지 표시 후 `/settlements?period=2026-05`로 리다이렉트

---

## Scenario 3: 일정 변경 (rescheduled) — 원본 제외, 새 세션이 청구, notes 인계 (LOW-8 포함)

**REQ**: REQ-PAYOUT002-EXCEPT-002

**Given**
- 프로젝트 X에 lecture_sessions 1건이 있다
  - id=`session-A`, `2026-05-17` (2.0h, planned, original_session_id=NULL, **notes=`"강사 요청 사항: 화이트보드 준비"`**)
- 운영자가 해당 세션의 [다른날로 옮김] 버튼을 클릭한다

**When**
- 모달에서 새 날짜 `2026-05-20` 입력 + (선택) 비고 textarea가 원본 notes로 prefilled된 채 표시
- 운영자는 비고를 그대로 두거나 amend (예: `"강사 요청 사항: 화이트보드 준비 + 빔프로젝터 추가"`)
- [확인] 클릭 → 트랜잭션이 실행된다

**Then**
- session-A의 status는 `rescheduled`로 변경된다 (date는 그대로 `2026-05-17`)
- 새 세션 `session-B`가 INSERT된다
  - `project_id`는 동일
  - `instructor_id`는 동일
  - `hours = 2.0`
  - `date = 2026-05-20`
  - `status = 'planned'`
  - `original_session_id = session-A.id`
  - **`notes`는 원본의 `"강사 요청 사항: 화이트보드 준비"` 또는 운영자가 amend한 값** (carry-forward 보장)
- 이후 session-B의 status를 `completed`로 마킹한 후 generate 실행
- generate 미리보기에 session-B만 포함되고 session-A는 제외된다
- settlement_sessions에 session-B만 link됨
- session-A를 hard-delete 시도 시 `original_session_id` FK RESTRICT가 거부 (LOW-7 — 감사 추적 보존)

---

## Scenario 4: 운영자 배치 generate — 다중 프로젝트 동시 처리

**Given**
- 프로젝트 P1: 시간당 100,000원 / 분배율 70% / completed sessions 3건 (총 6h)
- 프로젝트 P2: 시간당 80,000원 / 분배율 60% / completed sessions 4건 (총 8h)
- 두 프로젝트 모두 settlement_flow는 `corporate`로 설정
- 모든 세션이 `2026-05` 기간에 속한다

**When**
- operator가 `/settlements/generate`에서 period=`2026-05`, 프로젝트 필터 없이(전체) [정산 생성] 클릭

**Then**
- 미리보기 테이블에 P1, P2 두 행이 표시된다
  - P1: 6h / 600,000원 / 강사비 = 6 × floor(100000 × 70 / 100) = 6 × 70000 = 420,000원
  - P2: 8h / 640,000원 / 강사비 = 8 × floor(80000 × 60 / 100) = 8 × 48000 = 384,000원
- [정산 생성] 클릭 → 한 트랜잭션으로 settlements 2건 INSERT
- settlement_sessions에 7건 link (P1: 3건, P2: 4건)
- 두 settlement 모두 status=`pending`, settlement_flow=`corporate`, withholding_tax_rate=0
- GENERATED 컬럼 `profit_krw` / `withholding_tax_amount_krw`은 INSERT 페이로드에 포함되지 않으나 SELECT 시 자동 계산된 값이 반환된다

---

## Scenario 5: 이중 청구 방지 — 같은 기간 재실행 시 0건

**Given**
- Scenario 4가 완료되어 settlements 2건 + settlement_sessions 7건이 존재한다
- 운영자가 실수로 같은 period(`2026-05`)로 다시 generate를 시도한다

**When**
- operator가 `/settlements/generate`에서 period=`2026-05`로 미리보기 조회

**Then**
- 미리보기 테이블이 비어있다
- 한국어 메시지 `"선택한 기간에 청구할 강의가 없습니다."` 표시
- [정산 생성] 버튼은 비활성화 또는 클릭 시 settlements INSERT 0건
- 기존 settlements 2건은 변화 없음
- DB에 settlements 총 행 수는 그대로 2건 (변화 없음)

---

## Scenario 6: 강사 중도 하차 — 미래 세션 일괄 canceled, 과거 completed 보존

**Given**
- 오늘 날짜는 `2026-05-15`이다
- 프로젝트 X에 lecture_sessions 5건이 있다
  - `2026-05-03` (2.0h, completed) — 과거
  - `2026-05-10` (2.0h, completed) — 과거
  - `2026-05-17` (2.0h, planned) — 미래
  - `2026-05-24` (2.0h, planned) — 미래
  - `2026-05-31` (2.0h, planned) — 미래

**When**
- operator가 `/projects/[X]/edit`에서 [강사 중도 하차] 버튼 클릭
- 모달에서 사유 "강사 개인 사정으로 중도 하차" 입력 → 확인
- 트랜잭션 실행

**Then**
- 과거 completed 세션 2건은 변화 없음 (status=`completed` 유지)
- 미래 planned 세션 3건이 모두 `canceled`로 전환된다
- 각 canceled 세션의 `notes`에 사유 텍스트가 저장된다 (또는 별도 컬럼)
- 프로젝트 X의 `status`가 `instructor_withdrawn`으로 전환된다
- 프로젝트 상세 페이지에 "강사 중도 하차" 배너가 표시된다
- 이후 generate 실행 시 과거 completed 2건만 청구 (4시간 × 100,000원)

---

## Scenario 7: 산식 정합 — 정수 산술 (Integer Arithmetic) + IEEE-754 drift 방지

**Given**
- (단위 테스트 환경) `src/lib/payouts/calculator.ts` 모듈을 임포트한다
- 모든 함수는 정수 산술을 사용한다: `feePerHour = floor((rate × Math.round(pct × 100)) / 10000)`, `business = floor(rate × hours)`, `fee = floor(feePerHour × hours)`

**When**
- 다음 케이스를 호출한다:
  - case A: `calculateInstructorFeePerHour(100000, 70)` → 결과 R_A
  - case B: `calculateInstructorFeePerHour(80000, 66.67)` → 결과 R_B
  - case C: `calculateInstructorFeePerHour(0, 70)` → 결과 R_C
  - case D: `calculateInstructorFeePerHour(100000, 0)` → 결과 R_D
  - case E: `calculateInstructorFeePerHour(100000, 100)` → 결과 R_E
  - **case F (IEEE-754 drift regression)**: `calculateInstructorFeePerHour(1000, 32.3)` → 결과 R_F
  - case G (totalHours): `calculateTotalBilledHours([{status:'completed', hours:2.0}, {status:'completed', hours:1.5}, {status:'planned', hours:1.0}, {status:'canceled', hours:1.0}, {status:'rescheduled', hours:2.0}])` → 결과 R_G
  - case H (business): `calculateBusinessAmount(100000, 8.0)` → 결과 R_H
  - case I (instructorFee): `calculateInstructorFee(70000, 8.0)` → 결과 R_I
  - **case J (cascade with .5 hours)**: `calculateInstructorFee(53336, 4.5)` → 결과 R_J
  - **case K (cascade with odd × .5)**: `calculateInstructorFee(16665, 4.5)` → 결과 R_K
  - **case L (share_pct=33.33 integer 변환)**: `Math.round(33.33 * 100) === 3333`

**Then**
- R_A === 70000 (정확히 — `floor((100000 × 7000) / 10000) = floor(70000) = 70000`)
- R_B === 53336 (정수 산술 — `floor((80000 × 6667) / 10000) = floor(53336) = 53336`. 부동소수점 식 `floor(80000 × 66.67 / 100)`은 V8/Node 25 환경에서도 동일하게 53336을 산출하므로 회귀 영향 없으나, 본 SPEC은 monetary safety 차원에서 정수 산술을 채택하여 관용적 IEEE-754 drift 인풋을 모두 방지한다.)
- R_C === 0
- R_D === 0
- R_E === 100000
- **R_F === 323** (정수 산술 — `floor((1000 × 3230) / 10000) = floor(323) = 323`. 부동소수점 식 `floor(1000 × 32.3 / 100)`은 322 (1원 drift 발생). 본 케이스는 정수 산술 채택의 게이트키퍼 회귀 테스트이며, 결과 322가 나오면 floating-point 산식이 잠입한 것이므로 즉시 FAIL.)
- R_G === 3.5 (completed 2.0 + 1.5만 합산, planned/canceled/rescheduled는 제외)
- R_H === 800000 (= floor(100000 × 8.0))
- R_I === 560000 (= floor(70000 × 8.0))
- **R_J === 240012** (= floor(53336 × 4.5) = floor(240012.0). 53336이 짝수라 `.5` 분모가 소거되어 정확히 240012)
- **R_K === 74992** (= floor(16665 × 4.5) = floor(74992.5) = 74992. 홀수 × `.5`는 floor 적용으로 절단)
- 모든 결과는 정수 (Number.isInteger 통과)
- `Math.round(33.33 * 100) === 3333` (numeric(5,2) 입력의 정수 변환 정확성)

---

## Scenario 8: RLS — instructor cannot read other instructors' sessions

**Given**
- DB에 lecture_sessions 2건이 있다
  - session-1: instructor_id = `instructor-A.id`
  - session-2: instructor_id = `instructor-B.id`
- instructor-A로 로그인한 사용자 토큰을 사용한다

**When**
- instructor-A 토큰으로 `SELECT * FROM lecture_sessions` 실행 (Supabase 사용자 클라이언트)

**Then**
- 결과 행 수 === 1
- 반환된 행은 session-1만 포함 (instructor_id = instructor-A.id)
- session-2는 반환되지 않는다
- instructor-A가 `/settlements/generate` URL을 직접 입력해도 SPEC-AUTH-001의 `requireRole(['operator', 'admin'])` 가드가 silent redirect를 수행하여 페이지에 도달하지 못한다
- (defense in depth) 가드가 실패해도 RLS가 lecture_sessions / settlement_sessions에 대한 INSERT/UPDATE/DELETE를 거부한다

---

## Scenario 10: 동시 generate race condition 차단 — UNIQUE INDEX defense (HIGH-2 회귀)

**REQ**: REQ-PAYOUT002-LINK-006

**Given**
- 프로젝트 X에 lecture_sessions 5건이 모두 `completed` 상태로 존재한다 (period: 2026-05)
- settlement_sessions에는 아무 link도 없다 (미청구 상태)
- 두 운영자 세션이 동시에 `/settlements/generate`에 진입하여 같은 period(`2026-05`) + 같은 프로젝트 필터로 [정산 생성]을 클릭한다 (race 시뮬레이션)

**When**
- 통합 테스트는 `Promise.all([generateSettlementsForPeriod({ periodStart, periodEnd, projectIds: [X] }), generateSettlementsForPeriod({ periodStart, periodEnd, projectIds: [X] })])` 호출
- 두 트랜잭션이 거의 동시에 시작되어 SELECT 단계에서 동일한 unbilled set [s1..s5]를 본다
- 첫 트랜잭션이 settlement INSERT + 5건 link INSERT을 commit
- 두 번째 트랜잭션이 settlement INSERT 후 첫 link INSERT 시 `settlement_sessions_lecture_session_unique` UNIQUE 위반(SQLSTATE 23505) 발생

**Then**
- 첫 번째 호출의 결과는 `{ ok: true, createdCount: 1, linkedCount: 5 }`
- 두 번째 호출의 결과는 `{ ok: false, error: '이 강의는 이미 다른 정산에 청구되었습니다. 새로 고침 후 다시 시도해주세요.' }`
- DB에 settlement 행은 정확히 **1건**만 존재 (두 번째 settlement도 transactional rollback으로 함께 취소됨)
- DB에 settlement_sessions 행은 정확히 **5건**만 존재
- 한 lecture_session_id가 두 settlement에 link된 이중 청구 상태가 발생하지 **않는다**

---

## Scenario 11: hours 입력 검증 — 0.5 단위 + max 24 (MEDIUM-4 + MEDIUM-5)

**REQs**: REQ-PAYOUT002-SESSIONS-003, REQ-PAYOUT002-SESSIONS-008

**Given**
- operator가 `/projects/[id]/edit`에 진입하여 세션 매트릭스에 새 행을 추가한다

**When**
- 운영자가 다음 4가지 hours 값을 시도한다:
  - case A: `hours=1.3`
  - case B: `hours=25`
  - case C: `hours=0`
  - case D: `hours=-1`
- 각 케이스에 대해 [저장] 버튼을 클릭하거나 zod schema가 client-side에서 검증을 수행한다

**Then**
- case A: zod schema가 거부, 한국어 에러 `"강의 시수는 0.5시간 단위로 입력해주세요."` 표시
- case B: zod schema가 거부, 한국어 에러 `"강의 시수는 24시간을 초과할 수 없습니다."` 표시
- case C: zod schema가 거부, 한국어 에러 `"강의 시수는 0보다 커야 합니다."` 표시
- case D: case C와 동일 (음수 값)
- 만약 zod 우회된 INSERT가 DB에 도달해도 (defense in depth), DB CHECK `hours > 0 AND hours <= 24` 가 거부 (PostgreSQL `check_violation` SQLSTATE `23514`)

---

## Scenario 12: status freeze — completed/canceled/rescheduled 되돌리기 차단 (MEDIUM-5)

**REQs**: REQ-PAYOUT002-SESSIONS-005, REQ-PAYOUT002-EXCEPT-005

**Given**
- 프로젝트 X에 lecture_sessions 3건이 있다:
  - session-α: status=`completed`
  - session-β: status=`canceled`
  - session-γ: status=`rescheduled`
- 운영자가 수정 폼에서 각 세션의 status를 다른 값으로 변경 시도한다

**When**
- case A: session-α (completed) → planned 시도
- case B: session-α (completed) → canceled 시도
- case C: session-β (canceled) → planned 시도
- case D: session-γ (rescheduled) → completed 시도

**Then**
- 모든 케이스에서 `src/lib/sessions/status-machine.ts`의 `validateTransition(from, to)` 가 거부
- 한국어 에러 `"종료된 강의 세션은 상태를 변경할 수 없습니다."` 표시
- DB UPDATE 미수행, 세션 상태는 변하지 않음
- 단위 테스트: 4-state × 4-state = 16조합 중 `planned → completed/canceled/rescheduled`만 ALLOW, 그 외 13조합 모두 REJECT

---

## Scenario 13: share_pct 범위 외 거부 (MEDIUM-5)

**REQ**: REQ-PAYOUT002-PROJECT-FIELDS-005

**Given**
- operator가 `/projects/new`에서 신규 프로젝트 폼을 작성한다

**When**
- 운영자가 다음 share_pct 값을 시도한다:
  - case A: `instructor_share_pct=150`
  - case B: `instructor_share_pct=-10`
  - case C: `instructor_share_pct=100.01`
  - case D: `instructor_share_pct=99.99` (정상)

**Then**
- case A, B, C: zod schema 거부, 한국어 에러 `"강사 분배율은 0~100 사이여야 합니다."` 표시
- case D: 통과, 폼 제출 가능
- DB CHECK `instructor_share_pct BETWEEN 0 AND 100` 도 동일하게 거부 (defense in depth)

---

## Scenario 14: ON DELETE RESTRICT — link된 lecture_session 하드삭제 차단 (MEDIUM-5)

**REQ**: REQ-PAYOUT002-LINK-005

**Given**
- settlement S1이 lecture_sessions [s1, s2, s3]에 link되어 있다 (settlement_sessions 3행 존재)
- 운영자가 SQL 콘솔 또는 admin tool로 `DELETE FROM lecture_sessions WHERE id = 's1'` 시도

**When**
- DELETE 명령이 PostgreSQL FK 검증 단계에 도달한다

**Then**
- FK `settlement_sessions.lecture_session_id REFERENCES lecture_sessions(id) ON DELETE RESTRICT` 가 거부
- PostgreSQL 에러 `update or delete on table "lecture_sessions" violates foreign key constraint ... on table "settlement_sessions"`
- DELETE 미수행, lecture_sessions row 보존
- 한국어 application 에러 `"이 세션은 정산에 청구되어 삭제할 수 없습니다. 정산을 먼저 처리해주세요."` 표시 (UI 상에서 운영자에게 노출되는 경우)

---

## Scenario 15: settlement_sessions RLS — instructor self-select via join (MEDIUM-5)

**REQ**: REQ-PAYOUT002-RLS-002

**Given**
- DB에 settlements 2건과 settlement_sessions 6행:
  - settlement-A: instructor=instructor-A, link된 sessions=[s1, s2, s3]
  - settlement-B: instructor=instructor-B, link된 sessions=[s4, s5, s6]
- instructor-A로 로그인한 사용자 토큰을 사용한다

**When**
- instructor-A 토큰으로 `SELECT * FROM settlement_sessions` 실행 (Supabase 사용자 클라이언트, RLS 적용)

**Then**
- 결과 행 수 === 3
- 반환된 행은 [s1, s2, s3]에 해당하는 link만 (settlement-A 소속)
- settlement-B의 link 3건은 반환되지 않음
- RLS 정책 `settlement_sessions_instructor_self_select` 가 settlements 조인을 수행: `WHERE settlement_id IN (SELECT id FROM settlements WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid()))`

---

## Scenario 16: service-role client 미사용 검증 (MEDIUM-5)

**REQ**: REQ-PAYOUT002-RLS-004

**Given**
- 본 SPEC이 도입한 모든 신규 모듈 (`src/lib/sessions/`, `src/lib/payouts/calculator.ts`, `src/lib/payouts/generate.ts`, `src/app/(app)/(operator)/settlements/generate/`)

**When**
- 다음 grep 명령을 실행한다:
  - `grep -rn "createServiceClient\|service_role\|SUPABASE_SERVICE_ROLE_KEY" src/lib/sessions/ src/lib/payouts/calculator.ts src/lib/payouts/generate.ts src/app/\(app\)/\(operator\)/settlements/generate/`

**Then**
- grep 결과는 0행 (no matches)
- 모든 DB 호출은 user-scoped server client (`createServerClient` from `@supabase/ssr` 또는 SPEC-AUTH-001 helper) 사용
- RLS가 authoritative authorization layer로 유지됨
- 회귀 가드: lint 또는 CI에 grep 검증 추가 권장 (제안 사항, 본 SPEC은 acceptance 검증으로 충분)

---

## Scenario 17: settlement_flow defaulting + 운영자 override (MEDIUM-5)

**REQ**: REQ-PAYOUT002-GENERATE-008

**Given**
- 프로젝트 P1: `settlement_flow='corporate'` 메타데이터 보유 (기존 컬럼 또는 신규 컬럼; 본 SPEC은 기존 메타데이터를 그대로 사용)
- 프로젝트 P2: `settlement_flow` 메타데이터 미설정 (NULL)
- 두 프로젝트 모두 `2026-05` 기간에 completed 세션 다수

**When**
- operator가 `/settlements/generate`에 진입하여 period=`2026-05`, 프로젝트 필터=[P1, P2] 선택
- 미리보기 테이블이 표시된다

**Then**
- P1 행: settlement_flow 컬럼에 `corporate` 가 자동 default로 표시됨 (편집 불가 또는 편집 가능 — UI 결정)
- P2 행: settlement_flow 컬럼에 dropdown(`corporate` / `government`) 표시, 운영자 선택 필수
- 운영자가 P2의 flow를 `government` + withholding_rate=`3.30`으로 선택한다
- [정산 생성] 클릭 시 settlements 2건 INSERT:
  - P1 settlement: `settlement_flow='corporate'`, `withholding_tax_rate=0`
  - P2 settlement: `settlement_flow='government'`, `withholding_tax_rate=3.30`

---

## Scenario 18: instructor_withdrawn → '강사매칭' user-step 매핑 (MEDIUM-6)

**REQ**: REQ-PAYOUT002-EXCEPT-007

**Given**
- M1 마이그레이션이 적용되어 `project_status` enum에 `'instructor_withdrawn'` 값이 존재한다
- `src/lib/projects/status-flow.ts` 가 SPEC-PROJECT-001 v0.1.0에서 정의된 `userStepFromEnum` switch를 보유한다

**When**
- 단위 테스트 환경에서 `userStepFromEnum('instructor_withdrawn')` 를 호출한다
- TypeScript 컴파일러가 `userStepFromEnum`의 switch-never exhaustiveness check를 수행한다

**Then**
- `userStepFromEnum('instructor_withdrawn') === '강사매칭'` (정확히 일치)
- TypeScript 컴파일 에러 0건 — `instructor_withdrawn` case가 switch에 있어 `never` exhaustiveness check 통과
- `defaultEnumForUserStep('강사매칭') === 'lecture_requested'` (forward-flow default 보존, instructor_withdrawn은 regression 진입점이므로 default가 아님)
- ProjectStatusBadge / ProjectStatusStepper 등 7-step UI는 instructor_withdrawn 상태의 프로젝트를 `'강사매칭'` step에 highlight (시각적으로 새 강사 재배정 단계임을 표현)
- 단위 테스트: SPEC-PROJECT-001의 13개 enum value × `userStepFromEnum` 매핑 매트릭스 + `instructor_withdrawn` 1건 추가 = 14개 케이스 모두 PASS

---

## Scenario 9 (보너스): SPEC-PAYOUT-001 보존 — settlement 4-state 머신 정상 동작

**Given**
- Scenario 4에서 settlement-1 (status=`pending`)이 INSERT되어 있다

**When**
- operator가 `/settlements/[settlement-1.id]` 진입
- [정산 요청] 버튼 클릭 → 확인 다이얼로그 → 진행
- 이후 [입금 확인] 버튼 클릭 → 확인 → 진행

**Then**
- settlement-1의 status가 `pending → requested → paid` 순으로 전환된다
- `payment_received_at`이 `paid` 전환 시점의 timestamp로 갱신된다
- settlement_status_history에 2개 행이 자동 INSERT된다 (트리거 동작)
- notifications에 1행 INSERT (`type='settlement_requested'`, recipient = 강사 user_id)
- 콘솔 로그 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` 출력
- SPEC-PAYOUT-001의 `held → paid` 직접 전환 차단도 그대로 동작 (별도 검증)
- 매입매출 위젯이 settlement-1의 금액을 합계에 포함

---

## Quality Gates / Definition of Done

### Build & Type
- [ ] `pnpm build` 0 에러
- [ ] `pnpm typecheck` 0 에러
- [ ] `pnpm lint` 0 에러 / 0 경고 (sessions / payouts 영역)

### Test
- [ ] 단위 테스트 PASS — calculator (≥ 8 케이스 — REQ-CALC-005 a~h, IEEE-754 drift 회귀 케이스 포함), sessions/status-machine (16 조합), sessions/validation (0.5 단위 + max 24 + 음수 거부), generate (race 시뮬레이션 포함)
- [ ] 단위 테스트 라인 커버리지 ≥ 90% (`src/lib/payouts/calculator.ts` + `src/lib/sessions/`)
- [ ] 통합 테스트 PASS — Scenario 1~18 모두 자동화 (Scenario 9는 보너스/회귀)
- [ ] SPEC-PAYOUT-001의 기존 단위 테스트 46건 모두 PASS 유지 (회귀 검증)
- [ ] **HIGH-2 race regression**: Scenario 10 자동화 (Promise.all 동시 generate) — 통과 시 UNIQUE INDEX 정상 동작 확인

### DB / Migration
- [ ] `npx supabase db reset` 무오류
- [ ] `pnpm db:verify` 통과
- [ ] RLS 정책 3종 (lecture_sessions / settlement_sessions / projects 신규 컬럼) 검증
- [ ] **UNIQUE INDEX `settlement_sessions_lecture_session_unique` 적용 확인** (HIGH-2)
- [ ] **DB CHECK `hours > 0 AND hours <= 24` 적용 확인** (MEDIUM-4)
- [ ] **`original_session_id ON DELETE RESTRICT` 적용 확인** (LOW-7)
- [ ] **(필수) `project_status` enum에 `instructor_withdrawn` 값 추가됨** (REQ-EXCEPT-007)
- [ ] **Rollback dry-run on staging PASS** — spec.md §4.2 표 기반, plan.md M1 acceptance gate (HIGH-3)

### Code Quality
- [ ] GENERATED 컬럼(`profit_krw`, `withholding_tax_amount_krw`)이 settlements INSERT 페이로드에서 제외 (grep로 코드베이스 전체 확인)
- [ ] `floor` 사용 일관 (round 사용 0건 — 단, share_pct 정수 변환을 위한 `Math.round(pct * 100)`만 예외적 사용 허용)
- [ ] **정수 산술 채택 검증**: `calculateInstructorFeePerHour` 구현이 `(rate * Math.round(pct * 100)) / 10000` 패턴을 사용하는지 grep 확인 (HIGH-1)
- [ ] 한국어 에러 메시지 단일 출처 (`src/lib/sessions/errors.ts`, `src/lib/payouts/errors.ts`)
- [ ] MX 태그: calculator의 4 함수 + status-machine의 validateTransition + generate의 핵심 함수에 `@MX:ANCHOR` 또는 `@MX:NOTE` 추가
- [ ] **Service-role client 0건 grep 검증** — Scenario 16 자동화 (REQ-RLS-004)

### UX
- [ ] 세션 매트릭스: [날짜 추가] / 행 삭제 / 0.5 단위 입력 동작
- [ ] [강사 중도 하차] 모달의 confirmation 메시지 한국어
- [ ] [다른날로 옮김] 모달의 새 날짜 입력 검증
- [ ] axe DevTools `/settlements/generate` critical 0건
- [ ] 키보드 only 동작 (Tab + Enter)
- [ ] Asia/Seoul 타임존 일관 표시

### Documentation
- [ ] HISTORY 항목 갱신 (구현 완료 시점)
- [ ] (sync phase) `.moai/project/structure.md`에 `src/lib/sessions/` 등록
- [ ] (sync phase) `CHANGELOG.md`에 본 SPEC 항목 추가
- [ ] SPEC-PAYOUT-001과의 관계 명시 (확장, 비파괴)

---

## Manual QA Checklist (선택)

운영자 시나리오 5건을 수동 QA로 추가 검증:

- [ ] 신규 프로젝트 등록 → 시급/분배율 입력 → 세션 5건 추가 → 저장 → DB 확인
- [ ] 수정 폼에서 세션 1건 결강 처리 → 정산 미리보기에서 제외됨 확인
- [ ] 수정 폼에서 세션 1건 일정 변경 → 원본/새 세션 양쪽 표시 확인
- [ ] 강사 중도 하차 → 미래 세션 일괄 취소 + 프로젝트 배너 확인
- [ ] generate → 매입매출 위젯에 신규 settlement 반영 확인 (SPEC-PAYOUT-001 보존)

---

_End of acceptance.md_
