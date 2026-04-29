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

## Scenario 3: 일정 변경 (rescheduled) — 원본 제외, 새 세션이 청구

**Given**
- 프로젝트 X에 lecture_sessions 1건이 있다
  - id=`session-A`, `2026-05-17` (2.0h, planned, original_session_id=NULL)
- 운영자가 해당 세션의 [다른날로 옮김] 버튼을 클릭한다

**When**
- 모달에서 새 날짜 `2026-05-20` 입력 → 확인
- 트랜잭션이 실행된다

**Then**
- session-A의 status는 `rescheduled`로 변경된다 (date는 그대로 `2026-05-17`)
- 새 세션 `session-B`가 INSERT된다
  - `project_id`는 동일
  - `instructor_id`는 동일
  - `hours = 2.0`
  - `date = 2026-05-20`
  - `status = 'planned'`
  - `original_session_id = session-A.id`
- 이후 session-B의 status를 `completed`로 마킹한 후 generate 실행
- generate 미리보기에 session-B만 포함되고 session-A는 제외된다
- settlement_sessions에 session-B만 link됨

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

## Scenario 7: 산식 정합 — instructor_fee_per_hour formula

**Given**
- (단위 테스트 환경) calculator.ts 모듈을 임포트한다

**When**
- 다음 5개 케이스를 호출한다:
  - case A: `calculateInstructorFeePerHour(100000, 70)` → 결과 R_A
  - case B: `calculateInstructorFeePerHour(80000, 66.67)` → 결과 R_B
  - case C: `calculateInstructorFeePerHour(0, 70)` → 결과 R_C
  - case D: `calculateInstructorFeePerHour(100000, 0)` → 결과 R_D
  - case E: `calculateInstructorFeePerHour(100000, 100)` → 결과 R_E
  - case F (totalHours): `calculateTotalBilledHours([{status:'completed', hours:2.0}, {status:'completed', hours:1.5}, {status:'planned', hours:1.0}, {status:'canceled', hours:1.0}, {status:'rescheduled', hours:2.0}])` → 결과 R_F
  - case G (business): `calculateBusinessAmount(100000, 8.0)` → 결과 R_G
  - case H (instructorFee): `calculateInstructorFee(70000, 8.0)` → 결과 R_H

**Then**
- R_A === 70000 (정확히)
- R_B === 53336 (= floor(80000 × 66.67 / 100) = floor(53336) = 53336; share_pct=66.67은 numeric(5,2) 정밀도 한계로 정확한 비율, floor 적용)
- R_C === 0
- R_D === 0
- R_E === 100000
- R_F === 3.5 (completed 2.0 + 1.5만 합산, 그 외 제외)
- R_G === 800000
- R_H === 560000
- 모든 결과는 정수 (Number.isInteger 통과)

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
- [ ] 단위 테스트 PASS — calculator (≥ 5 케이스), sessions/status-machine (16 조합), sessions/validation, generate
- [ ] 단위 테스트 라인 커버리지 ≥ 90% (`src/lib/payouts/calculator.ts` + `src/lib/sessions/`)
- [ ] 통합 테스트 PASS — Scenario 1~9 모두 자동화
- [ ] SPEC-PAYOUT-001의 기존 단위 테스트 46건 모두 PASS 유지 (회귀 검증)

### DB / Migration
- [ ] `npx supabase db reset` 무오류
- [ ] `pnpm db:verify` 통과
- [ ] RLS 정책 3종 (lecture_sessions / settlement_sessions / projects 신규 컬럼) 검증

### Code Quality
- [ ] GENERATED 컬럼(`profit_krw`, `withholding_tax_amount_krw`)이 settlements INSERT 페이로드에서 제외 (grep로 코드베이스 전체 확인)
- [ ] `floor` 사용 일관 (round 사용 0건)
- [ ] 한국어 에러 메시지 단일 출처 (`src/lib/sessions/errors.ts`, `src/lib/payouts/errors.ts`)
- [ ] MX 태그: calculator의 4 함수 + status-machine의 validateTransition + generate의 핵심 함수에 `@MX:ANCHOR` 또는 `@MX:NOTE` 추가

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
