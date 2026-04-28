# SPEC-PAYOUT-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-PAYOUT-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap + SPEC-PROJECT-001 완료):

### 사용자
| 사용자 | 이메일 | 비밀번호 | role |
|--------|--------|---------|------|
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` |
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` |
| Instructor (제 3자 접근 검증용) | `instructor@algolink.test` | `InstructorPass!2026` | `instructor` |

### 정산 행 (테스트 픽스처)

각 시나리오 시작 시 다음 정산 행이 존재한다고 가정 (admin이 직접 INSERT 또는 seed):

| 별칭 | settlement_flow | status | business_amount_krw | instructor_fee_krw | withholding_tax_rate | profit_krw (GENERATED) | withholding_tax_amount_krw (GENERATED) | created_at |
|------|-----------------|--------|---------------------|--------------------|--------------------:|------------------------|----------------------------------------|------------|
| ST-A | corporate | pending | 5,000,000 | 3,000,000 | 0 | 2,000,000 | 0 | 2026-05-05 |
| ST-B | government | pending | 4,000,000 | 2,500,000 | 3.30 | 1,500,000 | 82,500 | 2026-05-10 |
| ST-C | government | requested | 6,000,000 | 4,000,000 | 8.80 | 2,000,000 | 352,000 | 2026-05-12 |
| ST-D | corporate | paid | 3,000,000 | 1,800,000 | 0 | 1,200,000 | 0 | 2026-05-15 |
| ST-E | corporate | held | 8,000,000 | 5,000,000 | 0 | 3,000,000 | 0 | 2026-04-25 |
| ST-F | government | pending | 2,000,000 | 1,500,000 | 3.30 | 500,000 | 49,500 | 2026-05-20 |

GENERATED 컬럼 검증: `profit_krw = business - fee`, `withholding_tax_amount_krw = floor(fee * rate / 100)`.

### 환경
- 브라우저: Chromium 최신, 쿠키 활성, JavaScript 활성
- 서버: `pnpm dev`
- DB: 로컬 Supabase (SPEC-DB-001 마이그레이션 + SPEC-AUTH-001 마이그레이션 적용 완료, 본 SPEC은 마이그레이션 변경 없음)
- 환경 변수: `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- 시간: 시나리오 실행 시각 ≤ 2026-06-01 (5월 매입매출 집계 검증을 위해)
- 서버 콘솔: 표준 출력 캡처 가능 (테스트 환경에서 vi.spyOn 또는 stdout buffer)

---

## 시나리오 1 — 1-클릭 정산 요청 (pending → requested)

**대응 EARS:** REQ-PAYOUT-MAIL-001~003, REQ-PAYOUT-STATUS-001~002, REQ-PAYOUT-LIST-004

### Given
- Operator가 `/dashboard`에 로그인되어 있음
- 정산 행 `ST-A`가 존재 (status=`pending`, instructor=강사 A, project=프로젝트 X)
- 강사 A의 `instructors.user_id`가 `notifications` 테이블의 `recipient_id`로 참조 가능

### When
1. Operator가 사이드바 "정산 관리" 클릭 → `/settlements` 도달
2. 리스트에서 ST-A 행 클릭 → `/settlements/<ST-A_id>` 상세 페이지 이동
3. "정산 요청" 버튼 클릭
4. 확인 다이얼로그 `"강사 A에게 정산 요청 알림을 발송합니다. 계속하시겠습니까?"` 표시
5. "확인" 클릭
6. Server Action `requestSettlement({ settlementId: ST-A_id })` 호출
7. 트랜잭션 시작:
   - `UPDATE settlements SET status='requested' WHERE id=ST-A_id AND status='pending'`
   - `trg_settlements_status_history` 트리거 자동 발동 → `settlement_status_history` INSERT (`from_status='pending', to_status='requested', changed_by=operator_user_id`)
   - `INSERT INTO notifications (recipient_id, type, title, body, link_url) VALUES (강사A의 user_id, 'settlement_requested', '...', '...', '/me/payouts')`
8. 트랜잭션 COMMIT
9. `console.log("[notif] settlement_requested → instructor_id=<강사A_id> settlement_id=<ST-A_id>")` 출력
10. `revalidatePath('/settlements/[id]')` + `revalidatePath('/settlements')` 후 페이지 새로고침

### Then
- ✅ DB `settlements.status = 'requested'` (이전: `pending`) — SELECT 검증
- ✅ DB `settlement_status_history`에 1행 추가:
  - `settlement_id = ST-A_id`
  - `from_status = 'pending'`
  - `to_status = 'requested'`
  - `changed_by = operator의 user_id`
  - `changed_at` ≈ now() (±2초)
- ✅ DB `notifications`에 1행 INSERT:
  - `recipient_id = 강사A_user_id`
  - `type = 'settlement_requested'`
  - `title`에 프로젝트 제목 포함
  - `body`에 사업비/강사비/수익 합계 포함
  - `link_url = '/me/payouts'`
  - `read_at IS NULL`
- ✅ 서버 콘솔에 정확히 한 줄: `"[notif] settlement_requested → instructor_id=<UUID> settlement_id=<UUID>"` 출력
  - 정규식: `^\[notif\] settlement_requested → instructor_id=[\w-]{36} settlement_id=[\w-]{36}$`
- ✅ 페이지 새로고침 후 status badge가 "정산 요청" (warning color)로 변경
- ✅ history 타임라인 섹션에 새 row 1건 표시 (`pending → requested`)
- ✅ "정산 요청" 버튼이 사라지고 "입금 확인" + "보류" 버튼이 활성화

---

## 시나리오 2 — 입금 확인 (requested → paid)

**대응 EARS:** REQ-PAYOUT-STATUS-005, REQ-PAYOUT-DETAIL-003

### Given
- 정산 행 ST-C가 존재 (status=`requested`, payment_received_at IS NULL)
- Operator가 `/settlements/<ST-C_id>` 상세 페이지에 머물러 있음

### When
1. Operator가 "입금 확인" 버튼 클릭
2. 확인 다이얼로그 `"입금이 확인되었습니까? 정산 완료 후에는 변경할 수 없습니다."` 표시
3. "확인" 클릭
4. Server Action `markPaid({ settlementId: ST-C_id })` 호출
5. `validateTransition('requested', 'paid')` → `{ ok: true }`
6. `UPDATE settlements SET status='paid', payment_received_at=now(), updated_at=now() WHERE id=ST-C_id AND status='requested'`
7. 트리거 자동 발동 → history 1행 추가
8. revalidatePath

### Then
- ✅ DB `settlements.status = 'paid'`
- ✅ DB `settlements.payment_received_at` ≈ now() (±2초, KST 시간대 timestamptz)
- ✅ DB `settlement_status_history`에 1행 추가 (`requested → paid`)
- ✅ 페이지 새로고침 후 status badge가 "정산 완료" (success color)로 변경
- ✅ "입금 확인일" 필드에 KST 표시 (예: `2026-05-15 14:30 KST`)
- ✅ 모든 상태 전환 버튼이 disabled (`aria-disabled="true"`)
- ✅ 알림 발송 없음 (정산 완료는 강사 알림 미동반, 향후 SPEC-NOTIFY-001 결정)

---

## 시나리오 3 — 보류 토글 (pending → held → requested)

**대응 EARS:** REQ-PAYOUT-STATUS-002, REQ-PAYOUT-STATUS-006, REQ-PAYOUT-MAIL-005

### Given
- 정산 행 ST-A가 존재 (status=`pending`, 시나리오 1 시작 전 상태)

### When (3-A: 선보류 pending → held)
1. Operator가 ST-A 상세 페이지에서 "보류" 버튼 클릭
2. 메모 입력 모달 (옵션) → "분쟁 발생, 검토 필요" 입력 후 확인
3. Server Action `holdSettlement({ settlementId: ST-A_id, notes: '...' })` 호출
4. `validateTransition('pending', 'held')` → `{ ok: true }`
5. `UPDATE settlements SET status='held', notes=$1 WHERE id=ST-A_id AND status='pending'`
6. 트리거 발동 → history 1행 추가

### Then (3-A)
- ✅ DB `settlements.status = 'held'`
- ✅ DB `settlements.notes`에 입력값 저장
- ✅ history에 `pending → held` 1행
- ✅ status badge가 "보류" (destructive color)
- ✅ 매입매출 위젯에서 ST-A가 합계에 포함되지 **않음** (held 제외, REQ-PAYOUT-AGGREGATE-002)

### When (3-B: 재요청 held → requested)
1. Operator가 같은 페이지에서 "재요청" 버튼 클릭
2. Server Action `resumeSettlement({ settlementId: ST-A_id })` 호출
3. `validateTransition('held', 'requested')` → `{ ok: true }`
4. `requestSettlement` 흐름과 동일하게 notifications INSERT + 콘솔 로그

### Then (3-B)
- ✅ DB `settlements.status = 'requested'`
- ✅ history에 `held → requested` 1행 추가 (총 2행: pending→held, held→requested)
- ✅ notifications에 새 1행 INSERT (audit trail 보존, 이전 row 삭제 안 됨)
- ✅ 콘솔 로그 1줄 추가 출력
- ✅ status badge가 "정산 요청" (warning color)
- ✅ 매입매출 위젯에서 ST-A가 다시 합계에 포함됨

---

## 시나리오 4 — paid 동결 검증 (모든 전환 차단)

**대응 EARS:** REQ-PAYOUT-STATUS-003, REQ-PAYOUT-STATUS-007

### Given
- 정산 행 ST-D가 존재 (status=`paid`, 시나리오 2 완료 또는 seed로 직접 생성)

### When
1. Operator가 `/settlements/<ST-D_id>` 상세 페이지 진입
2. 화면 렌더링 시 `<SettlementActionsPanel>`이 status='paid' 감지
3. 모든 상태 전환 버튼 ("정산 요청", "입금 확인", "보류", "재요청") 렌더 시 `disabled={true}` + `aria-disabled="true"` 적용
4. (방어선 검증) Operator가 dev tool로 직접 Server Action `markPaid({ settlementId: ST-D_id })` 호출 시도

### Then
- ✅ UI에서 모든 상태 전환 버튼이 시각적으로 비활성 (회색 처리, cursor not-allowed)
- ✅ 키보드 Tab 시 disabled 버튼은 focus 가능하지만 Enter/Space 활성화 안 됨
- ✅ 화면 상단에 안내 배너: `"정산 완료된 항목입니다. 변경할 수 없습니다."`
- ✅ Server Action 강제 호출 시 응답: `{ ok: false, error: STATUS_PAID_FROZEN }` ("정산 완료된 항목은 변경할 수 없습니다.")
- ✅ DB 변경 없음 (status, payment_received_at, updated_at 모두 변동 없음)
- ✅ history에 새 row 추가되지 **않음**

---

## 시나리오 5 — 매입매출 위젯 합계 (held 제외, deleted_at 제외)

**대응 EARS:** REQ-PAYOUT-AGGREGATE-001~005

### Given
- 사전 준비 6개 정산 행 모두 존재
- 이번 달 = `2026-05`
- 5월 created_at: ST-A(5/5), ST-B(5/10), ST-C(5/12), ST-D(5/15), ST-F(5/20) — 5건
- 4월 created_at: ST-E(4/25, **held**) — 5월 위젯에서 created_at 기준이면 제외, 4월 위젯에서도 held이므로 제외
- 추가: 시나리오 5 전용 ST-G `deleted_at` 설정된 행 1건 (status=requested, business=1,000,000) — 모든 위젯에서 제외

### When (5-A: 5월 매입매출)
1. Operator가 `/settlements?period=2026-05` 도달
2. `RevenueWidget`이 `computeMonthlyAggregate('2026-05', 'created')` 호출
3. SQL: `SELECT SUM(business_amount_krw), SUM(instructor_fee_krw), SUM(profit_krw), COUNT(*) FROM settlements WHERE status != 'held' AND deleted_at IS NULL AND created_at >= '2026-05-01T00:00:00+09:00' AND created_at < '2026-06-01T00:00:00+09:00'`

### Then (5-A)
- ✅ 합계 계산:
  - 사업비 합계 = ST-A(5,000,000) + ST-B(4,000,000) + ST-C(6,000,000) + ST-D(3,000,000) + ST-F(2,000,000) = **20,000,000**
  - 강사비 합계 = 3,000,000 + 2,500,000 + 4,000,000 + 1,800,000 + 1,500,000 = **12,800,000**
  - 수익 합계 = 2,000,000 + 1,500,000 + 2,000,000 + 1,200,000 + 500,000 = **7,200,000**
  - 정산 건수 = **5**
- ✅ ST-E (held, 4월) 제외됨 (held + 4월 둘 다 충족)
- ✅ ST-G (deleted_at 설정) 제외됨
- ✅ 위젯 표시: `"5월 매입매출: 사업비 20,000,000원 | 강사비 12,800,000원 | 수익 7,200,000원 (5건)"`

### When (5-B: 분기 Q2 매입매출)
1. URL을 `/settlements?period=2026-Q2`로 변경
2. SQL 범위: `created_at >= '2026-04-01T00:00:00+09:00' AND created_at < '2026-07-01T00:00:00+09:00'`

### Then (5-B)
- ✅ ST-E(4월, held)는 여전히 제외 (held는 모든 기간에서 제외)
- ✅ ST-G(deleted)도 제외
- ✅ 5월 5건만 합산 → 위젯 합계는 5-A와 동일
- ✅ 위젯 캡션: `"2026 Q2 매입매출 (4-6월)"`

### When (5-C: 보류 해제 후 재집계)
1. ST-E의 status를 `held → requested`로 변경 (admin 작업 또는 시나리오 3-B 재실행)
2. 위젯 새로고침

### Then (5-C)
- ✅ ST-E가 4월 위젯에 포함 (사업비 +8,000,000)
- ✅ Q2 위젯에도 포함 (총 6건)

---

## 시나리오 6 — 세율 zod 거부 (cross-field validation)

**대응 EARS:** REQ-PAYOUT-TAX-002, REQ-PAYOUT-TAX-003

### Given
- 정산 행 ST-A 상세 페이지의 수정 폼이 열려 있음 (혹은 admin이 정산 행 신규 등록 폼 사용)
- 현재 settlement_flow=`corporate`, withholding_tax_rate=`0`

### When (6-A: corporate에 5% 입력)
1. Operator가 폼에서 settlement_flow를 `corporate` 유지하고 withholding_tax_rate input에 `5`를 입력
2. "저장" 버튼 클릭
3. zod superRefine cross-field 검증 수행

### Then (6-A)
- ✅ 폼 제출 미실행
- ✅ withholding_tax_rate input 아래에 한국어 에러 표시: `"기업 정산은 원천세율이 0%여야 합니다."` (`role="alert"`)
- ✅ Server Action 호출 안 됨
- ✅ DB 변경 없음
- ✅ DB CHECK 위반(서버 500) 발생하지 않음 (사전 차단)

### When (6-B: government에 5.5% 입력)
1. settlement_flow를 `government`로 변경
2. withholding_tax_rate에 `5.5` 입력
3. "저장" 클릭

### Then (6-B)
- ✅ zod 거부: `"정부 정산 원천세율은 3.30% 또는 8.80%만 가능합니다."`
- ✅ DB 변경 없음

### When (6-C: government에 8.80 정상 입력)
1. settlement_flow=`government`, withholding_tax_rate=`8.80`, instructor_fee_krw=`4,000,000`로 입력
2. "저장" 클릭

### Then (6-C)
- ✅ zod parse OK
- ✅ Server Action `updateSettlement` 호출 → `UPDATE settlements SET settlement_flow='government', withholding_tax_rate=8.80, instructor_fee_krw=4000000 WHERE id=ST-A_id`
- ✅ DB GENERATED 컬럼 자동 재계산: `withholding_tax_amount_krw = floor(4000000 * 8.80 / 100) = 352000`
- ✅ UI에 갱신된 원천세 금액 `352,000원` 표시

### When (6-D: GENERATED 컬럼 직접 INSERT 시도 — 방어선 검증)
1. dev tool로 Server Action에 `profit_krw: 999999` 또는 `withholding_tax_amount_krw: 999999` 페이로드 강제 전송 시도

### Then (6-D)
- ✅ 페이로드 빌더가 `SETTLEMENT_UPDATABLE_COLUMNS` 화이트리스트로 두 컬럼 무시 (실제 SQL에 포함 안 됨)
- ✅ 만약 우회되어 SQL에 포함될 경우, PostgreSQL이 `cannot insert into column "profit_krw" because it is a generated column` 에러 반환 → Server Action이 `MAIL_STUB_FAILED` 또는 generic 에러 응답
- ✅ DB 변경 없음

---

## 시나리오 7 — Instructor가 `/settlements` 접근 시 silent redirect

**대응 EARS:** REQ-PAYOUT-RLS-001, REQ-PAYOUT-RLS-003 (SPEC-AUTH-001 가드 재사용)

### Given
- Instructor(`instructor@algolink.test`)가 로그인된 상태
- 현재 페이지: `/me/dashboard`

### When
1. 브라우저 URL을 `/settlements`로 직접 변경 후 Enter
2. middleware의 1차 가드 또는 `(operator)/layout.tsx` 가드가 role mismatch 감지

### Then
- ✅ HTTP 307 응답으로 `Location: /me/dashboard` 헤더 전송
- ✅ 응답 본문에 "권한 없음", "403", "Forbidden", `/settlements` 등 어떤 텍스트도 노출되지 **않음**
- ✅ 정산 리스트 콘텐츠가 렌더되지 **않음**
- ✅ 동일 동작이 `/settlements/<random-uuid>`에도 적용
- ✅ Instructor가 `/me/payouts` (본인 정산 조회, SPEC-ME-001 산출물)는 정상 접근 가능 (regression 없음)

---

## 추가 검증 (Edge Cases & Quality Gates)

다음 항목은 7개 주요 시나리오와 별도로 검증한다.

### EC-1 — held → paid 직접 전환 차단

- **Given**: 정산 행 ST-E (status=`held`)
- **When**: Operator가 dev tool로 `markPaid({ settlementId: ST-E_id })` 강제 호출
- **Then**: validateTransition('held', 'paid') → `{ ok: false, reason: STATUS_HELD_TO_PAID_BLOCKED }` ("보류 상태에서는 정산 완료로 직접 전환할 수 없습니다. 정산 요청으로 먼저 복귀하세요."). DB 변경 없음. UI에 한국어 에러 toast 표시.

### EC-2 — 동시성 충돌 (두 operator가 동시에 markPaid)

- **Given**: 정산 행 ST-C (status=`requested`), Operator A와 Operator B가 동시에 상세 페이지를 열어 둠
- **When**: A가 "입금 확인" 클릭 → 트랜잭션 성공 → B가 같은 버튼 클릭 시도
- **Then**: B의 Server Action이 `UPDATE ... WHERE status='requested'` 실행 → affected rows = 0 (이미 paid 상태) → 한국어 메시지 `"다른 사용자가 먼저 변경했습니다. 새로고침 후 다시 시도하세요."` 표시. DB는 A의 변경만 보존 (paid + payment_received_at).

### EC-3 — KST 월말 경계 (2026-04-30 23:59:59 vs 2026-05-01 00:00:00)

- **Given**: 정산 행 X1 (created_at=`2026-04-30T23:59:59+09:00`), X2 (created_at=`2026-05-01T00:00:00+09:00`), 둘 다 status=requested
- **When**: 5월 위젯 (`period=2026-05`) 조회
- **Then**: X1 제외 (4월), X2 포함 (5월). SQL 범위: `created_at >= '2026-05-01T00:00:00+09:00' AND created_at < '2026-06-01T00:00:00+09:00'`. UTC 환산 시 `created_at >= '2026-04-30T15:00:00Z' AND created_at < '2026-05-31T15:00:00Z'`.

### EC-4 — GENERATED 컬럼 INSERT 우회 시도 → 422 (DB 방어선)

- **Given**: 페이로드 빌더 우회 시도 (테스트 코드에서 raw SQL로 INSERT)
- **When**: `INSERT INTO settlements (..., profit_krw, ...) VALUES (..., 9999999, ...)` 실행
- **Then**: PostgreSQL 에러 `cannot insert a non-DEFAULT value into column "profit_krw"` 또는 `column "profit_krw" can only be updated to DEFAULT`. INSERT 실패. 본 SPEC의 코드 경로에서는 `SETTLEMENT_UPDATABLE_COLUMNS` 화이트리스트로 사전 차단되어 이 에러가 발생하지 않음.

### EC-5 — Instructor가 RLS 통과한 본인 settlement 조회

- **Given**: Instructor 로그인, 본인 instructor_id로 연결된 settlement ST-X 1건 존재
- **When**: Instructor가 `/me/payouts` (SPEC-ME-001 산출물) 접근하여 본인 정산 조회
- **Then**: `settlements_self_select` RLS 정책 발동 → ST-X 1건만 SELECT 성공. 다른 강사의 settlement는 0 rows. 본 SPEC의 `/settlements` 라우트는 instructor에게 silent redirect되므로 영향 없음.

### EC-6 — 페이지네이션 over-flow (`?page=999`)

- **Given**: 정산 행 총 25건 존재 (pageSize=20 → 총 2페이지)
- **When**: URL `/settlements?page=999` 직접 입력
- **Then**: HTTP 307 redirect로 `/settlements?page=2`로 이동. 빈 결과가 표시되지 **않음**.

### EC-7 — 16개 상태 전환 조합 단위 테스트 검증

- **Given**: `validateTransition` 순수 함수
- **When**: 4×4=16 조합 모두 호출 (`SETTLEMENT_STATUSES.forEach(from => SETTLEMENT_STATUSES.forEach(to => validateTransition(from, to)))`)
- **Then**:
  - 허용 5건 (ok=true): `pending→requested`, `pending→held`, `requested→paid`, `requested→held`, `held→requested`
  - 차단 11건 (ok=false + 한국어 reason):
    - `pending→pending`, `pending→paid`: `STATUS_INVALID_TRANSITION`
    - `requested→requested`, `requested→pending`: `STATUS_INVALID_TRANSITION`
    - `paid→pending`, `paid→requested`, `paid→paid`, `paid→held`: `STATUS_PAID_FROZEN` (4건 모두 동일 reason)
    - `held→pending`, `held→held`: `STATUS_INVALID_TRANSITION`
    - `held→paid`: `STATUS_HELD_TO_PAID_BLOCKED` (특수 케이스)

### EC-8 — 콘솔 로그 형식 정확성

- **Given**: requestSettlement Server Action 실행
- **When**: 콘솔 출력 캡처 (vi.spyOn(console, 'log'))
- **Then**: 정확히 다음 정규식과 일치하는 로그 1건: `^\[notif\] settlement_requested → instructor_id=[\w-]{36} settlement_id=[\w-]{36}$`. 추가 출력 없음.

### EC-9 — `tax-calculator.ts` GENERATED 공식 일치 검증

- **Given**: `computeWithholdingTaxAmount` 순수 함수 + 동일 (fee, rate)로 DB INSERT 후 GENERATED 컬럼 SELECT
- **When**: `computeWithholdingTaxAmount(3000000, 3.30)` vs DB `SELECT withholding_tax_amount_krw FROM settlements WHERE instructor_fee_krw=3000000 AND withholding_tax_rate=3.30`
- **Then**: 두 값이 정확히 일치 (`99000`). 다른 케이스: (3000000, 8.80) → `264000`, (5000000, 0) → `0`, (1500000, 3.30) → `floor(1500000 * 3.30 / 100) = 49500`.

### EC-10 — Asia/Seoul 시간대 일관 표시

- **Given**: ST-D의 `payment_received_at`가 DB에 `2026-05-15T05:30:00+00:00` UTC로 저장
- **When**: 상세 페이지 진입
- **Then**: 화면에 `2026-05-15 14:30 KST`로 표시 (UTC + 9시간). 모든 timestamp 컬럼(payment_received_at, payout_sent_at, created_at, updated_at)이 동일 정책 적용.

### EC-11 — `notifications` INSERT 실패 시 status 롤백

- **Given**: 시뮬레이션을 위해 `notifications` 테이블의 RLS를 임시 변경하여 INSERT 거부
- **When**: Operator가 1-클릭 정산 요청
- **Then**: 트랜잭션 ROLLBACK → `settlements.status` 변경 없음 (여전히 pending). `settlement_status_history`에 새 row 추가 안 됨 (트리거는 status 변경 시에만 발동, 롤백된 변경은 무시). 사용자에게 한국어 에러 `MAIL_STUB_FAILED` ("정산 요청 알림 발송에 실패했습니다. 잠시 후 다시 시도해주세요.") 표시.

### EC-12 — GENERATED 컬럼 grep 검증 (정적 분석)

- **Given**: `src/lib/payouts/queries.ts` 모든 INSERT/UPDATE 페이로드
- **When**: `grep -E "INSERT.*profit_krw|UPDATE.*profit_krw|INSERT.*withholding_tax_amount|UPDATE.*withholding_tax_amount" src/lib/payouts/queries.ts`
- **Then**: 0 hits. SELECT 컨텍스트(컬럼 list)에서만 등장.

---

## 품질 게이트 (Quality Gates)

본 SPEC이 `status: completed`로 전환되기 위한 자동 검증:

| 게이트 | 명령 또는 도구 | 통과 기준 |
|--------|---------------|----------|
| Build | `pnpm build` | 0 error, 0 critical warning |
| Type | `pnpm tsc --noEmit` | 0 error |
| Lint | `pnpm exec eslint src/app/(app)/(operator)/settlements src/lib/payouts src/components/payouts` | 0 critical |
| 단위 테스트 (status-machine) | `pnpm vitest run src/lib/payouts/__tests__/status-machine.test.ts` | 16개 케이스 모두 PASS |
| 단위 테스트 (tax-calculator) | `pnpm vitest run src/lib/payouts/__tests__/tax-calculator.test.ts` | 9개 케이스 모두 PASS |
| 단위 테스트 (validation) | `pnpm vitest run src/lib/payouts/__tests__/validation.test.ts` | 5개 케이스 모두 PASS |
| 단위 테스트 (aggregations) | `pnpm vitest run src/lib/payouts/__tests__/aggregations.test.ts` | held 제외, deleted_at 제외, KST 경계 검증 PASS |
| 단위 테스트 (mail-stub) | `pnpm vitest run src/lib/payouts/__tests__/mail-stub.test.ts` | notifications INSERT + 콘솔 로그 형식 PASS |
| 통합 테스트 | `pnpm vitest run src/app/(app)/(operator)/settlements/__tests__/integration.test.ts` | 시나리오 1-7 모두 PASS |
| 단위 커버리지 | `pnpm vitest --coverage src/lib/payouts` | 라인 커버리지 ≥ 85% |
| 마이그레이션 | `supabase db reset` | 무오류 + seed 통과 (본 SPEC은 마이그레이션 변경 없음) |
| 시나리오 | 본 문서 시나리오 1-7 | 모두 PASS |
| Edge cases | EC-1 ~ EC-12 | 모두 PASS |
| Accessibility (axe DevTools) | `/settlements`, `/settlements/<id>` 2 페이지 | critical 0 / serious 0 |
| GENERATED 컬럼 보호 | `grep -E "INSERT.*profit_krw\|UPDATE.*profit_krw\|INSERT.*withholding_tax_amount\|UPDATE.*withholding_tax_amount" src/lib/payouts` | 0 hit |
| Service role 비사용 | `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_SECRET_KEY" src/lib/payouts src/app/(app)/(operator)/settlements` | 0 hit |
| 한국어 단일 출처 | `grep -rn "정산 완료\|보류\|기업 정산\|정부 정산" src/app/(app)/(operator)/settlements src/components/payouts \| grep -v errors.ts` | 라벨 컴포넌트 경유만 |
| 콘솔 로그 형식 | 통합 테스트의 vi.spyOn(console, 'log') 정규식 매칭 | `^\[notif\] settlement_requested → instructor_id=[\w-]+ settlement_id=[\w-]+$` |

---

## Definition of Done (인수 기준)

본 SPEC은 다음을 모두 만족할 때 사용자가 `/moai sync SPEC-PAYOUT-001`을 실행할 수 있다:

- [ ] `plan.md`의 모든 마일스톤 DoD 항목 완료
- [ ] 본 acceptance.md의 시나리오 1-7 모두 PASS
- [ ] 본 acceptance.md의 EC-1 ~ EC-12 모두 PASS
- [ ] 품질 게이트 표의 모든 항목 통과
- [ ] `src/lib/payouts/` 모듈 단위 테스트 라인 커버리지 ≥ 85%
- [ ] `(operator)/settlements` 라우트 2종 모두 SPEC-AUTH-001 가드를 통과 (instructor/미인증 silent redirect)
- [ ] `notifications` INSERT 시 `recipient_id`가 강사의 `users.id`이고, `link_url`이 `/me/payouts` placeholder
- [ ] 한국어 에러 메시지 8종 + 1종(STALE_TRANSITION) 모두 `src/lib/payouts/errors.ts`에서 단일 출처로 관리
- [ ] GENERATED 컬럼(`profit_krw`, `withholding_tax_amount_krw`)이 모든 INSERT/UPDATE 페이로드에서 제외됨 (grep 검증)
- [ ] 16개 상태 전환 조합 단위 테스트 모두 PASS (EC-7 100% 커버)
- [ ] 매입매출 위젯이 `status != 'held' AND deleted_at IS NULL` 조건을 정확히 적용 (시나리오 5 PASS)
- [ ] paid 동결 검증: 모든 상태 전환 버튼 disabled + Server Action 강제 호출 시 `STATUS_PAID_FROZEN` 거부 (시나리오 4 + EC-1 PASS)
- [ ] 콘솔 로그 형식 `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>` 정확 출력 (EC-8 PASS)
- [ ] 모든 timestamp 컬럼이 KST 시간대로 일관 표시 (EC-10 PASS)

---

_End of SPEC-PAYOUT-001 acceptance.md_
