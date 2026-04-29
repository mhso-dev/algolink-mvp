---
id: SPEC-RECEIPT-001
version: 0.1.0
status: draft
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: null
---

# SPEC-RECEIPT-001: 고객 직접 정산 + 자동 영수증 발급 (Client-Direct Settlement Flow + Automated Receipt Issuance)

## HISTORY

- **2026-04-29 (v0.1.0)**: 초기 작성. Algolink MVP §6-2 「고객-강사 직접 정산 + 알고링크 영수증 발급」 흐름을 SPEC화. 기존 §6-1(SPEC-PAYOUT-001 — 알고링크 → 강사 직접 송금, 원천세 차감)과는 자금 흐름이 반대 방향이다: (1) 고객사가 강사에게 강의비 전액 직접 송금하되 원천세(3.30% 또는 8.80%)를 차감, (2) 강사는 차감 후 수령액 중 알고링크 마진 분(`instructor_remittance_amount_krw`)을 알고링크 계좌로 역송금, (3) 알고링크가 입금 확인 시 영수증 PDF(번호+발행일+사업자정보+금액)를 자동 생성하여 강사에게 인앱 알림 + 다운로드 링크로 회신. 본 SPEC은 사이블링 SPEC-PAYOUT-002(6-1 + sessions 보강)와 평행하게 작성되며, 기존 `settlements` 테이블을 (a) `settlement_flow` enum에 `client_direct` 값 추가 + (b) 6개 컬럼 nullable 추가(`instructor_remittance_amount_krw`, `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id`, `receipt_issued_at`, `receipt_number`) + (c) CHECK 제약 확장(`client_direct AND withholding_tax_rate IN (3.30, 8.80)`) 형태로 확장한다. 상태 머신은 SPEC-PAYOUT-001의 4-state(pending → requested → paid + held)를 그대로 유지하되 `client_direct` 흐름에서는 의미를 재해석(`pending`=강사 송금 미등록, `requested`=강사 송금 등록 완료/알고링크 확인 대기, `paid`=알고링크 입금 확인 + 영수증 발급 완료, `held`=금액 불일치 보류). [HARD] paid-freeze 인배리언트(SPEC-PAYOUT-001 §2.3)는 그대로 존중되며, 영수증 발급은 정확히 `requested → paid` 전환 시점에 단일 트랜잭션으로 (status UPDATE + receipt_number 발급 + receipt_file_id 연결 + receipt_issued_at 기록 + notifications INSERT) 원자적으로 수행된다. 영수증 PDF는 @react-pdf/renderer + NotoSansKR(SPEC-ME-001 M8 산출물 재사용) 기반 A4 단일 페이지로 생성되어 신규 Storage 버킷 `payout-receipts`에 저장되며, 알고링크 사업자 정보는 신규 singleton 테이블 `organization_info`(MVP는 1행만 존재) 또는 환경변수 fallback에서 로드한다. 알림은 신규 `notification_type` enum 값 `receipt_issued`로 INSERT되고, 콘솔 로그(`[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>`)가 SPEC-NOTIFY-001 후속 hook의 식별자로 기록된다. 본 SPEC은 페인 포인트 「영수증을 시스템 외부에서 수기 발행하여 금액·번호 불일치가 잦다」를 자동화로 해소하는 것을 목적으로 한다. 실제 이메일/SMS 발송, 국세청 세금계산서 API 연동, 영수증 일괄 재발급, 영수증 취소/대체 발급, 알고링크 사업자 정보 admin UI 편집 화면, 강사 송금 자동 매칭(은행 OpenAPI), 카카오페이/토스 등 PG 연동은 명시적 제외이며 후속 SPEC으로 위임한다. SPEC-PAYOUT-002(sibling)는 6-1 + sessions 추가 분만 다루므로 본 SPEC과 컬럼/마이그레이션 충돌 없음을 §4.6에서 확인한다.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 [F-205] 정산 관리 영역에 **「고객 직접 정산 + 영수증 자동 발급」 흐름(이하 6-2 흐름)**을 추가한다. 본 SPEC의 산출물은 다음 9가지 축으로 구성된다.

(a) **`settlement_flow` enum 확장** — 기존 `corporate`(0%) / `government`(3.30/8.80%)에 `client_direct`(3.30/8.80%)를 추가. CHECK 제약을 `(settlement_flow = 'client_direct' AND withholding_tax_rate IN (3.30, 8.80))` 항을 OR 결합으로 확장. 마이그레이션 1건.

(b) **`settlements` 6개 컬럼 추가 (모두 nullable)** —
  - `instructor_remittance_amount_krw bigint` — 강사가 알고링크에 역송금해야 할 금액 (운영자가 정산 행 생성 시 산정, 통상 알고링크 마진 = `business_amount_krw - instructor_fee_krw` = `profit_krw`)
  - `instructor_remittance_received_at timestamptz` — 운영자가 강사 입금을 확인한 시각
  - `client_payout_amount_krw bigint` — 고객사가 강사에게 송금한 금액(원천세 차감 후, 정보용)
  - `receipt_file_id uuid FK→files` — 자동 생성된 영수증 PDF 파일 식별자
  - `receipt_issued_at timestamptz` — 영수증 발급 시각
  - `receipt_number text UNIQUE` — `RCP-YYYY-NNN` 형식의 월별 시퀀셜 번호 (동시성 안전 발급)

(c) **상태 머신 재해석 (백엔드 enum 미변경)** — `client_direct` 흐름 한정으로 4-state의 의미를 재해석:
  - `pending` = 강사 송금 등록 전 (UI 라벨: "수취 대기")
  - `requested` = 강사 송금 등록 완료, 알고링크 확인 대기 (UI 라벨: "입금 확인 대기")
  - `paid` = 알고링크 입금 확인 + 영수증 발급 완료 (UI 라벨: "영수증 발급 완료")
  - `held` = 금액 불일치 또는 분쟁
  
  백엔드 enum 값(`pending`/`requested`/`paid`/`held`)은 변경하지 않으며 SPEC-PAYOUT-001의 paid-freeze 인배리언트와 전환 그래프(`pending → requested → paid` + `held` 분기)를 그대로 따른다.

(d) **강사 송금 등록 흐름** (`(instructor)/me/payouts/[id]/remit/`) — SPEC-ME-001 M5 정산 상세를 확장: `client_direct` 흐름 + status=`pending` 정산 행에 "송금 완료 등록" CTA 노출. 강사가 송금 일자 + 송금 금액(서버측 expected = `instructor_remittance_amount_krw` 일치 검증) + 선택적 송금 영수증 첨부(`files` 행 + Storage 업로드) 입력 → Server Action이 status `pending → requested` 전환 + `instructor_remittance_amount_krw`/`client_payout_amount_krw` UPDATE.

(e) **운영자 수취 확인 + 영수증 발급 atomic Server Action** (`(operator)/settlements/[id]/confirm-remittance/`) — `client_direct` + status=`requested` 정산 행 상세 페이지에 "수취 확인 + 영수증 발급" 패널 노출. 운영자가 입금 확인 일자 + 실제 입금 금액(서버측 expected = `instructor_remittance_amount_krw` 일치 검증) + 선택적 메모 입력 → 단일 트랜잭션 안에서 6개 작업이 원자적으로 수행:
  1. `validateTransition(currentStatus, 'paid')`
  2. 영수증 번호 발급 (PostgreSQL SEQUENCE `receipt_number_seq` + `RCP-YYYY-NNN` 포맷팅, 동시성 안전)
  3. 영수증 PDF 생성 (@react-pdf/renderer, NotoSansKR 폰트, A4 portrait, 단일 페이지)
  4. PDF Storage 업로드 (`payout-receipts/<settlement_id>/<receipt_number>.pdf`) + `files` 행 INSERT
  5. `UPDATE settlements SET status='paid', instructor_remittance_received_at=now(), receipt_file_id=$file, receipt_number=$num, receipt_issued_at=now() WHERE id=$1 AND status='requested'`
  6. `INSERT INTO notifications (recipient_id, type='receipt_issued', title, body, link_url)` + 콘솔 로그

(f) **영수증 PDF 컨텐츠** — A4 portrait, 단일 페이지, 한국어. 포함 항목: 상단 "영수증" 타이틀 + 영수증 번호 + 발행일 / 강사 정보(이름·사업자등록번호 nullable) / 알고링크 정보(상호·사업자등록번호·대표자명·주소·연락처) / 거래 정보(송금일·입금 금액 KRW·사유) / 하단 발행처 표기. 알고링크 사업자 정보 source는 신규 singleton 테이블 `organization_info`(1행 enforce CHECK) 또는 환경변수 fallback. 본 SPEC에서는 organization_info 테이블 + 환경변수 fallback 둘 다 지원하되 우선순위는 (1) organization_info 행 → (2) 환경변수.

(g) **`payout-receipts` Storage 버킷 + RLS** — 신규 버킷 생성. RLS 정책:
  - `payout_receipts_self_select`: `instructor` role + `auth.uid() = (SELECT user_id FROM instructors WHERE id = (SELECT instructor_id FROM settlements WHERE receipt_file_id IS NOT NULL AND <path matches>))` (강사 본인 read only)
  - `payout_receipts_operator_all`: `operator/admin` role full RW
  - `payout_receipts_anon_deny`: 미인증 거부 (default deny)
  
  `files` 테이블에는 `kind='receipt'` 새 행 추가. `files.kind` enum 또는 text 컬럼이 이미 존재한다고 가정 (없으면 마이그레이션에서 추가).

(h) **`notification_type='receipt_issued'` enum 값 추가 + 알림 흐름** — 마이그레이션 1건 (`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`). 알림 INSERT: `recipient_id = (강사의 user_id)`, `title="영수증 발급 완료"`, `body=<receipt_number> (<formatted amount> KRW)`, `link_url = '/me/payouts/<settlement_id>'`. 이메일은 SPEC-NOTIFY-001 후속이며 본 SPEC은 콘솔 로그 1줄(`[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>`)로 hook 식별자만 남긴다.

(i) **paid-freeze 존중 + GENERATED 컬럼 read-only** — `paid` 상태에서는 영수증 재발급/번호 변경/상태 전환이 모두 차단된다. SPEC-PAYOUT-001의 `STATUS_PAID_FROZEN` 한국어 에러를 그대로 활용한다. 신규 컬럼 6개는 GENERATED가 아닌 일반 nullable 컬럼이지만, 영수증 발급 후 변경은 admin 직접 SQL로만 가능하며 운영자 UI/Server Action에서는 변경 경로 미제공.

본 SPEC은 다음을 빌드하지 않는다: 실제 이메일/SMS 발송, 국세청 세금계산서 발행, 영수증 취소/재발급 UI, 강사 송금 은행 OpenAPI 자동 매칭, organization_info admin 편집 화면, 영수증 일괄 처리, PG 연동, 카카오페이/토스 통합, 영수증 다국어, 영수증 인쇄용 별도 레이아웃.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.1 [F-205] 운영자 정산 관리는 SPEC-PAYOUT-001에서 **6-1 흐름(알고링크 직접 송금, 원천세 차감)**을 완료했다. 그러나 알고링크 PM 인터뷰(2026-04-29)에서 두 번째 정산 케이스가 확인되었다.

**6-1 (기존, 완료)**: 자금 흐름 = `고객사 → 알고링크 → 강사`
- 고객사가 알고링크에 사업비 전액 송금
- 알고링크가 강사에게 강사비 송금 (원천세 차감 후)
- SPEC-PAYOUT-001이 운영자 측 워크플로우 + 1-클릭 정산요청 + 입금 확인을 구현
- 강사 측 조회 화면은 SPEC-ME-001 M5/M7이 구현

**6-2 (본 SPEC)**: 자금 흐름 = `고객사 → 강사 → 알고링크` + `알고링크 → 강사 (영수증)`
- 고객사가 강사에게 강의비 직접 송금 (원천세 3.30% 또는 8.80% 차감)
- 강사가 차감 후 수령액 중 알고링크 마진 분을 알고링크 계좌로 역송금
- 알고링크가 입금 확인 후 강사에게 영수증 PDF 회신 (자동 발급)

**페인 포인트**: 현재 6-2 흐름의 영수증은 알고링크 PM이 시스템 외부(엑셀/한글)에서 수기 작성하여 이메일로 강사에게 발송한다. 이로 인해:
- 영수증 번호 중복/누락 발생
- 금액·발행일·강사 정보 입력 실수
- 영수증 사후 검색/감사 어려움 (시스템에 기록 없음)

본 SPEC은 정산 행과 영수증을 **시스템 내부에서 1:1로 연결**하여 위 페인 포인트를 자동화로 해소한다.

#### 기존 자산 활용

- **`settlements` 테이블**: SPEC-DB-001 §2.8이 모든 핵심 컬럼을 확보 (`id`, `project_id`, `instructor_id`, `settlement_flow`, `status`, `business_amount_krw`, `instructor_fee_krw`, `withholding_tax_rate`, `profit_krw` GENERATED, `withholding_tax_amount_krw` GENERATED, `payment_received_at`, `payout_sent_at`, `tax_invoice_issued`, `notes`, `deleted_at`, ...). 본 SPEC은 6개 컬럼 추가만 한다.
- **`settlement_flow` enum**: SPEC-DB-001 §2.8이 `corporate`/`government` 정의. 본 SPEC은 `client_direct` 값 추가만 한다.
- **`settlement_status` enum + 상태 머신**: SPEC-PAYOUT-001 §2.3이 `pending`/`requested`/`paid`/`held` + 5개 허용 전환을 확정. 본 SPEC은 enum 미변경, 의미 재해석만.
- **상태 변경 트리거**: SPEC-DB-001 `trg_settlements_status_history`가 `settlement_status_history` 자동 INSERT.
- **`notifications` 테이블 + RLS**: SPEC-DB-001 §2.10. `notification_type` enum에 `receipt_issued` 값 추가만.
- **`files` 테이블**: SPEC-DB-001 §2.12. `kind` 컬럼이 이미 존재한다고 가정(SPEC-ME-001 M7/M8 활용 패턴). 없으면 마이그레이션에서 `kind text` 추가 + CHECK 제약.
- **`@react-pdf/renderer` + NotoSansKR 폰트**: SPEC-ME-001 M8 (이력서 PDF 다운로드)에서 정착. `public/fonts/NotoSansKR-{Regular,Bold}.ttf` 그대로 재사용.
- **PII 암호화 패턴**: SPEC-ME-001 M7 (pgcrypto RPC `encrypt_payout_field`/`decrypt_payout_field`). 본 SPEC의 영수증 PDF 렌더링에서 강사 사업자등록번호가 PII에 해당하면 동일 RPC 경유.
- **SPEC-AUTH-001 가드**: `(operator)/layout.tsx` `requireRole(['operator', 'admin'])` + `(instructor)/layout.tsx` `requireRole(['instructor'])` 그대로 사용.
- **SPEC-PAYOUT-001 `validateTransition`**: 4-state 전환 검증 함수. 본 SPEC의 영수증 발급 Server Action에서 재사용.

#### `client_direct` 흐름의 상태 머신 의미 (재해석 표)

| 백엔드 status | 6-1 의미 (corporate/government) | 6-2 의미 (client_direct) |
|---|---|---|
| `pending` | 정산 행 생성 직후, 운영자가 정산 요청 메일 미발송 | 정산 행 생성 직후, 강사 송금 미등록 |
| `requested` | 운영자가 정산 요청 발송, 강사가 입금 확인 대기 | 강사 송금 등록 완료, 알고링크 운영자 입금 확인 대기 |
| `paid` | 운영자가 강사에게 송금 완료 (알고링크 → 강사) | 알고링크 입금 확인 + 영수증 발급 완료 (영수증 PDF 강사 회신) |
| `held` | 분쟁/보류 (양 흐름 공통) | 송금액 불일치, 분쟁/보류 |

UI 라벨은 흐름별로 다르게 표시 (`SettlementStatusBadge`가 `settlement_flow`를 prop으로 받아 분기). 백엔드 enum 값/전환 그래프/paid-freeze 인배리언트는 모두 동일.

#### CHECK 제약 확장

기존 SPEC-DB-001 CHECK:
```sql
(settlement_flow = 'corporate' AND withholding_tax_rate = 0) OR
(settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))
```

본 SPEC 적용 후:
```sql
(settlement_flow = 'corporate' AND withholding_tax_rate = 0) OR
(settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80)) OR
(settlement_flow = 'client_direct' AND withholding_tax_rate IN (3.30, 8.80))
```

DB CHECK 제약 이름은 `settlements_withholding_rate_check`(SPEC-DB-001) 그대로 유지하되, DROP + RECREATE 패턴으로 마이그레이션. zod 사전 차단 규칙도 동일하게 확장 (`src/lib/payouts/validation.ts`).

#### 영수증 번호 동시성 안전 발급

영수증 번호는 `RCP-YYYY-NNN` 형식 (예: `RCP-2026-001`). 동시 발급 충돌을 방지하기 위해 PostgreSQL SEQUENCE 사용:

```sql
CREATE SEQUENCE receipt_number_seq START 1;
-- 발급 시: SELECT 'RCP-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(nextval('receipt_number_seq')::text, 3, '0')
```

연도 경계 시 시퀀스 reset은 본 SPEC에서 미구현 (단순 카운터 형식). 연도별 reset이 필요하면 후속 SPEC에서 처리. 단순 시퀀스 + 연도 prefix 조합으로 MVP 충분.

대안 검토 (행 락 + COUNT 방식): 동시성 처리 위해 advisory lock 필요 → SEQUENCE 채택이 더 단순하고 안전.

### 1.3 범위 (Scope)

**In Scope:**

- **마이그레이션** (`supabase/migrations/`):
  - `20260429000010_settlement_flow_client_direct.sql` — `settlement_flow` enum에 `client_direct` 값 추가 + CHECK 제약 확장 (DROP + RECREATE)
  - `20260429000020_settlements_remittance_columns.sql` — 6개 nullable 컬럼 추가 (`instructor_remittance_amount_krw`, `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id`, `receipt_issued_at`, `receipt_number`) + UNIQUE 제약 (`receipt_number`) + FK (`receipt_file_id` → `files(id)`)
  - `20260429000030_organization_info.sql` — 신규 singleton 테이블 + CHECK 제약 (1행 enforce, `id = 1`) + RLS (admin RW, operator R)
  - `20260429000040_payout_receipts_bucket.sql` — Storage 버킷 + 3개 RLS 정책 (instructor self-read, operator/admin all, anon deny)
  - `20260429000050_notification_type_receipt_issued.sql` — `notification_type` enum 값 추가
  - `20260429000060_receipt_number_seq.sql` — SEQUENCE 생성 + 발급 SQL 함수 (`app.next_receipt_number()`)

- **도메인 로직** (`src/lib/payouts/`):
  - `receipt-pdf.ts` (planned) — `renderReceiptPdf({ settlement, instructor, organization }) → Buffer` (@react-pdf/renderer + NotoSansKR)
  - `receipt-number.ts` (planned) — `nextReceiptNumber(): Promise<string>` (RPC `app.next_receipt_number()` 래퍼)
  - `organization-info.ts` (planned) — `getOrganizationInfo(): Promise<OrganizationInfo>` (DB 우선, env fallback)
  - `client-direct-validation.ts` (planned) — `client_direct` 흐름 전용 zod 스키마 (강사 송금 등록 + 운영자 수취 확인 폼)
  - `status-machine.ts` (기존 확장) — flow별 UI 라벨 분기 함수 추가 (`getStatusLabel(status, flow)`)
  - `tax-calculator.ts` (기존 확장) — `validateTaxRate`에 `client_direct` 분기 추가 (3.30/8.80만 허용)
  - `validation.ts` (기존 확장) — `client_direct` + CHECK 제약 zod 사전 차단
  - `errors.ts` (기존 확장) — 신규 한국어 에러 메시지 추가:
    - `REMITTANCE_AMOUNT_MISMATCH`: `"송금 금액이 정산 정보와 일치하지 않습니다."`
    - `RECEIPT_ALREADY_ISSUED`: `"이미 영수증이 발급된 정산입니다."`
    - `RECEIPT_GENERATION_FAILED`: `"영수증 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."`
    - `ORGANIZATION_INFO_MISSING`: `"알고링크 사업자 정보가 설정되지 않았습니다. 관리자에게 문의하세요."`
    - `STORAGE_UPLOAD_FAILED`: `"영수증 파일 업로드에 실패했습니다."`
    - `TAX_RATE_CLIENT_DIRECT_INVALID`: `"고객 직접 정산 원천세율은 3.30% 또는 8.80%만 가능합니다."`

- **컴포넌트** (`src/components/payouts/`):
  - `ReceiptDocument.tsx` (planned) — @react-pdf/renderer 문서 컴포넌트 (A4 portrait, 한국어, NotoSansKR)
  - `RemittanceRegistrationForm.tsx` (planned) — 강사 송금 등록 폼 (date + amount + optional file)
  - `RemittanceConfirmationPanel.tsx` (planned) — 운영자 수취 확인 패널 (date + amount + memo)
  - `ReceiptPreviewLink.tsx` (planned) — 강사/운영자 둘 다 영수증 다운로드 버튼
  - `ClientDirectStatusBadge.tsx` (planned) — `client_direct` 흐름 전용 상태 라벨

- **라우트** (Server Actions + 페이지):
  - `(app)/(instructor)/me/payouts/[id]/remit/actions.ts` (planned) — `registerInstructorRemittance` Server Action (pending → requested + 컬럼 UPDATE + 첨부 업로드)
  - `(app)/(instructor)/me/payouts/[id]/remit/page.tsx` (planned, optional) — 송금 등록 dedicated form 페이지 (또는 기존 `/me/payouts/[id]` 모달 통합)
  - `(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts` (planned) — `confirmRemittanceAndIssueReceipt` Server Action (atomic 6-step transaction)
  - `(app)/(operator)/settlements/[id]/page.tsx` (기존 확장) — `client_direct` + status=`requested` 시 RemittanceConfirmationPanel 노출
  - `(app)/(instructor)/me/payouts/[id]/page.tsx` (기존 확장) — `client_direct` + status=`pending` 시 "송금 완료 등록" CTA 노출 + status=`paid` 시 영수증 다운로드 링크 노출

- **UI 분기 로직**:
  - `SettlementStatusBadge` 확장 — flow별 라벨 매핑 (예: `client_direct` + `pending` → "수취 대기")
  - 운영자 정산 리스트 (`(operator)/settlements/page.tsx`) — flow 필터에 `client_direct` 옵션 추가
  - 운영자 정산 상세 — `client_direct` 흐름의 6-2 자금 흐름 시각화 (도식 또는 텍스트로 "고객사 → 강사 → 알고링크" 명시)

- **테스트** (vitest unit + 통합):
  - `src/lib/payouts/__tests__/receipt-number.test.ts` — 동시 5개 발급 시 모두 unique
  - `src/lib/payouts/__tests__/receipt-pdf.test.ts` — render 결과가 한국어 텍스트 포함, 알고링크 정보 포함
  - `src/lib/payouts/__tests__/organization-info.test.ts` — DB 행 우선, 없으면 env, 둘 다 없으면 ORGANIZATION_INFO_MISSING 에러
  - `src/lib/payouts/__tests__/client-direct-validation.test.ts` — 송금 금액 mismatch 거부, 영수증 재발급 차단
  - 통합 시나리오 (`__tests__/integration/receipt-flow.test.ts`):
    - 강사 송금 등록 → status pending → requested 전환 + 컬럼 UPDATE
    - 운영자 수취 확인 → atomic 6-step 트랜잭션 + 영수증 PDF 생성 + Storage 업로드 + 알림 INSERT
    - 영수증 번호 동시성 (병렬 5건)
    - paid 동결 후 재발급 거부
    - 송금 금액 불일치 거부
    - RLS: 강사 A가 강사 B의 영수증 path 접근 → 거부

- **한국어 + Asia/Seoul 일관**: 영수증 PDF의 발행일/거래일은 KST 표시 (`2026-05-01 (KST)`), 알림 본문도 한국어, 모든 신규 에러 메시지 한국어.

**Out of Scope (Exclusions — What NOT to Build):** §3 참조.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 마이그레이션 6건 모두 `supabase db reset` 후 정상 적용 (CHECK 제약, RLS, 시퀀스, 버킷 생성 확인)
- ✅ `client_direct` enum 값 추가 후 SPEC-PAYOUT-001 기존 `corporate`/`government` 흐름 회귀 없음 (16개 상태 전환 단위 테스트 그대로 PASS)
- ✅ CHECK 제약 확장 후 `client_direct + rate=5` INSERT 시 DB 거부 + zod 사전 거부 (이중 방어선)
- ✅ 강사 송금 등록 → status `pending → requested` + 6개 컬럼 중 3개(`instructor_remittance_amount_krw`, `client_payout_amount_krw`, 송금 영수증 첨부 시 `files` 신규 행) UPDATE/INSERT
- ✅ 운영자 수취 확인 atomic 트랜잭션 단일 호출로 (a) status `requested → paid`, (b) `instructor_remittance_received_at = now()`, (c) `receipt_file_id` 연결, (d) `receipt_number` 신규 발급 (UNIQUE), (e) `receipt_issued_at = now()`, (f) `notifications` 1행 INSERT, (g) 콘솔 로그 1줄 출력 모두 성공
- ✅ 영수증 PDF 한국어 정상 렌더 (NotoSansKR), A4 portrait, 단일 페이지, 알고링크 사업자 정보 정확 임베드
- ✅ 영수증 번호 동시성: 병렬 5개 발급 시 모두 unique (시퀀스 보장)
- ✅ paid 동결 검증: status=`paid`인 client_direct 정산에 운영자가 다시 confirm-remittance 호출 시 `RECEIPT_ALREADY_ISSUED` 또는 `STATUS_PAID_FROZEN` 한국어 에러 + DB 변경 없음
- ✅ 송금 금액 불일치: 강사가 입력한 금액 ≠ `instructor_remittance_amount_krw` → `REMITTANCE_AMOUNT_MISMATCH` form 에러 + status 변경 없음
- ✅ 운영자 수취 확인 시 입력한 실제 금액 ≠ `instructor_remittance_amount_krw` → `REMITTANCE_AMOUNT_MISMATCH` 에러 + 트랜잭션 롤백
- ✅ 알림 흐름: `notifications.type='receipt_issued'`, `link_url='/me/payouts/<id>'`, body에 영수증 번호 + 금액 포함, 콘솔 로그 정확한 형식 (`[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>`)
- ✅ Storage RLS: 강사 본인은 자신의 영수증 다운로드 가능, 다른 강사 영수증 path 접근 시 401/403 거부
- ✅ Algolink 사업자 정보 source: organization_info 행 존재 시 우선, 없으면 env, 둘 다 없으면 `ORGANIZATION_INFO_MISSING` 에러로 영수증 발급 거부
- ✅ Asia/Seoul 표시: 영수증 PDF의 발행일/거래일, 알림 body의 모든 timestamp 일관 (`YYYY-MM-DD KST` 또는 `YYYY-MM-DD HH:mm KST`)
- ✅ SPEC-PAYOUT-001 paid-freeze 인배리언트 그대로 통과
- ✅ 단위 테스트 라인 커버리지 ≥ 85% (receipt 모듈)
- ✅ 통합 테스트 시나리오 7건 모두 PASS (acceptance.md)
- ✅ axe DevTools `/me/payouts/[id]/remit`, `/settlements/[id]` (client_direct) critical 0건

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `FLOW`, `COLUMNS`, `INSTRUCTOR`, `OPERATOR`, `PDF`, `NOTIFY`, `RLS`.

### 2.1 REQ-RECEIPT-FLOW — settlement_flow 확장 + CHECK 제약

**REQ-RECEIPT-FLOW-001 (Ubiquitous)**
The system **shall** extend the `settlement_flow` PostgreSQL enum by adding the value `client_direct` via `ALTER TYPE settlement_flow ADD VALUE IF NOT EXISTS 'client_direct';` in migration `20260429000010_settlement_flow_client_direct.sql`.

**REQ-RECEIPT-FLOW-002 (Ubiquitous)**
The system **shall** extend the `settlements_withholding_rate_check` CHECK constraint to include the third disjunct `(settlement_flow = 'client_direct' AND withholding_tax_rate IN (3.30, 8.80))`, applied via DROP + RECREATE pattern in the same migration.

**REQ-RECEIPT-FLOW-003 (Unwanted Behavior)**
**IF** an INSERT or UPDATE attempts `settlement_flow = 'client_direct'` with `withholding_tax_rate` outside `{3.30, 8.80}`, **THEN** PostgreSQL **shall** reject the row via the CHECK constraint, returning error code `23514`.

**REQ-RECEIPT-FLOW-004 (Ubiquitous)**
The Drizzle schema (`src/db/schema/settlements.ts`) **shall** be updated to include `client_direct` in the `settlement_flow` enum literal type, and TypeScript types `SettlementFlow` exported from `src/lib/payouts/types.ts` **shall** include `'client_direct'`.

**REQ-RECEIPT-FLOW-005 (Ubiquitous)**
The zod schema in `src/lib/payouts/validation.ts` **shall** extend its `superRefine` cross-field validation: when `settlement_flow === 'client_direct'` and `withholding_tax_rate ∉ {3.30, 8.80}`, the schema **shall** reject with the Korean error `TAX_RATE_CLIENT_DIRECT_INVALID` ("고객 직접 정산 원천세율은 3.30% 또는 8.80%만 가능합니다.") before the form submits.

**REQ-RECEIPT-FLOW-006 (Optional Feature)**
**WHERE** an existing `settlements` row carries `settlement_flow IN ('corporate', 'government')`, the system **shall** continue to honor SPEC-PAYOUT-001 behavior unchanged; no data migration of historical rows is required.

### 2.2 REQ-RECEIPT-COLUMNS — settlements 신규 컬럼 + 무결성

**REQ-RECEIPT-COLUMNS-001 (Ubiquitous)**
The system **shall** add 6 nullable columns to `settlements` via migration `20260429000020_settlements_remittance_columns.sql`:
- `instructor_remittance_amount_krw bigint` (강사가 알고링크에 송금해야 할 금액)
- `instructor_remittance_received_at timestamptz` (운영자가 입금 확인한 시각)
- `client_payout_amount_krw bigint` (고객사가 강사에게 송금한 금액, 정보용)
- `receipt_file_id uuid REFERENCES files(id) ON DELETE SET NULL` (영수증 PDF 파일)
- `receipt_issued_at timestamptz` (영수증 발급 시각)
- `receipt_number text UNIQUE` (RCP-YYYY-NNN)

**REQ-RECEIPT-COLUMNS-002 (Ubiquitous)**
The `receipt_number` column **shall** carry a UNIQUE index `idx_settlements_receipt_number` to enforce no two settlements share the same receipt number.

**REQ-RECEIPT-COLUMNS-003 (State-Driven)**
**WHILE** a settlement row has `status = 'paid'` and `settlement_flow = 'client_direct'`, the system **shall** require `receipt_file_id`, `receipt_number`, and `receipt_issued_at` to be non-null; this consistency is enforced at the application layer (Server Action transaction atomicity) and not via DB trigger.

**REQ-RECEIPT-COLUMNS-004 (Ubiquitous)**
The Drizzle schema **shall** treat all 6 new columns as nullable in TypeScript types; the application code **shall** narrow type via `if (settlement.receipt_file_id !== null)` before accessing.

**REQ-RECEIPT-COLUMNS-005 (Unwanted Behavior)**
**IF** a Server Action attempts to UPDATE `receipt_number` or `receipt_file_id` on a settlement that already has these populated (i.e., re-issuance attempt), **THEN** the action **shall** reject with `RECEIPT_ALREADY_ISSUED` ("이미 영수증이 발급된 정산입니다.") and the DB **shall** remain unchanged.

**REQ-RECEIPT-COLUMNS-006 (Ubiquitous)**
The system **shall** include the 6 new columns in the SELECT projection of `getSettlementById` (`src/lib/payouts/queries.ts`), but **shall** explicitly exclude them from the default UPDATABLE column whitelist; only the dedicated atomic transaction (`confirmRemittanceAndIssueReceipt`) and the instructor remittance registration action (`registerInstructorRemittance`) are permitted to set them.

### 2.3 REQ-RECEIPT-INSTRUCTOR — 강사 송금 등록 흐름

**REQ-RECEIPT-INSTRUCTOR-001 (Ubiquitous)**
The system **shall** extend the instructor settlement detail page `(app)/(instructor)/me/payouts/[id]/page.tsx` (SPEC-ME-001 M5 산출물) to display a "송금 완료 등록" CTA when `settlement_flow = 'client_direct' AND status = 'pending'`.

**REQ-RECEIPT-INSTRUCTOR-002 (Event-Driven)**
**WHEN** an instructor clicks "송금 완료 등록", the system **shall** display a form (modal or dedicated route `(instructor)/me/payouts/[id]/remit/`) collecting (a) 송금 일자 (date input, default today, max today, min = 정산 행 created_at), (b) 송금 금액 KRW (number input, required, must equal `instructor_remittance_amount_krw`), (c) 선택적 송금 영수증 첨부 (file input, accept image/* or pdf, max 10MB).

**REQ-RECEIPT-INSTRUCTOR-003 (Unwanted Behavior)**
**IF** the instructor enters 송금 금액 ≠ `instructor_remittance_amount_krw` (the operator-set expected amount), **THEN** the form **shall** reject with `REMITTANCE_AMOUNT_MISMATCH` ("송금 금액이 정산 정보와 일치하지 않습니다.") via zod refinement, **before** Server Action call; status **shall not** change.

**REQ-RECEIPT-INSTRUCTOR-004 (Event-Driven)**
**WHEN** the instructor submits a valid remittance registration form, the system **shall** invoke Server Action `registerInstructorRemittance({ settlementId, remittanceDate, remittanceAmountKrw, evidenceFile? })` which performs in a single DB transaction:
1. `validateTransition(currentStatus, 'requested')` (must be `pending → requested`)
2. If `evidenceFile` provided: upload to Storage path `payout-evidence/<settlement_id>/<uuid>.<ext>` + INSERT `files` row with `kind='remittance_evidence'`, `owner_id=instructor's user_id`
3. `UPDATE settlements SET status='requested', client_payout_amount_krw=$expectedClientPayout (계산 = instructor_fee_krw - withholding_tax_amount_krw), updated_at=now() WHERE id=$1 AND status='pending' AND settlement_flow='client_direct'`
4. (트리거 자동) `settlement_status_history` 자동 INSERT

**REQ-RECEIPT-INSTRUCTOR-005 (State-Driven)**
**WHILE** an instructor settlement detail page renders a `client_direct` settlement with `status = 'requested'`, the system **shall** display the registered 송금 일자 + 송금 금액 + 첨부 파일 다운로드 링크(if exists), and disable the "송금 완료 등록" CTA.

**REQ-RECEIPT-INSTRUCTOR-006 (Optional Feature)**
**WHERE** the settlement reaches `status = 'paid'`, the instructor detail page **shall** display the receipt download link (file from `receipt_file_id`) prominently; the link target **shall** be a signed Supabase Storage URL with 1-hour expiry generated server-side.

### 2.4 REQ-RECEIPT-OPERATOR — 운영자 수취 확인 + 영수증 발급 atomic

**REQ-RECEIPT-OPERATOR-001 (Ubiquitous)**
The system **shall** extend the operator settlement detail page `(app)/(operator)/settlements/[id]/page.tsx` (SPEC-PAYOUT-001 산출물) to display a "수취 확인 + 영수증 발급" panel when `settlement_flow = 'client_direct' AND status = 'requested'`.

**REQ-RECEIPT-OPERATOR-002 (Event-Driven)**
**WHEN** an operator opens the confirmation panel, the system **shall** display read-only details (registered 송금 일자, 송금 금액, 첨부 파일) and an input form: (a) 입금 확인 일자 (date input, default today), (b) 실제 입금 금액 KRW (must equal `instructor_remittance_amount_krw`), (c) 선택적 메모 (textarea, max 2000).

**REQ-RECEIPT-OPERATOR-003 (Event-Driven)**
**WHEN** an operator submits the confirmation form, the system **shall** invoke Server Action `confirmRemittanceAndIssueReceipt({ settlementId, receivedDate, receivedAmountKrw, memo? })` which performs the following 6 steps in a **single atomic DB transaction wrapping in-memory PDF generation and Storage upload**:

1. `validateTransition(currentStatus, 'paid')` (must be `requested → paid`)
2. Verify `receivedAmountKrw === instructor_remittance_amount_krw`; reject with `REMITTANCE_AMOUNT_MISMATCH` otherwise
3. Acquire `receipt_number` via `SELECT app.next_receipt_number()` (calls `nextval('receipt_number_seq')` + format `RCP-YYYY-NNN`)
4. Render PDF in memory via `renderReceiptPdf({ settlement, instructor, organization })`
5. Upload PDF to Storage path `payout-receipts/<settlement_id>/<receipt_number>.pdf` + INSERT `files` row with `kind='receipt'`, `owner_id=instructor's user_id`
6. `UPDATE settlements SET status='paid', instructor_remittance_received_at=$receivedDate, receipt_file_id=$fileId, receipt_number=$receiptNumber, receipt_issued_at=now(), notes = COALESCE(notes, '') || $memo, updated_at=now() WHERE id=$1 AND status='requested' AND settlement_flow='client_direct'`
7. INSERT `notifications (recipient_id, type='receipt_issued', title, body, link_url)` row
8. `console.log("[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>")`

**REQ-RECEIPT-OPERATOR-004 (Unwanted Behavior)**
**IF** any of steps 3-7 in REQ-RECEIPT-OPERATOR-003 fail (DB error, Storage error, RLS rejection), **THEN** the system **shall** roll back the entire transaction (DB rollback + best-effort Storage delete of uploaded PDF) and return the appropriate Korean error (`RECEIPT_GENERATION_FAILED`, `STORAGE_UPLOAD_FAILED`, `ORGANIZATION_INFO_MISSING`); the settlement status **shall** remain `requested`.

**REQ-RECEIPT-OPERATOR-005 (Unwanted Behavior)**
**IF** the operator submits confirmation for a settlement that already has `receipt_number IS NOT NULL` (e.g., race condition or stale browser tab), **THEN** the WHERE clause `status='requested'` in the UPDATE **shall** match zero rows, and the action **shall** return `RECEIPT_ALREADY_ISSUED` ("이미 영수증이 발급된 정산입니다.") with no DB change.

**REQ-RECEIPT-OPERATOR-006 (State-Driven)**
**WHILE** a `client_direct` settlement has `status = 'paid'`, the operator detail page **shall** display: (a) 발급 영수증 번호, (b) 발급 일시 (KST), (c) 영수증 PDF 다운로드 링크, (d) all status-change buttons disabled per SPEC-PAYOUT-001 paid-freeze.

**REQ-RECEIPT-OPERATOR-007 (Ubiquitous)**
The system **shall** display a flow indicator on the operator detail page for `client_direct` settlements showing the cash flow textually as `"고객사 → 강사 → 알고링크"`, distinguishing it from `corporate`/`government` flows (`"고객사 → 알고링크 → 강사"`).

### 2.5 REQ-RECEIPT-PDF — 영수증 PDF 생성

**REQ-RECEIPT-PDF-001 (Ubiquitous)**
The system **shall** generate the receipt PDF using `@react-pdf/renderer` (already declared in package.json per SPEC-ME-001 M8) with NotoSansKR fonts loaded from `public/fonts/NotoSansKR-Regular.ttf` and `public/fonts/NotoSansKR-Bold.ttf`.

**REQ-RECEIPT-PDF-002 (Ubiquitous)**
The receipt PDF layout **shall** be A4 portrait, single page, with the following sections in order:
1. Header: "영수증" 타이틀 (bold, 24pt) + 영수증 번호 (right-aligned, e.g., `RCP-2026-001`) + 발행일 (KST, `YYYY-MM-DD`)
2. 강사 정보: 강사명, 사업자등록번호 (있을 경우; PII 복호화 RPC 경유), 주소 (선택)
3. 알고링크 정보: 상호 ("주식회사 알고링크" 등), 사업자등록번호, 대표자명, 사업장 주소, 연락처
4. 거래 정보 (테이블): 송금일, 입금 금액 (KRW), 사유 ("강의 사업비 정산")
5. 본문 텍스트: "위 금액을 정히 영수합니다."
6. Footer: 발행처 + 발행 시스템 표기 ("Algolink AI Agentic Platform")

**REQ-RECEIPT-PDF-003 (Ubiquitous)**
The system **shall** load Algolink organization information via `getOrganizationInfo()` which:
- Priority 1: SELECT first row from `organization_info` table where `id = 1`
- Priority 2 (fallback): Read environment variables `ORG_NAME`, `ORG_BIZ_NUMBER`, `ORG_REPRESENTATIVE`, `ORG_ADDRESS`, `ORG_CONTACT`
- Failure: throw `ORGANIZATION_INFO_MISSING` error if neither source provides complete data

**REQ-RECEIPT-PDF-004 (Unwanted Behavior)**
**IF** the PDF rendering fails (font load error, react-pdf exception, missing organization info), **THEN** the system **shall** return `RECEIPT_GENERATION_FAILED` ("영수증 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") and the calling Server Action **shall** roll back the transaction.

**REQ-RECEIPT-PDF-005 (Ubiquitous)**
The PDF **shall** display all dates in Asia/Seoul timezone using `formatKstDate()` from `src/lib/format/datetime.ts`; all amounts **shall** be formatted via `formatKRW()` (e.g., `1,234,567 원`).

**REQ-RECEIPT-PDF-006 (Optional Feature)**
**WHERE** the instructor's `business_number` (사업자등록번호) is stored encrypted in `instructors.business_number_enc`, the system **shall** decrypt it via the existing `decrypt_payout_field` RPC (SPEC-ME-001 M7) inside the same transaction, and embed the decrypted value into the PDF; if decryption fails or the field is null, the field **shall** be omitted from the PDF (not blocked).

### 2.6 REQ-RECEIPT-NOTIFY — receipt_issued 알림 + 콘솔 로그

**REQ-RECEIPT-NOTIFY-001 (Ubiquitous)**
The system **shall** add a new value `receipt_issued` to the existing `notification_type` enum via migration `20260429000050_notification_type_receipt_issued.sql` using `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`.

**REQ-RECEIPT-NOTIFY-002 (Event-Driven)**
**WHEN** the atomic transaction in REQ-RECEIPT-OPERATOR-003 reaches step 7, the system **shall** INSERT a row into `notifications` with:
- `recipient_id = (SELECT user_id FROM instructors WHERE id = settlements.instructor_id)`
- `type = 'receipt_issued'`
- `title = "영수증 발급 완료"`
- `body = "${receipt_number} (${formatKRW(amount)})"` (e.g., `"RCP-2026-001 (2,000,000 원)"`)
- `link_url = '/me/payouts/<settlement_id>'`
- `read_at = NULL`

**REQ-RECEIPT-NOTIFY-003 (Event-Driven)**
**WHEN** the atomic transaction reaches step 8, the system **shall** emit exactly one stdout line in the format `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>` (regex: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{3}$`); this serves as the SPEC-NOTIFY-001 hook identifier.

**REQ-RECEIPT-NOTIFY-004 (Unwanted Behavior)**
**IF** the `notifications` INSERT fails (DB error, RLS rejection), **THEN** the entire transaction (including status update, file row, Storage upload) **shall** roll back; the user **shall** see `RECEIPT_GENERATION_FAILED`; no console.log is emitted.

**REQ-RECEIPT-NOTIFY-005 (Ubiquitous)**
The system **shall not** send actual email/SMS in this SPEC; email integration is delegated to SPEC-NOTIFY-001 which **shall** consume the console.log identifier line via stdout hook or file tail.

### 2.7 REQ-RECEIPT-RLS — Storage 버킷 + 영수증 접근 제어

**REQ-RECEIPT-RLS-001 (Ubiquitous)**
The system **shall** create a new Supabase Storage bucket `payout-receipts` via migration `20260429000040_payout_receipts_bucket.sql` with `public = false` and standard 50MB file size limit.

**REQ-RECEIPT-RLS-002 (Ubiquitous)**
The system **shall** define 3 RLS policies on `storage.objects` for the `payout-receipts` bucket:
- `payout_receipts_self_select` (SELECT, role: instructor): allow when `auth.uid() = (SELECT i.user_id FROM instructors i JOIN settlements s ON s.instructor_id = i.id WHERE s.receipt_file_id IN (SELECT id FROM files WHERE storage_path = name))` — instructor can read only their own receipts
- `payout_receipts_operator_all` (ALL, role: operator/admin): allow full RW
- (default deny on all other roles via lack of policy)

**REQ-RECEIPT-RLS-003 (Ubiquitous)**
The `files` table **shall** receive new rows with `kind = 'receipt'` for each issued receipt; the `owner_id` **shall** be set to the instructor's user_id; `storage_path` **shall** follow the convention `payout-receipts/<settlement_id>/<receipt_number>.pdf`.

**REQ-RECEIPT-RLS-004 (Unwanted Behavior)**
**IF** an instructor (role=instructor) attempts to fetch a receipt PDF whose `owner_id` differs from their `auth.uid()`, **THEN** Supabase Storage **shall** return 401/403; the application **shall not** expose unsigned URLs of receipts.

**REQ-RECEIPT-RLS-005 (Ubiquitous)**
The system **shall** generate signed URLs for receipt PDF download with 1-hour expiry using `supabase.storage.from('payout-receipts').createSignedUrl(path, 3600)` from server-side code only; the unsigned `storage_path` **shall not** be exposed to the client.

**REQ-RECEIPT-RLS-006 (Ubiquitous)**
The system **shall not** introduce any service-role Supabase client in this SPEC; all DB and Storage operations during the atomic Server Action transaction **shall** use the operator's user-scoped session client to keep RLS as the authoritative authorization layer.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

본 SPEC은 다음을 명시적으로 빌드하지 않으며, 별도 SPEC으로 위임한다.

| 항목 | 위임/사유 |
|------|----------|
| 실제 이메일/SMS 발송 (Resend/SES/카카오 알림톡) | SPEC-NOTIFY-001 (콘솔 로그 hook 식별자만 제공) |
| 국세청 세금계산서 자동 발행 (e세로 / Popbill) | SPEC-PAYOUT-INVOICE-XXX (후속) |
| 영수증 취소 / 재발급 / 대체 발급 UI | (admin 직접 SQL로만, 후속 SPEC) |
| 영수증 일괄 발급 (bulk issue) | SPEC-PAYOUT-BULK-XXX (후속) |
| 강사 송금 자동 매칭 (KB/신한 OpenAPI 입금 내역 동기화) | SPEC-PAYOUT-BANKING-XXX (후속) |
| 알고링크 사업자 정보 admin UI 편집 화면 | (MVP는 SQL/env 직접 입력, admin 화면은 후속) |
| organization_info 다중 행 / 다중 법인 | 단일 워크스페이스 가정 (product.md §3.3 [1]) |
| 영수증 인쇄용 별도 레이아웃 | A4 portrait 단일 디자인만 |
| 영수증 다국어 (영어/일본어) | 한국어 단일 (product.md §3.3 [2]) |
| PG 연동 (카카오페이/토스/네이버페이) | 후속 |
| 강사 송금 영수증 첨부 OCR / 자동 검증 | 후속 |
| 영수증 워터마크 / 디지털 서명 / 전자 인장 | 후속 |
| 정산 행 자동 생성 트리거 (project task_done → settlement INSERT) | SPEC-PAYOUT-AUTOGEN-XXX |
| 정산 행 신규 등록 UI (운영자가 client_direct 정산 행 직접 INSERT) | SPEC-PAYOUT-CREATE-XXX (현재는 admin SQL/seed) |
| 영수증 검색 / 필터 / 다운로드 페이지 (운영자 영역) | 후속 (현재는 정산 상세에서 1건씩 다운로드) |
| 영수증 발급 이력 audit log 별도 테이블 | `settlement_status_history` + `notifications` 조합으로 충분 |
| 강사 본인 영수증 일괄 다운로드 (zip) | 후속 |
| 영수증 미발급 알람 (운영자가 N일 이상 확인 안 한 정산) | SPEC-NOTIFY-001 |
| 6-1 ↔ 6-2 흐름 변경 (settlement_flow UPDATE) | 데이터 정합성 위험, 후속 SPEC에서 검토 |
| 모바일 전용 영수증 발급 UI | 데스크톱 우선 (SPEC-MOBILE-001 반응형 가이드만) |

---

## 4. 영향 범위 (Affected Files)

### 4.1 신규 마이그레이션 (`supabase/migrations/`)

- `20260429000010_settlement_flow_client_direct.sql` — `settlement_flow` enum value 추가 + CHECK 제약 RECREATE
- `20260429000020_settlements_remittance_columns.sql` — 6개 nullable 컬럼 + UNIQUE + FK
- `20260429000030_organization_info.sql` — singleton 테이블 + CHECK (id=1) + RLS
- `20260429000040_payout_receipts_bucket.sql` — Storage 버킷 + 3개 RLS 정책
- `20260429000050_notification_type_receipt_issued.sql` — `notification_type` enum value 추가
- `20260429000060_receipt_number_seq.sql` — SEQUENCE + `app.next_receipt_number()` 함수

### 4.2 신규 도메인 모듈 (`src/lib/payouts/`)

- `src/lib/payouts/receipt-pdf.ts` (planned, @react-pdf/renderer + NotoSansKR)
- `src/lib/payouts/receipt-number.ts` (planned, RPC 래퍼)
- `src/lib/payouts/organization-info.ts` (planned, DB 우선 + env fallback)
- `src/lib/payouts/client-direct-validation.ts` (planned, zod refinement)
- `src/lib/payouts/__tests__/receipt-pdf.test.ts`
- `src/lib/payouts/__tests__/receipt-number.test.ts` (동시성 검증)
- `src/lib/payouts/__tests__/organization-info.test.ts`
- `src/lib/payouts/__tests__/client-direct-validation.test.ts`

### 4.3 기존 모듈 확장

- `src/lib/payouts/types.ts` — `SettlementFlow`에 `'client_direct'` 추가, `Settlement` 타입에 6개 컬럼 추가
- `src/lib/payouts/status-machine.ts` — `getStatusLabel(status, flow)` 함수 추가
- `src/lib/payouts/tax-calculator.ts` — `validateTaxRate`에 `client_direct` 분기
- `src/lib/payouts/validation.ts` — zod superRefine에 `client_direct` 분기 + `TAX_RATE_CLIENT_DIRECT_INVALID`
- `src/lib/payouts/errors.ts` — 6개 신규 에러 메시지 (`REMITTANCE_AMOUNT_MISMATCH`, `RECEIPT_ALREADY_ISSUED`, `RECEIPT_GENERATION_FAILED`, `ORGANIZATION_INFO_MISSING`, `STORAGE_UPLOAD_FAILED`, `TAX_RATE_CLIENT_DIRECT_INVALID`)
- `src/lib/payouts/queries.ts` — `getSettlementById` SELECT 확장, UPDATABLE_COLUMNS에 6개 컬럼 추가하지 **않음** (전용 함수만 변경 가능)
- `src/db/schema/settlements.ts` — Drizzle 스키마 동기화

### 4.4 신규 컴포넌트 + 라우트

- `src/components/payouts/ReceiptDocument.tsx` (planned, @react-pdf/renderer)
- `src/components/payouts/RemittanceRegistrationForm.tsx` (planned, react-hook-form + zod)
- `src/components/payouts/RemittanceConfirmationPanel.tsx` (planned)
- `src/components/payouts/ReceiptPreviewLink.tsx` (planned)
- `src/components/payouts/ClientDirectStatusBadge.tsx` (planned)
- `src/app/(app)/(instructor)/me/payouts/[id]/remit/actions.ts` (planned)
- `src/app/(app)/(instructor)/me/payouts/[id]/remit/page.tsx` (planned, optional dedicated route)
- `src/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts` (planned)

### 4.5 기존 페이지 확장

- `src/app/(app)/(instructor)/me/payouts/[id]/page.tsx` — `client_direct` + status별 분기 (CTA + 영수증 다운로드)
- `src/app/(app)/(operator)/settlements/[id]/page.tsx` — `client_direct` 흐름 시 RemittanceConfirmationPanel + flow indicator
- `src/app/(app)/(operator)/settlements/page.tsx` — flow 필터에 `client_direct` 옵션 추가
- `src/components/payouts/SettlementStatusBadge.tsx` — flow별 라벨 분기

### 4.6 변경 없음 (충돌 검증)

- **SPEC-PAYOUT-002 (sibling)**: 6-1 + sessions 보강 SPEC. 본 SPEC과 (a) `settlements.settlement_flow` enum 확장은 순서 무관 (둘 다 `ALTER TYPE ADD VALUE IF NOT EXISTS`), (b) 본 SPEC의 6개 컬럼 추가 vs SPEC-PAYOUT-002의 sessions 테이블 추가는 별도 테이블 작업으로 충돌 없음, (c) CHECK 제약 RECREATE 시 한 SPEC이 먼저 적용되면 다른 SPEC은 추가 disjunct만 합치면 됨 (마이그레이션 timestamp 순서 의존). 본 SPEC의 timestamp는 `20260429000010~060`이므로 SPEC-PAYOUT-002와 timestamp 충돌 회피 필요.
- **SPEC-PAYOUT-001**: 변경 없음. 본 SPEC은 `client_direct` 흐름만 추가하고 `corporate`/`government` 흐름 회귀 없음.
- **SPEC-DB-001**: 변경 없음. 본 SPEC은 SPEC-DB-001 산출물 위에 마이그레이션 6건 추가.
- **SPEC-ME-001 M5/M7/M8**: 영수증 PDF 렌더링은 SPEC-ME-001 M8 폰트 + RLS 패턴 재사용. M5 정산 상세 페이지를 본 SPEC이 확장.
- **SPEC-AUTH-001**: 변경 없음. 라우트 가드 그대로 사용.
- **SPEC-NOTIFY-001**: 변경 없음. 본 SPEC이 콘솔 로그 hook 식별자 제공.

---

## 5. 기술 접근 (Technical Approach)

### 5.1 전체 흐름 다이어그램 (텍스트)

```
[고객사]
   │ ① 강의비 송금 (원천세 차감)
   ▼
[강사] ─────────────────────────────────────────┐
   │ ② "송금 완료 등록" 클릭 → /me/payouts/[id]/remit
   │   - 송금 일자, 송금 금액, 첨부 파일 입력
   │   → registerInstructorRemittance Server Action
   │     - status: pending → requested
   │     - client_payout_amount_krw, instructor_remittance_amount_krw 갱신
   │     - 첨부 파일 Storage 업로드 (kind='remittance_evidence')
   │
   │ ③ 알고링크 계좌로 마진 분 송금
   ▼
[알고링크 운영자] /settlements/[id]
   │ ④ "수취 확인 + 영수증 발급" 클릭
   │   - 입금 확인 일자, 실제 입금 금액, 메모 입력
   │   → confirmRemittanceAndIssueReceipt Server Action
   │     ATOMIC 트랜잭션:
   │     1. validateTransition('requested', 'paid')
   │     2. amount mismatch 검증
   │     3. nextval('receipt_number_seq') → 'RCP-2026-001'
   │     4. renderReceiptPdf() (in-memory Buffer)
   │     5. Storage upload + files INSERT (kind='receipt')
   │     6. UPDATE settlements (status='paid', receipt_*, instructor_remittance_received_at)
   │     7. INSERT notifications (type='receipt_issued')
   │     8. console.log("[notif] receipt_issued → ...")
   │
   ▼
[강사 알림 + 영수증 다운로드]
   - /me/payouts/[id] 진입 시 영수증 PDF 다운로드 링크 노출
   - signed URL 1시간 만료
```

### 5.2 영수증 번호 발급 (동시성 안전)

```sql
-- 20260429000060_receipt_number_seq.sql
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

CREATE OR REPLACE FUNCTION app.next_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num bigint;
BEGIN
  SELECT nextval('receipt_number_seq') INTO next_num;
  RETURN 'RCP-' || EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Seoul')::text || '-' || LPAD(next_num::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO authenticated;
```

호출:
```ts
const { data, error } = await supabase.rpc('next_receipt_number');
// data: 'RCP-2026-001'
```

동시성: SEQUENCE는 DB 레벨에서 atomic. 병렬 호출 시 1, 2, 3, ... 순으로 발급되며 중복 없음. UNIQUE 인덱스가 추가 방어선.

### 5.3 atomic 트랜잭션 (TypeScript)

```ts
// src/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts (개념)
export async function confirmRemittanceAndIssueReceipt(input: ConfirmInput) {
  const supabase = await createServerClient();

  // 1. Pre-transaction validation
  const settlement = await getSettlementById(input.settlementId);
  if (settlement.status !== 'requested' || settlement.settlement_flow !== 'client_direct') {
    return { ok: false, error: ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (input.receivedAmountKrw !== settlement.instructor_remittance_amount_krw) {
    return { ok: false, error: ERRORS.REMITTANCE_AMOUNT_MISMATCH };
  }

  // 2. Render PDF in memory (outside DB transaction to allow Buffer to be ready)
  const organization = await getOrganizationInfo();
  const instructor = await getInstructorWithDecryptedBizNumber(settlement.instructor_id);
  const receiptNumber = await nextReceiptNumber(); // RPC

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderReceiptPdf({
      settlement, instructor, organization, receiptNumber, issuedAt: new Date(),
    });
  } catch (e) {
    return { ok: false, error: ERRORS.RECEIPT_GENERATION_FAILED };
  }

  // 3. Upload to Storage
  const storagePath = `payout-receipts/${input.settlementId}/${receiptNumber}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('payout-receipts')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' });
  if (uploadErr) return { ok: false, error: ERRORS.STORAGE_UPLOAD_FAILED };

  // 4. DB transaction: files INSERT + settlements UPDATE + notifications INSERT
  // (Drizzle transaction; rollback rolls back DB only — Storage cleanup is best-effort)
  try {
    await db.transaction(async (tx) => {
      const [file] = await tx.insert(filesTable).values({
        kind: 'receipt',
        storage_path: storagePath,
        owner_id: instructor.user_id,
        size_bytes: pdfBuffer.length,
        mime_type: 'application/pdf',
      }).returning();

      const updated = await tx.update(settlementsTable)
        .set({
          status: 'paid',
          instructor_remittance_received_at: input.receivedDate,
          receipt_file_id: file.id,
          receipt_number: receiptNumber,
          receipt_issued_at: new Date(),
          notes: input.memo ? `${settlement.notes ?? ''}\n${input.memo}`.trim() : settlement.notes,
          updated_at: new Date(),
        })
        .where(and(
          eq(settlementsTable.id, input.settlementId),
          eq(settlementsTable.status, 'requested'),
          eq(settlementsTable.settlement_flow, 'client_direct'),
        ))
        .returning();

      if (updated.length === 0) {
        throw new Error(ERRORS.STALE_TRANSITION);
      }

      await tx.insert(notificationsTable).values({
        recipient_id: instructor.user_id,
        type: 'receipt_issued',
        title: '영수증 발급 완료',
        body: `${receiptNumber} (${formatKRW(input.receivedAmountKrw)})`,
        link_url: `/me/payouts/${input.settlementId}`,
      });
    });
  } catch (e) {
    // Best-effort Storage cleanup
    await supabase.storage.from('payout-receipts').remove([storagePath]).catch(() => {});
    return { ok: false, error: e.message ?? ERRORS.RECEIPT_GENERATION_FAILED };
  }

  // 5. Console log (post-commit, non-rollback)
  console.log(`[notif] receipt_issued → instructor_id=${instructor.id} settlement_id=${input.settlementId} receipt_number=${receiptNumber}`);

  revalidatePath(`/settlements/${input.settlementId}`);
  revalidatePath('/settlements');
  return { ok: true, receiptNumber };
}
```

원자성 보장:
- DB 부분은 transaction으로 atomic
- Storage 업로드는 transaction 밖에서 먼저 수행 (Buffer는 in-memory)
- DB transaction 실패 시 Storage object 삭제는 best-effort (로그만 남김)
- Storage 업로드 후 DB 실패 → 고아 파일 발생 가능 (cron job으로 정리 가능, 후속 SPEC)
- 중복 발급 방지: WHERE `status='requested'` 조건 + UNIQUE 인덱스 (receipt_number)

### 5.4 영수증 PDF 컴포넌트

```tsx
// src/components/payouts/ReceiptDocument.tsx (개념, planned)
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: '/fonts/NotoSansKR-Regular.ttf' },
    { src: '/fonts/NotoSansKR-Bold.ttf', fontWeight: 'bold' },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'NotoSansKR' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  // ...
});

export function ReceiptDocument({ settlement, instructor, organization, receiptNumber, issuedAt }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>영수증</Text>
          <Text>{receiptNumber}</Text>
        </View>
        <Text>발행일: {formatKstDate(issuedAt)}</Text>
        {/* 강사 정보, 알고링크 정보, 거래 정보 */}
      </Page>
    </Document>
  );
}
```

PDF 렌더는 서버 측 Node.js 환경에서 `renderToBuffer(<ReceiptDocument ... />)` 호출.

### 5.5 organization_info 테이블

```sql
CREATE TABLE organization_info (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL,
  business_number text NOT NULL,
  representative text NOT NULL,
  address text NOT NULL,
  contact text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_info_admin_all ON organization_info FOR ALL TO authenticated
USING ((auth.jwt()->>'role')::text = 'admin')
WITH CHECK ((auth.jwt()->>'role')::text = 'admin');

CREATE POLICY org_info_operator_select ON organization_info FOR SELECT TO authenticated
USING ((auth.jwt()->>'role')::text IN ('operator', 'admin'));

-- Seed (optional, MVP)
INSERT INTO organization_info (id, name, business_number, representative, address, contact)
VALUES (1, '주식회사 알고링크', 'TBD', 'TBD', 'TBD', 'TBD')
ON CONFLICT (id) DO NOTHING;
```

CHECK (id = 1)로 단일 행 강제. 운영 중 이 행을 admin이 SQL로 직접 갱신하거나 (후속 SPEC) admin UI 추가.

### 5.6 강사 송금 등록 흐름

```ts
// src/app/(app)/(instructor)/me/payouts/[id]/remit/actions.ts (개념)
export async function registerInstructorRemittance(input: RemitInput) {
  const settlement = await getSettlementById(input.settlementId);

  if (settlement.status !== 'pending' || settlement.settlement_flow !== 'client_direct') {
    return { ok: false, error: ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (input.remittanceAmountKrw !== settlement.instructor_remittance_amount_krw) {
    return { ok: false, error: ERRORS.REMITTANCE_AMOUNT_MISMATCH };
  }

  const expectedClientPayout = settlement.instructor_fee_krw - settlement.withholding_tax_amount_krw;

  await db.transaction(async (tx) => {
    let evidenceFileId: string | null = null;
    if (input.evidenceFile) {
      const path = `payout-evidence/${input.settlementId}/${crypto.randomUUID()}.${ext}`;
      // Upload to Storage (best-effort, before DB)
      // ...
      const [file] = await tx.insert(filesTable).values({ kind: 'remittance_evidence', ... }).returning();
      evidenceFileId = file.id;
    }

    await tx.update(settlementsTable)
      .set({
        status: 'requested',
        client_payout_amount_krw: expectedClientPayout,
        // instructor_remittance_amount_krw는 운영자가 사전 설정한 값 그대로 유지
        updated_at: new Date(),
      })
      .where(and(eq(settlementsTable.id, input.settlementId), eq(settlementsTable.status, 'pending')));
  });

  return { ok: true };
}
```

### 5.7 의존성

- 신규 패키지: 없음 (`@react-pdf/renderer`는 SPEC-ME-001 M8에서 이미 설치)
- 기존 활용: `drizzle-orm`, `@supabase/ssr`, `react-hook-form`, `zod`, `lucide-react`
- NotoSansKR 폰트: `public/fonts/NotoSansKR-{Regular,Bold}.ttf` 그대로 (SPEC-ME-001 M8)
- pgcrypto RPC: SPEC-ME-001 M7 산출물 그대로

### 5.8 환경 변수 추가

```
ORG_NAME=주식회사 알고링크
ORG_BIZ_NUMBER=000-00-00000
ORG_REPRESENTATIVE=대표자명
ORG_ADDRESS=서울특별시 ...
ORG_CONTACT=02-0000-0000
```

organization_info 테이블이 우선이며, 환경변수는 fallback. 운영 환경에서는 organization_info 행을 권장.

### 5.9 Drizzle 스키마 동기화

```ts
// src/db/schema/settlements.ts (확장)
export const settlementFlowEnum = pgEnum('settlement_flow', [
  'corporate', 'government', 'client_direct'  // ← 추가
]);

export const settlements = pgTable('settlements', {
  // ... 기존 컬럼
  instructor_remittance_amount_krw: bigint('instructor_remittance_amount_krw', { mode: 'number' }),
  instructor_remittance_received_at: timestamp('instructor_remittance_received_at', { withTimezone: true }),
  client_payout_amount_krw: bigint('client_payout_amount_krw', { mode: 'number' }),
  receipt_file_id: uuid('receipt_file_id').references(() => files.id, { onDelete: 'set null' }),
  receipt_issued_at: timestamp('receipt_issued_at', { withTimezone: true }),
  receipt_number: text('receipt_number').unique(),
});
```

---

## 6. UX 흐름 요약 (UX Flow Summary)

### 6.1 강사 송금 등록 → 운영자 수취 확인 → 영수증 수령 (정상 흐름)

1. 운영자가 admin SQL/seed로 `client_direct` 정산 행을 사전 생성 (status=pending, instructor_remittance_amount_krw 사전 설정)
2. 강사가 `/me/payouts` 진입 → 해당 정산 행 status="수취 대기" (한국어 라벨)
3. 강사가 행 클릭 → `/me/payouts/[id]` 상세 진입
4. "송금 완료 등록" CTA 클릭 → 폼 모달/페이지 진입
5. 송금 일자, 송금 금액 (사전 설정값과 일치), 선택적 첨부 파일 입력
6. 제출 → status `pending → requested` (UI: "입금 확인 대기")
7. 운영자가 `/settlements?flow=client_direct&status=requested` 진입 → 해당 정산 클릭
8. "수취 확인 + 영수증 발급" 패널에서 입금 확인 일자, 실제 입금 금액 (mismatch 검증), 메모 입력
9. 제출 → atomic 트랜잭션 (PDF 생성 + Storage 업로드 + status `requested → paid` + notifications INSERT + 콘솔 로그)
10. 강사가 `/me/payouts` 진입 → 알림 수신, 해당 정산 행 status="영수증 발급 완료"
11. 강사가 행 클릭 → 영수증 PDF 다운로드 링크 노출 (signed URL 1시간 만료)

### 6.2 송금 금액 불일치 거부 (강사 측)

1. 강사가 `instructor_remittance_amount_krw = 1,000,000`인 정산에 송금 금액으로 `1,500,000`을 입력
2. zod refinement가 즉시 거부 → `REMITTANCE_AMOUNT_MISMATCH` 한국어 에러 폼에 표시
3. Server Action 미호출, status 미변경

### 6.3 송금 금액 불일치 거부 (운영자 측)

1. 강사가 등록한 송금 금액 = `1,000,000`, 실제 입금 = `1,000,000`
2. 운영자가 실수로 실제 입금 금액에 `999,000` 입력 → 즉시 zod 거부
3. (Bypass 시도) 운영자가 dev tool로 `999,000` 강제 호출 → Server Action 내부에서 mismatch 검증 → `REMITTANCE_AMOUNT_MISMATCH` 반환, 트랜잭션 롤백

### 6.4 paid 동결 후 재발급 거부

1. status=paid인 client_direct 정산에 운영자가 confirm-remittance Server Action 재호출
2. UPDATE WHERE `status='requested'` 매칭 0행 → `RECEIPT_ALREADY_ISSUED` 반환
3. DB 변경 없음, 영수증 번호 재발급되지 않음

### 6.5 영수증 PDF 다운로드 (강사)

1. 강사 A가 `/me/payouts/[id]` 진입 (자신의 정산)
2. status=paid 시 "영수증 다운로드" 버튼 노출
3. 클릭 → 서버에서 signed URL 생성 (1시간 만료)
4. 브라우저가 PDF를 다운로드 또는 새 탭에서 표시 (한국어 NotoSansKR)

### 6.6 RLS 격리 (다른 강사 영수증 접근 차단)

1. 강사 A가 dev tool로 강사 B의 영수증 storage_path를 직접 fetch 시도
2. storage RLS 정책 `payout_receipts_self_select`가 owner_id 매칭 실패 → 401/403
3. 클라이언트 측에서 unsigned path 노출되지 않으므로 추측 어려움

### 6.7 알고링크 사업자 정보 미설정 시

1. organization_info 테이블 행 없음 + env 변수도 없음
2. 운영자가 영수증 발급 시도 → `getOrganizationInfo()` 가 `ORGANIZATION_INFO_MISSING` throw
3. atomic 트랜잭션 시작 전 거부 → 사용자에게 "알고링크 사업자 정보가 설정되지 않았습니다. 관리자에게 문의하세요." 표시
4. status 변경 없음

---

## 7. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given/When/Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ 강사 송금 등록 → status pending → requested + 6개 컬럼 중 3개 갱신
- ✅ 운영자 수취 확인 → atomic 트랜잭션 (status, receipt_*, notifications, 콘솔 로그) 모두 성공
- ✅ 영수증 PDF 한국어 정상 렌더 (NotoSansKR)
- ✅ 영수증 번호 동시성 (병렬 5건 모두 unique)
- ✅ 송금 금액 mismatch 거부 (강사 + 운영자 양쪽)
- ✅ paid 동결 후 재발급 거부 (`RECEIPT_ALREADY_ISSUED`)
- ✅ RLS — 다른 강사 영수증 접근 거부
- ✅ 영수증 발급 후 알림 수신 + 콘솔 로그 정확한 형식
- ✅ organization_info source: DB 우선, env fallback, 둘 다 없으면 거부
- ✅ SPEC-PAYOUT-001 회귀 없음 (corporate/government 흐름 16개 상태 전환 단위 테스트 PASS)

---

## 8. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| `settlement_flow` enum 추가 후 zod/types 동기화 누락 | 빌드 에러 또는 런타임 분기 누락 | M1에서 enum 확장 + types.ts + validation.ts + tax-calculator.ts 동시 수정. typecheck로 검증 |
| CHECK 제약 RECREATE 시 기존 데이터 위반 | 마이그레이션 실패 | RECREATE 전 `SELECT count(*) WHERE NOT (existing CHECK conditions)` 검증 (현 시점 기존 데이터는 모두 corporate/government 만족) |
| 영수증 번호 동시성 충돌 | 중복 번호 발급 | PostgreSQL SEQUENCE는 atomic. UNIQUE 인덱스 추가 방어선. 단위 테스트로 병렬 5건 발급 검증 |
| Storage 업로드 후 DB 실패 → 고아 파일 | 디스크 낭비 + 비식별 파일 | Best-effort Storage delete. 후속 cron SPEC에서 정리. 본 SPEC은 best-effort 로깅만 |
| PDF 렌더링 실패 (폰트 로드 에러, react-pdf 예외) | 영수증 발급 실패 | `RECEIPT_GENERATION_FAILED` 한국어 에러로 깔끔히 거부, 트랜잭션 롤백. NotoSansKR은 SPEC-ME-001에서 검증 완료 |
| organization_info 미설정 + env 미설정 | 영수증 발급 불가 | `ORGANIZATION_INFO_MISSING` 에러로 사용자 친화 안내. seed 마이그레이션에 placeholder TBD 행 추가 |
| 강사가 송금 금액을 시스템과 다르게 입력 | mismatch 거부, UX 마찰 | zod 사전 거부 + 한국어 안내 메시지에 "정산 정보의 송금 금액과 일치해야 합니다" 명시 |
| 운영자가 실제 입금 금액을 시스템과 다르게 입력 | mismatch 거부 | 양쪽 검증 (zod + Server Action 내부) |
| 영수증 PDF 한자/한글 깨짐 | 사용성 손상 | NotoSansKR 폰트 등록 검증 (SPEC-ME-001 M8에서 검증된 패턴) + 통합 테스트로 한국어 텍스트 추출 검증 |
| Storage RLS 정책 누락 시 모든 사용자가 영수증 접근 | 정보 노출 | 마이그레이션에 3개 RLS 정책 명시 + default deny 보장 + 단위 테스트로 cross-instructor 거부 검증 |
| 영수증 PDF 크기가 너무 커서 Storage 한도 초과 | 업로드 실패 | A4 단일 페이지 + NotoSansKR (4.4MB) 임베드되지 않고 외부 폰트 → PDF 크기 200KB 미만 예상 |
| `notification_type` enum 추가 후 NOTIFY-001 어댑터가 모든 enum 처리 누락 | 알림 미발송 | 본 SPEC은 콘솔 로그 hook 식별자 제공만. 실제 발송은 SPEC-NOTIFY-001 책임. 콘솔 로그 형식 명세 명시 |
| 6-1 ↔ 6-2 흐름 변경 (admin이 settlement_flow를 corporate → client_direct로 UPDATE) | 데이터 불일치 (withholding_tax_rate, instructor_remittance_amount_krw 의미 변동) | 본 SPEC은 settlement_flow UPDATE를 admin SQL로만 허용. 운영자 UI에서 settlement_flow 변경 미제공 |
| 영수증 번호 연도 경계 (12/31 → 1/1) 시 시퀀스 reset 누락 | RCP-2026-999 다음에 RCP-2027-1000 발생 | 본 SPEC은 단순 incrementing 시퀀스 + 연도 prefix만. 연도별 reset은 후속 SPEC. RCP-2027-1000도 unique이므로 기능적 문제 없음 |
| SPEC-PAYOUT-002 (sibling) 마이그레이션 timestamp 충돌 | 마이그레이션 순서 깨짐 | 본 SPEC timestamp `20260429000010~060` 사용, SPEC-PAYOUT-002와 충돌 회피 (SPEC-PAYOUT-002는 `20260429000100+` 또는 `20260430+` 사용 권장) |

---

## 9. 참고 자료 (References)

- `.moai/project/product.md`: F-205 정산 관리, §3.1 [F-104] 강사 정산 조회, §3.2 [F-205] 정산 관리
- `.moai/project/structure.md`: `src/lib/payouts/`, `(operator)/settlements/`, `(instructor)/me/payouts/` 디렉토리 설계
- `.moai/project/tech.md`: `@react-pdf/renderer` ADR-009, pgcrypto RPC ADR-010
- `.moai/specs/SPEC-DB-001/spec.md`: `settlements`/`notifications`/`files` 테이블, `notification_type` enum, RLS 정책
- `.moai/specs/SPEC-PAYOUT-001/spec.md`: 4-state 상태 머신, paid-freeze 인배리언트, `validateTransition`, 매입매출 위젯 패턴
- `.moai/specs/SPEC-PAYOUT-002/spec.md` (sibling, parallel authoring): 6-1 + sessions 보강, 충돌 검증
- `.moai/specs/SPEC-ME-001/spec.md`: M5 강사 정산 조회 화면 (확장 대상), M7 pgcrypto RPC 패턴, M8 PDF + NotoSansKR
- `.moai/specs/SPEC-AUTH-001/spec.md`: `requireRole` 가드 패턴
- `.moai/specs/SPEC-NOTIFY-001/spec.md`: 콘솔 로그 hook 식별자 사양 (예정)
- [`acceptance.md`](./acceptance.md): Given/When/Then 시나리오 (8건 이상)
- [`plan.md`](./plan.md): M1-M7 마일스톤 분해
- 외부 (verified 2026-04-29):
  - https://www.postgresql.org/docs/current/sql-altertype.html (ALTER TYPE ADD VALUE)
  - https://react-pdf.org/fonts (Font.register)
  - https://supabase.com/docs/guides/storage/security/access-control (RLS for Storage)

---

_End of SPEC-RECEIPT-001 spec.md_
