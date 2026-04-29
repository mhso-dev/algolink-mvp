---
spec_id: SPEC-CONFIRM-001
version: 0.1.0
created: 2026-04-29
updated: 2026-04-29
author: 철
---

# Plan: SPEC-CONFIRM-001 강사 응답 시스템 구현 계획

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
1. `supabase/migrations/20260429000010_instructor_responses.sql` 작성
   - `CREATE TABLE instructor_responses` + 컬럼 9종
   - UNIQUE `(source_kind, source_id, instructor_id)`
   - 인덱스 `(instructor_id, status)`, `(source_kind, source_id)`
   - RLS enable + policy `instructor_responses_self_only`
   - BEFORE UPDATE trigger `set_updated_at`
2. `supabase/migrations/20260429000011_notification_types_confirm.sql` 작성
   - 5개 `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '<value>'`
3. 마이그레이션 검증
   - `pnpm db:migrate` 로컬 PASS
   - `psql` REPL에서 RLS policy 검증 (instructor B → instructor A row 0건 SELECT)
4. `src/lib/responses/types.ts` 작성
   - `ResponseSourceKind`, `ResponseStatus`, `InstructorResponse`, `ResponseSideEffectResult` 등
5. `src/lib/responses/state-machine.ts` 작성
   - `validateStatusTransition(from, to)`
   - `isWithinChangeWindow(respondedAt, now?)` + `CHANGE_WINDOW_HOURS = 1`
6. `src/lib/responses/notification-mapping.ts` 작성
   - `mapResponseToNotificationType(sourceKind, status)` 6개 케이스
7. `src/lib/responses/errors.ts` 작성 — 한국어 에러 상수 12종+
8. `src/lib/responses/index.ts` public re-export

**산출물**:
- 2개 마이그레이션 파일
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
2. `tests/unit/responses/state-machine.test.ts` — 4-state 전환 매트릭스 (12 케이스) + 1시간 boundary (5 케이스: 정확히 1h, 59:59, 1:00:01, 0초, null)
3. `tests/unit/responses/side-effects.test.ts` — 배정 acceptance 시 schedule 1건 생성 케이스, 사전 문의 acceptance는 schedule 0건, education_start_at null 시 schedule skip
4. `tests/unit/responses/notification-mapping.test.ts` — 6개 매핑 케이스 (assignment×3 + inquiry×3)
5. `pnpm test:unit` PASS 확인 라인 커버리지 ≥ 85%

**산출물**:
- `src/lib/responses/side-effects.ts`
- 3개 단위 테스트 파일

---

### M3: DB Query Layer + Server Actions (priority: High)

**목표**: 트랜잭션 기반 응답 처리 + 부수효과 실행을 Server Action으로 구현한다. RLS는 user-scoped Supabase client로만 동작하도록 강제 (service-role 미사용).

**선행 조건**: M1, M2 완료

**작업 항목**:
1. `src/db/queries/responses/responses.ts` — `getMyResponses`, `upsertResponse`, `getLatestForSource`
2. `src/db/queries/responses/assignments.ts` — `getMyAssignmentRequests(instructorId)` (projects + clients + ai_instructor_recommendations + 최신 notifications + instructor_responses LEFT JOIN)
3. `src/db/queries/responses/inquiries.ts` — `getMyInquiries(instructorId)` (proposal_inquiries + instructor_responses LEFT JOIN) — SPEC-PROPOSAL-001 미머지 시 stub만 작성 후 M5에서 활성화
4. `src/app/(app)/(instructor)/me/assignments/actions.ts` — `respondToAssignment({ projectId, status, conditionalNote? })`
   - zod 검증 (conditional_note 5자 이상)
   - `db.transaction(async (tx) => { ... })` 블록
   - UPSERT `instructor_responses` (ON CONFLICT WHERE within window)
   - accepted 시: UPDATE projects + INSERT schedule_items + INSERT notifications + console.log
   - declined/conditional 시: INSERT notifications + console.log
   - operator user 삭제 케이스 처리 (notification skip + console.warn)
5. `src/app/(app)/(instructor)/me/inquiries/actions.ts` — `respondToInquiry({ inquiryId, status, conditionalNote? })` — M5에서 활성화 가능
6. 한국어 에러 메시지 통합 (errors.ts 재사용)

**산출물**:
- 3개 query 모듈
- 2개 Server Action 모듈

**검증**: `pnpm typecheck` 0 에러, RLS user-scoped 보장 확인

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
1. `tests/integration/responses-flow.test.ts` 작성
   - 시나리오 1: 운영자 배정 요청 → 강사 수락 → 6종 부수효과 검증
   - 시나리오 2: 강사 거절 → 운영자 알림 + projects 미변경
   - 시나리오 3: 강사 conditional → conditional_note 5자 미만 reject
   - 시나리오 4: 1시간 윈도 내 응답 변경 → UPDATE existing row + 새 notification INSERT
   - 시나리오 5: 1시간 윈도 외 변경 시도 → reject 한국어 에러
   - 시나리오 6: instructor B가 instructor A row 접근 시도 → RLS 0행
   - 시나리오 7: schedule_items EXCLUSION 충돌 → 트랜잭션 롤백 + 응답 미저장
   - 시나리오 8: 더블 클릭 idempotency → 단일 row만 존재
2. SPEC-PROJECT-001 회귀 검증 — `assignInstructor` Server Action 동작 무변경 확인
3. SPEC-AUTH-001 회귀 — `requireRole('instructor')` guard `/me/inquiries`, `/me/assignments` 모두 통과
4. SPEC-ME-001 회귀 — 기존 `/me/*` 라우트(dashboard, resume, calendar, settlements, settings) 동작 무변경
5. `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build` 전체 PASS
6. Lighthouse Accessibility ≥ 95 (`/me/inquiries`, `/me/assignments`)
7. 콘솔 로그 포맷 검증 (5개 type 모두 정확한 형태)

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

- **통합 테이블 모델**: `instructor_responses` + `source_kind` discriminator (옵션 A 채택, spec.md §5.1)
- **트랜잭션 패턴**: `db.transaction(async (tx) => { ... })` Drizzle 블록, UPSERT + 부수효과 + notification 단일 atomic
- **Idempotency**: UNIQUE `(source_kind, source_id, instructor_id)` + `ON CONFLICT DO UPDATE WHERE within_window`
- **1시간 윈도 enforcement**: DB 측 `now() - responded_at <= INTERVAL '1 hour'` (서버 timestamp만 신뢰)
- **conditional 매핑**: assignment_conditional → `assignment_declined` + body `[조건부]` 접두사 (spec.md §5.4)
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
- [ ] 2개 마이그레이션 파일 머지 후 `pnpm db:migrate` PASS
- [ ] RLS policy 검증 (다른 instructor row 0행)
- [ ] 5개 enum value 모두 `enum_range(NULL::notification_type)`에 포함
- [ ] 5개 도메인 모듈 `pnpm typecheck` 0 에러

### M2 DoD
- [ ] 3개 단위 테스트 파일 PASS
- [ ] 라인 커버리지 ≥ 85% (responses 모듈)

### M3 DoD
- [ ] Server Action `respondToAssignment` 트랜잭션 정상 동작
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
- [ ] 통합 테스트 8 시나리오 PASS
- [ ] 기존 SPEC 회귀 0건
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
