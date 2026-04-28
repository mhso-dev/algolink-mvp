---
id: SPEC-PAYOUT-001
version: 1.0.0
status: completed
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-PAYOUT-001: 정산 관리 (Settlements Management — Operator Workflow)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성. Algolink MVP의 [F-205] 운영자 정산 관리 기능. (1) `(operator)/settlements` 라우트 그룹의 리스트(상태/흐름/월 필터 + 매입매출 합계 위젯) + 상세(상태 전환 컨트롤 + 1-클릭 정산요청 + 입금확인 + 보류 토글) 페이지; (2) `settlement_status` 4단계(`pending → requested → paid` + 보류 분기 `held`)의 상태머신 검증 — 도메인 순수 함수로 허용 전환만 허용하고 차단 케이스(`paid` confirm 후 동결, `held → paid` 직접 전환 차단)를 한국어 에러로 거부; (3) `settlement_flow`별 원천세율 검증 — `corporate=0`, `government ∈ {3.30, 8.80}`을 zod로 사전 차단하여 SPEC-DB-001의 CHECK 제약 위반 시점을 form 레이어로 끌어올림; (4) 1-클릭 정산요청 메일 스텁 — `settlements.status` `pending → requested` 전환 + 트리거 자동 기록(`settlement_status_history`) + `notifications` INSERT(`type='settlement_requested'`, recipient = 강사 user_id) + 콘솔 로그 1줄(`[notif] settlement_requested → instructor_id=<uuid>`); (5) 매입매출 위젯 — 선택된 월의 `SUM(business_amount_krw)` / `SUM(instructor_fee_krw)` / `SUM(profit_krw)`를 `status != 'held' AND deleted_at IS NULL` 조건으로 집계; (6) `profit_krw` / `withholding_tax_amount_krw` GENERATED 컬럼 read-only 강제(INSERT/UPDATE 컬럼 목록에서 제외); (7) operator/admin 외 역할(특히 instructor) 차단은 SPEC-AUTH-001 `(operator)/layout.tsx` 가드 재사용. SPEC-DB-001(완료) `settlements`/`settlement_status_history`/`notifications` 테이블 + CHECK 제약 + status 변경 트리거 그대로 사용. 실제 이메일 발송(SPEC-NOTIFY-001), 국세청 세금계산서 API, 강사 본인 정산 화면(SPEC-ME-001 M5/M7 완료분), 전자 송금/은행 연동은 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **운영자(operator) 영역 [F-205] 정산 관리**를 구축한다. 본 SPEC의 산출물은 (a) `(app)/(operator)/settlements/` 라우트 그룹의 리스트/상세 2개 페이지(기존 placeholder를 본격 기능으로 확장), (b) `settlement_status` 4-state 전환 그래프(`pending → requested → paid` 정상 흐름 + 보류 분기 `held ↔ requested` + `pending → held` 선보류)와 차단 케이스(`paid` 동결, `held → paid` 직접 전환 차단)를 강제하는 도메인 순수 함수, (c) 1-클릭 정산요청 흐름 — 상태 전환 + DB 트리거 자동 기록 활용 + `notifications` INSERT(`type='settlement_requested'`) + 콘솔 로그(이메일 발송은 SPEC-NOTIFY-001 후속), (d) `settlement_flow` 별 원천세율(`corporate=0`, `government ∈ {3.30, 8.80}`) zod 사전 검증으로 DB CHECK 제약 위반 시점을 form 레이어로 끌어올리기, (e) 매입매출 위젯 — 선택 월·분기·연도 범위의 `SUM(business_amount_krw)` / `SUM(instructor_fee_krw)` / `SUM(profit_krw)`를 `status != 'held' AND deleted_at IS NULL` 조건으로 집계, (f) `profit_krw` / `withholding_tax_amount_krw` GENERATED 컬럼 read-only 강제(INSERT/UPDATE 페이로드에서 제외), (g) operator/admin 외 역할 차단(SPEC-AUTH-001 `(operator)/layout.tsx` 가드 재사용), (h) 한국어 에러 UX, (i) Asia/Seoul 시간대 표시이다.

본 SPEC은 실제 이메일/SMS/카카오 발송, 국세청 세금계산서 발행, 강사 본인 정산 조회 화면, 전자 송금, 은행 연동을 빌드하지 않는다.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.2 [F-205]는 운영자가 (i) 교육 종료 후 자동 생성된 정산 행을 정산 전(`pending`) → 정산 요청(`requested`) → 정산 완료(`paid`) 흐름으로 관리할 수 있어야 하고, (ii) 행을 선택하여 1-클릭으로 강사에게 정산 요청 메일(현재는 인앱 알림 + 콘솔 로그 스텁)을 발송할 수 있어야 하며, (iii) 매입매출 현황 테이블로 월/분기/연도별 사업비·강사비·수익 합계를 즉시 확인할 수 있어야 한다고 명시한다. KPI는 §5에 따라 "월 정산 처리 시간 50% 단축"이다.

기술 기반은 모두 SPEC-DB-001에서 마련되었다 (`supabase/migrations/20260427000030_initial_schema.sql` 검증 완료):

- **`settlements` 테이블**:
  - `id uuid PK`, `project_id uuid FK→projects (RESTRICT)`, `instructor_id uuid FK→instructors (RESTRICT)`
  - `settlement_flow settlement_flow ENUM('corporate', 'government')` NOT NULL
  - `status settlement_status ENUM('pending', 'requested', 'paid', 'held')` NOT NULL DEFAULT `'pending'`
  - `business_amount_krw bigint` NOT NULL — 사업비
  - `instructor_fee_krw bigint` NOT NULL — 강사비
  - `withholding_tax_rate numeric(5,2)` NOT NULL DEFAULT `0` — 원천세율(%)
  - **`profit_krw bigint GENERATED ALWAYS AS (business_amount_krw - instructor_fee_krw) STORED`** — 수익(read-only)
  - **`withholding_tax_amount_krw bigint GENERATED ALWAYS AS (floor(instructor_fee_krw * withholding_tax_rate / 100)::bigint) STORED`** — 원천세 금액(read-only)
  - `payment_received_at timestamptz` (입금 확인 시각)
  - `payout_sent_at timestamptz` (강사 송금 시각)
  - `tax_invoice_issued boolean` NOT NULL DEFAULT `false`
  - `tax_invoice_issued_at date`
  - `notes text`
  - `deleted_at timestamptz` (soft delete)
  - `created_at` / `updated_at` / `created_by`
  - **CHECK 제약 `settlements_withholding_rate_check`**: `(settlement_flow = 'corporate' AND withholding_tax_rate = 0) OR (settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))`
- **`settlement_status_history` 테이블** + 트리거 `trg_settlements_status_history` (AFTER UPDATE OF status):
  - `id`, `settlement_id (cascade)`, `from_status`, `to_status`, `changed_by`, `changed_at`
  - 트리거 함수 `app.log_settlement_status_change`가 status 변경 시 자동 INSERT
- **`notifications` 테이블** + `notification_type` ENUM에 `settlement_requested` 값 사전 정의
  - 본 SPEC은 새 enum value를 추가하지 않음 (SPEC-DB-001에서 이미 포함)
- **인덱스**: `idx_settlements_project`, `idx_settlements_instructor`, `idx_settlements_status`, `idx_settlements_flow`, `idx_settlements_deleted`
- **RLS**: `settlements_admin_all` (admin FOR ALL), `settlements_operator_rw` (operator/admin SELECT), `settlements_operator_write` (operator/admin INSERT), `settlements_operator_update` (operator/admin UPDATE), `settlements_self_select` (instructor 본인 settlement만 SELECT)

SPEC-AUTH-001은 `(operator)/layout.tsx`에 `requireRole(['operator', 'admin'])`을 강제하는 server layout 가드와 `getCurrentUser()` 헬퍼를 이미 제공하며, SPEC-LAYOUT-001은 운영자 사이드바에 "Settlements" 메뉴와 placeholder 페이지를 제공한다. SPEC-PROJECT-001은 `projects` 테이블의 status 전환을 `task_done`까지 진행시키는 흐름을 마련했다(정산 행 생성 트리거는 SPEC-DB-001 §1.3 또는 후속 SPEC, 본 SPEC은 정산 행이 이미 존재한다고 가정). 본 SPEC은 운영자 사이드바의 "정산 관리" 메뉴 콘텐츠를 placeholder에서 본격 기능으로 확장한다.

#### 상태머신 (Settlement Status Machine)

`settlement_status` ENUM 4개 값에 대한 허용 전환 그래프:

| from \ to | pending | requested | paid | held |
|-----------|---------|-----------|------|------|
| **pending** | (idle) | ✅ 정산요청 | ❌ | ✅ 선보류 |
| **requested** | ❌ | (idle) | ✅ 입금확인 | ✅ 보류 |
| **paid** | ❌ | ❌ | (idle, **동결**) | ❌ |
| **held** | ❌ | ✅ 재요청 | ❌ (반드시 requested 경유) | (idle) |

차단되는 핵심 케이스:
- `paid → *` (모든 전환): 입금 확인 후 동결. 금액 변조 방지.
- `held → paid` (직접): 보류 해제는 반드시 requested로 복귀 후에만 입금확인 가능.
- `pending → paid`, `pending → requested → pending`(역행), `held → pending`: 비즈니스 흐름상 불가.

#### 세율 검증 표 (Withholding Tax Rate Validation)

| settlement_flow | 허용된 withholding_tax_rate | DB CHECK 제약 | Zod 사전 차단 메시지 |
|-----------------|---------------------------|---------------|---------------------|
| `corporate` (기업 사업) | `0` (정확히) | `settlement_flow = 'corporate' AND withholding_tax_rate = 0` | `"기업 정산은 원천세율이 0%여야 합니다."` |
| `government` (정부 사업) | `3.30` 또는 `8.80` | `settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80)` | `"정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다."` |

본 SPEC은 zod 스키마로 사전 차단하여 사용자가 잘못된 값을 입력했을 때 form 레이어에서 한국어 에러를 표시하고, DB CHECK 위반(서버 500)이 발생하지 않도록 한다.

#### GENERATED 컬럼 read-only 정책

- `profit_krw` = `business_amount_krw - instructor_fee_krw` (자동 계산)
- `withholding_tax_amount_krw` = `floor(instructor_fee_krw * withholding_tax_rate / 100)` (자동 계산)
- 두 컬럼 모두 `GENERATED ALWAYS AS ... STORED` → INSERT/UPDATE에서 명시적으로 값을 지정하면 PostgreSQL이 422 에러 반환
- 본 SPEC은 도메인 쿼리/DB 페이로드 빌더에서 두 컬럼을 INSERT/UPDATE 컬럼 목록에서 **항상 제외**하고, 표시 레이어(리스트/상세)에서만 SELECT하여 사용

### 1.3 범위 (Scope)

**In Scope:**

- 라우트 (`src/app/(app)/(operator)/settlements/`):
  - `page.tsx` — 정산 리스트 (상태 필터 + 흐름 필터 + 강사 필터 + 월/분기/연도 필터 + 매입매출 합계 위젯 + 페이지네이션)
  - `[id]/page.tsx` — 정산 상세 (요약 + 상태 stepper + 상태 전환 컨트롤 + 정산요청 1-클릭 + 입금확인 + 보류 토글 + 메모)
  - `[id]/request/actions.ts` — `requestSettlement` Server Action (정산요청: pending → requested + 메일 스텁)
  - `[id]/mark-paid/actions.ts` — `markPaid` Server Action (입금확인: requested → paid + payment_received_at)
  - `[id]/hold/actions.ts` — `holdSettlement` / `resumeSettlement` Server Action (보류 토글: → held / held → requested)

- 도메인 로직 (`src/lib/payouts/`):
  - `status-machine.ts` — 4-state 전환 그래프 + `validateTransition(from, to): { ok: true } | { ok: false; reason: string }` (한국어 에러 상수 포함, `@MX:ANCHOR`)
  - `tax-calculator.ts` — `validateTaxRate(flow, rate)` zod refinement 헬퍼 + `computeWithholdingTaxAmount(fee, rate)` (DB GENERATED 컬럼과 동일 공식, 단위 테스트 검증용)
  - `aggregations.ts` — 월/분기/연도별 매입매출 집계 SQL (Drizzle relational query) + 결과 타입 `MonthlyAggregate { businessSum, feeSum, profitSum, count }`
  - `list-query.ts` — `listSettlements(filters, page)` 필터 조합 (status / flow / instructor_id / period / 페이지네이션)
  - `queries.ts` — CRUD: `listSettlements`, `getSettlementById`, `transitionSettlementStatus`, `markPaid`, `holdSettlement`, `requestSettlement` (모두 GENERATED 컬럼 제외)
  - `mail-stub.ts` — `sendSettlementRequestStub({ settlementId, instructorId, projectTitle })` — `notifications` INSERT(`type='settlement_requested'`) + `console.log("[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>")` 1줄
  - `validation.ts` — zod 스키마 (정산 행 수정 폼: 사업비/강사비/원천세율/메모) + 세율 cross-field validation
  - `errors.ts` — 한국어 에러 메시지 단일 출처 (8종)
  - `formatters.ts` — KRW 포맷, 원천세율 표시 헬퍼
  - `__tests__/status-machine.test.ts` — 모든 from×to 조합 테스트(4×4=16, 허용 5건 + 차단 11건)
  - `__tests__/tax-calculator.test.ts` — corporate/government × {0, 3.30, 8.80, 5.00(invalid)} 검증

- UI 컴포넌트 (`src/components/payouts/`):
  - `SettlementStatusBadge.tsx` — 4단계 한국어 라벨(정산 전/정산 요청/정산 완료/보류) + semantic color
  - `SettlementFlowBadge.tsx` — `corporate` → "기업", `government` → "정부"
  - `SettlementFiltersBar.tsx` — 상태/흐름/강사/기간 필터 컨트롤
  - `RevenueWidget.tsx` — 매입매출 합계 카드 (사업비/강사비/수익 KRW 표시)
  - `SettlementActionsPanel.tsx` — 상세 페이지의 상태 전환 버튼 그룹 (정산요청/입금확인/보류/재요청)
  - `SettlementHistoryList.tsx` — `settlement_status_history` 타임라인

- 한국어 에러 매핑 (`src/lib/payouts/errors.ts` — 8종):
  - `STATUS_PAID_FROZEN`: `"정산 완료된 항목은 변경할 수 없습니다."`
  - `STATUS_HELD_TO_PAID_BLOCKED`: `"보류 상태에서는 정산 완료로 직접 전환할 수 없습니다. 정산 요청으로 먼저 복귀하세요."`
  - `STATUS_NEED_REQUESTED`: `"정산 요청 상태에서만 입금 확인이 가능합니다."`
  - `STATUS_INVALID_TRANSITION`: `"허용되지 않은 상태 전환입니다."`
  - `TAX_RATE_CORPORATE_NONZERO`: `"기업 정산은 원천세율이 0%여야 합니다."`
  - `TAX_RATE_GOVERNMENT_INVALID`: `"정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다."`
  - `MAIL_STUB_FAILED`: `"정산 요청 알림 발송에 실패했습니다. 잠시 후 다시 시도해주세요."`
  - `SETTLEMENT_NOT_FOUND`: `"정산 정보를 찾을 수 없습니다."`

- 단위 테스트 (`src/lib/payouts/__tests__/`):
  - `status-machine.test.ts` (16개 케이스 + 한국어 에러 검증)
  - `tax-calculator.test.ts` (corporate × 1 정상 + 1 invalid, government × 2 정상 + 2 invalid)
  - `aggregations.test.ts` (held 제외, deleted_at 제외, 월/분기 경계 검증)
  - `mail-stub.test.ts` (notifications INSERT 모킹 + console.log 캡처)

- 통합 테스트 (`src/app/(app)/(operator)/settlements/__tests__/integration.test.ts`):
  - 시나리오 1: 정산요청 1-클릭 → status 전환 + history 자동 기록 + notifications INSERT + 콘솔 로그
  - 시나리오 2: 입금확인 → paid + payment_received_at 갱신
  - 시나리오 3: 보류 토글 (pending → held → requested)
  - 시나리오 4: paid 동결 검증 (모든 전환 버튼 disabled)
  - 시나리오 5: 매입매출 위젯 합계 검증 (held 제외)
  - 시나리오 6: 세율 zod 거부 (corporate에 5% 입력)
  - 시나리오 7: instructor 토큰으로 `/settlements` 접근 → silent redirect

- 한국어 UI, Asia/Seoul 표시(`src/lib/format/datetime.ts` 재사용)

**Out of Scope (Exclusions — What NOT to Build):**

- **실제 이메일/SMS/카카오 발송**: Resend/SES/Nodemailer 어댑터 통합은 SPEC-NOTIFY-001 후속. 본 SPEC은 `notifications` INSERT + 콘솔 로그 스텁만.
- **국세청 세금계산서 발행 API**: e세로 / Popbill / 바로빌 등 외부 세금계산서 발행 연동은 미제공. `tax_invoice_issued` boolean 토글 UI만 제공(수동 표시).
- **전자 송금 / 은행 API 연동**: KB/신한 OpenAPI, 페이팔 송금, 가상계좌 발행은 미제공. `payment_received_at` / `payout_sent_at` 수동 입력만.
- **강사 본인 정산 조회 화면**: `/me/settlements` 라우트는 SPEC-ME-001 M5/M7에서 구현 완료. 본 SPEC은 운영자 영역만.
- **정산 행 자동 생성 트리거**: 프로젝트가 `task_done`로 전환될 때 `settlements` 행 자동 생성하는 트리거는 SPEC-PAYOUT-AUTOGEN-XXX 후속. 본 SPEC은 정산 행이 이미 존재한다고 가정 (seed 또는 admin이 직접 INSERT).
- **정산 행 신규 등록 UI**: 본 SPEC은 기존 정산 행 관리만 다룸. operator가 정산 행을 직접 INSERT하는 폼(`/settlements/new`)은 미제공. 대신 admin이 직접 SQL 또는 추후 SPEC-PAYOUT-CREATE-XXX에서 폼 추가.
- **정산 행 hard delete**: soft delete (`deleted_at` 컬럼 갱신)만 admin role에서 후속 SPEC. 본 SPEC은 삭제 UI 미제공.
- **정산 일괄 처리 (bulk requestSettlement)**: 기존 placeholder의 "일괄 정산 요청" 버튼은 disabled 유지. 단건 처리만. 일괄은 SPEC-PAYOUT-BULK-XXX 후속.
- **세율 운영자 자유 입력 (CHECK 제약 변경)**: 0 / 3.30 / 8.80 외 다른 세율은 미지원. 향후 `settlements_withholding_rate_check` 변경은 별도 마이그레이션 SPEC.
- **다국어 (i18n)**: 한국어 단일.
- **모바일 전용 UX**: 데스크톱 우선. SPEC-LAYOUT-001 반응형 가이드만 따름.
- **추가 마이그레이션**: SPEC-DB-001 스키마가 완비되어 있어 본 SPEC은 마이그레이션 0개. (선택적 옵션: 매입매출 집계 뷰 `payouts_monthly_view`를 `supabase/migrations/20260428110000_payouts_views.sql`로 추가할 수 있으나, 현 SPEC 범위에서는 Drizzle 동적 SQL로 처리하고 뷰 추가는 후속 옵션.)
- **PDF 출력 (정산 명세서)**: 강사에게 발송할 정산 명세서 PDF 생성은 후속.
- **Webhook / 외부 알림 채널**: 슬랙/디스코드 알림은 후속.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 단위 테스트: `src/lib/payouts/__tests__/` 모든 케이스 PASS, 라인 커버리지 ≥ 85% (payouts 모듈)
- ✅ 통합 테스트: 정산요청 → 입금확인 → 매입매출 집계 시나리오 PASS
- ✅ 상태머신 검증: 16개 from×to 조합 모두 단위 테스트로 검증 (허용 5건 + 차단 11건)
- ✅ 1-클릭 정산요청 후: (a) `settlements.status = 'requested'`, (b) `settlement_status_history`에 트리거 자동 INSERT 1행, (c) `notifications`에 강사 대상 1행 INSERT (`type = 'settlement_requested'`), (d) 콘솔 로그 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>`
- ✅ 입금확인 후: `settlements.status = 'paid'`, `payment_received_at = now()`
- ✅ 보류 토글: `pending → held` 또는 `requested → held` 전환 동작
- ✅ paid 동결: 모든 상태 전환 버튼 disabled, Server Action 호출 시 `STATUS_PAID_FROZEN` 한국어 에러
- ✅ `held → paid` 직접 전환 차단: `STATUS_HELD_TO_PAID_BLOCKED` 한국어 에러
- ✅ 세율 zod 거부: `corporate + rate=5` → 한국어 에러 표시, DB CHECK 위반 사전 차단
- ✅ GENERATED 컬럼 read-only: 모든 INSERT/UPDATE 페이로드에서 `profit_krw` / `withholding_tax_amount_krw` 제외 검증 (grep로 코드베이스 전체 확인 가능)
- ✅ 매입매출 위젯: 선택 월의 `SUM(business_amount_krw)` / `SUM(instructor_fee_krw)` / `SUM(profit_krw)`를 `status != 'held' AND deleted_at IS NULL` 조건으로 정확 계산
- ✅ 페이지네이션: 100건 이상 정산 행이 있을 때 페이지당 20건, 페이지 이동 시 URL `?page=N` 반영
- ✅ 검색 필터: 상태(4단계 multi-select), 흐름(corporate/government), 강사(instructor_id), 기간(월/분기/연도) 4종 조합 동작
- ✅ RLS 정합: instructor 토큰으로 `/settlements` 접근 시 SPEC-AUTH-001 가드가 silent redirect → `/me/dashboard`. operator/admin은 정상 진입.
- ✅ 접근성: axe DevTools `/settlements`, `/settlements/[id]` critical 0건
- ✅ 키보드 only: 모든 상태 전환 버튼 Tab 도달, Enter 활성화
- ✅ Asia/Seoul 표시: `payment_received_at`, `payout_sent_at`, `created_at`, `updated_at`이 한국 시간대로 일관 표시 (예: `2026-05-01 14:30 KST`)

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `LIST`, `DETAIL`, `STATUS`, `TAX`, `MAIL`, `AGGREGATE`, `RLS`.

### 2.1 REQ-PAYOUT-LIST — 리스트 / 검색 / 필터 / 페이지네이션

**REQ-PAYOUT-LIST-001 (Ubiquitous)**
The system **shall** provide a settlements list page at `/settlements` (under route group `(app)/(operator)`) accessible only to roles `operator` and `admin`, rendering server-side via React Server Components.

**REQ-PAYOUT-LIST-002 (Ubiquitous)**
The system **shall** display each settlement row with: 프로젝트 (`projects.title` join), 강사 (`instructors.name_kr` via `instructors_safe` view), 흐름 배지 (corporate/government 한국어 라벨), 상태 배지 (4단계 한국어 라벨 with semantic color), 사업비 (`business_amount_krw`), 강사비 (`instructor_fee_krw`), 수익 (`profit_krw`), 원천세 (`withholding_tax_rate` % + `withholding_tax_amount_krw` KRW).

**REQ-PAYOUT-LIST-003 (Ubiquitous)**
The system **shall** support filters via URL query parameters: `status` (multi-select 4단계), `flow` (`corporate` | `government`), `instructor_id` (single select), `period` (month: `YYYY-MM`, quarter: `YYYY-Q1..Q4`, year: `YYYY`), `page` (1-based).

**REQ-PAYOUT-LIST-004 (Event-Driven)**
**WHEN** operator filters settlements by `status='requested'` via the URL parameter, the system **shall** return only rows where `settlements.status = 'requested' AND settlements.deleted_at IS NULL`.

**REQ-PAYOUT-LIST-005 (Ubiquitous)**
The system **shall** paginate results with `pageSize = 20`, exposing total count for navigation controls.

**REQ-PAYOUT-LIST-006 (State-Driven)**
**WHILE** filter parameters are present in the URL, the system **shall** preserve them across page navigation and detail view back-navigation.

**REQ-PAYOUT-LIST-007 (Unwanted Behavior)**
**IF** the requested `page` exceeds total pages, **THEN** the system **shall** redirect to the last valid page rather than rendering an empty list.

**REQ-PAYOUT-LIST-008 (Event-Driven)**
**WHEN** a user clicks a row, the system **shall** navigate to `/settlements/[id]` preserving the current filter state in back-navigation.

### 2.2 REQ-PAYOUT-DETAIL — 정산 상세

**REQ-PAYOUT-DETAIL-001 (Ubiquitous)**
The system **shall** provide a settlement detail page at `/settlements/[id]` rendering server-side, with sections: (a) 요약 헤더 (프로젝트·강사·흐름·상태·금액), (b) 4단계 상태 stepper, (c) 금액 상세 (사업비·강사비·수익·원천세율·원천세 금액·세금계산서 발행 여부), (d) 일자 정보 (입금 확인일·송금일·생성일·수정일), (e) 메모 (`notes`), (f) 상태 전환 컨트롤 패널.

**REQ-PAYOUT-DETAIL-002 (Ubiquitous)**
The system **shall** call `requireUser()` (SPEC-AUTH-001 helper) and verify the settlement is not soft-deleted (`deleted_at IS NULL`); when soft-deleted or not found, return Next.js `notFound()` with Korean 404 page.

**REQ-PAYOUT-DETAIL-003 (Ubiquitous)**
The system **shall** display all timestamps (`payment_received_at`, `payout_sent_at`, `created_at`, `updated_at`) in Asia/Seoul timezone with format `YYYY-MM-DD HH:mm KST` via `src/lib/format/datetime.ts`.

**REQ-PAYOUT-DETAIL-004 (Optional Feature)**
**WHERE** the settlement has past `settlement_status_history` rows, the system **shall** render them as a chronological timeline below the stepper, showing `from_status → to_status` transitions with `changed_at` and `changed_by` (user display_name).

### 2.3 REQ-PAYOUT-STATUS — 상태머신 + 전환 검증

**REQ-PAYOUT-STATUS-001 (Ubiquitous)**
The system **shall** define a TypeScript module `src/lib/payouts/status-machine.ts` exporting: `SETTLEMENT_STATUSES = ['pending', 'requested', 'paid', 'held'] as const`, the allowed-transition graph `ALLOWED_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]>`, and a function `validateTransition(from: SettlementStatus, to: SettlementStatus): { ok: true } | { ok: false; reason: string }`.

**REQ-PAYOUT-STATUS-002 (Ubiquitous)**
The `ALLOWED_TRANSITIONS` graph **shall** encode exactly the following 5 allowed transitions:
- `pending → requested` (정산요청 1-클릭)
- `pending → held` (선보류)
- `requested → paid` (입금확인)
- `requested → held` (보류)
- `held → requested` (재요청)

All other transitions (11 combinations including same-state self-transitions) **shall** be rejected.

**REQ-PAYOUT-STATUS-003 (Unwanted Behavior)**
**IF** the transition source is `paid`, **THEN** `validateTransition` **shall** return `{ ok: false, reason: STATUS_PAID_FROZEN }` ("정산 완료된 항목은 변경할 수 없습니다.").

**REQ-PAYOUT-STATUS-004 (Unwanted Behavior)**
**IF** the transition is `held → paid`, **THEN** `validateTransition` **shall** return `{ ok: false, reason: STATUS_HELD_TO_PAID_BLOCKED }` ("보류 상태에서는 정산 완료로 직접 전환할 수 없습니다. 정산 요청으로 먼저 복귀하세요.").

**REQ-PAYOUT-STATUS-005 (Event-Driven)**
**WHEN** an operator clicks the "입금확인" button on the detail page, the system **shall** invoke the `markPaid` Server Action which (a) calls `validateTransition(currentStatus, 'paid')`, (b) on success performs `UPDATE settlements SET status='paid', payment_received_at=now() WHERE id=$1 AND status='requested'`, (c) relies on `trg_settlements_status_history` trigger to record the change automatically, (d) calls `revalidatePath('/settlements/[id]')` and `revalidatePath('/settlements')`.

**REQ-PAYOUT-STATUS-006 (Event-Driven)**
**WHEN** an operator clicks the "보류" button, the system **shall** invoke the `holdSettlement` Server Action which transitions `status → held` only from `pending` or `requested`; transitions from `paid` or `held` (already held) **shall** be rejected with the appropriate error.

**REQ-PAYOUT-STATUS-007 (State-Driven)**
**WHILE** `settlements.status = 'paid'`, the system **shall** disable all status-change buttons (정산요청, 입금확인, 보류, 재요청) in the detail page UI by setting `disabled={true}` and `aria-disabled="true"`.

**REQ-PAYOUT-STATUS-008 (Ubiquitous)**
The system **shall** display the 4-step status flow as a horizontal stepper (`SettlementStatusStepper`) with the active step highlighted via `aria-current="step"` and held state shown as a side branch below the main flow.

### 2.4 REQ-PAYOUT-TAX — 원천세율 검증

**REQ-PAYOUT-TAX-001 (Ubiquitous)**
The system **shall** define a TypeScript module `src/lib/payouts/tax-calculator.ts` exporting: `validateTaxRate(flow: SettlementFlow, rate: number): { ok: true } | { ok: false; reason: string }` and `computeWithholdingTaxAmount(fee: number, ratePercent: number): number` (returns `Math.floor(fee * ratePercent / 100)`).

**REQ-PAYOUT-TAX-002 (Unwanted Behavior)**
**IF** `settlement_flow = 'corporate'` and `withholding_tax_rate !== 0`, **THEN** the zod schema in `src/lib/payouts/validation.ts` **shall** reject with the Korean error `TAX_RATE_CORPORATE_NONZERO` ("기업 정산은 원천세율이 0%여야 합니다.") **before** the form is submitted to the Server Action.

**REQ-PAYOUT-TAX-003 (Unwanted Behavior)**
**IF** `settlement_flow = 'government'` and `withholding_tax_rate ∉ {3.30, 8.80}`, **THEN** the zod schema **shall** reject with the Korean error `TAX_RATE_GOVERNMENT_INVALID` ("정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다.").

**REQ-PAYOUT-TAX-004 (Ubiquitous)**
The `computeWithholdingTaxAmount` function **shall** produce the same value as the DB GENERATED column `withholding_tax_amount_krw` for all valid (flow, rate, fee) combinations; this **shall** be verified via unit tests covering corporate(rate=0) and government(rate=3.30 / 8.80).

### 2.5 REQ-PAYOUT-MAIL — 1-클릭 정산요청 메일 스텁

**REQ-PAYOUT-MAIL-001 (Ubiquitous)**
The system **shall** provide a Server Action at `src/app/(app)/(operator)/settlements/[id]/request/actions.ts` named `requestSettlement({ settlementId })` that performs (a) `validateTransition(currentStatus, 'requested')`, (b) `UPDATE settlements SET status='requested' WHERE id=$1 AND status='pending'`, (c) trigger auto-records via `settlement_status_history`, (d) calls `sendSettlementRequestStub({ settlementId, instructorId, projectTitle })` which INSERTs into `notifications` and writes a console log.

**REQ-PAYOUT-MAIL-002 (Event-Driven)**
**WHEN** an operator clicks the "정산 요청" 1-click button on the detail page, the system **shall** display a confirmation dialog `"강사 ${name}에게 정산 요청 알림을 발송합니다. 계속하시겠습니까?"`; on confirm, the action proceeds.

**REQ-PAYOUT-MAIL-003 (Ubiquitous)**
The `sendSettlementRequestStub` function **shall** INSERT into `notifications` with: `recipient_id = (SELECT user_id FROM instructors WHERE id = $instructorId)`, `type = 'settlement_requested'`, `title` containing the project title, `body` containing the settlement amount summary, `link_url = '/me/payouts'` (placeholder for instructor self-view route), and **shall** also `console.log("[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>")` to mark the email-stub boundary.

**REQ-PAYOUT-MAIL-004 (Unwanted Behavior)**
**IF** the `notifications` INSERT fails (DB error, RLS rejection), **THEN** the entire transaction **shall** roll back; the user **shall** see the Korean error `MAIL_STUB_FAILED` ("정산 요청 알림 발송에 실패했습니다. 잠시 후 다시 시도해주세요.") and the settlement status **shall** remain unchanged.

**REQ-PAYOUT-MAIL-005 (Optional Feature)**
**WHERE** the operator wants to retry a previously requested settlement that has been moved to `held`, the system **shall** allow `held → requested` via the same `requestSettlement` action; in that case a new `notifications` row is created (audit trail preserved).

### 2.6 REQ-PAYOUT-AGGREGATE — 매입매출 위젯

**REQ-PAYOUT-AGGREGATE-001 (Ubiquitous)**
The system **shall** display a "매입매출 현황" widget on `/settlements` showing for the selected period (default: current month): 사업비 합계 (`SUM(business_amount_krw)`), 강사비 합계 (`SUM(instructor_fee_krw)`), 수익 합계 (`SUM(profit_krw)`), 정산 건수 (`COUNT(*)`).

**REQ-PAYOUT-AGGREGATE-002 (State-Driven)**
**WHILE** the revenue widget is displayed, the system **shall** compute aggregates with the filter `status != 'held' AND deleted_at IS NULL` to exclude held settlements (which represent disputed / paused entries) and soft-deleted rows.

**REQ-PAYOUT-AGGREGATE-003 (Ubiquitous)**
The widget **shall** support period selection: month (`YYYY-MM`), quarter (`YYYY-Q1..Q4`), year (`YYYY`); the SQL date range **shall** use Asia/Seoul timezone for boundary computation (e.g., `2026-05` → `[2026-05-01T00:00:00+09:00, 2026-06-01T00:00:00+09:00)`).

**REQ-PAYOUT-AGGREGATE-004 (Ubiquitous)**
The aggregates **shall** be computed against `created_at` (settlement row creation date) by default; an alternative `payment_received_at`-based view **shall** be available via a toggle (cash basis vs accrual basis).

**REQ-PAYOUT-AGGREGATE-005 (Event-Driven)**
**WHEN** the operator changes the period selector, the system **shall** refresh the widget without full page reload via Next.js `revalidatePath` and URL parameter update (`?period=2026-Q2`).

### 2.7 REQ-PAYOUT-RLS — 역할 가드 + 데이터 격리

**REQ-PAYOUT-RLS-001 (Ubiquitous)**
The system **shall** rely on SPEC-AUTH-001's `(operator)/layout.tsx` guard for the primary access control to `/settlements/*`; the layout **shall** call `requireRole(['operator', 'admin'])` and silent-redirect on mismatch.

**REQ-PAYOUT-RLS-002 (Ubiquitous)**
The system **shall** rely on SPEC-DB-001's existing RLS policies (`settlements_admin_all`, `settlements_operator_rw`, `settlements_operator_write`, `settlements_operator_update`, `settlements_self_select`) without modification; queries from operator/admin sessions **shall** see all settlements, while instructor sessions reaching a leaked URL **shall** receive zero rows.

**REQ-PAYOUT-RLS-003 (Unwanted Behavior)**
**IF** an instructor reaches `/settlements/[id]` (e.g., via a stale browser tab), **THEN** the route group guard **shall** redirect first; even if the guard fails (defense in depth), RLS **shall** return zero rows and the page **shall** call `notFound()`.

**REQ-PAYOUT-RLS-004 (Ubiquitous)**
The system **shall not** introduce any service-role (`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`) Supabase client in this SPEC; all DB operations **shall** use the user-scoped server client to keep RLS as the authoritative authorization layer.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음 항목을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임 대상 |
|------|----------|
| 실제 이메일/SMS/카카오 발송 (Resend/SES/Nodemailer/알림톡) | SPEC-NOTIFY-001 |
| 국세청 세금계산서 발행 API (e세로 / Popbill / 바로빌) | SPEC-PAYOUT-INVOICE-XXX |
| 전자 송금 / 은행 OpenAPI 연동 | SPEC-PAYOUT-BANKING-XXX |
| 강사 본인 정산 조회 화면 (`/me/settlements`) | SPEC-ME-001 (M5/M7 완료) |
| 정산 행 자동 생성 트리거 (project task_done → settlement INSERT) | SPEC-PAYOUT-AUTOGEN-XXX |
| 정산 행 신규 등록 UI (`/settlements/new` 폼) | SPEC-PAYOUT-CREATE-XXX |
| 정산 행 hard delete UI | (admin DB 작업으로) |
| 정산 일괄 처리 (bulk request) | SPEC-PAYOUT-BULK-XXX |
| 세율 운영자 자유 입력 (CHECK 제약 변경) | (별도 마이그레이션 SPEC) |
| 정산 명세서 PDF 출력 | SPEC-PAYOUT-PDF-XXX |
| 외부 알림 채널 (Slack/Discord) | (후속) |
| 매입매출 BI 대시보드 (그래프, 추이 분석) | SPEC-DASHBOARD-EXTENDED-XXX |
| 다국어 (i18n) | 한국어 단일 (product.md §3.3) |
| 모바일 전용 UX | SPEC-LAYOUT-001 반응형 가이드만 따름 |

---

## 4. 영향 범위 (Affected Files)

### 4.1 변경 라우트 (operator route group)

- `src/app/(app)/(operator)/settlements/page.tsx` — **변경**: 기존 placeholder를 본격 리스트 페이지로 확장 (필터/페이지네이션/위젯)
- `src/app/(app)/(operator)/settlements/[id]/page.tsx` — **신규**: 정산 상세
- `src/app/(app)/(operator)/settlements/[id]/request/actions.ts` — **신규**: `requestSettlement` Server Action
- `src/app/(app)/(operator)/settlements/[id]/mark-paid/actions.ts` — **신규**: `markPaid` Server Action
- `src/app/(app)/(operator)/settlements/[id]/hold/actions.ts` — **신규**: `holdSettlement` / `resumeSettlement` Server Action

### 4.2 신규 도메인 모듈 (`src/lib/payouts/`)

- `src/lib/payouts/status-machine.ts` — 4-state 전환 그래프 + `validateTransition` (`@MX:ANCHOR`)
- `src/lib/payouts/tax-calculator.ts` — `validateTaxRate` + `computeWithholdingTaxAmount` (DB GENERATED 공식)
- `src/lib/payouts/aggregations.ts` — 월/분기/연도별 매입매출 집계 SQL
- `src/lib/payouts/list-query.ts` — 필터 조합 (status / flow / instructor / period)
- `src/lib/payouts/queries.ts` — CRUD: list/get/transition/markPaid/hold/request (GENERATED 컬럼 제외)
- `src/lib/payouts/mail-stub.ts` — `sendSettlementRequestStub` (notifications INSERT + console.log)
- `src/lib/payouts/validation.ts` — zod 스키마 (세율 cross-field 검증 포함)
- `src/lib/payouts/errors.ts` — 한국어 에러 메시지 단일 출처 (8종)
- `src/lib/payouts/formatters.ts` — KRW 포맷, 원천세율 표시 헬퍼
- `src/lib/payouts/types.ts` — `SettlementStatus`, `SettlementFlow`, `Settlement`, `MonthlyAggregate` 등 도메인 타입
- `src/lib/payouts/index.ts` — barrel export

### 4.3 신규 UI 컴포넌트 (`src/components/payouts/`)

- `src/components/payouts/SettlementStatusBadge.tsx` — 4단계 한국어 라벨
- `src/components/payouts/SettlementFlowBadge.tsx` — corporate/government 한국어 라벨
- `src/components/payouts/SettlementStatusStepper.tsx` — 4단계 horizontal stepper + held branch
- `src/components/payouts/SettlementFiltersBar.tsx` — 상태/흐름/강사/기간 필터
- `src/components/payouts/RevenueWidget.tsx` — 매입매출 합계 카드
- `src/components/payouts/SettlementActionsPanel.tsx` — 상태 전환 버튼 그룹
- `src/components/payouts/SettlementHistoryList.tsx` — `settlement_status_history` 타임라인
- `src/components/payouts/SettlementSummaryHeader.tsx` — 상세 페이지 요약 헤더
- `src/components/payouts/SettlementAmountTable.tsx` — 금액 상세 테이블

### 4.4 신규 테스트

- `src/lib/payouts/__tests__/status-machine.test.ts` — 16개 전환 케이스
- `src/lib/payouts/__tests__/tax-calculator.test.ts` — 세율 검증 + GENERATED 공식 일치
- `src/lib/payouts/__tests__/aggregations.test.ts` — held 제외, deleted_at 제외, 월/분기 경계
- `src/lib/payouts/__tests__/mail-stub.test.ts` — notifications INSERT 모킹 + console.log 캡처
- `src/lib/payouts/__tests__/validation.test.ts` — zod cross-field 검증
- `src/app/(app)/(operator)/settlements/__tests__/integration.test.ts` — 시나리오 1-7

### 4.5 변경 없음 (참고)

- `src/auth/**` — SPEC-AUTH-001 산출물, 그대로 사용
- `src/components/ui/**` — SPEC-LAYOUT-001 산출물, 그대로 사용
- `supabase/migrations/**` — SPEC-DB-001 스키마 + 트리거 + RLS 그대로 사용 (마이그레이션 0개)
- `src/lib/projects/SETTLEMENT_STATUS_LABEL` — 기존 placeholder가 사용 중인 라벨, `src/lib/payouts/`로 이전하되 backward export 유지

### 4.6 선택적 마이그레이션 (옵션)

- `supabase/migrations/20260428110000_payouts_views.sql` — 매입매출 집계 뷰 `payouts_monthly_view` (선택). 현 SPEC은 Drizzle 동적 SQL로 처리하고 뷰 추가는 후속 옵션.

---

## 5. 기술 접근 (Technical Approach)

### 5.1 상태머신 구현

```ts
// src/lib/payouts/status-machine.ts
export const SETTLEMENT_STATUSES = ['pending', 'requested', 'paid', 'held'] as const;
export type SettlementStatus = typeof SETTLEMENT_STATUSES[number];

export const ALLOWED_TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  pending: ['requested', 'held'],
  requested: ['paid', 'held'],
  paid: [], // 동결
  held: ['requested'], // paid 직접 전환 차단
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export function validateTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): TransitionResult {
  if (from === 'paid') return { ok: false, reason: ERRORS.STATUS_PAID_FROZEN };
  if (from === 'held' && to === 'paid') {
    return { ok: false, reason: ERRORS.STATUS_HELD_TO_PAID_BLOCKED };
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: ERRORS.STATUS_INVALID_TRANSITION };
  }
  return { ok: true };
}
```

전환 그래프는 5개 허용 + 11개 차단으로 명시적. 단위 테스트가 4×4=16 조합 모두 검증.

### 5.2 세율 zod cross-field 검증

```ts
// src/lib/payouts/validation.ts (발췌)
import { z } from 'zod';
import { ERRORS } from './errors';

export const settlementUpdateSchema = z
  .object({
    settlement_flow: z.enum(['corporate', 'government']),
    withholding_tax_rate: z.coerce.number().min(0).max(100),
    business_amount_krw: z.coerce.number().int().min(0),
    instructor_fee_krw: z.coerce.number().int().min(0),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.settlement_flow === 'corporate' && data.withholding_tax_rate !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ERRORS.TAX_RATE_CORPORATE_NONZERO,
        path: ['withholding_tax_rate'],
      });
    }
    if (data.settlement_flow === 'government' &&
        ![3.3, 8.8].includes(data.withholding_tax_rate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ERRORS.TAX_RATE_GOVERNMENT_INVALID,
        path: ['withholding_tax_rate'],
      });
    }
  });
```

cross-field 검증으로 DB CHECK 위반(서버 500)을 form 레이어에서 사전 차단.

### 5.3 GENERATED 컬럼 read-only 정책

DB 페이로드 빌더 (queries.ts)에서 두 GENERATED 컬럼을 명시적으로 제외:

```ts
// src/lib/payouts/queries.ts (UPDATE 페이로드 예시)
const SETTLEMENT_UPDATABLE_COLUMNS = [
  'settlement_flow',
  'status',
  'business_amount_krw',
  'instructor_fee_krw',
  'withholding_tax_rate',
  'payment_received_at',
  'payout_sent_at',
  'tax_invoice_issued',
  'tax_invoice_issued_at',
  'notes',
  'updated_at',
  // ❌ 제외: profit_krw, withholding_tax_amount_krw (GENERATED)
] as const;
```

타입 시스템으로도 강제: `Omit<Settlement, 'profit_krw' | 'withholding_tax_amount_krw'>`로 페이로드 타입 정의.

### 5.4 `markPaid` Server Action 흐름

```
[Server Action: markPaid({ settlementId })]
   ↓
1. fetchSettlement(settlementId) → currentStatus
   ↓
2. validateTransition(currentStatus, 'paid')
   ↓ (ok)
3. UPDATE settlements
     SET status='paid', payment_received_at=now(), updated_at=now()
     WHERE id=$1 AND status='requested'
   (atomic check — affected rows = 0이면 동시성 충돌)
   ↓
4. trg_settlements_status_history 자동 INSERT (DB 트리거)
   ↓
5. revalidatePath('/settlements/[id]') + revalidatePath('/settlements')
   ↓
6. return { ok: true }
```

### 5.5 1-클릭 정산요청 흐름

```
[Server Action: requestSettlement({ settlementId })]
   ↓
1. fetchSettlement(settlementId) → currentStatus, instructorId, projectTitle, amounts
   ↓
2. validateTransition(currentStatus, 'requested')
   ↓ (ok)
3. db.transaction(async (tx) => {
     UPDATE settlements SET status='requested' WHERE id=$1 AND status IN ('pending', 'held')
     -- trigger 자동 INSERT into settlement_status_history
     INSERT INTO notifications (recipient_id, type, title, body, link_url)
       VALUES ($instructorUserId, 'settlement_requested', $title, $body, '/me/payouts')
   })
   ↓
4. console.log("[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>")
   ↓
5. revalidatePath
   ↓
6. return { ok: true }
```

DB 트랜잭션으로 status UPDATE와 notifications INSERT를 원자적으로 결합. 알림 INSERT 실패 시 status도 롤백.

### 5.6 매입매출 집계 SQL

```sql
-- src/lib/payouts/aggregations.ts (Drizzle)
SELECT
  COALESCE(SUM(business_amount_krw), 0) AS business_sum,
  COALESCE(SUM(instructor_fee_krw), 0) AS fee_sum,
  COALESCE(SUM(profit_krw), 0) AS profit_sum,
  COUNT(*) AS count
FROM settlements
WHERE status != 'held'
  AND deleted_at IS NULL
  AND created_at >= $startKst
  AND created_at < $endKst;
```

`held` 제외는 비즈니스 결정 (보류는 분쟁/정지 상태 → 매출 인식 보류).
`deleted_at IS NULL`은 soft delete 표준.
KST 범위 계산은 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 활용.

### 5.7 메일 스텁 정책

본 SPEC은 실제 이메일을 발송하지 않는다. 대신:
- `notifications` 테이블에 `type='settlement_requested'` 행을 INSERT (인앱 알림)
- 콘솔 로그 1줄로 메일 발송 경계 표시 (`[notif] settlement_requested → ...`)
- 향후 SPEC-NOTIFY-001이 이 콘솔 로그를 hook하여 실제 이메일/SMS 발송 어댑터 연결

### 5.8 한국어 + Asia/Seoul

- `src/lib/format/datetime.ts`의 `formatKstDateTime(d: Date)` 재사용
- 모든 status badge / step label / error message는 한국어 상수 (`src/lib/payouts/errors.ts` 단일 출처)
- DB는 `timestamptz` 그대로 저장, 표시 레이어에서만 KST 변환
- KRW 포맷은 `formatKRW` 헬퍼 (기존 `src/lib/utils.ts`) 재사용

### 5.9 동시성 / Stale 보호

상세 페이지에서 두 operator가 동시에 상태 전환 시도 시:
- Server Action의 UPDATE에 `WHERE id=$1 AND status=$expectedFromStatus` 조건 포함
- affected rows = 0이면 한국어 메시지 `"다른 사용자가 먼저 변경했습니다. 새로고침 후 다시 시도하세요."` 반환
- DB 변경 없음

### 5.10 의존성

- 신규 패키지 의존성: 없음
- (이미 있음) `react-hook-form`, `zod`, `drizzle-orm`, `@supabase/ssr` (SPEC-AUTH-001 산출물 재사용)
- (이미 있음) shadcn/ui primitives (SPEC-LAYOUT-001 산출물)
- (이미 있음) `lucide-react` 아이콘
- 추가 마이그레이션: 0개 (SPEC-DB-001 스키마 완비)

---

## 6. UX 흐름 요약 (UX Flow Summary)

### 6.1 정산요청 → 입금확인 (정상 흐름)

1. operator가 사이드바 "정산 관리" 클릭 → `/settlements` 도달
2. 매입매출 위젯에서 이번 달 사업비/강사비/수익 합계 확인
3. 상태 필터에서 `정산 전`만 선택 → 결과 리스트 표시
4. 행 클릭 → `/settlements/<id>` 상세 페이지 진입
5. "정산 요청" 버튼 클릭 → 확인 다이얼로그 → 확정
6. 페이지 새로고침 → status `정산 요청`으로 변경, history 타임라인에 1행 추가
7. 입금 완료 후 다시 상세 진입 → "입금 확인" 버튼 클릭 → status `정산 완료`, payment_received_at 갱신
8. 모든 상태 전환 버튼이 disabled (paid 동결)

### 6.2 보류 토글

1. operator가 정산 전(`pending`) 또는 정산 요청(`requested`) 상태의 상세 페이지에서 "보류" 클릭
2. 한국어 사유 입력 모달 (옵션, notes 컬럼 갱신)
3. status → `held`, history 자동 기록
4. 보류 해제 시 "재요청" 클릭 → status → `requested`

### 6.3 paid 동결 검증

1. status가 `paid`인 정산 상세 진입
2. 모든 상태 전환 버튼이 `disabled={true}`, `aria-disabled="true"`
3. dev tool로 강제 Server Action 호출 시 → `STATUS_PAID_FROZEN` 한국어 에러 반환, DB 변경 없음

### 6.4 매입매출 위젯 기간 변경

1. operator가 위젯 상단 기간 선택기에서 `2026-Q2` 선택
2. URL이 `/settlements?period=2026-Q2`로 갱신
3. 위젯이 4-6월 합계로 갱신 (held 제외, deleted_at 제외)

### 6.5 세율 zod 거부

1. operator가 정산 행 수정 폼에서 흐름 `corporate` 유지하고 원천세율을 `5`로 입력
2. zod superRefine이 cross-field 검증 → `TAX_RATE_CORPORATE_NONZERO` 에러
3. form submit 미실행, 한국어 에러 표시 (`role="alert"`)
4. DB CHECK 위반(서버 500) 사전 차단

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 1-클릭 정산요청 → status 전환 + history 자동 기록 + notifications INSERT + 콘솔 로그
- ✅ 입금확인 → paid + payment_received_at 갱신
- ✅ 보류 토글 (pending → held → requested)
- ✅ paid 동결 (모든 전환 버튼 disabled, Server Action 거부)
- ✅ held → paid 직접 전환 차단 (한국어 에러)
- ✅ 세율 zod 거부 (corporate에 5%, government에 5% 입력)
- ✅ GENERATED 컬럼 read-only 검증 (페이로드 grep으로 확인)
- ✅ 매입매출 위젯 합계 정확 (held 제외, deleted_at 제외)
- ✅ 리스트 필터 (상태/흐름/강사/기간) + 페이지네이션 동작
- ✅ instructor 토큰으로 `/settlements` 접근 → silent redirect
- ✅ axe DevTools 2 페이지 critical 0
- ✅ 단위 테스트 라인 커버리지 ≥ 85% (payouts 모듈)
- ✅ 16개 상태 전환 조합 단위 테스트 PASS

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| GENERATED 컬럼을 INSERT/UPDATE에 포함하여 422 에러 | 운영 실패 | 페이로드 빌더에서 명시적으로 제외 + 타입 시스템(`Omit`)으로 컴파일 타임 강제 + `grep "profit_krw\|withholding_tax_amount_krw" src/lib/payouts/queries.ts` 검증 |
| `held → paid` 우회 시도 (admin force) | 비즈니스 규칙 위반 | 본 SPEC에서는 admin force 미제공. paid 동결과 held→requested 경유는 invariant. 향후 admin override는 별도 SPEC + 감사 로그 필수 |
| 세율 5.5% 같은 임의 값 입력 | DB CHECK 위반 → 서버 500 | zod superRefine cross-field 검증으로 form 레이어 사전 차단. DB CHECK은 2차 방어선 |
| `notifications` INSERT 실패 시 status가 이미 변경됨 | 데이터 불일치 | 트랜잭션으로 묶어 atomic. notifications 실패 시 status도 롤백 |
| 매입매출 위젯이 held 포함하여 수익 부풀려짐 | KPI 왜곡 | SQL에 명시적으로 `status != 'held'` 필터. 단위 테스트로 검증 |
| 동시성 충돌 (두 operator가 동시에 입금확인) | 중복 처리 | UPDATE에 `WHERE status='requested'` 조건 atomic. affected rows=0 시 stale 메시지 |
| KST 기간 경계 계산 실수 (UTC 기준으로 5월 1일을 4월 30일 15:00 UTC로 계산) | 합계 오차 | `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 활용 + 단위 테스트로 월말/분기말 경계 검증 |
| 기존 placeholder UI(`SETTLEMENT_STATUS_LABEL` import from `@/lib/projects`)와 신규 모듈 충돌 | 빌드 에러 | `src/lib/payouts/index.ts`에서 backward re-export 또는 `src/lib/projects` 정리 (M1에서 처리) |
| 콘솔 로그 형식이 SPEC-NOTIFY-001 어댑터 hook과 불일치 | 후속 SPEC 통합 실패 | 정확한 형식 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` 명시. SPEC-NOTIFY-001 참조 |
| GENERATED 컬럼 공식 변경(SPEC-DB-001 변경) 시 `tax-calculator.ts` 동기화 누락 | 표시 불일치 | 단위 테스트로 DB GENERATED 결과와 `computeWithholdingTaxAmount` 결과 일치 검증 |
| paid 상태에서 `deleted_at`로 soft-delete 시 매입매출 집계에서 제외 | 회계 누락 가능 | 본 SPEC에서는 soft-delete UI 미제공. 향후 admin SPEC에서 신중히 결정 (회계 보존 vs 삭제) |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: F-205 정산 관리, §시나리오, §5 KPI (월 정산 처리 시간 50% 단축)
- `.moai/project/structure.md`: `src/lib/payouts/`, `(operator)/settlements/` 디렉토리 설계
- `.moai/project/tech.md`: Drizzle ORM 트랜잭션, Supabase RLS 활용 패턴
- `.moai/specs/SPEC-DB-001/spec.md`: `settlements` 테이블 + CHECK 제약 + GENERATED 컬럼 + 트리거 + RLS
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole(['operator', 'admin'])`, silent redirect
- `.moai/specs/SPEC-LAYOUT-001/spec.md`: 운영자 사이드바 Settlements 메뉴, UI 프리미티브
- `.moai/specs/SPEC-PROJECT-001/spec.md`: 정산 단계 진입 흐름 (`task_done` 트랜잭션)
- `.moai/specs/SPEC-ME-001/spec.md`: 강사 본인 정산 조회 화면 (`/me/payouts`)
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 (정상/차단/세율/위젯)
- [`plan.md`](./plan.md): 마일스톤 분해 + RED-GREEN-REFACTOR 사이클
- 외부 (verified 2026-04-28):
  - https://www.postgresql.org/docs/current/ddl-generated-columns.html (GENERATED ALWAYS STORED)
  - https://orm.drizzle.team/docs/transactions
  - https://www.w3.org/WAI/WCAG21/quickref/

---

_End of SPEC-PAYOUT-001 spec.md_

## Implementation Notes (2026-04-28, v1.0.0)

### 구현 결과
- **마이그레이션 0건** — `settlements` 스키마 + CHECK 제약 + 트리거(history 자동 기록) 모두 SPEC-DB-001에서 완비
- **신규 모듈** (`src/lib/payouts/`): types/errors/constants/status-machine/tax-calculator/validation/queries/aggregations/mail-stub/list-query (11파일) + `index.ts` barrel
- **단위 테스트**: 46건 PASS (status 16조합 100% 커버, 세율 DB 공식 정합 검증)
- **Server Actions**: `[id]/{request, mark-paid, hold, unhold}/actions.ts` 4종
- **페이지**: 리스트(필터+위젯+페이지네이션) + 상세(stepper + actions-panel)
- **GENERATED 컬럼 보호**: `sanitizePayload` 화이트리스트 + grep 회귀 가드
- **메일 스텁**: 콘솔 로그 형식 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` + notifications insert (SPEC-NOTIFY-001 후속 hook 식별자)

### MX 태그 추가
- `@MX:ANCHOR` `validateTransition` (status-machine, fan_in 4)
- `@MX:ANCHOR` `validateTaxRate` + `calculateWithholdingAmount` (tax-calculator, DB 공식 동기화)
- `@MX:ANCHOR` `queries.ts` settlements CRUD 단일 통로
- `@MX:WARN` `sanitizePayload` GENERATED 컬럼 INSERT/UPDATE 차단
- `@MX:NOTE` `mail-stub.ts` SPEC-NOTIFY-001 hook 식별자

### Deferred Items
| 항목 | 이유 | 후속 |
|---|---|---|
| 강사 combobox 필터 | UX 폴리시 | M5 후속 |
| 상세 컴포넌트 분리 (`src/components/payouts/*`) | MVP 인라인 우선 | M9 polish |
| 통합 테스트 (DB-backed) | 시드 의존, 본 PR 범위 외 | SPEC-E2E-001 합류 |
| a11y axe 매뉴얼 검증 | M9 단계 | 후속 |

### 품질 게이트 결과
- typecheck: 0 errors
- lint: 0 errors / 0 warnings (payouts 영역)
- test:unit: 46/46 PASS
