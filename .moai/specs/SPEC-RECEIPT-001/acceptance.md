# SPEC-RECEIPT-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-RECEIPT-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap + SPEC-PAYOUT-001 + **SPEC-PAYOUT-002 baseline 머지 완료** + 본 SPEC M1 마이그레이션 7건 적용):

### Prerequisite gate

**SPEC-PAYOUT-002가 main에 머지되어 있어야 한다.** 미충족 시 본 acceptance 시나리오 실행 차단:

```bash
# pre-test gate
git log --oneline main | grep -E "SPEC-PAYOUT-002" || { echo "ERROR: SPEC-PAYOUT-002 must be merged before SPEC-RECEIPT-001 testing"; exit 1; }
```

PAYOUT-002의 GENERATE Server Action이 적용되어 있어야 `flow='client_direct'` 정산 행 생성 시 `instructor_remittance_amount_krw`가 자동으로 채워진다. 본 acceptance test fixture에서는 명시적으로 fixture 데이터를 SQL로 INSERT하지만, 실제 운영 흐름은 PAYOUT-002 GENERATE를 거친다.

### 사용자

| 사용자 | 이메일 | 비밀번호 | role |
|--------|--------|---------|------|
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` |
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` |
| Instructor A | `instructor.a@algolink.test` | `InstructorAPass!2026` | `instructor` |
| Instructor B (cross-RLS 검증용) | `instructor.b@algolink.test` | `InstructorBPass!2026` | `instructor` |

### organization_info

```sql
INSERT INTO organization_info (id, name, business_number, representative, address, contact)
VALUES (1, '주식회사 알고링크', '123-45-67890', '홍길동', '서울특별시 강남구 테헤란로 123', '02-1234-5678')
ON CONFLICT (id) DO UPDATE SET ...;
```

### 정산 행 (테스트 픽스처)

각 시나리오 시작 시 다음 정산 행이 존재한다고 가정 (admin이 직접 INSERT 또는 seed):

| 별칭 | settlement_flow | status | business_amount_krw | instructor_fee_krw | withholding_tax_rate | instructor_remittance_amount_krw | instructor | created_at |
|------|-----------------|--------|---------------------|--------------------|--------------------:|----------------------------------|------------|------------|
| RC-A | client_direct | pending | 5,000,000 | 3,000,000 | 3.30 | 2,000,000 (= profit) | A | 2026-04-25 |
| RC-B | client_direct | pending | 4,000,000 | 2,500,000 | 8.80 | 1,500,000 | A | 2026-04-26 |
| RC-C | client_direct | requested | 6,000,000 | 4,000,000 | 3.30 | 2,000,000 | B | 2026-04-27 |
| RC-D | client_direct | paid | 3,000,000 | 1,800,000 | 3.30 | 1,200,000 | A | 2026-04-20 |
| RC-E ~ RC-I | client_direct | requested | 1,000,000 | 600,000 | 3.30 | 400,000 | A (병렬 발급용) | 2026-04-28 |
| ST-A (회귀) | corporate | pending | 5,000,000 | 3,000,000 | 0 | NULL | A | 2026-04-29 |

RC-D는 사전에 receipt_file_id, receipt_number(`RCP-2026-0001`, 4-digit zero-pad), receipt_issued_at 모두 채워진 상태로 가정 (paid 동결 검증용).

### `instructor_remittance_amount_krw` 컬럼 owner

위 fixture의 `instructor_remittance_amount_krw` 값은 production 환경에서 SPEC-PAYOUT-002의 GENERATE Server Action이 자동 derive한다 (`= business_amount_krw - instructor_fee_krw = profit_krw`). Test fixture에서는 명시적 SQL INSERT로 설정한다.

### 환경
- 브라우저: Chromium 최신, JavaScript 활성
- 서버: `pnpm dev`
- DB: 로컬 Supabase (마이그레이션 6건 적용 완료)
- 환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `ORG_*` 변수 (organization_info DB가 우선이므로 fallback 검증용에만 사용)
- 시간: 시나리오 실행 시각 ≤ 2026-12-31 (영수증 번호 연도 검증을 위해 2026 가정)
- 폰트: `public/fonts/NotoSansKR-Regular.ttf`, `public/fonts/NotoSansKR-Bold.ttf` 존재 (SPEC-ME-001 M8 산출물)

---

## 시나리오 1 — 강사 송금 등록 (pending → requested)

**대응 EARS:** REQ-RECEIPT-INSTRUCTOR-001~005, REQ-RECEIPT-COLUMNS-001

### Given
- Instructor A가 `/me/payouts`에 로그인되어 있음
- 정산 행 `RC-A` 존재 (status=`pending`, settlement_flow=`client_direct`, instructor_remittance_amount_krw=2,000,000)

### When
1. Instructor A가 사이드바 "정산 조회" 클릭 → `/me/payouts` 도달
2. 리스트에서 `RC-A` 행의 status badge가 "수취 대기"로 표시됨 (한국어 라벨, `client_direct` 흐름)
3. 행 클릭 → `/me/payouts/<RC-A_id>` 상세 페이지 진입
4. 페이지에 "송금 완료 등록" CTA 노출 (status=pending + flow=client_direct)
5. CTA 클릭 → 폼 모달/페이지 진입
6. 송금 일자 = `2026-04-29`, 송금 금액 = `2,000,000`, 첨부 파일 = `payout-evidence.pdf` (1MB) 입력
7. "등록" 버튼 클릭
8. Server Action `registerInstructorRemittance` 호출
9. zod 검증 통과 (금액 일치)
10. `validateTransition('pending', 'requested')` → ok
11. 첨부 파일 Storage 업로드 (bucket=`payout-evidence`, name=`<RC-A_id>/<uuid>.pdf` — bucket-relative, REQ-RECEIPT-COLUMNS-007) + `files` INSERT (kind=`remittance_evidence`, storage_path=`<RC-A_id>/<uuid>.pdf` — NO bucket prefix, owner_id=강사A_user_id)
12. `UPDATE settlements SET status='requested', client_payout_amount_krw = (instructor_fee_krw - withholding_tax_amount_krw) WHERE id=RC-A_id AND status='pending'`
13. 트리거 자동 → `settlement_status_history` 1행 INSERT
14. revalidatePath

### Then
- ✅ DB `settlements.status = 'requested'` (이전: `pending`)
- ✅ DB `settlements.client_payout_amount_krw = 2,901,000` (= 3,000,000 - floor(3,000,000 * 3.30 / 100)) — 정보용
- ✅ DB `settlements.instructor_remittance_amount_krw = 2,000,000` (운영자 사전 설정값 그대로 유지)
- ✅ DB `files`에 1행 INSERT (kind=`remittance_evidence`, storage_path 매칭)
- ✅ DB `settlement_status_history` 1행 INSERT (`pending → requested`)
- ✅ 페이지 새로고침 후 status badge "입금 확인 대기" 표시
- ✅ "송금 완료 등록" CTA 사라지고 등록 정보 read-only 표시 (송금일자, 송금금액, 첨부 다운로드 링크)
- ✅ Storage 객체가 RLS로 본인만 SELECT 가능 검증

---

## 시나리오 2 — 운영자 수취 확인 + 영수증 발급 atomic (requested → paid)

**대응 EARS:** REQ-RECEIPT-OPERATOR-001~007, REQ-RECEIPT-NOTIFY-002~003, REQ-RECEIPT-PDF-001~005, REQ-RECEIPT-PII-001~003, REQ-RECEIPT-COLUMNS-007

### Given
- 시나리오 1 완료 후 또는 RC-C가 status=`requested`로 존재
- Operator가 `/settlements?flow=client_direct&status=requested`에 도달
- organization_info 행 존재 (시연 데이터)
- Instructor B의 `business_number_enc` 컬럼이 암호화된 사업자등록번호 보유 (SPEC-ME-001 M7 패턴)
- `pii_access_log` 테이블 존재 (SPEC-ME-001 LESSON-004 invariant)
- 콘솔 stdout 캡처 활성

### When
1. Operator가 RC-C 행 클릭 → `/settlements/<RC-C_id>` 상세 진입
2. 페이지에 flow indicator 표시: "고객사 → 강사 → 알고링크"
3. RemittanceConfirmationPanel 노출 (flow=client_direct + status=requested)
4. 패널에 등록된 송금 정보 read-only 표시 (송금일자, 송금금액=2,000,000, 첨부)
5. Operator가 입력:
   - 입금 확인 일자 = `2026-04-30`
   - 실제 입금 금액 = `2,000,000` (instructor_remittance_amount_krw와 일치)
   - 메모 = "정상 수취 확인"
6. "수취 확인 + 영수증 발급" 버튼 클릭
7. 확인 다이얼로그: "영수증을 발급하시겠습니까? 발급 후 변경할 수 없습니다."
8. "확인" 클릭
9. Server Action `confirmRemittanceAndIssueReceipt` 호출 (DB-atomic + Storage compensating):
   - **Pre-tx Step 1-3**: validateTransition / amount mismatch / `getOrganizationInfo()` (DB 우선) / `app.next_receipt_number()` RPC → `'RCP-2026-NNNN'` (4-digit) 반환
   - **Step 4 (BEGIN tx)**: `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'`
   - **Step 5 (in-tx)**: SELECT instructor + `decrypt_payout_field(business_number_enc)` RPC → 평문 사업자등록번호 + INSERT `pii_access_log` 1행 (target='instructors.business_number_enc', purpose='receipt_pdf_generation')
   - **Step 6 (in-tx, in-memory)**: `renderReceiptPdf({ settlement, instructor (with decrypted bizno), organization })` → Buffer 반환
   - **Step 7 (Storage upload)**: `payout-receipts` bucket에 name = `<RC-C_id>/RCP-2026-NNNN.pdf` (bucket-relative, REQ-RECEIPT-COLUMNS-007)
   - **Step 8 (in-tx)**: 
     - INSERT `files` (kind='payout_receipt', storage_path='<RC-C_id>/RCP-2026-NNNN.pdf' — bucket-relative, owner_id=강사B_user_id, mime_type='application/pdf')
     - UPDATE `settlements` SET status='paid', instructor_remittance_received_at='2026-04-30', receipt_file_id=$file_id, receipt_number='RCP-2026-NNNN', receipt_issued_at=now(), notes 추가, updated_at=now() WHERE id=RC-C_id AND status='requested' AND settlement_flow='client_direct'
     - INSERT `notifications` (recipient_id=강사B_user_id, type='receipt_issued', title='영수증 발급 완료', body='RCP-2026-NNNN (2,000,000 원)', link_url='/me/payouts/<RC-C_id>')
     - COMMIT
   - **Step 9 (post-commit)**: `console.log("[notif] receipt_issued → instructor_id=<강사B_uuid> settlement_id=<RC-C_id> receipt_number=RCP-2026-NNNN")`
   - revalidatePath

### Then
- ✅ DB `settlements.status = 'paid'` (이전: `requested`)
- ✅ DB `settlements.instructor_remittance_received_at = '2026-04-30T...+09:00'`
- ✅ DB `settlements.receipt_file_id` not null
- ✅ DB `settlements.receipt_number = 'RCP-2026-NNNN'` (UNIQUE, 4-digit format)
- ✅ DB `settlements.receipt_issued_at` ≈ now() (±2초)
- ✅ DB `files`에 신규 행: kind=`payout_receipt`, storage_path=`<RC-C_id>/RCP-2026-NNNN.pdf` **(bucket-relative, NO 'payout-receipts/' prefix)**, owner_id=강사B_user_id
- ✅ DB `pii_access_log`에 신규 행 정확히 1개: actor_user_id=operator.id, target_table='instructors', target_column='business_number_enc', target_id=instructorB.id, purpose='receipt_pdf_generation', accessed_at ≈ now()
- ✅ Storage 객체 존재: bucket=`payout-receipts`, name=`<RC-C_id>/RCP-2026-NNNN.pdf`, mime_type=application/pdf, size > 0
- ✅ DB `notifications`에 신규 행: type=`receipt_issued`, recipient_id=강사B_user_id, body 매칭 (`RCP-2026-NNNN (2,000,000 원)`), link_url 매칭, read_at IS NULL
- ✅ DB `settlement_status_history` 1행 INSERT (`requested → paid`)
- ✅ 콘솔 stdout에 정확히 한 줄: `[notif] receipt_issued → instructor_id=<UUID> settlement_id=<UUID> receipt_number=RCP-2026-NNNN`
  - 정규식 매칭: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{4}$`
- ✅ 페이지 새로고침 후 status badge "영수증 발급 완료" + 영수증 정보 + 다운로드 링크 노출
- ✅ 모든 상태 전환 버튼 disabled (paid 동결)
- ✅ 복호화된 사업자등록번호는 PDF Buffer + pii_access_log 외에 어디에도 영속되지 않음 (콘솔 로그, 응답 객체에 평문 노출 없음 검증)

---

## 시나리오 3 — 영수증 PDF 한국어 렌더 검증

**대응 EARS:** REQ-RECEIPT-PDF-001~006

### Given
- 시나리오 2 완료 후 RC-C에 receipt_file_id 존재
- Storage bucket `payout-receipts`의 `<RC-C_id>/RCP-2026-NNNN.pdf` 객체 존재 (bucket-relative path)
- organization_info 행 존재 ('주식회사 알고링크', '123-45-67890', '홍길동', ...)
- `public/fonts/NotoSansKR-{Regular,Bold}.ttf` 파일 존재
- Server-side render 환경 (Node.js process)

### When
1. Operator가 RC-C 상세 페이지에서 영수증 다운로드 링크 클릭
2. 서버에서 signed URL 생성 (1시간 만료)
3. 브라우저가 PDF를 새 탭에 표시 또는 다운로드
4. 자동화 테스트: PDF Buffer를 pdf-parse로 텍스트 추출

### Then
PDF 추출 텍스트에 다음이 모두 포함:
- ✅ "영수증" (한국어, NotoSansKR Bold)
- ✅ 영수증 번호 `RCP-2026-NNNN` (4-digit zero-pad)
- ✅ 발행일 (KST 형식, 예: `2026-04-30`)
- ✅ 강사명 (Instructor B 이름)
- ✅ "주식회사 알고링크"
- ✅ 사업자등록번호 `123-45-67890` (organization_info의 알고링크 사업자번호)
- ✅ 대표자명 `홍길동`
- ✅ 주소 `서울특별시 강남구 테헤란로 123`
- ✅ 거래 금액 `2,000,000 원` (KRW 포맷)
- ✅ 송금일 `2026-04-30`
- ✅ "강의 사업비 정산" (사유)
- ✅ "위 금액을 정히 영수합니다."
- ✅ "Algolink AI Agentic Platform" (Footer)
- ✅ PDF 페이지 수 = 1 (A4 portrait)
- ✅ 한자/한글 깨짐 없음 (NotoSansKR 폰트 정상 임베드)
- ✅ PDF 크기 < 500KB
- ✅ **Server-side render 검증**: `Font.register({ src: ... })` 호출 시 `path.join(process.cwd(), 'public/fonts/...')` 절대 경로 사용 (test-mock 또는 source grep으로 확인). bare `/fonts/...` path 사용 시 한국어 깨짐

---

## 시나리오 4 — 영수증 번호 동시성 (병렬 5건 unique)

**대응 EARS:** REQ-RECEIPT-OPERATOR-003 (Step 3, nextval), REQ-RECEIPT-COLUMNS-002 (UNIQUE)

### Given
- RC-E, RC-F, RC-G, RC-H, RC-I (5개 정산 행, 모두 status=`requested`, flow=`client_direct`, instructor=A) 존재
- organization_info 설정 완료
- 5개의 별도 Operator 세션 (또는 Promise.all 병렬 호출)

### When
1. 5개 Server Action을 동시에 호출:
   ```ts
   await Promise.all([
     confirmRemittanceAndIssueReceipt({ settlementId: RC-E_id, ... }),
     confirmRemittanceAndIssueReceipt({ settlementId: RC-F_id, ... }),
     confirmRemittanceAndIssueReceipt({ settlementId: RC-G_id, ... }),
     confirmRemittanceAndIssueReceipt({ settlementId: RC-H_id, ... }),
     confirmRemittanceAndIssueReceipt({ settlementId: RC-I_id, ... }),
   ]);
   ```
2. 각 호출이 `app.next_receipt_number()` RPC로 시퀀스값 획득
3. PDF 렌더 + Storage 업로드 + DB 트랜잭션 모두 atomic

### Then
- ✅ 5개 settlements 모두 status=`paid`
- ✅ 5개 settlements 모두 receipt_number 채워짐
- ✅ 5개 receipt_number가 모두 unique (Set 크기 = 5)
- ✅ 모든 receipt_number는 `RCP-2026-NNNN` 형식 (4-digit zero-pad, regex `^RCP-\d{4}-\d{4}$`)
- ✅ 카운터 충돌 없음 (`receipt_counters` 행 락 + `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atomic)
- ✅ 5개 Storage 객체 모두 존재 (bucket=`payout-receipts`, name=`<settlement_id>/<receipt_number>.pdf`, bucket-relative)
- ✅ 5개 notifications 행 INSERT
- ✅ 5개 pii_access_log 행 INSERT (각 instructor_id 매칭)
- ✅ 콘솔 stdout에 정확히 5줄 출력
- ✅ UNIQUE 인덱스 위반 없음

### When (4-B: 연도 reset 검증)

`receipt_counters`를 `(2026, 50)` 상태에서 강제로 `(2026, 9999)`로 UPDATE한 뒤 `app.next_receipt_number()` 호출 → `RCP-2026-10000` 반환 (4자리 자릿수 초과 시 5자리로 확장됨; 본 SPEC에서는 9999/년 가정이므로 5자리 발생을 risk로 acknowledge하고 후속 SPEC에서 5-digit 확장 결정).

가상 연도 변경 시뮬레이션 (시간 모킹 가능 환경): 시스템 시각을 `2027-01-01 00:00:00 KST`로 설정한 뒤 `app.next_receipt_number()` 첫 호출 → `RCP-2027-0001`.

### Then (4-B)
- ✅ 신규 연도 첫 호출 시 카운터 자동 reset (`INSERT ... ON CONFLICT DO UPDATE`로 새 연도 행 생성)
- ✅ 기존 연도 카운터는 보존됨 (`receipt_counters` 테이블에 (2026, N) (2027, 1) 두 행 존재)
- ✅ format `^RCP-\d{4}-\d{4}$` 매칭

---

## 시나리오 5 — 송금 금액 mismatch 거부 (강사 + 운영자)

**대응 EARS:** REQ-RECEIPT-INSTRUCTOR-003, REQ-RECEIPT-OPERATOR-003 (Step 2)

### Given (5-A: 강사 측)
- RC-A 정산 행 존재 (status=`pending`, instructor_remittance_amount_krw=`2,000,000`)
- Instructor A 로그인

### When (5-A)
1. Instructor A가 RC-A 송금 등록 폼에서 송금 금액 = `1,500,000` 입력 (실제 expected는 2,000,000)
2. 폼 제출 시도

### Then (5-A)
- ✅ zod refinement가 즉시 거부
- ✅ 한국어 에러 폼에 표시: `"송금 금액이 정산 정보와 일치하지 않습니다."` (REMITTANCE_AMOUNT_MISMATCH)
- ✅ Server Action 미호출
- ✅ DB `settlements.status` 변경 없음 (여전히 pending)
- ✅ DB `files` 신규 행 없음

### Given (5-B: 운영자 측)
- RC-C 정산 행 존재 (status=`requested`, instructor_remittance_amount_krw=`2,000,000`)
- Operator 로그인

### When (5-B)
1. Operator가 RC-C confirm-remittance 폼에서 실제 입금 금액 = `1,999,000` 입력
2. dev tool로 Server Action 강제 호출 (zod 우회)

### Then (5-B)
- ✅ Server Action 내부 검증 (Step 2)에서 `2,000,000 !== 1,999,000` → REMITTANCE_AMOUNT_MISMATCH 반환
- ✅ DB 트랜잭션 시작 전 거부 → status, receipt_*, files, notifications 모두 변경 없음
- ✅ 콘솔 로그 출력 없음
- ✅ Storage 업로드 없음 (Server Action이 amount check 후 PDF 생성으로 진행했어야 하므로 그 이전에 거부)
- ✅ 사용자에게 한국어 에러 표시: `"송금 금액이 정산 정보와 일치하지 않습니다."`

---

## 시나리오 6 — RLS: 강사 본인 외 영수증 접근 차단

**대응 EARS:** REQ-RECEIPT-RLS-002~005

### Given
- 시나리오 2 완료 후 RC-C에 영수증 존재 (receipt_file_id, files.storage_path = `<RC-C_id>/RCP-2026-NNNN.pdf` — **bucket-relative, NO 'payout-receipts/' prefix**, REQ-RECEIPT-COLUMNS-007), owner_id = 강사B_user_id
- storage.objects.name = `<RC-C_id>/RCP-2026-NNNN.pdf` (1:1 매칭)
- Instructor A 로그인 (강사 B의 정산이 아님)
- Storage signed URL은 server-side에서만 생성됨 (client에 path 노출 없음)

### When (6-A: 다른 강사 영수증 path 직접 접근 시도)
1. Instructor A가 dev tool에서 `<RC-C_id>/RCP-2026-NNNN.pdf` path로 직접 fetch 시도 (bucket-relative key)
2. 또는 `supabase.storage.from('payout-receipts').download(path)` 클라이언트 측 호출

### Then (6-A)
- ✅ Storage RLS 정책 `payout_receipts_self_select`가 owner_id 매칭 실패 → 401 또는 403
- ✅ 응답 본문 또는 에러: "Object not found" 또는 "Permission denied"
- ✅ Instructor A는 PDF 내용 획득 불가

### When (6-B: 강사 A가 자신의 정산 RC-A의 영수증 다운로드)
- 사전: RC-A를 paid 상태로 만들고 영수증 발급 (시나리오 2의 강사 A 버전)
1. Instructor A가 `/me/payouts/<RC-A_id>` 진입 → 영수증 다운로드 링크 클릭
2. 서버에서 signed URL 생성 (1시간 만료)
3. Instructor A가 PDF 다운로드

### Then (6-B)
- ✅ 다운로드 성공
- ✅ PDF 내용 정상 (강사 A 이름, RC-A 거래 정보)

### When (6-C: 운영자가 모든 영수증 접근)
1. Operator가 `/settlements/<RC-C_id>` 진입 → 영수증 다운로드 클릭

### Then (6-C)
- ✅ Storage RLS 정책 `payout_receipts_operator_all` 매칭 → 다운로드 성공
- ✅ 어떤 강사의 영수증이든 접근 가능

---

## 시나리오 7 — paid 동결 + 재발급 거부

**대응 EARS:** REQ-RECEIPT-COLUMNS-005, REQ-RECEIPT-OPERATOR-005, SPEC-PAYOUT-001 STATUS_PAID_FROZEN

### Given
- RC-D 정산 행 존재 (status=`paid`, receipt_file_id 채워짐, receipt_number=`RCP-2026-0001`, receipt_issued_at 설정됨)
- Operator 로그인

### When (7-A: 정상 UI에서 재발급 시도)
1. Operator가 `/settlements/<RC-D_id>` 진입
2. 화면 렌더링: paid 동결 안내 배너 + 모든 상태 전환 버튼 disabled
3. RemittanceConfirmationPanel 미노출 (status=paid)

### Then (7-A)
- ✅ "수취 확인 + 영수증 발급" 패널 DOM 없음
- ✅ 영수증 정보 + 다운로드 링크 표시 (RCP-2026-0001)
- ✅ 키보드 Tab 시 disabled 버튼은 focus 가능하지만 활성화 안 됨

### When (7-B: dev tool로 confirm Server Action 강제 호출)
1. Operator가 dev tool에서 `confirmRemittanceAndIssueReceipt({ settlementId: RC-D_id, receivedDate: '2026-05-01', receivedAmountKrw: 1,200,000 })` 호출

### Then (7-B)
- ✅ Server Action 내부에서 status='paid' 감지 → STATUS_INVALID_TRANSITION 또는 RECEIPT_ALREADY_ISSUED 반환
  - 정확한 거부 경로: 사전 검증에서 status !== 'requested' 또는 settlement_flow !== 'client_direct' 또는 receipt_number IS NOT NULL → 한국어 에러
- ✅ DB 변경 없음:
  - `settlements.receipt_number` 여전히 `RCP-2026-0001` (변경되지 않음)
  - `settlements.receipt_file_id` 변경 없음
  - `settlement_status_history` 신규 행 없음
- ✅ Storage 신규 객체 없음 (PDF 재생성 안 됨)
- ✅ notifications 신규 행 없음
- ✅ pii_access_log 신규 행 없음
- ✅ 콘솔 로그 출력 없음

### When (7-D: 일반 settlement UPDATE Server Action으로 receipt_number 변경 시도, REQ-RECEIPT-COLUMNS-008)
1. 운영자가 `(operator)/settlements/[id]/page.tsx`의 일반 메모/노트 수정 Server Action으로 `receipt_number = 'HACK-2026-9999'` 갱신을 강제 시도
2. 또는 Drizzle UPDATE에서 `receipt_number` 필드를 set object에 포함시켜 호출

### Then (7-D)
- ✅ UPDATABLE_COLUMNS 화이트리스트가 receipt_number를 제외하므로 type-level error 또는 runtime no-op
- ✅ DB `settlements.receipt_number` 변경되지 않음 (RC-D는 여전히 `RCP-2026-0001`)
- ✅ RECEIPT-COLUMNS-008의 grep verification: `grep -r "receipt_number" src/lib/payouts/queries.ts | grep -i "updatable"` 명시적 exclude 확인

### When (7-C: 동시성 race — 두 운영자가 동시에 확인 시도)
- RC-C status=`requested`인 상태에서 Operator 1과 Operator 2가 동시에 confirm-remittance 호출
- Operator 1이 먼저 트랜잭션 commit → status=`paid`
- Operator 2가 늦게 트랜잭션 진입

### Then (7-C)
- ✅ Operator 2의 UPDATE WHERE `status='requested'` → matched 0 rows
- ✅ Server Action이 STALE_TRANSITION 또는 RECEIPT_ALREADY_ISSUED 반환
- ✅ Operator 2의 트랜잭션 롤백 (Storage 업로드된 PDF는 best-effort delete)
- ✅ 최종 DB 상태: receipt_number는 Operator 1이 발급한 값으로 정확히 1개

---

## 시나리오 8 — 알림 + 콘솔 로그 SPEC-NOTIFY-001 hook 식별자

**대응 EARS:** REQ-RECEIPT-NOTIFY-001~005

### Given
- 시나리오 2의 atomic 트랜잭션 완료 직후
- 콘솔 stdout 캡처 활성 (vi.spyOn 또는 stdout buffer)

### When
- 시나리오 2 또는 시나리오 4 시나리오 실행

### Then
- ✅ DB `notifications` 신규 행 정확히:
  - `recipient_id` = 강사 user_id (정산.instructor_id의 owner)
  - `type` = `'receipt_issued'`
  - `title` = `'영수증 발급 완료'`
  - `body` = 정규식 매칭 `^RCP-\d{4}-\d{4} \(\d{1,3}(,\d{3})* 원\)$` (예: `'RCP-2026-0002 (2,000,000 원)'`)
  - `link_url` = `'/me/payouts/<settlement_id>'`
  - `read_at` IS NULL
- ✅ 콘솔 stdout에 정확히 한 줄:
  - 형식: `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=RCP-2026-NNNN`
  - 정규식: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{4}$`
  - 본 SPEC은 SPEC-NOTIFY-001 후속 어댑터의 hook 식별자
- ✅ **실제 이메일/SMS 발송 없음 (REQ-RECEIPT-NOTIFY-005)**: 시나리오 실행 중 outbound HTTP 요청 모니터링 (vi.spyOn(global.fetch) 또는 nock) — `*.resend.com`, `*.amazonaws.com/ses/`, `*.kakao.com/v1/api/talk/memo/...`, `*.twilio.com` 등 이메일/SMS provider URL로 요청 0건. 콘솔 로그 1줄과 notifications INSERT 1행 외 어떤 외부 통신도 발생하지 않음.
- ✅ 알림 INSERT 실패 시 (mock RLS 거부) 전체 트랜잭션 롤백 + Storage compensating delete + 콘솔 로그 미출력 + status=`requested` 그대로 + pii_access_log 롤백

---

## 시나리오 9 — organization_info source 우선순위 + 미설정 거부

**대응 EARS:** REQ-RECEIPT-PDF-003

### Given (9-A: DB 행 존재)
- organization_info 행 존재
- env 변수도 설정됨 (다른 값)
- RC-C 정산 행 존재 (status=requested)

### When (9-A)
- Operator가 confirm-remittance 호출

### Then (9-A)
- ✅ PDF에 DB 행 데이터 사용 (env 변수 무시)
- ✅ 영수증 발급 성공

### Given (9-B: DB 행 없음 + env 모두 설정)
- `DELETE FROM organization_info WHERE id = 1;` 실행
- env 변수: ORG_NAME, ORG_BIZ_NUMBER, ORG_REPRESENTATIVE, ORG_ADDRESS, ORG_CONTACT 모두 설정

### When (9-B)
- Operator가 confirm-remittance 호출

### Then (9-B)
- ✅ PDF에 env 변수 데이터 사용
- ✅ 영수증 발급 성공

### Given (9-C: DB + env 모두 미설정)
- `DELETE FROM organization_info WHERE id = 1;` 실행
- env 변수 모두 unset

### When (9-C)
- Operator가 confirm-remittance 호출

### Then (9-C)
- ✅ `getOrganizationInfo()` throw `ORGANIZATION_INFO_MISSING`
- ✅ Server Action이 한국어 에러 반환: `"알고링크 사업자 정보가 설정되지 않았습니다. 관리자에게 문의하세요."`
- ✅ DB 변경 없음, Storage 업로드 없음, status=`requested` 유지

---

## 시나리오 10 — 회귀 검증: SPEC-PAYOUT-001 corporate/government 흐름 정상

**대응 EARS:** REQ-RECEIPT-FLOW-006

### Given
- 본 SPEC M1 마이그레이션 적용 완료 (settlement_flow에 client_direct 추가)
- 기존 ST-A (corporate, pending), ST-B (government, pending) 정산 행 존재

### When
1. Operator가 ST-A에 대해 SPEC-PAYOUT-001의 1-클릭 정산 요청 흐름 실행
2. Operator가 ST-B에 대해 SPEC-PAYOUT-001 흐름 실행
3. SPEC-PAYOUT-001의 16개 상태 전환 단위 테스트 재실행

### Then
- ✅ ST-A: status `pending → requested` 정상 (corporate 흐름)
- ✅ ST-B: status `pending → requested` 정상 (government 흐름)
- ✅ SPEC-PAYOUT-001 단위 테스트 16개 PASS
- ✅ CHECK 제약 corporate=0, government IN (3.30, 8.80) 정상 강제
- ✅ client_direct 흐름 추가가 기존 흐름에 회귀 없음

---

---

## 시나리오 11 — KST timezone 일관성 (REQ-RECEIPT-PDF-005)

**대응 EARS:** REQ-RECEIPT-PDF-005

### Given
- 시나리오 2 완료 (RC-C 영수증 발급)
- 시스템 timezone이 UTC가 아닌 환경에서도 동일하게 동작해야 함

### When
1. PDF Buffer에서 발행일 텍스트 추출
2. PDF의 거래일(송금일) 텍스트 추출
3. 알림 body의 timestamp 추출

### Then
- ✅ 발행일 표시 형식: `YYYY-MM-DD` (KST 컨텍스트 — `2026-04-30`)
- ✅ 거래일 표시 형식: `YYYY-MM-DD` (KST)
- ✅ DB의 `receipt_issued_at`은 timestamptz로 저장되지만 PDF 출력은 항상 KST로 변환 (`formatKstDate(value)` 사용)
- ✅ `at TIME ZONE 'Asia/Seoul'` 변환이 PDF 렌더링에서 일관 적용
- ✅ UTC 자정 직후 발급된 영수증도 KST 기준 다음 날짜로 표시 (예: UTC `2026-04-30T15:30:00Z` → KST `2026-05-01`)
- ✅ 알림 본문의 timestamp는 한국어 문자열 (`2026-05-01 00:30 KST`)

---

## 시나리오 12 — pii_access_log 검증 (REQ-RECEIPT-PII-001)

**대응 EARS:** REQ-RECEIPT-PII-001~003

### Given
- Instructor B의 `business_number_enc` 컬럼 존재 (암호화된 사업자등록번호)
- `pii_access_log` 테이블에 기존 행 0개

### When
- 시나리오 2 실행 (RC-C 영수증 발급)

### Then
- ✅ DB `pii_access_log` 신규 행 정확히 1개:
  - `actor_user_id` = operator의 user_id (auth.uid())
  - `target_table` = `'instructors'`
  - `target_column` = `'business_number_enc'`
  - `target_id` = Instructor B의 instructors.id
  - `purpose` = `'receipt_pdf_generation'`
  - `accessed_at` ≈ now() (±2초)
- ✅ Server Action 트랜잭션 SQL trace에 `SET LOCAL app.pii_purpose = 'receipt_pdf_generation'` 호출 확인
- ✅ decrypt_payout_field RPC 호출 timestamp가 SET LOCAL 호출보다 늦음
- ✅ pii_access_log INSERT가 decrypt RPC 호출보다 늦음
- ✅ 모든 호출이 동일 트랜잭션 내 (트랜잭션 ID 동일)
- ✅ 평문 사업자등록번호는 PDF Buffer + pii_access_log 외부 (콘솔 로그, 응답 객체, 다른 DB 컬럼)에 영속되지 않음

### When (12-B: decrypt 실패 시 롤백)
- mock으로 decrypt_payout_field가 에러 반환

### Then (12-B)
- ✅ 트랜잭션 롤백 → settlements.status 변경 없음, pii_access_log 신규 행 없음
- ✅ Storage compensating delete 실행 (PDF 업로드된 경우)
- ✅ `RECEIPT_GENERATION_FAILED` 한국어 에러 반환

---

## 시나리오 13 — client_direct 흐름 상태 머신 불변 검증 (REQ-RECEIPT-FLOW-006)

**대응 EARS:** REQ-RECEIPT-FLOW-006, SPEC-PAYOUT-001 §2.3 paid-freeze invariant

### Given
- SPEC-PAYOUT-001의 16개 상태 전환 단위 테스트가 main 브랜치에 존재
- 본 SPEC M1 마이그레이션 적용 후

### When
1. SPEC-PAYOUT-001의 단위 테스트 16건 (`validateTransition` 매트릭스) 그대로 재실행
2. `client_direct` 흐름의 상태 전환을 추가로 검증:
   - `pending → requested` (강사 송금 등록) ✓
   - `requested → paid` (영수증 발급) ✓
   - `pending → held`, `requested → held`, `paid → held` 차단 ✓
   - `paid → *` 모두 차단 (paid-freeze) ✓
   - `held → pending`, `held → requested` 복구 허용 ✓

### Then
- ✅ SPEC-PAYOUT-001 16건 단위 테스트 PASS
- ✅ `client_direct` 흐름은 SPEC-PAYOUT-001 전환 그래프(`pending → requested → paid` + `held` 분기)를 unchanged 상속
- ✅ 본 SPEC은 `requested → paid` 전환 시점에 atomic side-effects(영수증 발급, 알림)만 추가; 그래프 자체는 변경 없음
- ✅ `validateTransition`의 허용 매트릭스 테이블 변경 없음

---

## 시나리오 14 — Service-role client 미사용 검증 (REQ-RECEIPT-RLS-006)

**대응 EARS:** REQ-RECEIPT-RLS-006

### Given
- 본 SPEC 구현 완료 후 코드베이스
- `SUPABASE_SERVICE_ROLE_KEY` 환경변수가 운영 환경에 존재하지만 본 SPEC의 Server Actions는 사용하지 않아야 함

### When
- 빌드 / 검수 단계에서 코드 검색 실행

### Then
- ✅ `grep -r "createServiceRoleClient" src/app/(app)/(operator)/settlements/ src/app/(app)/(instructor)/me/payouts/ src/lib/payouts/` → 0건
- ✅ `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/app/(app)/(operator)/settlements/ src/app/(app)/(instructor)/me/payouts/ src/lib/payouts/` → 0건
- ✅ 모든 Server Action이 `createServerClient()` (user-scoped session) 또는 `createBrowserClient()`만 사용
- ✅ Storage 업로드, DB 트랜잭션, RPC 호출 모두 사용자 컨텍스트의 RLS를 통과
- ✅ RLS가 인증 권한의 단일 출처

---

## 검수 체크리스트 종합 (Definition of Done)

본 SPEC이 `status: completed`로 전환되기 위한 종합 체크:

- [ ] **Prerequisite gate**: SPEC-PAYOUT-002가 main에 머지 완료 + `instructor_remittance_amount_krw` 자동 채움 검증
- [ ] 시나리오 1-14 모두 PASS
- [ ] 단위 테스트 라인 커버리지 ≥ 85% (receipt 모듈)
- [ ] `pnpm build` / `pnpm typecheck` / `pnpm lint` 모두 0 에러
- [ ] axe DevTools `/me/payouts/[id]/remit`, `/settlements/[id]` (client_direct) critical 0건
- [ ] 영수증 PDF 시각 검수 (사용자 확인)
- [ ] 마이그레이션 7건 모두 정상 적용 (`npx supabase db reset`)
- [ ] 콘솔 로그 정규식 매칭 검증 (`^RCP-\d{4}-\d{4}$` 4-digit 형식)
- [ ] SPEC-PAYOUT-001 회귀 0건 (16개 상태 전환 단위 테스트 PASS)
- [ ] 영수증 번호 동시성 검증 (병렬 5건 unique)
- [ ] 영수증 번호 연도 reset 검증 (`RCP-2026-9999` → `RCP-2027-0001`)
- [ ] RLS 검증 (cross-instructor 접근 차단)
- [ ] **PII GUC + pii_access_log 검증** (LESSON-004 invariant 매 발급마다 1행 INSERT)
- [ ] **storage_path bucket-relative 검증** (REQ-RECEIPT-COLUMNS-007, RLS predicate 매칭)
- [ ] **`app.current_user_role()` helper 사용 검증** (RLS predicate에서 `auth.jwt()->>'role'` 의존 0건)
- [ ] **service-role client 미사용 검증** (grep 0건)
- [ ] paid-freeze 인배리언트 통과
- [ ] organization_info 우선순위 검증 (DB > env > 거부)
- [ ] 한국어 에러 메시지 6종 모두 적용
- [ ] 일반 settlement UPDATE Server Action으로 receipt_number 변경 차단 (REQ-RECEIPT-COLUMNS-008)
- [ ] 이메일/SMS 외부 API 호출 0건 (REQ-RECEIPT-NOTIFY-005)
- [ ] @MX 태그 추가 (plan.md §6 표 참조)

---

_End of SPEC-RECEIPT-001 acceptance.md_
