# SPEC-PAYOUT-002 Compact

ID: SPEC-PAYOUT-002
Title: 시간당 사업비 기반 자동 정산 산정 (Hourly-Rate-Based Settlement Automation)
Status: draft
Author: 철
Priority: high
Created / Updated: 2026-04-29

Extends (does not modify): SPEC-PAYOUT-001 (settlements 4-state machine, withholding tax CHECK, GENERATED columns, revenue widget)
Depends on: SPEC-DB-001 (settlements / projects / instructors schema + RLS), SPEC-PROJECT-001 (project_status enum + status machine), SPEC-AUTH-001 (`requireRole(['operator', 'admin'])`)

---

## EARS Requirements

### REQ-PAYOUT002-SESSIONS — lecture_sessions entity + CRUD + status transitions

- REQ-PAYOUT002-SESSIONS-001 (Ubiquitous): The system shall define a new table `lecture_sessions` with columns `id uuid PK`, `project_id uuid FK→projects RESTRICT`, `instructor_id uuid FK→instructors NULL`, `date date NOT NULL`, `hours numeric(4,1) NOT NULL CHECK (hours > 0)`, `status lecture_session_status NOT NULL DEFAULT 'planned'`, `original_session_id uuid self-FK NULL`, `notes text NULL`, timestamps + soft `deleted_at`.
- REQ-PAYOUT002-SESSIONS-002 (Ubiquitous): Define enum `lecture_session_status` with values `planned | completed | canceled | rescheduled`. Indexes on `(project_id, date)` and `(instructor_id, date)`.
- REQ-PAYOUT002-SESSIONS-003 (Ubiquitous): Validate `hours` to be a multiple of 0.5 via zod; non-multiples rejected with Korean error `"강의 시수는 0.5시간 단위로 입력해주세요."`.
- REQ-PAYOUT002-SESSIONS-004 (Event-Driven): WHEN operator submits the project form with new sessions, the system shall bulk INSERT/UPDATE in a single transaction.
- REQ-PAYOUT002-SESSIONS-005 (Unwanted Behavior): IF status is `completed`, `canceled`, or `rescheduled`, THEN status changes are rejected with `"종료된 강의 세션은 상태를 변경할 수 없습니다."`. Allowed transitions: `planned → completed/canceled/rescheduled`.
- REQ-PAYOUT002-SESSIONS-006 (Ubiquitous): Soft-deleted sessions (`deleted_at IS NOT NULL`) are excluded from operator UIs and settlement generation queries.

### REQ-PAYOUT002-PROJECT-FIELDS — projects.hourly_rate_krw + instructor_share_pct

- REQ-PAYOUT002-PROJECT-FIELDS-001 (Ubiquitous): Add `projects.hourly_rate_krw bigint NOT NULL DEFAULT 0 CHECK (>= 0)` and `projects.instructor_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 100)`.
- REQ-PAYOUT002-PROJECT-FIELDS-002 (Ubiquitous): Preserve existing `business_amount_krw` / `instructor_fee_krw` columns for backward compat with SPEC-PAYOUT-001 / SPEC-PROJECT-001; do NOT drop or rename.
- REQ-PAYOUT002-PROJECT-FIELDS-003 (Ubiquitous): `/projects/new` and `/projects/[id]/edit` forms include input fields with Korean labels `"시간당 사업비 (원)"` / `"강사 분배율 (%)"`.
- REQ-PAYOUT002-PROJECT-FIELDS-004 (Event-Driven): WHEN operator saves the form, persist values; settlement generation reads them at generation time.
- REQ-PAYOUT002-PROJECT-FIELDS-005 (Unwanted Behavior): IF `instructor_share_pct > 100` or `< 0`, THEN reject with `"강사 분배율은 0~100 사이여야 합니다."`.

### REQ-PAYOUT002-CALC — calculation pure functions

- REQ-PAYOUT002-CALC-001 (Ubiquitous): Define `src/lib/payouts/calculator.ts` exporting `calculateInstructorFeePerHour(hourlyRateKrw, sharePct) = floor(hourlyRateKrw × sharePct / 100)`, `calculateTotalBilledHours(sessions) = SUM(hours WHERE status='completed' AND deleted_at IS NULL)`, `calculateBusinessAmount(hourlyRateKrw, totalHours)`, `calculateInstructorFee(feePerHour, totalHours)`.
- REQ-PAYOUT002-CALC-002 (Ubiquitous): All functions return integer KRW; intermediate FP values floored, never rounded.
- REQ-PAYOUT002-CALC-003 (Ubiquitous): `calculateTotalBilledHours` includes only `completed` sessions; `planned`, `canceled`, `rescheduled` excluded.
- REQ-PAYOUT002-CALC-004 (Ubiquitous): Generate flow uses calculator output verbatim when INSERTing settlements; SPEC-PAYOUT-001 GENERATED columns auto-compute.
- REQ-PAYOUT002-CALC-005 (Ubiquitous): Unit tests cover at minimum: `(100000, 70) → 70000`, `(80000, 66.67) → floor(53336)`, sessions filter (`completed:2.0 + completed:1.5 + planned:1.0 + canceled:1.0 = 3.5`), edge cases `share_pct=0`, `hourly_rate=0`.

### REQ-PAYOUT002-GENERATE — operator-driven batch generation

- REQ-PAYOUT002-GENERATE-001 (Ubiquitous): Provide `/settlements/generate` route under `(app)/(operator)`, restricted to operator/admin via SPEC-AUTH-001 guard.
- REQ-PAYOUT002-GENERATE-002 (Ubiquitous): UI controls: period selector (month / quarter / arbitrary range), optional project filter, "정산 생성" button, preview table (project / instructor / total hours / business amount / instructor fee / flow).
- REQ-PAYOUT002-GENERATE-003 (Event-Driven): WHEN operator clicks "정산 생성", invoke `generateSettlementsForPeriod` Server Action that queries unbilled completed sessions, groups by project, computes amounts via calculator, INSERTs settlements (`status='pending'`) + INSERTs settlement_sessions links — all in a single DB transaction.
- REQ-PAYOUT002-GENERATE-004 (Ubiquitous): Server Action excludes GENERATED columns `profit_krw` and `withholding_tax_amount_krw` from INSERT payload.
- REQ-PAYOUT002-GENERATE-005 (State-Driven): WHILE preview is displayed, show count of unbilled sessions and projected totals; clicking "정산 생성" prompts confirmation `"기간 ${period}의 미청구 강의 ${count}건에 대해 ${projectCount}개 정산 행을 생성합니다. 계속하시겠습니까?"`.
- REQ-PAYOUT002-GENERATE-006 (Unwanted Behavior): IF no unbilled sessions exist, THEN show `"선택한 기간에 청구할 강의가 없습니다."` and INSERT 0 rows.
- REQ-PAYOUT002-GENERATE-007 (Ubiquitous): After success, redirect to `/settlements?period=$period`; new settlements are then operated by SPEC-PAYOUT-001's 1-click request flow.
- REQ-PAYOUT002-GENERATE-008 (Optional): WHERE project's settlement_flow is configured, default to that value; otherwise operator selects per project group.

### REQ-PAYOUT002-LINK — settlement_sessions junction (double-billing prevention)

- REQ-PAYOUT002-LINK-001 (Ubiquitous): Define `settlement_sessions` junction with `settlement_id uuid REFERENCES settlements ON DELETE CASCADE`, `lecture_session_id uuid REFERENCES lecture_sessions ON DELETE RESTRICT`, PK `(settlement_id, lecture_session_id)`, `created_at timestamptz NOT NULL DEFAULT now()`.
- REQ-PAYOUT002-LINK-002 (Ubiquitous): Index on `lecture_session_id` to support "is this session already billed?" lookup.
- REQ-PAYOUT002-LINK-003 (Ubiquitous): Generate flow filters out lecture_sessions whose id already exists in `settlement_sessions.lecture_session_id` (excluding soft-deleted settlements).
- REQ-PAYOUT002-LINK-004 (Event-Driven): WHEN settlement is hard-deleted, CASCADE removes settlement_sessions; WHEN soft-deleted (`deleted_at` set), settlement_sessions remain but generate excludes their linked sessions.
- REQ-PAYOUT002-LINK-005 (Unwanted Behavior): IF lecture_session referenced in junction is hard-deleted, THEN ON DELETE RESTRICT prevents deletion.

### REQ-PAYOUT002-EXCEPT — cancel / reschedule / instructor withdrawal

- REQ-PAYOUT002-EXCEPT-001 (Event-Driven, 결강): WHEN operator marks `planned → canceled`, the session is auto-excluded from subsequent settlement generations.
- REQ-PAYOUT002-EXCEPT-002 (Event-Driven, 일정 변경): WHEN operator clicks "다른 날로 옮김" with new date, transactionally UPDATE original `status='rescheduled'` and INSERT new lecture_sessions row with same `project_id` / `instructor_id` / `hours`, `status='planned'`, `original_session_id = original.id`, new `date`. New session billable when later marked `completed`.
- REQ-PAYOUT002-EXCEPT-003 (Event-Driven, 강사 중도 하차): WHEN operator clicks "강사 중도 하차" with reason text, transactionally UPDATE all `planned AND date >= CURRENT_DATE` sessions for the project to `canceled` (append reason to `notes`), UPDATE project status to `instructor_withdrawn` (new enum value). `completed` sessions remain billable.
- REQ-PAYOUT002-EXCEPT-004 (Ubiquitous): Show Korean confirmation dialog `"미래 ${count}건의 강의가 자동 취소됩니다. 계속하시겠습니까?"` before bulk-cancel; action does not proceed without explicit confirmation.
- REQ-PAYOUT002-EXCEPT-005 (Unwanted Behavior): IF operator attempts to revert `canceled` or `rescheduled` to `planned`/`completed`, THEN reject with `"종료된 강의 세션은 상태를 변경할 수 없습니다."`. To restore, create a new session row.
- REQ-PAYOUT002-EXCEPT-006 (Optional): WHERE project status is `instructor_withdrawn`, display a banner on the project detail page with reassignment link (handed off to SPEC-PROJECT-001 reassignment flow).

### REQ-PAYOUT002-RLS — role guards + data isolation

- REQ-PAYOUT002-RLS-001 (Ubiquitous): Apply RLS to `lecture_sessions` with policies: `lecture_sessions_admin_all` (admin FOR ALL), `lecture_sessions_operator_rw` (operator/admin SELECT/INSERT/UPDATE), `lecture_sessions_instructor_self_select` (instructor SELECT WHERE `instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())`).
- REQ-PAYOUT002-RLS-002 (Ubiquitous): Apply RLS to `settlement_sessions` with: `settlement_sessions_admin_all`, `settlement_sessions_operator_rw`, `settlement_sessions_instructor_self_select` (via join with instructor's own settlements).
- REQ-PAYOUT002-RLS-003 (Unwanted Behavior): IF instructor reaches `/settlements/generate`, THEN SPEC-AUTH-001 guard silent-redirects first; defense in depth: RLS prevents data exposure even if guard fails.
- REQ-PAYOUT002-RLS-004 (Ubiquitous): Do NOT introduce service-role Supabase client; all DB operations use user-scoped server client.

---

## Acceptance Scenarios (Given / When / Then)

### Scenario 1 — Sessions CRUD (planned → completed)
- Given: Operator creates a project with hourly_rate=100,000 / share_pct=70 and adds 2 sessions (2.0h each, planned).
- When: Operator saves, then marks the first session `completed` via edit form.
- Then: First session status = `completed`, second remains `planned`. Both rows exist in DB with `deleted_at IS NULL`.

### Scenario 2 — Day cancellation excluded from billing
- Given: Project X has 5 sessions in 2026-05 (4 completed, 1 canceled), hourly_rate=100,000 / share_pct=70.
- When: Operator generates settlement for period=2026-05.
- Then: Preview shows total 8.0h / 800,000원 / 강사비 560,000원 (canceled excluded). Settlement INSERTed with those values; settlement_sessions has 4 links.

### Scenario 3 — Reschedule case
- Given: Session A (2026-05-17, 2.0h, planned) exists.
- When: Operator clicks "다른 날로 옮김", inputs new date 2026-05-20, confirms.
- Then: A.status = `rescheduled`. New session B INSERTed with same project_id / instructor_id / hours, date=2026-05-20, status=`planned`, `original_session_id = A.id`. After B marked `completed`, generate includes B but excludes A.

### Scenario 4 — Operator batch generate (multi-project)
- Given: P1 (hourly=100,000 / share=70 / 3 completed sessions = 6h), P2 (hourly=80,000 / share=60 / 4 completed sessions = 8h), all in 2026-05, both flow=corporate.
- When: Operator clicks "정산 생성" with period=2026-05, no project filter.
- Then: 2 settlements INSERTed (P1: 600,000원 / 강사비 420,000원, P2: 640,000원 / 강사비 384,000원). 7 links created. Both `status='pending'`, `settlement_flow='corporate'`, `withholding_tax_rate=0`. GENERATED columns excluded from payload.

### Scenario 5 — Double-billing prevention (already-linked sessions skipped)
- Given: Scenario 4 completed; 2 settlements + 7 links exist.
- When: Operator generates again with same period=2026-05.
- Then: Preview empty. Korean message `"선택한 기간에 청구할 강의가 없습니다."`. 0 settlements INSERTed.

### Scenario 6 — Instructor mid-project withdrawal
- Given: Today=2026-05-15. Project X has 5 sessions (2 past completed, 3 future planned).
- When: Operator clicks "강사 중도 하차" with reason text, confirms.
- Then: 2 past completed sessions unchanged. 3 future planned sessions transitioned to `canceled` with reason in `notes`. Project status = `instructor_withdrawn`. Banner displayed on project detail. Subsequent generate bills only the 2 past completed sessions (4h × 100,000원).

### Scenario 7 — Hourly rate + share_pct calculation correctness
- Given: calculator.ts module imported.
- When: Calling `calculateInstructorFeePerHour(100000, 70)`, `(80000, 66.67)`, `(0, 70)`, `(100000, 0)`, `(100000, 100)`; `calculateTotalBilledHours` on mixed-status array; `calculateBusinessAmount(100000, 8.0)`; `calculateInstructorFee(70000, 8.0)`.
- Then: 70000, 53336, 0, 0, 100000, 3.5 (only completed counted), 800000, 560000. All integer.

### Scenario 8 — RLS: instructor cannot read other instructors' sessions
- Given: 2 lecture_sessions (session-1: instructor-A.id, session-2: instructor-B.id). Logged in as instructor-A.
- When: Instructor-A queries `SELECT * FROM lecture_sessions`.
- Then: Returns only session-1. Direct access to `/settlements/generate` is silent-redirected by SPEC-AUTH-001 guard. Defense in depth: RLS rejects writes even if guard fails.

### Scenario 9 (bonus) — SPEC-PAYOUT-001 preserved
- Given: Settlement-1 (`status='pending'`) created by Scenario 4.
- When: Operator clicks "정산 요청" then "입금 확인".
- Then: status `pending → requested → paid`, `payment_received_at` set, settlement_status_history auto-INSERT 2 rows, notifications INSERT 1 row, console log `[notif] settlement_requested → ...`. SPEC-PAYOUT-001's `held → paid` block, revenue widget aggregation all unchanged.

---

## Affected Files

### New Migrations (3 + 1 optional)
- `supabase/migrations/20260429xxxxxx_lecture_sessions.sql` — table + enum + indexes + RLS
- `supabase/migrations/20260429xxxxxx_projects_hourly_rate.sql` — ALTER projects ADD COLUMN
- `supabase/migrations/20260429xxxxxx_settlement_sessions_link.sql` — junction
- (optional) `supabase/migrations/20260429xxxxxx_project_status_instructor_withdrawn.sql` — enum value

### New Domain Modules
- `src/lib/sessions/{types,queries,status-machine,validation,errors,index}.ts`
- `src/lib/payouts/calculator.ts` (new)
- `src/lib/payouts/generate.ts` (new)
- `src/lib/payouts/__tests__/{calculator,generate}.test.ts`
- `src/lib/sessions/__tests__/{status-machine,validation,queries}.test.ts`

### Extended Modules (preserve SPEC-PAYOUT-001)
- `src/lib/payouts/{types,index}.ts` — types extension + barrel re-export
- `src/lib/projects/{validation,queries,status-machine}.ts` — add fields, integrate `instructor_withdrawn`

### New Routes
- `src/app/(app)/(operator)/settlements/generate/{page,actions}.ts`

### Extended Routes
- `src/app/(app)/(operator)/projects/{new,[id]/edit}/{page.tsx, actions.ts}` — hourly rate / share pct / session matrix / cancel / reschedule / withdraw

### New UI Components
- `src/components/projects/{SessionMatrixEditor,RescheduleDialog,InstructorWithdrawalDialog,HourlyRateField,InstructorSharePctField}.tsx`
- `src/components/payouts/{GenerateSettlementsForm,SettlementGeneratePreviewTable}.tsx`
- `src/components/sessions/LectureSessionStatusBadge.tsx`

### Unchanged (preserved)
- `src/lib/payouts/{status-machine,tax-calculator,aggregations,queries,mail-stub,errors}.ts` — SPEC-PAYOUT-001 산출물 보존
- `supabase/migrations/20260427000030_initial_schema.sql` — SPEC-DB-001 보존
- `src/auth/**` — SPEC-AUTH-001 보존
- `src/app/(app)/(instructor)/me/settlements/**` — SPEC-ME-001 보존 (instructor preview는 후속 SPEC)

---

## Exclusions (NOT in this SPEC)

- Auto cron / external scheduler for settlements → SPEC-PAYOUT-CRON-XXX
- KakaoTalk / actual email sending → SPEC-NOTIFY-001
- Settlement PDF statements → SPEC-PAYOUT-PDF-XXX
- Instructor-side dispute reporting UI → SPEC-PAYOUT-DISPUTE-XXX
- Hourly rate change history (audit) → SPEC-PAYOUT-AUDIT-XXX
- Client-direct instructor payment (`settlement_flow='client_direct'`) → SPEC-RECEIPT-001
- Instructor self-preview of upcoming settlement → SPEC-ME-002 / SPEC-ME-001 v2.x
- SPEC-PAYOUT-001 4-state machine / tax check / 1-click request / revenue widget → unchanged (preserved)
- Settlement deletion / unlink UI → out of scope (admin SQL or future SPEC)
- Operator entering instructor's own session reports → out of scope
- Hours granularity below 0.5 (0.25, 0.1) → 0.5 enforced (PM decision)
- i18n / multilingual → Korean only
- Mobile-only matrix UX → desktop first, SPEC-MOBILE-001 responsive guide only
- pgvector / semantic matching with sessions → future
- Manual `business_amount_krw` / `instructor_fee_krw` direct INSERT form → not provided (generate path only)

---

_End of spec-compact.md_
