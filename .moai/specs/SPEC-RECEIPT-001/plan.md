# SPEC-RECEIPT-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 본 SPEC은 `quality.development_mode: tdd`에 따라 manager-tdd 에이전트가 RED-GREEN-REFACTOR 사이클로 진행한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 (`status: completed`) — `settlements` 테이블 + `settlement_flow` enum + `notification_type` enum + `files` 테이블 + RLS 정책 모두 적용
- ✅ SPEC-AUTH-001 완료 — `(operator)/layout.tsx`, `(instructor)/layout.tsx` 가드 + `requireUser()` / `getCurrentUser()` 헬퍼
- ✅ SPEC-PAYOUT-001 완료 — 4-state 상태 머신 + `validateTransition` + paid-freeze 인배리언트 + `errors.ts` 단일 출처 + `(operator)/settlements/` 라우트
- ✅ SPEC-ME-001 M5/M7/M8 완료 — `(instructor)/me/payouts/[id]` 정산 상세 페이지 (확장 대상), pgcrypto RPC 패턴 (`encrypt_payout_field`/`decrypt_payout_field`), @react-pdf/renderer + NotoSansKR 폰트 (`public/fonts/NotoSansKR-{Regular,Bold}.ttf`)
- ✅ SPEC-LAYOUT-001 완료 — UI 프리미티브 11종, 운영자/강사 사이드바
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (마이그레이션 6건 + Drizzle 스키마 동기화) → 모든 후속 마일스톤의 선행
- M2 (도메인 순수 함수: 영수증 번호 + organization-info + 검증 zod 확장) → M3·M4·M5의 선행
- M3 (영수증 PDF 컴포넌트 + 렌더링 함수) → M5 (운영자 atomic Server Action) 의 선행
- M4 (강사 송금 등록 흐름) → M6 (UI 와이어링)의 선행 (병렬 가능)
- M5 (운영자 수취 확인 atomic Server Action + Storage 업로드) → M6의 선행
- M6 (페이지 와이어링 + UI 컴포넌트) → M7 (통합 테스트)의 선행
- M7 (통합 테스트 + acceptance 시나리오 검증)

### 1.3 후속 SPEC을 위한 산출물 약속

- `client_direct` enum value + 6개 컬럼 + CHECK 확장은 SPEC-PAYOUT-AUTOGEN-XXX이 자동 생성 시 활용
- 영수증 발급 콘솔 로그 형식 `[notif] receipt_issued → ...`은 SPEC-NOTIFY-001 어댑터 hook 식별자
- `app.next_receipt_number()` RPC + SEQUENCE 패턴은 SPEC-PAYOUT-INVOICE-XXX 세금계산서 번호 발급에 재사용 가능
- `getOrganizationInfo()` + organization_info 테이블 + env fallback은 SPEC-ADMIN-002 admin UI 편집 화면이 활용
- `renderReceiptPdf` + `payout-receipts` 버킷 + RLS 패턴은 SPEC-PAYOUT-INVOICE-XXX 세금계산서 PDF에 재사용 가능

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 마이그레이션 6건 + Drizzle 스키마 동기화 [Priority: High]

**산출물:**

- 마이그레이션 6건 생성:
  1. `supabase/migrations/20260429000010_settlement_flow_client_direct.sql`:
     - `ALTER TYPE settlement_flow ADD VALUE IF NOT EXISTS 'client_direct';`
     - `ALTER TABLE settlements DROP CONSTRAINT settlements_withholding_rate_check;`
     - `ALTER TABLE settlements ADD CONSTRAINT settlements_withholding_rate_check CHECK (...)` — 3개 disjunct
  2. `supabase/migrations/20260429000020_settlements_remittance_columns.sql`:
     - 6개 nullable 컬럼 ADD COLUMN
     - `CREATE UNIQUE INDEX idx_settlements_receipt_number ON settlements(receipt_number) WHERE receipt_number IS NOT NULL;`
     - `ALTER TABLE settlements ADD CONSTRAINT settlements_receipt_file_id_fkey FOREIGN KEY (receipt_file_id) REFERENCES files(id) ON DELETE SET NULL;`
  3. `supabase/migrations/20260429000030_organization_info.sql`:
     - `CREATE TABLE organization_info` + `CHECK (id = 1)`
     - RLS 정책 (admin RW, operator R)
     - 옵션: placeholder seed (TBD 행)
  4. `supabase/migrations/20260429000040_payout_receipts_bucket.sql`:
     - `INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('payout-receipts', 'payout-receipts', false, 52428800);`
     - 3개 RLS 정책 (`payout_receipts_self_select`, `payout_receipts_operator_all`, default deny)
  5. `supabase/migrations/20260429000050_notification_type_receipt_issued.sql`:
     - `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`
  6. `supabase/migrations/20260429000060_receipt_number_seq.sql`:
     - `CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;`
     - `CREATE OR REPLACE FUNCTION app.next_receipt_number() RETURNS text` (LANGUAGE plpgsql, SECURITY DEFINER)
     - `GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO authenticated;`

- Drizzle 스키마 동기화:
  - `src/db/schema/settlements.ts` — `settlement_flow` enum literal에 `'client_direct'` 추가, 6개 컬럼 추가
  - `src/db/schema/notifications.ts` — `notification_type` literal에 `'receipt_issued'` 추가
  - `src/db/schema/organization-info.ts` (신규) — Drizzle 스키마
  - `src/db/schema/index.ts` — 새 스키마 re-export

- TypeScript 타입 동기화:
  - `src/lib/payouts/types.ts`:
    ```ts
    export const SETTLEMENT_FLOWS = ['corporate', 'government', 'client_direct'] as const;
    export type SettlementFlow = typeof SETTLEMENT_FLOWS[number];
    export type Settlement = { /* 기존 + 6개 컬럼 */ };
    export type OrganizationInfo = { name: string; business_number: string; representative: string; address: string; contact: string };
    ```

**검증:**
- `pnpm tsc --noEmit` 0 type 에러
- `npx supabase db reset` 후 6개 마이그레이션 모두 정상 적용
- `psql -c "\d+ settlements"` 출력에 6개 신규 컬럼 + UNIQUE 인덱스 확인
- `psql -c "SELECT app.next_receipt_number()"` 호출 시 `RCP-2026-001` 반환

**연관 EARS:** REQ-RECEIPT-FLOW-001~004, REQ-RECEIPT-COLUMNS-001~002, REQ-RECEIPT-NOTIFY-001, REQ-RECEIPT-RLS-001~002

---

### M2 — 도메인 순수 함수 (RED → GREEN) [Priority: High]

**TDD 사이클: RED — 실패하는 테스트 먼저 작성**

**산출물 (테스트 먼저):**

- `src/lib/payouts/__tests__/receipt-number.test.ts` (RED):
  - 단일 호출 시 `RCP-YYYY-NNN` 형식 매칭 (regex: `^RCP-\d{4}-\d{3}$`)
  - 병렬 5건 호출 시 모두 unique (Promise.all + Set 검증)
  - SEQUENCE가 atomic하게 증가하는지 확인 (1, 2, 3, ...)
- `src/lib/payouts/__tests__/organization-info.test.ts` (RED):
  - DB 행 존재 시 DB 데이터 반환
  - DB 행 없음 + env 변수 모두 설정 → env 데이터 반환
  - DB 행 없음 + env 일부 누락 → `ORGANIZATION_INFO_MISSING` 에러
  - DB 행 + env 동시 존재 → DB 우선
- `src/lib/payouts/__tests__/client-direct-validation.test.ts` (RED):
  - `validateTaxRate('client_direct', 3.30)` → ok
  - `validateTaxRate('client_direct', 8.80)` → ok
  - `validateTaxRate('client_direct', 0)` → reason `TAX_RATE_CLIENT_DIRECT_INVALID`
  - `validateTaxRate('client_direct', 5)` → reason `TAX_RATE_CLIENT_DIRECT_INVALID`
  - 강사 송금 등록 zod: 금액 mismatch → `REMITTANCE_AMOUNT_MISMATCH`
  - 운영자 수취 확인 zod: 금액 mismatch → `REMITTANCE_AMOUNT_MISMATCH`
- `src/lib/payouts/__tests__/errors.test.ts` (확장):
  - 신규 6개 에러 메시지가 한국어 단일 출처에 존재 검증

**산출물 (구현 — GREEN):**

- `src/lib/payouts/receipt-number.ts`:
  ```ts
  export async function nextReceiptNumber(supabase): Promise<string> {
    const { data, error } = await supabase.rpc('next_receipt_number');
    if (error) throw new Error(ERRORS.RECEIPT_GENERATION_FAILED);
    return data as string;
  }
  ```

- `src/lib/payouts/organization-info.ts`:
  ```ts
  export async function getOrganizationInfo(supabase): Promise<OrganizationInfo> {
    // 1. DB 우선
    const { data } = await supabase.from('organization_info').select('*').eq('id', 1).maybeSingle();
    if (data && allFieldsPresent(data)) return data;
    // 2. env fallback
    const env = readEnvOrgInfo();
    if (env) return env;
    // 3. 실패
    throw new Error(ERRORS.ORGANIZATION_INFO_MISSING);
  }
  ```

- `src/lib/payouts/client-direct-validation.ts`:
  - `instructorRemittanceSchema` (zod) — settlementId, remittanceDate, remittanceAmountKrw + cross-field with expected amount
  - `operatorConfirmationSchema` (zod) — settlementId, receivedDate, receivedAmountKrw + cross-field

- `src/lib/payouts/errors.ts` (확장):
  ```ts
  export const ERRORS = {
    // ... 기존 SPEC-PAYOUT-001 8종
    REMITTANCE_AMOUNT_MISMATCH: "송금 금액이 정산 정보와 일치하지 않습니다.",
    RECEIPT_ALREADY_ISSUED: "이미 영수증이 발급된 정산입니다.",
    RECEIPT_GENERATION_FAILED: "영수증 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    ORGANIZATION_INFO_MISSING: "알고링크 사업자 정보가 설정되지 않았습니다. 관리자에게 문의하세요.",
    STORAGE_UPLOAD_FAILED: "영수증 파일 업로드에 실패했습니다.",
    TAX_RATE_CLIENT_DIRECT_INVALID: "고객 직접 정산 원천세율은 3.30% 또는 8.80%만 가능합니다.",
  } as const;
  ```

- `src/lib/payouts/tax-calculator.ts` (확장):
  - `validateTaxRate`에 `client_direct` 분기 추가 (3.30/8.80만 허용)

- `src/lib/payouts/validation.ts` (확장):
  - zod superRefine에 `client_direct` 분기 추가

- `src/lib/payouts/status-machine.ts` (확장):
  - `getStatusLabel(status, flow)` 함수 추가 — flow별 라벨 매핑
    - `client_direct` + `pending` → "수취 대기"
    - `client_direct` + `requested` → "입금 확인 대기"
    - `client_direct` + `paid` → "영수증 발급 완료"
    - `client_direct` + `held` → "보류"
    - 기타 흐름은 기존 라벨

**검증:**
- 모든 단위 테스트 PASS
- 라인 커버리지 ≥ 90% (도메인 모듈)
- `pnpm tsc --noEmit` 0 errors

**연관 EARS:** REQ-RECEIPT-FLOW-005, REQ-RECEIPT-COLUMNS-005, REQ-RECEIPT-PDF-003, REQ-RECEIPT-INSTRUCTOR-003, REQ-RECEIPT-OPERATOR-003 (validation 부분)

---

### M3 — 영수증 PDF 컴포넌트 + 렌더링 함수 [Priority: High]

**TDD 사이클: RED — PDF 텍스트 추출 검증 테스트 먼저**

**산출물 (테스트 먼저):**

- `src/lib/payouts/__tests__/receipt-pdf.test.ts` (RED):
  - `renderReceiptPdf(mock)` Buffer 반환
  - PDF Buffer를 pdf-parse 또는 유사 라이브러리로 텍스트 추출
  - 추출 텍스트에 다음 포함:
    - "영수증" (한국어)
    - 영수증 번호 (`RCP-2026-001`)
    - 발행일 (KST 형식)
    - 강사명
    - 알고링크 사업자 정보 (상호, 사업자등록번호)
    - 거래 금액 (KRW 포맷, 예: `2,000,000 원`)
    - "위 금액을 정히 영수합니다."
  - PDF 페이지 수 = 1 (A4 portrait 단일 페이지)

**산출물 (구현 — GREEN):**

- `src/components/payouts/ReceiptDocument.tsx`:
  - @react-pdf/renderer 컴포넌트
  - `Font.register({ family: 'NotoSansKR', fonts: [...] })`
  - A4 portrait + StyleSheet 정의
  - 6개 섹션 렌더 (Header, 강사 정보, 알고링크 정보, 거래 정보, 본문, Footer)
  - 한국어 라벨 + KST 날짜 + KRW 포맷

- `src/lib/payouts/receipt-pdf.ts`:
  ```ts
  import { renderToBuffer } from '@react-pdf/renderer';
  import { ReceiptDocument } from '@/components/payouts/ReceiptDocument';

  export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
    try {
      return await renderToBuffer(<ReceiptDocument {...input} />);
    } catch (e) {
      throw new Error(ERRORS.RECEIPT_GENERATION_FAILED);
    }
  }
  ```

- 폰트 등록 검증 — NotoSansKR이 React PDF 환경에서 로드되는지 통합 테스트로 확인

**검증:**
- 단위 테스트 PASS — 한국어 텍스트 깨짐 없음
- PDF Buffer 크기 < 500KB (NotoSansKR 외부 폰트, embedded subset)
- 시각 검증: 로컬 dev에서 sample PDF를 생성하여 사용자 검토 (M7 통합 단계)

**연관 EARS:** REQ-RECEIPT-PDF-001~006

---

### M4 — 강사 송금 등록 흐름 [Priority: High]

**TDD 사이클: RED → GREEN**

**산출물 (테스트 먼저):**

- `src/lib/payouts/__tests__/instructor-remittance.test.ts` (RED):
  - 정상 케이스: status `pending`인 client_direct 정산 + 일치 금액 → status `requested` + 컬럼 갱신
  - 금액 불일치 → `REMITTANCE_AMOUNT_MISMATCH` 거부, status 미변경
  - 잘못된 상태 (paid 또는 다른 흐름) → `STATUS_INVALID_TRANSITION` 거부
  - 선택적 첨부 파일 → `files` 행 INSERT + Storage 업로드 (mock)
  - 첨부 파일 없음 → `files` INSERT 안 됨, status만 변경

**산출물 (구현 — GREEN):**

- `src/app/(app)/(instructor)/me/payouts/[id]/remit/actions.ts`:
  ```ts
  'use server';
  export async function registerInstructorRemittance(formData: FormData) {
    const supabase = await createServerClient();
    const user = await requireUser('instructor');
    
    const parsed = instructorRemittanceSchema.safeParse({
      settlementId: formData.get('settlementId'),
      remittanceDate: formData.get('remittanceDate'),
      remittanceAmountKrw: Number(formData.get('remittanceAmountKrw')),
    });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    
    const settlement = await getSettlementById(parsed.data.settlementId);
    // ... 검증 + transaction
  }
  ```

- `src/app/(app)/(instructor)/me/payouts/[id]/remit/page.tsx` (optional):
  - dedicated form 페이지 또는 모달 (모달이 더 간단하므로 모달 권장)

- `src/components/payouts/RemittanceRegistrationForm.tsx`:
  - react-hook-form + zod resolver
  - 송금 일자 (date input)
  - 송금 금액 (number input + KRW 포맷)
  - 첨부 파일 (file input, accept=".pdf,.jpg,.png", max 10MB)
  - 제출 버튼 + 한국어 에러 표시

- 강사 정산 상세 페이지 확장 (`(instructor)/me/payouts/[id]/page.tsx`):
  - `client_direct` + `pending` → "송금 완료 등록" CTA
  - `client_direct` + `requested` → 등록된 송금 정보 표시 (read-only)
  - `client_direct` + `paid` → 영수증 다운로드 링크 (M5에서 보강)

**검증:**
- 단위 테스트 PASS
- 통합 테스트 (M7): pending → requested 전환 + DB 컬럼 검증
- 한국어 에러 표시 + axe critical 0

**연관 EARS:** REQ-RECEIPT-INSTRUCTOR-001~005

---

### M5 — 운영자 수취 확인 + 영수증 발급 atomic Server Action [Priority: High]

**TDD 사이클: RED → GREEN**

**산출물 (테스트 먼저):**

- `src/lib/payouts/__tests__/operator-confirmation.test.ts` (RED):
  - 정상 케이스: status `requested` + 일치 금액 → atomic 6-step 모두 성공
    - status → paid
    - receipt_file_id, receipt_number, receipt_issued_at 모두 갱신
    - notifications 1행 INSERT (type=`receipt_issued`)
    - 콘솔 로그 정확한 형식
  - 금액 불일치 → `REMITTANCE_AMOUNT_MISMATCH` 롤백, DB 변경 없음
  - PDF 생성 실패 (mock 강제) → `RECEIPT_GENERATION_FAILED` 롤백
  - Storage 업로드 실패 (mock) → `STORAGE_UPLOAD_FAILED` 롤백
  - notifications INSERT 실패 (mock RLS reject) → 전체 롤백, status 미변경
  - 영수증 재발급 시도 (status=paid에 confirm 호출) → `RECEIPT_ALREADY_ISSUED` 거부
  - Stale (다른 운영자 먼저 처리) → WHERE matched 0 rows → STALE_TRANSITION

- `src/lib/payouts/__tests__/receipt-concurrency.test.ts` (RED):
  - 5개 settlements를 병렬로 confirm-remittance 호출
  - 모든 정산이 unique receipt_number 발급
  - 모두 status=`paid`로 전환
  - notifications 5행 INSERT

**산출물 (구현 — GREEN):**

- `src/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts`:
  ```ts
  'use server';
  export async function confirmRemittanceAndIssueReceipt(input: ConfirmInput) {
    // 1. validation + amount check
    // 2. PDF render in memory
    // 3. Storage upload
    // 4. DB transaction (files INSERT + settlements UPDATE + notifications INSERT)
    // 5. Console log post-commit
    // 6. revalidate paths
  }
  ```
  
  구현 세부는 spec.md §5.3 참조.

- `src/components/payouts/RemittanceConfirmationPanel.tsx`:
  - 등록된 송금 정보 read-only 표시
  - 운영자 입력 폼 (입금 확인 일자, 실제 입금 금액, 메모)
  - 제출 시 confirmation dialog: "영수증을 발급하시겠습니까? 발급 후 변경할 수 없습니다."
  - 한국어 에러 표시

- 운영자 정산 상세 페이지 확장 (`(operator)/settlements/[id]/page.tsx`):
  - `client_direct` 흐름 시 flow indicator 표시 ("고객사 → 강사 → 알고링크")
  - status=`requested` 시 RemittanceConfirmationPanel 노출
  - status=`paid` 시 영수증 정보 + 다운로드 링크 노출

**검증:**
- 단위 테스트 PASS (시나리오 7건+)
- 동시성 테스트 PASS (병렬 5건 unique)
- 콘솔 로그 정규식 매칭: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{3}$`
- typecheck + lint 0 에러

**연관 EARS:** REQ-RECEIPT-OPERATOR-001~007, REQ-RECEIPT-NOTIFY-002~004, REQ-RECEIPT-RLS-005

---

### M6 — UI 와이어링 + Storage signed URL 생성 + 다운로드 [Priority: Medium]

**산출물:**

- `src/components/payouts/ReceiptPreviewLink.tsx`:
  - 강사/운영자 둘 다 사용 가능한 영수증 다운로드 버튼
  - 클릭 시 서버 action으로 signed URL 생성 (1시간 만료)
  - 새 탭 또는 다운로드 트리거

- `src/app/(app)/(instructor)/me/payouts/[id]/receipt/route.ts` (또는 Server Action):
  ```ts
  // GET signed URL (server-only)
  // RLS 검증 후 supabase.storage.from('payout-receipts').createSignedUrl(path, 3600) 호출
  ```

- `src/components/payouts/ClientDirectStatusBadge.tsx`:
  - flow별 라벨 매핑 (`getStatusLabel(status, 'client_direct')`)
  - 색상은 기존 `SettlementStatusBadge`와 동일

- 운영자 리스트 페이지 확장 (`(operator)/settlements/page.tsx`):
  - `flow` 필터에 `client_direct` 옵션 추가
  - 매입매출 위젯에 `client_direct` 흐름 포함 (이미 SPEC-PAYOUT-001에서 모든 흐름 합산하므로 자동 반영)

- 강사 정산 상세 페이지 영수증 다운로드 노출 (M4에서 placeholder 처리한 부분 완성)

**검증:**
- 강사 본인 영수증 다운로드 성공
- 다른 강사 영수증 path 접근 시 401/403 (RLS 검증)
- 운영자/admin 영수증 다운로드 성공
- typecheck + lint 0 에러

**연관 EARS:** REQ-RECEIPT-INSTRUCTOR-006, REQ-RECEIPT-OPERATOR-006, REQ-RECEIPT-RLS-003~006

---

### M7 — 통합 테스트 + acceptance 시나리오 검증 [Priority: Medium]

**산출물:**

- 통합 테스트 (`__tests__/integration/receipt-flow.test.ts`):
  - 시나리오 1: 강사 송금 등록 (acceptance.md 시나리오 1)
  - 시나리오 2: 운영자 수취 확인 atomic + PDF 생성 (시나리오 2)
  - 시나리오 3: 영수증 PDF 한국어 렌더 검증 (시나리오 3)
  - 시나리오 4: 영수증 번호 동시성 (시나리오 4)
  - 시나리오 5: 송금 금액 mismatch 거부 (시나리오 5)
  - 시나리오 6: RLS — 다른 강사 영수증 접근 차단 (시나리오 6)
  - 시나리오 7: paid 동결 + 재발급 거부 (시나리오 7)
  - 시나리오 8: 알림 + 콘솔 로그 (시나리오 8)

- 회귀 테스트:
  - SPEC-PAYOUT-001의 16개 상태 전환 테스트 그대로 PASS
  - SPEC-PAYOUT-001의 corporate/government 흐름 회귀 0건

- 시드 데이터 보강 (옵션):
  - `scripts/seed.ts`에 `client_direct` 정산 행 1-2건 추가 (status=pending) — 데모용
  - `organization_info` placeholder 행

- 빌드 + lint:
  - `pnpm build` 0 에러
  - `pnpm lint` 0 에러
  - `pnpm typecheck` 0 에러

- 접근성:
  - axe DevTools `/me/payouts/[id]/remit`, `/settlements/[id]` (client_direct) critical 0건

**검증:**
- 모든 acceptance 시나리오 PASS
- 단위 테스트 라인 커버리지 ≥ 85% (receipt 모듈)
- 회귀 0건

**연관 EARS:** 모든 REQ 모듈 종합 검증

---

## 3. 위험 요약 (Risk Summary)

상세는 spec.md §8 참조. 핵심 위험 3건:

1. **Storage 업로드 후 DB 실패 → 고아 파일**: best-effort cleanup, 후속 cron SPEC에서 정리
2. **PDF 렌더링 실패 (NotoSansKR 폰트 로드)**: SPEC-ME-001 M8에서 검증된 패턴 재사용. 통합 테스트로 검증
3. **CHECK 제약 RECREATE 시 기존 데이터 위반**: 마이그레이션 전 검증 SQL 실행 (현 시점 위반 0건 확인)

---

## 4. 마일스톤 진행 순서 (Sequencing Diagram)

```
M1 (마이그레이션 + 스키마 동기화)
    ↓
M2 (도메인 순수 함수)
    ↓
M3 (영수증 PDF) ────┐
    ↓               │
M4 (강사 송금 등록) │
    ↓               ↓
M5 (운영자 atomic Server Action)
    ↓
M6 (UI 와이어링 + signed URL)
    ↓
M7 (통합 테스트)
```

M3와 M4는 M5 이전 병렬 가능 (M5가 M3의 PDF 함수 + M4의 등록 흐름을 모두 소비).

---

## 5. 검수 체크리스트 (Definition of Done)

- [ ] M1-M7 모든 마일스톤 완료
- [ ] 마이그레이션 6건 정상 적용 (`npx supabase db reset` 무오류)
- [ ] `pnpm build` / `pnpm test` / `pnpm typecheck` / `pnpm lint` 모두 0 에러
- [ ] 단위 테스트 라인 커버리지 ≥ 85%
- [ ] acceptance.md 시나리오 8건 PASS
- [ ] 회귀 0건 (SPEC-PAYOUT-001 corporate/government 흐름 정상 동작)
- [ ] 영수증 PDF 한국어 정상 렌더 + 시각 검수 (M7 단계 사용자 확인)
- [ ] 콘솔 로그 정규식 매칭 검증
- [ ] axe DevTools critical 0건 (2 페이지)
- [ ] SPEC-PAYOUT-001 paid-freeze 인배리언트 그대로 통과

---

## 6. MX Tag 계획

본 SPEC 구현 시 추가 예정 MX 태그:

| 위치 | 태그 종류 | 사유 |
|------|----------|------|
| `confirmRemittanceAndIssueReceipt` | `@MX:ANCHOR` | atomic transaction, fan_in 1 (UI에서만 호출), invariant 8단계 |
| `renderReceiptPdf` | `@MX:NOTE` | @react-pdf/renderer 환경 의존, 폰트 등록 누락 시 한국어 깨짐 |
| `nextReceiptNumber` (RPC 래퍼) | `@MX:ANCHOR` | 동시성 안전 발급, fan_in 1, UNIQUE 제약 의존 |
| `getOrganizationInfo` | `@MX:NOTE` | DB 우선 + env fallback 우선순위 명세 |
| Storage 업로드 후 DB 실패 처리 부분 | `@MX:WARN` | 고아 파일 발생 가능, best-effort cleanup |
| 영수증 발급 후 알림 INSERT | `@MX:NOTE` | SPEC-NOTIFY-001 hook 식별자 (`receipt_issued`) |

---

_End of SPEC-RECEIPT-001 plan.md_
