# SPEC-NOTIFY-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-NOTIFY-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-DB-001 seed + SPEC-AUTH-001 admin bootstrap + SPEC-PROJECT-001 / SPEC-PAYOUT-001 / SPEC-ME-001 완료):

### 사용자

| 사용자 | 이메일 | 비밀번호 | role | id 별칭 |
|--------|--------|---------|------|---------|
| Operator | `operator@algolink.test` | `OperatorPass!2026` | `operator` | OP-1 |
| Operator 2 | `operator2@algolink.test` | `OperatorPass!2026` | `operator` | OP-2 |
| Admin | `admin@algolink.test` | `AdminPass!2026` | `admin` | AD-1 |
| Instructor A | `instructor@algolink.test` | `InstructorPass!2026` | `instructor` | INS-A (user_id = USR-INSA) |
| Instructor B (만족도 낮음) | `instructor.b@algolink.test` | `InstructorPass!2026` | `instructor` | INS-B (user_id = USR-INSB) |
| Client | `client@algolink.test` | `ClientPass!2026` | `client` | CL-1 |

### 강사 메타

| 강사 | 평균 만족도 | 리뷰 수 | schedule_items |
|------|-----------|--------|----------------|
| INS-A | 4.6/5 | 8건 | 없음 |
| INS-B | 2.5/5 | 5건 (low_satisfaction trigger 검증용) | 2026-05-10 14:00 ~ 16:00 (`personal`) |

### 프로젝트

| 프로젝트 | 별칭 | status | operator | instructor | 일정 |
|---------|------|--------|---------|-----------|------|
| Django 부트캠프 | PRJ-1 | `assignment_review` (24h 전 전환) | OP-1 | INS-A | 2026-05-10 ~ 2026-05-14 |
| Python 워크샵 | PRJ-2 | `proposal` (8일 전 생성, dday_unprocessed 검증용) | OP-1 | NULL | 미정 |
| React 강의 | PRJ-3 | `assignment_confirmed` | OP-1 | INS-B | 2026-05-10 09:00 ~ 12:00 |

### 정산

| settlement | status | requested_at |
|------------|--------|--------------|
| ST-1 | `requested` | 2026-04-21 (7일 전) |

### 환경

- 브라우저: Chromium 최신, 쿠키 활성
- 서버: `pnpm dev`
- DB: 로컬 Supabase (모든 마이그레이션 적용)
- 시간: 시나리오 실행 시각 = 2026-04-28
- `process.env.NODE_ENV = 'test'` (로그 spy 가능)

---

## 시나리오 1 — Operator가 헤더 종 아이콘을 클릭하여 안읽음 알림을 확인

**대응 EARS:** REQ-NOTIFY-BELL-001~005, REQ-NOTIFY-QUERY-002, -005

### Given

- OP-1로 로그인되어 있음 (`/dashboard` 진입 상태)
- DB `notifications` 테이블에 OP-1 대상 안읽음 알림 3건 존재:
  - `assignment_request` "[배정 요청] PRJ-1" (10분 전 생성)
  - `settlement_requested` "정산 요청 — PRJ-3" (1시간 전)
  - `dday_unprocessed` "D-Day 미처리 항목" (3시간 전)

### When

1. 헤더 우상단 종 아이콘이 안읽음 카운트 배지 `3`을 표시
2. OP-1이 종 아이콘을 클릭

### Then

- ✅ Dropdown이 종 아이콘 아래에 펼쳐짐
- ✅ 최근 10건이 `created_at DESC`로 표시 (3건만 있으므로 3건 모두)
- ✅ 각 항목에 타입 배지 (한국어 라벨), 제목, 상대 시간 (예: "10분 전") 표시
- ✅ 하단에 "모두 보기" 링크 (`href="/notifications"`)
- ✅ 종 아이콘 `aria-expanded="true"`
- ✅ 첫 항목에 키보드 포커스 (또는 dropdown 자체에 포커스, 화살표로 이동 가능)

---

## 시나리오 2 — Operator가 알림 항목을 클릭하여 read 마킹 + 페이지 이동

**대응 EARS:** REQ-NOTIFY-BELL-005, REQ-NOTIFY-QUERY-003

### Given

- 시나리오 1의 dropdown이 열려 있음
- 첫 항목 `assignment_request` "[배정 요청] PRJ-1" (`link_url = '/me'`)

### When

1. OP-1이 첫 항목 클릭

### Then

- ✅ DB `notifications.read_at`에 `now()` 값 설정 (해당 row만)
- ✅ Dropdown 닫힘
- ✅ 클라이언트 라우팅으로 `/me` 페이지 도착
- ✅ 헤더 종 아이콘 카운트가 `3` → `2`로 즉시 감소 (`revalidateTag` 또는 client refetch)

---

## 시나리오 3 — Operator가 "모두 읽음" 버튼으로 일괄 처리

**대응 EARS:** REQ-NOTIFY-LIST-006, REQ-NOTIFY-QUERY-004

### Given

- OP-1로 로그인, `/notifications` 페이지 진입
- 안읽음 알림 5건, 읽음 알림 12건 (총 17건) 보유
- 우상단에 "모두 읽음" 버튼 표시

### When

1. OP-1이 "모두 읽음" 버튼 클릭
2. 확인 다이얼로그 (선택, optional) → 확인

### Then

- ✅ `markAllReadAction` Server Action 호출
- ✅ DB `UPDATE notifications SET read_at = now() WHERE recipient_id = OP-1 AND read_at IS NULL` 실행 → 5 rows 영향
- ✅ 페이지 자동 revalidate, 헤더 종 아이콘 배지 사라짐 (count = 0)
- ✅ 페이지의 모든 항목에 "읽음" 표시
- ✅ 토스트 또는 라이브 영역에 `"5건 일괄 읽음 처리됨"` 안내

---

## 시나리오 4 — Operator가 만족도 낮은 강사(INS-B, 평균 2.5)를 1-클릭 배정 → low_satisfaction_assignment 알림

**대응 EARS:** REQ-NOTIFY-TRIGGER-004, REQ-NOTIFY-EMIT-001~004

### Given

- OP-1로 로그인, `/projects/PRJ-1` 상세 페이지에서 추천 결과 표시 중
- INS-B가 추천 결과에 포함 (또는 수동 배정 가능)
- DB `satisfaction_reviews` INS-B 평균 = 2.5/5 (5건)

### When

1. OP-1이 INS-B 카드의 "배정 요청" 버튼 클릭
2. 확인 다이얼로그 → 확인
3. `assignInstructorAction` 성공
4. 직후 `checkLowSatisfaction(supabase, INS-B, OP-1, PRJ-1)` 호출

### Then

- ✅ `projects.instructor_id = INS-B` (배정 자체는 성공)
- ✅ `notifications` 테이블에 `assignment_request` 1건 INSERT (INS-B의 user_id 대상, 기존 SPEC-PROJECT-001 동작)
- ✅ `notifications` 테이블에 추가로 `low_satisfaction_assignment` 1건 INSERT:
  - `recipient_id = OP-1` (operator 본인 경고)
  - `type = 'low_satisfaction_assignment'`
  - `title = "만족도 낮은 강사 배정"`
  - `body` 내용에 "강사 ... 평균 만족도가 2.5/5" 포함
  - `link_url = '/projects/PRJ-1'`
- ✅ 콘솔 로그 2줄 출력:
  - `[notif] assignment_request → instructor_id=INS-B project_id=PRJ-1 rank=...`
  - `[notif] low_satisfaction_assignment → recipient_id=OP-1` (또는 emit의 logContext에 따라)
- ✅ 다음 페이지 로드 시 OP-1 종 아이콘 카운트가 1 증가

### Edge Case 4-A

- ✅ 동일 (operator, project) 24h 내 재배정(상태 롤백 후) → dedup으로 `low_satisfaction_assignment` skip, `{ ok: false, reason: 'duplicate' }`
- ✅ 리뷰 0건 강사 배정 → `low_satisfaction_assignment` emit 안 함 (prior 미적용)

---

## 시나리오 5 — 강사가 schedule_items를 추가하여 일정 충돌 → schedule_conflict 알림

**대응 EARS:** REQ-NOTIFY-TRIGGER-003, REQ-NOTIFY-EMIT-001

### Given

- INS-B로 로그인, `/me/schedule` 페이지 진입
- INS-B는 PRJ-3에 배정됨 (`status = 'assignment_confirmed'`, education_start_at = 2026-05-10 09:00, end = 12:00)
- INS-B의 기존 schedule_items 중 PRJ-3 시간과 겹치지 않음

### When

1. INS-B가 신규 일정 추가:
   - kind: `unavailable`
   - 시작: 2026-05-10 10:00
   - 종료: 2026-05-10 11:00
   - (= PRJ-3 강의 시간과 1시간 겹침)
2. `addScheduleItemAction` 성공 (schedule_items insert)
3. 직후 `checkScheduleConflict(supabase, INS-B, { start: '2026-05-10 10:00', end: '2026-05-10 11:00' })` 호출

### Then

- ✅ `schedule_items` 신규 row INSERT 성공
- ✅ `notifications` 테이블에 `schedule_conflict` 1건 INSERT:
  - `recipient_id = OP-1` (PRJ-3의 operator)
  - `type = 'schedule_conflict'`
  - `title = "강사 일정 충돌"`
  - `body`에 강사 이름 + 충돌 프로젝트명 포함
  - `link_url = '/projects/PRJ-3'`
- ✅ 콘솔 로그: `[notif] schedule_conflict → recipient_id=OP-1 instructor_id=INS-B project_id=PRJ-3`
- ✅ OP-1이 다음 종 아이콘 클릭 시 알림 표시

### Edge Case 5-A

- ✅ INS-B가 활성 프로젝트에 미배정 → recipient 없음 → emit 0건
- ✅ 동일 instructor + 동일 시작일 24h 내 dedup

---

## 시나리오 6 — 의뢰 접수 후 7일 미배정 → dday_unprocessed (lazy 검사)

**대응 EARS:** REQ-NOTIFY-TRIGGER-005, REQ-NOTIFY-TRIGGER-006

### Given

- PRJ-2 (`status = 'proposal'`, created_at = 2026-04-21, 8일 전)
- OP-1으로 로그인, 5분 이내 트리거 검사 실행 안 했음 (rate-limit 통과)

### When

1. OP-1이 `/notifications` 페이지 진입 (또는 종 아이콘 카운트 fetch)
2. `getUnreadCount(supabase, OP-1, 'operator')` 호출
3. rate-limit 통과 → `Promise.allSettled([checkAssignmentOverdue, checkDdayUnprocessed])` 비동기 실행
4. `checkDdayUnprocessed` 내부 쿼리: `projects WHERE status='proposal' AND now() - created_at >= '7 days'` → PRJ-2 1건

### Then

- ✅ `notifications` 테이블에 `dday_unprocessed` 1건 INSERT:
  - `recipient_id = OP-1`
  - `type = 'dday_unprocessed'`
  - `title = "D-Day 미처리 항목"`
  - `link_url = '/projects/PRJ-2'`
- ✅ 콘솔 로그: `[notif] dday_unprocessed → recipient_id=OP-1 project_id=PRJ-2`
- ✅ `getUnreadCount` 응답 자체는 즉시 반환 (트리거 결과 기다리지 않음)
- ✅ 동일 시나리오 5분 내 재호출 → 트리거 실행 안 함 (rate-limit)
- ✅ 동일 PRJ-2 24h 내 재실행 → emit dedup으로 skip

### Sub-시나리오 6-A — 정산 7일 미처리

- ST-1 (`status='requested'`, requested_at = 2026-04-21)
- 동일 호출에서 ST-1에 대한 `dday_unprocessed` 1건 추가 INSERT (`link_url = '/settlements/ST-1'`)

---

## 시나리오 7 — 배정 요청 후 24h 미응답 → assignment_overdue (lazy 검사)

**대응 EARS:** REQ-NOTIFY-TRIGGER-002

### Given

- PRJ-1 (`status = 'assignment_review'`, updated_at = 2026-04-27 (25h 전), instructor_id = INS-A 배정됨)
- OP-1으로 로그인, 5분 이내 트리거 검사 실행 안 했음

### When

1. OP-1이 `/notifications` 진입
2. `checkAssignmentOverdue(supabase, { hoursThreshold: 24 })` 비동기 실행
3. 쿼리: `projects WHERE status='assignment_review' AND updated_at < now() - '24 hours' AND instructor_id IS NOT NULL` → PRJ-1 1건

### Then

- ✅ `notifications` 테이블에 `assignment_overdue` 1건 INSERT:
  - `recipient_id = OP-1`
  - `type = 'assignment_overdue'`
  - `title = "배정 요청 응답 지연"`
  - `body`에 "강사 응답이 24시간 이상 지연" 포함
  - `link_url = '/projects/PRJ-1'`
- ✅ 콘솔 로그: `[notif] assignment_overdue → recipient_id=OP-1 project_id=PRJ-1`
- ✅ PRJ-1 status가 `assignment_confirmed`(응답 완료)로 전환되면 다음 검사 사이클부터 emit 안 함

---

## 시나리오 8 — Instructor가 다른 사용자 알림 접근 시도 → RLS 차단

**대응 EARS:** REQ-NOTIFY-RLS-001~004

### Given

- INS-A로 로그인 (USR-INSA 토큰)
- DB에 OP-1 대상 안읽음 알림 5건, INS-A 대상 안읽음 0건 존재

### When

1. INS-A가 헤더 종 아이콘 → 카운트 표시 확인
2. INS-A가 `/notifications` 진입
3. (악의적 시도) DevTools에서 raw fetch로 `supabase.from('notifications').select('*')` 호출

### Then

- ✅ 종 아이콘 카운트 = 0 (배지 숨김)
- ✅ `/notifications` 페이지 빈 상태 (empty state 카드)
- ✅ 악의적 fetch도 0 rows 반환 (RLS `notifications_recipient_select` 정책으로 `recipient_id = auth.uid()` 강제)
- ✅ DB 콘솔 로그에 RLS deny 또는 빈 결과 (insert 시도 시 42501 코드)

### Sub-시나리오 8-A — 비인증

- 비로그인 상태로 `/notifications` 직접 URL 접근 → SPEC-AUTH-001 가드가 `/login`으로 redirect (HTTP 307)

---

## 시나리오 9 — 페이지네이션 + 필터

**대응 EARS:** REQ-NOTIFY-LIST-001~007

### Given

- OP-1으로 로그인, DB에 OP-1 대상 알림 50건 (타입 mix: assignment_request 20건, schedule_conflict 15건, dday_unprocessed 10건, settlement_requested 5건)

### When

1. OP-1이 `/notifications` 진입 → page=1, type=all, read=all
2. URL `?page=2`로 이동
3. URL `?type=assignment_request,schedule_conflict&read=unread` 적용
4. URL `?page=999` (초과)로 이동

### Then

- ✅ 1단계: 페이지 1에 20건 표시 (`created_at DESC` 첫 20건)
- ✅ 2단계: 페이지 2에 20건 (21~40번째)
- ✅ 3단계: 필터 적용 후 unread + (assignment_request OR schedule_conflict) 결과만 표시, 카운트 정확
- ✅ 4단계: page=999 → 마지막 valid 페이지로 redirect (REQ-NOTIFY-LIST-007)
- ✅ 모든 단계에서 URL 쿼리가 새로고침 후에도 유지

---

## 시나리오 10 — 콘솔 로그 형식 회귀 (mail-stub + projects assign)

**대응 EARS:** REQ-NOTIFY-EMIT-006, REQ-NOTIFY-EMIT-007

### Given

- M4 통합 완료 (`mail-stub.ts`와 `projects/[id]/actions.ts`가 emit 헬퍼 사용)
- 회귀 테스트 환경: `console.log` spy

### When

1. SPEC-PAYOUT-001 시나리오 실행 — `sendSettlementRequestStub` 호출
2. SPEC-PROJECT-001 시나리오 4 실행 — `assignInstructorAction` 호출

### Then

- ✅ Settlement: 콘솔 로그 정확히 1줄, 정규식 매치:
  ```
  /^\[notif\] settlement_requested → instructor_id=[\w-]{36} settlement_id=[\w-]{36}$/
  ```
- ✅ Assignment: 콘솔 로그 정확히 1줄, 정규식 매치:
  ```
  /^\[notif\] assignment_request → instructor_id=[\w-]{36} project_id=[\w-]{36} rank=(\d+|force)$/
  ```
- ✅ 기존 회귀 테스트 (`payouts/__tests__/mail-stub.test.ts`, `projects/__tests__/integration.test.ts`) 모두 PASS

---

## Edge Cases (EC)

### EC-1 — emit 페이로드 검증 실패

- `recipientId = 'not-uuid'` → `{ ok: false, reason: 'validation' }`, INSERT 시도 없음, 콘솔 로그 없음
- `type = 'unknown_type'` → 동일
- `title.length = 250` → 동일
- `linkUrl = 'https://evil.com'` (절대 URL) → 동일 (regex `/^\//`만 허용)

### EC-2 — emit RLS deny

- `emitNotification`이 다른 사용자 토큰으로 호출 + `recipientId`가 자기 외 사용자 + role이 operator/admin 아님 → INSERT 실패 (Postgres 42501) → `{ ok: false, reason: 'rls' }`
- 콘솔 에러 1줄 출력
- 호출자에게 throw 안 함

### EC-3 — emit dedup

- `dedupKey` 제공 + 23h 전 동일 `(recipient_id, type, link_url)` 알림 존재 → `{ ok: false, reason: 'duplicate' }`
- 25h 전 동일 알림만 있음 → INSERT 정상 진행
- `dedupKey` 미제공 → dedup 검사 skip, 항상 INSERT

### EC-4 — 빈 알림 dropdown

- 사용자에게 알림 0건 + 종 아이콘 클릭 → dropdown 열림 + `"새 알림이 없습니다."` 표시 + "모두 보기" 링크 숨김

### EC-5 — 99+ 카운트

- 안읽음 100건 → 배지 `99+` 표시 (정확 숫자 노출 안 함)
- 안읽음 99건 → 배지 `99` 표시
- 안읽음 1건 → 배지 `1` 표시
- 안읽음 0건 → 배지 미표시

### EC-6 — 트리거 실패 silent

- `checkLowSatisfaction` 내부 쿼리 실패 (DB connection error) → console.warn 1줄 출력, parent action(`assignInstructorAction`) 정상 완료
- `checkAssignmentOverdue`가 lazy 검사에서 throw → `getUnreadCount` 응답에 영향 없음 (count는 정상 반환)

### EC-7 — 트리거 rate-limit

- 동일 user에 대해 5분 내 `getUnreadCount` 2회 호출:
  - 1회: 트리거 실행
  - 2회: 트리거 실행 안 함 (rate-limit 차단), 카운트 쿼리만 정상

### EC-8 — markRead idempotent

- 이미 read인 알림에 `markRead(id)` 재호출 → no-op (`UPDATE ... WHERE read_at IS NULL` 조건)
- 다른 사용자 소유 알림에 `markRead` 호출 → RLS로 0 rows 영향, `{ ok: true }` 반환 (정보 노출 방지)

---

## Quality Gates

### 단위 테스트 커버리지

- `src/lib/notifications/**` 라인 커버리지 ≥ 85%
- 4종 트리거 모듈 각각 ≥ 90% (단순 로직)
- emit 헬퍼 ≥ 95% (모든 분기 검증)

### 통합 테스트 커버리지

- 본 acceptance.md의 시나리오 1~10 모두 PASS
- EC-1~8 모두 PASS

### 회귀 테스트 (필수)

- `src/lib/payouts/__tests__/mail-stub.test.ts` — 모든 케이스 PASS, `LOG_RE` 매치 유지
- `src/app/(app)/(operator)/projects/__tests__/integration.test.ts` 시나리오 4 — 콘솔 로그 형식 보존
- `pnpm tsc --noEmit` 0 에러
- `pnpm build` 0 에러
- `grep -rn "from(\"notifications\").*insert\|from('notifications').*insert" src/` → 결과가 `src/lib/notifications/emit.ts`만 (도메인 코드 0건)

### 접근성 (M7)

- axe DevTools `/notifications` critical/serious 0건
- Lighthouse Accessibility ≥ 95
- 키보드 only 흐름 매뉴얼 검증 PASS
- 스크린리더 매뉴얼 검증 PASS

### 성능

- `getUnreadCount` P95 < 50ms (인덱스 검증)
- `getRecentNotifications LIMIT 10` P95 < 100ms
- `/notifications` 첫 페인트 P95 < 800ms
- Lazy 트리거 1 사이클 P95 < 500ms (트리거가 fire-and-forget이므로 사용자 응답에는 영향 없음)

### 보안

- RLS 시나리오 8 PASS
- emit 페이로드 검증 (XSS 방지 — React 자동 escape에 의존)
- 비인증 8-A PASS

---

## Definition of Done

- [ ] 시나리오 1~10 모두 PASS
- [ ] EC-1~8 모두 PASS
- [ ] 단위 테스트 + 통합 테스트 + 회귀 테스트 모두 PASS
- [ ] 라인 커버리지 ≥ 85% (notifications 모듈)
- [ ] `pnpm tsc --noEmit` + `pnpm build` 0 에러
- [ ] Direct `notifications.insert` grep 결과 0건 (emit 헬퍼 외)
- [ ] axe critical 0건, Lighthouse Accessibility ≥ 95
- [ ] 콘솔 로그 형식 회귀 (mail-stub LOG_RE, projects assignment_request) 보존
- [ ] @MX:ANCHOR 추가 (emit 헬퍼) + @MX:NOTE (트리거 모듈)
- [ ] SPEC frontmatter `status: completed` 전환

---

Version: 0.1.0
Last Updated: 2026-04-28
