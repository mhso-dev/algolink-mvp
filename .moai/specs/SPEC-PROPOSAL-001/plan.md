# SPEC-PROPOSAL-001 Implementation Plan

## Methodology

**Mode**: TDD (Test-Driven Development) — `quality.development_mode: tdd` 디폴트.
**Reason**: 본 SPEC은 신규 도메인 추가(brownfield enhancement)이며 기존 SPEC-PROJECT-001 / SPEC-RECOMMEND-001 / SPEC-DB-001의 frozen 약속을 보호해야 한다. 순수 함수 도메인(`status-machine`, `inquiry`, `convert`, `signal`)은 RED-GREEN-REFACTOR 사이클로, Server Action 통합은 characterization 테스트로 검증한다.

## Milestones

본 SPEC은 7개 마일스톤으로 분해한다. 각 마일스톤은 독립적으로 검증 가능하며, 우선순위 기반으로 순차 실행한다.

---

### M1: Migration + Schema (Priority: High)

**Scope**: DB 마이그레이션 6건 + Drizzle schema 등록.

**Deliverables**:
- `supabase/migrations/20260429000010_proposals.sql` — `proposal_status` enum + `proposals` 테이블 + `proposal_required_skills` junction + `pg_trgm` 인덱스
- `supabase/migrations/20260429000020_proposal_inquiries.sql` — `inquiry_status` enum + `proposal_inquiries` 테이블 + 인덱스 + unique 제약
- `supabase/migrations/20260429000030_notification_inquiry_request.sql` — `ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inquiry_request';`
- `supabase/migrations/20260429000040_proposal_attachments_bucket.sql` — Storage bucket + `file_kind` enum value (필요 시) + Storage RLS
- `supabase/migrations/20260429000050_proposals_rls.sql` — `proposals` / `proposal_required_skills` / `proposal_inquiries` RLS 정책
- `supabase/migrations/20260429000060_instructor_inquiry_history_view.sql` — `prior_accepted_count` 시그널 view
- `src/db/schema/proposals.ts` (신규) — Drizzle 모델 export
- `src/db/schema/index.ts` (수정) — export 추가

**Success Criteria**:
- `npx supabase start && pnpm db:reset` 0 에러
- `pnpm db:verify` 기존 18/18 PASS 유지 + 본 SPEC 신규 검증 항목 PASS
- `instructor_inquiry_history` view SELECT 동작 (빈 결과 셋 OK)
- 모든 신규 테이블 RLS 활성화 + default-deny 확인

**Dependencies**: 없음 (선두 마일스톤)

**Risks**: SPEC-DB-001 기존 마이그레이션 충돌 가능성 → timestamp prefix `20260429xxxxxx`로 분리, idempotent SQL 사용.

---

### M2: 도메인 순수 함수 + 단위 테스트 (Priority: High)

**Scope**: `src/lib/proposals/` 순수 함수 + Zod 스키마 + 단위 테스트.

**Deliverables**:
- `src/lib/proposals/status-machine.ts` (`@MX:ANCHOR` validateProposalTransition)
- `src/lib/proposals/inquiry.ts` — `buildInquiryRecords(proposalId, instructorIds, timeSlot, questionNote)` 순수 함수 + 중복 검출
- `src/lib/proposals/convert.ts` — `buildProjectFromProposal(proposal)`, `buildAcceptedRecommendationFromInquiries(proposalId, acceptedInstructors)` 순수 함수 (`@MX:ANCHOR`)
- `src/lib/proposals/validation.ts` — Zod schema (제안서 / 디스패치 / 변환)
- `src/lib/proposals/errors.ts` — `PROPOSAL_ERRORS` 한국어 상수
- `src/lib/proposals/types.ts` — `Proposal`, `ProposalInquiry`, `InquiryStatus` TypeScript 타입
- `src/lib/proposals/__tests__/status-machine.test.ts` — 전환 그래프 25+ 케이스 (각 enum 쌍, frozen 보호)
- `src/lib/proposals/__tests__/validation.test.ts` — Zod schema 정상/거부 케이스
- `src/lib/proposals/__tests__/inquiry.test.ts` — 중복 detection, time-slot null 허용
- `src/lib/proposals/__tests__/convert.test.ts` — 메타데이터 매핑, 0명/1명/3명 accepted 시나리오

**Success Criteria**:
- `pnpm test:unit` (proposals 영역) PASS, 라인 커버리지 ≥ 85%
- `pnpm typecheck` 0 에러
- TDD 사이클: 각 모듈 RED 테스트 → GREEN 최소 구현 → REFACTOR

**Dependencies**: M1 (Drizzle schema 타입 사용)

**Risks**: TypeScript 순환 참조 가능성 → types.ts에서 인터페이스만 export, 구현부는 별도 파일.

---

### M3: 리스트 + 검색 + 페이지네이션 (Priority: High)

**Scope**: `/proposals` 리스트 페이지 + 검색·필터 쿼리.

**Deliverables**:
- `src/lib/proposals/list-query.ts` — 검색 쿼리 (status / client / period / q ILIKE)
- `src/lib/proposals/queries.ts` — `listProposals`, `getProposal`, `softDeleteProposal`
- `src/app/(app)/(operator)/proposals/page.tsx` — 리스트 페이지
- `src/components/proposals/ProposalFiltersBar.tsx`
- `src/components/proposals/ProposalStatusBadge.tsx`
- `src/lib/proposals/__tests__/list-query.test.ts`

**Success Criteria**:
- `?q=알고`, `?status=draft,submitted`, `?client_id=<uuid>`, `?period_from=2026-05-01` 모든 조합 동작
- 100건 데이터셋 기준 P95 < 500ms (로컬 supabase)
- `deleted_at IS NOT NULL` row 노출 0건
- 페이지네이션 URL `?page=N` 반영
- 페이지 초과 시 마지막 페이지로 redirect

**Dependencies**: M1, M2

**Risks**: `pg_trgm` 확장 미설치 환경 → 마이그레이션 idempotent `CREATE EXTENSION IF NOT EXISTS`로 안전.

---

### M4: 등록 / 수정 / 첨부 (Priority: High)

**Scope**: 제안서 등록·수정·첨부 업로드 흐름.

**Deliverables**:
- `src/app/(app)/(operator)/proposals/new/page.tsx` + `actions.ts` (`createProposal`)
- `src/app/(app)/(operator)/proposals/[id]/page.tsx` (상세)
- `src/app/(app)/(operator)/proposals/[id]/edit/page.tsx` + `actions.ts` (`updateProposal`, `transitionProposalStatus`)
- `src/components/proposals/ProposalForm.tsx` (mode: 'create' | 'edit')
- `src/components/proposals/ProposalAttachmentUploader.tsx`
- `src/lib/proposals/file-upload.ts` — `uploadProposalAttachment`
- 한국어 에러 표시 + Asia/Seoul 시간대

**Success Criteria**:
- 등록 → 자동 redirect → 상세 페이지 도달
- 첨부 5MB pdf/png/jpg 업로드 OK, 그 외 mime/size 한국어 에러
- 수정 시 낙관적 동시성 (`expected_updated_at`) 동작
- frozen 상태(won/lost/withdrawn) 수정 시도 거부

**Dependencies**: M1, M2, M3

**Risks**: 첨부 트랜잭션 부분 실패 → SPEC-CLIENT-001 `deleteOrphanFile` 보상 패턴 적용.

---

### M5: 사전 강사 문의 디스패치 (Priority: High)

**Scope**: instructor multi-select 모달 + 일괄 INSERT 트랜잭션 + notifications 스텁 + 응답 보드.

**Deliverables**:
- `src/app/(app)/(operator)/proposals/[id]/inquiries/dispatch/actions.ts` — `dispatchInquiries`
- `src/components/proposals/InquiryDispatchModal.tsx` — instructor multi-select + time-slot + question_note
- `src/components/proposals/InquiryResponseBoard.tsx` — 4 컬럼 (대기/수락/거절/조건부)
- 디스패치 트랜잭션 (proposal_inquiries N건 + notifications N건)
- 콘솔 로그 스텁 `[notif] inquiry_request → instructor_id=<uuid> proposal_id=<uuid>`
- 추천 후보만 보기 토글 (skills 매칭)

**Success Criteria**:
- N=3 디스패치 → 3 + 3 + 3개 row/log
- 중복 (동일 proposal × instructor) → unique 제약 위반 → 한국어 에러 + 전체 롤백
- frozen 제안서 디스패치 거부
- 응답 보드 4 컬럼 정확히 그룹

**Dependencies**: M1, M2, M4

**Risks**: 동시 디스패치 race → DB unique 제약으로 직렬화 보장. 의도된 배타적 동작.

---

### M6: Won → Project 변환 (Priority: High)

**Scope**: 변환 Server Action + 단일 트랜잭션 + accepted 강사 ai_instructor_recommendations row + redirect.

**Deliverables**:
- `src/app/(app)/(operator)/proposals/[id]/convert/actions.ts` — `convertProposalToProject`
- `src/components/proposals/ConvertToProjectButton.tsx` — 트리거 + 확인 다이얼로그
- 단일 트랜잭션 (projects + project_required_skills + ai_instructor_recommendations + proposals UPDATE)
- redirect to `/projects/<new_id>`

**Success Criteria**:
- 변환 성공 → projects 신규 row + skills 복사 + (accepted ≥ 1 시) ai_instructor_recommendations row 1건 + proposals 갱신, 모두 단일 트랜잭션
- 멱등성: `converted_project_id IS NOT NULL` 재변환 거부
- status='submitted' 외 상태 변환 거부
- SPEC-PROJECT-001 detail 페이지에서 신규 project 정상 표시

**Dependencies**: M1, M2, M4, M5

**Risks**: 변환 트랜잭션 부분 성공 → Drizzle `db.transaction` 블록으로 단일 트랜잭션 보장. accepted 강사 0명 케이스 → ai_instructor_recommendations INSERT skip.

---

### M7: Signal View + Integration Test + Quality Gate (Priority: Medium)

**Scope**: SPEC-RECOMMEND-001 비영향 검증 + 시그널 view 헬퍼 + 통합 테스트 + 품질 게이트.

**Deliverables**:
- `src/lib/proposals/signal.ts` — `selectInstructorPriorAcceptedCount` 헬퍼
- `src/lib/proposals/__tests__/signal.test.ts` — 90일 윈도우, instructor 0/1/N건 시나리오
- `src/app/(app)/(operator)/proposals/__tests__/integration.test.ts` — 등록 → 제출 → 디스패치 → 응답 시뮬 → 변환 (시나리오 8종 acceptance.md와 1:1 매핑)
- SPEC-RECOMMEND-001 회귀 검증 (`src/lib/recommend/__tests__/score.test.ts` 모든 케이스 PASS, 점수 결과 0 변동)
- TRUST 5 게이트 통과 (Tested ≥ 85%, Readable, Unified, Secured RLS, Trackable git log)
- LSP 게이트 0 errors / 0 warnings

**Success Criteria**:
- `pnpm test` 모두 PASS
- `pnpm typecheck` 0 errors
- `pnpm lint` 0 critical
- `pnpm build` 0 errors
- SPEC-RECOMMEND-001 score.test.ts 회귀 PASS (가중치/정렬 0 변동)
- 시그널 view 헬퍼 동작 검증

**Dependencies**: M1~M6 모두 완료

**Risks**: 통합 테스트 supabase 의존성 → mock client 또는 in-memory fixtures 활용.

---

## Execution Order

```
M1 (Migration) → M2 (Domain Pure Functions)
                           ↓
                   M3 (List) → M4 (CRUD + Attachment)
                                          ↓
                                  M5 (Inquiry Dispatch)
                                          ↓
                                  M6 (Won → Project Convert)
                                          ↓
                                  M7 (Signal + Integration + QG)
```

M1과 M2는 의존성 약함이지만 schema 타입 사용을 위해 M1 선행 권장.

## Technical Approach

### Domain-Driven Boundaries

- `src/lib/proposals/` — 순수 도메인 (React/Next/Drizzle 의존 금지, 단위 테스트 100% 가능)
- `src/db/schema/proposals.ts` — Drizzle schema only
- `src/app/(app)/(operator)/proposals/**` — Server Actions + RSC pages (도메인 호출만)
- `src/components/proposals/` — UI components (`src/lib/proposals/`만 호출)

### Frozen Boundaries

- SPEC-PROJECT-001 `projects` 테이블 schema 변경 0건
- SPEC-PROJECT-001 status-machine.ts 변경 0건
- SPEC-RECOMMEND-001 score.ts / engine.ts / kpi.ts 변경 0건
- SPEC-DB-001 기존 테이블 schema 변경 0건 (enum value 추가는 SPEC-PROJECT-001 패턴과 동일하게 idempotent ALTER TYPE)

### MX Tag Strategy

| 파일 | MX 태그 | 사유 |
|------|---------|------|
| `src/lib/proposals/status-machine.ts:validateProposalTransition` | `@MX:ANCHOR` | fan_in ≥ 3 (액션 3종에서 호출) |
| `src/lib/proposals/queries.ts:createProposal`, `listProposals` | `@MX:ANCHOR` | fan_in ≥ 3 |
| `src/lib/proposals/inquiry.ts:dispatchInquiries` | `@MX:ANCHOR`, `@MX:WARN` | 트랜잭션 일관성 + race condition |
| `src/lib/proposals/convert.ts:convertProposalToProject` | `@MX:ANCHOR`, `@MX:WARN` | 단일 트랜잭션 4-step + frozen 보호 |
| `src/lib/proposals/file-upload.ts:uploadProposalAttachment` | `@MX:WARN` | Storage + DB 일관성 (SPEC-CLIENT-001 패턴) |

### Testing Strategy

- **Unit (Vitest 또는 node:test)**: `src/lib/proposals/__tests__/` — 순수 함수 100% 커버
- **Integration (Vitest + supabase mock)**: `src/app/(app)/(operator)/proposals/__tests__/integration.test.ts` — Server Action + DB 트랜잭션
- **E2E (Playwright)**: 본 SPEC 범위 외 → SPEC-E2E-001 또는 후속

## Risks & Mitigations (Summary)

상세 위험 분석은 [`spec.md`](./spec.md) §8 참조.

주요 위험:
- **Frozen 위반 위험**: SPEC-RECOMMEND-001 score.ts / SPEC-PROJECT-001 schema 변경 → M7 회귀 게이트로 차단
- **트랜잭션 일관성**: 디스패치/변환 부분 성공 → Drizzle `db.transaction` 블록 강제
- **시그널 view 성능**: 향후 데이터셋 확장 시 → 후속 SPEC에서 materialized view 검토
- **sibling SPEC-CONFIRM-001 미작성**: 강사 응답 화면 부재 → 알림 본문에 임시 안내 또는 sibling 병행 plan

## Quality Gates

각 마일스톤 종료 시점에 다음을 확인:

| 게이트 | M1 | M2 | M3 | M4 | M5 | M6 | M7 |
|--------|----|----|----|----|----|----|----|
| `pnpm db:verify` | ✓ | - | - | - | - | - | ✓ |
| `pnpm typecheck` | - | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pnpm test:unit` (proposals) | - | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pnpm test:unit` (recommend 회귀) | - | - | - | - | - | - | ✓ |
| `pnpm lint` | - | - | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pnpm build` | - | - | - | - | - | - | ✓ |
| 라인 커버리지 ≥ 85% | - | ✓ | ✓ | - | - | - | ✓ |

## Documentation Sync (post-merge)

본 SPEC 머지 직후 `/moai sync` 실행 시 다음 문서를 갱신:

1. `.moai/project/structure.md` — `src/lib/proposals/`, `(operator)/proposals/` 디렉토리 추가
2. `.moai/project/product.md` §3.1 — 새 영역 [F-200] 또는 [F-207] "제안서 관리" 추가 (운영자 영역)
3. CHANGELOG — SPEC-PROPOSAL-001 적용 기록
4. README — 운영자 사이드바 메뉴에 "Proposals" 추가 안내

---

문서 끝.
