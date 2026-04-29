---
id: SPEC-PAYOUT-002
version: 0.1.3
status: completed
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: 14
---

# SPEC-PAYOUT-002: 시간당 사업비 기반 자동 정산 산정 (Hourly-Rate-Based Settlement Automation — Sessions, Generation, Exceptions)

## HISTORY

- **2026-04-29 (v0.1.3) — Cross-SPEC contract amendment (Option A 확정)**: SPEC-RECEIPT-001 §HIGH-8(v0.2.0) 및 SPEC-RECEIPT-001 v0.2.1 amendment에 따라 본 SPEC의 GENERATE Server Action(`src/lib/payouts/generate.ts`)이 **`flow='client_direct'` 정산 행 생성 시 `settlements.instructor_remittance_amount_krw` 컬럼을 함께 populate한다**는 cross-SPEC contract을 본 HISTORY에서 명시. derive 식: `instructor_remittance_amount_krw = business_amount_krw - instructor_fee_krw = profit_krw` (모두 GENERATED 또는 정수 산식 결과). 본 amendment는 doc-only(코드 변경 없음); 실제 generate.ts 확장은 SPEC-RECEIPT-001 M1 마이그레이션이 컬럼을 추가한 뒤 RECEIPT-001 M5 (운영자 수취 확인) 또는 RECEIPT-001 amendment branch에서 통합 적용한다. SPEC-RECEIPT-001은 본 컬럼을 read-only로 소비. status `draft → completed`로 갱신.
- **2026-04-29 (v0.1.2) — 구현 완료**: M1~M8 + fix-up. 7 atomic commits (6572347..69f0439). 99 신규 unit tests + 11 통합 시나리오 모두 PASS. db:verify 24/24 PASS. 회귀 게이트(typecheck / lint / test:unit / build) 전원 이상 없음. /me/settlements 강사 페이지 확장은 SPEC §4.7에 따라 SPEC-ME-002로 위임.
- **2026-04-29 (v0.1.1) — plan-auditor amendments**: 8건 결함 수정. (a) HIGH-1 calculator IEEE-754 부동소수점 안전성: `calculateInstructorFeePerHour`을 정수 산술 `floor((rate × round(share_pct × 100)) / 10000)`로 변경 (REQ-PAYOUT002-CALC-001 / -005 갱신). 대상 인풋 (80000, 66.67)에서 결과 53336은 보존(기존 식과 신규 식 모두 동일 산출). 단위 테스트에 정수 산술이 실제 drift를 막는 케이스 (1000, 32.3) 추가. cascade §5.7 row 2 재계산 결과 변경 없음 (`floor(53336 × 4.5) = 240012`). (b) HIGH-2 동시성 이중청구 방지: `settlement_sessions(lecture_session_id)` UNIQUE INDEX(전체 unique, partial 아님)로 DB 레이어 강제. REQ-PAYOUT002-LINK-006 신설. concurrent generate race 회귀 시나리오 (Scenario 10) 추가. (c) HIGH-3 마이그레이션 롤백 절차: §4.2 신설(테이블별 DOWN SQL 명시) + §8 위험 행 1건 추가(`instructor_withdrawn` enum 추가는 비가역). plan.md M1 acceptance에 "staging dry-run 롤백 검증" 추가. (d) MEDIUM-4 hours ≤ 24 강제: REQ-PAYOUT002-SESSIONS-001 CHECK 절에 `AND hours <= 24` 추가, REQ-PAYOUT002-SESSIONS-008 zod max(24) 신설, hours=25 거부 acceptance 추가. (e) MEDIUM-5 acceptance traceability: REQ-SESSIONS-003 / -005 / EXCEPT-005 / PROJECT-FIELDS-005 / LINK-005 / RLS-002 / RLS-004 / GENERATE-008에 대한 Given-When-Then 시나리오 추가 (Scenario 11~17). (f) MEDIUM-6 `instructor_withdrawn` 7-step user mapping: REQ-PAYOUT002-EXCEPT-007 신설 — `instructor_withdrawn → '강사매칭' user step`로 매핑(SPEC-PROJECT-001 status-flow.ts `userStepFromEnum` exhaustiveness 충족). (g) LOW-7 `original_session_id` ON DELETE 정책: SET NULL → RESTRICT(감사 추적 보존). (h) LOW-8 reschedule notes 인계 정책: REQ-PAYOUT002-EXCEPT-002에 명시 — 새 세션은 원본 `notes`를 상속하며 운영자는 모달에서 수정 가능. spec-compact.md / acceptance.md / plan.md 일괄 동기화.
- **2026-04-29 (v0.1.0)**: 초기 작성. SPEC-PAYOUT-001(완료, 운영자 정산 관리 UI/상태머신/세율/위젯)을 **확장**하여 알고링크의 실제 비즈니스 워크플로우(고객사 제안 → 수주 → 강사 섭외 → 합의 → 강의 진행 → 1개월 단위 정산, 시간당 사업비 기준 알고링크/강사 분배)를 시스템화한다. 본 SPEC은 (a) `lecture_sessions` 신규 엔티티 — 강의 1회를 1행으로 기록(`project_id`, `instructor_id`(nullable), `date`, `hours`(numeric(4,1), 0.5 단위, > 0), `status` enum(`planned` | `completed` | `canceled` | `rescheduled`), `original_session_id` self-FK(reschedule 감사 추적), `notes`, soft delete) + (project_id, date) / (instructor_id, date) 인덱스; (b) `projects` 컬럼 확장 — `hourly_rate_krw bigint NOT NULL CHECK ≥ 0` (고객사가 알고링크에 지급하는 시간당 사업비 총액) 및 `instructor_share_pct numeric(5,2) NOT NULL CHECK BETWEEN 0 AND 100` (강사 분배율). 기존 `business_amount_krw`/`instructor_fee_krw`는 SPEC-PAYOUT-001과의 backward 호환을 위해 보존하되 정산 생성 시점에는 `hourly_rate × completed_hours`로 **DERIVED** 계산되어 `settlements`에 INSERT됨; (c) 정산 산식 — `instructor_fee_per_hour = floor(hourly_rate_krw × instructor_share_pct / 100)`, `total_billed_hours = SUM(lecture_sessions.hours WHERE status='completed' AND date IN [period])`, `business_amount_krw_for_settlement = hourly_rate_krw × total_billed_hours`, `instructor_fee_krw_for_settlement = instructor_fee_per_hour × total_billed_hours`; (d) `/projects/new` 및 `/projects/[id]/edit`에 **세션 매트릭스 UI** 추가 — "[날짜 추가]" 버튼으로 행 추가, 각 행은 date input + hours input + (수정 시) status badge, 저장 시 bulk INSERT/UPDATE; (e) **운영자 트리거 배치 정산 생성** — `/settlements/generate` 신규 라우트, period 선택(월/분기/임의 기간) + 프로젝트 필터 + "정산 생성" 버튼, Server Action이 기간 내 `completed` 상태 + 어떤 settlement 행에도 link되지 않은 lecture_sessions를 스캔하여 settlements 행을 INSERT(`status='pending'`, settlement_flow는 프로젝트 메타 또는 운영자 선택, withholding_tax_rate은 flow에 종속), 각 세션을 `settlement_sessions` 신규 junction(settlement_id × lecture_session_id PRIMARY KEY)에 link하여 **이중 청구 방지**, 운영자가 검토 후 SPEC-PAYOUT-001의 1-클릭 정산요청 흐름으로 진행; (f) **예외 처리 3종** — (f-1) **결강(day cancellation)**: `/projects/[id]/edit`에서 운영자가 lecture_sessions.status를 `canceled`로 마킹, 정산 산정에서 자동 제외; (f-2) **일정 변경(reschedule)**: 기획된(planned) 세션에 "다른 날로 옮김" 버튼 → 새 date 입력 모달 → 원본 세션 status=`rescheduled`로 마킹, 새 세션 row 생성하면서 `original_session_id`를 원본 id로 설정. 정산 산정은 `completed` 상태만 포함하므로 `rescheduled`는 자동 제외, 새 세션이 `completed`로 마킹되었을 때만 청구; (f-3) **강사 중도 하차(instructor mid-project withdrawal)**: 운영자가 프로젝트 수정 화면에서 "강사 중도 하차" 버튼 클릭 → 미래 일자(today 이후)의 모든 `planned` 세션을 일괄 `canceled`로 전환 + `notes`에 사유 텍스트 저장, 이미 `completed`인 세션은 그대로 청구 대상 유지, 프로젝트 status는 신규 enum value `instructor_withdrawn`로 전환(SPEC-PROJECT-001의 status machine과 협응 — 마이그레이션으로 enum 추가); (g) **RLS** — `lecture_sessions`/`settlement_sessions`는 operator/admin RW, instructor는 본인이 instructor_id인 row만 SELECT 가능, projects 신규 컬럼은 기존 RLS 정책을 그대로 상속. SPEC-PAYOUT-001은 변경 없음(완료 상태 보존) — 본 SPEC의 정산 INSERT 경로는 SPEC-PAYOUT-001의 `settlement_status` 4-state 머신 + `withholding_tax_rate` CHECK 제약(`corporate=0`, `government ∈ {3.30, 8.80}`) + GENERATED 컬럼 read-only 정책을 그대로 준수한다. SPEC-RECEIPT-001(별도)이 처리하는 "고객사 직접 강사 지급(client_direct flow)" 케이스는 본 SPEC 범위 외. 신규 마이그레이션 3건: `lecture_sessions` 테이블 + 인덱스 + RLS, `projects` ALTER ADD COLUMN(hourly_rate_krw + instructor_share_pct), `settlement_sessions` junction. 정산 자동 cron / 외부 스케줄러 / 카카오 알림톡 / 이메일 실 발송 / PDF 명세서 / 강사 측 분쟁 신고 UI / 시급 history 추적은 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 정산 워크플로우를 알고링크 실제 비즈니스 프로세스(시간당 사업비 × 완료 시수 × 강사 분배율)로 자동화한다. 본 SPEC의 산출물은 (a) 강의 1회를 1행으로 기록하는 `lecture_sessions` 신규 엔티티 + (project_id, date) 매트릭스 UI를 통한 운영자 입력 흐름, (b) `projects` 테이블에 `hourly_rate_krw` (시간당 사업비, 고객사 → 알고링크 지급)와 `instructor_share_pct` (강사 분배율, %) 두 컬럼 추가 + 등록/수정 폼 필드 추가, (c) `instructor_fee_per_hour = floor(hourly_rate × share_pct / 100)` 정산 산식을 순수 함수(`src/lib/payouts/calculator.ts`)로 구현 + 단위 테스트, (d) 운영자가 트리거하는 배치 정산 생성 — `/settlements/generate` 라우트에서 기간(월/분기/임의 범위) + 프로젝트 필터 + "정산 생성" 버튼으로 해당 기간의 `completed` 세션 중 settlement에 link되지 않은 행을 스캔, settlements 행을 일괄 INSERT, `settlement_sessions` junction에 link하여 이중 청구 방지, (e) 예외 처리 3종 — 결강(`canceled`), 일정 변경(`rescheduled` + new session with `original_session_id`), 강사 중도 하차(미래 planned 세션 일괄 canceled + 프로젝트 status 전환), (f) RLS 정합 — operator/admin RW, instructor self-read on own sessions, (g) 한국어 UI + Asia/Seoul 타임존이다.

본 SPEC은 SPEC-PAYOUT-001을 **확장**하며 변경하지 않는다. settlements 행이 일단 INSERT되면 SPEC-PAYOUT-001의 4-state 머신(`pending → requested → paid` + `held` 분기) + 1-클릭 정산요청 + 매입매출 위젯 + 세율 검증이 그대로 동작한다.

본 SPEC은 정산 자동 cron, 카카오 알림톡, 이메일 실 발송, 정산 명세서 PDF, 강사 측 분쟁 신고 UI, 시급(hourly_rate_krw) 변경 이력 추적, SPEC-RECEIPT-001이 다루는 고객사 직접 강사 지급(`client_direct` flow)을 빌드하지 않는다.

### 1.2 배경 (Background)

알고링크 PM이 확인한 실제 비즈니스 워크플로우는 다음과 같다 (`.moai/project/product.md` §시나리오 C 정산 마감 + PM 인터뷰 2026-04-29):

1. 알고링크가 고객사에 제안서 제출
2. 수주 성공 → 운영자가 강사 물색(또는 제안 단계 사전 확인)
3. 운영자-강사 합의 → 강의 진행
4. **1개월 단위 정산. 시간당 사업비, 알고링크/강사 수익 분배**
5. 강의별 사업비가 다르고, 지정 기간만큼 산정해서 강사에게 지급
6. 정산 두 케이스: (6-1) **알고링크 직접 지급** — 원천세 3.3%(government) 또는 8.8%(government)를 제하고 강사에게 송금. 본 SPEC 범위. (6-2) **고객사 직접 강사 지급** — SPEC-RECEIPT-001이 별도 처리. 본 SPEC 제외.

**현재 Pain Points** (PM 인터뷰):

- 정산이 엑셀 기반이라 검토 반복
- 강사가 다음 정산 금액/일정 가시성 없음
- 예외 처리(중도 하차, 결강) 미구현

**기존 자산**:

- SPEC-PAYOUT-001: settlements 테이블의 운영자 관리 UI, 4-state 머신, 세율 검증(corporate=0, government ∈ {3.30, 8.80}), 1-클릭 정산요청, 매입매출 위젯, GENERATED 컬럼 read-only(`profit_krw`, `withholding_tax_amount_krw`). **본 SPEC 범위에서 절대 수정하지 않음.**
- SPEC-DB-001: `settlements` / `settlement_status_history` / `settlement_status` enum / `settlement_flow` enum / RLS 정책 / 트리거 / `notifications` 등 모든 정산 기반 스키마.
- SPEC-PROJECT-001: `projects` 테이블의 13단계 status enum + 7단계 user step 매핑 + 상태 전환 검증. 본 SPEC은 신규 enum value `instructor_withdrawn` 추가가 필요(M1 마이그레이션).
- SPEC-ME-001 (M5/M7 완료): 강사 본인 정산 조회 화면(`/me/settlements`) + 월별 그룹 + 분기 UI + payout 정보 등록(pgcrypto). 본 SPEC은 강사 화면을 직접 변경하지 않으나, 강사 측 다음 정산 가시성 향상은 후속 SPEC-ME-002 또는 SPEC-ME-001 v2.x로 layered.

**기존 settlements 테이블의 한계**:

- `business_amount_krw`/`instructor_fee_krw`는 사업비 / 강사비 총액을 직접 저장하는 수동 입력 필드 → 운영자가 매월 엑셀에서 계산 후 수기 입력
- 강의 1회 단위 청구 가능 시수가 추적되지 않음
- 결강·일정 변경 시 수기 차감

**본 SPEC의 해결책**:

- `lecture_sessions`로 강의 1회 단위 추적 (date + hours + status)
- `projects.hourly_rate_krw` + `projects.instructor_share_pct`로 시급/분배율 명시
- 정산 생성 시점에 산식으로 자동 계산하여 settlements에 INSERT
- 결강/일정 변경/중도 하차는 lecture_sessions.status로 표현, 정산 산정에서 자동 제외/포함

#### 정산 산식 (Calculation Formula)

```
# 정수 산술 (IEEE-754 drift 차단). share_pct는 numeric(5,2)이므로 × 100으로 정수화 안전.
instructor_fee_per_hour = floor( (hourly_rate_krw × round(instructor_share_pct × 100)) / 10000 )

total_billed_hours = SUM(lecture_sessions.hours
                         WHERE project_id = $project
                           AND status = 'completed'
                           AND date BETWEEN $period_start AND $period_end
                           AND id NOT IN (SELECT lecture_session_id FROM settlement_sessions))

# 두 amount는 totalHours가 .5로 끝나는 경우 분모 절단을 위해 floor 적용
business_amount_krw_for_settlement   = floor(hourly_rate_krw × total_billed_hours)
instructor_fee_krw_for_settlement    = floor(instructor_fee_per_hour × total_billed_hours)
```

`floor`는 정수 단위(원). settlement 행 INSERT 시 `business_amount_krw` / `instructor_fee_krw` 컬럼에 위 산식 결과를 그대로 저장. SPEC-PAYOUT-001의 GENERATED 컬럼(`profit_krw` = business - fee, `withholding_tax_amount_krw` = floor(fee × rate / 100))이 자동 계산.

**산식 정수 산술 채택 사유**: 부동소수점 식 `floor(rate × pct / 100)`은 일부 (rate, pct) 쌍에서 1원 단위 drift를 일으킨다(예: `(1000, 32.3)` → 부동소수점 322 vs 정수 산술 323). 본 SPEC은 `share_pct`가 `numeric(5,2)`(최대 2 decimals)이라는 DB 제약을 활용해 `Math.round(pct × 100)`로 정수 변환 후 곱셈/나눗셈을 수행한다. 이 접근은 monetary safety의 표준 패턴이며, 추가 라이브러리 의존성 없이 V8 정수 산술로 표현 가능한 모든 입력에 대해 deterministic 결과를 보장한다.

#### lecture_sessions.status 상태 의미

| status | 의미 | 청구 대상? |
|--------|------|-----------|
| `planned` | 향후 진행 예정 | ❌ |
| `completed` | 진행 완료, 정산 가능 | ✅ |
| `canceled` | 결강(영구 취소) | ❌ |
| `rescheduled` | 일정 변경됨, 새 세션이 대체 | ❌ (자기 자신은) — 새 세션이 별도 row로 청구 |

`rescheduled` 상태는 원본 세션의 마커이며 새 세션은 별도 row로 생성된다. 새 세션의 `original_session_id` 컬럼이 원본 id를 가리키므로 감사 추적 가능.

#### settlement_sessions junction (이중 청구 방지)

```
settlement_sessions (
  settlement_id  uuid REFERENCES settlements(id) ON DELETE CASCADE,
  lecture_session_id uuid REFERENCES lecture_sessions(id) ON DELETE RESTRICT,
  PRIMARY KEY (settlement_id, lecture_session_id)
)
```

각 lecture_session은 settlements와 N:M 관계지만 실무상 1:1(한 번 청구되면 다시 청구 안 됨). 정산 생성 Server Action은 `lecture_session_id NOT IN (SELECT lecture_session_id FROM settlement_sessions)` 조건으로 미청구 세션만 스캔하므로 같은 기간으로 두 번 generate해도 두 번째는 0건 INSERT.

### 1.3 범위 (Scope)

**In Scope:**

- 마이그레이션 (`supabase/migrations/`):
  - `20260429xxxxxx_lecture_sessions.sql` — 신규 테이블 + lecture_session_status enum + 인덱스 + RLS 정책 + soft delete 컬럼 + CHECK `hours > 0 AND hours <= 24`
  - `20260429xxxxxx_projects_hourly_rate.sql` — `projects` ALTER ADD COLUMN `hourly_rate_krw bigint NOT NULL DEFAULT 0`, `instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0` + CHECK 제약 + 데이터 이행(기존 행은 0/0으로 시작, 운영자가 수정 폼에서 입력)
  - `20260429xxxxxx_settlement_sessions_link.sql` — junction 테이블 + **UNIQUE INDEX on `(lecture_session_id)`** (REQ-PAYOUT002-LINK-006 race-condition 방지)
  - **(필수)** `20260429xxxxxx_project_status_instructor_withdrawn.sql` — `project_status` enum에 `instructor_withdrawn` 값 추가 (REQ-PAYOUT002-EXCEPT-007 협응 — `userStepFromEnum` exhaustiveness 충족 위해 v0.1.1부터 필수. 비가역 마이그레이션 — §4.2 롤백 절차 참조)

- 도메인 로직 (`src/lib/sessions/` 신규 + `src/lib/payouts/` 확장):
  - `src/lib/sessions/types.ts` — `LectureSession`, `LectureSessionStatus`, `SessionInput` 타입
  - `src/lib/sessions/queries.ts` — `listSessionsByProject`, `bulkUpsertSessions`, `cancelSession`, `rescheduleSession`, `bulkCancelFutureSessions` (강사 중도 하차)
  - `src/lib/sessions/status-machine.ts` — lecture_sessions의 status 전환 검증 (`planned → completed/canceled/rescheduled`, `completed → ` 동결, `canceled → ` 동결, `rescheduled → ` 동결)
  - `src/lib/sessions/validation.ts` — zod 스키마 (date + hours 0.5 단위 + status)
  - `src/lib/payouts/calculator.ts` — 신규 순수 함수 모듈
    - `calculateInstructorFeePerHour(hourlyRateKrw, sharePct): number` (floor)
    - `calculateTotalBilledHours(sessions): number` (status='completed'만)
    - `calculateBusinessAmount(hourlyRateKrw, totalHours): number`
    - `calculateInstructorFee(feePerHour, totalHours): number`
    - 모든 함수는 순수 함수, 단위 테스트 100% 커버
  - `src/lib/payouts/generate.ts` — `generateSettlementsForPeriod({ periodStart, periodEnd, projectIds?, settlementFlow?, withholdingTaxRate? })` Server Action 핵심 로직
    - 기간 + 프로젝트 필터로 미청구 completed 세션 스캔
    - 프로젝트별 그룹 → settlement 행 INSERT (status='pending', flow는 프로젝트 메타 또는 운영자 선택)
    - settlement_sessions junction에 INSERT (트랜잭션 atomic)
    - `withholding_tax_rate`은 flow 기반 (corporate=0, government는 운영자가 3.30 또는 8.80 선택)
    - GENERATED 컬럼은 INSERT 페이로드에서 제외 (SPEC-PAYOUT-001 정책 준수)

- 라우트 (`src/app/(app)/(operator)/`):
  - `projects/new/page.tsx` + `actions.ts` — 기존 폼에 `hourly_rate_krw` + `instructor_share_pct` + 세션 매트릭스 추가
  - `projects/[id]/edit/page.tsx` + `actions.ts` — 기존 수정 폼에 동일 필드 + 세션 매트릭스 + 결강/일정 변경/강사 중도 하차 컨트롤
  - `settlements/generate/page.tsx` + `actions.ts` — 신규 정산 일괄 생성 화면 (period selector + project filter + "정산 생성" 버튼 + 미리보기)

- UI 컴포넌트 (`src/components/projects/` 확장):
  - `SessionMatrixEditor.tsx` — 날짜 행 매트릭스 + "[날짜 추가]" 버튼 + 행별 date input + hours input + status badge (수정 모드)
  - `RescheduleDialog.tsx` — "다른 날로 옮김" 모달
  - `InstructorWithdrawalDialog.tsx` — "강사 중도 하차" 확인 모달 + 사유 입력
  - `HourlyRateField.tsx` + `InstructorSharePctField.tsx` — 폼 필드 컴포넌트
- UI 컴포넌트 (`src/components/payouts/` 확장):
  - `GenerateSettlementsForm.tsx` — period selector + project filter + 미리보기 테이블 + "정산 생성" 버튼

- RLS 정책:
  - `lecture_sessions`: operator/admin SELECT/INSERT/UPDATE/DELETE 허용, instructor는 `instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())` 본인 row만 SELECT
  - `settlement_sessions`: operator/admin RW, instructor SELECT only via join with their own settlements

- 단위 테스트 (`src/lib/payouts/__tests__/` + `src/lib/sessions/__tests__/`):
  - `calculator.test.ts` — instructor_fee_per_hour 산식, total_billed_hours, business_amount, instructor_fee 모든 조합
  - `sessions/status-machine.test.ts` — planned → completed/canceled/rescheduled 허용 + 그 외 차단
  - `sessions/queries.test.ts` — bulkUpsert, cancelFuture (강사 중도 하차) 시나리오
  - `generate.test.ts` — 미청구 세션 스캔 + 이중 청구 방지 + flow 별 settlement INSERT

- 통합 테스트 (`src/app/(app)/(operator)/settlements/generate/__tests__/`):
  - 시나리오 1: 새 프로젝트 등록 → 세션 매트릭스로 5회 등록 → 모두 completed → 정산 생성 → 1건 settlement INSERT, 5세션 link
  - 시나리오 2: 같은 기간으로 정산 두 번 생성 → 두 번째는 0건 (이중 청구 방지)
  - 시나리오 3: 결강 1회 후 정산 생성 → canceled 세션 제외하고 청구
  - 시나리오 4: 일정 변경(rescheduled + new) 후 정산 생성 → 원본 제외, 새 세션 청구
  - 시나리오 5: 강사 중도 하차 → 미래 planned 일괄 canceled, 과거 completed는 청구 가능

- 한국어 UI, Asia/Seoul 표시 (`src/lib/format/datetime.ts` 재사용)

**Out of Scope (Exclusions — What NOT to Build):** (§3 참조)

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 단위 테스트: `src/lib/payouts/__tests__/calculator.test.ts` + `src/lib/sessions/__tests__/` 라인 커버리지 ≥ 90%
- ✅ 산식 정합: `instructor_fee_per_hour = floor((hourly_rate × round(share_pct × 100)) / 10000)` (정수 산술, IEEE-754 drift 방지), `business_amount = floor(hourly_rate × total_hours)`, `instructor_fee = floor(fee_per_hour × total_hours)` 모두 정수 단위로 일치
- ✅ IEEE-754 drift 회귀 케이스: `(rate=1000, share_pct=32.3) → fee_per_hour=323` 단위 테스트 PASS
- ✅ 정산 생성 시 `settlements.business_amount_krw` / `instructor_fee_krw` / `withholding_tax_rate`가 산식 결과로 INSERT, GENERATED 컬럼은 페이로드에서 제외
- ✅ 이중 청구 방지: 같은 기간으로 두 번 generate → 두 번째는 0건 INSERT (settlement_sessions junction 검증)
- ✅ 결강(canceled) 세션은 정산 산정에서 자동 제외
- ✅ 일정 변경(rescheduled): 원본 status=`rescheduled`, 새 세션 row의 `original_session_id`가 원본 id, 새 세션이 `completed`일 때만 청구
- ✅ 강사 중도 하차: 미래 일자(today 이후) planned 세션이 일괄 `canceled`로 전환, 과거 `completed`는 그대로 청구 가능
- ✅ 세션 매트릭스 UI: `[날짜 추가]` 버튼으로 행 추가, 저장 시 bulk INSERT/UPDATE, 0.5 단위 hours 검증
- ✅ RLS 정합: instructor 토큰으로 다른 강사의 lecture_sessions 행 SELECT 시 0행 반환
- ✅ SPEC-PAYOUT-001 보존: 기존 settlement 4-state 머신, 세율 검증, 1-클릭 정산요청, 매입매출 위젯이 그대로 동작
- ✅ Asia/Seoul 표시: 모든 lecture_sessions.date / settlement period가 한국 시간대로 일관 표시

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `SESSIONS`, `PROJECT-FIELDS`, `CALC`, `GENERATE`, `LINK`, `EXCEPT`, `RLS`.

### 2.1 REQ-PAYOUT002-SESSIONS — lecture_sessions 엔티티 + CRUD + 상태 전환

**REQ-PAYOUT002-SESSIONS-001 (Ubiquitous)**
The system **shall** define a new table `lecture_sessions` with columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT`, `instructor_id uuid REFERENCES instructors(id) ON DELETE RESTRICT NULL` (배정 전에는 nullable), `date date NOT NULL`, `hours numeric(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24)` (하루 24시간 상한, 비현실적 입력 차단), `status lecture_session_status NOT NULL DEFAULT 'planned'`, `original_session_id uuid REFERENCES lecture_sessions(id) ON DELETE RESTRICT NULL` (감사 추적 보존을 위해 RESTRICT — reschedule audit trail이 silent loss되지 않도록 hard-delete를 거부), `notes text NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `deleted_at timestamptz NULL` (soft delete).

**REQ-PAYOUT002-SESSIONS-002 (Ubiquitous)**
The system **shall** define a new enum `lecture_session_status` with values `'planned'`, `'completed'`, `'canceled'`, `'rescheduled'`. Indexes **shall** be created on `(project_id, date)` and `(instructor_id, date)` for query performance.

**REQ-PAYOUT002-SESSIONS-003 (Ubiquitous)**
The system **shall** validate `hours` to be a multiple of 0.5 (e.g., 0.5, 1.0, 1.5, 2.0) via zod refinement in `src/lib/sessions/validation.ts`; non-multiples (e.g., 1.3) **shall** be rejected with the Korean error `"강의 시수는 0.5시간 단위로 입력해주세요."`.

**REQ-PAYOUT002-SESSIONS-004 (Event-Driven)**
**WHEN** an operator submits the project edit form with new session rows, the system **shall** perform a bulk INSERT/UPDATE via `bulkUpsertSessions` in a single transaction; existing rows are matched by `id`, new rows are INSERTed.

**REQ-PAYOUT002-SESSIONS-005 (Unwanted Behavior)**
**IF** the operator attempts to change the status of a session from `completed`, `canceled`, or `rescheduled` to any other value (except admin override outside scope), **THEN** the system **shall** reject with the Korean error `"종료된 강의 세션은 상태를 변경할 수 없습니다."` Allowed transitions: `planned → completed`, `planned → canceled`, `planned → rescheduled`.

**REQ-PAYOUT002-SESSIONS-006 (Ubiquitous)**
The system **shall** expose only sessions with `deleted_at IS NULL` in operator UIs by default; soft-deleted sessions are excluded from settlement generation queries.

**REQ-PAYOUT002-SESSIONS-007 (Ubiquitous)**
The system **shall** define `notes text` as a free-text column on `lecture_sessions`; cancellation reasons (REQ-EXCEPT-001), reschedule reasons (REQ-EXCEPT-002), and instructor withdrawal reasons (REQ-EXCEPT-003) **shall** all be persisted in this column with timestamp/operator markers prepended (e.g., `"[2026-04-29 운영자] 강사 개인 사정"`). The column is operator-only writable in operator UI.

**REQ-PAYOUT002-SESSIONS-008 (Unwanted Behavior)**
**IF** the operator submits `hours > 24` or `hours <= 0` or `hours` not a multiple of 0.5, **THEN** the zod schema in `src/lib/sessions/validation.ts` **shall** reject the submission with one of the Korean errors `"강의 시수는 24시간을 초과할 수 없습니다."` (max), `"강의 시수는 0보다 커야 합니다."` (min), or `"강의 시수는 0.5시간 단위로 입력해주세요."` (granularity). The application-layer validation **must** match the DB CHECK `hours > 0 AND hours <= 24` (REQ-PAYOUT002-SESSIONS-001) so that DB rejects regress-only as a defense-in-depth gate.

### 2.2 REQ-PAYOUT002-PROJECT-FIELDS — projects.hourly_rate_krw + instructor_share_pct

**REQ-PAYOUT002-PROJECT-FIELDS-001 (Ubiquitous)**
The system **shall** add to the `projects` table two columns: `hourly_rate_krw bigint NOT NULL DEFAULT 0 CHECK (hourly_rate_krw >= 0)` (시간당 사업비 총액 KRW) and `instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (instructor_share_pct BETWEEN 0 AND 100)` (강사 분배율 %).

**REQ-PAYOUT002-PROJECT-FIELDS-002 (Ubiquitous)**
The system **shall** preserve the existing `business_amount_krw` and `instructor_fee_krw` columns on `projects` for backward compatibility with SPEC-PAYOUT-001 and SPEC-PROJECT-001; these columns are no longer the primary source of settlement amounts but **shall not** be dropped or renamed in this SPEC.

**REQ-PAYOUT002-PROJECT-FIELDS-003 (Ubiquitous)**
The project create form (`/projects/new`) and edit form (`/projects/[id]/edit`) **shall** include input fields for `hourly_rate_krw` (KRW formatted, ≥ 0) and `instructor_share_pct` (numeric, 0-100 with 0.01 step), with Korean labels `"시간당 사업비 (원)"` and `"강사 분배율 (%)"`.

**REQ-PAYOUT002-PROJECT-FIELDS-004 (Event-Driven)**
**WHEN** the operator saves the project form with a non-zero `hourly_rate_krw` and `instructor_share_pct`, the system **shall** persist these values; the values are then read by the settlement generation flow at the time of generation.

**REQ-PAYOUT002-PROJECT-FIELDS-005 (Unwanted Behavior)**
**IF** the operator submits `instructor_share_pct > 100` or `< 0`, **THEN** the zod schema **shall** reject before the form is submitted with the Korean error `"강사 분배율은 0~100 사이여야 합니다."`

### 2.3 REQ-PAYOUT002-CALC — 정산 산식 순수 함수

**REQ-PAYOUT002-CALC-001 (Ubiquitous)**
The system **shall** define a TypeScript module `src/lib/payouts/calculator.ts` exporting four pure functions:

- `calculateInstructorFeePerHour(hourlyRateKrw: number, sharePct: number): number` returning `Math.floor((hourlyRateKrw * Math.round(sharePct * 100)) / 10000)` — **integer arithmetic** to prevent IEEE-754 floating-point drift on monetary values (e.g., `Math.floor(1000 × 32.3 / 100) = 322` vs the integer-arithmetic form `floor((1000 × 3230) / 10000) = 323`). `Math.round(sharePct * 100)` first promotes `share_pct` from `numeric(5,2)` to integer "cents-of-percent" (e.g., `66.67 → 6667`), avoiding any fractional intermediate. `share_pct` is bounded to `[0, 100]` with at most 2 decimals by the DB CHECK and zod schema (REQ-PROJECT-FIELDS-001 / -005), so `Math.round(sharePct × 100)` is exact for all valid inputs.
- `calculateTotalBilledHours(sessions: LectureSession[]): number` summing `hours` of sessions with `status === 'completed' AND deleted_at === null`.
- `calculateBusinessAmount(hourlyRateKrw: number, totalHours: number): number` returning `Math.floor(hourlyRateKrw * totalHours)` — floor to prevent fractional-원 overcharge when `totalHours` ends with `.5`.
- `calculateInstructorFee(feePerHour: number, totalHours: number): number` returning `Math.floor(feePerHour * totalHours)` — floor to prevent fractional-원 overpayment when `totalHours` ends with `.5` and `feePerHour` is odd.

**REQ-PAYOUT002-CALC-002 (Ubiquitous)**
All calculator functions **shall** return integer KRW values; intermediate floating-point computations **shall** be floored (not rounded) to avoid overpayment to instructor or overcharge to client.

**REQ-PAYOUT002-CALC-003 (Ubiquitous)**
The `calculateTotalBilledHours` function **shall** include only sessions where `status === 'completed' AND deleted_at IS NULL`; sessions with `status` of `planned`, `canceled`, or `rescheduled` **shall** be excluded.

**REQ-PAYOUT002-CALC-004 (Ubiquitous)**
The settlement generation flow (REQ-PAYOUT002-GENERATE) **shall** use the calculator output verbatim when INSERTing settlement rows; the resulting `settlements.business_amount_krw` and `settlements.instructor_fee_krw` are then used by the GENERATED columns `profit_krw` and `withholding_tax_amount_krw` defined in SPEC-PAYOUT-001 / SPEC-DB-001.

**REQ-PAYOUT002-CALC-005 (Ubiquitous)**
The unit tests for `calculator.ts` **shall** cover at minimum:
(a) `hourly_rate=100000, share_pct=70 → fee_per_hour=70000`,
(b) `hourly_rate=80000, share_pct=66.67 → fee_per_hour=53336` (정수 산술 결과 — `floor((80000 × 6667) / 10000) = floor(53336) = 53336`),
(c) sessions=`[completed:2.0, completed:1.5, planned:1.0, canceled:1.0, rescheduled:2.0] → totalHours=3.5`,
(d) edge case `share_pct=0 → fee_per_hour=0`,
(e) edge case `hourly_rate=0 → fee_per_hour=0`,
(f) **IEEE-754 drift regression case**: `hourly_rate=1000, share_pct=32.3 → fee_per_hour=323` (정수 산술이 부동소수점 산술보다 1원 높게 산출 — `floor(1000 × 32.3 / 100) = 322` 부동소수점 식, `floor((1000 × 3230) / 10000) = 323` 정수 산술 식. 본 SPEC은 정수 산술을 채택하므로 결과는 323),
(g) edge case `hourly_rate=80000, share_pct=66.67, totalHours=4.5 → instructor_fee = floor(53336 × 4.5) = 240012` (cascade 정합성),
(h) edge case `share_pct=33.33` — `Math.round(33.33 * 100) = 3333` integer 변환 정확성 검증.

본 SPEC의 산술 정책은 **정수 산술(integer arithmetic) 우선 + floor**: 입력 `share_pct` 가 `numeric(5,2)`(최대 2 decimals)이라는 DB 제약을 활용해 곱하기 100으로 정수화한 후 곱셈/나눗셈을 수행한다. 이는 일부 (rate, share_pct) 조합에서 단순 부동소수점 산식 `Math.floor(rate * pct / 100)`이 1원 단위 drift(예: `(1000, 32.3)`)를 일으키는 것을 차단한다. (80000, 66.67) 케이스는 두 산식 모두 53336을 산출하므로 회귀 영향 없음.

### 2.4 REQ-PAYOUT002-GENERATE — 운영자 트리거 배치 정산 생성

**REQ-PAYOUT002-GENERATE-001 (Ubiquitous)**
The system **shall** provide an operator-only route at `/settlements/generate` (under route group `(app)/(operator)`) accessible only to roles `operator` and `admin`, rendering server-side via React Server Components.

**REQ-PAYOUT002-GENERATE-002 (Ubiquitous)**
The page **shall** include UI controls for: (a) period selection — month picker (`YYYY-MM`), quarter picker (`YYYY-Q1..Q4`), or arbitrary date range (start/end); (b) optional project filter — multi-select of projects; (c) a "정산 생성" submit button; (d) a preview table showing per-project: project title, instructor name, total billed hours, business amount, instructor fee, settlement_flow.

**REQ-PAYOUT002-GENERATE-003 (Event-Driven)**
**WHEN** the operator clicks "정산 생성" with a selected period and optional project filter, the system **shall** invoke the `generateSettlementsForPeriod` Server Action which (a) queries lecture_sessions with `status='completed' AND deleted_at IS NULL AND date BETWEEN $start AND $end AND id NOT IN (SELECT lecture_session_id FROM settlement_sessions)`, (b) groups results by `project_id`, (c) for each group, computes business_amount_krw and instructor_fee_krw via the calculator, (d) INSERTs a row into `settlements` with `status='pending'`, `settlement_flow` from project metadata or operator selection, `withholding_tax_rate` consistent with the flow, (e) INSERTs rows into `settlement_sessions` linking each session to the new settlement, (f) all in a single DB transaction.

**REQ-PAYOUT002-GENERATE-004 (Ubiquitous)**
The Server Action **shall** exclude the GENERATED columns `profit_krw` and `withholding_tax_amount_krw` from the INSERT payload, consistent with SPEC-PAYOUT-001 REQ-PAYOUT-DETAIL and tax-calculator policies.

**REQ-PAYOUT002-GENERATE-005 (State-Driven)**
**WHILE** the operator is reviewing the preview table before clicking "정산 생성", the system **shall** display the count of unbilled sessions and the projected settlement totals; clicking "정산 생성" without a valid preview is allowed but the system **shall** display a confirmation dialog with the Korean message `"기간 ${period}의 미청구 강의 ${count}건에 대해 ${projectCount}개 정산 행을 생성합니다. 계속하시겠습니까?"`.

**REQ-PAYOUT002-GENERATE-006 (Unwanted Behavior)**
**IF** no unbilled completed sessions exist for the selected period and filters, **THEN** the system **shall** display the Korean message `"선택한 기간에 청구할 강의가 없습니다."` and **shall not** INSERT any settlement rows.

**REQ-PAYOUT002-GENERATE-007 (Ubiquitous)**
After a successful generation, the system **shall** redirect to `/settlements?period=$period` and display the newly created settlement rows in the list (consuming SPEC-PAYOUT-001's list page); each newly created settlement is in `status='pending'` and is then operated by the existing SPEC-PAYOUT-001 1-click settlement request flow.

**REQ-PAYOUT002-GENERATE-008 (Optional Feature)**
**WHERE** the project's `settlement_flow` is configured at project level, the system **shall** default the new settlement's `settlement_flow` to that value; **WHERE** not configured, the operator **shall** select the flow per project group in the preview table (corporate / government).

### 2.5 REQ-PAYOUT002-LINK — settlement_sessions junction (이중 청구 방지)

**REQ-PAYOUT002-LINK-001 (Ubiquitous)**
The system **shall** define a new junction table `settlement_sessions` with columns: `settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE`, `lecture_session_id uuid NOT NULL REFERENCES lecture_sessions(id) ON DELETE RESTRICT`, `created_at timestamptz NOT NULL DEFAULT now()`. Primary key: `(settlement_id, lecture_session_id)`.

**REQ-PAYOUT002-LINK-002 (Ubiquitous)**
A **UNIQUE** index on `lecture_session_id` (a single column) **shall** exist on `settlement_sessions`; this serves both as the "is this session already billed?" performance index AND as a DB-layer race-condition guard against double-billing (see REQ-PAYOUT002-LINK-006).

**REQ-PAYOUT002-LINK-003 (Ubiquitous)**
The settlement generation flow **shall** filter out lecture_sessions whose `id` already exists in `settlement_sessions.lecture_session_id`; this guarantees that a single completed session can be billed at most once across all settlement generations.

**REQ-PAYOUT002-LINK-004 (Event-Driven)**
**WHEN** a settlement is hard-deleted (rare; CASCADE), the corresponding settlement_sessions rows **shall** be deleted (CASCADE), restoring the linked lecture_sessions to "unbilled" state. **WHEN** a settlement is soft-deleted (`deleted_at` set), the settlement_sessions rows **shall** remain but the GENERATE flow **shall** also exclude lecture_sessions linked to soft-deleted settlements (i.e., `lecture_session_id NOT IN (SELECT s.lecture_session_id FROM settlement_sessions s JOIN settlements x ON s.settlement_id = x.id WHERE x.deleted_at IS NULL)`).

**REQ-PAYOUT002-LINK-005 (Unwanted Behavior)**
**IF** the lecture_session referenced in `settlement_sessions` is hard-deleted, **THEN** the FK `ON DELETE RESTRICT` **shall** prevent deletion; the system **shall** require the operator to first remove the link by deleting or refactoring the settlement.

**REQ-PAYOUT002-LINK-006 (Unwanted Behavior — concurrent generate race prevention) [HARD]**
**IF** two operators concurrently call the `generateSettlementsForPeriod` Server Action against overlapping periods such that the same `lecture_session_id` would be linked into two different settlements, **THEN** the DB layer **shall** reject the second INSERT with a unique-violation error, and the application layer **shall** translate it to the Korean error `"이 강의는 이미 다른 정산에 청구되었습니다. 새로 고침 후 다시 시도해주세요."`.

The mechanism: a **UNIQUE** index on `settlement_sessions(lecture_session_id)` (single column, full-table — NOT a partial index, because PostgreSQL partial-index `WHERE` clauses cannot reference columns of other tables). With this constraint, even if two transactions both pass the application-layer `lecture_session_id NOT IN (...)` predicate (which is racy under READ COMMITTED isolation), only one INSERT into `settlement_sessions` can succeed; the second receives a `unique_violation` (PostgreSQL SQLSTATE `23505`) and the wrapping transaction aborts, rolling back the duplicate `settlements` row as well.

Rationale for full UNIQUE (not partial): a partial unique index referencing `settlements.status != 'canceled'` requires a multi-table predicate that PostgreSQL does not support directly. A full UNIQUE on `(lecture_session_id)` is simpler, self-documenting at the schema level, and aligns with the existing semantics: `ON DELETE CASCADE` from `settlements` already removes junction rows when a settlement is hard-deleted, freeing the session for re-billing. Settlement deletion / unlink UI is explicitly out of scope (§3), so the operational consequence — operators must hard-delete an erroneous settlement before re-billing its sessions — is acceptable and consistent with the existing exclusion list.

This constraint replaces and subsumes the application-layer `NOT IN` predicate as the **authoritative** double-billing guard. The `NOT IN` predicate remains in the query for early UI rejection (preview shows zero unbilled sessions) but is no longer the sole defense.

### 2.6 REQ-PAYOUT002-EXCEPT — 결강 / 일정 변경 / 강사 중도 하차

**REQ-PAYOUT002-EXCEPT-001 (Event-Driven, 결강)**
**WHEN** the operator marks a `planned` session's status as `canceled` via the project edit form's session matrix and saves, the system **shall** UPDATE the `lecture_sessions.status` to `'canceled'` and persist any `notes` provided; the canceled session **shall** be automatically excluded from subsequent settlement generations.

**REQ-PAYOUT002-EXCEPT-002 (Event-Driven, 일정 변경)**
**WHEN** the operator clicks "다른 날로 옮김" on a `planned` session and provides a new date in the dialog, the system **shall** in a single transaction (a) UPDATE the original session's `status` to `'rescheduled'` (and optionally append a reschedule reason to the original session's `notes`), (b) INSERT a new lecture_sessions row with the same `project_id`, `instructor_id`, `hours`, `status='planned'`, `original_session_id` set to the original session's id, and the new `date`. The new session **shall** inherit the original session's `notes` value at the moment of rescheduling (carry-forward); the operator MAY amend the inherited notes via the reschedule dialog's optional "비고" textarea before saving. The new session **shall** be billable when later marked `completed`. **The `original_session_id` chain enables audit traceability and is enforced via `ON DELETE RESTRICT` (REQ-PAYOUT002-SESSIONS-001) — once the original session is referenced, it cannot be hard-deleted.**

**REQ-PAYOUT002-EXCEPT-003 (Event-Driven, 강사 중도 하차)**
**WHEN** the operator clicks "강사 중도 하차" on the project edit form and confirms with a reason text in the dialog, the system **shall** in a single transaction (a) UPDATE all lecture_sessions for that project where `status='planned' AND date >= CURRENT_DATE` to `status='canceled'` and append the reason to `notes`, (b) UPDATE the project's `status` to `'instructor_withdrawn'` (new enum value added by the migration in M1), (c) optionally null-out `instructor_id` on the project (decision: keep `instructor_id` for audit, only update status). Sessions already in `completed` status **shall** remain billable.

**REQ-PAYOUT002-EXCEPT-004 (Ubiquitous)**
The system **shall** provide a clear Korean confirmation dialog before bulk-canceling future sessions (`"미래 ${count}건의 강의가 자동 취소됩니다. 계속하시겠습니까?"`); the action **shall not** proceed without explicit confirmation.

**REQ-PAYOUT002-EXCEPT-005 (Unwanted Behavior)**
**IF** the operator attempts to change a `canceled` or `rescheduled` session back to `planned` or `completed`, **THEN** the system **shall** reject with the Korean error `"종료된 강의 세션은 상태를 변경할 수 없습니다."` (consistent with REQ-PAYOUT002-SESSIONS-005). To "restore" a canceled session, the operator **shall** create a new session row.

**REQ-PAYOUT002-EXCEPT-006 (Optional Feature)**
**WHERE** the project status is `'instructor_withdrawn'`, the system **shall** display a banner on the project detail page indicating the withdrawal and provide a link to assign a new instructor (handed off to SPEC-PROJECT-001 reassignment flow, out of this SPEC's scope but the banner UX is in scope).

**REQ-PAYOUT002-EXCEPT-007 (Ubiquitous, 7-step mapping)**
The system **shall** extend `src/lib/projects/status-flow.ts` (SPEC-PROJECT-001) so that the new enum value `instructor_withdrawn` maps to user step `'강사매칭'` in `userStepFromEnum(status)`. Rationale: when an instructor withdraws mid-project, the project workflow regresses to the `'강사매칭'` step pending re-recommendation and assignment to a new instructor (consistent with SPEC-PROJECT-001 §1.2 mapping where `lecture_requested` and `instructor_sourcing` both belong to `'강사매칭'`). The `defaultEnumForUserStep('강사매칭')` MUST remain `lecture_requested` (forward-flow default); `instructor_withdrawn` is a special "regression" entry into the `'강사매칭'` step and is reachable only via `withdrawInstructorAction` (REQ-EXCEPT-003). The TypeScript exhaustiveness check (`switch` with `never` default) in `userStepFromEnum` MUST include the `instructor_withdrawn` case to satisfy SPEC-PROJECT-001's contract; failure to add this branch will cause a compile-time error and is enforced as part of the M1 acceptance gate.

### 2.7 REQ-PAYOUT002-RLS — 역할 가드 + 데이터 격리

**REQ-PAYOUT002-RLS-001 (Ubiquitous)**
The system **shall** apply Row-Level Security to `lecture_sessions` with the following policies: (a) `lecture_sessions_admin_all` — admin role FOR ALL, (b) `lecture_sessions_operator_rw` — operator/admin role FOR SELECT/INSERT/UPDATE, (c) `lecture_sessions_instructor_self_select` — instructor role FOR SELECT WHERE `instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())`.

**REQ-PAYOUT002-RLS-002 (Ubiquitous)**
The system **shall** apply RLS to `settlement_sessions` with: (a) `settlement_sessions_admin_all` — admin FOR ALL, (b) `settlement_sessions_operator_rw` — operator/admin FOR SELECT/INSERT/DELETE, (c) `settlement_sessions_instructor_self_select` — instructor FOR SELECT WHERE the linked settlement is the instructor's own (join condition).

**REQ-PAYOUT002-RLS-003 (Unwanted Behavior)**
**IF** an instructor reaches `/settlements/generate` (e.g., via stale browser tab), **THEN** the route group guard from SPEC-AUTH-001 (`requireRole(['operator', 'admin'])`) **shall** silent-redirect first; even if the guard fails (defense in depth), RLS on `settlement_sessions` and `lecture_sessions` **shall** prevent data exposure.

**REQ-PAYOUT002-RLS-004 (Ubiquitous)**
The system **shall not** introduce any service-role Supabase client in this SPEC; all DB operations (including bulk session upsert and settlement generation) **shall** use the user-scoped server client to keep RLS as the authoritative authorization layer.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 / 사유 |
|------|-----------------|
| 정산 자동 cron / 외부 스케줄러 (월말 자동 트리거) | 본 SPEC은 운영자 트리거만. cron은 SPEC-PAYOUT-CRON-XXX 후속. 운영자 검토 단계 보존 목적. |
| 카카오 알림톡 / 이메일 실 발송 (정산 요청 알림) | SPEC-NOTIFY-001 후속 (SPEC-PAYOUT-001과 동일 위임) |
| 정산 명세서 PDF 출력 (강사용 청구서) | SPEC-PAYOUT-PDF-XXX 후속 |
| 강사 측 분쟁 신고 UI ("이 정산 금액이 다릅니다" 버튼) | SPEC-PAYOUT-DISPUTE-XXX 후속 |
| 시급(`hourly_rate_krw`) 변경 이력 추적 (audit log) | 본 SPEC은 단일 컬럼 UPDATE만. 이력은 SPEC-PAYOUT-AUDIT-XXX 후속 |
| 고객사 직접 강사 지급 (settlement_flow='client_direct') | SPEC-RECEIPT-001이 별도 처리. 본 SPEC은 corporate / government 2종만. |
| 강사 자기 정산 미리보기 (다음 정산 예상 금액) — UI 측 | SPEC-ME-002 또는 SPEC-ME-001 v2.x 후속. 본 SPEC은 데이터 기반(lecture_sessions)만 마련. |
| SPEC-PAYOUT-001 settlement 4-state 머신 / 세율 검증 / 1-클릭 정산요청 / 매입매출 위젯 | 변경 없음. 본 SPEC은 settlement INSERT 경로만 추가하고 기존 동작은 그대로 사용 |
| 정산 행 삭제 / 취소 UI (잘못 생성한 settlement 롤백) | 본 SPEC 범위 외. admin SQL 또는 SPEC-PAYOUT-ROLLBACK-XXX 후속 |
| settlement 행을 lecture_sessions와 unlink하는 UI ("이 세션은 빼주세요") | 본 SPEC 범위 외. 운영자가 settlement 생성 전 미리보기에서 검토하는 흐름으로 대체 |
| 강사가 본인 lecture_sessions 직접 입력 (자기 시수 보고) | 본 SPEC은 운영자 입력만. 강사 self-report는 SPEC-ME-002 후속 |
| 시간 단위 0.5 외 세분화(0.25, 0.1) | 0.5 단위 강제. 비즈니스 결정 (PM 합의). |
| 다국어 (i18n) | 한국어 단일 |
| 모바일 전용 매트릭스 UX | 데스크톱 우선. SPEC-MOBILE-001 반응형 가이드만 따름 |
| pgvector / 시맨틱 매칭 (강사 자동 추천을 lecture_sessions와 결합) | 후속 |
| `business_amount_krw` / `instructor_fee_krw` 수동 입력 폼(기존 settlements 직접 INSERT) | SPEC-PAYOUT-001과 동일 — 본 SPEC도 운영자 직접 INSERT는 미제공. generate 경로만 사용. |

---

## 4. 영향 범위 (Affected Files)

본 SPEC은 새 파일 생성 + 일부 기존 파일 확장이다. **SPEC-PAYOUT-001 / SPEC-DB-001 / SPEC-PROJECT-001의 기존 파일은 변경하되 기존 동작은 보존한다.**

### 4.1 신규 마이그레이션 (3 + 1 필수)

- `supabase/migrations/20260429xxxxxx_lecture_sessions.sql` — `lecture_sessions` 테이블 + `lecture_session_status` enum + 인덱스(`(project_id, date)`, `(instructor_id, date)`) + RLS 정책 3종 + CHECK `hours > 0 AND hours <= 24`
- `supabase/migrations/20260429xxxxxx_projects_hourly_rate.sql` — `projects` ALTER ADD COLUMN `hourly_rate_krw bigint NOT NULL DEFAULT 0 CHECK (>=0)` + `instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 100)`
- `supabase/migrations/20260429xxxxxx_settlement_sessions_link.sql` — `settlement_sessions` junction + **UNIQUE INDEX on `(lecture_session_id)`** (REQ-PAYOUT002-LINK-006) + RLS 정책 3종
- **(필수, 비가역)** `supabase/migrations/20260429xxxxxx_project_status_instructor_withdrawn.sql` — `project_status` enum에 `instructor_withdrawn` 값 추가 (SPEC-PROJECT-001 status-flow.ts 확장에 필요). 본 마이그레이션은 v0.1.0에서 "선택"으로 표기되었으나 v0.1.1 부터 **필수**로 승격된다. 이유: REQ-PAYOUT002-EXCEPT-007 (instructor_withdrawn → '강사매칭' 매핑)이 `userStepFromEnum` exhaustiveness check를 충족시키려면 enum value가 반드시 존재해야 한다.

### 4.2 마이그레이션 롤백 절차 (Rollback Procedure)

각 마이그레이션의 가역성과 DOWN SQL을 명시한다. 본 SPEC의 모든 forward 마이그레이션은 **staging 환경에서 dry-run 롤백 검증을 마친 후** production 적용한다 (plan.md M1 acceptance gate).

| 마이그레이션 | 가역성 | DOWN SQL | 비고 |
|--------------|--------|----------|------|
| `20260429xxxxxx_lecture_sessions.sql` | **가역(safe)** — M1 시점에서 lecture_sessions에 FK 의존자 없음 | `DROP TABLE lecture_sessions CASCADE; DROP TYPE lecture_session_status;` | M2~M8 어디든 롤백 시 의존자(`settlement_sessions`)도 함께 롤백 필요. data-loss는 의도된 결과. |
| `20260429xxxxxx_projects_hourly_rate.sql` | **가역(safe)** — DEFAULT 0 컬럼 추가만 | `ALTER TABLE projects DROP COLUMN hourly_rate_krw; ALTER TABLE projects DROP COLUMN instructor_share_pct;` | 운영자가 입력한 시급/분배율 값은 영구 손실. 롤백 전 백업 권장. |
| `20260429xxxxxx_settlement_sessions_link.sql` | **가역(safe)** | `DROP TABLE settlement_sessions CASCADE;` | settlement_sessions 행 손실 → settlements 행은 유지되나 lecture_sessions와의 link 추적 불가능. settlement amount는 보존(GENERATED 컬럼). |
| `20260429xxxxxx_project_status_instructor_withdrawn.sql` | **비가역(one-way)** ⚠️ | (none safely) — PostgreSQL은 `ALTER TYPE ... DROP VALUE` 미지원. 롤백하려면 `DROP TYPE project_status CASCADE; CREATE TYPE project_status AS ENUM(...12개 기존 값...);` + 모든 의존 컬럼 재생성 — **데이터 파괴적**. | post-deploy 롤백 경로 없음. **pre-deployment에 staging dry-run 필수**. 만약 production rollback이 필요하면 (a) 모든 `instructor_withdrawn` 행을 다른 status로 마이그레이션 → (b) 백업 복원 → (c) 전체 enum 재생성 필요. plan.md M1 sign-off 시 "one-way migration" 명시. |

**롤백 운영 가이드**:
1. 본 SPEC의 forward 마이그레이션은 staging에서 다음 순서로 검증: (a) forward 적용 → (b) `pnpm db:verify` PASS → (c) `npx supabase db reset` (전체 DOWN equivalent) → (d) 다시 forward 적용 PASS.
2. project_status enum 추가는 `staging`에서 backup-restore 사이클을 1회 거쳐 가역성 부재를 확인한 후 production 적용.
3. M1 acceptance gate (plan.md): "rollback dry-run on staging confirms all DDL except enum-addition is reversible. Enum addition signed off as one-way migration."

### 4.3 신규 도메인 모듈

- `src/lib/sessions/types.ts` — `LectureSession`, `LectureSessionStatus`, `SessionInput`
- `src/lib/sessions/queries.ts` — `listSessionsByProject`, `bulkUpsertSessions`, `cancelSession`, `rescheduleSession`, `bulkCancelFutureSessions`
- `src/lib/sessions/status-machine.ts` — 세션 status 전환 검증
- `src/lib/sessions/validation.ts` — zod 스키마 (date + hours 0.5 단위 + status)
- `src/lib/sessions/errors.ts` — 한국어 에러 메시지 단일 출처
- `src/lib/sessions/index.ts` — barrel export
- `src/lib/payouts/calculator.ts` — 산식 순수 함수 (신규)
- `src/lib/payouts/generate.ts` — 정산 일괄 생성 핵심 로직 (신규)
- `src/lib/payouts/__tests__/calculator.test.ts`
- `src/lib/payouts/__tests__/generate.test.ts`
- `src/lib/sessions/__tests__/status-machine.test.ts`
- `src/lib/sessions/__tests__/queries.test.ts`
- `src/lib/sessions/__tests__/validation.test.ts`

### 4.4 기존 도메인 모듈 확장 (SPEC-PAYOUT-001 보존 원칙)

- `src/lib/payouts/types.ts` — `Settlement` 타입에 `linkedSessions?: LectureSession[]` 옵션 필드 추가 (조회 시 join 결과 표현용). 기존 필드는 그대로.
- `src/lib/payouts/index.ts` — `calculator` / `generate` 모듈 re-export 추가. 기존 export는 그대로.
- `src/lib/projects/validation.ts` — 프로젝트 폼 zod 스키마에 `hourly_rate_krw` + `instructor_share_pct` 필드 추가. 기존 필드는 그대로.
- `src/lib/projects/queries.ts` — INSERT/UPDATE 페이로드에 두 신규 컬럼 포함. 기존 쿼리는 그대로.
- `src/lib/projects/status-machine.ts` — `instructor_withdrawn` enum value를 status flow에 통합 (의뢰 / 강사매칭 흐름 외의 special hold state). 기존 7단계 매핑은 그대로.

### 4.5 라우트 (신규 + 확장)

- `src/app/(app)/(operator)/settlements/generate/page.tsx` — **신규**: 정산 일괄 생성 UI
- `src/app/(app)/(operator)/settlements/generate/actions.ts` — **신규**: `generateSettlements` Server Action
- `src/app/(app)/(operator)/projects/new/page.tsx` — **확장**: 폼에 시급 + 분배율 + 세션 매트릭스 추가
- `src/app/(app)/(operator)/projects/new/actions.ts` — **확장**: 신규 컬럼 + 세션 bulk INSERT
- `src/app/(app)/(operator)/projects/[id]/edit/page.tsx` — **확장**: 동일 + 결강/일정 변경/강사 중도 하차 컨트롤
- `src/app/(app)/(operator)/projects/[id]/edit/actions.ts` — **확장**: bulk upsert + cancelFuture + reschedule Server Actions

### 4.6 UI 컴포넌트 (신규)

- `src/components/projects/SessionMatrixEditor.tsx` — 날짜 행 매트릭스 + "[날짜 추가]" + 행별 date/hours/status
- `src/components/projects/RescheduleDialog.tsx` — "다른 날로 옮김" 모달
- `src/components/projects/InstructorWithdrawalDialog.tsx` — "강사 중도 하차" 모달 + 사유 입력
- `src/components/projects/HourlyRateField.tsx` — 시급 입력 필드 (KRW format)
- `src/components/projects/InstructorSharePctField.tsx` — 분배율 입력 필드 (%, 0-100)
- `src/components/payouts/GenerateSettlementsForm.tsx` — period selector + project filter + 미리보기 + 생성 버튼
- `src/components/payouts/SettlementGeneratePreviewTable.tsx` — 미리보기 테이블 (project / instructor / hours / amount / fee / flow)
- `src/components/sessions/LectureSessionStatusBadge.tsx` — 4-status 한국어 라벨 (예정/완료/취소/일정변경)

### 4.7 ME / 강사 영역 (보존, 확장 후속)

- `src/app/(app)/(instructor)/me/settlements` — 본 SPEC은 변경 없음. 강사가 lecture_sessions 기반 다음 정산 미리보기를 보는 UI는 SPEC-ME-002 후속 (RLS 정책은 본 SPEC에서 마련하여 후속 SPEC이 즉시 활용 가능)

### 4.8 변경 없음 (참고)

- `src/lib/payouts/status-machine.ts` (SPEC-PAYOUT-001) — 보존
- `src/lib/payouts/tax-calculator.ts` (SPEC-PAYOUT-001) — 보존
- `src/lib/payouts/aggregations.ts` (SPEC-PAYOUT-001 매입매출 위젯) — 보존
- `src/lib/payouts/queries.ts` (SPEC-PAYOUT-001 settlements CRUD) — 보존, 단 INSERT 경로는 generate.ts에서 호출
- `src/lib/payouts/mail-stub.ts` — 보존
- `src/lib/payouts/errors.ts` — 보존, 본 SPEC 신규 에러는 별도 module
- `supabase/migrations/20260427000030_initial_schema.sql` (SPEC-DB-001) — 변경 없음
- `src/auth/**` (SPEC-AUTH-001) — 보존
- `src/components/payouts/SettlementStatusBadge.tsx` (SPEC-PAYOUT-001) — 보존

---

## 5. 기술 접근 (Technical Approach)

### 5.1 lecture_sessions 스키마 (개념)

```sql
CREATE TYPE lecture_session_status AS ENUM ('planned', 'completed', 'canceled', 'rescheduled');

CREATE TABLE lecture_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  instructor_id uuid REFERENCES instructors(id) ON DELETE RESTRICT,
  date date NOT NULL,
  hours numeric(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  status lecture_session_status NOT NULL DEFAULT 'planned',
  original_session_id uuid REFERENCES lecture_sessions(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_lecture_sessions_project_date ON lecture_sessions(project_id, date);
CREATE INDEX idx_lecture_sessions_instructor_date ON lecture_sessions(instructor_id, date);
CREATE INDEX idx_lecture_sessions_deleted ON lecture_sessions(deleted_at);

ALTER TABLE lecture_sessions ENABLE ROW LEVEL SECURITY;
-- + 3 RLS policies (admin all / operator rw / instructor self select)
```

### 5.2 settlement_sessions junction (개념)

```sql
CREATE TABLE settlement_sessions (
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  lecture_session_id uuid NOT NULL REFERENCES lecture_sessions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (settlement_id, lecture_session_id)
);

-- HIGH-2 HARDENING (REQ-PAYOUT002-LINK-006): UNIQUE on lecture_session_id (single column)
-- prevents concurrent generate transactions from double-billing the same session.
-- Subsumes the prior non-unique index on lecture_session_id (REQ-PAYOUT002-LINK-002).
CREATE UNIQUE INDEX settlement_sessions_lecture_session_unique
  ON settlement_sessions(lecture_session_id);

ALTER TABLE settlement_sessions ENABLE ROW LEVEL SECURITY;
-- + 3 RLS policies (admin all / operator rw / instructor self select via join)
```

Concurrent-generate scenario walk-through:
1. Tx1 + Tx2 both SELECT unbilled sessions [s1, s2, s3] under READ COMMITTED — both see same set.
2. Tx1 INSERT INTO settlements (...) → settlement_id=A; INSERT junction (A, s1), (A, s2), (A, s3) → SUCCESS, COMMIT.
3. Tx2 INSERT INTO settlements (...) → settlement_id=B; INSERT junction (B, s1) → **UNIQUE violation (SQLSTATE 23505)** → entire Tx2 ROLLBACK.
4. Net result: exactly one settlement row, exactly three junction rows. No double-billing. Tx2's operator sees Korean error.

### 5.3 산식 순수 함수 (개념)

```ts
// src/lib/payouts/calculator.ts
//
// Monetary safety: ALL functions floor (never round); ALL functions return integer KRW.
// share_pct is converted to integer "cents-of-percent" via Math.round(pct * 100) before
// division to avoid IEEE-754 drift on inputs like (1000, 32.3) that would yield 322 under
// floating-point arithmetic but should yield 323 under integer arithmetic.
//
// DB invariants enforced upstream (REQ-PAYOUT002-PROJECT-FIELDS-001 / -005, REQ-SESSIONS-001):
//   - hourly_rate_krw: bigint, >= 0
//   - share_pct: numeric(5,2), 0..100, at most 2 decimal places
//   - hours: numeric(4,1), > 0 AND <= 24, multiple of 0.5

export function calculateInstructorFeePerHour(hourlyRateKrw: number, sharePct: number): number {
  // INTEGER ARITHMETIC: rate × (pct × 100) / 10000  ≡  rate × pct / 100, but FP-drift safe
  return Math.floor((hourlyRateKrw * Math.round(sharePct * 100)) / 10000);
}

export function calculateTotalBilledHours(sessions: LectureSession[]): number {
  return sessions
    .filter((s) => s.status === 'completed' && s.deleted_at === null)
    .reduce((sum, s) => sum + Number(s.hours), 0);
}

export function calculateBusinessAmount(hourlyRateKrw: number, totalHours: number): number {
  // Floor to prevent fractional-원 overcharge when totalHours ends in .5
  return Math.floor(hourlyRateKrw * totalHours);
}

export function calculateInstructorFee(feePerHour: number, totalHours: number): number {
  // Floor to prevent fractional-원 overpayment when feePerHour is odd and totalHours ends in .5
  return Math.floor(feePerHour * totalHours);
}
```

### 5.4 generate Server Action 흐름 (개념)

```
[Server Action: generateSettlements({ periodStart, periodEnd, projectIds?, flowOverrides? })]
   ↓
1. SELECT lecture_sessions
     WHERE status='completed' AND deleted_at IS NULL
       AND date BETWEEN $start AND $end
       AND (project_id = ANY($projectIds) OR $projectIds IS NULL)
       AND id NOT IN (
         SELECT lecture_session_id FROM settlement_sessions s
         JOIN settlements x ON s.settlement_id = x.id
         WHERE x.deleted_at IS NULL
       )
   ↓
2. 그룹 by project_id
   ↓
3. for each group:
     fetch project (hourly_rate_krw, instructor_share_pct, settlement_flow default)
     compute totalHours / businessAmount / feePerHour / instructorFee
     determine flow + withholdingTaxRate (corporate=0, government=3.30/8.80)
   ↓
4. db.transaction:
     for each group:
       INSERT INTO settlements (...) VALUES (...) RETURNING id  -- GENERATED 컬럼 제외
       INSERT INTO settlement_sessions (settlement_id, lecture_session_id) VALUES ...
   ↓
5. revalidatePath('/settlements')
   ↓
6. return { ok: true, createdCount }
```

### 5.5 세션 매트릭스 UI (개념)

```
[프로젝트 수정 폼]
  ┌──────────────────────────────────────────────┐
  │ 시간당 사업비: [100,000] 원                  │
  │ 강사 분배율 : [70.00] %                      │
  │ → 강사 시급(자동): 70,000 원                 │
  ├──────────────────────────────────────────────┤
  │ 강의 일정                                    │
  │ ┌──────────┬──────┬────────┬──────────────┐ │
  │ │ 날짜      │ 시수 │ 상태   │ 액션         │ │
  │ ├──────────┼──────┼────────┼──────────────┤ │
  │ │ 2026-05-03│ 2.0  │ 완료   │ -            │ │
  │ │ 2026-05-10│ 2.0  │ 완료   │ -            │ │
  │ │ 2026-05-17│ 2.0  │ 예정   │ [다른날로]   │ │
  │ │ 2026-05-24│ 2.0  │ 예정   │ [취소]       │ │
  │ └──────────┴──────┴────────┴──────────────┘ │
  │ [+ 날짜 추가]                                │
  │                                              │
  │ [강사 중도 하차]  [저장]                     │
  └──────────────────────────────────────────────┘
```

### 5.6 트랜잭션 / 동시성

- `bulkUpsertSessions`, `generateSettlements`, `bulkCancelFutureSessions`는 모두 단일 DB 트랜잭션
- `settlement_sessions` PK가 `(settlement_id, lecture_session_id)`이므로 동일 settlement에 같은 세션을 두 번 link 불가 (DB 제약 — 같은 settlement 내 중복 방지)
- **이중 청구 방지의 권위 있는(authoritative) 메커니즘은 `settlement_sessions(lecture_session_id)`에 대한 UNIQUE INDEX** (REQ-PAYOUT002-LINK-006). PRIMARY KEY는 `(settlement_id, lecture_session_id)` 조합 unique이므로 같은 세션을 다른 settlement에 link하는 것은 PK만으로는 막을 수 없다. 별도의 단일컬럼 UNIQUE 인덱스가 그 역할을 수행한다.
- 두 운영자가 동시에 generate 호출 시 (READ COMMITTED isolation 가정):
  - 시나리오 (a) — **순차 직렬화**: 첫 Tx COMMIT 이후 두 번째 Tx의 SELECT는 이미 link된 세션을 자동 제외. 정상 흐름.
  - 시나리오 (b) — **race condition**: 두 Tx가 동시에 SELECT를 수행하여 동일한 unbilled set [s1, s2, s3]을 본 경우, 첫 INSERT 후 두 번째 INSERT는 `settlement_sessions_lecture_session_unique` UNIQUE 위반(SQLSTATE 23505)으로 거부. 두 번째 Tx는 ROLLBACK되어 settlement INSERT까지 함께 취소됨. 운영자에게는 한국어 에러 `"이 강의는 이미 다른 정산에 청구되었습니다. 새로 고침 후 다시 시도해주세요."` 표시.
- `bulkUpsertSessions`는 `(project_id, date, hours, status)` 행 단위 INSERT/UPDATE — 중복 row 자체는 허용되므로 application 레이어에서 `id`로 매칭하여 처리.
- `bulkCancelFutureSessions`(강사 중도 하차)는 `WHERE project_id=$p AND status='planned' AND date >= CURRENT_DATE` 단일 UPDATE + project status UPDATE를 한 트랜잭션으로 묶음. 동시에 운영자 두 명이 같은 프로젝트에서 hatch button을 눌러도 첫 Tx의 UPDATE가 commit된 후 두 번째 Tx는 0행 영향(이미 status=canceled로 전환됨)을 받으므로 idempotent 안전.

### 5.7 산식 검증 (단위 테스트 케이스 발췌)

산식: `feePerHour = floor((rate × round(pct × 100)) / 10000)`, `business = floor(rate × hours)`, `fee = floor(feePerHour × hours)`. 모든 결과는 정수 KRW.

| hourly_rate | share_pct | totalHours | feePerHour | expected business | expected fee | 비고 |
|-------------|-----------|------------|------------|-------------------|--------------|------|
| 100,000 | 70 | 8.0 | 70,000 | 800,000 | 560,000 | 정상 케이스 |
| 80,000 | 66.67 | 4.5 | 53,336 | 360,000 | 240,012 | floor(53336×4.5)=240012 (53336이 짝수라 .5 분모 소거) |
| 1,000 | 32.3 | 10.0 | 323 | 10,000 | 3,230 | **IEEE-754 drift 회귀 케이스** — 부동소수점 식은 322, 정수 산술은 323 |
| 0 | 70 | 8.0 | 0 | 0 | 0 | rate=0 edge |
| 100,000 | 0 | 8.0 | 0 | 800,000 | 0 | share_pct=0 edge |
| 100,000 | 100 | 8.0 | 100,000 | 800,000 | 800,000 | share_pct=100 edge |
| 50,000 | 33.33 | 4.5 | 16,665 | 225,000 | 74,992 | floor(16665×4.5)=floor(74992.5)=74992 (홀수×.5 floor) |

### 5.8 기존 컬럼 호환성 (business_amount_krw / instructor_fee_krw)

- `projects` 테이블의 기존 두 컬럼은 보존 (DROP/RENAME 금지)
- 정산 생성 시 `settlements`에 INSERT되는 값은 `lecture_sessions × hourly_rate × share_pct` 산식 결과 — `projects.business_amount_krw`는 더 이상 settlement 금액의 출처가 아니다
- SPEC-PAYOUT-001의 settlement CRUD / 매입매출 위젯은 settlements 테이블의 `business_amount_krw` / `instructor_fee_krw`를 그대로 읽으므로 변경 없음

### 5.9 SPEC-PAYOUT-001 invariant 보존

- settlements 4-state 머신: 변경 없음
- 세율 검증 (corporate=0, government ∈ {3.30, 8.80}): generate 경로도 그대로 준수
- GENERATED 컬럼 read-only: generate Server Action도 INSERT 페이로드에서 `profit_krw`, `withholding_tax_amount_krw` 제외
- 1-클릭 정산요청: 본 SPEC은 settlement INSERT 경로만 추가, 후속 흐름은 SPEC-PAYOUT-001 그대로
- 매입매출 위젯: 본 SPEC의 generate 경로가 만들어내는 settlements 행은 위젯에 자동 반영 (held 제외 정책 동일)

### 5.10 의존성

- 신규 패키지 의존성: 없음
- (이미 있음) `react-hook-form`, `zod`, `drizzle-orm`, `@supabase/ssr`, shadcn/ui, `lucide-react`, `date-fns` / `date-fns-tz`
- 신규 마이그레이션: 3건 + 선택 1건 (project_status enum 확장)

---

## 6. UX 흐름 요약 (UX Flow Summary)

### 6.1 정상 흐름 — 신규 프로젝트 → 5회 강의 → 월말 정산

1. operator가 `/projects/new` 진입
2. 시간당 사업비 100,000원, 강사 분배율 70% 입력 → 시스템이 강사 시급 70,000원 표시
3. 세션 매트릭스에 5개 행 추가 (각 2시간씩, 5/3, 5/10, 5/17, 5/24, 5/31) — 모두 status=`planned`
4. 저장 → 프로젝트 + 5건 lecture_sessions INSERT
5. 강의 진행 후 운영자가 각 세션을 `completed`로 마킹 (수정 폼에서 status 변경)
6. 월말, operator가 `/settlements/generate` 진입
7. period=`2026-05` 선택, 프로젝트 필터=해당 프로젝트
8. 미리보기: "프로젝트 X / 강사 Y / 10시간 / 1,000,000원 / 700,000원 / corporate"
9. "정산 생성" 클릭 → 확인 다이얼로그 → settlement 1건 INSERT, settlement_sessions 5건 link
10. `/settlements?period=2026-05` 리다이렉트 → SPEC-PAYOUT-001 리스트에 신규 settlement 표시
11. operator가 settlement 상세 진입 → SPEC-PAYOUT-001의 1-클릭 정산요청 흐름 진행

### 6.2 결강 처리

1. operator가 프로젝트 수정 화면 진입
2. `2026-05-17` planned 세션의 [취소] 버튼 클릭
3. 사유 입력 모달 (선택) → 저장
4. 세션 status=`canceled`로 마킹
5. 월말 generate 시 해당 세션 자동 제외 → 4건 (8시간) 청구

### 6.3 일정 변경 처리

1. operator가 프로젝트 수정 화면 진입
2. `2026-05-17` planned 세션의 [다른날로 옮김] 클릭
3. 새 날짜 입력 모달 (`2026-05-20`) + 사유(선택) → 저장
4. 트랜잭션: 원본 status=`rescheduled`, 새 row INSERT (date=2026-05-20, status=`planned`, original_session_id=원본 id)
5. 새 세션이 진행 후 `completed`로 마킹되면 정산 산정에 포함

### 6.4 강사 중도 하차

1. operator가 프로젝트 수정 화면 진입
2. [강사 중도 하차] 버튼 클릭
3. 사유 입력 모달 + 미래 세션 일괄 취소 미리보기 ("3건의 미래 강의가 자동 취소됩니다.")
4. 확인 → 트랜잭션: 미래 planned 세션 일괄 `canceled`, 프로젝트 status=`instructor_withdrawn`
5. 과거 `completed` 세션은 그대로 청구 가능 → 다음 generate 시 청구
6. 프로젝트 상세 페이지에 "강사 중도 하차" 배너 표시

### 6.5 이중 청구 방지

1. operator가 5월 generate 실행 → 5건 link
2. 실수로 같은 5월을 다시 generate
3. 미리보기: "선택한 기간에 청구할 강의가 없습니다."
4. settlement 행 0건 INSERT

### 6.6 미배정 프로젝트의 세션 입력

1. operator가 신규 프로젝트 등록 시 강사 미배정 상태에서 세션 매트릭스 입력 가능
2. lecture_sessions.instructor_id는 nullable이므로 INSERT 허용
3. 강사 배정 후 운영자가 수정 폼에서 instructor_id를 일괄 갱신 (또는 시스템이 프로젝트 instructor_id 변경 시 lecture_sessions를 자동 갱신 — 후속 SPEC에서 결정)

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 세션 CRUD: planned 등록 → completed 마킹, 0.5 단위 검증, status 동결 (completed/canceled/rescheduled → 동결)
- ✅ 결강(`canceled`): 정산 산정에서 자동 제외
- ✅ 일정 변경(`rescheduled`): 원본 마커 + 새 세션 + `original_session_id` 추적, 새 세션이 completed일 때만 청구
- ✅ 운영자 배치 generate: 기간 + 프로젝트 필터 → 미청구 세션 스캔 → settlements + settlement_sessions 트랜잭션 INSERT
- ✅ 이중 청구 방지: 같은 기간 재실행 시 0건 INSERT
- ✅ 강사 중도 하차: 미래 planned 일괄 canceled, 과거 completed 보존, 프로젝트 status=`instructor_withdrawn`
- ✅ 산식 정합: `instructor_fee_per_hour = floor((hourly_rate × round(share_pct × 100)) / 10000)` (정수 산술, IEEE-754 drift 방지) 단위 테스트 PASS
- ✅ RLS: instructor 토큰으로 다른 강사의 lecture_sessions SELECT 시 0행
- ✅ SPEC-PAYOUT-001 보존: settlement 4-state 머신, 세율 검증, GENERATED 컬럼 read-only, 1-클릭 정산요청, 매입매출 위젯 모두 정상 동작
- ✅ 단위 테스트 라인 커버리지 ≥ 90% (calculator + sessions/status-machine)
- ✅ 빌드 / 타입체크 / 린트 0 에러

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| 산식 floor / round 혼동 | 강사에게 1원 단위 과/과소 지급 | 모든 단계 floor 강제, 단위 테스트로 5+ 케이스 검증, calculator.ts에 `// floor only, never round` 주석 명시 |
| **IEEE-754 부동소수점 drift** (예: `floor(1000 × 32.3 / 100)` = 322 vs 정수 산술 = 323) | 일부 (rate, share_pct) 조합에서 1원 단위 강사비 차이 | **정수 산술 채택** — `Math.round(share_pct × 100)`로 정수화 후 곱셈/나눗셈 (REQ-PAYOUT002-CALC-001). drift 회귀 케이스 단위 테스트 필수 (REQ-PAYOUT002-CALC-005-f). |
| **`instructor_withdrawn` enum 추가는 비가역(one-way)** — PostgreSQL은 `ALTER TYPE ... DROP VALUE` 미지원 | post-deploy rollback 시 데이터 파괴적 복구 필요 | (a) **pre-deployment staging dry-run 필수**, (b) backup 가용성 사전 확인, (c) plan.md M1 acceptance gate에 "one-way migration sign-off" 명시. 운영 중 enum 제거 필요 시 SPEC-PAYOUT-002-ROLLBACK-XXX 별도 진행. |
| **concurrent generate race condition** (두 운영자가 동시에 같은 기간 generate 호출 시 application-layer NOT IN 예측 가능 race) | 같은 lecture_session이 두 settlement에 link 가능 → 강사 이중 청구 | **DB UNIQUE INDEX on `settlement_sessions(lecture_session_id)`** (REQ-PAYOUT002-LINK-006) — 두 번째 INSERT가 23505 unique violation으로 거부됨. 운영자에게 한국어 에러 표시. application-layer NOT IN 필터는 UI 미리보기 zero-cost 단계로 보존. |
| projects 신규 컬럼 추가 시 기존 행이 0/0으로 시작 | 기존 settlement 흐름이 0원 INSERT | DEFAULT 0 + CHECK >= 0. 운영자가 수정 폼에서 값을 입력해야 함. 데이터 이행 가이드를 마이그레이션 SQL 주석에 명시. |
| settlement_sessions 트랜잭션 도중 실패 시 settlement 행은 INSERT, junction은 미INSERT 가능성 | 이중 청구 무력화 | 단일 DB 트랜잭션으로 묶어 atomic. 실패 시 settlement도 롤백. |
| `original_session_id` 자기참조 cycle (A → B, B → A) | 데이터 무결성 | reschedule 시 원본 status=`rescheduled`로 동결되므로 재참조 방지. 단위 테스트로 검증. |
| 강사 중도 하차 후 운영자가 동일 프로젝트에 새 강사를 배정 | lecture_sessions의 instructor_id 갱신 정책 모호 | 본 SPEC은 instructor_id 갱신 UI 미제공. 후속 SPEC-PROJECT-002 reassignment에서 결정. 본 SPEC은 status=`instructor_withdrawn`만 보장. |
| `instructor_withdrawn` enum value 추가가 SPEC-PROJECT-001 status machine과 충돌 | 빌드 에러 (TypeScript exhaustiveness check) | M1 마이그레이션에서 enum 추가 + status-flow.ts `userStepFromEnum`에 `instructor_withdrawn → '강사매칭'` case 추가 (REQ-PAYOUT002-EXCEPT-007). switch-never exhaustiveness 검증 단위 테스트. SPEC-PROJECT-001의 7단계 사용자 매핑(`'강사매칭'`)으로 회귀 — 신규 강사 재배정 흐름과 자연스럽게 결합. |
| lecture_sessions.hours가 numeric(4,1)이라 9999.9 시간까지 허용 | 비현실적 입력 가능 | **DB CHECK `hours > 0 AND hours <= 24`** (REQ-PAYOUT002-SESSIONS-001) + **zod max(24)** (REQ-PAYOUT002-SESSIONS-008) defense-in-depth. zod에서 1차 거부, 우회 시 DB CHECK가 2차 거부. |
| settlement_flow 결정 정책 모호 (프로젝트 메타 vs 운영자 선택) | 잘못된 flow로 INSERT | UI에서 프로젝트별 flow를 미리보기 단계에서 명시적으로 표시 + 운영자 확인 필수. |
| `client_direct` flow는 SPEC-RECEIPT-001이 처리 | 본 SPEC과 enum 충돌 가능성 | 본 SPEC은 settlement_flow에 새 값 추가하지 않음. SPEC-RECEIPT-001이 enum을 확장하면 본 SPEC의 flow override UI는 새 값을 자동 인식 (옵션 추가만). |
| 세션 매트릭스 UI에서 100건 이상 행 입력 시 성능 저하 | UX 저하 | 클라이언트 페이지네이션 또는 가상 스크롤 도입은 후속. 본 SPEC은 30건 이하 권장 + 30건 초과 시 경고. |
| RLS instructor self-select가 `instructor_id IS NULL` 세션에 대해 어떻게 동작하는가 | 데이터 가시성 모호 | nullable instructor_id 세션은 instructor SELECT에서 제외 (`instructor_id IS NOT NULL AND instructor_id = ...`). 운영자 입력 단계 세션은 강사 화면에 노출되지 않음. |
| GENERATED 컬럼 INSERT 페이로드 누락 회귀 | 422 에러 | `src/lib/payouts/queries.ts`의 sanitizePayload 패턴 재사용 (SPEC-PAYOUT-001 산출물). grep 회귀 가드 유지. |
| 세션을 settlement에 link한 후 lecture_sessions row를 hard delete 시도 | FK RESTRICT로 거부 | `ON DELETE RESTRICT` + 운영자에게 "이 세션은 정산 X에 청구되어 삭제할 수 없습니다." 한국어 에러 표시. soft delete만 권장. |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: §2.2 운영자 페르소나, §3.1 [F-202] / [F-205], §시나리오 C 정산 마감, §5 KPI
- `.moai/project/structure.md`: `src/lib/sessions/`, `src/lib/payouts/`, `src/components/projects/`, `src/components/payouts/` 디렉토리 설계
- `.moai/project/tech.md`: Drizzle ORM 트랜잭션, Supabase RLS 활용 패턴, KRW 정수 단위 정책
- `.moai/specs/SPEC-PAYOUT-001/spec.md`: settlements 운영자 관리 UI, 4-state 머신, 세율 검증, 매입매출 위젯, GENERATED 컬럼 read-only — **본 SPEC이 보존하고 확장하는 기준선**
- `.moai/specs/SPEC-DB-001/spec.md`: `settlements` / `projects` / `instructors` / `notifications` 스키마 + RLS 정책 + pgcrypto + soft delete 정책
- `.moai/specs/SPEC-PROJECT-001/spec.md`: 13단계 `project_status` enum + 7단계 user step 매핑 — `instructor_withdrawn` 추가 협응
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole(['operator', 'admin'])` 가드, `getCurrentUser()`
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: 운영자 사이드바 Settlements / Projects 메뉴
- `.moai/specs/SPEC-ME-001/spec.md`: 강사 본인 정산 조회 화면 (`/me/settlements`) — 본 SPEC 무변경, 강사 측 미리보기는 SPEC-ME-002 후속
- (별도) SPEC-RECEIPT-001 (예정): 고객사 직접 강사 지급(`client_direct` flow)
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오
- [`plan.md`](./plan.md): 마일스톤 분해 + RED-GREEN-REFACTOR 사이클

---

_End of SPEC-PAYOUT-002 spec.md_
