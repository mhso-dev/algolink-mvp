---
id: SPEC-RECEIPT-001
version: 0.2.0
status: draft
created: 2026-04-29
updated: 2026-04-29
author: 철
priority: high
issue_number: 15
---

# SPEC-RECEIPT-001: 고객 직접 정산 + 자동 영수증 발급 (Client-Direct Settlement Flow + Automated Receipt Issuance)

## HISTORY

- **2026-04-29 (v0.2.0)**: plan-auditor FAIL 판정에 따른 8건 결함(CRITICAL 2건 + HIGH 6건) 및 MEDIUM/LOW 항목 수정 amendment. 핵심 변경:
  1. **CRITICAL-1/2 (영수증 번호 형식)**: `RCP-YYYY-NNN`(3자리) → `RCP-YYYY-NNNN`(4자리)로 확장하고 단순 SEQUENCE 대신 `receipt_counters(year integer PRIMARY KEY, counter bigint)` 테이블 + `app.next_receipt_number()` 함수로 **연도별 카운터 reset**을 적용. 1000번째 발급에서 regex 위반하던 문제와 연도 경계 break 모두 해소. UNIQUE 인덱스는 그대로 유지.
  2. **HIGH-3 (atomic 트랜잭션 prose 정정)**: REQ-RECEIPT-OPERATOR-003 문구를 truth에 맞게 재작성. "단일 atomic DB 트랜잭션이 PDF 렌더+Storage 업로드까지 감싼다"는 잘못된 prose를 "DB-side 변경(settlements UPDATE + receipt_number 부여 + files INSERT + notifications INSERT)이 단일 atomic 트랜잭션이며, PDF 생성과 Storage 업로드는 DB 트랜잭션 commit 직전에 수행되고, DB 트랜잭션 실패 시 best-effort Storage object DELETE compensating cleanup이 수행된다. Storage 고아 파일은 일일 reconciliation job(REQ-RECEIPT-CLEANUP-001)으로 정리한다"로 정정. 단계 수는 8 atomic + 1 compensating으로 통일.
  3. **HIGH-4 (PII GUC + pii_access_log)**: REQ-RECEIPT-PII-001 신설. `decrypt_payout_field` 호출은 DB 트랜잭션 안에서 수행되며, 호출 전 `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'`, 직후 `pii_access_log` 1행 INSERT를 명시. PDF 렌더링 순서를 재구성: tx 내부에서 (instructor SELECT + bizno decrypt + pii_access_log INSERT) → tx commit 직전 PDF 렌더(in-memory) + Storage 업로드 → tx 커밋 (settlements/files/notifications). decrypt된 bizno는 PDF Buffer와 pii_access_log 외에 어디에도 영속되지 않음. SPEC-ME-001/LESSON-004 invariant 준수.
  4. **HIGH-5 (storage_path 컨벤션 통일)**: Convention A 채택 — `files.storage_path`는 **bucket-relative**(bucket prefix 없음, `storage.objects.name`과 1:1 매칭). bucket 식별은 `files.kind='payout_receipt'`(또는 'receipt')로 암묵 처리. 이전 §5.3의 `payout-receipts/<settlement_id>/<receipt_number>.pdf`(bucket prefix 포함)는 모두 `<settlement_id>/<receipt_number>.pdf`로 정정. RLS predicate는 `WHERE storage_path = name`이 직접 매칭되도록 단순화. REQ-RECEIPT-COLUMNS-007 신설(invariant 명시).
  5. **HIGH-6 (RLS role 검증 메커니즘)**: `auth.jwt()->>'role'` 의존을 제거하고 프로젝트 표준 helper `app.current_user_role() RETURNS text`(`SELECT role FROM users WHERE id = auth.uid()`)를 도입. organization_info, payout-receipts bucket 모두 본 helper를 사용. 마이그레이션에 helper 정의 포함.
  6. **HIGH-7 (SPEC-PAYOUT-002 dependency)**: SPEC-PAYOUT-002를 sibling이 아닌 **prerequisite**로 명시적 재분류. plan.md §1.1에 prerequisite 추가, acceptance.md test setup에 SPEC-PAYOUT-002 baseline 적용 가드 추가.
  7. **HIGH-8 (instructor_remittance_amount_krw 소유권)**: Option A 채택 — SPEC-PAYOUT-002의 GENERATE Server Action이 `flow='client_direct'` 정산 행 생성 시 PAYOUT-002의 `instructor_fee_krw` 계산 결과(GENERATED column)에서 derive하여 `instructor_remittance_amount_krw`를 함께 채운다. REQ-RECEIPT-COLUMNS-001에 cross-reference 명시. SPEC-RECEIPT-001은 본 컬럼을 read-only로 소비.
  8. **MEDIUM/LOW 정리**: COLUMNS-003 split, COLUMNS-008 generic UPDATE 차단 acceptance 추가, PDF-005 KST + NOTIFY-005 no-email 명시 acceptance 추가, react-pdf Font 절대 경로(`path.join(process.cwd(), 'public/fonts/...')`) 명시, client_direct 상태 머신 불변(SPEC-PAYOUT-001 그래프 그대로 상속) one-liner 추가, RLS-006 service-role 검색 검증 acceptance 추가.
  
  버전 0.1.0 → 0.2.0. 기존 0.1.0 amendment entry는 그대로 보존.

- **2026-04-29 (v0.1.0)**: 초기 작성. Algolink MVP §6-2 「고객-강사 직접 정산 + 알고링크 영수증 발급」 흐름을 SPEC화. 기존 §6-1(SPEC-PAYOUT-001 — 알고링크 → 강사 직접 송금, 원천세 차감)과는 자금 흐름이 반대 방향이다: (1) 고객사가 강사에게 강의비 전액 직접 송금하되 원천세(3.30% 또는 8.80%)를 차감, (2) 강사는 차감 후 수령액 중 알고링크 마진 분(`instructor_remittance_amount_krw`)을 알고링크 계좌로 역송금, (3) 알고링크가 입금 확인 시 영수증 PDF(번호+발행일+사업자정보+금액)를 자동 생성하여 강사에게 인앱 알림 + 다운로드 링크로 회신. SPEC-PAYOUT-002(6-1 + sessions 보강)는 본 SPEC의 prerequisite이며 — 본 SPEC의 `instructor_remittance_amount_krw` 컬럼은 SPEC-PAYOUT-002의 GENERATE Server Action이 `flow='client_direct'` 정산 행을 생성할 때 함께 채워준다(SPEC-PAYOUT-002 ownership). 본 SPEC은 기존 `settlements` 테이블을 (a) `settlement_flow` enum에 `client_direct` 값 추가 + (b) 6개 컬럼 nullable 추가(`instructor_remittance_amount_krw`, `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id`, `receipt_issued_at`, `receipt_number`) + (c) CHECK 제약 확장(`client_direct AND withholding_tax_rate IN (3.30, 8.80)`) 형태로 확장한다. 상태 머신은 SPEC-PAYOUT-001의 4-state(pending → requested → paid + held)를 그대로 유지하되 `client_direct` 흐름에서는 의미를 재해석(`pending`=강사 송금 미등록, `requested`=강사 송금 등록 완료/알고링크 확인 대기, `paid`=알고링크 입금 확인 + 영수증 발급 완료, `held`=금액 불일치 보류). [HARD] paid-freeze 인배리언트(SPEC-PAYOUT-001 §2.3)는 그대로 존중되며, 영수증 발급은 정확히 `requested → paid` 전환 시점에 단일 atomic DB 트랜잭션으로 (settlements UPDATE + receipt_number 부여 + files INSERT + notifications INSERT) 원자적으로 수행된다. 영수증 PDF는 @react-pdf/renderer + NotoSansKR(SPEC-ME-001 M8 산출물 재사용) 기반 A4 단일 페이지로 생성되어 신규 Storage 버킷 `payout-receipts`에 저장되며, 알고링크 사업자 정보는 신규 singleton 테이블 `organization_info`(MVP는 1행만 존재) 또는 환경변수 fallback에서 로드한다. 알림은 신규 `notification_type` enum 값 `receipt_issued`로 INSERT되고, 콘솔 로그(`[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>`)가 SPEC-NOTIFY-001 후속 hook의 식별자로 기록된다. 본 SPEC은 페인 포인트 「영수증을 시스템 외부에서 수기 발행하여 금액·번호 불일치가 잦다」를 자동화로 해소하는 것을 목적으로 한다. 실제 이메일/SMS 발송, 국세청 세금계산서 API 연동, 영수증 일괄 재발급, 영수증 취소/대체 발급, 알고링크 사업자 정보 admin UI 편집 화면, 강사 송금 자동 매칭(은행 OpenAPI), 카카오페이/토스 등 PG 연동은 명시적 제외이며 후속 SPEC으로 위임한다.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 [F-205] 정산 관리 영역에 **「고객 직접 정산 + 영수증 자동 발급」 흐름(이하 6-2 흐름)**을 추가한다. 본 SPEC의 산출물은 다음 9가지 축으로 구성된다.

(a) **`settlement_flow` enum 확장** — 기존 `corporate`(0%) / `government`(3.30/8.80%)에 `client_direct`(3.30/8.80%)를 추가. CHECK 제약을 `(settlement_flow = 'client_direct' AND withholding_tax_rate IN (3.30, 8.80))` 항을 OR 결합으로 확장. 마이그레이션 1건.

(b) **`settlements` 6개 컬럼 추가 (모두 nullable)** —
  - `instructor_remittance_amount_krw bigint` — 강사가 알고링크에 역송금해야 할 금액. **소유권: SPEC-PAYOUT-002**가 `flow='client_direct'` 정산 행을 GENERATE할 때 PAYOUT-002의 `instructor_fee_krw`(GENERATED column) 계산 결과로부터 derive하여 함께 채운다(통상 알고링크 마진 = `business_amount_krw - instructor_fee_krw` = `profit_krw`). SPEC-RECEIPT-001은 본 컬럼을 read-only로 소비.
  - `instructor_remittance_received_at timestamptz` — 운영자가 강사 입금을 확인한 시각
  - `client_payout_amount_krw bigint` — 고객사가 강사에게 송금한 금액(원천세 차감 후, 정보용)
  - `receipt_file_id uuid FK→files` — 자동 생성된 영수증 PDF 파일 식별자
  - `receipt_issued_at timestamptz` — 영수증 발급 시각
  - `receipt_number text UNIQUE` — `RCP-YYYY-NNNN` 형식의 **연도별 reset** 시퀀셜 번호 (예: `RCP-2026-0001`, 동시성 안전 발급, 4자리 zero-pad → 9999/년 지원)

(c) **상태 머신 재해석 (백엔드 enum 미변경)** — `client_direct` 흐름 한정으로 4-state의 의미를 재해석:
  - `pending` = 강사 송금 등록 전 (UI 라벨: "수취 대기")
  - `requested` = 강사 송금 등록 완료, 알고링크 확인 대기 (UI 라벨: "입금 확인 대기")
  - `paid` = 알고링크 입금 확인 + 영수증 발급 완료 (UI 라벨: "영수증 발급 완료")
  - `held` = 금액 불일치 또는 분쟁
  
  백엔드 enum 값(`pending`/`requested`/`paid`/`held`)은 변경하지 않으며 SPEC-PAYOUT-001의 paid-freeze 인배리언트와 전환 그래프(`pending → requested → paid` + `held` 분기)를 그대로 따른다.

(d) **강사 송금 등록 흐름** (`(instructor)/me/payouts/[id]/remit/`) — SPEC-ME-001 M5 정산 상세를 확장: `client_direct` 흐름 + status=`pending` 정산 행에 "송금 완료 등록" CTA 노출. 강사가 송금 일자 + 송금 금액(서버측 expected = `instructor_remittance_amount_krw` 일치 검증) + 선택적 송금 영수증 첨부(`files` 행 + Storage 업로드) 입력 → Server Action이 status `pending → requested` 전환 + `instructor_remittance_amount_krw`/`client_payout_amount_krw` UPDATE.

(e) **운영자 수취 확인 + 영수증 발급 (DB-atomic + Storage compensating)** (`(operator)/settlements/[id]/confirm-remittance/`) — `client_direct` + status=`requested` 정산 행 상세 페이지에 "수취 확인 + 영수증 발급" 패널 노출. 운영자가 입금 확인 일자 + 실제 입금 금액(서버측 expected = `instructor_remittance_amount_krw` 일치 검증) + 선택적 메모 입력. 실행 모델은 **DB-side는 단일 atomic 트랜잭션, Storage는 트랜잭션 외부에서 compensating cleanup**:
  1. (pre-tx) validation: `validateTransition(currentStatus, 'paid')` + `receivedAmountKrw === instructor_remittance_amount_krw`
  2. (pre-tx) `getOrganizationInfo()` — DB 우선 → env fallback → 미설정 시 `ORGANIZATION_INFO_MISSING`
  3. (pre-tx) 영수증 번호 acquire: `SELECT app.next_receipt_number()` (연도별 카운터 reset, atomic)
  4. **DB tx 진입** + `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'`
  5. (in-tx) instructor row SELECT + `decrypt_payout_field` RPC로 사업자등록번호 decrypt + `pii_access_log` INSERT (1행)
  6. (in-tx → buffer) PDF 렌더 in-memory (`@react-pdf/renderer`, NotoSansKR, A4 portrait, 단일 페이지) — decrypted bizno는 PDF Buffer + pii_access_log 외에 영속되지 않음
  7. (외부 — tx 안에서 호출하지만 commit 전 — Storage I/O) PDF Storage 업로드 (bucket=`payout-receipts`, name=`<settlement_id>/<receipt_number>.pdf`)
  8. (in-tx) `INSERT INTO files (kind='payout_receipt', storage_path='<settlement_id>/<receipt_number>.pdf', owner_id=<강사 user_id>, ...)` + `UPDATE settlements SET status='paid', instructor_remittance_received_at, receipt_file_id, receipt_number, receipt_issued_at, notes WHERE id=$1 AND status='requested' AND settlement_flow='client_direct'` + `INSERT INTO notifications (recipient_id, type='receipt_issued', ...)` + `COMMIT`
  9. (post-commit, non-rollback) `console.log("[notif] receipt_issued → ...")`
  
  **Compensating step (DB tx 실패 시)**: best-effort `supabase.storage.from('payout-receipts').remove([name])` + 로그. 잔여 고아 파일은 일일 reconciliation job(REQ-RECEIPT-CLEANUP-001)으로 정리.

(f) **영수증 PDF 컨텐츠** — A4 portrait, 단일 페이지, 한국어. 포함 항목: 상단 "영수증" 타이틀 + 영수증 번호 + 발행일 / 강사 정보(이름·사업자등록번호 nullable) / 알고링크 정보(상호·사업자등록번호·대표자명·주소·연락처) / 거래 정보(송금일·입금 금액 KRW·사유) / 하단 발행처 표기. 알고링크 사업자 정보 source는 신규 singleton 테이블 `organization_info`(1행 enforce CHECK) 또는 환경변수 fallback. 본 SPEC에서는 organization_info 테이블 + 환경변수 fallback 둘 다 지원하되 우선순위는 (1) organization_info 행 → (2) 환경변수.

(g) **`payout-receipts` Storage 버킷 + RLS** — 신규 버킷 생성. RLS 정책:
  - `payout_receipts_self_select`: `instructor` role + `auth.uid() = (SELECT user_id FROM instructors WHERE id = (SELECT instructor_id FROM settlements WHERE receipt_file_id IS NOT NULL AND <path matches>))` (강사 본인 read only)
  - `payout_receipts_operator_all`: `operator/admin` role full RW
  - `payout_receipts_anon_deny`: 미인증 거부 (default deny)
  
  `files` 테이블에는 `kind='payout_receipt'` 새 행 추가, `storage_path = '<settlement_id>/<receipt_number>.pdf'` (bucket-relative, REQ-RECEIPT-COLUMNS-007). `files.kind` enum 또는 text 컬럼이 이미 존재한다고 가정 (없으면 마이그레이션에서 추가).

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
- **`@react-pdf/renderer` + NotoSansKR 폰트**: SPEC-ME-001 M8 (이력서 PDF 다운로드)에서 정착. `public/fonts/NotoSansKR-{Regular,Bold}.ttf` 그대로 재사용. Server-side render 시 `Font.register({ src: path.join(process.cwd(), 'public/fonts/NotoSansKR-Regular.ttf') })` 형태의 **절대 경로**로 등록 (react-pdf 서버측 요구).
- **PII 암호화 패턴 + GUC + access log**: SPEC-ME-001 M7 (pgcrypto RPC `encrypt_payout_field`/`decrypt_payout_field`) + LESSON-004 invariant. 본 SPEC의 영수증 PDF 렌더링에서 강사 사업자등록번호 decrypt 호출은 동일 트랜잭션 안에서 `SET LOCAL app.pii_purpose` + `pii_access_log` INSERT를 수반한다(REQ-RECEIPT-PII-001 참조).
- **SPEC-AUTH-001 가드**: `(operator)/layout.tsx` `requireRole(['operator', 'admin'])` + `(instructor)/layout.tsx` `requireRole(['instructor'])` 그대로 사용.
- **SPEC-PAYOUT-001 `validateTransition` + 상태 머신 그래프**: 4-state 전환 검증 함수 + `pending → requested → paid` + `held` 분기. **`client_direct` 흐름은 SPEC-PAYOUT-001 전환 그래프를 그대로 상속하며 변경하지 않는다**; 본 SPEC은 `requested → paid` 전환 시점에 atomic side-effects(영수증 발급, 알림)만 추가한다.
- **`app.current_user_role()` helper**: 본 SPEC에서 신규 도입하는 프로젝트 표준 헬퍼. `SELECT role FROM users WHERE id = auth.uid()`를 SECURITY DEFINER로 감싸서 RLS predicate에서 `app.current_user_role() = 'operator'` 형태로 사용. `auth.jwt()->>'role'` 의존을 제거(JWT 커스텀 hook 미설정 환경에서 안전).
- **SPEC-PAYOUT-002 (prerequisite, 선행 SPEC)**: 6-1 + sessions 보강. 본 SPEC의 `instructor_remittance_amount_krw` 컬럼은 PAYOUT-002의 GENERATE Server Action이 `flow='client_direct'` 정산 행 생성 시 함께 채워준다. PAYOUT-002가 main에 머지된 이후 본 SPEC이 시작된다.

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

#### 영수증 번호 동시성 안전 발급 (연도별 카운터 reset)

영수증 번호는 `RCP-YYYY-NNNN` 형식 (예: `RCP-2026-0001`, 4자리 zero-pad → 9999/년 지원). regex: `^RCP-\d{4}-\d{4}$`. 연도 경계에서 카운터가 자동 reset되도록 단순 SEQUENCE가 아닌 **per-year 카운터 테이블** 패턴 사용:

```sql
-- 20260429000060_receipt_number_counter.sql
CREATE TABLE app.receipt_counters (
  year integer PRIMARY KEY,
  counter bigint NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION app.next_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  cur_year integer;
  cur_counter bigint;
BEGIN
  cur_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Seoul')::integer;

  -- atomic upsert: 신규 연도면 1, 기존 연도면 +1, RETURNING으로 새 값 획득
  INSERT INTO app.receipt_counters(year, counter)
  VALUES (cur_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET counter = app.receipt_counters.counter + 1
  RETURNING counter INTO cur_counter;

  RETURN 'RCP-' || cur_year::text || '-' || LPAD(cur_counter::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO authenticated;
```

원자성: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`은 단일 행 락을 획득하고 RETURNING 값을 atomically 반환한다. 병렬 호출 시 (year, counter) 행에 대한 row-level lock이 직렬화하므로 중복 없음. UNIQUE 인덱스 (`receipt_number`)가 추가 방어선.

연도 전환 (예: 2026-12-31 23:59:59 KST → 2027-01-01 00:00:00 KST): 새 연도의 첫 호출이 `INSERT INTO receipt_counters(year=2027, counter=1)`을 수행하여 counter=1로 자동 reset. 따라서 `RCP-2026-9999` 다음은 `RCP-2027-0001`이 된다.

대안 검토:
- 단순 `CREATE SEQUENCE` + 연도 prefix(이전 v0.1.0 설계): 1000번째 발급 시 자릿수 4자리로 확장되어 regex `\d{3}` 위반 + 연도 경계에서 reset 안 됨 → CRITICAL-1/2 결함. **본 amendment(v0.2.0)에서 폐기**.
- 행 락 + COUNT 방식: phantom read 위험, deadlock 가능 → 채택 안 함.
- 연도별 SEQUENCE 다중 생성(`receipt_seq_2026`, `receipt_seq_2027`, ...): SEQUENCE는 자동 생성되지 않으므로 매년 마이그레이션 필요 → 운영 부담 증가, 채택 안 함.

### 1.3 범위 (Scope)

**In Scope:**

- **마이그레이션** (`supabase/migrations/`):
  - `20260429000005_app_current_user_role.sql` — 프로젝트 표준 helper `app.current_user_role() RETURNS text` (SECURITY DEFINER) 신설. 본 SPEC의 모든 RLS predicate가 사용.
  - `20260429000010_settlement_flow_client_direct.sql` — `settlement_flow` enum에 `client_direct` 값 추가 + CHECK 제약 확장 (DROP + RECREATE)
  - `20260429000020_settlements_remittance_columns.sql` — 6개 nullable 컬럼 추가 (`instructor_remittance_amount_krw`, `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id`, `receipt_issued_at`, `receipt_number`) + UNIQUE 제약 (`receipt_number`) + FK (`receipt_file_id` → `files(id)`)
  - `20260429000030_organization_info.sql` — 신규 singleton 테이블 + CHECK 제약 (1행 enforce, `id = 1`) + RLS using `app.current_user_role()` (admin RW, operator R)
  - `20260429000040_payout_receipts_bucket.sql` — Storage 버킷 + RLS 정책 using `app.current_user_role()` (instructor self-read, operator/admin all, anon deny)
  - `20260429000050_notification_type_receipt_issued.sql` — `notification_type` enum 값 추가
  - `20260429000060_receipt_number_counter.sql` — `app.receipt_counters(year, counter)` 테이블 + 발급 SQL 함수 (`app.next_receipt_number()`, 연도별 reset)

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
  - `(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts` (planned) — `confirmRemittanceAndIssueReceipt` Server Action (atomic 8-step transaction + 1 compensating cleanup)
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
    - 운영자 수취 확인 → atomic 8-step 트랜잭션 + 1 compensating Storage cleanup + 영수증 PDF 생성 + Storage 업로드 + 알림 INSERT
    - 영수증 번호 동시성 (병렬 5건)
    - paid 동결 후 재발급 거부
    - 송금 금액 불일치 거부
    - RLS: 강사 A가 강사 B의 영수증 path 접근 → 거부

- **한국어 + Asia/Seoul 일관**: 영수증 PDF의 발행일/거래일은 KST 표시 (`2026-05-01 (KST)`), 알림 본문도 한국어, 모든 신규 에러 메시지 한국어.

**Out of Scope (Exclusions — What NOT to Build):** §3 참조.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 마이그레이션 7건 모두 `supabase db reset` 후 정상 적용 (helper 함수, CHECK 제약, RLS, 카운터 테이블, 버킷 생성 확인)
- ✅ `client_direct` enum 값 추가 후 SPEC-PAYOUT-001 기존 `corporate`/`government` 흐름 회귀 없음 (16개 상태 전환 단위 테스트 그대로 PASS)
- ✅ CHECK 제약 확장 후 `client_direct + rate=5` INSERT 시 DB 거부 + zod 사전 거부 (이중 방어선)
- ✅ 강사 송금 등록 → status `pending → requested` + 6개 컬럼 중 3개(`instructor_remittance_amount_krw`, `client_payout_amount_krw`, 송금 영수증 첨부 시 `files` 신규 행) UPDATE/INSERT
- ✅ 운영자 수취 확인 atomic 트랜잭션 단일 호출로 (a) status `requested → paid`, (b) `instructor_remittance_received_at = now()`, (c) `receipt_file_id` 연결, (d) `receipt_number` 신규 발급 (UNIQUE), (e) `receipt_issued_at = now()`, (f) `notifications` 1행 INSERT, (g) 콘솔 로그 1줄 출력 모두 성공
- ✅ 영수증 PDF 한국어 정상 렌더 (NotoSansKR, server-side 절대 경로 등록), A4 portrait, 단일 페이지, 알고링크 사업자 정보 정확 임베드
- ✅ 영수증 번호 형식: `RCP-YYYY-NNNN` (4자리 zero-pad), regex `^RCP-\d{4}-\d{4}$`
- ✅ 영수증 번호 동시성: 병렬 5개 발급 시 모두 unique (`receipt_counters` 행 락 + UNIQUE 인덱스 보장)
- ✅ 영수증 번호 연도 reset: 2027년 첫 발급 시 `RCP-2027-0001` (counter reset)
- ✅ PII GUC + access log: decrypt_payout_field 호출이 `app.pii_purpose='receipt_pdf_generation'` 컨텍스트 안에서 일어나고 `pii_access_log`에 1행 기록
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
- `instructor_remittance_amount_krw bigint` — 강사가 알고링크에 송금해야 할 금액. **Owner: SPEC-PAYOUT-002**: PAYOUT-002의 GENERATE Server Action이 `flow='client_direct'` 정산 행 생성 시 PAYOUT-002의 `instructor_fee_krw`(GENERATED column)에서 derive하여 함께 채운다 (`instructor_remittance_amount_krw = business_amount_krw - instructor_fee_krw = profit_krw`). SPEC-RECEIPT-001은 본 컬럼을 **read-only**로 소비하며 직접 INSERT/UPDATE 경로를 노출하지 않는다.
- `instructor_remittance_received_at timestamptz` (운영자가 입금 확인한 시각)
- `client_payout_amount_krw bigint` (고객사가 강사에게 송금한 금액, 정보용)
- `receipt_file_id uuid REFERENCES files(id) ON DELETE SET NULL` (영수증 PDF 파일)
- `receipt_issued_at timestamptz` (영수증 발급 시각)
- `receipt_number text UNIQUE` — `RCP-YYYY-NNNN` 형식 (4-digit zero-pad, 연도별 reset)

**REQ-RECEIPT-COLUMNS-002 (Ubiquitous)**
The `receipt_number` column **shall** carry a UNIQUE index `idx_settlements_receipt_number` to enforce no two settlements share the same receipt number; the format **shall** match regex `^RCP-\d{4}-\d{4}$`.

**REQ-RECEIPT-COLUMNS-003 (State-Driven)**
**WHILE** a settlement row has `status = 'paid'` and `settlement_flow = 'client_direct'`, the system **shall** require `receipt_file_id`, `receipt_number`, and `receipt_issued_at` to be non-null. This invariant is **established** at the application layer by the atomic transaction in `confirmRemittanceAndIssueReceipt`.

**REQ-RECEIPT-COLUMNS-003a (Ubiquitous)**
The system **shall** enforce REQ-RECEIPT-COLUMNS-003's three-column non-null invariant via Server Action transaction atomicity (UPDATE WHERE clause requires `status='requested'` and uses RETURNING to confirm `receipt_*` columns are set in the same statement). No DB trigger or CHECK constraint is required at the schema level (deferred to a future hardening SPEC).

**REQ-RECEIPT-COLUMNS-004 (Ubiquitous)**
The Drizzle schema **shall** treat all 6 new columns as nullable in TypeScript types; the application code **shall** narrow type via `if (settlement.receipt_file_id !== null)` before accessing.

**REQ-RECEIPT-COLUMNS-005 (Unwanted Behavior)**
**IF** a Server Action attempts to UPDATE `receipt_number` or `receipt_file_id` on a settlement that already has these populated (i.e., re-issuance attempt), **THEN** the action **shall** reject with `RECEIPT_ALREADY_ISSUED` ("이미 영수증이 발급된 정산입니다.") and the DB **shall** remain unchanged.

**REQ-RECEIPT-COLUMNS-006 (Ubiquitous)**
The system **shall** include the 6 new columns in the SELECT projection of `getSettlementById` (`src/lib/payouts/queries.ts`), but **shall** explicitly exclude them from the default UPDATABLE column whitelist; only the dedicated atomic transaction (`confirmRemittanceAndIssueReceipt`) and the instructor remittance registration action (`registerInstructorRemittance`) are permitted to set them.

**REQ-RECEIPT-COLUMNS-007 (Ubiquitous — storage_path invariant)**
The `files.storage_path` column **shall** store the **bucket-relative** key matching `storage.objects.name` exactly; bucket name **shall not** be embedded in `storage_path`. For payout receipts the convention is: `storage_path = '<settlement_id>/<receipt_number>.pdf'` and the bucket is encoded by `files.kind = 'payout_receipt'`. For remittance evidence the convention is `storage_path = '<settlement_id>/<uuid>.<ext>'` with bucket `payout-evidence` encoded by `files.kind = 'remittance_evidence'`.

**REQ-RECEIPT-COLUMNS-008 (Unwanted Behavior — generic UPDATE block)**
**IF** any Server Action other than `confirmRemittanceAndIssueReceipt` attempts to UPDATE `settlements.receipt_number`, **THEN** the call site **shall** be rejected at the type level (via UPDATABLE_COLUMNS whitelist exclusion in `queries.ts`) and at runtime by `getSettlementById` consumers ignoring writes to receipt_number; an integration test **shall** verify that the generic settlement UPDATE Server Action returns `STATUS_INVALID_TRANSITION` or no-op without touching `receipt_number`.

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
2. If `evidenceFile` provided: upload to Storage bucket `payout-evidence`, name `<settlement_id>/<uuid>.<ext>` (bucket-relative per REQ-RECEIPT-COLUMNS-007) + INSERT `files` row with `kind='remittance_evidence'`, `storage_path='<settlement_id>/<uuid>.<ext>'` (bucket-relative, NO bucket prefix), `owner_id=instructor's user_id`
3. `UPDATE settlements SET status='requested', client_payout_amount_krw=$expectedClientPayout (계산 = instructor_fee_krw - withholding_tax_amount_krw), updated_at=now() WHERE id=$1 AND status='pending' AND settlement_flow='client_direct'`
4. (트리거 자동) `settlement_status_history` 자동 INSERT

**REQ-RECEIPT-INSTRUCTOR-005 (State-Driven)**
**WHILE** an instructor settlement detail page renders a `client_direct` settlement with `status = 'requested'`, the system **shall** display the registered 송금 일자 + 송금 금액 + 첨부 파일 다운로드 링크(if exists), and disable the "송금 완료 등록" CTA.

**REQ-RECEIPT-INSTRUCTOR-006 (Optional Feature)**
**WHERE** the settlement reaches `status = 'paid'`, the instructor detail page **shall** display the receipt download link (file from `receipt_file_id`) prominently; the link target **shall** be a signed Supabase Storage URL with 1-hour expiry generated server-side.

### 2.4 REQ-RECEIPT-OPERATOR — 운영자 수취 확인 + 영수증 발급 (DB-atomic + Storage compensating)

**REQ-RECEIPT-OPERATOR-001 (Ubiquitous)**
The system **shall** extend the operator settlement detail page `(app)/(operator)/settlements/[id]/page.tsx` (SPEC-PAYOUT-001 산출물) to display a "수취 확인 + 영수증 발급" panel when `settlement_flow = 'client_direct' AND status = 'requested'`.

**REQ-RECEIPT-OPERATOR-002 (Event-Driven)**
**WHEN** an operator opens the confirmation panel, the system **shall** display read-only details (registered 송금 일자, 송금 금액, 첨부 파일) and an input form: (a) 입금 확인 일자 (date input, default today), (b) 실제 입금 금액 KRW (must equal `instructor_remittance_amount_krw`), (c) 선택적 메모 (textarea, max 2000).

**REQ-RECEIPT-OPERATOR-003 (Event-Driven — DB-atomic + Storage compensating)**
**WHEN** an operator submits the confirmation form, the system **shall** invoke Server Action `confirmRemittanceAndIssueReceipt({ settlementId, receivedDate, receivedAmountKrw, memo? })`. The execution model is: **the DB-side mutation (settlements UPDATE + receipt_number assignment + files INSERT + notifications INSERT) is executed in a single atomic DB transaction; PDF generation and Storage upload are performed adjacent to the DB transaction (between BEGIN and COMMIT), with compensating cleanup (best-effort Storage object DELETE) if the DB transaction fails.** Concretely, the action **shall** execute the following 8 atomic steps + 1 compensating step:

1. **(pre-tx)** `validateTransition(currentStatus, 'paid')` (must be `requested → paid`); reject with `STATUS_INVALID_TRANSITION` otherwise
2. **(pre-tx)** Verify `receivedAmountKrw === instructor_remittance_amount_krw`; reject with `REMITTANCE_AMOUNT_MISMATCH` otherwise
3. **(pre-tx)** `getOrganizationInfo()` resolves Algolink info (DB → env → throw `ORGANIZATION_INFO_MISSING`); acquire `receipt_number` via `SELECT app.next_receipt_number()` RPC (per-year counter, atomic UPSERT)
4. **(BEGIN)** Open DB transaction; execute `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` (REQ-RECEIPT-PII-001)
5. **(in-tx)** SELECT instructor row + decrypt `business_number_enc` via `decrypt_payout_field` RPC + INSERT `pii_access_log` row (one row per receipt)
6. **(in-tx, in-memory)** Render PDF Buffer via `renderReceiptPdf({ settlement, instructor (with decrypted bizno), organization, receiptNumber, issuedAt })`. Decrypted bizno **shall** flow only into the PDF Buffer and the pii_access_log row; no other persistence
7. **(in-tx, Storage I/O)** Upload PDF Buffer to bucket `payout-receipts`, name `<settlement_id>/<receipt_number>.pdf` (bucket-relative; REQ-RECEIPT-COLUMNS-007). On Storage upload failure, roll back the tx and return `STORAGE_UPLOAD_FAILED`
8. **(in-tx)** Within the same DB transaction: (a) INSERT `files (kind='payout_receipt', storage_path='<settlement_id>/<receipt_number>.pdf', owner_id, ...)`; (b) `UPDATE settlements SET status='paid', instructor_remittance_received_at=$receivedDate, receipt_file_id=$fileId, receipt_number=$receiptNumber, receipt_issued_at=now(), notes = ..., updated_at=now() WHERE id=$1 AND status='requested' AND settlement_flow='client_direct'` (RETURNING enforces zero-row → STALE_TRANSITION); (c) INSERT `notifications (recipient_id, type='receipt_issued', title, body, link_url)`; (d) `COMMIT`
9. **(post-commit, non-rollback)** Emit `console.log("[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>")` and `revalidatePath`

**Compensating step (DB tx failure)**: If the DB transaction rolls back after Step 7 succeeded, the Server Action **shall** execute `supabase.storage.from('payout-receipts').remove([name])` as best-effort (errors logged, never thrown). Residual Storage orphans are reconciled by REQ-RECEIPT-CLEANUP-001.

**REQ-RECEIPT-OPERATOR-004 (Unwanted Behavior)**
**IF** any of Steps 3-8 fail (DB error, Storage error, RLS rejection, RPC failure, decrypt failure), **THEN** the system **shall** roll back the DB transaction; the compensating Storage cleanup **shall** run if Step 7 had succeeded; the action **shall** return the appropriate Korean error (`RECEIPT_GENERATION_FAILED`, `STORAGE_UPLOAD_FAILED`, `ORGANIZATION_INFO_MISSING`, `STATUS_INVALID_TRANSITION`); the settlement status **shall** remain `requested` and `receipt_number` **shall not** be set.

**REQ-RECEIPT-OPERATOR-005 (Unwanted Behavior)**
**IF** the operator submits confirmation for a settlement that already has `receipt_number IS NOT NULL` (e.g., race condition or stale browser tab), **THEN** the WHERE clause `status='requested'` in the UPDATE **shall** match zero rows, and the action **shall** return `RECEIPT_ALREADY_ISSUED` ("이미 영수증이 발급된 정산입니다.") with no DB change.

**REQ-RECEIPT-OPERATOR-006 (State-Driven)**
**WHILE** a `client_direct` settlement has `status = 'paid'`, the operator detail page **shall** display: (a) 발급 영수증 번호, (b) 발급 일시 (KST), (c) 영수증 PDF 다운로드 링크, (d) all status-change buttons disabled per SPEC-PAYOUT-001 paid-freeze.

**REQ-RECEIPT-OPERATOR-007 (Ubiquitous)**
The system **shall** display a flow indicator on the operator detail page for `client_direct` settlements showing the cash flow textually as `"고객사 → 강사 → 알고링크"`, distinguishing it from `corporate`/`government` flows (`"고객사 → 알고링크 → 강사"`).

### 2.5 REQ-RECEIPT-PDF — 영수증 PDF 생성

**REQ-RECEIPT-PDF-001 (Ubiquitous)**
The system **shall** generate the receipt PDF using `@react-pdf/renderer` (already declared in package.json per SPEC-ME-001 M8) with NotoSansKR fonts. Server-side rendering requires absolute paths or HTTP URLs in `Font.register({ src: ... })`; therefore the implementation **shall** resolve font paths via `path.join(process.cwd(), 'public/fonts/NotoSansKR-Regular.ttf')` and `path.join(process.cwd(), 'public/fonts/NotoSansKR-Bold.ttf')` (NOT bare `/fonts/...` paths which only work in browser context).

**REQ-RECEIPT-PDF-002 (Ubiquitous)**
The receipt PDF layout **shall** be A4 portrait, single page, with the following sections in order:
1. Header: "영수증" 타이틀 (bold, 24pt) + 영수증 번호 (right-aligned, e.g., `RCP-2026-0001`, 4-digit) + 발행일 (KST, `YYYY-MM-DD`)
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
**WHERE** the instructor's `business_number` (사업자등록번호) is stored encrypted in `instructors.business_number_enc`, the system **shall** decrypt it via the existing `decrypt_payout_field` RPC (SPEC-ME-001 M7) inside the SAME DB transaction as the settlements UPDATE (Step 5 of REQ-RECEIPT-OPERATOR-003), and embed the decrypted value into the PDF Buffer; if decryption fails or the field is null, the field **shall** be omitted from the PDF (not blocked). The decrypt call **shall** be preceded by `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` and followed by a `pii_access_log` INSERT (REQ-RECEIPT-PII-001).

### 2.5a REQ-RECEIPT-PII — PII GUC + access log invariant

**REQ-RECEIPT-PII-001 (Ubiquitous — PII transactional invariant)**
The system **shall** enforce SPEC-ME-001 / LESSON-004 PII invariant for receipt generation: before any `decrypt_payout_field` RPC call, the Server Action **shall** execute `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` within the same DB transaction; immediately after a successful decrypt, the action **shall** INSERT exactly one row into `pii_access_log(actor_user_id, target_table, target_column, target_id, purpose, accessed_at)` where:
- `actor_user_id = auth.uid()` (the operator's user_id)
- `target_table = 'instructors'`
- `target_column = 'business_number_enc'`
- `target_id = instructors.id` (the instructor's row id)
- `purpose = 'receipt_pdf_generation'`
- `accessed_at = now()`

**REQ-RECEIPT-PII-002 (Unwanted Behavior)**
**IF** the decrypt RPC fails or `pii_access_log` INSERT fails, **THEN** the entire DB transaction **shall** roll back with `RECEIPT_GENERATION_FAILED`; the Storage compensating cleanup **shall** run if PDF was already uploaded; the receipt **shall not** be issued.

**REQ-RECEIPT-PII-003 (Ubiquitous — no leakage)**
The decrypted business_number string **shall** flow only into (a) the PDF Buffer (which is uploaded to Storage and not logged), and (b) the `pii_access_log` row (purpose-only, value is NOT stored). The Server Action **shall not** include the decrypted bizno in `console.log`, error messages, or returned response objects.

### 2.5b REQ-RECEIPT-CLEANUP — Storage orphan reconciliation

**REQ-RECEIPT-CLEANUP-001 (Ubiquitous — out-of-scope acknowledgement)**
The system **acknowledges** that Storage orphans (PDF objects in `payout-receipts` bucket whose `storage_path` is not referenced by any `files` row) are possible when the DB transaction in REQ-RECEIPT-OPERATOR-003 fails after Step 7 succeeded. A daily reconciliation job that scans `storage.objects` in `payout-receipts` and deletes objects with no matching `files.storage_path` is **out of scope** for SPEC-RECEIPT-001 and **shall be delegated** to a future SPEC (SPEC-PAYOUT-CLEANUP-XXX). Best-effort compensating delete in REQ-RECEIPT-OPERATOR-003 mitigates the orphan risk in the common failure path; documented residual risk: rare partial failures where compensating delete also fails (network partition, RLS revocation), which the daily job will catch.

### 2.6 REQ-RECEIPT-NOTIFY — receipt_issued 알림 + 콘솔 로그

**REQ-RECEIPT-NOTIFY-001 (Ubiquitous)**
The system **shall** add a new value `receipt_issued` to the existing `notification_type` enum via migration `20260429000050_notification_type_receipt_issued.sql` using `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`.

**REQ-RECEIPT-NOTIFY-002 (Event-Driven)**
**WHEN** the atomic DB transaction in REQ-RECEIPT-OPERATOR-003 reaches Step 8 (notifications INSERT inside the same tx as settlements UPDATE), the system **shall** INSERT a row into `notifications` with:
- `recipient_id = (SELECT user_id FROM instructors WHERE id = settlements.instructor_id)`
- `type = 'receipt_issued'`
- `title = "영수증 발급 완료"`
- `body = "${receipt_number} (${formatKRW(amount)})"` (e.g., `"RCP-2026-0001 (2,000,000 원)"`)
- `link_url = '/me/payouts/<settlement_id>'`
- `read_at = NULL`

**REQ-RECEIPT-NOTIFY-003 (Event-Driven)**
**WHEN** the DB transaction commits (Step 9, post-commit), the system **shall** emit exactly one stdout line in the format `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>` (regex: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{4}$`); this serves as the SPEC-NOTIFY-001 hook identifier.

**REQ-RECEIPT-NOTIFY-004 (Unwanted Behavior)**
**IF** the `notifications` INSERT fails (DB error, RLS rejection) inside the DB transaction, **THEN** the entire DB transaction **shall** roll back (settlements UPDATE + files INSERT + notifications INSERT + pii_access_log INSERT all reverted); the compensating Storage cleanup **shall** run for the uploaded PDF; the user **shall** see `RECEIPT_GENERATION_FAILED`; no console.log line is emitted.

**REQ-RECEIPT-NOTIFY-005 (Ubiquitous — no email/SMS)**
The system **shall not** send actual email or SMS notifications within SPEC-RECEIPT-001. The only outbound notification channels in scope are: (a) the `notifications` table INSERT (in-app notification consumed by SPEC-LAYOUT-001 notification dropdown), and (b) the `console.log` stdout line (identifier hook for SPEC-NOTIFY-001 future adapter). Email/SMS integration (Resend, SES, KakaoTalk Alimtalk, etc.) is explicitly delegated to SPEC-NOTIFY-001 which **shall** consume the stdout identifier line via stdout hook or file tail. An acceptance scenario **shall** verify that no outbound HTTP request to email/SMS providers occurs during receipt issuance.

### 2.7 REQ-RECEIPT-RLS — Storage 버킷 + 영수증 접근 제어

**REQ-RECEIPT-RLS-001 (Ubiquitous)**
The system **shall** create a new Supabase Storage bucket `payout-receipts` via migration `20260429000040_payout_receipts_bucket.sql` with `public = false` and standard 50MB file size limit.

**REQ-RECEIPT-RLS-002 (Ubiquitous — RLS policies using app.current_user_role())**
The system **shall** define RLS policies on `storage.objects` for the `payout-receipts` bucket. All policies use the project-standard helper `app.current_user_role()` (introduced by migration `20260429000005_app_current_user_role.sql`, defined as `SELECT role FROM users WHERE id = auth.uid()`, SECURITY DEFINER):
- `payout_receipts_self_select` (SELECT): allow when `bucket_id = 'payout-receipts' AND app.current_user_role() = 'instructor' AND auth.uid() = (SELECT i.user_id FROM instructors i JOIN settlements s ON s.instructor_id = i.id WHERE s.receipt_file_id = (SELECT id FROM files WHERE storage_path = storage.objects.name))`. The `name` column of `storage.objects` is bucket-relative (REQ-RECEIPT-COLUMNS-007), so `WHERE storage_path = name` is a direct equality match (no bucket prefix concatenation needed).
- `payout_receipts_operator_all` (ALL): allow when `bucket_id = 'payout-receipts' AND app.current_user_role() IN ('operator', 'admin')`
- (default deny on all other roles via lack of policy)

**REQ-RECEIPT-RLS-003 (Ubiquitous)**
The `files` table **shall** receive new rows with `kind = 'payout_receipt'` for each issued receipt; the `owner_id` **shall** be set to the instructor's user_id; `storage_path` **shall** follow the bucket-relative convention `<settlement_id>/<receipt_number>.pdf` (no bucket prefix; see REQ-RECEIPT-COLUMNS-007).

**REQ-RECEIPT-RLS-004 (Unwanted Behavior)**
**IF** an instructor (role=instructor) attempts to fetch a receipt PDF whose `owner_id` differs from their `auth.uid()`, **THEN** Supabase Storage **shall** return 401/403; the application **shall not** expose unsigned URLs of receipts.

**REQ-RECEIPT-RLS-005 (Ubiquitous)**
The system **shall** generate signed URLs for receipt PDF download with 1-hour expiry using `supabase.storage.from('payout-receipts').createSignedUrl(path, 3600)` from server-side code only; the unsigned `storage_path` **shall not** be exposed to the client.

**REQ-RECEIPT-RLS-006 (Ubiquitous — no service-role)**
The system **shall not** introduce any service-role Supabase client in this SPEC; all DB and Storage operations during the atomic Server Action transaction **shall** use the operator's user-scoped session client to keep RLS as the authoritative authorization layer. **Verification method**: an acceptance scenario **shall** include a code-search check via `grep -r "createServiceRoleClient\|SUPABASE_SERVICE_ROLE_KEY" src/app/(app)/(operator)/settlements/ src/app/(app)/(instructor)/me/payouts/ src/lib/payouts/ | wc -l` returning 0.

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

- `20260429000005_app_current_user_role.sql` — RLS helper `app.current_user_role()` (NEW v0.2.0)
- `20260429000010_settlement_flow_client_direct.sql` — `settlement_flow` enum value 추가 + CHECK 제약 RECREATE
- `20260429000020_settlements_remittance_columns.sql` — 6개 nullable 컬럼 + UNIQUE + FK
- `20260429000030_organization_info.sql` — singleton 테이블 + CHECK (id=1) + RLS using `app.current_user_role()`
- `20260429000040_payout_receipts_bucket.sql` — Storage 버킷 + RLS 정책 using `app.current_user_role()`
- `20260429000050_notification_type_receipt_issued.sql` — `notification_type` enum value 추가
- `20260429000060_receipt_number_counter.sql` — `app.receipt_counters(year, counter)` 테이블 + `app.next_receipt_number()` 함수 (per-year reset, v0.2.0)

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

### 4.6 의존성 분류 + 충돌 검증

- **SPEC-PAYOUT-002 (PREREQUISITE — 선행 SPEC)**: 6-1 + sessions 보강 SPEC. **본 SPEC의 hard prerequisite**이다. 이유:
  - SPEC-RECEIPT-001의 `instructor_remittance_amount_krw` 컬럼은 SPEC-PAYOUT-002의 GENERATE Server Action이 `flow='client_direct'` 정산 행 생성 시 함께 채워준다 (REQ-RECEIPT-COLUMNS-001 참조)
  - PAYOUT-002가 main 브랜치에 머지된 이후 본 SPEC 작업 시작
  - 마이그레이션 timestamp는 PAYOUT-002 이후로 오는 `20260429000005~060` 사용 (PAYOUT-002의 timestamp가 더 이른 경우 timestamp 충돌 회피 필요. 권장: PAYOUT-002 `20260428xxx`, RECEIPT-001 `20260429xxx`)
  - acceptance.md test setup은 PAYOUT-002 baseline 적용을 가드
- **SPEC-PAYOUT-001**: 변경 없음. 본 SPEC은 `client_direct` 흐름만 추가하고 `corporate`/`government` 흐름 회귀 없음. **`client_direct` 흐름은 SPEC-PAYOUT-001 전환 그래프(`pending → requested → paid` + `held` 분기)를 그대로 상속**하며, 본 SPEC은 `requested → paid` 전환 시점에 atomic side-effects(영수증 발급)만 추가한다.
- **SPEC-DB-001**: 변경 없음. 본 SPEC은 SPEC-DB-001 산출물 위에 마이그레이션 7건 추가.
- **SPEC-ME-001 M5/M7/M8**: 영수증 PDF 렌더링은 SPEC-ME-001 M8 폰트 + M7 pgcrypto + LESSON-004 PII GUC invariant 재사용. M5 정산 상세 페이지를 본 SPEC이 확장.
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
   │     3. app.next_receipt_number() → 'RCP-2026-0001' (per-year counter)
   │     4. renderReceiptPdf() (in-memory Buffer)
   │     5. Storage upload + files INSERT (kind='payout_receipt', storage_path bucket-relative)
   │     6. UPDATE settlements (status='paid', receipt_*, instructor_remittance_received_at)
   │     7. INSERT notifications (type='receipt_issued')
   │     8. console.log("[notif] receipt_issued → ...")
   │
   ▼
[강사 알림 + 영수증 다운로드]
   - /me/payouts/[id] 진입 시 영수증 PDF 다운로드 링크 노출
   - signed URL 1시간 만료
```

### 5.2 영수증 번호 발급 (연도별 reset, 동시성 안전)

```sql
-- 20260429000005_app_current_user_role.sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION app.current_user_role() TO authenticated;

-- 20260429000060_receipt_number_counter.sql
CREATE TABLE IF NOT EXISTS app.receipt_counters (
  year integer PRIMARY KEY,
  counter bigint NOT NULL DEFAULT 0
);

ALTER TABLE app.receipt_counters ENABLE ROW LEVEL SECURITY;
-- No policies (default deny for direct access; only SECURITY DEFINER function can read/write)

CREATE OR REPLACE FUNCTION app.next_receipt_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  cur_year integer;
  cur_counter bigint;
BEGIN
  cur_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Seoul')::integer;

  INSERT INTO app.receipt_counters(year, counter)
  VALUES (cur_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET counter = app.receipt_counters.counter + 1
  RETURNING counter INTO cur_counter;

  RETURN 'RCP-' || cur_year::text || '-' || LPAD(cur_counter::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION app.next_receipt_number() TO authenticated;
```

호출:
```ts
const { data, error } = await supabase.rpc('next_receipt_number');
// data: 'RCP-2026-0001' (4-digit pad, supports 9999/year)
```

동시성: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`은 (year) 행에 대한 row-level lock을 atomically 획득. 병렬 호출 시 직렬화되어 중복 없음. UNIQUE 인덱스 (`receipt_number`)가 추가 방어선.

연도 reset: 신규 연도 첫 호출 시 `INSERT VALUES (year=2027, counter=1)` 자동 실행. 따라서 `RCP-2026-9999` 다음은 `RCP-2027-0001`.

### 5.3 DB-atomic + Storage compensating 트랜잭션 (TypeScript)

핵심 원칙: **DB 트랜잭션은 settlements UPDATE + files INSERT + notifications INSERT + pii_access_log INSERT를 모두 단일 단위로 묶고, decrypt_payout_field RPC도 같은 트랜잭션 안에서 호출한다 (PII GUC + access log 동시 보장). PDF 생성과 Storage 업로드는 트랜잭션 진입 후 commit 직전에 수행되며, 실패 시 best-effort compensating cleanup이 동작한다.**

```ts
// src/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts (개념)
import path from 'node:path';

export async function confirmRemittanceAndIssueReceipt(input: ConfirmInput) {
  const supabase = await createServerClient();
  const operator = await requireRole(['operator', 'admin']);

  // === Pre-tx validation ===
  const settlement = await getSettlementById(input.settlementId);
  if (settlement.status !== 'requested' || settlement.settlement_flow !== 'client_direct') {
    return { ok: false, error: ERRORS.STATUS_INVALID_TRANSITION };
  }
  if (input.receivedAmountKrw !== settlement.instructor_remittance_amount_krw) {
    return { ok: false, error: ERRORS.REMITTANCE_AMOUNT_MISMATCH };
  }

  // === Pre-tx: organization info + receipt number acquisition ===
  let organization;
  try {
    organization = await getOrganizationInfo(supabase);
  } catch (e) {
    return { ok: false, error: ERRORS.ORGANIZATION_INFO_MISSING };
  }
  const { data: receiptNumber, error: rnErr } = await supabase.rpc('next_receipt_number');
  if (rnErr || !receiptNumber) return { ok: false, error: ERRORS.RECEIPT_GENERATION_FAILED };

  // === DB transaction (PII GUC + decrypt + access log + PDF render + Storage upload + DB writes) ===
  // bucket-relative storage_path (REQ-RECEIPT-COLUMNS-007)
  const storagePath = `${input.settlementId}/${receiptNumber}.pdf`;
  let storageUploaded = false;

  try {
    await db.transaction(async (tx) => {
      // Step 4: PII GUC for the duration of this tx
      await tx.execute(sql`SET LOCAL app.pii_purpose = 'receipt_pdf_generation'`);

      // Step 5: SELECT instructor + decrypt bizno + log
      const [instructor] = await tx.select({
        id: instructorsTable.id,
        user_id: instructorsTable.user_id,
        name: instructorsTable.name,
        business_number_enc: instructorsTable.business_number_enc,
      }).from(instructorsTable).where(eq(instructorsTable.id, settlement.instructor_id));

      let decryptedBizNumber: string | null = null;
      if (instructor.business_number_enc) {
        const { data: dec, error: decErr } = await tx.execute(
          sql`SELECT decrypt_payout_field(${instructor.business_number_enc}) AS plain`
        );
        if (decErr) throw new Error(ERRORS.RECEIPT_GENERATION_FAILED);
        decryptedBizNumber = dec?.plain ?? null;

        // Mandatory pii_access_log INSERT (REQ-RECEIPT-PII-001)
        await tx.insert(piiAccessLogTable).values({
          actor_user_id: operator.id,
          target_table: 'instructors',
          target_column: 'business_number_enc',
          target_id: instructor.id,
          purpose: 'receipt_pdf_generation',
          accessed_at: new Date(),
        });
      }

      // Step 6: Render PDF in-memory (decrypted bizno flows ONLY into Buffer)
      const pdfBuffer = await renderReceiptPdf({
        settlement,
        instructor: { ...instructor, business_number: decryptedBizNumber },
        organization,
        receiptNumber,
        issuedAt: new Date(),
      });

      // Step 7: Storage upload (bucket-relative path)
      const { error: uploadErr } = await supabase.storage
        .from('payout-receipts')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' });
      if (uploadErr) throw new Error(ERRORS.STORAGE_UPLOAD_FAILED);
      storageUploaded = true;

      // Step 8a: files INSERT (storage_path is bucket-relative; REQ-RECEIPT-COLUMNS-007)
      const [file] = await tx.insert(filesTable).values({
        kind: 'payout_receipt',
        storage_path: storagePath,
        owner_id: instructor.user_id,
        size_bytes: pdfBuffer.length,
        mime_type: 'application/pdf',
      }).returning();

      // Step 8b: settlements UPDATE
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

      if (updated.length === 0) throw new Error(ERRORS.STALE_TRANSITION);

      // Step 8c: notifications INSERT
      await tx.insert(notificationsTable).values({
        recipient_id: instructor.user_id,
        type: 'receipt_issued',
        title: '영수증 발급 완료',
        body: `${receiptNumber} (${formatKRW(input.receivedAmountKrw)})`,
        link_url: `/me/payouts/${input.settlementId}`,
      });
    });
  } catch (e) {
    // Compensating step: best-effort Storage cleanup
    if (storageUploaded) {
      await supabase.storage.from('payout-receipts').remove([storagePath]).catch((err) => {
        console.error(`[storage-orphan] failed to clean up ${storagePath}:`, err);
      });
    }
    return { ok: false, error: (e as Error).message ?? ERRORS.RECEIPT_GENERATION_FAILED };
  }

  // Step 9: Post-commit console log (non-rollback)
  console.log(`[notif] receipt_issued → instructor_id=${settlement.instructor_id} settlement_id=${input.settlementId} receipt_number=${receiptNumber}`);

  revalidatePath(`/settlements/${input.settlementId}`);
  revalidatePath('/settlements');
  return { ok: true, receiptNumber };
}
```

원자성 보장:
- DB 트랜잭션은 settlements UPDATE + files INSERT + notifications INSERT + pii_access_log INSERT + (decrypt_payout_field RPC)을 묶어 원자적 커밋
- Storage 업로드는 트랜잭션 안에서 호출되지만 외부 I/O이므로 commit 후에도 잔여 가능 → DB 트랜잭션 롤백 시 best-effort `supabase.storage.remove([name])`로 compensating cleanup
- 잔여 고아 파일은 일일 reconciliation job(REQ-RECEIPT-CLEANUP-001, 후속 SPEC)에서 처리
- 중복 발급 방지: WHERE `status='requested'` + UNIQUE 인덱스 (receipt_number) + receipt_counters 행 락 3중 방어
- PII 보호: `SET LOCAL app.pii_purpose` + `pii_access_log` INSERT가 같은 트랜잭션 안에서 atomic하게 일어남 (LESSON-004 invariant 준수)

### 5.4 영수증 PDF 컴포넌트

```tsx
// src/components/payouts/ReceiptDocument.tsx (개념, planned)
import path from 'node:path';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Server-side render: Font.register requires absolute paths or HTTP URLs.
// Bare '/fonts/...' paths are browser-only and will silently fail in Node runtime.
Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: path.join(process.cwd(), 'public/fonts/NotoSansKR-Regular.ttf') },
    { src: path.join(process.cwd(), 'public/fonts/NotoSansKR-Bold.ttf'), fontWeight: 'bold' },
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

-- Use project-standard helper app.current_user_role() (no JWT custom hook required)
CREATE POLICY org_info_admin_all ON organization_info FOR ALL TO authenticated
USING (app.current_user_role() = 'admin')
WITH CHECK (app.current_user_role() = 'admin');

CREATE POLICY org_info_operator_select ON organization_info FOR SELECT TO authenticated
USING (app.current_user_role() IN ('operator', 'admin'));

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
      // bucket-relative path (REQ-RECEIPT-COLUMNS-007); bucket=payout-evidence encoded by kind
      const storagePath = `${input.settlementId}/${crypto.randomUUID()}.${ext}`;
      // Upload to Storage (best-effort, before DB INSERT)
      // ...
      const [file] = await tx.insert(filesTable).values({
        kind: 'remittance_evidence',
        storage_path: storagePath,
        // ...
      }).returning();
      evidenceFileId = file.id;
    }

    await tx.update(settlementsTable)
      .set({
        status: 'requested',
        client_payout_amount_krw: expectedClientPayout,
        // instructor_remittance_amount_krw는 SPEC-PAYOUT-002 GENERATE가 설정한 값 그대로 유지 (read-only)
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
| 영수증 번호 연도 경계 (12/31 → 1/1) reset | (해소됨) | v0.2.0 amendment: per-year `receipt_counters` 테이블 + `INSERT ... ON CONFLICT DO UPDATE` 패턴으로 신규 연도 첫 호출 시 counter 자동 reset. `RCP-2026-9999` → `RCP-2027-0001` 정상 동작 |
| 영수증 번호 9999/년 초과 (이론적 폭증) | 4-digit 자릿수 초과 | MVP 소상공인 플랫폼 가정에서 9999/년은 충분. 후속 SPEC에서 5-digit 확장 가능 (`RCP-YYYY-NNNNN`) |
| Storage 고아 파일 (DB tx 실패 + compensating delete 실패) | 디스크 누수 | best-effort compensating delete 1차 + 일일 reconciliation job (REQ-RECEIPT-CLEANUP-001, 후속 SPEC) 2차 방어 |
| PII GUC 누락 또는 pii_access_log 누락 | LESSON-004 invariant 위반, audit 불가 | REQ-RECEIPT-PII-001 명시 + acceptance 시나리오로 매 영수증 발급 시 pii_access_log 1행 INSERT 검증 |
| `app.current_user_role()` helper 미적용 시 RLS 우회 | 권한 검증 실패 | 마이그레이션 `20260429000005`에서 helper 정의 + 본 SPEC의 모든 RLS predicate가 helper 사용. JWT 커스텀 hook 의존 제거 |
| storage_path bucket-prefix 혼동 (RLS predicate 매칭 실패) | 강사가 본인 영수증 다운로드 불가 | REQ-RECEIPT-COLUMNS-007에서 bucket-relative invariant 명시. acceptance 시나리오 6-B에서 정책 매칭 검증 |
| SPEC-PAYOUT-002 prerequisite 미머지 상태에서 본 SPEC 시작 | `instructor_remittance_amount_krw` 채워지지 않은 정산 행 → 강사 송금 등록 단계에서 mismatch | plan.md prerequisite 가드 + acceptance test setup 가드 |
| SPEC-PAYOUT-002 마이그레이션 timestamp 충돌 | 마이그레이션 순서 깨짐 | 본 SPEC timestamp `20260429000005~060` 사용, SPEC-PAYOUT-002는 더 이른 timestamp(`20260428xxx`) 권장 |

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
