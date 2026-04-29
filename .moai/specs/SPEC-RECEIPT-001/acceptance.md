# SPEC-RECEIPT-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-RECEIPT-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap + SPEC-PAYOUT-001 + 본 SPEC M1 마이그레이션 적용):

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

RC-D는 사전에 receipt_file_id, receipt_number(`RCP-2026-001`), receipt_issued_at 모두 채워진 상태로 가정 (paid 동결 검증용).

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
11. 첨부 파일 Storage 업로드 (`payout-evidence/<RC-A_id>/<uuid>.pdf`) + `files` INSERT (kind=`remittance_evidence`, owner_id=강사A_user_id)
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

**대응 EARS:** REQ-RECEIPT-OPERATOR-001~007, REQ-RECEIPT-NOTIFY-002~003, REQ-RECEIPT-PDF-001~005

### Given
- 시나리오 1 완료 후 또는 RC-C가 status=`requested`로 존재
- Operator가 `/settlements?flow=client_direct&status=requested`에 도달
- organization_info 행 존재 (시연 데이터)
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
9. Server Action `confirmRemittanceAndIssueReceipt` 호출:
   - **Step 1**: validateTransition('requested', 'paid') → ok
   - **Step 2**: amount mismatch check: 2,000,000 === 2,000,000 → ok
   - **Step 3**: `getOrganizationInfo()` → DB 행 반환 ('주식회사 알고링크', ...)
   - **Step 4**: `nextReceiptNumber()` RPC → `'RCP-2026-NNN'` 반환 (시퀀스값에 따라)
   - **Step 5**: `renderReceiptPdf({ settlement, instructor, organization })` → Buffer 반환
   - **Step 6**: Storage 업로드 `payout-receipts/<RC-C_id>/RCP-2026-NNN.pdf`
   - **Step 7**: DB 트랜잭션:
     - INSERT `files` (kind='receipt', storage_path, owner_id=강사B_user_id, mime_type='application/pdf')
     - UPDATE `settlements` SET status='paid', instructor_remittance_received_at='2026-04-30', receipt_file_id=$file_id, receipt_number='RCP-2026-NNN', receipt_issued_at=now(), notes 추가, updated_at=now() WHERE id=RC-C_id AND status='requested'
     - INSERT `notifications` (recipient_id=강사B_user_id, type='receipt_issued', title='영수증 발급 완료', body='RCP-2026-NNN (2,000,000 원)', link_url='/me/payouts/<RC-C_id>')
   - **Step 8**: COMMIT
   - **Step 9 (post-commit)**: `console.log("[notif] receipt_issued → instructor_id=<강사B_uuid> settlement_id=<RC-C_id> receipt_number=RCP-2026-NNN")`
   - revalidatePath

### Then
- ✅ DB `settlements.status = 'paid'` (이전: `requested`)
- ✅ DB `settlements.instructor_remittance_received_at = '2026-04-30T...+09:00'`
- ✅ DB `settlements.receipt_file_id` not null
- ✅ DB `settlements.receipt_number = 'RCP-2026-NNN'` (UNIQUE)
- ✅ DB `settlements.receipt_issued_at` ≈ now() (±2초)
- ✅ DB `files`에 신규 행: kind=`receipt`, storage_path=`payout-receipts/<RC-C_id>/RCP-2026-NNN.pdf`, owner_id=강사B_user_id
- ✅ Storage 객체 존재 (mime_type=application/pdf, size > 0)
- ✅ DB `notifications`에 신규 행: type=`receipt_issued`, recipient_id=강사B_user_id, body 매칭, link_url 매칭, read_at IS NULL
- ✅ DB `settlement_status_history` 1행 INSERT (`requested → paid`)
- ✅ 콘솔 stdout에 정확히 한 줄: `[notif] receipt_issued → instructor_id=<UUID> settlement_id=<UUID> receipt_number=RCP-2026-NNN`
  - 정규식 매칭: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{3}$`
- ✅ 페이지 새로고침 후 status badge "영수증 발급 완료" + 영수증 정보 + 다운로드 링크 노출
- ✅ 모든 상태 전환 버튼 disabled (paid 동결)

---

## 시나리오 3 — 영수증 PDF 한국어 렌더 검증

**대응 EARS:** REQ-RECEIPT-PDF-001~006

### Given
- 시나리오 2 완료 후 RC-C에 receipt_file_id 존재
- Storage에 `payout-receipts/<RC-C_id>/RCP-2026-NNN.pdf` 업로드됨
- organization_info 행 존재 ('주식회사 알고링크', '123-45-67890', '홍길동', ...)

### When
1. Operator가 RC-C 상세 페이지에서 영수증 다운로드 링크 클릭
2. 서버에서 signed URL 생성 (1시간 만료)
3. 브라우저가 PDF를 새 탭에 표시 또는 다운로드
4. 자동화 테스트: PDF Buffer를 pdf-parse로 텍스트 추출

### Then
PDF 추출 텍스트에 다음이 모두 포함:
- ✅ "영수증" (한국어, NotoSansKR Bold)
- ✅ 영수증 번호 `RCP-2026-NNN`
- ✅ 발행일 (KST 형식, 예: `2026-04-30`)
- ✅ 강사명 (Instructor B 이름)
- ✅ "주식회사 알고링크"
- ✅ 사업자등록번호 `123-45-67890`
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
- ✅ 모든 receipt_number는 `RCP-2026-NNN` 형식
- ✅ 시퀀스 충돌 없음 (PostgreSQL SEQUENCE atomic)
- ✅ 5개 Storage 객체 모두 존재
- ✅ 5개 notifications 행 INSERT
- ✅ 콘솔 stdout에 정확히 5줄 출력
- ✅ UNIQUE 인덱스 위반 없음

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
- 시나리오 2 완료 후 RC-C에 영수증 존재 (receipt_file_id, storage_path = `payout-receipts/<RC-C_id>/RCP-2026-NNN.pdf`, owner_id = 강사B_user_id)
- Instructor A 로그인 (강사 B의 정산이 아님)
- Storage signed URL은 server-side에서만 생성됨 (client에 path 노출 없음)

### When (6-A: 다른 강사 영수증 path 직접 접근 시도)
1. Instructor A가 dev tool에서 `payout-receipts/<RC-C_id>/RCP-2026-NNN.pdf` path로 직접 fetch 시도
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
- RC-D 정산 행 존재 (status=`paid`, receipt_file_id 채워짐, receipt_number=`RCP-2026-001`, receipt_issued_at 설정됨)
- Operator 로그인

### When (7-A: 정상 UI에서 재발급 시도)
1. Operator가 `/settlements/<RC-D_id>` 진입
2. 화면 렌더링: paid 동결 안내 배너 + 모든 상태 전환 버튼 disabled
3. RemittanceConfirmationPanel 미노출 (status=paid)

### Then (7-A)
- ✅ "수취 확인 + 영수증 발급" 패널 DOM 없음
- ✅ 영수증 정보 + 다운로드 링크 표시 (RCP-2026-001)
- ✅ 키보드 Tab 시 disabled 버튼은 focus 가능하지만 활성화 안 됨

### When (7-B: dev tool로 confirm Server Action 강제 호출)
1. Operator가 dev tool에서 `confirmRemittanceAndIssueReceipt({ settlementId: RC-D_id, receivedDate: '2026-05-01', receivedAmountKrw: 1,200,000 })` 호출

### Then (7-B)
- ✅ Server Action 내부에서 status='paid' 감지 → STATUS_INVALID_TRANSITION 또는 RECEIPT_ALREADY_ISSUED 반환
  - 정확한 거부 경로: 사전 검증에서 status !== 'requested' 또는 settlement_flow !== 'client_direct' 또는 receipt_number IS NOT NULL → 한국어 에러
- ✅ DB 변경 없음:
  - `settlements.receipt_number` 여전히 `RCP-2026-001` (변경되지 않음)
  - `settlements.receipt_file_id` 변경 없음
  - `settlement_status_history` 신규 행 없음
- ✅ Storage 신규 객체 없음 (PDF 재생성 안 됨)
- ✅ notifications 신규 행 없음
- ✅ 콘솔 로그 출력 없음

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
  - `body` = 정규식 매칭 `^RCP-\d{4}-\d{3} \(\d{1,3}(,\d{3})* 원\)$` (예: `'RCP-2026-002 (2,000,000 원)'`)
  - `link_url` = `'/me/payouts/<settlement_id>'`
  - `read_at` IS NULL
- ✅ 콘솔 stdout에 정확히 한 줄:
  - 형식: `[notif] receipt_issued → instructor_id=<uuid> settlement_id=<uuid> receipt_number=RCP-2026-NNN`
  - 정규식: `^\[notif\] receipt_issued → instructor_id=[\w-]{36} settlement_id=[\w-]{36} receipt_number=RCP-\d{4}-\d{3}$`
  - 본 SPEC은 SPEC-NOTIFY-001 후속 어댑터의 hook 식별자
- ✅ 실제 이메일/SMS 발송 없음 (콘솔 로그만)
- ✅ 알림 INSERT 실패 시 (mock RLS 거부) 전체 트랜잭션 롤백 + 콘솔 로그 미출력 + status=`requested` 그대로

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

## 검수 체크리스트 종합 (Definition of Done)

본 SPEC이 `status: completed`로 전환되기 위한 종합 체크:

- [ ] 시나리오 1-10 모두 PASS
- [ ] 단위 테스트 라인 커버리지 ≥ 85% (receipt 모듈)
- [ ] `pnpm build` / `pnpm typecheck` / `pnpm lint` 모두 0 에러
- [ ] axe DevTools `/me/payouts/[id]/remit`, `/settlements/[id]` (client_direct) critical 0건
- [ ] 영수증 PDF 시각 검수 (사용자 확인)
- [ ] 마이그레이션 6건 모두 정상 적용 (`npx supabase db reset`)
- [ ] 콘솔 로그 정규식 매칭 검증
- [ ] SPEC-PAYOUT-001 회귀 0건
- [ ] 영수증 번호 동시성 검증 (병렬 5건 unique)
- [ ] RLS 검증 (cross-instructor 접근 차단)
- [ ] paid-freeze 인배리언트 통과
- [ ] organization_info 우선순위 검증 (DB > env > 거부)
- [ ] 한국어 에러 메시지 6종 모두 적용
- [ ] @MX 태그 추가 (plan.md §6 표 참조)

---

_End of SPEC-RECEIPT-001 acceptance.md_
