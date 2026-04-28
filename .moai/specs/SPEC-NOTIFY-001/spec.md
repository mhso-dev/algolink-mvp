---
id: SPEC-NOTIFY-001
version: 1.0.0
status: completed
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-NOTIFY-001: 알림 센터(인앱) + 트리거 4종 (In-App Notification Center with 4 Triggers)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성. Algolink MVP Phase 2 Wave2 [F-002] 알림 센터(인앱) + [F-206] 자동 알림 트리거 4종(`assignment_overdue`, `schedule_conflict`, `low_satisfaction_assignment`, `dday_unprocessed`). SPEC-DB-001(완료)이 정의한 `notifications` 테이블 + `notification_type` ENUM 6종(`assignment_overdue`, `schedule_conflict`, `low_satisfaction_assignment`, `dday_unprocessed`, `settlement_requested`, `assignment_request`)을 그대로 재사용. SPEC-PROJECT-001(완료)·SPEC-PAYOUT-001(완료)·SPEC-ME-001(완료)에 이미 산재한 인앱 알림 INSERT 코드를 단일 emit 헬퍼(`src/lib/notifications/emit.ts`)로 통합하고, 기존 도메인 액션은 1~2줄 호출만 추가한다. 헤더 종 아이콘 + 안읽음 카운트 + dropdown 미니리스트 + `/notifications` 전체 페이지(필터·페이지네이션)·읽음/모두읽음 처리 UI를 구축한다. 자동 트리거 4종은 cron 인프라 없이 lazy 검사(알림 조회·관련 액션 실행 시 동기 검사) + 중복 방지 가드로 MVP 수준 자동화. RLS는 `notifications_recipient_select/update`(SPEC-DB-001 §RLS) 그대로 사용, 본인(`recipient_id = auth.uid()`) 알림만 SELECT/UPDATE. 이메일·푸시·알림톡·WebSocket 실시간·cron 인프라는 명시적 제외(후속 SPEC-EMAIL-001 / SPEC-PUSH-001).

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **공통 영역 [F-002] 인앱 알림 센터**와 **운영 자동화 [F-206] 자동 알림 트리거 4종**을 구축한다. 본 SPEC의 산출물은 (a) 헤더 우상단 종 아이콘 컴포넌트(`<NotificationBell>`) — 안읽음 카운트 배지 + 클릭 시 최근 10건 dropdown(`<NotificationDropdown>`) + "모두 보기" 링크, (b) `/notifications` 전체 알림 페이지 — 타입 필터·읽음/안읽음 필터·페이지네이션, (c) 알림 단일 진입점 헬퍼 `emitNotification(supabase, payload)` (`src/lib/notifications/emit.ts`) — 기존에 `src/lib/payouts/mail-stub.ts`·`src/app/(app)/(operator)/projects/[id]/actions.ts`에 산재한 `notifications` INSERT 코드를 통합, (d) 4종 자동 트리거 모듈 `src/lib/notifications/triggers/` — `assignment-overdue.ts`(배정요청 후 24h 미응답), `schedule-conflict.ts`(강사 일정 충돌 감지), `low-satisfaction.ts`(만족도 평균 < 3.0 강사 배정 시도 경고), `dday-unprocessed.ts`(정산요청 D-3/D-1 미처리, 의뢰접수 D-N 미배정), (e) 읽음 마킹 Server Action(`markRead`, `markAllRead`)과 안읽음 카운트 쿼리(`getUnreadCount`), (f) RLS 강제 — `recipient_id = auth.uid()` 본인 알림만 노출, (g) 한국어 UI/에러 UX, (h) WCAG 2.1 AA 접근성, (i) Asia/Seoul 시간대 표시, (j) 트리거별 중복 방지 가드(예: 동일 `project_id` 24h 내 `assignment_overdue` 1회).

본 SPEC은 이메일·SMS·카카오 알림톡 발송, 브라우저 push, FCM, WebSocket realtime, cron/scheduler 인프라를 빌드하지 않는다.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.1 [F-002]는 "알림 센터(인앱)" — 모든 사용자가 자신에게 도착한 알림을 한 곳에서 확인하는 공통 기능 — 을 명시한다. §3.6 [F-206]은 "자동 알림 트리거 4종"으로 (1) 배정 요청 후 N시간 미응답, (2) 강사 일정 충돌, (3) 만족도 낮은 강사 자동 추천 경고, (4) 미처리 태스크 D-Day 알림을 요구한다. 운영 효율성 KPI(§5)는 의뢰→배정 30분→5분, 월 정산 처리 시간 50% 단축이며, 두 KPI 모두 즉시성 있는 알림에 의존한다.

기술 기반은 SPEC-DB-001 + 후속 SPEC들에서 마련되었다:

- `notifications` 테이블 (SPEC-DB-001 §3 `20260427000030_initial_schema.sql:291-300`):
  - `id` uuid PK
  - `recipient_id` uuid NOT NULL (FK→`users.id`)
  - `type` `notification_type` NOT NULL
  - `title` text NOT NULL
  - `body` text NULL
  - `link_url` text NULL
  - `read_at` timestamptz NULL
  - `created_at` timestamptz DEFAULT now()
- `notification_type` ENUM 6종:
  - `assignment_overdue` (SPEC-DB-001 초기 정의)
  - `schedule_conflict` (SPEC-DB-001 초기 정의)
  - `low_satisfaction_assignment` (SPEC-DB-001 초기 정의)
  - `dday_unprocessed` (SPEC-DB-001 초기 정의)
  - `settlement_requested` (SPEC-DB-001 초기 정의)
  - `assignment_request` (SPEC-PROJECT-001 마이그레이션 `20260427000091_notification_type_assignment_request.sql`로 추가)
- 인덱스 (SPEC-DB-001 §3):
  - `idx_notifications_recipient` (`recipient_id`)
  - `idx_notifications_recipient_unread` (`recipient_id`, `read_at`) — 안읽음 카운트 쿼리 최적화
  - `idx_notifications_created_at` (`created_at` DESC)
- RLS 정책 (SPEC-DB-001 `20260427000060_rls_policies.sql:385-395`):
  - `notifications_admin_all` — admin 전체 권한
  - `notifications_operator_insert` — operator/admin INSERT (시스템 발송용)
  - `notifications_recipient_select` — `recipient_id = auth.uid()` 본인만 SELECT
  - `notifications_recipient_update` — `recipient_id = auth.uid()` 본인만 UPDATE (read_at 갱신용)

기존 코드 산재 현황 (본 SPEC이 통합):

- `src/lib/payouts/mail-stub.ts:71-80` — `notifications` INSERT (`type='settlement_requested'`)
- `src/app/(app)/(operator)/projects/[id]/actions.ts:325-358` — `notifications` INSERT (`type='assignment_request'`)
- 향후 SPEC-INSTRUCTOR-CONFIRM-XXX, SPEC-REVIEW-XXX 등도 동일 패턴 반복 예정

이 산재 패턴이 (a) `notification_type` enum 누락 시 컴파일 에러 없이 런타임 실패, (b) `link_url` 컨벤션 분산, (c) 콘솔 로그 형식 불일치, (d) RLS 위반 시 silent fail 같은 문제를 만든다. 본 SPEC은 단일 `emitNotification()` 함수로 (a)~(d)를 통합하여 향후 모든 도메인이 동일한 방식으로 알림을 발행하도록 강제한다.

자동 트리거 4종은 `.moai/project/product.md` §3.6 시나리오 D(운영 자동화)에 따라 다음 시점에 발행된다:

| 트리거 | 발행 시점 | recipient | link_url |
|--------|----------|-----------|----------|
| `assignment_overdue` | 배정 요청 후 24h 경과 + 강사 미응답 (lazy 검사) | operator | `/projects/{projectId}` |
| `schedule_conflict` | 강사 schedule_items insert/update 시 동일 강사 시간대 겹침 | operator (담당자) | `/projects/{projectId}` |
| `low_satisfaction_assignment` | operator가 평균 만족도 < 3.0 강사 추천 채택/수동 배정 시도 | operator (본인 경고) | `/projects/{projectId}` |
| `dday_unprocessed` | 정산 요청 후 D-3/D-1 미처리, 의뢰 접수 후 D-7 미배정 (lazy 검사) | operator | `/settlements/{id}` 또는 `/projects/{id}` |

cron/scheduler 인프라(K8s CronJob, Supabase pg_cron)가 MVP 단계에서 미준비이므로, **lazy 검사 패턴**을 채택한다 — 사용자가 알림 페이지를 열거나 관련 도메인 액션(예: operator dashboard 진입)을 수행할 때 `checkPendingTriggers()`가 동기 실행되어 누락된 트리거를 발행한다. 중복 방지는 (a) DB 단위 가드 — `notifications` 테이블에서 동일 `(recipient_id, type, link_url, created_at within 24h)` 존재 여부 확인 후 INSERT, (b) 함수 단위 가드 — `triggers/*.ts` 모듈이 자체 dedup 키 검사. 트리거가 빈번해질 경우 후속 SPEC에서 `pg_cron` 또는 Edge Function 스케줄러로 이전한다.

### 1.3 범위 (Scope)

**In Scope:**

- 라우트 (`src/app/(app)/notifications/`):
  - `page.tsx` — 전체 알림 리스트 (서버 컴포넌트, 검색/필터/페이지네이션). 기존 placeholder 페이지 확장.
  - `actions.ts` — `markReadAction`, `markAllReadAction` Server Actions
- UI 컴포넌트 (`src/components/notification-center/`):
  - `NotificationBell.tsx` — 헤더에 박힐 종 아이콘 + 안읽음 카운트 배지 (서버 컴포넌트로 카운트 fetch + 클라이언트 dropdown 트리거)
  - `NotificationDropdown.tsx` — 클릭 시 펼쳐지는 최근 10건 미니리스트 (`<Popover>` 또는 `<DropdownMenu>` 기반 클라이언트 컴포넌트) + "모두 보기" 링크
  - `NotificationItem.tsx` — 개별 알림 카드 (제목·본문·시간·타입 배지·읽음 토글·`link_url` 이동 링크)
  - `NotificationFiltersBar.tsx` — `/notifications` 페이지의 필터 컨트롤 (타입 multi-select + 읽음/안읽음 토글)
- 도메인 로직 (`src/lib/notifications/`):
  - `emit.ts` — `emitNotification(supabase, payload): Promise<{ ok, id?, error? }>` 단일 진입점. 모든 도메인이 호출.
  - `queries.ts` — `listNotifications`, `getNotificationById`, `markRead`, `markAllRead`, `getUnreadCount`
  - `list-query.ts` — URL 파싱 (page, type, read filter)
  - `validation.ts` — zod schemas (emit payload, list filters)
  - `constants.ts` — 라벨 매핑 (`NOTIFICATION_TYPE_LABEL`), 콘솔 로그 prefix (`NOTIF_LOG_PREFIX = '[notif]'`), 페이지 사이즈 등
  - `dedup.ts` — `hasRecentDuplicate(supabase, dedupKey, withinHours): boolean` 중복 가드
  - `triggers/` — 4종 트리거 모듈:
    - `assignment-overdue.ts` — `checkAssignmentOverdue(supabase, opts): Promise<EmitResult[]>` (lazy 검사)
    - `schedule-conflict.ts` — `checkScheduleConflict(supabase, instructorId, range): Promise<EmitResult>`
    - `low-satisfaction.ts` — `checkLowSatisfaction(supabase, instructorId, threshold = 3.0): Promise<EmitResult | null>`
    - `dday-unprocessed.ts` — `checkDdayUnprocessed(supabase, opts): Promise<EmitResult[]>` (lazy 검사)
  - `__tests__/*.test.ts` — emit, queries, dedup, triggers 단위 테스트
- 마이그레이션 (`supabase/migrations/`):
  - `20260428200000_notifications_helper_indexes.sql` — 추가 인덱스 (lazy 검사 성능 보강): `(type, created_at DESC) WHERE read_at IS NULL` 부분 인덱스 (선택, 실측 후 결정)
  - 기존 RLS는 SPEC-DB-001에서 이미 적용되어 변경 없음 — 단, 시스템 발송 경로 검증을 위한 RLS 정책 보강 검토 (operator/admin이 본인 외 recipient에게 INSERT 가능한지 확인; 현재 `notifications_operator_insert`는 `WITH CHECK (app.is_operator_or_admin())`이므로 가능)
- 기존 도메인의 emit 호출 통합 (각 1~2줄):
  - `src/lib/payouts/mail-stub.ts` — 기존 직접 INSERT를 `emitNotification()` 호출로 교체 (LESSON-002 준수: 기존 동작 유지, 콘솔 로그 형식 보존)
  - `src/app/(app)/(operator)/projects/[id]/actions.ts:325-358` — 기존 직접 INSERT를 `emitNotification()` 호출로 교체. 트리거 호출 추가:
    - 1-클릭 배정 직후 `checkLowSatisfaction(instructorId)` 호출 (만족도 < 3.0이면 operator에게 경고 알림 emit)
    - 1-클릭 배정 직후 `checkScheduleConflict(instructorId, [start, end])` 호출 (충돌 시 emit)
  - `src/app/(app)/(instructor)/me/schedule/actions.ts:60-110` — schedule_items insert/update 직후 `checkScheduleConflict(instructorId, [starts_at, ends_at])` 호출 (해당 강사가 배정된 활성 프로젝트와 충돌 시 emit)
- 알림 수신 시점 lazy 검사 hook:
  - `getUnreadCount()` 또는 `/notifications` 진입 시 operator role이면 `checkAssignmentOverdue()` + `checkDdayUnprocessed()` 호출 (rate limit: 5분 간격, 메모리 기반 또는 DB last_check 컬럼)
- 한국어 라벨 매핑 (`src/lib/notifications/constants.ts`):
  ```ts
  export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
    assignment_request: "배정 요청",
    assignment_overdue: "배정 지연",
    schedule_conflict: "일정 충돌",
    low_satisfaction_assignment: "만족도 경고",
    dday_unprocessed: "D-Day 미처리",
    settlement_requested: "정산 요청",
  };
  ```
- 단위 테스트 (`src/lib/notifications/__tests__/`):
  - `emit.test.ts` — emit payload validation, RLS 시나리오, 콘솔 로그
  - `queries.test.ts` — list/markRead/getUnreadCount
  - `list-query.test.ts` — URL 파싱
  - `dedup.test.ts` — 중복 가드 동작
  - `triggers/assignment-overdue.test.ts` — 24h 경과 + 미응답 검출
  - `triggers/schedule-conflict.test.ts` — overlap 감지
  - `triggers/low-satisfaction.test.ts` — 평균 < 3.0 검출, 리뷰 0건 시 emit 안 함
  - `triggers/dday-unprocessed.test.ts` — D-3/D-1/D-7 검출
- 통합 테스트 (`src/app/(app)/notifications/__tests__/integration.test.ts`):
  - 비인증 요청 → 401
  - operator 본인 알림만 표시 (RLS)
  - 종 아이콘 카운트 정확
  - 읽음 마킹 후 카운트 감소
  - 모두 읽음 일괄 처리
- 한국어 UI, Asia/Seoul 표시 (`src/lib/format/datetime.ts` 재사용)

**Out of Scope (Exclusions — What NOT to Build):**

- **이메일 실제 발송 (Resend/SES)**: SMTP·트랜잭션 메일 어댑터는 SPEC-EMAIL-001 (후속). 본 SPEC은 인앱 `notifications` INSERT + 콘솔 로그까지만.
- **브라우저 push 알림 / FCM / Web Push API**: SPEC-PUSH-001 (후속).
- **카카오 알림톡 / SMS / LMS**: 외부 채널 어댑터는 별도 SPEC.
- **WebSocket realtime / Supabase Realtime 구독**: 본 SPEC은 polling(페이지 로드 시 fetch) 또는 사용자 명시 새로고침으로 충분. Realtime 도입은 후속.
- **cron/scheduler 인프라**: K8s CronJob, Supabase `pg_cron`, Edge Function 스케줄러 등. 본 SPEC은 lazy 검사(사용자 액션 시 동기 실행) + 중복 가드로 MVP 수준 자동화.
- **알림 환경설정 UI**: 사용자별 알림 on/off, 채널 선택, 수신 시간대 설정은 SPEC-NOTIFY-PREFERENCE-XXX (후속).
- **알림 그룹화 / 다이제스트**: "오늘 5건의 배정 요청이 있습니다" 같은 묶음 알림은 후속.
- **알림 검색 (전문 검색)**: 본 SPEC은 타입·읽음 필터만. 본문 키워드 검색 미제공.
- **알림 archive / soft delete**: 본 SPEC은 `read_at` 마킹만. 사용자가 알림을 지우는 기능 미제공. (DB는 admin이 일괄 정리)
- **알림 CSV/PDF export**: 미제공.
- **다국어**: 한국어 단일.
- **모바일 전용 UX**: 데스크톱 우선. 반응형은 SPEC-LAYOUT-001 가이드 따름.
- **트리거 5종 이상**: §1.2 표의 4종만 구현. `instructor_resigned`, `client_complaint`, `payout_overdue` 등은 후속.
- **트리거 가중치 / 우선순위 / 머신러닝 알림 필터**: 모든 트리거 동일 가중치, FIFO 순서.
- **트리거 결과 알림 미리보기 / dry-run**: emit은 즉시 INSERT만. dry-run 모드 미제공.

### 1.4 성공 지표 (Success Criteria)

- ✅ 빌드 무오류: `pnpm build` 0 에러, 0 type 에러
- ✅ 단위 테스트: `src/lib/notifications/__tests__/` 모든 케이스 PASS, 라인 커버리지 ≥ 85% (notifications 모듈)
- ✅ 통합 테스트: emit → 조회 → 읽음 마킹 → 카운트 감소 시나리오 PASS
- ✅ emit 헬퍼 통합: `src/lib/payouts/mail-stub.ts`와 `src/app/(app)/(operator)/projects/[id]/actions.ts`의 직접 `notifications.insert` 호출이 0건 (`emitNotification` 100% 대체); SPEC-PAYOUT-001의 콘솔 로그 형식(`[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>`)과 SPEC-PROJECT-001의 콘솔 로그 형식(`[notif] assignment_request → instructor_id=<uuid> project_id=<uuid> rank=<n|force>`)이 변경 없이 유지됨 — 회귀 테스트 PASS
- ✅ RLS 정합: instructor 토큰으로 다른 사용자 알림 SELECT 시도 → 0 rows. operator/admin이 다른 사용자 알림 SELECT는 `notifications_admin_all` 정책으로 admin만 가능
- ✅ 헤더 종 아이콘: 안읽음 카운트가 정확 (DB count ↔ UI 배지 일치), 99건 초과 시 `99+` 표시, 0건 시 배지 숨김
- ✅ Dropdown: 종 아이콘 클릭 시 최근 10건 표시 (`ORDER BY created_at DESC LIMIT 10`), 외부 클릭 시 닫힘, ESC로 닫힘
- ✅ NotificationItem 클릭: `read_at = now()` 즉시 UPDATE + `link_url`로 클라이언트 라우팅 (Next.js `useRouter` 또는 `<Link prefetch>`)
- ✅ "모두 읽음": 본인 모든 안읽음 알림(`recipient_id = auth.uid() AND read_at IS NULL`)에 대해 `UPDATE notifications SET read_at = now()` 일괄 실행, 카운트 0으로 감소
- ✅ 페이지네이션: 100건 이상 알림 보유 시 페이지당 20건, 페이지 이동 시 URL `?page=N` 반영
- ✅ 필터: 타입 multi-select(6종) + 읽음/안읽음 토글이 URL 쿼리에 반영, 새로고침 시 유지
- ✅ 트리거 1 — `assignment_overdue`: 배정 요청 후 24h 경과 + 강사 미응답(`projects.status IN ('assignment_review')` 유지) 프로젝트에 대해 operator에게 1건 emit. 동일 `(project_id, type)` 24h 내 1회만 (dedup 가드)
- ✅ 트리거 2 — `schedule_conflict`: 강사 schedule_items insert 시 동일 강사 시간대 겹침 감지 → 해당 강사 활성 프로젝트의 operator에게 emit
- ✅ 트리거 3 — `low_satisfaction_assignment`: operator가 평균 만족도 `(SELECT avg(score) FROM satisfaction_reviews WHERE instructor_id = ?) < 3.0`인 강사를 배정 시도하면 operator에게 본인 경고 emit. 리뷰 0건 강사는 emit 안 함(prior 적용 안 함, 명시적으로 평균 데이터가 있어야)
- ✅ 트리거 4 — `dday_unprocessed`: (a) `settlements` 중 `status='requested' AND now() - requested_at >= interval '7 days'` → operator에게 emit, (b) `projects` 중 `status='proposal' AND now() - created_at >= interval '7 days'` → 담당 operator에게 emit. 동일 entity 24h 내 1회만
- ✅ Lazy 검사 rate limit: `checkPendingTriggers()` 호출이 동일 user에 대해 5분 간격 보장 (in-memory 기반 또는 user metadata)
- ✅ 접근성: axe DevTools `/notifications`, `<NotificationDropdown>` critical 0건, Lighthouse Accessibility ≥ 95
- ✅ 키보드 only: 종 아이콘 Tab → Enter로 dropdown 열기, Tab으로 항목 이동, Enter로 read+이동, Esc로 닫기
- ✅ Asia/Seoul 표시: `created_at`이 한국 시간대로 일관 표시 (예: `2026-04-28 14:30 KST`, 1시간 이내는 "방금 전" / "N분 전")
- ✅ 콘솔 로그 prefix 통일: 모든 emit 호출이 `[notif] <type> → recipient_id=<uuid> entity=<context>` 1줄 출력 (`NOTIF_LOG_PREFIX` 상수 사용). 기존 `[notif] settlement_requested ...` 형식과 호환 유지

---

## 2. EARS 요구사항 (EARS Requirements)

본 SPEC은 7개 모듈로 구성된다: `EMIT`, `QUERY`, `BELL`, `LIST`, `TRIGGER`, `RLS`, `A11Y`.

### 2.1 REQ-NOTIFY-EMIT — 단일 emit 헬퍼

**REQ-NOTIFY-EMIT-001 (Ubiquitous)**
The system **shall** provide a single function `emitNotification(supabase, payload): Promise<EmitResult>` in `src/lib/notifications/emit.ts` accepting a payload of `{ recipientId: string; type: NotificationType; title: string; body?: string; linkUrl?: string; dedupKey?: string }` and returning `{ ok: true; id: string } | { ok: false; error: string; reason?: 'duplicate' | 'rls' | 'db' }`.

**REQ-NOTIFY-EMIT-002 (Ubiquitous)**
The system **shall** validate the payload via a zod schema in `src/lib/notifications/validation.ts` rejecting: missing `recipientId` (uuid), invalid `type` (not in `notification_type` enum), `title` length > 200, `body` length > 2000, malformed `linkUrl` (not relative path starting with `/`).

**REQ-NOTIFY-EMIT-003 (Event-Driven)**
**When** `emitNotification` is called with a `dedupKey`, the system **shall** call `hasRecentDuplicate(supabase, dedupKey, withinHours = 24)` first; if a duplicate exists in the last 24h, the system **shall** return `{ ok: false, reason: 'duplicate' }` without inserting.

**REQ-NOTIFY-EMIT-004 (Ubiquitous)**
On successful insert, the system **shall** emit a single console log line `[notif] <type> → recipient_id=<uuid> <context>` where `<context>` is derived from the `dedupKey` or the `linkUrl` (e.g., `project_id=<uuid>` or `settlement_id=<uuid>`). The prefix `[notif]` **shall** be exported as `NOTIF_LOG_PREFIX` constant in `src/lib/notifications/constants.ts`.

**REQ-NOTIFY-EMIT-005 (Unwanted Behavior)**
**If** the underlying `notifications` INSERT fails (RLS deny, FK violation, schema mismatch), **then** the system **shall** return `{ ok: false, error: <한국어 메시지>, reason: 'rls' | 'db' }` and log via `console.error("[notify.emit] insert failed", { type, recipientId, error })`; **shall not** throw.

**REQ-NOTIFY-EMIT-006 (Ubiquitous)**
Existing direct `supabase.from('notifications').insert(...)` calls in the codebase **shall** be replaced with `emitNotification` calls. Specifically: `src/lib/payouts/mail-stub.ts:71-80` and `src/app/(app)/(operator)/projects/[id]/actions.ts:325-358`. The pre-existing console log lines **shall** be preserved verbatim (output equivalence, not source equivalence) — see REQ-NOTIFY-EMIT-007.

**REQ-NOTIFY-EMIT-007 (Ubiquitous)**
The system **shall** preserve the console log formats already in production:
- SPEC-PAYOUT-001 (`mail-stub.ts`): `[notif] settlement_requested → instructor_id=<uuid> settlement_id=<uuid>`
- SPEC-PROJECT-001 (`actions.ts`): `[notif] assignment_request → instructor_id=<uuid> project_id=<uuid> rank=<n|force>`
The `<context>` field of `emitNotification` **shall** be flexible enough (free-form key=value pairs) to accommodate both formats without breaking existing consumers (regression test in `payouts/__tests__/mail-stub.test.ts:LOG_RE`).

### 2.2 REQ-NOTIFY-QUERY — 조회·읽음 마킹

**REQ-NOTIFY-QUERY-001 (Ubiquitous)**
The system **shall** provide `listNotifications(supabase, opts): Promise<{ items, total }>` in `src/lib/notifications/queries.ts` accepting `{ userId: string; types?: NotificationType[]; read?: 'all' | 'unread' | 'read'; page: number; pageSize: number }` and returning paginated results sorted by `created_at DESC`.

**REQ-NOTIFY-QUERY-002 (Ubiquitous)**
The system **shall** provide `getUnreadCount(supabase, userId): Promise<number>` returning the count of `notifications WHERE recipient_id = userId AND read_at IS NULL`. The query **shall** use the `idx_notifications_recipient_unread` index for performance.

**REQ-NOTIFY-QUERY-003 (Event-Driven)**
**When** the user clicks a notification item, the system **shall** call `markRead(supabase, notificationId)` which executes `UPDATE notifications SET read_at = now() WHERE id = ? AND recipient_id = auth.uid() AND read_at IS NULL`; the query **shall** be a no-op if already read.

**REQ-NOTIFY-QUERY-004 (Event-Driven)**
**When** the user clicks "모두 읽음", the system **shall** call `markAllRead(supabase, userId)` which executes `UPDATE notifications SET read_at = now() WHERE recipient_id = userId AND read_at IS NULL`; the operation **shall** return the count of rows updated for UI feedback.

**REQ-NOTIFY-QUERY-005 (Ubiquitous)**
The system **shall** provide `getRecentNotifications(supabase, userId, limit = 10): Promise<NotificationRow[]>` for the dropdown mini-list, sorted by `created_at DESC LIMIT 10`.

**REQ-NOTIFY-QUERY-006 (State-Driven)**
**While** the unread count exceeds 99, the system **shall** display "99+" in the badge component instead of the exact count.

### 2.3 REQ-NOTIFY-BELL — 헤더 종 아이콘 + dropdown

**REQ-NOTIFY-BELL-001 (Ubiquitous)**
The system **shall** provide a `<NotificationBell>` component in `src/components/notification-center/NotificationBell.tsx` rendering a bell icon (`lucide-react` `Bell`) with an absolute-positioned badge showing `getUnreadCount(currentUser.id)`.

**REQ-NOTIFY-BELL-002 (State-Driven)**
**While** the unread count is 0, the system **shall** hide the badge entirely (no empty circle); the bell icon **shall** remain visible and clickable.

**REQ-NOTIFY-BELL-003 (Event-Driven)**
**When** the user clicks the bell icon, the system **shall** open `<NotificationDropdown>` showing the result of `getRecentNotifications` (latest 10) below the icon, with a "모두 보기" link at the bottom navigating to `/notifications`.

**REQ-NOTIFY-BELL-004 (Event-Driven)**
**When** the user clicks outside the dropdown or presses Escape, the dropdown **shall** close.

**REQ-NOTIFY-BELL-005 (Event-Driven)**
**When** the user clicks a notification item in the dropdown, the system **shall** (a) call `markRead`, (b) navigate to `link_url` via Next.js client navigation, (c) close the dropdown.

**REQ-NOTIFY-BELL-006 (Optional Feature)**
**Where** the dropdown is empty (no notifications), the system **shall** render a placeholder text `"새 알림이 없습니다."` and hide the "모두 보기" link.

**REQ-NOTIFY-BELL-007 (Ubiquitous)**
The bell icon and dropdown **shall** be integrated into `<AppShell>` (SPEC-LAYOUT-001) header for all roles (`operator`, `admin`, `instructor`, `client`); the badge count **shall** reflect the current user's notifications regardless of role.

### 2.4 REQ-NOTIFY-LIST — 전체 알림 페이지

**REQ-NOTIFY-LIST-001 (Ubiquitous)**
The system **shall** extend the existing `/notifications` page (`src/app/(app)/notifications/page.tsx`) from the placeholder to a full list rendering server-side via React Server Components.

**REQ-NOTIFY-LIST-002 (Ubiquitous)**
The system **shall** display each notification row with: 타입 배지 (한국어 라벨, 색상), 제목 (`title`), 본문 (`body`, optional, truncated to 100자), 시간 (`created_at` Asia/Seoul KST + relative "방금 전"/"3분 전"/"2시간 전"), 읽음 토글, link 화살표 아이콘.

**REQ-NOTIFY-LIST-003 (Ubiquitous)**
The system **shall** support filters via URL query parameters: `type` (multi-select 6종 enum values), `read` (`all` | `unread` | `read`, default `all`), `page` (1-based, default 1).

**REQ-NOTIFY-LIST-004 (Ubiquitous)**
The system **shall** paginate results with `pageSize = 20`, exposing total count for navigation controls.

**REQ-NOTIFY-LIST-005 (Event-Driven)**
**When** a user clicks a notification row, the system **shall** call `markReadAction` Server Action (which calls `markRead`), then navigate to `link_url` via `redirect()`.

**REQ-NOTIFY-LIST-006 (Event-Driven)**
**When** a user clicks "모두 읽음" button, the system **shall** call `markAllReadAction` Server Action (which calls `markAllRead(currentUser.id)`), then revalidate `/notifications` and the bell badge via `revalidatePath('/notifications')` and `revalidateTag('notifications-count')`.

**REQ-NOTIFY-LIST-007 (Unwanted Behavior)**
**If** the requested `page` exceeds total pages, **then** the system **shall** redirect to the last valid page rather than rendering an empty list (mirrors SPEC-PROJECT-001 REQ-PROJECT-LIST-007).

**REQ-NOTIFY-LIST-008 (Optional Feature)**
**Where** the user filters by `read=unread` and the list is empty, the system **shall** render the existing empty-state card (`"모든 알림을 확인했어요"`) preserving the SPEC-LAYOUT-001 visual pattern from the placeholder page.

### 2.5 REQ-NOTIFY-TRIGGER — 자동 트리거 4종

**REQ-NOTIFY-TRIGGER-001 (Ubiquitous)**
The system **shall** implement 4 trigger modules in `src/lib/notifications/triggers/`, each exposing a single async function:
- `checkAssignmentOverdue(supabase, opts?: { hoursThreshold?: number = 24 }): Promise<EmitResult[]>`
- `checkScheduleConflict(supabase, instructorId: string, range: { start: Date; end: Date }): Promise<EmitResult | null>`
- `checkLowSatisfaction(supabase, instructorId: string, threshold = 3.0): Promise<EmitResult | null>`
- `checkDdayUnprocessed(supabase, opts?: { settlementDays?: number = 7; projectDays?: number = 7 }): Promise<EmitResult[]>`

Each function **shall** internally call `emitNotification` with appropriate `dedupKey` to prevent duplicates.

**REQ-NOTIFY-TRIGGER-002 (Event-Driven)** — assignment_overdue
**When** `checkAssignmentOverdue(supabase, { hoursThreshold: 24 })` is invoked, the system **shall** query `projects WHERE status = 'assignment_review' AND updated_at < now() - interval '24 hours' AND instructor_id IS NOT NULL`; for each result, **shall** emit `{ type: 'assignment_overdue', recipientId: project.operator_id, title: "배정 요청 응답 지연", body: "...강사 응답이 24시간 이상 지연되고 있습니다.", linkUrl: '/projects/<id>', dedupKey: 'overdue:project:<id>' }`.

**REQ-NOTIFY-TRIGGER-003 (Event-Driven)** — schedule_conflict
**When** `checkScheduleConflict` is invoked after a `schedule_items` insert/update, the system **shall** query for overlapping rows on the same `instructor_id` (using exclusion constraint logic from SPEC-DB-001 `20260427000040_exclusion_constraints.sql`); on conflict, **shall** emit `{ type: 'schedule_conflict', recipientId: <projects.operator_id WHERE projects.instructor_id = ? AND status NOT IN ('education_done', 'task_done')>, title: "강사 일정 충돌", body: "강사 <name> 일정이 활성 프로젝트 <project>와 겹칩니다.", linkUrl: '/projects/<id>', dedupKey: 'conflict:instructor:<instructorId>:<startDate>' }`.

**REQ-NOTIFY-TRIGGER-004 (Event-Driven)** — low_satisfaction_assignment
**When** `checkLowSatisfaction(supabase, instructorId, 3.0)` is invoked at 1-클릭 배정 시점 (`assignInstructorAction`), the system **shall** compute `SELECT avg(score) FROM satisfaction_reviews WHERE instructor_id = ?`; if the result is non-null AND < 3.0, **shall** emit `{ type: 'low_satisfaction_assignment', recipientId: currentOperatorId, title: "만족도 낮은 강사 배정", body: "강사 <name>의 평균 만족도가 <mean>/5입니다. 배정을 재검토하세요.", linkUrl: '/projects/<id>', dedupKey: 'lowsat:operator:<operatorId>:project:<projectId>' }`.

**REQ-NOTIFY-TRIGGER-005 (Event-Driven)** — dday_unprocessed
**When** `checkDdayUnprocessed(supabase)` is invoked, the system **shall** query (a) `settlements WHERE status = 'requested' AND now() - requested_at >= interval '7 days'`, (b) `projects WHERE status = 'proposal' AND now() - created_at >= interval '7 days'`; for each result, **shall** emit `{ type: 'dday_unprocessed', recipientId: <operator_id>, title: "D-Day 미처리 항목", body: "...", linkUrl: '/settlements/<id>' or '/projects/<id>', dedupKey: 'dday:settlement:<id>' or 'dday:project:<id>' }`.

**REQ-NOTIFY-TRIGGER-006 (Ubiquitous)** — Lazy 검사 통합 지점
The system **shall** invoke trigger checks lazily at the following hooks:
- `getUnreadCount(userId)` 호출 시 (operator role + 5분 rate limit) → `checkAssignmentOverdue` + `checkDdayUnprocessed`
- `assignInstructorAction` 성공 직후 (`src/app/(app)/(operator)/projects/[id]/actions.ts`) → `checkLowSatisfaction(instructorId)` + `checkScheduleConflict(instructorId, [education_start_at, education_end_at])`
- `addScheduleItemAction` 성공 직후 (`src/app/(app)/(instructor)/me/schedule/actions.ts`) → `checkScheduleConflict(currentInstructorId, [starts_at, ends_at])`

Trigger failures **shall** be silent (console.warn only); they **shall not** abort the parent action.

**REQ-NOTIFY-TRIGGER-007 (State-Driven)** — Rate limit
**While** lazy trigger checks are active, the system **shall** enforce a 5-minute cooldown per user via in-memory Map (key: `userId`, value: `lastCheckTime`); subsequent invocations within 5 minutes **shall** be no-ops returning `[]`.

**REQ-NOTIFY-TRIGGER-008 (Unwanted Behavior)** — Dedup
**If** a trigger attempts to emit a notification with a `dedupKey` that already exists in `notifications` (matched via custom column or via `(recipient_id, type, link_url)` proxy lookup) within the last 24 hours, **then** `emitNotification` **shall** skip the INSERT and return `{ ok: false, reason: 'duplicate' }`; the trigger **shall not** propagate this as an error.

**REQ-NOTIFY-TRIGGER-009 (Optional Feature)** — Future cron migration
**Where** a future SPEC introduces `pg_cron` or Edge Function scheduling, the trigger modules in `src/lib/notifications/triggers/` **shall** be importable and callable from those schedulers without modification (interface preservation).

### 2.6 REQ-NOTIFY-RLS — 보안 / 권한

**REQ-NOTIFY-RLS-001 (Ubiquitous)**
The system **shall** rely on existing RLS policies from SPEC-DB-001 (`notifications_recipient_select`, `notifications_recipient_update`, `notifications_operator_insert`, `notifications_admin_all`); no new policies **shall** be added in this SPEC.

**REQ-NOTIFY-RLS-002 (Unwanted Behavior)**
**If** an unauthenticated request hits `/notifications` or any notifications API, **then** the SPEC-AUTH-001 guard at `src/app/(app)/layout.tsx` (or its descendants) **shall** redirect to `/login` with HTTP 307; the system **shall not** return notification data.

**REQ-NOTIFY-RLS-003 (State-Driven)**
**While** the user is authenticated as `instructor` or `client`, the bell badge and notification list **shall** show only their own notifications (`recipient_id = auth.uid()`); attempts to query other users' notifications via crafted requests **shall** return 0 rows due to RLS.

**REQ-NOTIFY-RLS-004 (Ubiquitous)**
The system **shall** ensure `markRead` and `markAllRead` use server-side Supabase client with the user's JWT, so RLS `notifications_recipient_update` policy enforces `recipient_id = auth.uid()` automatically.

**REQ-NOTIFY-RLS-005 (Optional Feature)**
**Where** an admin needs to view another user's notifications (operational support), the system **shall not** provide a UI in this SPEC; admin direct DB access via Supabase Studio is the documented path. Future admin SPEC may add this.

### 2.7 REQ-NOTIFY-A11Y — 접근성

**REQ-NOTIFY-A11Y-001 (Ubiquitous)**
The bell icon **shall** have `aria-label="알림"` and `aria-expanded={isOpen}` reflecting dropdown state; the badge **shall** have `aria-label={count > 0 ? \`안읽음 알림 ${count}건\` : undefined}`.

**REQ-NOTIFY-A11Y-002 (Ubiquitous)**
The dropdown **shall** be a `<div role="menu">` (or shadcn `<Popover>`) with each notification item as `<button role="menuitem">`; arrow keys **shall** navigate items and Enter activate.

**REQ-NOTIFY-A11Y-003 (Ubiquitous)**
The notification list rows on `/notifications` **shall** be `<article role="listitem">` within a `<section role="list" aria-label="알림 목록">`.

**REQ-NOTIFY-A11Y-004 (Event-Driven)**
**When** a notification is marked read via the toggle (without navigation), the system **shall** announce the change via an `aria-live="polite"` region (`"알림 1건 읽음 처리됨"`).

**REQ-NOTIFY-A11Y-005 (Optional Feature)**
**Where** the user has reduced-motion preference (`prefers-reduced-motion: reduce`), dropdown open/close **shall** skip animation.

---

## 3. 비기능 요구사항 (Non-Functional Requirements)

### 3.1 성능

- 헤더 종 아이콘 카운트 쿼리 (`getUnreadCount`): P95 < 50ms (인덱스 `idx_notifications_recipient_unread` 활용)
- Dropdown fetch (`getRecentNotifications LIMIT 10`): P95 < 100ms
- 전체 알림 페이지 첫 페인트: P95 < 800ms (RSC SSR)
- Lazy 트리거 검사 (`checkAssignmentOverdue` + `checkDdayUnprocessed` 1회 사이클): P95 < 500ms (대량 DB 시 별도 인덱스 검토)

### 3.2 보안

- RLS 의존: SPEC-DB-001 정책 그대로 사용. 본 SPEC 코드는 anon key 직접 접근 금지, 모든 쿼리는 서버 측 Supabase 클라이언트 (SSR cookies)로 수행
- service-role key는 emit 시 사용 금지 (operator/admin INSERT 정책으로 충분); cron 도입 시 별도 검토
- 사용자 입력(`title`, `body`)은 모두 서버 측 zod 검증; XSS는 React 자동 escape에 의존하되 `body`에 마크다운/HTML 미허용

### 3.3 관측성

- 모든 emit 호출이 1줄 콘솔 로그 (`NOTIF_LOG_PREFIX = '[notif]'`) — Vercel/CloudWatch 로그 검색 가능
- emit 실패 시 `console.error("[notify.emit] insert failed", { type, recipientId, error })` — alerting 훅
- 트리거 실행 시 `console.info("[notify.trigger] <name> emitted N, skipped M (dedup)")` 요약 로그

### 3.4 접근성

- WCAG 2.1 AA
- 키보드 only 흐름 매뉴얼 검증

### 3.5 국제화 / 시간대

- 한국어 단일
- Asia/Seoul 표시 (`src/lib/format/datetime.ts` 재사용)
- 상대 시간 ("방금 전" / "N분 전" / "N시간 전" / "어제" / 절대 날짜) 한국어 포맷터 추가

---

## 4. 의존성 (Dependencies)

### 4.1 외부 선행 SPEC (이미 완료)

- ✅ SPEC-DB-001 (`status: completed`) — `notifications` 테이블, `notification_type` ENUM 5종, RLS 4종 정책, 인덱스 3종
- ✅ SPEC-AUTH-001 (`status: completed`) — `getCurrentUser()`, `requireUser()`, server-side Supabase client
- ✅ SPEC-LAYOUT-001 (`status: implemented`) — `<AppShell>` 헤더 슬롯 (종 아이콘 삽입 위치), UI 프리미티브 (`<Popover>`, `<DropdownMenu>`, `<Badge>`)
- ✅ SPEC-PROJECT-001 (`status: completed`) — `assignment_request` enum value 추가 마이그레이션, `assignInstructorAction` (lazy 트리거 호출 지점)
- ✅ SPEC-PAYOUT-001 (`status: completed`) — `mail-stub.ts` 콘솔 로그 형식 (regression baseline), `settlement_requested` 알림 발송 패턴
- ✅ SPEC-ME-001 (`status: completed`) — `addScheduleItemAction` (lazy 트리거 호출 지점)

### 4.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (마이그레이션 + 타입 + 상수) → 모든 후속 마일스톤의 선행
- M2 (emit 헬퍼 + queries + dedup) → M3·M4·M5의 선행
- M3 (4종 트리거 모듈) → M4 (기존 도메인 통합)·M6 (테스트)의 선행
- M4 (기존 도메인 emit 통합) → M5 (UI)·M6의 선행
- M5 (UI 컴포넌트 + 페이지) → M6 (통합 테스트)의 선행
- M6 (테스트 + 회귀 검증) — 마지막

### 4.3 후속 SPEC을 위한 산출물 약속

- `emitNotification(supabase, payload)` 인터페이스는 SPEC-EMAIL-001이 동일 시그니처에 메일 어댑터 chain 추가
- `src/lib/notifications/triggers/` 모듈은 SPEC-CRON-001이 `pg_cron` 또는 Edge Function에서 동일 함수 호출
- `NOTIFICATION_TYPE_LABEL` 상수는 SPEC-NOTIFY-PREFERENCE-XXX(알림 환경설정)이 채택
- `NOTIF_LOG_PREFIX` + `[notif] <type> → ...` 로그 형식은 후속 모든 알림 발신자가 준수해야 함

---

## 5. 기술적 접근 (Technical Approach)

### 5.1 emit 헬퍼 시그니처

```ts
// src/lib/notifications/emit.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NOTIF_LOG_PREFIX } from "./constants";
import { hasRecentDuplicate } from "./dedup";

export const emitPayloadSchema = z.object({
  recipientId: z.string().uuid(),
  type: z.enum([
    "assignment_request",
    "assignment_overdue",
    "schedule_conflict",
    "low_satisfaction_assignment",
    "dday_unprocessed",
    "settlement_requested",
  ]),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  linkUrl: z.string().regex(/^\//).optional(),
  dedupKey: z.string().optional(),
  logContext: z.string().optional(), // 콘솔 로그의 free-form context (e.g., "settlement_id=<uuid>")
});

export type EmitPayload = z.infer<typeof emitPayloadSchema>;

export type EmitResult =
  | { ok: true; id: string }
  | { ok: false; error: string; reason: "validation" | "duplicate" | "rls" | "db" };

export async function emitNotification(
  supabase: SupabaseClient,
  payload: EmitPayload,
): Promise<EmitResult> {
  const parsed = emitPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "알림 페이로드 검증 실패", reason: "validation" };
  }

  if (parsed.data.dedupKey) {
    const dup = await hasRecentDuplicate(supabase, parsed.data, 24);
    if (dup) return { ok: false, error: "중복 알림", reason: "duplicate" };
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      recipient_id: parsed.data.recipientId,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      link_url: parsed.data.linkUrl ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[notify.emit] insert failed", {
      type: parsed.data.type,
      recipientId: parsed.data.recipientId,
      error,
    });
    return {
      ok: false,
      error: "알림 저장 실패",
      reason: error.code === "42501" ? "rls" : "db",
    };
  }

  // 콘솔 로그 — 기존 형식 보존
  const ctx = parsed.data.logContext ?? `recipient_id=${parsed.data.recipientId}`;
  console.log(
    `${NOTIF_LOG_PREFIX} ${parsed.data.type} → ${ctx}`,
  );

  return { ok: true, id: (data as { id: string }).id };
}
```

### 5.2 dedup 가드 — DB 기반

`notifications` 테이블에 별도 `dedup_key` 컬럼을 **추가하지 않는다** (마이그레이션 최소화). 대신 `(recipient_id, type, link_url)` 조합을 proxy 키로 사용하여 24h 내 중복 검사:

```ts
// src/lib/notifications/dedup.ts
export async function hasRecentDuplicate(
  supabase: SupabaseClient,
  payload: { recipientId: string; type: string; linkUrl?: string },
  withinHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  const q = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", payload.recipientId)
    .eq("type", payload.type)
    .gte("created_at", since);
  if (payload.linkUrl) q.eq("link_url", payload.linkUrl);
  const { count } = await q;
  return (count ?? 0) > 0;
}
```

후속 SPEC에서 트리거 빈도가 높아지면 `dedup_key` 컬럼 + 부분 unique 인덱스 도입 검토.

### 5.3 트리거 호출 지점 표

| 호출 지점 | 트리거 함수 | 발행 시점 | 변경 LoC |
|---------|------------|----------|---------|
| `src/app/(app)/(operator)/projects/[id]/actions.ts` `assignInstructorAction` 성공 직후 | `checkLowSatisfaction(supabase, instructorId)` + `checkScheduleConflict(supabase, instructorId, range)` | 배정 요청 직후 | +4줄 |
| `src/app/(app)/(instructor)/me/schedule/actions.ts` `addScheduleItemAction` 성공 직후 | `checkScheduleConflict(supabase, instructorId, range)` | 일정 등록 직후 | +2줄 |
| `src/lib/notifications/queries.ts` `getUnreadCount` 호출 (operator role + 5min cooldown) | `checkAssignmentOverdue` + `checkDdayUnprocessed` | 종 아이콘 fetch 시 | +5줄 |

기존 도메인 코드의 변경 범위는 **emit 호출 1~2줄 + 트리거 호출 1~2줄 = 총 2~4줄/지점**. LESSON-002 (미구현 플레이스홀더 방지) 준수: 모든 호출 지점은 실제 동작 + 회귀 테스트로 검증.

### 5.4 emit 헬퍼로의 통합 — `mail-stub.ts` 변경 패턴

```ts
// src/lib/payouts/mail-stub.ts (BEFORE)
const { data, error } = await supabase
  .from("notifications")
  .insert({ recipient_id: userId, type: "settlement_requested", title, body, link_url: "/me/payouts" })
  .select("id").single();
if (error) { ... }
console.log(`${NOTIF_LOG_PREFIX} settlement_requested → instructor_id=${input.instructorId} settlement_id=${input.settlementId}`);

// AFTER
const r = await emitNotification(supabase, {
  recipientId: userId,
  type: "settlement_requested",
  title,
  body,
  linkUrl: "/me/payouts",
  logContext: `instructor_id=${input.instructorId} settlement_id=${input.settlementId}`,
});
if (!r.ok) return { ok: false, error: PAYOUT_ERRORS.MAIL_STUB_FAILED };
return { ok: true, notificationId: r.id };
```

회귀 테스트 (`payouts/__tests__/mail-stub.test.ts`)의 `LOG_RE` 정규식 PASS 유지가 핵심.

### 5.5 마이그레이션 (선택, 필요 시 도입)

`20260428200000_notifications_helper_indexes.sql` (선택):

```sql
-- 트리거 lazy 검사 시 dedup 쿼리 최적화 (실측 후 도입 결정)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_created
  ON notifications (recipient_id, type, created_at DESC);
```

기존 RLS는 변경 없음. SPEC-DB-001 §RLS의 4종 정책 그대로 사용.

---

## 6. 위험 (Risks)

| 위험 | 영향 | 대응 |
|------|------|------|
| 기존 `mail-stub.ts` 콘솔 로그 형식 변경 → SPEC-NOTIFY-001 hook 회귀 | High | REQ-NOTIFY-EMIT-007: `LOG_RE` 정규식 회귀 테스트 PASS 강제. emit 헬퍼의 `logContext` 필드로 free-form 형식 보존 |
| 산재 INSERT 코드 통합 시 RLS deny 패턴 변경 가능성 | Medium | M2에서 emit 단위 테스트로 deny 시나리오(RLS 위반 case) 검증; 통합 후 mail-stub/projects assign 두 위치 회귀 테스트 PASS |
| Lazy 트리거 검사로 인한 페이지 응답 지연 | Medium | 5분 rate limit + 인덱스 활용으로 P95 < 500ms; in-memory Map 사용 (서버리스 환경에서는 cold start마다 reset되지만 dedup 가드가 중복 INSERT 방지) |
| 트리거 dedup 가드 race condition (동시 emit 2건) | Low | DB 단위 unique 보장 X (성능 우선); 1건 잉여 INSERT 허용. 후속 SPEC에서 `dedup_key` 컬럼 + partial unique index 도입 검토 |
| `notifications` 테이블 무한 증가 → 페이지네이션 성능 저하 | Medium | 본 SPEC은 archive 미제공; 후속 SPEC-NOTIFY-CLEANUP-XXX에서 90일 이상 + read_at NOT NULL 행 정리 cron 추가 |
| 알림 폭증 (operator가 많은 프로젝트 보유 시) | Low | dedup 가드로 동일 entity 24h 1회 제한 + UI에서 그룹화는 후속 SPEC |

---

## 7. 미정 사항 (Open Questions)

1. **`logContext` 필드명**: emit payload의 free-form 컨텍스트 필드명을 `logContext`로 할지 `logKey`로 할지 — 코드 리뷰에서 결정. 기본값 `logContext`.
2. **dedup_key 컬럼 도입 여부**: §5.2의 proxy 키 방식이 충분한지 트리거 도입 후 1주 운영 데이터로 판단. 도입 시 마이그레이션 추가.
3. **lazy 검사 rate limit 저장소**: in-memory Map (서버리스 cold start 영향) vs DB user metadata 컬럼 — MVP는 in-memory + DB dedup 가드로 충분. 측정 후 결정.
4. **트리거 lazy hook을 `getUnreadCount`에 박을지 별도 함수로 분리할지**: M3 구현 시 결정. UI fetch와 트리거 실행이 결합되면 fetch 지연 위험.

---

## 8. 참조 (References)

- `.moai/project/product.md` §3.1 [F-002], §3.6 [F-206], §시나리오 D
- SPEC-DB-001 (`status: completed`) — `notifications` 테이블·ENUM·RLS·인덱스
- SPEC-AUTH-001 (`status: completed`) — `getCurrentUser`, server Supabase client
- SPEC-LAYOUT-001 (`status: implemented`) — `<AppShell>` 헤더, UI 프리미티브
- SPEC-PROJECT-001 (`status: completed`) — `assignment_request` 마이그레이션, `assignInstructorAction`
- SPEC-PAYOUT-001 (`status: completed`) — `mail-stub.ts` 콘솔 로그 형식
- SPEC-ME-001 (`status: completed`) — `addScheduleItemAction`
- LESSON-002 (auto-memory) — 미구현 플레이스홀더 방지
- LESSON-003 (auto-memory) — 인증/가드 회귀 즉시 테스트
- `supabase/migrations/20260427000030_initial_schema.sql:291-300` — `notifications` 테이블 정의
- `supabase/migrations/20260427000060_rls_policies.sql:383-395` — RLS 정책
- `supabase/migrations/20260427000091_notification_type_assignment_request.sql` — `assignment_request` enum 추가

---

Version: 1.0.0
Status: completed
Last Updated: 2026-04-28

## Implementation Notes (2026-04-28, v1.0.0)

### 구현 결과
- **마이그레이션 0건** — `notifications` 테이블 + RLS 4종 + 인덱스 3종 SPEC-DB-001에서 완비
- **신규 모듈** (`src/lib/notifications/`): types/constants/errors/validation/dedup/emit/queries/list-query (8 + barrel) + triggers/{assignment-overdue, schedule-conflict, low-satisfaction, dday-unprocessed, rate-limit, types, index}
- **단위 테스트**: 55건 신규 PASS (총 512/512)
- **UI** (`src/components/notification-center/`): NotificationBell(RSC) + NotificationDropdown(Popover) + NotificationItem + NotificationFiltersBar + MarkAllReadButton + Pagination
- **페이지**: `/notifications` 풀 리스트 (필터, 페이지네이션, 모두 읽음)
- **emit 호출 통합**: 5개 지점
  - `src/lib/payouts/mail-stub.ts` — direct INSERT → `emitNotification` (콘솔 로그 형식 보존)
  - `(operator)/projects/[id]/actions.ts` — assign 직후 + low-satisfaction + schedule-conflict 검사
  - `(instructor)/me/schedule/actions.ts` — createSchedule 직후 충돌 검사
  - `(app)/layout.tsx` + `app-shell.tsx` + `topbar.tsx` — `<NotificationBell />` slot 주입

### MX 태그 추가
- `@MX:ANCHOR` `emitNotification` (모든 도메인 INSERT 단일 진입점)
- `@MX:ANCHOR` `queries.ts` (헤더/페이지 fan_in)
- `@MX:NOTE` 트리거 4종 lazy 검사 의도
- `@MX:REASON` 콘솔 로그 형식 회귀 hook (mail-stub LOG_RE)

### Deferred Items
| 항목 | 이유 | 후속 |
|---|---|---|
| 통합 테스트 (DB-backed) | 시드 의존 | SPEC-E2E-001 합류 |
| `getUnreadCount` 내 lazy 트리거 hook | RSC 캐시 충돌 가능성 | 다음 PR |
| `dedup_key` 전용 컬럼 | race condition proxy 키만 사용 | 후속 마이그레이션 |
| pg_cron 트리거 자동 검사 | 인프라 미준비 | Phase 3+ |
| Playwright E2E 시나리오 1·2·3·8 | 본 SPEC 외 | SPEC-E2E-001 |

### 품질 게이트 결과
- typecheck: 0 errors
- test:unit: 512/512 PASS (NOTIFY 신규 55 + 기존 457 회귀)
- lint: 0 errors (기존 7 warnings 동일)
- build: SUCCESS (`/notifications` Dynamic 라우트 등록)
- mail-stub `LOG_RE` 정규식 회귀 매칭 PASS (콘솔 로그 형식 보존 검증)
