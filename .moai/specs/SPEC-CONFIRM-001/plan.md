---
spec_id: SPEC-CONFIRM-001
version: 0.2.0
created: 2026-04-29
updated: 2026-04-29
author: 철
---

# Plan: SPEC-CONFIRM-001 강사 응답 시스템 구현 계획

## HISTORY

- **2026-04-29 (v0.2.0)**: plan-auditor FAIL 결정에 따른 spec.md v0.2.0 정합. (1) M1 마이그레이션 3종으로 확장 (instructor_responses + notification_types + notifications_idempotency); (2) M1 schema 수정: `source_id uuid NOT NULL` → `project_id uuid NULL FK + proposal_inquiry_id uuid NULL FK + CHECK XOR + 두 partial UNIQUE 인덱스`; (3) M1 status enum: `{pending, accepted, declined, conditional}` → `{accepted, declined, conditional}` (DEFAULT 제거); (4) M3 Server Action에 `validateTransition` 호출 강제 + REQ-CONFIRM-EFFECTS-008 보상 트랜잭션 신규 작업; (5) M3 의존성: SPEC-PROJECT-AMEND-001(후속) — `assignment_confirmed → assignment_review` 역방향 전환 그래프 추가. 후속 SPEC 미머지 시 `__bypassValidateTransitionForResponseDowngrade` documented bypass 사용; (6) M6 통합 테스트 14 시나리오로 확장 (accept→downgrade 보상, idempotency 정확히-1, CHECK XOR 위반, FK CASCADE, BEFORE UPDATE trigger, EXPLAIN ANALYZE).
- **2026-04-29 (v0.1.0)**: 초기 작성.

## 1. 개요

본 plan은 SPEC-CONFIRM-001 `instructor_responses` 통합 응답 모델 + `/me/inquiries` + `/me/assignments` 라우트 + 수락 부수효과 + 5종 신규 알림 enum + 1시간 변경 윈도를 구현하기 위한 6 마일스톤으로 분해한다. 시간 추정은 사용하지 않으며, 우선순위 라벨(High/Medium/Low) + 의존성 그래프로 작업 순서를 결정한다.

브라운필드 환경(Next.js 16 + Supabase + Drizzle 기존 코드베이스) + DDD 모드(quality.development_mode = ddd)에 맞춰 ANALYZE-PRESERVE-IMPROVE 사이클을 각 마일스톤에 적용한다.

---

## 2. 마일스톤 분해

### M1: DB 마이그레이션 + 도메인 골격 (priority: High)

**목표**: `instructor_responses` 테이블 + 5개 enum value 추가 + 도메인 타입/순수 함수 골격 작성. 이 마일스톤이 후속 모든 마일스톤의 진입 의존성이다.

**선행 조건**:
- SPEC-DB-001 머지 완료 (`notifications`, `schedule_items` 테이블 존재)
- SPEC-PROJECT-001 머지 완료 (`notification_type` enum 기존 값 + `assignment_request` 추가됨)
- SPEC-PROPOSAL-001 머지 상태 확인 (`/me/inquiries` 의존성, M2와 분기 가능)

**작업 항목**:
1. `supabase/migrations/20260429000010_instructor_responses.sql` 작성 — HIGH-1 + MEDIUM-5 schema 적용
   - `CREATE TABLE instructor_responses` + 컬럼 10종 (id, source_kind, project_id, proposal_inquiry_id, instructor_id, status, conditional_note, responded_at, created_at, updated_at)
   - 두 nullable FK: `project_id REFERENCES projects(id) ON DELETE CASCADE`, `proposal_inquiry_id REFERENCES proposal_inquiries(id) ON DELETE CASCADE`
   - `CHECK instructor_responses_source_xor` (source_kind ↔ FK 일관성)
   - `CHECK status IN ('accepted','declined','conditional')` (no DEFAULT, no 'pending')
   - 두 partial UNIQUE 인덱스 (`uniq_instructor_responses_assignment`, `uniq_instructor_responses_inquiry`)
   - 일반 인덱스 `idx_instructor_responses_by_instructor (instructor_id, status)`
   - RLS enable + policy `instructor_responses_self_only` (SELECT/INSERT/UPDATE/DELETE)
   - BEFORE UPDATE trigger `set_updated_at_instructor_responses`
2. `supabase/migrations/20260429000011_notification_types_confirm.sql` 작성
   - 5개 `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '<value>'`
3. `supabase/migrations/20260429000012_notifications_idempotency.sql` 작성 — HIGH-3 fix
   - `ALTER TABLE notifications ADD COLUMN source_kind text NULL, ADD COLUMN source_id uuid NULL`
   - `CREATE UNIQUE INDEX idx_notifications_idempotency` (partial WHERE both NOT NULL)
4. 마이그레이션 검증
   - `pnpm db:migrate` 로컬 PASS
   - `psql` REPL에서 RLS policy 검증 (instructor B → instructor A row 0건 SELECT)
   - CHECK XOR 위반 INSERT 시 23514 에러 검증
   - 두 partial UNIQUE 인덱스 동작 검증 (`EXPLAIN`로 인덱스 사용 확인)
   - notifications 신규 컬럼 추가 + 기존 row 무회귀 검증
5. `src/lib/responses/types.ts` 작성
   - `ResponseSourceKind`, `ResponseStatus = 'accepted' | 'declined' | 'conditional'` (3-state, MEDIUM-5)
   - `InstructorResponse`, `ResponseSideEffectResult` 등
6. `src/lib/responses/state-machine.ts` 작성
   - `validateStatusTransition(from: ResponseStatus | null, to: ResponseStatus)` (null = 미응답)
   - `isWithinChangeWindow(respondedAt, now?)` + `CHANGE_WINDOW_HOURS = 1`
7. `src/lib/responses/notification-mapping.ts` 작성
   - `mapResponseToNotificationType(sourceKind, status)` 6 매핑 케이스 (LOW-7: 2 source_kind × 3 status)
8. `src/lib/responses/errors.ts` 작성 — 한국어 에러 상수 12종+
9. `src/lib/responses/index.ts` public re-export

**산출물**:
- 3개 마이그레이션 파일 (HIGH-1, HIGH-3 신규 포함)
- 5개 도메인 모듈 (types/state-machine/notification-mapping/errors/index)

**Deferred**: side-effects.ts는 M3 시점에 작성 (배정 부수효과 정책이 명확해진 후).

---

### M2: 단위 테스트 + side-effects 순수 함수 (priority: High)

**목표**: 도메인 순수 함수 100% 커버리지로 라이프사이클 + 부수효과 로직을 검증한다.

**선행 조건**: M1 완료

**작업 항목**:
1. `src/lib/responses/side-effects.ts` 작성
   - `computeAssignmentAcceptanceEffects(project)` — schedule_items[] + nextStatus 산출
   - `computeInquiryAcceptanceEffects(inquiry)` — `inquiryStatus = 'accepted'` 단순 반환
   - `computeAssignmentDowngradeEffects(project, fromStatus: 'accepted', toStatus: 'declined' | 'conditional')` — HIGH-2 보상 효과: `projects.instructor_id = NULL`, `projects.status = 'assignment_review'`, schedule_items DELETE 대상 산출 (REQ-CONFIRM-EFFECTS-008)
2. `tests/unit/responses/state-machine.test.ts` — 3-state 전환 매트릭스 (null + 3상태) + 1시간 boundary (5 케이스: 정확히 1h, 59:59, 1:00:01, 0초, null)
3. `tests/unit/responses/side-effects.test.ts` — 배정 acceptance 시 schedule 1건 생성 / 사전 문의 acceptance는 schedule 0건 / education_start_at null 시 schedule skip / accept→downgrade 보상 효과 (HIGH-2)
4. `tests/unit/responses/notification-mapping.test.ts` — 6 매핑 케이스 (2 source_kind × 3 non-pending status, LOW-7)
5. `pnpm test:unit` PASS 확인 라인 커버리지 ≥ 85%

**산출물**:
- `src/lib/responses/side-effects.ts`
- 3개 단위 테스트 파일

---

### M3: DB Query Layer + Server Actions (priority: High)

**목표**: 트랜잭션 기반 응답 처리 + 부수효과 실행을 Server Action으로 구현한다. RLS는 user-scoped Supabase client로만 동작하도록 강제 (service-role 미사용).

**선행 조건**: M1, M2 완료

**작업 항목**:
1. `src/db/queries/responses/responses.ts` — `getMyResponses`, `upsertResponse`, `getLatestForSource`, `getExistingResponseForProject` (HIGH-2 downgrade detection)
2. `src/db/queries/responses/assignments.ts` — `getMyAssignmentRequests(instructorId)` (projects + clients + ai_instructor_recommendations + 최신 notifications + instructor_responses LEFT JOIN via `project_id`, HIGH-1)
3. `src/db/queries/responses/inquiries.ts` — `getMyInquiries(instructorId)` (proposal_inquiries + instructor_responses LEFT JOIN via `proposal_inquiry_id`) — SPEC-PROPOSAL-001 미머지 시 stub만 작성 후 M5에서 활성화
4. `src/app/(app)/(instructor)/me/assignments/actions.ts` — `respondToAssignment({ projectId, status, conditionalNote? })`
   - zod 검증 (conditional_note 5자 이상)
   - **MEDIUM-4**: status='accepted' 경로에서 `validateTransition('assignment_review', 'assignment_confirmed', { instructorId: self })` 호출 + `{ ok: false }` 시 한국어 reason 반환하고 abort
   - 기존 응답 조회 (`getExistingResponseForProject`) — 결과로 first-response 분기 vs downgrade 분기 결정
   - `db.transaction(async (tx) => { ... })` 블록
   - **First response 경로** (기존 응답 row 부재):
     - INSERT `instructor_responses` (project_id, proposal_inquiry_id=NULL, status, ...)
     - accepted 시: UPDATE projects + INSERT schedule_items + INSERT notifications (with source_kind='assignment_request', source_id=projectId, ON CONFLICT DO NOTHING) + console.log
     - declined/conditional 시: INSERT notifications + console.log
   - **Downgrade 경로** (REQ-CONFIRM-EFFECTS-008, HIGH-2):
     - 기존 status='accepted' AND 윈도 내 + 새 status='declined'/'conditional'
     - `validateTransition('assignment_confirmed', 'assignment_review', { instructorId: null })` 호출 → `{ ok: false }` 시 `__bypassValidateTransitionForResponseDowngrade` 호출 (with `console.warn` audit) — 후속 SPEC-PROJECT-AMEND-001로 정식 그래프 추가
     - UPDATE `instructor_responses` SET status, conditional_note, responded_at
     - UPDATE `projects` SET instructor_id=NULL, status='assignment_review', updated_at WHERE id=$projectId AND status='assignment_confirmed' (TOCTOU guard)
     - DELETE FROM `schedule_items` WHERE project_id=$projectId AND instructor_id=self AND schedule_kind='system_lecture'
     - INSERT 새 notifications row (with ON CONFLICT DO NOTHING, HIGH-3)
     - `console.warn('[response:downgrade] project_id=<uuid> instructor_id=<uuid> from=accepted to=<status>')`
   - operator user 삭제 케이스 처리 (notification skip + console.warn)
5. `src/app/(app)/(instructor)/me/inquiries/actions.ts` — `respondToInquiry({ inquiryId, status, conditionalNote? })` — M5에서 활성화 가능
   - 동일한 first-response / downgrade 분기 (downgrade 시 proposal_inquiries.status='pending' 복구, schedule_items 삭제는 no-op)
6. `src/lib/projects/status-machine.ts`에 `__bypassValidateTransitionForResponseDowngrade` 함수 신규 추가 — `// @MX:WARN @MX:REASON SPEC-PROJECT-AMEND-001 follow-up: backward transition not yet supported in ALLOWED_TRANSITIONS graph` 주석 명시
7. 한국어 에러 메시지 통합 (errors.ts 재사용)

**산출물**:
- 3개 query 모듈
- 2개 Server Action 모듈
- 1개 status-machine bypass 함수 (`@MX:WARN`)

**검증**: `pnpm typecheck` 0 에러, RLS user-scoped 보장 확인, accept→downgrade 보상 트랜잭션 단위 시뮬레이션 PASS

---

### M4: UI 컴포넌트 + `/me/assignments` 페이지 (priority: High)

**목표**: 강사가 정식 배정 요청을 보고 응답할 수 있는 UI를 구현한다. SPEC-PROPOSAL-001 의존성이 없으므로 본 마일스톤이 출시 가능 단위(release-cuttable).

**선행 조건**: M3 완료

**작업 항목**:
1. `src/components/instructor/response-panel.tsx` (client component)
   - 3 버튼 + conditional textarea + 1시간 카운트다운
   - 응답 변경 affordance ("응답 변경" 버튼 → 패널 재오픈)
   - final lock 상태 처리 (window 만료 시 disabled)
2. `src/components/instructor/assignment-card.tsx`
   - 프로젝트 제목, 클라이언트, 일정, 사업비, 추천 rank, 요청 시각, ResponsePanel 마운트
3. `src/components/instructor/response-history-badge.tsx` — final lock 배지
4. `src/app/(app)/(instructor)/me/assignments/page.tsx` (server component)
   - `requireRole('instructor')`
   - `getMyAssignmentRequests` 호출
   - 카드 리스트 렌더 + 빈 상태 한국어 메시지
5. `src/app/(app)/(instructor)/me/assignments/loading.tsx` Suspense fallback
6. 사이드바 placeholder — `src/components/app/sidebar.tsx` instructor 메뉴에 "배정 요청" 추가
7. axe DevTools 검증 (critical 0)

**산출물**:
- 3개 UI 컴포넌트
- `/me/assignments` 라우트 (page + loading + actions)

---

### M5: `/me/inquiries` 페이지 (SPEC-PROPOSAL-001 의존) (priority: Medium)

**목표**: 사전 가용성 문의 inbox 출시. SPEC-PROPOSAL-001 머지 완료 시점에 활성화한다.

**선행 조건**: M1, M2, M3 완료 + SPEC-PROPOSAL-001 머지 완료 (`proposal_inquiries` 테이블 존재)

**작업 항목**:
1. M3에서 stub 작성한 `getMyInquiries` query 활성화 (실제 SQL 실행)
2. M3에서 stub 작성한 `respondToInquiry` Server Action 활성화 (트랜잭션: UPSERT response + UPDATE proposal_inquiries.status + INSERT notifications + console.log)
3. `src/components/instructor/inquiry-card.tsx` — 사전 문의 1건 카드 (제목, 시간 범위, 기술스택 태그, 운영자 메모, ResponsePanel)
4. `src/app/(app)/(instructor)/me/inquiries/page.tsx`
   - `getMyInquiries` 호출
   - 카드 리스트 + 빈 상태 한국어 메시지
   - URL filter `?status=pending` (default) 지원
5. `src/app/(app)/(instructor)/me/inquiries/loading.tsx`
6. 사이드바 placeholder — instructor 메뉴에 "사전 문의" 추가
7. axe DevTools 검증

**산출물**:
- `inquiry-card.tsx`
- `/me/inquiries` 라우트 (page + loading)
- 활성화된 inquiry query + action

---

### M6: 통합 테스트 + 회귀 검증 (priority: High)

**목표**: 운영자 → 강사 → 부수효과 end-to-end 시나리오 검증, 기존 SPEC들의 회귀 0건 확인.

**선행 조건**: M1-M4 완료 (M5는 옵션, SPEC-PROPOSAL-001 머지 시 포함)

**작업 항목**:
1. `tests/integration/responses-flow.test.ts` 작성 (14 시나리오 — spec.md §4.7 참조)
   - 시나리오 1: 운영자 배정 요청 → 강사 수락 → 부수효과 검증 (validateTransition 호출 포함, MEDIUM-4)
   - 시나리오 2: 강사 거절 (first response) → 운영자 알림 + projects 미변경
   - 시나리오 3: 강사 conditional → conditional_note 5자 미만 reject
   - 시나리오 4: 윈도 내 accept → decline 다운그레이드 → REQ-CONFIRM-EFFECTS-008 보상 트랜잭션 (projects.status reset, instructor_id NULL, schedule_items DELETE, 새 notif INSERT) — HIGH-2
   - 시나리오 5: 1시간 윈도 외 변경 시도 → reject 한국어 에러
   - 시나리오 6: instructor B가 instructor A row 접근 시도 → RLS 0행
   - 시나리오 7: schedule_items EXCLUSION 충돌 → 트랜잭션 롤백 + 응답 미저장
   - 시나리오 8: 더블 클릭 idempotency → instructor_responses 정확히 1행 + notifications 정확히 1행 (HIGH-3, "1개 또는 2개" → "정확히 1개")
   - 시나리오 9: notifications partial UNIQUE 동시 INSERT 정확히-1 검증 (HIGH-3)
   - 시나리오 10: instructor_responses CHECK XOR 위반 INSERT 시도 → 23514 (HIGH-1)
   - 시나리오 11: project_id CASCADE → instructor_responses 자동 삭제 (HIGH-1)
   - 시나리오 12: proposal_inquiry_id CASCADE 동일 (HIGH-1)
   - 시나리오 13: BEFORE UPDATE trigger updated_at 갱신 (REQ-RESPONSES-006, MEDIUM-6)
   - 시나리오 14: EXPLAIN ANALYZE on /me/inquiries query plan uses idx_instructor_responses_by_instructor (REQ-RESPONSES-002, MEDIUM-6)
2. acceptance.md 추가 시나리오 16, 17, 18 (MEDIUM-6) — URL filter, notFound URL tampering, ?include=history toggle
3. SPEC-PROJECT-001 회귀 검증 — `assignInstructor` Server Action 동작 무변경 확인
4. SPEC-AUTH-001 회귀 — `requireRole('instructor')` guard `/me/inquiries`, `/me/assignments` 모두 통과
5. SPEC-ME-001 회귀 — 기존 `/me/*` 라우트(dashboard, resume, calendar, settlements, settings) 동작 무변경
6. SPEC-PROJECT-AMEND-001 follow-up 작성/위임 결정 — bypass 경로 audit, validate_transition 그래프 보완 별도 SPEC으로 분리
7. `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 전체 PASS
8. Lighthouse Accessibility ≥ 95 (`/me/inquiries`, `/me/assignments`)
9. 콘솔 로그 포맷 검증 (5개 type 모두 정확한 형태) + `[response:downgrade]` audit 라인 포맷 검증

**산출물**:
- 통합 테스트 파일 1종
- 회귀 검증 리포트 (별도 문서 미작성, 본 plan 체크리스트로 추적)

---

## 3. 의존성 그래프

```
SPEC-DB-001 ✅ ──────┐
SPEC-AUTH-001 ✅ ────┤
SPEC-ME-001 ✅ ──────┤
SPEC-PROJECT-001 ✅ ─┤
                     ▼
                    [M1] DB + 도메인 골격
                     │
                     ▼
                    [M2] 단위 테스트 + side-effects
                     │
                     ▼
                    [M3] Query + Server Actions
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
       [M4] /me/assignments    [M5] /me/inquiries (대기: SPEC-PROPOSAL-001)
        │                         │
        └────────────┬────────────┘
                     ▼
                    [M6] 통합 테스트 + 회귀 검증
```

---

## 4. 우선순위 라벨

| 마일스톤 | 우선순위 | 출시 단위 | 비고 |
|---------|---------|----------|------|
| M1 | High | 인프라 | 모든 후속 차단 |
| M2 | High | 인프라 | 도메인 신뢰성 보장 |
| M3 | High | 백엔드 | 트랜잭션 + 부수효과 핵심 |
| M4 | High | 출시 가능 | 정식 배정 요청 단독 출시 가능 |
| M5 | Medium | 출시 가능 | SPEC-PROPOSAL-001 의존 |
| M6 | High | 검증 | 회귀 방지 |

---

## 5. 기술 접근 (요약 — spec.md §5 참조)

- **통합 테이블 모델**: `instructor_responses` + `source_kind` discriminator + 두 nullable FK + CHECK XOR (HIGH-1, spec.md §5.1)
- **트랜잭션 패턴**: `db.transaction(async (tx) => { ... })` Drizzle 블록, UPSERT + 부수효과 + notification 단일 atomic
- **3-state 라이프사이클**: `{accepted, declined, conditional}` (MEDIUM-5, "pending" = row 부재)
- **Idempotency (응답)**: 두 partial UNIQUE 인덱스 (HIGH-1) `(project_id, instructor_id)` / `(proposal_inquiry_id, instructor_id)` + `ON CONFLICT DO UPDATE WHERE within_window`
- **Idempotency (알림)**: partial UNIQUE 인덱스 (HIGH-3) `(recipient_user_id, source_kind, source_id, type) WHERE source_kind IS NOT NULL AND source_id IS NOT NULL` + `ON CONFLICT DO NOTHING`
- **validateTransition 호출 (MEDIUM-4)**: 모든 projects.status 변경 직전에 호출, WHERE 절은 TOCTOU concurrency guard로만 동작
- **Accept→Decline 보상 (HIGH-2)**: REQ-CONFIRM-EFFECTS-008 — 윈도 내 accept→decline 시 projects reset + schedule_items DELETE + notif 신규 INSERT 단일 트랜잭션. SPEC-PROJECT-001 ALLOWED_TRANSITIONS 미지원이므로 documented bypass + `console.warn` audit
- **1시간 윈도 enforcement**: DB 측 `now() - responded_at <= INTERVAL '1 hour'` (서버 timestamp만 신뢰)
- **conditional 매핑**: assignment_conditional → `assignment_declined` + body `[조건부]` 접두사 (spec.md §5.4)
- **truncation 1000자**: notif body conditional_note 부분 truncation 1000자 (LOW-8)
- **service-role 미사용**: 모든 query는 user-scoped client, RLS authoritative (SPEC-PROJECT-001 일관)
- **신규 외부 의존성 0건**: 기존 zod, drizzle-orm, @supabase/ssr 그대로

---

## 6. 위험 + 완화 (요약 — spec.md §8 참조)

| 위험 | 완화 |
|------|------|
| SPEC-PROPOSAL-001 미머지 | M5 분리, M4 단독 출시 |
| schedule_items EXCLUSION 충돌 | 트랜잭션 롤백 + 한국어 안내 + conditional 응답 안내 |
| enum 추가 마이그레이션 충돌 | `ADD VALUE IF NOT EXISTS` + 고유 prefix |
| 1시간 윈도 timezone drift | DB 측 enforcement만 신뢰 |
| RLS 누락 | M1 마이그레이션에 명시적 policy + M6 통합 테스트 검증 |
| operator user 삭제 | notification skip + console.warn, 응답은 commit |

---

## 7. Definition of Done (DoD)

각 마일스톤이 완료되었다고 선언하기 위한 조건:

### M1 DoD
- [ ] **3개** 마이그레이션 파일 머지 후 `pnpm db:migrate` PASS (HIGH-3 신규 포함)
- [ ] RLS policy 검증 (다른 instructor row 0행, DELETE 포함)
- [ ] 5개 enum value 모두 `enum_range(NULL::notification_type)`에 포함
- [ ] CHECK XOR 위반 INSERT 시 23514 (HIGH-1)
- [ ] 두 partial UNIQUE 인덱스 동작 검증 (`EXPLAIN`로 확인)
- [ ] notifications 신규 컬럼(source_kind, source_id) + idx_notifications_idempotency 존재
- [ ] status enum: 'pending' INSERT 시도 → CHECK 위반 (MEDIUM-5)
- [ ] 5개 도메인 모듈 `pnpm typecheck` 0 에러

### M2 DoD
- [ ] 3개 단위 테스트 파일 PASS
- [ ] 라인 커버리지 ≥ 85% (responses 모듈)

### M3 DoD
- [ ] Server Action `respondToAssignment` 트랜잭션 정상 동작 (first response + downgrade 양 분기)
- [ ] `validateTransition` 호출 코드 경로 확인 (MEDIUM-4)
- [ ] `__bypassValidateTransitionForResponseDowngrade` 함수 존재 + `@MX:WARN @MX:REASON` 주석 (HIGH-2)
- [ ] `pnpm typecheck` 0 에러
- [ ] service-role 미사용 확인 (`grep SUPABASE_SERVICE_ROLE_KEY src/app/(app)/(instructor)/me/`)

### M4 DoD
- [ ] `/me/assignments` 페이지 키보드 only 동작
- [ ] axe DevTools critical 0
- [ ] 빌드 PASS

### M5 DoD (옵션)
- [ ] `/me/inquiries` 페이지 동작 + SPEC-PROPOSAL-001 join 정상
- [ ] axe critical 0

### M6 DoD
- [ ] 통합 테스트 14 시나리오 PASS (HIGH-1/2/3, MEDIUM-4/5/6 모두 검증)
- [ ] 기존 SPEC 회귀 0건
- [ ] SPEC-PROJECT-AMEND-001 follow-up 트래킹 — assignment_confirmed → assignment_review 그래프 보완 작업 등록
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 전체 PASS
- [ ] Lighthouse Accessibility ≥ 95

---

## 8. 참고 자료

- [`spec.md`](./spec.md) — EARS 요구사항 + 기술 접근 + 위험
- [`acceptance.md`](./acceptance.md) — Given/When/Then 시나리오
- [`spec-compact.md`](./spec-compact.md) — REQ + GWT 요약
- `.moai/specs/SPEC-PROJECT-001/spec.md` — §2.7 deferred placeholder
- `.moai/specs/SPEC-DB-001/spec.md` — `notifications`, `schedule_items` 테이블

---

_End of SPEC-CONFIRM-001 plan.md_
