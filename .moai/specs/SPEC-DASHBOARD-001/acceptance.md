# SPEC-DASHBOARD-001 — 수용 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 실제로 충족되었는지 end-to-end 검증하기 위한 Given/When/Then 시나리오를 정의한다. 모든 시나리오는 SPEC-DASHBOARD-001이 `status: completed`로 전환되기 전 PASS 해야 한다.

---

## 사전 준비 (Test Setup)

각 시나리오 실행 전 다음 상태를 가정한다 (SPEC-AUTH-001 admin bootstrap 완료 + SPEC-DB-001 seed 적용):

| 사용자 | 이메일 | 역할 |
|--------|--------|------|
| Admin | `admin@algolink.test` | `admin` |
| Operator | `operator@algolink.test` | `operator` |
| Instructor | `instructor@algolink.test` | `instructor` |

**시드 데이터 (SPEC-DB-001 seed):**

- 강사 5명 (`instructor1@..` ~ `instructor5@..`), 각 고유 색상 매핑 가정
- 고객사 3개 (`client_A`, `client_B`, `client_C`)
- 프로젝트 12건, 상태 분포:
  - `의뢰` 또는 `draft`: 3건
  - `강사매칭` 또는 `요청`: 2건
  - `컨펌`: 2건
  - `진행`: 3건
  - `종료` / `정산요청` / `정산완료`: 2건 (정산 컬럼)
- `assignments`: 진행/컨펌 프로젝트마다 강사 1명 배정 (5건)
- `schedules`: 컨펌/진행 assignment마다 1-2개 (총 8건, 향후 30일 내)
- `settlements`: 6건, `정산완료` 2건 + 기타 4건은 미정산. `amount_total` 합 (미정산) = `12,400,000`원

브라우저: Chromium 최신, 쿠키 활성, JavaScript 활성, 데스크톱 1280×800.
서버: `pnpm dev` 또는 production build.
환경: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, timezone `Asia/Seoul`.

---

## 시나리오 1 — Operator 로그인 직후 대시보드 첫 진입 (KPI + 칸반 + 알림 + 캘린더 링크)

**대응 EARS:** REQ-DASH-KPI-001, -002, -003, -004, -007, REQ-DASH-KANBAN-001, -002, -004, REQ-DASH-FILTER-001, -003, REQ-DASH-NOTIFY-002, -003, -004, REQ-DASH-CALENDAR-008, REQ-DASH-DATA-001, -002, -006

### Given

- Operator(`operator@algolink.test`)가 로그인되어 `<AppShell>` 안에 진입한 상태
- URL이 `/dashboard`이며 search params가 비어있음
- 시드 데이터가 적용된 상태

### When

1. 페이지가 로드되면서 `loading.tsx` skeleton이 잠시 표시된 후 실제 데이터로 swap
2. Server Component가 `getCurrentUser`, `getKpiSummary`, `getProjectsByStatus([])`, `getNotificationPreview(operatorId)`를 병렬 또는 순차 호출
3. 응답 데이터가 KPI 그리드, 상태 필터, 칸반 보드, 알림 미리보기, 캘린더 링크에 분배 렌더

### Then

- ✅ 화면 상단에 4개 KPI 카드가 정확한 라벨과 값으로 노출:
  - "의뢰 건수": `3건` (시드 기준)
  - "배정확정 건수": `2건`
  - "교육중 건수": `3건`
  - "미정산 합계": `₩12,400,000`
- ✅ "미정산 합계" 카드는 `<div>` 태그로 렌더 (SPEC-SETTLE-001 미존재로 link 미적용, REQ-DASH-KPI-005)
- ✅ 나머지 3개 KPI 카드는 `<a>`로 렌더되며 각각 `/projects?status=의뢰`, `/projects?status=컨펌`, `/projects?status=진행`으로 link (해당 페이지가 SPEC-PROJECT-001 미구현이어도 link 자체는 존재)
- ✅ 각 KPI 카드 `aria-label`이 `"<라벨> <값>"` 형식 (예: `aria-label="의뢰 건수 3건"`)
- ✅ KPI 영역 아래에 상태 필터 5개 버튼 (`의뢰 / 강사매칭 / 컨펌 / 진행 / 정산`) 정확한 순서로 노출
- ✅ 모든 5 버튼의 `aria-pressed`가 `"false"` (URL에 status param 없음)
- ✅ 상태 필터는 `<div role="group" aria-label="프로젝트 상태 필터">` 래퍼 안에 있음
- ✅ 칸반 보드: 5컬럼 모두 full opacity, 시드 분포에 맞춰 카드 노출 (의뢰 3, 강사매칭 2, 컨펌 2, 진행 3, 정산 2)
- ✅ 각 칸반 카드는 프로젝트 제목, 고객사 이름, 일정(예: `2026-05-10 ~ 2026-05-12 (Asia/Seoul)`) 노출
- ✅ 알림 미리보기 카드: `미응답 배정 요청 0건 / 일정 충돌 0건 / D-Day 경고 0건`
- ✅ 알림 카드 하단에 helper text `"알림 시스템 활성화 후 사용 가능합니다."` 노출
- ✅ 칸반 보드 근처에 "강사 일정 보기" 링크가 있고 `href="/dashboard/calendar"`
- ✅ DevTools Network 탭에서 KPI 관련 SQL이 단일 호출로 합쳐짐 (Drizzle query log 또는 supabase 로그 확인)
- ✅ 첫 paint LCP < 2.5초 (Chrome DevTools Performance)

---

## 시나리오 2 — 상태 필터 다중 선택으로 칸반 강조 분기

**대응 EARS:** REQ-DASH-FILTER-001, -002, -003, -004, -005, -007, REQ-DASH-A11Y-003, -005

### Given

- 시나리오 1과 동일 시드 + Operator 로그인
- 현재 URL: `/dashboard` (필터 비활성)
- 5컬럼 모두 full opacity 상태

### When

1. Operator가 키보드 Tab으로 KPI 그리드를 통과해 상태 필터 영역에 도달
2. "의뢰" 버튼에 focus 이동, Enter 키 또는 클릭
3. 시스템이 URL을 `/dashboard?status=의뢰`로 `router.replace` (history push 아님)
4. "진행" 버튼으로 Tab 또는 마우스 이동, 클릭
5. URL이 `/dashboard?status=의뢰,진행`으로 변경
6. (선택) "의뢰" 버튼 다시 클릭하여 토글 해제 → URL `/dashboard?status=진행`

### Then

- ✅ Step 3 직후, "의뢰" 버튼의 `aria-pressed="true"`, 다른 4 버튼은 `"false"`
- ✅ Step 3 직후, 칸반 보드의 "의뢰" 컬럼만 full opacity, 나머지 4컬럼은 `opacity-40` (또는 디자인 토큰의 dim 값)
- ✅ Step 5 직후, "의뢰" + "진행" 두 버튼 모두 `aria-pressed="true"`
- ✅ Step 5 직후, "의뢰" + "진행" 컬럼만 full opacity, "강사매칭" / "컨펌" / "정산" 3컬럼이 dim
- ✅ Step 6 직후, "진행"만 `aria-pressed="true"` + URL `/dashboard?status=진행`
- ✅ 모든 클릭에 대해 `router.push`가 아닌 `router.replace` 사용 (브라우저 뒤로가기로 필터 미해제 검증: 4번의 클릭 후 뒤로가기 누르면 `/dashboard` 이전 페이지로 이동, 필터 단계 복원 X)
- ✅ Tab 순서가 의뢰 → 강사매칭 → 컨펌 → 진행 → 정산 (왼→오)
- ✅ Focus ring이 SPEC-LAYOUT-001 토큰의 2px outline으로 정확히 표시
- ✅ 비활성화된 컬럼은 DOM에서 제거되지 않음 (CSS opacity만, REQ-DASH-FILTER-004)
- ✅ 의도적으로 URL을 `/dashboard?status=알수없는값`으로 직접 입력 → 모든 필터 비활성, 5컬럼 full opacity (silently ignored, REQ-DASH-FILTER-006)
- ✅ 의도적으로 URL을 `/dashboard?status=의뢰,알수없는값,진행`으로 입력 → 의뢰 + 진행만 활성, 나머지 무시

---

## 시나리오 3 — 칸반 카드 상태 전환 (Server Action + revalidate)

**대응 EARS:** REQ-DASH-TRANSITION-001, -002, -003, -005, REQ-DASH-DATA-003, REQ-DASH-A11Y-006

### Given

- Operator 로그인
- 시드 데이터에 `(id=PROJ-A, status='의뢰', title='K8s 입문 과정')` 프로젝트 존재
- 현재 화면: `/dashboard`
- "의뢰" 컬럼에 PROJ-A 카드가 노출되며 카드에 "강사매칭으로" 버튼 표시

### When

1. Operator가 PROJ-A 카드의 "강사매칭으로" 버튼을 클릭
2. 클라이언트 측에서 버튼이 disabled + spinner 표시 (낙관 UI)
3. Server Action `transitionProjectStatusAction('PROJ-A', '의뢰', '강사매칭')` 호출
4. 서버에서 `requireRole(['operator','admin'])` 통과
5. `transitionProjectStatus` 도메인 함수가 `UPDATE projects SET status='강사매칭' WHERE id='PROJ-A' AND status='의뢰'` 실행
6. 영향받은 row 수가 1 → 성공 처리
7. `revalidatePath('/dashboard')` 호출
8. 응답이 클라이언트로 돌아오고 페이지가 자동으로 최신 데이터로 재렌더

### Then

- ✅ Step 2 동안 버튼이 disabled + spinner 노출
- ✅ Step 6 후 PROJ-A 카드가 "의뢰" 컬럼에서 사라지고 "강사매칭" 컬럼에 노출
- ✅ PROJ-A 카드의 새 다음 상태 버튼 라벨이 `"컨펌으로"`로 변경
- ✅ DB의 `projects.status`가 `'강사매칭'`으로 영구 변경
- ✅ DB의 `projects.status_changed_at`(또는 동등 컬럼)이 현재 시각으로 갱신
- ✅ 화면 어딘가의 `role="status"` 라이브 영역이 `"PROJ-A이(가) 강사매칭 단계로 이동했습니다."` 같은 한국어 메시지를 announce (스크린리더 시뮬레이션)
- ✅ 다른 카드 / KPI 값은 정상적으로 함께 갱신 (KPI "의뢰 건수"가 1 감소, "배정확정 건수"는 그대로)
- ✅ 브라우저 URL은 변경되지 않음 (`/dashboard` 유지)

---

## 시나리오 4 — 동시성 충돌 (두 사용자가 같은 카드 동시 전환)

**대응 EARS:** REQ-DASH-TRANSITION-001, -004, REQ-DASH-A11Y-006

### Given

- Operator A와 Operator B가 각각 별도 브라우저로 `/dashboard`에 접속
- 둘 다 PROJ-A 카드를 보고 있고, 현재 상태 `'의뢰'`
- A가 "강사매칭으로" 버튼을 클릭하기 직전, B도 동일 버튼을 클릭하려는 상태

### When

1. A가 클릭 → Server Action 시작 → `UPDATE` 실행 → 1 row affected → 성공
2. (거의 동시에) B가 클릭 → Server Action 시작 → `UPDATE projects SET status='강사매칭' WHERE id='PROJ-A' AND status='의뢰'` 실행
3. B의 UPDATE는 0 row affected (이미 status가 '강사매칭'으로 바뀜)
4. B의 도메인 함수가 `{ ok: false, reason: 'concurrent_modified' }` 반환

### Then

- ✅ A의 화면: 시나리오 3의 Then과 동일 (정상 전환)
- ✅ B의 화면: 토스트 또는 inline 메시지로 `"다른 사용자가 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요."` 한국어 메시지 노출
- ✅ B의 화면에서 PROJ-A 카드는 변경 없이 그대로 (revalidatePath 호출 안 됨, 또는 호출되어도 새로 fetch한 데이터 기준 '강사매칭'으로 자동 이동)
- ✅ B의 메시지는 `role="alert"` 라이브 영역으로 announce
- ✅ DB는 한 번만 변경됨 (`updated_at`이 A의 클릭 시각만 기록)

---

## 시나리오 5 — 잘못된 상태 전환 시도 (skip / 역방향)

**대응 EARS:** REQ-DASH-TRANSITION-002, -005, REQ-DASH-A11Y-006

### Given

- Operator 로그인
- PROJ-B의 현재 상태 `'의뢰'`
- 정상 칸반 UI는 "강사매칭으로" 버튼만 노출하므로, 본 시나리오는 의도된 우회(API 직접 호출 또는 DevTools 폼 변조)를 가정

### When (5-A: skip 시도)

1. (악의적) Operator가 DevTools로 hidden form / fetch를 변조하여 `transitionProjectStatusAction('PROJ-B', '의뢰', '진행')` 호출 (강사매칭 / 컨펌 단계 skip)

### When (5-B: 역방향 시도)

1. PROJ-C가 `'진행'` 상태일 때, 우회 호출로 `transitionProjectStatusAction('PROJ-C', '진행', '의뢰')` 호출

### Then (5-A, 5-B 모두)

- ✅ Server Action이 `canTransition`에서 거부 → `{ ok: false, message: '허용되지 않는 상태 전환입니다.' }` 반환
- ✅ DB에 변경 없음 (UPDATE 미실행)
- ✅ 화면에 토스트 또는 `role="alert"` 영역으로 한국어 메시지 노출
- ✅ DB의 `projects.status`는 변경 전 값 유지

---

## 시나리오 6 — 강사 일정 캘린더 페이지 동작

**대응 EARS:** REQ-DASH-CALENDAR-001, -002, -003, -004, -005, -006, -008, REQ-DASH-A11Y-004, -007

### Given

- Operator 로그인
- 시드: 5명 강사가 향후 30일 내 8개 강의 일정(컨펌 / 진행 상태)
- 현재 화면: `/dashboard`

### When

1. Operator가 "강사 일정 보기" 링크 클릭 → `/dashboard/calendar` navigate
2. 페이지 로드 시 `loading.tsx` skeleton 후 `<InstructorCalendar>` 렌더
3. 기본 view는 "월"
4. Operator가 "주" 토글 버튼 클릭 → view가 주간으로 전환
5. 한 이벤트(강사1의 강의)를 클릭

### Then

- ✅ Step 2: 캘린더가 현재 월의 8개 이벤트를 모두 표시 (강사 5명 × 평균 1.6건)
- ✅ 각 이벤트는 강사 이름 + 프로젝트 제목 텍스트 노출 + 강사 고유 색상 (8색 팔레트)
- ✅ 동일 강사의 다른 이벤트는 동일 색상 (deterministic hashing)
- ✅ 6명 이상이라도 8색 사이클 (REQ-DASH-CALENDAR-007), 충돌은 정상 동작으로 간주
- ✅ 시간 표시가 모두 KST (예: `오전 10:00 - 오후 12:00`), UTC offset (`+09:00`) 미노출
- ✅ Step 4: view가 주간으로 변경, 같은 이벤트가 주간 그리드에 노출
- ✅ Step 5: tooltip 또는 toast로 `"강사1 - K8s 입문 과정 (2026-05-10 09:00 ~ 12:00 KST)"` 형식 노출
- ✅ tooltip/toast 클릭 후 다른 페이지로 navigate 발생하지 않음 (SPEC-SCHED-001 위임)
- ✅ "대시보드로 돌아가기" 링크 → `/dashboard` navigate
- ✅ 빈 기간(향후 1년 후 등)으로 navigate 시 `"이 기간에 배정된 강의가 없습니다."` 오버레이 노출
- ✅ axe DevTools `/dashboard/calendar` critical 0건
- ✅ 모든 이벤트가 색상뿐만 아니라 시각 텍스트로도 강사명 노출 (REQ-DASH-A11Y-004)

---

## 시나리오 7 — 칸반 빈 상태 / 알림 미리보기 / 데이터 갱신 주기

**대응 EARS:** REQ-DASH-KANBAN-006, REQ-DASH-NOTIFY-002, -004, REQ-DASH-DATA-002, REQ-DASH-STATE-001, -003, -004

### Given

- 깨끗한 DB (시드 미적용 또는 모든 프로젝트 삭제)
- Operator 로그인
- SPEC-NOTIF-001 미구현 → `getNotificationPreview` placeholder 동작

### When

1. Operator가 `/dashboard` 접속
2. 페이지 로드 → 모든 KPI 값 = 0 또는 미정산 합계 = `₩0`
3. 칸반 보드: 5컬럼 모두 비어있음
4. 알림 미리보기: 0/0/0
5. 30초간 페이지 활성화 유지
6. (다른 탭에서) 누군가 `INSERT` 1건 추가
7. 30초 경과 후 페이지가 background revalidate

### Then

- ✅ Step 2: KPI 4 카드 모두 `0건` 또는 `₩0` 노출 (`'—'`이 아닌 정상 0값, REQ-DASH-KPI-006)
- ✅ Step 3: 5 컬럼 모두 `<EmptyState>` 컴포넌트 노출, 메시지 `"이 상태의 프로젝트가 없습니다."`, `role="status"`
- ✅ Step 3: 5컬럼이 모두 렌더됨 (단일 "데이터 없음" 오버레이가 칸반 영역 전체를 덮지 않음, REQ-DASH-STATE-004)
- ✅ Step 4: 알림 미리보기 카드 0/0/0 + helper text `"알림 시스템 활성화 후 사용 가능합니다."`
- ✅ Step 7: 다음 페이지 요청 (탭 포커스 시 또는 navigation 시) 데이터가 fresh로 갱신 → 새 프로젝트 카드 노출 (revalidate=30s 동작 검증)
- ✅ 페이지에 `loading.tsx` skeleton이 첫 paint에서 잠시 노출됨

---

## 시나리오 8 — 데이터 로드 실패 / 에러 boundary

**대응 EARS:** REQ-DASH-STATE-002, -003, REQ-DASH-KANBAN-007

### Given

- Operator 로그인
- 의도적으로 DB 연결 실패 시뮬레이션 (예: Supabase 일시 차단 또는 mock으로 throw)

### When

1. `/dashboard` 접근
2. `getKpiSummary` 또는 `getProjectsByStatus`가 throw

### Then

- ✅ `error.tsx` boundary가 발동, 화면에 한국어 안내 노출:
  - 제목: `"대시보드를 불러오지 못했습니다."`
  - 본문: 일반화된 메시지 (raw error stack / supabase 에러 코드 미노출)
  - "다시 시도" 버튼이 `reset()` 호출
- ✅ DevTools Network 탭에 supabase 응답 본문이 그대로 화면에 노출되지 않음
- ✅ 사용자가 "다시 시도" 클릭 → 페이지 재시도 → 일시 장애 해소 시 정상 복원
- ✅ 동일 시뮬레이션을 `/dashboard/calendar`에 적용 시 동일한 에러 boundary 동작
- ✅ KPI만 실패하고 칸반은 정상 (부분 실패) 시나리오는 ErrorState 컴포넌트로 KPI 영역만 dim 처리 + `role="alert"` (REQ-DASH-STATE-003)

---

## 추가 검증 (Edge Cases & Quality Gates)

### EC-1 — Instructor 토큰으로 `/dashboard` 접근 시 silent redirect

- **Given**: Instructor 토큰으로 로그인
- **When**: 브라우저 URL을 `/dashboard`로 입력
- **Then**: SPEC-AUTH-001 `(operator)/layout.tsx` 가드가 `/me/dashboard`로 silent redirect (HTTP 307). 본 SPEC의 코드 변경 0건. 시나리오 5 of SPEC-AUTH-001 acceptance.md와 일관 동작.

### EC-2 — Admin 토큰으로 `/dashboard` 접근 시 동일 view

- **Given**: Admin 토큰 로그인
- **When**: `/dashboard` 접근
- **Then**: Operator와 동일한 KPI / 칸반 / 알림 / 캘린더 링크 노출. RLS는 admin도 SELECT all 허용. 데이터 차이 없음.

### EC-3 — KPI 단일 SQL aggregate 검증

- **Given**: Operator 로그인 + Drizzle query log 활성화
- **When**: `/dashboard` 1회 접근
- **Then**: KPI 4 카드 데이터를 위해 실행된 SELECT 쿼리가 정확히 1건 (다중 호출 0건 검증, REQ-DASH-KPI-002)

### EC-4 — 칸반 컬럼 100건 LIMIT 검증

- **Given**: 시드에 `의뢰` 상태 프로젝트 150건 강제 INSERT
- **When**: `/dashboard` 접근
- **Then**: "의뢰" 컬럼에 100개 카드 노출 + 컬럼 footer에 "100+개 — 전체 보기" 링크. 링크 클릭 → `/projects?status=의뢰` (404 허용, SPEC-PROJECT-001 미구현).

### EC-5 — 한국어 라벨 / 메시지 통일

- **Given**: 페이지 전체
- **When**: KPI / 필터 / 칸반 / 알림 / 빈 상태 / 에러 메시지 라벨 검사
- **Then**: 모든 사용자 노출 텍스트가 한국어. 영문 노출 0건 (단, 비밀번호 등 기술 식별자 제외).

### EC-6 — 한국어 KRW 포맷 검증

- **Given**: KPI "미정산 합계" 카드
- **When**: 시드 미정산 합계 = `12,400,000`원
- **Then**: 카드 표시 `₩12,400,000` (천 단위 콤마, 통화 기호 ₩, `원` 글자 미사용 — `Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })` 표준 출력)

### EC-7 — Asia/Seoul 타임존 검증

- **Given**: 시드 schedule 1건이 UTC `2026-05-10T01:00:00Z` (KST `2026-05-10 10:00`)
- **When**: 캘린더 페이지에서 해당 이벤트 시각 확인
- **Then**: 캘린더에 `오전 10:00` 또는 `10:00 KST` 표시 (UTC offset 미노출)

### EC-8 — 강사 색상 결정성 검증

- **Given**: 강사 ID `'instr-1'`
- **When**: 두 번 다른 세션에서 `colorForInstructor('instr-1')` 호출
- **Then**: 동일 색상 반환 (예: 항상 `#3B82F6`). DOM에서 같은 강사의 이벤트가 같은 색.

### EC-9 — `revalidate = 30` 검증

- **Given**: Operator가 `/dashboard` 접속, KPI = 3
- **When**:
  1. 다른 탭에서 DB UPDATE로 의뢰 건수 +1
  2. 30초 미만 대기 후 같은 탭 새로고침 → ISR 캐시 hit, KPI 여전히 3
  3. 31초 경과 후 새로고침 → 캐시 만료, 4로 갱신
- **Then**: 30초 캐시 동작 확인

### EC-10 — Server Action 후 revalidatePath 즉시 반영

- **Given**: Operator가 `/dashboard` 접속, KPI 의뢰 건수 = 3
- **When**: 칸반에서 의뢰 카드 1건을 강사매칭으로 전환 → Server Action 후 페이지 자동 재렌더
- **Then**: 30초 대기 없이 즉시 KPI 의뢰 = 2, 강사매칭 컬럼 카드 +1 (revalidate path 즉시 동작, REQ-DASH-DATA-003)

### EC-11 — 알림 미리보기 placeholder 시그니처 lock

- **Given**: `src/lib/dashboard/queries.ts` 와 `src/lib/dashboard/types.ts`
- **When**: SPEC-NOTIF-001 구현 가정으로 `getNotificationPreview` 함수 body만 교체 시도
- **Then**: 함수 시그니처(`(operatorId: string) => Promise<NotificationPreview>`) 변경 없이 호출처(`<NotificationPreview>` 컴포넌트) 0 건 변경 가능. `NotificationPreview` 타입은 단일 출처에서 export됨.

### EC-12 — `STATUS_COLUMN_MAP` 단일 출처 검증

- **Given**: codebase
- **When**: `grep -rn "'의뢰'\\|'강사매칭'\\|'컨펌'\\|'진행'\\|'정산'" src/components/dashboard src/lib/dashboard src/app/(operator)/dashboard`
- **Then**: 한국어 enum 값이 SQL/UI 양쪽에 하드코딩된 위치는 `src/lib/dashboard/types.ts` 단일 파일에만 존재. UI / queries는 모두 `STATUS_COLUMN_MAP` 또는 그 키만 import. (테스트 파일은 예외 허용.)

### EC-13 — `next-param.ts` open redirect 가드와의 상호작용

- **Given**: 미인증 상태
- **When**: `/login?next=%2Fdashboard%3Fstatus%3D의뢰` 으로 접근, operator 로그인
- **Then**: SPEC-AUTH-001 `next-param` 가드가 `?status=...` 보존하여 `/dashboard?status=의뢰`로 redirect (operator role-allowed). 칸반 첫 렌더가 "의뢰" 필터 활성 상태.

### EC-14 — 키보드 only 전체 흐름 검증

- **Given**: 마우스 미사용
- **When**: Tab 시작
- **Then**:
  - Tab 1-4: KPI 카드 4개 (link인 3개는 focusable)
  - Tab 5-9: 상태 필터 5 버튼
  - Tab 10: 알림 미리보기 첫 라인
  - Tab 11: "강사 일정 보기" 링크
  - Tab 12+: 칸반 카드 (왼→오, 위→아래)
  - Enter: 각 요소 활성화
  - Esc: 모달 없음으로 미사용

### EC-15 — Lighthouse / axe / LCP

- **Given**: production build (`pnpm build && pnpm start`)
- **When**: Chrome DevTools Lighthouse `/dashboard` + `/dashboard/calendar` 측정
- **Then**:
  - axe DevTools critical 0, serious 0
  - Lighthouse Accessibility ≥ 95 (2 페이지 평균)
  - LCP `/dashboard` < 2.5초
  - Performance score ≥ 80

---

## 품질 게이트 (Quality Gates)

본 SPEC이 `status: completed`로 전환되기 위한 자동 검증:

| 게이트 | 명령 또는 도구 | 통과 기준 |
|--------|---------------|----------|
| Build | `pnpm build` | 0 error, 0 critical warning |
| Type | `pnpm tsc --noEmit` | 0 error |
| Lint | `pnpm exec eslint .` | 0 critical |
| 단위 테스트 | `pnpm vitest run dashboard/` | 모두 PASS |
| 통합 테스트 | `pnpm vitest run dashboard/integration` (테스트 DB 필요) | 모두 PASS |
| KPI 단일 쿼리 | Drizzle query log | KPI 페이지 SELECT 호출 1건 |
| Accessibility (axe) | `/dashboard`, `/dashboard/calendar` | critical 0, serious 0 |
| Lighthouse Accessibility | 2개 페이지 | 평균 ≥ 95 |
| LCP | Chrome DevTools or Lighthouse | `/dashboard` < 2.5s |
| 시나리오 | 본 문서 시나리오 1-8 | 모두 PASS |
| Edge cases | EC-1 ~ EC-15 | 모두 PASS |
| 단일 출처 검증 | `grep -rn "'의뢰'\|..." ...` | `types.ts` 외 0 hit (테스트 제외) |

---

## Definition of Done (인수 기준)

본 SPEC은 다음을 모두 만족할 때 사용자가 `/moai sync SPEC-DASHBOARD-001`을 실행할 수 있다:

- [ ] plan.md §6의 DoD 20개 항목 모두 ✓
- [ ] 본 acceptance.md의 시나리오 1-8 모두 PASS
- [ ] 본 acceptance.md의 EC-1 ~ EC-15 모두 PASS
- [ ] 품질 게이트 표의 모든 항목 통과
- [ ] `.moai/specs/SPEC-DASHBOARD-001/spec.md`의 `status` 필드를 `draft` → `completed`로 변경
- [ ] `.moai/specs/SPEC-DASHBOARD-001/spec.md`의 `updated` 필드를 완료 일자로 갱신
- [ ] HISTORY 항목에 완료 시점 entry 추가
- [ ] M6 spike 결과가 plan.md "Spike 결과" 섹션에 기록됨
- [ ] SPEC-NOTIF-001 / SPEC-PROJECT-001 / SPEC-SCHED-001 핸드오프 가이드가 `.moai/docs/dashboard-architecture.md`에 작성됨

---

_End of SPEC-DASHBOARD-001 acceptance.md_
