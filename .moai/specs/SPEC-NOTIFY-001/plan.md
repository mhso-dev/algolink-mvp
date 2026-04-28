# SPEC-NOTIFY-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 본 SPEC은 `quality.development_mode: tdd`(추정)에 따라 manager-tdd 에이전트가 RED-GREEN-REFACTOR 사이클로 진행한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 (`status: completed`) — `notifications` 테이블, `notification_type` ENUM 5종 + `assignment_request`, RLS 4종 정책, 인덱스 3종 (`idx_notifications_recipient`, `idx_notifications_recipient_unread`, `idx_notifications_created_at`)
- ✅ SPEC-AUTH-001 (`status: completed`) — `getCurrentUser()`, `requireUser()`, server-side Supabase client (`@/utils/supabase/server`)
- ✅ SPEC-LAYOUT-001 (`status: implemented`) — `<AppShell>` 헤더 슬롯, UI 프리미티브 (Popover/DropdownMenu/Badge), 디자인 토큰
- ✅ SPEC-PROJECT-001 (`status: completed`) — `assignInstructorAction`, `assignment_request` enum, 콘솔 로그 형식
- ✅ SPEC-PAYOUT-001 (`status: completed`) — `mail-stub.ts` (`NOTIF_LOG_PREFIX = '[notif]'` 상수, `LOG_RE` 회귀 테스트)
- ✅ SPEC-ME-001 (`status: completed`) — `addScheduleItemAction`
- ✅ Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩
- ✅ `.env.local` Supabase 환경변수

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (마이그레이션 + 타입 + 상수 + label) → 모든 후속 마일스톤의 선행
- M2 (emit 헬퍼 + queries + dedup) → M3·M4·M5의 선행
- M3 (4종 트리거 모듈) → M4 (도메인 통합)·M6 (테스트)의 선행
- M4 (기존 도메인 emit 통합 + 트리거 호출) → M5·M6의 선행
- M5 (UI 컴포넌트 + 페이지) → M6 (통합 테스트)의 선행
- M6 (테스트 + 회귀 검증) — 마지막
- M7 (접근성 + Lighthouse) [Priority: Medium]

### 1.3 후속 SPEC을 위한 산출물 약속

- `emitNotification(supabase, payload)`은 SPEC-EMAIL-001이 동일 시그니처 + 메일 어댑터 chain
- `src/lib/notifications/triggers/` 모듈은 SPEC-CRON-001이 `pg_cron` / Edge Function에서 import
- `NOTIFICATION_TYPE_LABEL` 상수는 SPEC-NOTIFY-PREFERENCE-XXX이 채택
- `[notif] <type> → <context>` 로그 형식은 모든 후속 알림 발신자가 준수
- `<NotificationBell>` 컴포넌트는 SPEC-LAYOUT-001 후속 헤더 변경에서도 동일 위치 유지

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 타입 + 상수 + label + (선택)마이그레이션 [Priority: High]

**산출물:**

- `src/lib/notifications/types.ts`:
  ```ts
  export type NotificationType =
    | "assignment_request"
    | "assignment_overdue"
    | "schedule_conflict"
    | "low_satisfaction_assignment"
    | "dday_unprocessed"
    | "settlement_requested";

  export interface NotificationRow {
    id: string;
    recipient_id: string;
    type: NotificationType;
    title: string;
    body: string | null;
    link_url: string | null;
    read_at: string | null;
    created_at: string;
  }

  export type ReadFilter = "all" | "unread" | "read";
  ```

- `src/lib/notifications/constants.ts`:
  ```ts
  export const NOTIF_LOG_PREFIX = "[notif]";
  export const NOTIFICATION_PAGE_SIZE = 20;
  export const DROPDOWN_LIMIT = 10;
  export const DEDUP_WINDOW_HOURS = 24;
  export const TRIGGER_RATE_LIMIT_MINUTES = 5;

  export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
    assignment_request: "배정 요청",
    assignment_overdue: "배정 지연",
    schedule_conflict: "일정 충돌",
    low_satisfaction_assignment: "만족도 경고",
    dday_unprocessed: "D-Day 미처리",
    settlement_requested: "정산 요청",
  };

  export const NOTIFICATION_TYPE_BADGE_COLOR: Record<NotificationType, string> = {
    assignment_request: "bg-blue-100 text-blue-800",
    assignment_overdue: "bg-amber-100 text-amber-800",
    schedule_conflict: "bg-red-100 text-red-800",
    low_satisfaction_assignment: "bg-orange-100 text-orange-800",
    dday_unprocessed: "bg-purple-100 text-purple-800",
    settlement_requested: "bg-emerald-100 text-emerald-800",
  };
  ```

- `src/lib/notifications/errors.ts`:
  ```ts
  export const NOTIFY_ERRORS = {
    VALIDATION: "알림 페이로드 검증 실패",
    DUPLICATE: "중복 알림 (24h 내 발행됨)",
    RLS: "권한 거부",
    DB_INSERT: "알림 저장 실패",
    UNAUTHORIZED: "인증이 필요합니다.",
  } as const;
  ```

- `src/lib/notifications/index.ts` — barrel export

- (선택) 마이그레이션 `supabase/migrations/20260428200000_notifications_helper_indexes.sql`:
  - `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_created ON notifications (recipient_id, type, created_at DESC);`
  - 실측 후 도입 결정 (M6의 트리거 dedup 쿼리 EXPLAIN 결과로 판단)

**검증:**

- `pnpm tsc --noEmit` 0 type 에러
- (마이그레이션 도입 시) `npx supabase db reset` 무오류 + `\d notifications` 인덱스 확인

**연관 EARS:** REQ-NOTIFY-EMIT-001~004, REQ-NOTIFY-LIST-002, REQ-NOTIFY-A11Y-001

---

### M2 — emit 헬퍼 + queries + dedup (RED → GREEN → REFACTOR) [Priority: High]

**TDD 사이클: RED — 실패하는 테스트 먼저 작성**

**산출물 (테스트 먼저):**

- `src/lib/notifications/__tests__/emit.test.ts`:
  - `emitNotification`: 정상 케이스 — `notifications` INSERT + 콘솔 로그 1줄 + `{ ok: true, id }` 반환
  - 잘못된 `recipientId`(uuid 아님) → `{ ok: false, reason: 'validation' }`, INSERT 시도 없음
  - 잘못된 `type` → `{ ok: false, reason: 'validation' }`
  - `title.length > 200` → validation 실패
  - `linkUrl`이 `/`로 시작 안 함 → validation 실패
  - `dedupKey` 제공 + 24h 내 동일 `(recipient_id, type, link_url)` 존재 → `{ ok: false, reason: 'duplicate' }`, INSERT 시도 없음
  - DB INSERT 실패 (RLS deny code `42501`) → `{ ok: false, reason: 'rls' }` + `console.error` 호출
  - DB INSERT 실패 (기타 에러) → `{ ok: false, reason: 'db' }`
  - `logContext` 제공 → 콘솔 로그가 `[notif] <type> → <logContext>` 형식
  - `logContext` 미제공 → 콘솔 로그가 `[notif] <type> → recipient_id=<uuid>` 형식

- `src/lib/notifications/__tests__/queries.test.ts`:
  - `listNotifications`: 페이지네이션 정확 (page=1 → 0~19, page=2 → 20~39)
  - `listNotifications` with `types: ['assignment_request']` 필터 → 해당 타입만 반환
  - `listNotifications` with `read: 'unread'` → `read_at IS NULL`만
  - `listNotifications` with `read: 'read'` → `read_at IS NOT NULL`만
  - `getUnreadCount(userId)` → 정확한 count 반환
  - `getRecentNotifications(userId, 10)` → 최신 10건, `created_at DESC` 정렬
  - `markRead(notificationId)` → `read_at = now()` 설정, 이미 read인 경우 no-op
  - `markAllRead(userId)` → 본인 모든 unread → read 일괄, 영향받은 row 수 반환

- `src/lib/notifications/__tests__/dedup.test.ts`:
  - `hasRecentDuplicate` 24h 내 동일 키 → true
  - 24h 외 → false
  - `linkUrl` 미제공 시 (recipient_id, type)만으로 검사

- `src/lib/notifications/__tests__/list-query.test.ts`:
  - URL 파싱: `?page=2&type=assignment_request,schedule_conflict&read=unread` → 정상 파싱
  - 잘못된 `type` 값 무시 (필터에서 제외)
  - 잘못된 `page` (음수, 비숫자) → 1로 fallback

**TDD 사이클: GREEN — 테스트 통과시키는 최소 구현**

**산출물 (구현):**

- `src/lib/notifications/validation.ts` — `emitPayloadSchema`, `listFiltersSchema`
- `src/lib/notifications/emit.ts` — `emitNotification` 함수 (spec.md §5.1 참고)
- `src/lib/notifications/dedup.ts` — `hasRecentDuplicate` 함수 (spec.md §5.2 참고)
- `src/lib/notifications/queries.ts`:
  ```ts
  export async function listNotifications(supabase, opts): Promise<{ items: NotificationRow[]; total: number }>
  export async function getNotificationById(supabase, id): Promise<NotificationRow | null>
  export async function markRead(supabase, id): Promise<{ ok: boolean }>
  export async function markAllRead(supabase, userId): Promise<{ ok: boolean; count: number }>
  export async function getUnreadCount(supabase, userId): Promise<number>
  export async function getRecentNotifications(supabase, userId, limit?): Promise<NotificationRow[]>
  ```
- `src/lib/notifications/list-query.ts` — URL searchParams → `ListFilters` 파싱

**TDD 사이클: REFACTOR — 중복 제거, 가독성 개선**

- emit/queries 공통 supabase mock 패턴을 `__tests__/_helpers.ts`로 추출
- 에러 메시지를 `errors.ts`로 통일
- `LOG_RE` 정규식을 export하여 후속 회귀 테스트에서 재사용

**검증:**

- `pnpm vitest run src/lib/notifications/__tests__` — 모든 테스트 PASS
- `pnpm vitest --coverage src/lib/notifications` — 라인 커버리지 ≥ 85%
- `pnpm tsc --noEmit` 0 type 에러

**연관 EARS:** REQ-NOTIFY-EMIT-001~007, REQ-NOTIFY-QUERY-001~006

---

### M3 — 4종 트리거 모듈 (RED → GREEN → REFACTOR) [Priority: High]

**TDD 사이클: RED**

**산출물 (테스트 먼저):**

- `src/lib/notifications/__tests__/triggers/assignment-overdue.test.ts`:
  - 24h 미경과 프로젝트 → emit 0건
  - 24h 경과 + `status = 'assignment_review'` 프로젝트 → emit 1건 (operator에게)
  - 24h 경과 but `status = 'assignment_confirmed'` (응답 완료) → emit 0건
  - 동일 프로젝트 24h 내 이미 `assignment_overdue` 알림 발행 → dedup으로 skip
  - 여러 프로젝트 동시 → 각각 emit

- `src/lib/notifications/__tests__/triggers/schedule-conflict.test.ts`:
  - 강사 일정 신규 등록 + 동일 강사 기존 일정과 시간 겹침 → emit 1건 (operator에게)
  - 시간 겹치지 않음 → emit 0건
  - 강사가 활성 프로젝트 미배정 → emit 0건 (recipient 없음)
  - 동일 instructor + 동일 시작일 24h 내 dedup

- `src/lib/notifications/__tests__/triggers/low-satisfaction.test.ts`:
  - 평균 만족도 2.5 (< 3.0), 리뷰 5건 → emit 1건 (operator 본인에게 경고)
  - 평균 3.5 → emit 0건
  - 리뷰 0건 → emit 0건 (prior 적용 안 함)
  - 동일 (operator, project) 24h 내 dedup

- `src/lib/notifications/__tests__/triggers/dday-unprocessed.test.ts`:
  - `settlements WHERE status='requested' AND requested_at < now() - 7 days` 1건 → emit 1건
  - `projects WHERE status='proposal' AND created_at < now() - 7 days` 1건 → emit 1건
  - 둘 다 해당 → emit 2건
  - 같은 entity 24h 내 dedup

**TDD 사이클: GREEN**

**산출물 (구현):**

- `src/lib/notifications/triggers/types.ts`:
  ```ts
  export type EmitResult = { ok: true; id: string } | { ok: false; reason: string };
  ```
- `src/lib/notifications/triggers/assignment-overdue.ts`:
  ```ts
  export async function checkAssignmentOverdue(
    supabase: SupabaseClient,
    opts?: { hoursThreshold?: number },
  ): Promise<EmitResult[]>
  ```
- `src/lib/notifications/triggers/schedule-conflict.ts`:
  ```ts
  export async function checkScheduleConflict(
    supabase: SupabaseClient,
    instructorId: string,
    range: { start: string; end: string },
  ): Promise<EmitResult | null>
  ```
- `src/lib/notifications/triggers/low-satisfaction.ts`:
  ```ts
  export async function checkLowSatisfaction(
    supabase: SupabaseClient,
    instructorId: string,
    operatorId: string,
    projectId: string,
    threshold?: number,
  ): Promise<EmitResult | null>
  ```
- `src/lib/notifications/triggers/dday-unprocessed.ts`:
  ```ts
  export async function checkDdayUnprocessed(
    supabase: SupabaseClient,
    opts?: { settlementDays?: number; projectDays?: number },
  ): Promise<EmitResult[]>
  ```
- `src/lib/notifications/triggers/index.ts` — barrel export
- `src/lib/notifications/triggers/rate-limit.ts` — `shouldRunCheck(userId, scope, minutes)` in-memory Map 기반

**TDD 사이클: REFACTOR**

- 4종 트리거의 공통 패턴(query → emit → 결과 집계)을 `runTrigger(supabase, queryFn, emitFn)` 헬퍼로 추출
- 쿼리 SQL은 view로 분리 검토 (M1 마이그레이션에 추가 가능)

**검증:**

- `pnpm vitest run src/lib/notifications/__tests__/triggers` — 모든 PASS
- `pnpm vitest --coverage src/lib/notifications/triggers` — 라인 커버리지 ≥ 85%
- 모든 트리거가 emit 헬퍼 100% 사용 (직접 INSERT 0건)

**연관 EARS:** REQ-NOTIFY-TRIGGER-001~009

---

### M4 — 기존 도메인 emit 통합 + 트리거 호출 [Priority: High]

**원칙 (LESSON-002 준수):**
- 기존 도메인 코드 변경은 emit 호출 1~2줄 + 트리거 호출 1~2줄 = **총 2~4줄/지점**
- 콘솔 로그 형식은 비트 단위 보존 (회귀 테스트로 강제)
- 트리거 실패는 silent (parent action 중단 금지)

**산출물:**

#### 4.1 `src/lib/payouts/mail-stub.ts` — emit 통합

**BEFORE:** `notifications.insert(...)` 직접 호출 + 별도 `console.log`
**AFTER:** `emitNotification({ ..., logContext: \`instructor_id=... settlement_id=...\` })` 호출

변경 범위: 약 15줄 → 8줄 (감소). 회귀 테스트:
- `src/lib/payouts/__tests__/mail-stub.test.ts`의 `LOG_RE` 정규식 PASS 유지
- 모든 케이스(정상/실패) PASS

#### 4.2 `src/app/(app)/(operator)/projects/[id]/actions.ts` — emit 통합 + 트리거 호출

**BEFORE:** `actions.ts:325-358`의 `notifications.insert` 직접 호출 + 보상 롤백 로직 + `console.log`
**AFTER:**
```ts
// 기존 emit 통합
const notif = await emitNotification(supabase, {
  recipientId: instructor.user_id,
  type: "assignment_request",
  title: `[배정 요청] ${project.title}`,
  body: `프로젝트: ${project.title}\n시작: ${project.education_start_at ?? "-"}\n종료: ${project.education_end_at ?? "-"}`,
  linkUrl: "/me",
  logContext: `instructor_id=${input.instructorId} project_id=${input.projectId} rank=${acceptedRank ?? "force"}`,
});
if (!notif.ok) {
  // 보상 롤백 (기존 로직 유지)
  await rollback();
  return { ok: false, message: PROJECT_ERRORS.ASSIGN_FAILED_GENERIC };
}

// 신규 트리거 호출 (silent failure)
try {
  await checkLowSatisfaction(supabase, input.instructorId, currentUser.id, input.projectId);
  if (project.education_start_at && project.education_end_at) {
    await checkScheduleConflict(supabase, input.instructorId, {
      start: project.education_start_at,
      end: project.education_end_at,
    });
  }
} catch (e) {
  console.warn("[notify.trigger] post-assign trigger failed", e);
}
```

회귀 테스트:
- `src/app/(app)/(operator)/projects/__tests__/integration.test.ts`의 시나리오 4 PASS
- 콘솔 로그 형식 보존 검증 추가

#### 4.3 `src/app/(app)/(instructor)/me/schedule/actions.ts` — 트리거 호출 추가

**변경:** `addScheduleItemAction` 성공 직후 (insert/update 모두):
```ts
try {
  await checkScheduleConflict(supabase, instructorId, {
    start: r.data.startsAt,
    end: r.data.endsAt,
  });
} catch (e) {
  console.warn("[notify.trigger] schedule-conflict failed", e);
}
```

회귀 테스트:
- 기존 `me/schedule` 테스트 PASS 유지
- 신규: 충돌 시나리오에서 알림 emit 검증

#### 4.4 `src/lib/notifications/queries.ts` `getUnreadCount` — lazy 트리거 hook (선택)

**rate-limit 적용 후 호출:**
```ts
export async function getUnreadCount(supabase, userId, role?: string): Promise<number> {
  // (선택) 트리거 lazy 검사 — operator만, 5min cooldown
  if (role === "operator" && shouldRunCheck(userId, "operator-triggers", 5)) {
    Promise.allSettled([
      checkAssignmentOverdue(supabase),
      checkDdayUnprocessed(supabase),
    ]).then(results => {
      const ok = results.filter(r => r.status === "fulfilled").length;
      console.info(`[notify.trigger] lazy check ran (${ok}/${results.length} ok)`);
    });
  }
  // 카운트 쿼리는 즉시 실행 (트리거 결과 기다리지 않음)
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  return count ?? 0;
}
```

회귀 테스트:
- 5분 내 재호출 시 트리거 실행 안 함
- 트리거 실패 시 카운트 쿼리는 정상 응답

**검증:**

- `pnpm vitest run src/lib/payouts/__tests__/mail-stub.test.ts` PASS
- `pnpm vitest run src/app/(app)/(operator)/projects/__tests__` PASS
- `pnpm vitest run src/app/(app)/(instructor)/me/schedule/__tests__` PASS
- `pnpm tsc --noEmit` 0 에러
- `pnpm build` PASS
- 직접 `notifications.insert(...)` grep 결과 0건 (모든 호출이 `emitNotification` 경유)

**연관 EARS:** REQ-NOTIFY-EMIT-006, REQ-NOTIFY-EMIT-007, REQ-NOTIFY-TRIGGER-006

---

### M5 — UI 컴포넌트 + 페이지 [Priority: High]

**산출물:**

#### 5.1 헤더 종 아이콘 + dropdown

- `src/components/notification-center/NotificationBell.tsx` (서버 컴포넌트):
  - `getUnreadCount(supabase, currentUser.id, currentUser.role)` 호출
  - 종 아이콘 + 배지 렌더 (count > 0 시만 배지 표시, > 99는 "99+")
  - 클라이언트 trigger를 위해 `<NotificationDropdown>` 클라이언트 컴포넌트로 감싸기

- `src/components/notification-center/NotificationDropdown.tsx` (`'use client'`):
  - shadcn `<Popover>` 또는 `<DropdownMenu>` 기반
  - 클릭 시 `getRecentNotifications(supabase, userId, 10)` fetch (Server Action 또는 RSC 데이터 prop)
  - 최근 10건 + "모두 보기" 링크
  - ESC 키 / 외부 클릭 시 닫힘 (shadcn primitive 기본 동작)
  - `aria-expanded`, `aria-label="알림"` 적용

- `src/components/notification-center/NotificationItem.tsx`:
  - 단일 알림 카드: 타입 배지 + 제목 + 본문(2줄 truncate) + 상대 시간 + read 여부 표시
  - 클릭 시 `markReadAction(id)` Server Action + `link_url`로 `useRouter().push`
  - `aria-label`로 알림 컨텍스트 명시

- `src/components/notification-center/NotificationBadge.tsx`:
  - 단순 count 배지 (props: count, max=99)

#### 5.2 `<AppShell>` 통합

- `src/components/AppShell.tsx` (또는 `Header.tsx`)에 `<NotificationBell />` 삽입 (모든 role 공통)
- 기존 헤더 레이아웃 변경 최소화 (1~2줄)

#### 5.3 `/notifications` 전체 페이지 확장

- `src/app/(app)/notifications/page.tsx` (기존 placeholder 확장):
  - 서버 컴포넌트, `requireUser()` 가드
  - URL searchParams → `parseListFilters(searchParams)` (M2의 `list-query.ts`)
  - `listNotifications(supabase, { userId, ...filters, page, pageSize })` 호출
  - 빈 결과 → 기존 empty-state 카드 유지
  - 결과 → `<NotificationFiltersBar>` + `<NotificationList>` + `<Pagination>`
  - 우상단에 "모두 읽음" 버튼 (Server Action)

- `src/app/(app)/notifications/actions.ts`:
  - `markReadAction(id: string): Promise<void>` — `markRead` 호출 + revalidate
  - `markAllReadAction(): Promise<void>` — `markAllRead` 호출 + revalidate

- `src/components/notification-center/NotificationFiltersBar.tsx`:
  - 타입 multi-select (체크박스 6종) + 읽음 필터 토글 (3옵션 segment control)
  - URL 쿼리 동기화 (form GET 또는 `useRouter().push`)

- `src/components/notification-center/NotificationList.tsx`:
  - `<section role="list">` + 각 행을 `<article role="listitem">`으로
  - 비어있으면 empty-state

- `src/components/notification-center/Pagination.tsx`:
  - 기존 SPEC-PROJECT-001의 페이지네이션 패턴 재사용 검토

**검증:**

- Storybook 또는 dev 환경에서 모든 컴포넌트가 키보드만으로 조작 가능
- 종 아이콘 → Tab → Enter → dropdown 열림 → 화살표/Tab으로 이동 → Enter 활성화 → ESC 닫기
- 모든 컴포넌트가 SPEC-LAYOUT-001 디자인 토큰 사용

**연관 EARS:** REQ-NOTIFY-BELL-001~007, REQ-NOTIFY-LIST-001~008, REQ-NOTIFY-A11Y-001~005

---

### M6 — 통합 테스트 + 회귀 검증 [Priority: High]

**산출물:**

- `src/app/(app)/notifications/__tests__/integration.test.ts`:
  - 비인증 → 로그인 페이지 redirect (REQ-NOTIFY-RLS-002)
  - operator로 로그인 → 본인 알림만 표시
  - instructor로 로그인 + 본인 외 recipient_id 알림 존재 → 본인 것만 표시 (RLS 검증)
  - 종 아이콘 카운트 정확 (DB count == UI 배지)
  - 99건 초과 → "99+" 표시
  - 알림 클릭 → `read_at` 업데이트 + `link_url` 이동
  - "모두 읽음" 클릭 → 모든 unread → read, 카운트 0
  - 페이지네이션 P=2 정상 동작
  - 필터 type=schedule_conflict + read=unread 정상 동작
  - 페이지 초과 → 마지막 페이지로 redirect (REQ-NOTIFY-LIST-007)

- 회귀 테스트 보강:
  - `src/lib/payouts/__tests__/mail-stub.test.ts` PASS (LOG_RE 정규식)
  - `src/app/(app)/(operator)/projects/__tests__/integration.test.ts` 시나리오 4 PASS (assignment_request 형식 보존)
  - `src/app/(app)/(instructor)/me/schedule/__tests__/*.test.ts` (있다면) PASS

- E2E (Playwright, SPEC-E2E-001 확장 검토):
  - operator 로그인 → 종 아이콘 클릭 → dropdown 표시 → 항목 클릭 → 페이지 이동
  - instructor 로그인 → 다른 사용자 알림 미표시 확인

- 트리거 통합 시나리오:
  - operator가 만족도 2.5 강사 배정 → 본인에게 `low_satisfaction_assignment` 알림 1건
  - 동일 시나리오 24h 내 재시도 → dedup으로 스킵
  - 강사가 자기 일정에 충돌 일정 등록 → 담당 operator에게 `schedule_conflict` 알림 1건

**검증 환경:**

- 로컬 Supabase + `npx supabase db reset` 사이클
- `pnpm vitest run` 모든 테스트 PASS
- 회귀: `grep -rn "notifications.*insert\|from\(.notifications.\).*insert" src/` 결과가 emit 헬퍼 내부만 (도메인 코드 0건)

**연관 EARS:** acceptance.md 시나리오 1~10 + EC-1~8

---

### M7 — 접근성 + Lighthouse [Priority: Medium]

**산출물:**

- `/notifications`, `<NotificationDropdown>` 열린 상태에 axe DevTools 적용
- 발견된 critical/serious 이슈 0건 도달
- Lighthouse Accessibility ≥ 95 측정
- 키보드 only 흐름 매뉴얼 검증 (Tab → Enter → Tab → Enter → Esc)
- 스크린리더 (VoiceOver / NVDA) 매뉴얼 검증:
  - 종 아이콘 → "알림 안읽음 N건, 버튼"
  - dropdown 열림 → 항목 listbox 안내
  - "모두 읽음" 클릭 → "알림 N건 읽음 처리됨" 라이브 안내

**검증:**

- Lighthouse 보고서 첨부 (`.moai/reports/`에 저장)
- axe 결과 0건 캡처

**연관 EARS:** REQ-NOTIFY-A11Y-001~005

---

## 3. 변경 파일 목록 (신규 / 변경)

### 3.1 신규 (주요)

```
src/lib/notifications/
├── types.ts                                  [M1]
├── constants.ts                              [M1]
├── errors.ts                                 [M1]
├── validation.ts                             [M2]
├── emit.ts                                   [M2]
├── dedup.ts                                  [M2]
├── queries.ts                                [M2]
├── list-query.ts                             [M2]
├── index.ts                                  [M1/M2]
├── triggers/
│   ├── types.ts                              [M3]
│   ├── assignment-overdue.ts                 [M3]
│   ├── schedule-conflict.ts                  [M3]
│   ├── low-satisfaction.ts                   [M3]
│   ├── dday-unprocessed.ts                   [M3]
│   ├── rate-limit.ts                         [M3]
│   └── index.ts                              [M3]
└── __tests__/
    ├── _helpers.ts                           [M2]
    ├── emit.test.ts                          [M2]
    ├── queries.test.ts                       [M2]
    ├── dedup.test.ts                         [M2]
    ├── list-query.test.ts                    [M2]
    └── triggers/
        ├── assignment-overdue.test.ts        [M3]
        ├── schedule-conflict.test.ts         [M3]
        ├── low-satisfaction.test.ts          [M3]
        └── dday-unprocessed.test.ts          [M3]

src/components/notification-center/
├── NotificationBell.tsx                      [M5]
├── NotificationDropdown.tsx                  [M5]
├── NotificationItem.tsx                      [M5]
├── NotificationBadge.tsx                     [M5]
├── NotificationFiltersBar.tsx                [M5]
├── NotificationList.tsx                      [M5]
└── Pagination.tsx                            [M5] (또는 SPEC-PROJECT-001 재사용)

src/app/(app)/notifications/
├── actions.ts                                [M5]
└── __tests__/
    └── integration.test.ts                   [M6]

(선택) supabase/migrations/
└── 20260428200000_notifications_helper_indexes.sql  [M1, optional]
```

### 3.2 변경 (기존 파일, 최소 침습)

```
src/lib/payouts/mail-stub.ts                  [M4] — direct insert → emitNotification (약 -7줄)
src/app/(app)/(operator)/projects/[id]/actions.ts
                                               [M4] — direct insert → emitNotification + 트리거 호출 (약 ±5줄)
src/app/(app)/(instructor)/me/schedule/actions.ts
                                               [M4] — checkScheduleConflict 호출 추가 (+5줄)
src/app/(app)/notifications/page.tsx          [M5] — placeholder → 전체 리스트 (재작성)
src/components/AppShell.tsx (또는 Header)     [M5] — <NotificationBell /> 삽입 (+1~2줄)
```

### 3.3 변경 없음 (read-only 의존)

- SPEC-DB-001 마이그레이션 (`notifications` 테이블, RLS, ENUM)
- SPEC-AUTH-001 (`getCurrentUser`, `requireUser`)
- SPEC-LAYOUT-001 디자인 토큰, UI 프리미티브

---

## 4. 위험 / 완화

| 위험 | 완화 |
|------|------|
| `mail-stub.ts` 콘솔 로그 형식 회귀 | M4의 `LOG_RE` 회귀 테스트 PASS 강제 + emit 헬퍼의 `logContext` 자유 형식 |
| 트리거 lazy 검사 페이지 응답 지연 | `Promise.allSettled` + fire-and-forget (await 안 함), rate-limit 5분 |
| 트리거 dedup race condition | DB 단위 unique 보장 X, 1건 잉여 INSERT 허용; 후속 SPEC에서 `dedup_key` 컬럼 검토 |
| 산재 INSERT 통합 시 RLS deny 패턴 변경 | M2 emit 단위 테스트로 deny 시나리오 검증 + M4 회귀 테스트 |
| `notifications` 무한 증가 | 본 SPEC 외; 후속 SPEC-NOTIFY-CLEANUP-XXX |
| 종 아이콘 SSR/CSR 경계 처리 | 서버 컴포넌트로 카운트 fetch + 클라이언트 컴포넌트로 dropdown trigger; React 19 Server Components 패턴 |

---

## 5. 완료 기준 (Definition of Done)

- [ ] M1~M6 모든 산출물 PR 머지
- [ ] `pnpm tsc --noEmit` 0 에러
- [ ] `pnpm build` 0 에러
- [ ] `pnpm vitest run` 모든 테스트 PASS (notifications + 회귀: payouts/projects/me-schedule)
- [ ] 라인 커버리지: `src/lib/notifications/**` ≥ 85%
- [ ] Direct `notifications.insert` grep 결과 0건 (emit 헬퍼 내부 제외)
- [ ] 콘솔 로그 형식 회귀 테스트 PASS (mail-stub LOG_RE, projects assignment_request)
- [ ] axe critical 0건, Lighthouse Accessibility ≥ 95 (M7 완료 시)
- [ ] acceptance.md 시나리오 1~10 + EC-1~8 PASS
- [ ] SPEC frontmatter `status: completed`로 전환
- [ ] @MX 태그: emit 헬퍼에 `@MX:ANCHOR` (fan_in 예상 ≥ 5), 트리거 모듈에 `@MX:NOTE`

---

Version: 0.1.0
Last Updated: 2026-04-28
