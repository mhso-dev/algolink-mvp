# SPEC-RECEIPT-001 — 압축본 (Compact)

> 자동 생성 압축본. 요구사항 + 인수기준 + 영향 범위 + 제외 사항만 포함. 상세는 `spec.md` / `plan.md` / `acceptance.md` 참조.

**ID:** SPEC-RECEIPT-001 | **Version:** 0.2.0 | **Status:** draft | **Priority:** high
**Author:** 철 | **Created/Updated:** 2026-04-29

---

## 한 줄 요약

알고링크 MVP §6-2 「고객 직접 정산 + 영수증 자동 발급」 흐름 — `settlement_flow`에 `client_direct` 추가 + `settlements` 6개 컬럼 nullable 추가 + 강사 송금 등록 (pending→requested) + 운영자 수취 확인 **DB-atomic + Storage compensating 트랜잭션** (PII GUC + decrypt + pii_access_log + PDF 생성 + Storage 업로드 + 영수증 번호 연도별 카운터 reset + 알림 INSERT + 콘솔 로그) + `payout-receipts` Storage 버킷 + RLS (`app.current_user_role()` helper 기반) + `organization_info` singleton + `notification_type='receipt_issued'`. **SPEC-PAYOUT-002가 prerequisite** (instructor_remittance_amount_krw 컬럼은 PAYOUT-002 GENERATE Server Action이 채워준다). SPEC-PAYOUT-001 paid-freeze 인배리언트 그대로 존중. v0.2.0 amendment: receipt number `RCP-YYYY-NNNN` (4-digit, 연도별 reset), bucket-relative storage_path, PII invariant.

---

## EARS 요구사항 (9 모듈, 48 항목 — v0.2.0 PII + CLEANUP 모듈 추가, COLUMNS 007/008 추가, COLUMNS-003a split)

### REQ-RECEIPT-FLOW — settlement_flow 확장 + CHECK 제약 (6개)

- **001 Ubiquitous:** `ALTER TYPE settlement_flow ADD VALUE IF NOT EXISTS 'client_direct';` 마이그레이션 (`20260429000010`)
- **002 Ubiquitous:** CHECK 제약 RECREATE — 3개 disjunct (`corporate=0` OR `government IN (3.30,8.80)` OR `client_direct IN (3.30,8.80)`)
- **003 Unwanted Behavior:** `client_direct + rate ∉ {3.30,8.80}` INSERT/UPDATE → DB CHECK 거부 (23514)
- **004 Ubiquitous:** Drizzle 스키마 + TypeScript `SettlementFlow` 타입 동기화
- **005 Ubiquitous:** zod superRefine — `client_direct + rate ∉ {3.30,8.80}` → `TAX_RATE_CLIENT_DIRECT_INVALID` 사전 거부
- **006 Optional Feature:** 기존 `corporate`/`government` 흐름 회귀 없음, **`client_direct` 흐름은 SPEC-PAYOUT-001 전환 그래프 unchanged 상속**, 데이터 마이그레이션 불필요

### REQ-RECEIPT-COLUMNS — settlements 신규 컬럼 (8개, v0.2.0에서 007/008 추가)

- **001 Ubiquitous:** 6개 nullable 컬럼 추가 — `instructor_remittance_amount_krw` (**owner: SPEC-PAYOUT-002 GENERATE**, RECEIPT-001은 read-only 소비), `instructor_remittance_received_at`, `client_payout_amount_krw`, `receipt_file_id` FK→files, `receipt_issued_at`, `receipt_number` (`RCP-YYYY-NNNN` 4-digit)
- **002 Ubiquitous:** `receipt_number` UNIQUE 인덱스 + regex `^RCP-\d{4}-\d{4}$` 매칭
- **003 State-Driven:** While `status='paid' AND flow='client_direct'`, 3개 컬럼 (receipt_file_id, receipt_number, receipt_issued_at) 모두 non-null (애플리케이션 레이어 강제)
- **003a Ubiquitous:** REQ-COLUMNS-003의 invariant은 Server Action 트랜잭션 atomicity로 establish (DB trigger/CHECK은 후속 SPEC)
- **004 Ubiquitous:** Drizzle 타입에서 모든 신규 컬럼 nullable 처리, 사용 시 narrow
- **005 Unwanted Behavior:** `receipt_number IS NOT NULL`인 정산에 재발급 시도 → `RECEIPT_ALREADY_ISSUED` + DB 변경 없음
- **006 Ubiquitous:** `getSettlementById` SELECT에 6개 컬럼 포함, UPDATABLE_COLUMNS 화이트리스트에서 제외 — 전용 atomic Server Action만 변경 가능
- **007 Ubiquitous (NEW v0.2.0):** `files.storage_path`는 **bucket-relative** 키 (storage.objects.name과 1:1 매칭, bucket prefix 없음). payout receipt 컨벤션: `<settlement_id>/<receipt_number>.pdf`, bucket=`payout-receipts` encoded by `kind='payout_receipt'`
- **008 Unwanted Behavior (NEW v0.2.0):** 일반 settlement UPDATE Server Action에서 receipt_number 변경 차단 (UPDATABLE_COLUMNS exclude + integration test 검증)

### REQ-RECEIPT-INSTRUCTOR — 강사 송금 등록 (6개)

- **001 Ubiquitous:** `(instructor)/me/payouts/[id]` 페이지에 "송금 완료 등록" CTA — `flow=client_direct AND status=pending`
- **002 Event-Driven:** When CTA 클릭, 폼 노출 (송금일자, 송금금액 = `instructor_remittance_amount_krw`, 선택 첨부 max 10MB)
- **003 Unwanted Behavior:** If 송금금액 ≠ expected, → `REMITTANCE_AMOUNT_MISMATCH` (zod 사전 거부)
- **004 Event-Driven:** When 제출, `registerInstructorRemittance` Server Action — 트랜잭션: status `pending → requested` + 첨부 Storage 업로드 + `files` INSERT (kind=`remittance_evidence`) + `client_payout_amount_krw` 갱신
- **005 State-Driven:** While `status='requested'`, 등록 정보 read-only 표시 + CTA 비활성
- **006 Optional Feature:** Where `status='paid'`, 영수증 PDF 다운로드 링크 노출 (signed URL 1시간 만료)

### REQ-RECEIPT-OPERATOR — 운영자 수취 확인 + 영수증 발급 (DB-atomic + Storage compensating, 7개)

- **001 Ubiquitous:** `(operator)/settlements/[id]`에 "수취 확인 + 영수증 발급" 패널 — `flow=client_direct AND status=requested`
- **002 Event-Driven:** When 패널 진입, 등록된 송금 정보 read-only + 입력 폼 (입금확인일자, 실제입금금액, 메모)
- **003 Event-Driven (v0.2.0 정정):** When 제출, `confirmRemittanceAndIssueReceipt` Server Action — **DB-atomic + Storage compensating** 모델, 8 atomic + 1 compensating step:
  1. (pre-tx) validateTransition('requested','paid')
  2. (pre-tx) amount mismatch 검증
  3. (pre-tx) getOrganizationInfo + `app.next_receipt_number()` RPC → `RCP-YYYY-NNNN` (연도별 reset, 4-digit)
  4. (BEGIN tx) `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` (REQ-RECEIPT-PII-001)
  5. (in-tx) instructor SELECT + `decrypt_payout_field` RPC + `pii_access_log` INSERT (1행)
  6. (in-tx, in-memory) PDF 렌더 (decrypted bizno → Buffer만)
  7. (in-tx, Storage I/O) Upload bucket=`payout-receipts`, name=`<settlement_id>/<receipt_number>.pdf` (bucket-relative, REQ-COLUMNS-007)
  8. (in-tx) files INSERT + settlements UPDATE + notifications INSERT + COMMIT
  9. (post-commit) `console.log("[notif] receipt_issued → ...")` + revalidatePath
  - **Compensating step**: DB tx 실패 시 best-effort `storage.remove([name])`; 잔여 고아는 REQ-RECEIPT-CLEANUP-001 (후속 SPEC) 일일 reconciliation
- **004 Unwanted Behavior:** If Step 3-8 임의 실패, DB tx 롤백 + Storage compensating cleanup + 한국어 에러 (RECEIPT_GENERATION_FAILED / STORAGE_UPLOAD_FAILED / ORGANIZATION_INFO_MISSING)
- **005 Unwanted Behavior:** If 이미 `receipt_number IS NOT NULL` (race), UPDATE WHERE matched 0 → `RECEIPT_ALREADY_ISSUED`
- **006 State-Driven:** While `status='paid'` (client_direct), 영수증 정보 + 다운로드 링크 노출, 모든 전환 버튼 disabled (paid-freeze)
- **007 Ubiquitous:** flow indicator 표시 — `client_direct` → "고객사 → 강사 → 알고링크"

### REQ-RECEIPT-PDF — 영수증 PDF 생성 (6개)

- **001 Ubiquitous (v0.2.0 정정):** `@react-pdf/renderer` + NotoSansKR (`public/fonts/NotoSansKR-{Regular,Bold}.ttf`). **Server-side render: `Font.register({ src: path.join(process.cwd(), 'public/fonts/NotoSansKR-Regular.ttf') })` 절대 경로 필수** (bare `/fonts/...`는 browser-only). SPEC-ME-001 M8 패턴 재사용.
- **002 Ubiquitous:** A4 portrait 단일 페이지, 6개 섹션 (Header, 강사 정보, 알고링크 정보, 거래 정보, 본문 "위 금액을 정히 영수합니다", Footer)
- **003 Ubiquitous:** `getOrganizationInfo()` — DB(`organization_info` id=1) 우선 → env 변수 fallback → 둘 다 없으면 `ORGANIZATION_INFO_MISSING`
- **004 Unwanted Behavior:** PDF 렌더링 실패 (font, react-pdf, org info) → `RECEIPT_GENERATION_FAILED` + 트랜잭션 롤백
- **005 Ubiquitous:** 모든 날짜 KST (`formatKstDate`, `at TIME ZONE 'Asia/Seoul'` 변환), 금액 KRW (`formatKRW`)
- **006 Optional Feature (v0.2.0 정정):** 강사 사업자등록번호 (`business_number_enc`) → `decrypt_payout_field` RPC 경유 — **DB 트랜잭션 안에서 호출** (REQ-RECEIPT-PII-001 `SET LOCAL app.pii_purpose` + `pii_access_log` INSERT 동반); 실패/null 시 PDF에서 생략

### REQ-RECEIPT-PII — PII GUC + access log invariant (3개, NEW v0.2.0)

- **001 Ubiquitous:** decrypt_payout_field 호출 전 `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` (same tx) + decrypt 직후 `pii_access_log` INSERT 1행 (target=instructors.business_number_enc, purpose='receipt_pdf_generation') — LESSON-004 invariant 준수
- **002 Unwanted Behavior:** decrypt 실패 또는 pii_access_log INSERT 실패 → 전체 DB 트랜잭션 롤백 + Storage compensating cleanup + RECEIPT_GENERATION_FAILED
- **003 Ubiquitous:** 복호화된 사업자등록번호는 PDF Buffer + pii_access_log 외에 영속되지 않음 (콘솔 로그, 응답 객체에 노출 금지)

### REQ-RECEIPT-CLEANUP — Storage 고아 reconciliation (1개, NEW v0.2.0)

- **001 Ubiquitous (out-of-scope acknowledgment):** Storage 고아 파일 reconciliation 일일 job은 **본 SPEC 범위 외** — SPEC-PAYOUT-CLEANUP-XXX (후속) 위임. 본 SPEC은 best-effort compensating delete만 제공; 잔여 risk acknowledged.

### REQ-RECEIPT-NOTIFY — 알림 + 콘솔 로그 (5개)

- **001 Ubiquitous:** `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'receipt_issued';`
- **002 Event-Driven:** When atomic Step 8, `notifications` INSERT (in-tx) — recipient=강사 user_id, type=`receipt_issued`, title=`"영수증 발급 완료"`, body=`"<receipt_number> (<formatted KRW>)"`, link_url=`/me/payouts/<id>`
- **003 Event-Driven (v0.2.0 정정):** When Step 9 post-commit, 콘솔 stdout 정확히 1줄 — `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=<text>` (정규식 `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{4}$`)
- **004 Unwanted Behavior:** If notifications INSERT 실패 (in-tx), 전체 DB 트랜잭션 롤백 + Storage compensating cleanup + 콘솔 로그 미출력
- **005 Ubiquitous (v0.2.0 강화):** 실제 이메일/SMS 발송 없음 — outbound HTTP request to email/SMS providers 0건. notifications INSERT (in-app) + console.log 두 채널만. SPEC-NOTIFY-001 후속 hook 식별자 제공

### REQ-RECEIPT-RLS — Storage 버킷 + 영수증 RLS (6개)

- **001 Ubiquitous:** Storage 버킷 `payout-receipts` 생성 (public=false, 50MB limit)
- **002 Ubiquitous (v0.2.0 정정):** RLS 정책 — `app.current_user_role()` helper 기반 (JWT 커스텀 hook 의존 제거):
  - `payout_receipts_self_select`: `app.current_user_role() = 'instructor'` + auth.uid() 매칭
  - `payout_receipts_operator_all`: `app.current_user_role() IN ('operator', 'admin')`
  - default deny
  - storage_path는 bucket-relative이므로 RLS predicate `WHERE storage_path = name` 직접 매칭 (REQ-COLUMNS-007)
- **003 Ubiquitous (v0.2.0 정정):** `files` 신규 행 — kind=`payout_receipt`, owner_id=강사 user_id, storage_path=`<settlement_id>/<receipt_number>.pdf` (**bucket-relative, NO 'payout-receipts/' prefix**)
- **004 Unwanted Behavior:** 강사가 다른 강사 영수증 path 접근 → 401/403 (RLS) — unsigned URL 클라이언트 노출 없음
- **005 Ubiquitous:** Signed URL 1시간 만료 (`createSignedUrl(path, 3600)`), server-side만 생성
- **006 Ubiquitous (v0.2.0 강화):** Service-role Supabase 클라이언트 미도입 — RLS가 인증 권한 단일 출처. **검증 방법**: `grep -r "createServiceRoleClient\|SUPABASE_SERVICE_ROLE_KEY" src/.../payouts/` → 0건

---

## 인수기준 요약 (Given/When/Then 14개, v0.2.0에서 11-14 추가)

| # | 시나리오 | 핵심 검증 |
|---|---------|----------|
| 1 | 강사 송금 등록 (pending → requested) | status 전환 + client_payout_amount_krw 갱신 + 첨부 파일 `files` INSERT + history 1행 |
| 2 | 운영자 수취 확인 (DB-atomic + Storage compensating) + 영수증 발급 | 8 atomic + 1 compensating step 모두 성공 — status=paid, receipt_* (`RCP-YYYY-NNNN` 4-digit), files INSERT (storage_path bucket-relative), notifications INSERT, **pii_access_log INSERT**, 콘솔 로그 정확한 형식 |
| 3 | 영수증 PDF 한국어 렌더 | NotoSansKR 정상 (path.join 절대경로 server-side), 알고링크 정보 임베드, A4 단일 페이지, KRW/KST 포맷, 깨짐 0 |
| 4 | 영수증 번호 동시성 (병렬 5건) + 연도 reset | 모두 unique `RCP-2026-NNNN`, `receipt_counters` row lock atomic, UNIQUE 위반 0; 신규 연도 첫 호출 시 카운터 reset (RCP-2027-0001) |
| 5 | 송금 금액 mismatch 거부 (강사+운영자) | zod 사전 거부 + Server Action 내부 검증 (REMITTANCE_AMOUNT_MISMATCH), DB 변경 0 |
| 6 | RLS — 강사 본인 외 영수증 접근 차단 | 다른 강사 path → 401/403 (`app.current_user_role()` helper 기반), 본인 → 다운로드 성공, operator/admin → 모든 영수증 접근 |
| 7 | paid 동결 + 재발급 거부 + 일반 UPDATE 차단 | 모든 전환 버튼 disabled, 강제 호출 시 RECEIPT_ALREADY_ISSUED, race-condition WHERE matched 0, **일반 settlement UPDATE Server Action으로 receipt_number 변경 차단** (REQ-COLUMNS-008) |
| 8 | 알림 + 콘솔 로그 SPEC-NOTIFY-001 hook | notifications 정확한 필드, 콘솔 stdout 4-digit 정규식 매칭, **이메일/SMS provider 외부 통신 0건** (REQ-NOTIFY-005) |
| 9 | organization_info 우선순위 (DB > env > 거부) | DB 우선, env fallback, 둘 다 없으면 ORGANIZATION_INFO_MISSING |
| 10 | SPEC-PAYOUT-001 회귀 검증 | corporate/government 흐름 정상, 16개 상태 전환 단위 테스트 PASS |
| 11 (NEW v0.2.0) | KST timezone 일관 (REQ-PDF-005) | 모든 날짜 KST 변환 (`at TIME ZONE 'Asia/Seoul'`), UTC 자정 직후 발급도 KST 다음 날짜 |
| 12 (NEW v0.2.0) | pii_access_log 검증 (REQ-PII-001) | SET LOCAL → decrypt RPC → pii_access_log INSERT 순서 + 동일 트랜잭션, 평문 bizno PDF Buffer + log 외 영속 0 |
| 13 (NEW v0.2.0) | client_direct 상태 머신 unchanged (REQ-FLOW-006) | SPEC-PAYOUT-001 16건 단위 테스트 PASS, client_direct는 그래프 상속 + side-effects만 추가 |
| 14 (NEW v0.2.0) | service-role client 미사용 (REQ-RLS-006) | grep 검색 0건, 모든 Server Action user-scoped session 사용 |

---

## 영향 범위 (Affected Files)

**신규 마이그레이션 (7건, v0.2.0에서 helper 추가):**
- `supabase/migrations/20260429000005_app_current_user_role.sql` (NEW v0.2.0 — RLS helper)
- `supabase/migrations/20260429000010_settlement_flow_client_direct.sql`
- `supabase/migrations/20260429000020_settlements_remittance_columns.sql`
- `supabase/migrations/20260429000030_organization_info.sql`
- `supabase/migrations/20260429000040_payout_receipts_bucket.sql`
- `supabase/migrations/20260429000050_notification_type_receipt_issued.sql`
- `supabase/migrations/20260429000060_receipt_number_counter.sql` (renamed v0.2.0 — `receipt_counters` 테이블 + per-year reset 함수)

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

1. **상태 머신 의미 재해석 (백엔드 enum 미변경)** — `client_direct` 흐름 한정으로 `pending`/`requested`/`paid`/`held`의 UI 라벨만 다르게 표시 ("수취 대기"/"입금 확인 대기"/"영수증 발급 완료"/"보류"). **`client_direct` 흐름은 SPEC-PAYOUT-001 전환 그래프 unchanged 상속**; 본 SPEC은 `requested → paid` 전환 시점에 atomic side-effects만 추가. paid-freeze 인배리언트 그대로 존중.
2. **영수증 번호 동시성 = per-year counter table (v0.2.0 변경)** — `RCP-YYYY-NNNN` 형식 (4-digit zero-pad, 9999/년 지원), `app.receipt_counters(year, counter)` 테이블 + `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atomic upsert로 연도별 자동 reset. `RCP-2026-9999` → `RCP-2027-0001`. 이전 v0.1.0의 단순 SEQUENCE는 1000번째 발급 시 regex 위반 + 연도 reset 불가로 폐기.
3. **DB-atomic + Storage compensating 트랜잭션 패턴 (v0.2.0 정정)** — DB 트랜잭션은 settlements UPDATE + files INSERT + notifications INSERT + pii_access_log INSERT를 모두 단일 단위로 묶고, decrypt_payout_field RPC도 같은 트랜잭션 안에서 호출 (PII GUC + access log atomic 보장). PDF 생성과 Storage 업로드는 트랜잭션 진입 후 commit 직전에 수행되며, 실패 시 best-effort compensating delete가 동작. 잔여 고아는 일일 reconciliation job (REQ-RECEIPT-CLEANUP-001, 후속 SPEC) 위임.
4. **PII GUC + access log invariant (NEW v0.2.0)** — LESSON-004 invariant 준수. decrypt_payout_field 호출 전 `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` (same tx), 직후 pii_access_log 1행 INSERT. 평문 사업자등록번호는 PDF Buffer + pii_access_log 외에 영속되지 않음.
5. **storage_path bucket-relative invariant (NEW v0.2.0)** — `files.storage_path`는 bucket prefix 없는 bucket-relative 키 (storage.objects.name과 1:1 매칭). bucket 식별은 `files.kind`로 암묵 처리. RLS predicate `WHERE storage_path = name`이 직접 매칭. 이전 v0.1.0의 `payout-receipts/...` prefix는 폐기.
6. **`app.current_user_role()` helper 기반 RLS (NEW v0.2.0)** — `auth.jwt()->>'role'` (JWT 커스텀 hook 의존) 제거. 프로젝트 표준 helper `SELECT role FROM users WHERE id = auth.uid()` (SECURITY DEFINER). 모든 RLS predicate가 본 helper 사용.
7. **organization_info source 우선순위** — DB 행(`id=1` enforce CHECK) > env 변수 > `ORGANIZATION_INFO_MISSING` 거부. MVP는 placeholder seed + admin SQL 갱신.
8. **Storage RLS 3-tier** — instructor self-read (owner_id 매칭) / operator/admin all RW / default deny. signed URL 1시간 만료 (server-only 생성).
9. **NotoSansKR 폰트 재사용 (server-side 절대 경로 v0.2.0)** — SPEC-ME-001 M8 산출물 (`public/fonts/`) 그대로. **`Font.register({ src: path.join(process.cwd(), 'public/fonts/...') })` 절대 경로 필수** (bare `/fonts/...`는 browser-only). PDF 크기 < 500KB 예상.
10. **paid-freeze 인배리언트 존중** — SPEC-PAYOUT-001 STATUS_PAID_FROZEN 한국어 에러 그대로 활용. 영수증 발급은 `requested → paid` 단일 트랜잭션으로 atomic. 재발급 차단은 UNIQUE + WHERE 조건 + 사전 검증 + UPDATABLE_COLUMNS exclude 4중 방어.
11. **SPEC-PAYOUT-002 prerequisite (v0.2.0 명시)** — `instructor_remittance_amount_krw` 컬럼은 SPEC-PAYOUT-002의 GENERATE Server Action이 owner. PAYOUT-002가 main에 머지된 후 본 SPEC 시작. acceptance test setup이 prerequisite gate로 차단.

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
