# Phase 2 E2E 회귀 종결 보고서 — 2026-04-28

## 개요

Phase 2 SPEC 4종(CLIENT/PAYOUT/ADMIN/NOTIFY)의 통합 운영 준비 검증 + Phase 1 E2E 회귀망(SPEC-E2E-001)에 4 시나리오 추가.

신규 SPEC: SPEC-E2E-002 1건만. 기존 spec 파일 미수정. `playwright.config.ts` 미변경.

## Phase A — Sanity Check 결과

| 단계 | 명령 | 결과 |
|---|---|---|
| 1 | `npx supabase status` | 로컬 스택 기동 상태 확인 (54321/54322/54323 모두 활성) |
| 2 | `pnpm db:verify` | **18/18 PASS** (SPEC-DB-001 acceptance) |
| 2.1 | 누락 마이그레이션 적용 | `20260428120000_admin_user_active.sql` (users.is_active) 누락 발견 → 직접 적용 후 e2e 검증 통과 |
| 3 | `pnpm build` | **exit 0** (Production 번들 0 errors) |

> **추가 발견**: 로컬 DB에 `20260428120000_admin_user_active.sql` 미적용 상태였음. db:verify는 통과했지만 admin /admin/users 페이지가 `column "is_active" does not exist` (PG 42703)로 500. 마이그레이션 적용 후 정상화.

## Phase B — SPEC-E2E-002 plan 결과

`.moai/specs/SPEC-E2E-002/{spec,plan,acceptance}.md` 사전 작성된 상태로 그대로 채택.

- spec.md: REQ-E2E2-001~008 (CLIENT/PAYOUT/ADMIN/NOTIFY 4 + 공통 4) — EARS 형식
- plan.md: M1~M6 마일스톤 + 셀렉터/cleanup 전략 + 위험 완화
- acceptance.md: AC-1~AC-6 + 엣지 케이스 7종 + DoD 체크리스트

frontmatter: `status: completed`, `version: 1.0.0`로 업데이트.

## Phase C — SPEC-E2E-002 run 결과 (4 시나리오 표)

| spec 파일 | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| `tests/e2e/phase2-client.spec.ts` | 고객사 등록 → 검색 → 1건 매치 | **PASS** | 셀렉터 패치 필요했음(`#contact-name-0` 등) |
| `tests/e2e/phase2-payout.spec.ts` | pending → requested → paid + KPI 반영 | **SKIP** | pending 상태 거래 시드 부재 (REQ-E2E2-007) |
| `tests/e2e/phase2-admin.spec.ts` | 보조 operator 비활성화 → 새 컨텍스트 로그인 거부 | **SKIP** | 시드에 operator 1명만 존재 + `SEED_OPERATOR2_PASSWORD` env 부재 (REQ-E2E2-007) |
| `tests/e2e/phase2-notify.spec.ts` | 정산요청 → bell 카운트 → read_at | **SKIP** | pending 거래 시드 부재 (PAYOUT 시나리오와 동일 시드 풀 의존) |

신규 헬퍼: 없음. 4 spec 간 중복 코드는 도메인별 시드 식별 로직이라 추출 불요.

### 전체 e2e 스위트 결과 (Phase 1 + Phase 2 회귀)

```
43 passed
 8 skipped
 0 failed
```

- Phase 1(SPEC-E2E-001) 인증/가드 회귀: **0** (LESSON-003 준수)
- 8 skipped: phase2 3건 + 기존 phase1 환경 의존 5건 (이미 SPEC-E2E-001에서 정의된 정상 skip)

## Phase D — sync 결과

- `.moai/specs/SPEC-E2E-002/spec.md`: status `draft` → `completed`, version `0.1.0` → `1.0.0`, HISTORY 추가
- `README.md` "SPEC 추적 (Phase 2)" 표에 SPEC-E2E-002 행 추가
- 본 보고서 생성

## 산출물 목록

```
.moai/specs/SPEC-E2E-002/
├── spec.md          (frontmatter completed)
├── plan.md
└── acceptance.md
tests/e2e/
├── phase2-client.spec.ts
├── phase2-payout.spec.ts
├── phase2-admin.spec.ts
└── phase2-notify.spec.ts
README.md            (1행 추가)
.moai/reports/phase2-e2e-closure-2026-04-28.md   (본 문서)
```

## 후속 액션 제안

| 항목 | 트리거 SPEC 후보 | 우선순위 |
|---|---|---|
| `pending` 상태 거래 시드 보강 (PAYOUT/NOTIFY skip 해제) | SPEC-SEED-002 | High |
| 보조 operator 시드 추가 + `SEED_OPERATOR2_PASSWORD` env 표준화 (ADMIN skip 해제) | SPEC-SEED-002 또는 SPEC-ADMIN-002 | Medium |
| `setUserActive`가 `auth.users` ban까지 전파하도록 보강 (LESSON-003 강화) | SPEC-ADMIN-002 | Medium |
| 마이그레이션 누락 감지 자동화 (`pnpm db:verify`에 `is_active` 컬럼 체크 추가) | SPEC-DB-002 | Low |

## 차단 조건 충족 여부

- 인증/가드 회귀: **0** (LESSON-003 준수)
- 기존 e2e 깨짐: **없음**
- supabase start 실패: **없음**

→ 전체 차단 조건 통과. SPEC-E2E-002 종결.
