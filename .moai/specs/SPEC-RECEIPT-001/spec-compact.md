# SPEC-RECEIPT-001 — 압축본 (Compact)

> 자동 생성 압축본. 요구사항 + 인수기준 + 영향 범위 + 제외 사항만 포함. 상세는 `spec.md` / `plan.md` / `acceptance.md` 참조.

**ID:** SPEC-RECEIPT-001 | **Version:** 0.1.0 | **Status:** draft | **Priority:** high
**Author:** 철 | **Created/Updated:** 2026-04-29

---

## 한 줄 요약

알고링크 MVP §6-2 「고객 직접 정산 + 영수증 자동 발급」 흐름 — `settlement_flow`에 `client_direct` 추가 + `settlements` 6개 컬럼 nullable 추가 + 강사 송금 등록 (pending→requested) + 운영자 수취 확인 atomic 트랜잭션 (PDF 생성 + Storage 업로드 + 영수증 번호 시퀀스 발급 + 알림 INSERT + 콘솔 로그) + `payout-receipts` Storage 버킷 + RLS + `organization_info` singleton + `notification_type='receipt_issued'`. SPEC-PAYOUT-001 paid-freeze 인배리언트 그대로 존중.

---

## EARS 요구사항 (7 모듈, 38 항목)

### REQ-RECEIPT-FLOW — settlement_flow 확장 + CHECK 제약 (6개)

- **001 Ubiquitous:** `ALTER TYPE settlement_flow ADD VALUE IF NOT EXISTS 'client_direct';` 마이그레이션 (`20260429000010`)
- **002 Ubiquitous:** CHECK 제약 RECREATE — 3개 disjunct (`corporate=0` OR `government IN (3.30,8.80)` OR `client_direct IN (3.30,8.80)`)
- **003 Unwanted Behavior:** `client_direct + rate ∉ {3.30,8.80}` INSERT/UPDATE → DB CHECK 거부 (23514)
- **004 Ubiquitous:** Drizzle 스키마 + TypeScript `SettlementFlow` 타입 동기화
- **005 Ubiquitous:** zod superRefine — `client_direct + rate ∉ {3.30,8.80}` → `TAX_RATE_CLIENT_DIRECT_INVALID` 사전 거부
- **006 Optional Feature:** 기존 `corporate`/`government` 흐름 회귀 없음, 데이터 마이그레이션 불필요

### REQ-RECEIPT-COLUMNS — settlements 신규 컬럼 (6개)

- **001 Ubiquitous:** 6개 nullable 컬럼 추가 (`instructor_remittance_amount_krw`, `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id` FK→files, `receipt_issued_at`, `receipt_number`)
- **002 Ubiquitous:** `receipt_number` UNIQUE 인덱스 (`idx_settlements_receipt_number`)
- **003 State-Driven:** While `status='paid' AND flow='client_direct'`, 3개 컬럼 (receipt_file_id, receipt_number, receipt_issued_at) 모두 non-null (애플리케이션 레이어 강제)
- **004 Ubiquitous:** Drizzle 타입에서 모든 신규 컬럼 nullable 처리, 사용 시 narrow
- **005 Unwanted Behavior:** `receipt_number IS NOT NULL`인 정산에 재발급 시도 → `RECEIPT_ALREADY_ISSUED` + DB 변경 없음
- **006 Ubiquitous:** `getSettlementById` SELECT에 6개 컬럼 포함, UPDATABLE_COLUMNS 화이트리스트에서 제외 — 전용 atomic Server Action만 변경 가능

### REQ-RECEIPT-INSTRUCTOR — 강사 송금 등록 (6개)

- **001 Ubiquitous:** `(instructor)/me/payouts/[id]` 페이지에 "송금 완료 등록" CTA — `flow=client_direct AND status=pending`
- **002 Event-Driven:** When CTA 클릭, 폼 노출 (송금일자, 송금금액 = `instructor_remittance_amount_krw`, 선택 첨부 max 10MB)
- **003 Unwanted Behavior:** If 송금금액 ≠ expected, → `REMITTANCE_AMOUNT_MISMATCH` (zod 사전 거부)
- **004 Event-Driven:** When 제출, `registerInstructorRemittance` Server Action — 트랜잭션: status `pending → requested` + 첨부 Storage 업로드 + `files` INSERT (kind=`remittance_evidence`) + `client_payout_amount_krw` 갱신
- **005 State-Driven:** While `status='requested'`, 등록 정보 read-only 표시 + CTA 비활성
- **006 Optional Feature:** Where `status='paid'`, 영수증 PDF 다운로드 링크 노출 (signed URL 1시간 만료)

### REQ-RECEIPT-OPERATOR — 운영자 수취 확인 + 영수증 발급 atomic (7개)

- **001 Ubiquitous:** `(operator)/settlements/[id]`에 "수취 확인 + 영수증 발급" 패널 — `flow=client_direct AND status=requested`
- **002 Event-Driven:** When 패널 진입, 등록된 송금 정보 read-only + 입력 폼 (입금확인일자, 실제입금금액, 메모)
- **003 Event-Driven:** When 제출, `confirmRemittanceAndIssueReceipt` Server Action — 8단계 atomic:
  1. validateTransition('requested','paid')
  2. amount mismatch 검증
  3. `nextval('receipt_number_seq')` → `RCP-YYYY-NNN`
  4. PDF in-memory 렌더 (`renderReceiptPdf`)
  5. Storage upload `payout-receipts/<settlement_id>/<receipt_number>.pdf`
  6. DB tx: files INSERT + settlements UPDATE (status, receipt_*, instructor_remittance_received_at) + notifications INSERT
  7. COMMIT
  8. `console.log("[notif] receipt_issued → ...")` post-commit
- **004 Unwanted Behavior:** If 임의 step 실패, 전체 롤백 (DB rollback + best-effort Storage delete) + 한국어 에러
- **005 Unwanted Behavior:** If 이미 `receipt_number IS NOT NULL` (race), UPDATE WHERE matched 0 → `RECEIPT_ALREADY_ISSUED`
- **006 State-Driven:** While `status='paid'` (client_direct), 영수증 정보 + 다운로드 링크 노출, 모든 전환 버튼 disabled (paid-freeze)
- **007 Ubiquitous:** flow indicator 표시 — `client_direct` → "고객사 → 강사 → 알고링크"

### REQ-RECEIPT-PDF — 영수증 PDF 생성 (6개)

- **001 Ubiquitous:** `@react-pdf/renderer` + NotoSansKR (`public/fonts/NotoSansKR-{Regular,Bold}.ttf`, SPEC-ME-001 M8 재사용)
- **002 Ubiquitous:** A4 portrait 단일 페이지, 6개 섹션 (Header, 강사 정보, 알고링크 정보, 거래 정보, 본문 "위 금액을 정히 영수합니다", Footer)
- **003 Ubiquitous:** `getOrganizationInfo()` — DB(`organization_info` id=1) 우선 → env 변수 fallback → 둘 다 없으면 `ORGANIZATION_INFO_MISSING`
- **004 Unwanted Behavior:** PDF 렌더링 실패 (font, react-pdf, org info) → `RECEIPT_GENERATION_FAILED` + 트랜잭션 롤백
- **005 Ubiquitous:** 모든 날짜 KST (`formatKstDate`), 금액 KRW (`formatKRW`)
- **006 Optional Feature:** 강사 사업자등록번호 (`business_number_enc`) → `decrypt_payout_field` RPC 경유, 실패/null 시 PDF에서 생략

### REQ-RECEIPT-NOTIFY — 알림 + 콘솔 로그 (5개)

- **001 Ubiquitous:** `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`
- **002 Event-Driven:** When atomic Step 7, `notifications` INSERT — recipient=강사 user_id, type=`receipt_issued`, title=`"영수증 발급 완료"`, body=`"<receipt_number> (<formatted KRW>)"`, link_url=`/me/payouts/<id>`
- **003 Event-Driven:** When Step 8, 콘솔 stdout 정확히 1줄 — `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>` (정규식 검증)
- **004 Unwanted Behavior:** If notifications INSERT 실패, 전체 롤백 + 콘솔 로그 미출력
- **005 Ubiquitous:** 실제 이메일/SMS 발송 없음 — SPEC-NOTIFY-001 후속 hook (콘솔 로그 식별자 제공)

### REQ-RECEIPT-RLS — Storage 버킷 + 영수증 RLS (6개)

- **001 Ubiquitous:** Storage 버킷 `payout-receipts` 생성 (public=false, 50MB limit)
- **002 Ubiquitous:** 3개 RLS 정책 — `payout_receipts_self_select` (instructor 본인 SELECT), `payout_receipts_operator_all` (operator/admin RW), default deny
- **003 Ubiquitous:** `files` 신규 행 — kind=`receipt`, owner_id=강사 user_id, storage_path=`payout-receipts/<settlement_id>/<receipt_number>.pdf`
- **004 Unwanted Behavior:** 강사가 다른 강사 영수증 path 접근 → 401/403 (RLS) — unsigned URL 클라이언트 노출 없음
- **005 Ubiquitous:** Signed URL 1시간 만료 (`createSignedUrl(path, 3600)`), server-side만 생성
- **006 Ubiquitous:** Service-role Supabase 클라이언트 미도입 — RLS가 인증 권한 단일 출처

---

## 인수기준 요약 (Given/When/Then 10개)

| # | 시나리오 | 핵심 검증 |
|---|---------|----------|
| 1 | 강사 송금 등록 (pending → requested) | status 전환 + client_payout_amount_krw 갱신 + 첨부 파일 `files` INSERT + history 1행 |
| 2 | 운영자 수취 확인 atomic + 영수증 발급 | 8단계 모두 성공 — status=paid, receipt_*, files INSERT, notifications INSERT, 콘솔 로그 정확한 형식 |
| 3 | 영수증 PDF 한국어 렌더 | NotoSansKR 정상, 알고링크 정보 임베드, A4 단일 페이지, KRW/KST 포맷, 깨짐 0 |
| 4 | 영수증 번호 동시성 (병렬 5건) | 모두 unique RCP-2026-NNN, SEQUENCE atomic, UNIQUE 인덱스 위반 0 |
| 5 | 송금 금액 mismatch 거부 (강사+운영자) | zod 사전 거부 + Server Action 내부 검증 (REMITTANCE_AMOUNT_MISMATCH), DB 변경 0 |
| 6 | RLS — 강사 본인 외 영수증 접근 차단 | 다른 강사 path → 401/403, 본인 → 다운로드 성공, operator/admin → 모든 영수증 접근 |
| 7 | paid 동결 + 재발급 거부 | 모든 전환 버튼 disabled, 강제 호출 시 RECEIPT_ALREADY_ISSUED, race-condition WHERE matched 0 |
| 8 | 알림 + 콘솔 로그 SPEC-NOTIFY-001 hook | notifications 정확한 필드, 콘솔 stdout 정규식 매칭 |
| 9 | organization_info 우선순위 (DB > env > 거부) | DB 우선, env fallback, 둘 다 없으면 ORGANIZATION_INFO_MISSING |
| 10 | SPEC-PAYOUT-001 회귀 검증 | corporate/government 흐름 정상, 16개 상태 전환 단위 테스트 PASS |

---

## 영향 범위 (Affected Files)

**신규 마이그레이션 (6건):**
- `supabase/migrations/20260429000010_settlement_flow_client_direct.sql`
- `supabase/migrations/20260429000020_settlements_remittance_columns.sql`
- `supabase/migrations/20260429000030_organization_info.sql`
- `supabase/migrations/20260429000040_payout_receipts_bucket.sql`
- `supabase/migrations/20260429000050_notification_type_receipt_issued.sql`
- `supabase/migrations/20260429000060_receipt_number_seq.sql`

**신규 도메인 모듈 (`src/lib/payouts/`):**
- `receipt-pdf.ts` (planned)
- `receipt-number.ts` (planned)
- `organization-info.ts` (planned)
- `client-direct-validation.ts` (planned)
- `__tests__/receipt-{pdf,number,concurrency}.test.ts`
- `__tests__/{organization-info,client-direct-validation,instructor-remittance,operator-confirmation}.test.ts`

**기존 모듈 확장:**
- `src/lib/payouts/{types,errors,tax-calculator,validation,status-machine,queries}.ts`
- `src/db/schema/{settlements,notifications}.ts` + `organization-info.ts` (신규)

**신규 라우트 + 컴포넌트:**
- `src/app/(app)/(instructor)/me/payouts/[id]/remit/{actions.ts,page.tsx?}` (planned)
- `src/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions.ts` (planned)
- `src/components/payouts/{ReceiptDocument,RemittanceRegistrationForm,RemittanceConfirmationPanel,ReceiptPreviewLink,ClientDirectStatusBadge}.tsx` (planned)

**기존 페이지 확장:**
- `src/app/(app)/(instructor)/me/payouts/[id]/page.tsx` (CTA + 다운로드 링크)
- `src/app/(app)/(operator)/settlements/[id]/page.tsx` (RemittanceConfirmationPanel + flow indicator)
- `src/app/(app)/(operator)/settlements/page.tsx` (flow 필터에 client_direct 추가)
- `src/components/payouts/SettlementStatusBadge.tsx` (flow별 라벨 분기)

**환경 변수 추가:**
- `ORG_NAME`, `ORG_BIZ_NUMBER`, `ORG_REPRESENTATIVE`, `ORG_ADDRESS`, `ORG_CONTACT` (organization_info 미설정 fallback)

---

## 제외 사항 (Exclusions)

| 항목 | 위임/사유 |
|------|----------|
| 실제 이메일/SMS 발송 (Resend/SES/카카오) | SPEC-NOTIFY-001 (콘솔 로그 hook 제공) |
| 국세청 세금계산서 자동 발행 (e세로/Popbill) | SPEC-PAYOUT-INVOICE-XXX |
| 영수증 취소/재발급/대체 발급 UI | (admin 직접 SQL, 후속) |
| 영수증 일괄 발급 (bulk) | SPEC-PAYOUT-BULK-XXX |
| 강사 송금 자동 매칭 (KB/신한 OpenAPI) | SPEC-PAYOUT-BANKING-XXX |
| 알고링크 사업자 정보 admin UI | (MVP는 SQL/env, admin UI는 후속) |
| organization_info 다중 행 / 다중 법인 | 단일 워크스페이스 가정 (product.md §3.3 [1]) |
| 영수증 인쇄용 별도 레이아웃 | A4 portrait 단일 디자인 |
| 영수증 다국어 (영어/일본어) | 한국어 단일 |
| PG 연동 (카카오페이/토스/네이버페이) | 후속 |
| 강사 송금 영수증 OCR 자동 검증 | 후속 |
| 영수증 워터마크/디지털 서명/전자 인장 | 후속 |
| 정산 행 자동 생성 트리거 (project task_done → settlement) | SPEC-PAYOUT-AUTOGEN-XXX |
| 정산 행 신규 등록 UI (운영자가 client_direct 행 직접 INSERT) | SPEC-PAYOUT-CREATE-XXX |
| 영수증 검색/필터/다운로드 페이지 (운영자) | 후속 |
| 영수증 미발급 알람 (N일 이상 미확인 정산) | SPEC-NOTIFY-001 |
| 6-1 ↔ 6-2 흐름 변경 (settlement_flow UPDATE) | 데이터 정합성 위험, 후속 |
| 모바일 전용 영수증 발급 UI | 데스크톱 우선 |

---

## 핵심 설계 결정 (Design Decisions)

1. **상태 머신 의미 재해석 (백엔드 enum 미변경)** — `client_direct` 흐름 한정으로 `pending`/`requested`/`paid`/`held`의 UI 라벨만 다르게 표시 ("수취 대기"/"입금 확인 대기"/"영수증 발급 완료"/"보류"). SPEC-PAYOUT-001 paid-freeze 인배리언트 그대로 존중.
2. **영수증 번호 동시성 = PostgreSQL SEQUENCE** — `RCP-YYYY-NNN` 형식, `app.next_receipt_number()` SECURITY DEFINER 함수, UNIQUE 인덱스가 추가 방어선. 연도별 reset은 본 SPEC 미구현 (단순 incrementing + 연도 prefix 충분).
3. **atomic 트랜잭션 패턴** — PDF 렌더 + Storage 업로드는 트랜잭션 밖에서 먼저, DB transaction 안에서는 `files` + `settlements` + `notifications` 3개 테이블 변경. DB 실패 시 best-effort Storage delete (고아 파일 후속 cron).
4. **organization_info source 우선순위** — DB 행(`id=1` enforce CHECK) > env 변수 > `ORGANIZATION_INFO_MISSING` 거부. MVP는 placeholder seed + admin SQL 갱신.
5. **Storage RLS 3-tier** — instructor self-read (owner_id 매칭) / operator/admin all RW / default deny. signed URL 1시간 만료 (server-only 생성).
6. **NotoSansKR 폰트 재사용** — SPEC-ME-001 M8 산출물 (`public/fonts/`) 그대로. PDF 크기 < 500KB 예상 (외부 폰트 subset embed).
7. **paid-freeze 인배리언트 존중** — SPEC-PAYOUT-001 STATUS_PAID_FROZEN 한국어 에러 그대로 활용. 영수증 발급은 `requested → paid` 단일 트랜잭션으로 atomic. 재발급 차단은 UNIQUE + WHERE 조건 + 사전 검증 3중 방어.

---

## 신규 한국어 에러 (6종)

| 상수 | 메시지 |
|------|--------|
| `REMITTANCE_AMOUNT_MISMATCH` | "송금 금액이 정산 정보와 일치하지 않습니다." |
| `RECEIPT_ALREADY_ISSUED` | "이미 영수증이 발급된 정산입니다." |
| `RECEIPT_GENERATION_FAILED` | "영수증 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |
| `ORGANIZATION_INFO_MISSING` | "알고링크 사업자 정보가 설정되지 않았습니다. 관리자에게 문의하세요." |
| `STORAGE_UPLOAD_FAILED` | "영수증 파일 업로드에 실패했습니다." |
| `TAX_RATE_CLIENT_DIRECT_INVALID` | "고객 직접 정산 원천세율은 3.30% 또는 8.80%만 가능합니다." |

기존 SPEC-PAYOUT-001의 8종 에러 그대로 활용 (`STATUS_PAID_FROZEN`, `STATUS_INVALID_TRANSITION`, `SETTLEMENT_NOT_FOUND`, `STALE_TRANSITION` 등).

---

## 결정 필요 사항 (Open Questions, 없음)

본 SPEC은 사용자 인터뷰(2026-04-29)에서 확정된 8개 결정 사항(D1-D8)을 모두 반영했으므로 추가 결정 필요 사항 없음.

---

_End of SPEC-RECEIPT-001 spec-compact.md_
