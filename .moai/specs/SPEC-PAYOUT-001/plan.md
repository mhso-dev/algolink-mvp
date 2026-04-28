# SPEC-PAYOUT-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 본 SPEC은 `quality.development_mode: tdd`에 따라 manager-tdd 에이전트가 RED-GREEN-REFACTOR 사이클로 진행한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 (`status: completed`) — `settlements`, `settlement_status_history` 테이블 + CHECK 제약 + GENERATED 컬럼 + 트리거 `trg_settlements_status_history` + RLS 5개 정책 + 인덱스 5개 모두 적용됨. `notification_type` ENUM에 `settlement_requested` 값 사전 포함.
- ✅ SPEC-AUTH-001 완료 (`status: completed`) — `(operator)/layout.tsx`에서 `requireRole(['operator', 'admin'])` 가드 동작, `requireUser()` / `getCurrentUser()` 헬퍼 사용 가능, JWT custom claim에 `role` 주입됨
- ✅ SPEC-LAYOUT-001 완료 (`status: implemented`) — `<AppShell userRole>` 컴포넌트, 운영자 사이드바 5종 메뉴 (Settlements 포함, 현재 placeholder), UI 프리미티브 11종, 디자인 토큰
- ✅ SPEC-PROJECT-001 완료 (`status: completed`) — 프로젝트 task_done 흐름 검증, `formatKRW` 유틸리티 패턴 정착
- ✅ SPEC-ME-001 M5/M7 완료 — 강사 본인 정산 조회 화면 `/me/payouts` 존재 (link_url placeholder 검증 가능)
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩
- ✅ 기존 placeholder `src/app/(app)/(operator)/settlements/page.tsx` (SPEC-LAYOUT-001/SPEC-DASHBOARD-001 산출) — M2에서 본격 리스트 페이지로 확장

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (타입 + errors + 기존 placeholder 정리) → 모든 후속 마일스톤의 선행
- M2 (도메인 순수 함수: status-machine + tax-calculator) → M3·M4·M6의 선행
- M3 (DB 쿼리 레이어 + queries.ts + aggregations.ts + list-query.ts) → M4·M5·M7의 선행
- M4 (Server Actions: request / mark-paid / hold) → M5 (UI 컴포넌트)·M7 (페이지 와이어링)의 선행
- M5 (UI 컴포넌트) → M7 (페이지 와이어링)의 선행
- M6 (mail-stub 모듈) → M4 requestSettlement action의 일부, 병렬 가능
- M7 (페이지 와이어링: list 확장 + detail 신규) → M8 (통합 테스트)의 선행
- M8 (통합 테스트 + 시나리오 1-7) → M9 (a11y)의 선행

### 1.3 후속 SPEC을 위한 산출물 약속

- `validateTransition(from, to)` 4-state 전환 그래프는 SPEC-PAYOUT-AUTOGEN-XXX이 자동 생성 시 status 검증에 재사용
- `sendSettlementRequestStub` 콘솔 로그 형식 `[notif] settlement_requested → ...`은 SPEC-NOTIFY-001 어댑터 첫 hook
- `MonthlyAggregate` 타입 + `aggregations.ts` 쿼리는 SPEC-DASHBOARD-EXTENDED-XXX 매출 차트의 데이터 소스
- `validateTaxRate` + `computeWithholdingTaxAmount`는 SPEC-PAYOUT-INVOICE-XXX 세금계산서 발행 시 동일 공식 사용
- `payouts/queries.ts` UPDATABLE_COLUMNS 패턴은 SPEC-PAYOUT-CREATE-XXX 신규 등록 폼이 동일 GENERATED 제외 정책 채택

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 타입 + errors + 기존 placeholder 정리 [Priority: High]

**산출물:**
- TypeScript 타입 정의:
  - `src/lib/payouts/types.ts`:
    ```ts
    export const SETTLEMENT_STATUSES = ['pending', 'requested', 'paid', 'held'] as const;
    export type SettlementStatus = typeof SETTLEMENT_STATUSES[number];
    export const SETTLEMENT_FLOWS = ['corporate', 'government'] as const;
    export type SettlementFlow = typeof SETTLEMENT_FLOWS[number];
    export type Settlement = { /* DB row 타입 (모든 컬럼 포함, GENERATED 포함) */ };
    export type SettlementUpdatePayload = Omit<Settlement,
      'id' | 'created_at' | 'created_by' | 'profit_krw' | 'withholding_tax_amount_krw'>;
    export type MonthlyAggregate = {
      businessSum: number;
      feeSum: number;
      profitSum: number;
      count: number;
    };
    ```
- 한국어 에러 단일 출처:
  - `src/lib/payouts/errors.ts` — 8종 한국어 메시지 상수:
    ```ts
    export const ERRORS = {
      STATUS_PAID_FROZEN: "정산 완료된 항목은 변경할 수 없습니다.",
      STATUS_HELD_TO_PAID_BLOCKED: "보류 상태에서는 정산 완료로 직접 전환할 수 없습니다. 정산 요청으로 먼저 복귀하세요.",
      STATUS_NEED_REQUESTED: "정산 요청 상태에서만 입금 확인이 가능합니다.",
      STATUS_INVALID_TRANSITION: "허용되지 않은 상태 전환입니다.",
      TAX_RATE_CORPORATE_NONZERO: "기업 정산은 원천세율이 0%여야 합니다.",
      TAX_RATE_GOVERNMENT_INVALID: "정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다.",
      MAIL_STUB_FAILED: "정산 요청 알림 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      SETTLEMENT_NOT_FOUND: "정산 정보를 찾을 수 없습니다.",
      STALE_TRANSITION: "다른 사용자가 먼저 변경했습니다. 새로고침 후 다시 시도하세요.",
    } as const;
    ```
- 기존 placeholder 정리:
  - `src/lib/projects/SETTLEMENT_STATUS_LABEL` 등 기존 라벨이 어디서 import되는지 grep 확인
  - `src/lib/payouts/index.ts`에서 `SETTLEMENT_STATUS_LABEL`, `settlementStatusBadgeVariant` re-export하여 backward 호환
  - 또는 기존 placeholder가 `@/lib/projects`에서 import하는 부분을 `@/lib/payouts`로 점진 이전 (M7에서 처리)

**검증:**
- `pnpm tsc --noEmit` 0 type 에러
- `grep -rn "SETTLEMENT_STATUS_LABEL" src/` 결과 모두 해석 가능

**연관 EARS:** REQ-PAYOUT-STATUS-001 (타입 export), 한국어 에러 cross-cutting

---

### M2 — 도메인 순수 함수 (RED → GREEN) [Priority: High]

**TDD 사이클: RED — 실패하는 테스트 먼저 작성**

**산출물 (테스트 먼저):**

- `src/lib/payouts/__tests__/status-machine.test.ts` — 16개 from×to 케이스:
  - **허용 5건 (ok=true):**
    - `pending → requested`, `pending → held`, `requested → paid`, `requested → held`, `held → requested`
  - **차단 11건 (ok=false + 한국어 reason 검증):**
    - `pending → pending` (self), `pending → paid` (직접)
    - `requested → requested` (self), `requested → pending` (역행)
    - `paid → *` (4건 모두 `STATUS_PAID_FROZEN`)
    - `held → held` (self), `held → pending` (역행), `held → paid` (`STATUS_HELD_TO_PAID_BLOCKED`)
- `src/lib/payouts/__tests__/tax-calculator.test.ts`:
  - `validateTaxRate('corporate', 0)` → ok
  - `validateTaxRate('corporate', 5)` → reason `TAX_RATE_CORPORATE_NONZERO`
  - `validateTaxRate('government', 3.30)` → ok
  - `validateTaxRate('government', 8.80)` → ok
  - `validateTaxRate('government', 5.00)` → reason `TAX_RATE_GOVERNMENT_INVALID`
  - `validateTaxRate('government', 0)` → reason `TAX_RATE_GOVERNMENT_INVALID`
  - `computeWithholdingTaxAmount(3000000, 3.30)` === `floor(3000000 * 3.30 / 100)` === `99000`
  - `computeWithholdingTaxAmount(3000000, 8.80)` === `264000`
  - `computeWithholdingTaxAmount(5000000, 0)` === `0`
- `src/lib/payouts/__tests__/validation.test.ts`:
  - corporate + rate=0 + 정상 금액 → parse OK
  - corporate + rate=5 → zod issue with `TAX_RATE_CORPORATE_NONZERO` at path `withholding_tax_rate`
  - government + rate=3.30 → parse OK
  - government + rate=5.00 → zod issue with `TAX_RATE_GOVERNMENT_INVALID`
  - business_amount_krw = -1 → min(0) 위반

**TDD 사이클: GREEN — 테스트 통과시키는 최소 구현**

**산출물 (구현):**
- `src/lib/payouts/status-machine.ts`:
  - `SETTLEMENT_STATUSES`, `ALLOWED_TRANSITIONS`, `validateTransition`
  - `// @MX:ANCHOR: validateTransition — settlement status state machine`
  - `// @MX:REASON: fan_in 4 (request/markPaid/hold/resume actions). 전환 그래프 변경 시 paid/held 동결 우회 위험.`
- `src/lib/payouts/tax-calculator.ts`:
  - `validateTaxRate(flow, rate): TransitionResult`
  - `computeWithholdingTaxAmount(fee, ratePercent): number`
- `src/lib/payouts/validation.ts`:
  - `settlementUpdateSchema` zod with `superRefine` cross-field 검증

**TDD 사이클: REFACTOR — 중복 제거, 가독성 개선**

- `src/lib/payouts/constants.ts` — `GOVERNMENT_TAX_RATES = [3.30, 8.80] as const` 추출
- TypeScript exhaustiveness check (switch with `never` default) for status mapping

**검증:**
- `pnpm vitest run src/lib/payouts/__tests__` — 모든 테스트 PASS
- `pnpm vitest --coverage src/lib/payouts/status-machine.ts src/lib/payouts/tax-calculator.ts` — 라인 커버리지 ≥ 95%
- 모든 함수가 React/Next/Supabase/Drizzle import 0건 (순수성 검증)

**연관 EARS:** REQ-PAYOUT-STATUS-001~004, REQ-PAYOUT-TAX-001~004

---

### M3 — DB 쿼리 레이어 (Drizzle) + 집계 [Priority: High]

**산출물:**

- `src/lib/payouts/queries.ts`:
  - `listSettlements(filters, page): { items, total }` (SELECT join projects + instructors_safe)
  - `getSettlementById(id): Settlement | null` (deleted_at IS NULL 필터)
  - `transitionSettlementStatus(id, expectedFrom, to): { ok, error? }` — atomic UPDATE with status condition
  - `markPaid(id): { ok, error? }` — UPDATE status='paid', payment_received_at=now() WHERE status='requested'
  - `holdSettlement(id, currentStatus): { ok, error? }` — UPDATE status='held' WHERE status IN ('pending', 'requested')
  - `resumeSettlement(id): { ok, error? }` — UPDATE status='requested' WHERE status='held'
  - **모든 UPDATE 페이로드에서 `profit_krw`, `withholding_tax_amount_krw` 명시적 제외** (GENERATED 보호)
  - `SETTLEMENT_UPDATABLE_COLUMNS` 상수로 화이트리스트 관리
- `src/lib/payouts/list-query.ts`:
  - `parseListParams(searchParams): { status[], flow, instructorId, period, page }` URL 파라미터 파싱
  - `buildListQuery(filters)` → Drizzle where chain
  - 페이지네이션 헬퍼 (page over-flow 시 마지막 유효 페이지)
- `src/lib/payouts/aggregations.ts`:
  - `computeMonthlyAggregate(period: string, basis: 'created' | 'payment'): Promise<MonthlyAggregate>`
  - SQL: `SELECT SUM(business_amount_krw), SUM(instructor_fee_krw), SUM(profit_krw), COUNT(*) FROM settlements WHERE status != 'held' AND deleted_at IS NULL AND created_at >= $start AND created_at < $end`
  - KST 경계 계산 헬퍼 (`Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` 활용)

**TDD 사이클:**
- RED: integration test `src/lib/payouts/__tests__/aggregations.test.ts`:
  - held 행 1건 + non-held 행 2건 → 합계는 non-held 2건만
  - deleted_at 설정된 행은 제외
  - 5월 1일 KST 00:00 경계에 created_at 행 → 5월 합계에 포함 (4월 X)
  - 분기 Q2 (4-6월) 합계 검증
- GREEN: 쿼리 함수 구현
- REFACTOR: drizzle relational query syntax 통일, KST 경계 헬퍼 추출

**검증:**
- `pnpm vitest run src/lib/payouts/__tests__/aggregations.test.ts` PASS
- `grep "profit_krw\|withholding_tax_amount_krw" src/lib/payouts/queries.ts | grep -v "SELECT\|select\|from\|return\|type"` → INSERT/UPDATE 컨텍스트에 0건
- atomic concurrency: 동일 settlement_id에 동시 markPaid 호출 시 한쪽만 성공 (affected rows 검증)

**연관 EARS:** REQ-PAYOUT-LIST-001~007, REQ-PAYOUT-DETAIL-001~002, REQ-PAYOUT-STATUS-005~007, REQ-PAYOUT-AGGREGATE-001~005, REQ-PAYOUT-RLS-002, -004

---

### M4 — Server Actions [Priority: High]

**산출물:**

- `src/app/(app)/(operator)/settlements/[id]/request/actions.ts`:
  - `requestSettlement({ settlementId }): Promise<{ ok, error? }>`
  - 단계: requireUser → fetchSettlement → validateTransition('requested') → db.transaction(UPDATE + sendSettlementRequestStub) → console.log → revalidatePath
- `src/app/(app)/(operator)/settlements/[id]/mark-paid/actions.ts`:
  - `markPaid({ settlementId }): Promise<{ ok, error? }>`
  - 단계: requireUser → validateTransition('paid') → atomic UPDATE → revalidatePath
- `src/app/(app)/(operator)/settlements/[id]/hold/actions.ts`:
  - `holdSettlement({ settlementId, notes? }): Promise<{ ok, error? }>`
  - `resumeSettlement({ settlementId }): Promise<{ ok, error? }>` — held → requested
  - 단계: requireUser → validateTransition('held'/'requested') → UPDATE → revalidatePath

**TDD 사이클:**
- RED: integration test `src/app/(app)/(operator)/settlements/__tests__/integration.test.ts`에서 시나리오 1, 2, 3, 4 부분 검증
- GREEN: 액션 구현
- REFACTOR: 에러 핸들링 통일, 한국어 메시지 모두 `errors.ts` 경유

**검증:**
- 단위/통합 테스트 PASS
- `console.log("[notif] settlement_requested → ...")` 출력 확인 (vi.spyOn으로 검증)
- DB row 갱신 확인
- atomic UPDATE 검증: status가 expected와 다를 때 affected rows = 0 → stale 메시지

**연관 EARS:** REQ-PAYOUT-MAIL-001~004, REQ-PAYOUT-STATUS-005~006, REQ-PAYOUT-DETAIL-002

---

### M5 — UI 컴포넌트 (shadcn/ui) [Priority: High]

**산출물:**

- `src/components/payouts/SettlementStatusBadge.tsx` — 4단계 한국어 라벨 + semantic color
  - `pending` → `정산 전` (neutral)
  - `requested` → `정산 요청` (warning)
  - `paid` → `정산 완료` (success)
  - `held` → `보류` (destructive)
- `src/components/payouts/SettlementFlowBadge.tsx` — `corporate` → "기업" / `government` → "정부"
- `src/components/payouts/SettlementStatusStepper.tsx` — 4단계 horizontal stepper, `aria-current="step"` for active
  - main flow: 정산 전 → 정산 요청 → 정산 완료
  - 보류 branch: held 상태일 때 별도 표시
- `src/components/payouts/SettlementFiltersBar.tsx` — 상태 multi-select, flow select, instructor combobox, period selector (month/quarter/year)
- `src/components/payouts/RevenueWidget.tsx` — 매입매출 합계 카드 (사업비/강사비/수익 KRW 표시 + 정산 건수)
- `src/components/payouts/SettlementActionsPanel.tsx` — 상태 전환 버튼 그룹
  - "정산 요청" (pending → requested), 확인 다이얼로그
  - "입금 확인" (requested → paid), 확인 다이얼로그
  - "보류" (pending/requested → held)
  - "재요청" (held → requested)
  - paid 상태일 때 모든 버튼 `disabled` + `aria-disabled="true"`
- `src/components/payouts/SettlementHistoryList.tsx` — `settlement_status_history` 타임라인 (changed_at + from→to + changed_by display_name)
- `src/components/payouts/SettlementSummaryHeader.tsx` — 상세 페이지 요약 (프로젝트·강사·흐름·상태)
- `src/components/payouts/SettlementAmountTable.tsx` — 금액 상세 (사업비/강사비/수익/원천세율/원천세 금액/세금계산서 여부)

**TDD 사이클:**
- 컴포넌트 단위 테스트는 통합 시나리오에서 DOM 검증으로 대체
- Storybook stories 추가 (옵션, SPEC-LAYOUT-001 패턴 따름)

**검증:**
- 모든 컴포넌트 키보드 only 조작 가능
- 상태 전환 버튼이 paid 상태에서 disabled
- `<Label htmlFor>` 연결, `aria-invalid`, `aria-describedby` 적용

**연관 EARS:** REQ-PAYOUT-LIST-002, REQ-PAYOUT-DETAIL-001~004, REQ-PAYOUT-STATUS-007~008, REQ-PAYOUT-AGGREGATE-001

---

### M6 — Mail Stub 모듈 [Priority: High] [병렬 가능]

**산출물:**

- `src/lib/payouts/mail-stub.ts`:
  ```ts
  export async function sendSettlementRequestStub(params: {
    settlementId: string;
    instructorId: string;
    projectTitle: string;
    amounts: { business: number; fee: number; profit: number; tax: number };
  }, supabase: SupabaseClient): Promise<{ ok: boolean }> {
    // 1. instructor_id → user_id 조회 (instructors 테이블)
    // 2. notifications INSERT (recipient_id, type='settlement_requested', title, body, link_url='/me/payouts')
    // 3. console.log("[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>")
    // 4. return { ok: true } 또는 { ok: false }
  }
  ```

**TDD 사이클:**
- RED: `src/lib/payouts/__tests__/mail-stub.test.ts`:
  - 정상 케이스: notifications INSERT 1건 + console.log 캡처
  - notifications INSERT 실패 → `{ ok: false }` 반환
  - 콘솔 로그 형식 정확 검증 (정규식: `^\[notif\] settlement_requested → instructor_id=[\w-]+ settlement_id=[\w-]+$`)
- GREEN: 구현
- REFACTOR: title/body 템플릿 상수 추출

**검증:**
- 정상 + 실패 양 경로 검증
- 콘솔 로그 형식 정확성

**연관 EARS:** REQ-PAYOUT-MAIL-003, -004

---

### M7 — 페이지 와이어링 [Priority: High]

**산출물:**

- `src/app/(app)/(operator)/settlements/page.tsx` — **변경**: 기존 placeholder 확장
  - RSC로 `listSettlements` + `computeMonthlyAggregate` 호출
  - `<SettlementFiltersBar>` + `<RevenueWidget>` + `<SettlementsTable>` + 페이지네이션
  - 기존 "일괄 정산 요청" 버튼 disabled 유지 (Out of Scope)
- `src/app/(app)/(operator)/settlements/[id]/page.tsx` — **신규**:
  - RSC, `getSettlementById` + `requireUser`
  - `<SettlementSummaryHeader>` + `<SettlementStatusStepper>` + `<SettlementAmountTable>` + `<SettlementHistoryList>` + `<SettlementActionsPanel>`
  - notFound() 호출 (deleted_at OR not found)

**검증:**
- 모든 페이지가 `(operator)/layout.tsx` 가드 통과 (operator/admin만)
- `notFound()` 동작 (id 없음 또는 soft-deleted)
- 기존 placeholder의 SETTLEMENT_STATUS_LABEL 호환 유지

**연관 EARS:** REQ-PAYOUT-LIST-001, REQ-PAYOUT-DETAIL-001~002, REQ-PAYOUT-RLS-001

---

### M8 — 통합 테스트 + 시나리오 1-7 [Priority: High]

**산출물:**

- `src/app/(app)/(operator)/settlements/__tests__/integration.test.ts`:
  - 시나리오 1 (정산요청 1-클릭) — status 전환 + history 자동 기록 + notifications INSERT + 콘솔 로그
  - 시나리오 2 (입금확인) — paid + payment_received_at
  - 시나리오 3 (보류 토글) — pending → held → requested
  - 시나리오 4 (paid 동결) — 모든 상태 전환 거부
  - 시나리오 5 (매입매출 위젯) — held 제외, deleted_at 제외 합계
  - 시나리오 6 (세율 zod 거부) — corporate에 5%, government에 5%
  - 시나리오 7 (instructor silent redirect) — Playwright 또는 next-test-utils
- `src/app/(app)/(operator)/settlements/__tests__/edge.test.ts`:
  - EC-1: held → paid 직접 전환 차단
  - EC-2: 동시성 (두 operator가 동시에 markPaid)
  - EC-3: 매입매출 위젯 KST 월말 경계 (`2026-04-30T23:59:59+09:00` vs `2026-05-01T00:00:00+09:00`)
  - EC-4: GENERATED 컬럼 INSERT 시도 → 422 (DB 방어선 검증)
  - EC-5: instructor가 RLS 통과한 본인 settlement 조회 (`settlements_self_select` 정책)
  - EC-6: 페이지네이션 over-flow (`?page=999` → 마지막 유효 페이지로 redirect)
- 테스트 환경:
  - 로컬 Supabase + `supabase db reset` 사이클
  - notifications INSERT는 실제 DB에 (모킹 X)

**검증:**
- 모든 시나리오 PASS
- 모든 EC PASS
- 콘솔 로그 캡처 검증

**연관 EARS:** acceptance.md 시나리오 1-7 + EC-1~6

---

### M9 — 접근성 + 한국어 단일 출처 [Priority: Medium]

**산출물:**

- 2 페이지 (`/settlements`, `/settlements/<id>`)에 axe DevTools 적용
- 발견된 critical/serious 이슈 0건 도달
- 키보드 only 흐름 매뉴얼 검증 (Tab → Enter → Esc)
- 한국어 메시지 단일 출처 검증:
  - `grep -rn "정산 완료\|보류\|정산 요청\|기업 정산\|정부 정산" src/app/(app)/(operator)/settlements src/components/payouts | grep -v "errors.ts\|formatters.ts"` 결과 모두 라벨 컴포넌트 경유

**검증:**
- axe report 첨부
- 인라인 한국어 문자열 0건 (모두 errors.ts / 라벨 컴포넌트 경유)

**연관 EARS:** REQ-PAYOUT-DETAIL-003 (KST 표시), 한국어 cross-cutting

---

### M10 — Definition of Done 정리 + 문서화 [Priority: Medium]

**산출물:**

- `src/lib/payouts/index.ts` — barrel export 정리 (외부 import 단일 진입점)
- 기존 `src/lib/projects`의 `SETTLEMENT_STATUS_LABEL`을 `src/lib/payouts`로 완전 이전 (backward export 정리)
- `pnpm test:unit` 스크립트에 `src/lib/payouts/__tests__` 경로 등록 (이미 포함이라면 skip)
- `pnpm test:unit` 스크립트에 `src/app/(app)/(operator)/settlements/__tests__` 경로 등록
- README 또는 CHANGELOG 업데이트는 `/moai sync` 단계에서 manager-docs가 처리

**검증:**
- `pnpm test:unit` 통합 PASS
- `grep -rn "@/lib/projects" src/ | grep -i "settlement"` → 0 hit (이전 완료 검증)

**연관 EARS:** cross-cutting

---

## 3. RED-GREEN-REFACTOR 적용 가이드

### 3.1 마일스톤 별 사이클 매핑

| 마일스톤 | RED (실패 테스트) | GREEN (최소 구현) | REFACTOR (개선) |
|----------|------------------|-------------------|------------------|
| M2 | unit test 30+ (status-machine 16 + tax-calculator 9 + validation 5) | 순수 함수 4개 (validateTransition, validateTaxRate, computeWithholdingTaxAmount, settlementUpdateSchema) | constants 추출 (GOVERNMENT_TAX_RATES), exhaustiveness check |
| M3 | integration test 4개 (RLS + atomic UPDATE + held 제외 합계 + KST 경계) | 쿼리 함수 7개 + 집계 1개 | drizzle relational syntax 통일, KST 헬퍼 추출 |
| M4 | integration scenario test 4개 | Server Action 4개 (request/markPaid/hold/resume) | 에러 메시지 추출, 트랜잭션 헬퍼 통일 |
| M6 | unit test 3개 (정상/실패/로그 형식) | mail-stub 1개 함수 | 템플릿 상수 추출 |
| M8 | E2E scenario 7 + EC 6 | (M3-M7의 산출물이 모두 통과해야 함) | flake 제거, fixture 정리 |

### 3.2 매 사이클 종료 시 검증

- 모든 테스트가 GREEN인지 확인 (`pnpm vitest run`)
- 새로 추가된 코드의 라인 커버리지가 임계값 이상
- TypeScript `--strict` + `--noEmit` 통과
- ESLint critical 0
- 새 코드의 한국어 사용자 메시지가 단일 출처(`src/lib/payouts/errors.ts`)에 등록됨
- GENERATED 컬럼이 INSERT/UPDATE 페이로드에 포함되지 않음 (grep 검증)

---

## 4. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| GENERATED 컬럼을 INSERT/UPDATE 페이로드에 포함 → 422 | 운영 실패 | `SETTLEMENT_UPDATABLE_COLUMNS` 화이트리스트 + `Omit<Settlement, 'profit_krw' \| 'withholding_tax_amount_krw'>` 타입 강제 + grep 검증 |
| 세율 cross-field 검증 zod superRefine 누락으로 DB CHECK 위반 | 서버 500 | M2 zod 스키마 단위 테스트로 corporate(0/5) + government(3.30/8.80/5) 5케이스 검증 + DB CHECK은 2차 방어선 |
| `held → paid` 우회 시도 | 비즈니스 규칙 위반 | M2 status-machine 단위 테스트 16/16 케이스 + M4 Server Action에서 validateTransition 필수 호출 |
| `notifications` INSERT 실패 시 status가 이미 변경됨 | 데이터 불일치 | M4 db.transaction으로 묶어 atomic. 단위 테스트로 롤백 검증 |
| 매입매출 위젯이 held/deleted_at 포함 → 합계 부풀려짐 | KPI 왜곡 | M3 SQL에 명시적 `status != 'held' AND deleted_at IS NULL` + M3 단위 테스트로 검증 |
| 동시성 충돌 (두 operator 동시 markPaid) | 중복 처리 | M3 atomic UPDATE의 `WHERE status='requested'` 조건 + affected rows=0 시 STALE_TRANSITION 메시지 |
| KST 경계 계산 실수 (UTC 기준) | 합계 오차 | M3 `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })` + M3 단위 테스트로 월말/분기말 경계 검증 |
| 기존 placeholder의 `SETTLEMENT_STATUS_LABEL` import 경로 변경 시 빌드 깨짐 | 빌드 실패 | M1에서 `src/lib/payouts/index.ts` backward export로 완충 + M10에서 점진 이전 완료 |
| 콘솔 로그 형식이 SPEC-NOTIFY-001 hook과 불일치 | 후속 통합 실패 | 정확한 형식 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` 명시 + M6 정규식 검증 |
| `tax-calculator.ts` 공식과 DB GENERATED 공식 불일치 | 표시 오류 | M2 단위 테스트로 corporate(0)/government(3.30, 8.80) × 다양한 fee 값에서 DB GENERATED 결과와 일치 검증 |
| 통합 테스트가 mock-heavy로 실제 동작 미검증 | 통합 시 실패 | M8에서 실제 Supabase + 실제 트리거 + 실제 RLS 조합으로 검증 |
| Server Action 응답 후 stale 캐시 (revalidatePath 누락) | UI 갱신 안 됨 | 모든 mutation 액션 끝에 `revalidatePath('/settlements/[id]')` + `revalidatePath('/settlements')` 명시. ESLint custom rule 또는 코드 리뷰 체크 |
| paid 상태에서 admin이 force unblock 요구 | 비즈니스 결정 | 본 SPEC에서 admin force 미제공. 향후 SPEC-PAYOUT-ADMIN-XXX에서 감사 로그 동반 force 추가 |
| `settlement_status_history` 트리거가 force=true 우회 시에도 정확히 기록 | 감사 무결성 | SPEC-DB-001 트리거는 컬럼 변경에만 반응 → 모든 status 변경 자동 기록. force 우회 여부와 무관 |

---

## 5. Definition of Done (DoD)

본 SPEC이 `status: completed`로 전환되기 위한 체크리스트:

- [ ] M1 — 타입 + errors 8종 + 기존 placeholder 정리 완료
- [ ] M2 — 도메인 순수 함수 4개 + 단위 테스트 30+ 모두 PASS, 라인 커버리지 ≥ 95%
- [ ] M3 — DB 쿼리 7개 + 집계 1개 + RLS/atomic 통합 테스트 4개 PASS
- [ ] M4 — Server Action 4개 (request/markPaid/hold/resume) 동작
- [ ] M5 — UI 컴포넌트 9개 키보드 접근 가능
- [ ] M6 — sendSettlementRequestStub 정상 + 실패 + 로그 형식 검증
- [ ] M7 — 2개 페이지(`page`, `[id]`) 모두 가드 통과 + 기존 placeholder 호환
- [ ] M8 — acceptance.md 시나리오 1-7 + EC-1~6 모두 PASS
- [ ] M9 — axe critical 0 / 한국어 단일 출처 검증
- [ ] M10 — barrel export 정리 + `pnpm test:unit` 통합
- [ ] `pnpm build` / `pnpm tsc --noEmit` / `pnpm exec eslint` 0 error
- [ ] `pnpm vitest run` 모든 테스트 PASS
- [ ] `supabase db reset` 무오류 (마이그레이션 변경 0개이므로 기존 검증 유지)
- [ ] `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_SECRET_KEY" src/lib/payouts src/app/(app)/(operator)/settlements` → 0 hit
- [ ] `grep -E "INSERT.*profit_krw|UPDATE.*profit_krw|INSERT.*withholding_tax_amount" src/lib/payouts` → 0 hit (GENERATED 보호 검증)
- [ ] 콘솔 로그 형식 검증: `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` 정확 출력
- [ ] 4×4=16 상태 전환 조합 단위 테스트 모두 PASS
- [ ] 세율 검증 9개 케이스 단위 테스트 모두 PASS
- [ ] 매입매출 위젯 합계가 held + deleted_at을 정확히 제외함을 SQL 결과로 검증
- [ ] `.moai/specs/SPEC-PAYOUT-001/spec.md` `status` 필드를 `draft` → `completed`로 업데이트
- [ ] HISTORY 항목에 완료 시점 entry 추가

---

## 6. 후속 SPEC 진입점 (Next Steps After Completion)

본 SPEC 완료 후 다음 SPEC들이 활성화 가능:

- **SPEC-NOTIFY-001**: 이메일/SMS/카카오 어댑터 — `[notif] settlement_requested → ...` 콘솔 로그를 hook하여 실제 발송
- **SPEC-PAYOUT-AUTOGEN-XXX**: 프로젝트 `task_done` 전환 시 `settlements` 행 자동 생성 트리거
- **SPEC-PAYOUT-CREATE-XXX**: 정산 행 신규 등록 폼 (`/settlements/new`)
- **SPEC-PAYOUT-BULK-XXX**: 정산 일괄 처리 (현재 disabled인 "일괄 정산 요청" 버튼 활성화)
- **SPEC-PAYOUT-INVOICE-XXX**: 국세청 세금계산서 발행 API 연동 (e세로 / Popbill)
- **SPEC-PAYOUT-BANKING-XXX**: 전자 송금 / 은행 OpenAPI 연동
- **SPEC-PAYOUT-PDF-XXX**: 정산 명세서 PDF 출력
- **SPEC-DASHBOARD-EXTENDED-XXX**: 매출 추이 차트 (월/분기/연 그래프)
- **SPEC-PAYOUT-ADMIN-XXX**: admin 전용 force unblock + soft-delete 관리

---

_End of SPEC-PAYOUT-001 plan.md_
