---
spec_id: SPEC-ADMIN-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
---

# SPEC-ADMIN-001 — 인수 기준 (Acceptance Criteria)

본 문서는 SPEC-ADMIN-001의 EARS 요구사항을 Given-When-Then 시나리오와 단위/통합 테스트로 구체화한다. 모든 시나리오는 머지 게이트 통과 조건이다.

## A. 공통 가드

### A-1. 비-admin이 `/admin/*` 접근 시 리다이렉트

- Given: instructor 또는 operator 역할 사용자가 로그인된 상태
- When: `/admin/users`, `/admin/users/[id]`, `/admin/dashboard` 중 어느 라우트라도 접근
- Then: `/dashboard`로 리다이렉트되며 admin 페이지 콘텐츠는 어느 것도 SSR되지 않는다.

### A-2. 미인증 사용자가 `/admin/*` 접근 시

- Given: 세션 없음
- When: `/admin/dashboard` 접근
- Then: `/login`으로 리다이렉트(SPEC-AUTH-001 기존 정책).

## B. F-301 회원/권한 관리

### B-1. 회원 리스트 조회 + 필터

- Given: admin 로그인, `users` 테이블에 instructor 5명·operator 2명·admin 1명 존재
- When: admin이 `/admin/users` 진입 후 `role=instructor` 필터 적용
- Then: instructor 5명만 결과 테이블에 표시되고, 기본 페이지네이션 20건/페이지가 적용된다. `users.deleted_at IS NULL` 조건이 항상 적용된다.

### B-2. 이메일 부분 검색

- Given: admin 로그인, instructor 사용자 이메일 `kim.cs@example.com` 존재
- When: 검색어 `kim` 입력
- Then: 해당 사용자 1건만 표시.

### B-3. `is_active=false` 필터

- Given: admin 로그인, instructor 1명이 `is_active=false` 상태
- When: `is_active=false` 필터 적용
- Then: 비활성 사용자 1건만 표시.

### B-4. 회원 상세 페이지

- Given: admin 로그인, 대상 instructor 사용자에게 `auth_events` 5건 기록, `user_invitations` `accepted` 상태 1건
- When: admin이 `/admin/users/[id]` 접근
- Then: 기본 정보(name_kr, email, role, is_active), 최근 5건 로그인 이력, 초대 상태가 표시된다. 자기 자신이 아닌 사용자에 한해 비활성화 토글이 노출된다.

### B-5. 역할 변경 (instructor → operator)

- Given: admin 로그인, 대상 instructor 사용자
- When: 상세 페이지에서 역할을 `operator`로 변경 후 제출
- Then:
  - `users.role`이 `operator`로 갱신된다.
  - `audit.logRoleChange`가 호출되어 `{ actor_id, target_id, before_role: 'instructor', after_role: 'operator', at }` 로그를 남긴다.
  - 폼은 성공 상태로 갱신된다.

### B-6. admin 본인 role 변경 시도 차단

- Given: admin 로그인
- When: admin이 본인 상세 페이지에서 role을 `operator`로 변경 시도
- Then:
  - Zod 스키마에서 거부되어 폼에 "본인 계정의 역할은 변경할 수 없습니다." 메시지가 표시된다.
  - Server Action 진입에서도 동일 검사로 거부(이중 가드).
  - `users.role` 변경 없음.

### B-7. 비활성화 토글

- Given: admin 로그인, 대상 instructor 사용자(`is_active=true`)
- When: 비활성화 토글을 off로 변경
- Then:
  - `users.is_active=false` 갱신.
  - `audit.logActiveChange`가 호출되어 동일 형식 로그 기록.

### B-8. admin 본인 비활성화 시도 차단

- Given: admin 로그인
- When: admin이 본인 상세 페이지에서 비활성화 토글 시도
- Then:
  - UI에서 토글 자체가 노출되지 않는다.
  - 직접 Server Action을 호출하더라도 Zod에서 거부되어 `users.is_active`에 변경 없음.

### B-9. 비활성 사용자 로그인 차단

- Given: instructor 사용자 `is_active=false` 상태
- When: 해당 사용자가 로그인 시도
- Then: 미들웨어/auth callback에서 세션을 차단하고 `/login?error=deactivated`로 리다이렉트한다. 세션 쿠키 미발급.

### B-10. 비-admin Server Action 직접 호출

- Given: instructor 로그인
- When: instructor가 `[id]/role/actions.ts`의 `updateUserRole`을 직접 호출
- Then: Server Action 진입의 `requireRole(['admin'])`에서 거부되며 데이터 변경 없음.

## C. F-302 매출매입 집계 대시보드

### C-1. 당월 KPI 카드

- Given: admin 로그인, 당월 `projects` 매출 합계 1,200만원, `settlements`(`status=paid`) 매입 합계 800만원, `projects.margin_krw` 합계 400만원
- When: admin이 `/admin/dashboard` 진입
- Then: 매출 카드 12,000,000원, 매입 카드 8,000,000원, 마진 카드 4,000,000원이 표시된다.

### C-2. 기간 토글 (분기)

- Given: admin 로그인, 당분기 누적 데이터 존재
- When: 기간 토글을 `quarter`로 변경
- Then:
  - URL 쿼리 `period=quarter` 갱신.
  - 모든 위젯이 분기 범위로 재집계되어 표시.

### C-3. 기간 토글 (연도)

- Given: admin 로그인, 당해년도 데이터 존재
- When: 기간 토글을 `year`로 변경
- Then: 위젯이 연도 범위로 재집계.

### C-4. 최근 6개월 추이

- Given: admin 로그인, 최근 6개월 매출 데이터 존재
- When: `/admin/dashboard` 진입
- Then: 6개 데이터 포인트(매출/매입/마진)가 시계열로 렌더된다. 데이터 없는 월은 0으로 표시(차트 끊김 없음).

### C-5. 고객사 Top-5

- Given: admin 로그인, `client_companies` 8개 중 매출 상위 5개 식별 가능
- When: `/admin/dashboard` 진입
- Then: 매출 기준 Top-5 고객사명과 금액이 내림차순으로 표시. LEFT JOIN으로 이름 결측 시 "(미확인)" 표기.

### C-6. 강사 Top-5

- Given: admin 로그인, instructor 사용자 다수와 정산 데이터 존재
- When: `/admin/dashboard` 진입
- Then: `settlements.profit_krw` 기준 Top-5 강사가 표시.

### C-7. 빈 기간 처리

- Given: admin 로그인, 미래 기간(예: 다음 달)을 지정
- When: 해당 기간으로 토글
- Then:
  - KPI 카드 모두 0원 표시.
  - 추이 차트는 "데이터 없음" 빈 상태.
  - HTTP 200, 오류 메시지 표시 없음.

### C-8. 매입 집계 status 필터

- Given: `settlements`에 `status='paid'` 1건(500만원) + `status='pending'` 1건(300만원)
- When: 매입 집계 실행
- Then: 매입 KPI는 5,000,000원만 합산. `pending`은 제외.

### C-9. 매출 집계 deleted 제외

- Given: `projects`에 `business_amount_krw=1000만원` 활성 1건 + 동일 금액 `deleted_at` 설정 1건
- When: 매출 집계 실행
- Then: 매출 KPI는 10,000,000원(soft delete 제외).

### C-10. 마진 GENERATED 컬럼 사용

- Given: `projects.business_amount_krw=1000만원`, `instructor_fee_krw=600만원`(`margin_krw` GENERATED = 400만원)
- When: 마진 집계 실행
- Then:
  - SQL에서 `SUM(margin_krw)` 사용.
  - 어떤 코드 경로에서도 `business_amount_krw - instructor_fee_krw` 직접 계산 미수행(grep 검사).

## D. 단위 테스트 (필수)

| 파일 | 테스트 항목 |
| --- | --- |
| `src/lib/admin/users/__tests__/validation.test.ts` | B-6, B-8 (자기 자신 lockout 차단) |
| `src/lib/admin/users/__tests__/queries.test.ts` | B-1, B-2, B-3 (필터 조합), `deleted_at IS NULL` 조건 |
| `src/lib/admin/users/__tests__/audit.test.ts` | B-5, B-7 (로그 포맷) |
| `src/lib/admin/aggregations/__tests__/revenue.test.ts` | C-9 (deleted 제외) |
| `src/lib/admin/aggregations/__tests__/cost.test.ts` | C-8 (paid only) |
| `src/lib/admin/aggregations/__tests__/margin.test.ts` | C-10 (GENERATED 사용) |
| `src/lib/admin/aggregations/__tests__/by-month.test.ts` | C-4 (빈 월 0 채움) |
| `src/lib/admin/aggregations/__tests__/by-client.test.ts` | C-5 (Top-N 정렬, 결측 이름) |
| `src/lib/admin/aggregations/__tests__/by-instructor.test.ts` | C-6 (Top-N 정렬) |

## E. 통합/회귀 테스트

- Playwright (E2E, SPEC-E2E-001 회귀망에 추가)
  1. admin 로그인 → `/admin/users` → instructor 1명을 비활성화 → 해당 instructor로 로그인 시도 → `/login?error=deactivated` 도달
  2. admin 로그인 → `/admin/dashboard` → KPI 카드 3종 노출 확인 → 분기 토글 → URL 쿼리 갱신 + 위젯 재렌더 확인
- 가드 회귀 (LESSON-003 적용)
  - instructor 로그인 → `/admin/dashboard` 접근 → `/dashboard` 리다이렉트 검증

## F. 품질 게이트 (Definition of Done)

- [ ] 모든 EARS 항목(spec.md §3)에 대응하는 시나리오/테스트 존재
- [ ] D 표의 단위 테스트 전부 PASS
- [ ] E의 Playwright 시나리오 PASS
- [ ] `pnpm db:verify` 18케이스 PASS
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 통과
- [ ] 비-admin 접근, 본인 lockout, GENERATED 컬럼 INSERT 회귀 테스트 PASS
- [ ] PR 본문에 `SPEC-ADMIN-001` 표기, Implementation Notes에 마이그레이션·집계 로직 요약
- [ ] `audit.ts` 로그 포맷이 후속 `SPEC-AUDIT-001`에서 그대로 영속화 가능한 형태로 문서화
