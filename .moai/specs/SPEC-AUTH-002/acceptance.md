---
id: SPEC-AUTH-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
related: [SPEC-AUTH-001, SPEC-ADMIN-002, SPEC-ADMIN-001, SPEC-DB-001, SPEC-SEED-002, SPEC-E2E-002]
---

# SPEC-AUTH-002 — Acceptance Criteria

## 1. Given-When-Then 시나리오

### AC-AUTH002-001 — 정상 가입 → pending 상태 전이

**Given** 비로그인 방문자가 `/signup` 페이지에 접근
**And** 동일 이메일이 `auth.users`에 존재하지 않음
**And** 동일 IP의 직전 15분 내 가입 시도 0회
**When** 사용자가 유효한 페이로드(`email`, `password` 정책 준수, `display_name` 1–60자, `phone` 9–11자리, `terms_agreed=true`)를 제출
**Then** 시스템이 `auth.users` row, `public.users` row(`role='instructor'`, `is_active=false`), `instructor_signup_requests` row(`status='pending'`) 3종을 생성
**And** `auth_events` 테이블에 `event_type='signup_submitted'` row 1건 생성
**And** 사용자는 `/signup/pending` 페이지로 redirect 되어 한국어 안내를 받음

매핑: REQ-AUTH002-001, REQ-AUTH002-002

자동화 검증: `pnpm test:e2e --grep "정상 가입 → pending"`

---

### AC-AUTH002-002 — 가입 직후 로그인 시도 차단 (pending_approval)

**Given** AC-AUTH002-001이 완료되어 사용자가 `is_active=false` + `signup_requests.status='pending'` 상태
**When** 사용자가 `/login`에서 방금 등록한 자격증명으로 폼을 제출
**Then** 로그인 Server Action이 `signInWithPassword` 성공 후 `is_active=false`를 검출하여 `signOut()` 호출
**And** 응답이 `/login?error=pending_approval`로 redirect
**And** `/login` 페이지에 `role="alert"` 속성을 가진 한국어 배너 `"가입 신청이 검토 중입니다. 운영자 승인 후 로그인할 수 있습니다."` 노출
**And** 보호 라우트(`/instructor/*`, `/operator/*`, `/admin/*`)에 어떠한 형태로도 도달하지 않음

매핑: REQ-AUTH002-006, REQ-AUTH002-007, REQ-AUTH002-008

자동화 검증: `pnpm test:e2e --grep "가입 직후 로그인 차단"`

---

### AC-AUTH002-003 — operator 승인 → 정상 로그인

**Given** AC-AUTH002-001이 완료된 사용자가 pending 상태
**And** operator 사용자가 `/operator/signup-requests`에 진입
**When** operator가 해당 row의 "승인" 버튼을 클릭하고 confirmation dialog에서 "확인"
**Then** `instructor_signup_requests` row의 `status='approved'`, `processed_at` 기록, `processed_by`에 operator의 `auth.uid()` 기록
**And** `public.users.is_active=true` 갱신
**And** `auth_events`에 `event_type='signup_approved'` row 1건 생성
**And** 가입자가 `/login`에서 자격증명 제출 시 `/instructor/dashboard`로 정상 redirect
**And** `/instructor/*` 보호 콘텐츠에 정상 도달

매핑: REQ-AUTH002-011, REQ-AUTH002-006(반전)

자동화 검증: `pnpm test:e2e --grep "operator 승인 → 정상 로그인"`

---

### AC-AUTH002-004 — operator 거부 → 로그인 영구 차단

**Given** AC-AUTH002-001이 완료된 사용자가 pending 상태
**When** operator가 `/operator/signup-requests`에서 "거부" 버튼 클릭 + confirmation
**Then** `instructor_signup_requests.status='rejected'`, `processed_at`/`processed_by` 기록
**And** `public.users.is_active=false` 유지
**And** `auth_events`에 `event_type='signup_rejected'` row 1건 생성
**And** 가입자가 `/login`에서 자격증명 제출 시 `/login?error=pending_approval`로 차단 (배너 텍스트는 동일 — 정보 누설 최소화)
**And** 보호 라우트에 도달하지 않음

매핑: REQ-AUTH002-012

자동화 검증: `pnpm test:e2e --grep "거부 → 로그인 차단"`

---

### AC-AUTH002-005 — 약관 미동의 거부

**Given** 사용자가 `/signup`에서 모든 필드를 채우되 `terms_agreed=false`로 제출
**When** Server Action `signupInstructor`가 호출됨
**Then** Server Action이 zod 검증 단계에서 거부 (`auth.admin.createUser` 호출 전)
**And** 응답에 한국어 필드 에러 `"이용약관 동의가 필요합니다."` 포함
**And** `auth.users` / `users` / `instructor_signup_requests` / `auth_rate_limits` 어떤 테이블에도 row가 생성되지 않음

매핑: REQ-AUTH002-003

자동화 검증: `pnpm test:unit --grep "signup-action terms"`

---

### AC-AUTH002-006 — 중복 이메일 통일 거부

**Given** 이메일 `existing@algolink.test`가 `auth.users`에 이미 존재 (활성 instructor / 미수락 invite / rejected 가입 신청 어떤 케이스든)
**When** 사용자가 `/signup`에서 동일 이메일로 가입 시도
**Then** Server Action이 한국어 통일 메시지 `"이미 등록된 이메일입니다. 받은 초대 링크를 확인하거나 로그인을 시도하세요."` 반환
**And** "활성" / "초대됨" / "거부됨" 케이스를 구분하는 정보가 응답에 포함되지 않음
**And** 신규 row 생성 0건

매핑: REQ-AUTH002-004

자동화 검증: `pnpm test:unit --grep "signup-action duplicate email"` (3가지 케이스 동일 메시지)

---

### AC-AUTH002-007 — IP rate-limit 발동

**Given** IP `192.0.2.42`로부터 직전 15분 내 가입 시도 3회 발생 (모두 다른 이메일, 정상 처리 또는 거부)
**When** 동일 IP에서 4번째 가입 시도
**Then** Server Action이 `auth_rate_limits` 검사 단계에서 거부 (HTTP 429 또는 동등 에러 상태)
**And** 응답에 한국어 메시지 `"잠시 후 다시 시도해 주세요."` 포함
**And** `auth.users` / `users` / `instructor_signup_requests` row 생성 0건
**And** `auth_rate_limits`에 IP 카운터 row는 추가됨 (감사 목적)

매핑: REQ-AUTH002-015, REQ-AUTH002-016

자동화 검증: `pnpm test:unit --grep "rate-limit ip threshold"` + `pnpm test:e2e --grep "ip rate-limit"`

---

### AC-AUTH002-008 — 이메일 rate-limit 발동

**Given** 이메일 `repeat@algolink.test`로부터 직전 24시간 내 가입 시도 1회 발생
**When** 동일 이메일로 두 번째 가입 시도 (다른 IP에서)
**Then** Server Action이 거부 + 통일 메시지 `"잠시 후 다시 시도해 주세요."`
**And** 신규 row 생성 0건
**And** rate-limit 카운터는 추가됨

매핑: REQ-AUTH002-015, REQ-AUTH002-016, REQ-AUTH002-018

자동화 검증: `pnpm test:unit --grep "rate-limit email threshold"`

---

### AC-AUTH002-009 — RLS — pending instructor 보호 라우트 차단

**Given** `instructorPending@algolink.test` 페르소나(시드된 `is_active=false` + pending 가입 신청 보유)가 어떤 방법으로든 `auth.users` 세션을 보유 (예: 가입 직후 race로 세션이 잠시 유효)
**When** 해당 사용자가 `/instructor/dashboard`, `/operator/dashboard`, `/admin/users` 중 어느 것에든 SSR 진입 시도
**Then** SPEC-ADMIN-002의 `requireUser` 가드가 `is_active=false`를 검출
**And** 응답이 `/login?error=pending_approval`로 redirect (deactivated가 아닌 pending 분기)
**And** 보호 콘텐츠는 어떤 형태로도 노출되지 않음

매핑: REQ-AUTH002-006, REQ-AUTH002-009

자동화 검증: `pnpm test:e2e --grep "pending 보호 라우트 차단"` (rbac-cross-role.spec.ts 보강)

---

### AC-AUTH002-010 — 멱등 승인/거부

**Given** `instructor_signup_requests` row가 이미 `status='approved'` 상태
**When** operator가 동일 row의 "승인" 또는 "거부" 버튼을 다시 클릭 (UI race / 직접 Server Action 호출)
**Then** Server Action이 no-op 처리 + 한국어 메시지 `"이미 처리된 신청입니다."` 반환
**And** `processed_at` / `processed_by` 값이 변경되지 않음
**And** `users.is_active` 값이 변경되지 않음
**And** 추가 `auth_events` row 생성되지 않음

매핑: REQ-AUTH002-013

자동화 검증: `pnpm test:integration --grep "approval idempotent"`

---

### AC-AUTH002-011 — 초대 흐름 0 회귀

**Given** SPEC-AUTH-001의 invite fast-track e2e 시나리오 (operator 초대 발송 → /accept-invite/set-password → instructor home 도달)
**When** SPEC-AUTH-002의 모든 모듈(M1~M6)이 적용된 환경에서 동일 시나리오 재실행
**Then** 초대 흐름이 변경 없이 PASS
**And** 초대받은 사용자는 `/accept-invite/set-password` 완료 직후 `is_active=true` 상태로 즉시 활성화됨 (signup queue 거치지 않음)
**And** `instructor_signup_requests`에 row가 생성되지 않음
**And** SPEC-AUTH-001 `auth.spec.ts` 21건 0 회귀

매핑: REQ-AUTH002-019, LESSON-003 직접 대응

자동화 검증: `pnpm test:e2e tests/e2e/auth.spec.ts` (기존) + `pnpm test:e2e --grep "초대 흐름"`

---

### AC-AUTH002-012 — SPEC-ADMIN-002 비활성 차단 0 회귀

**Given** SPEC-ADMIN-002 phase2-admin.spec.ts의 "보조 operator 비활성화 → 새 컨텍스트 로그인 거부 → 원복" 시나리오
**When** SPEC-AUTH-002 적용 후 재실행
**Then** 시나리오 PASS (deactivated 분기는 그대로 동작)
**And** `/login?error=deactivated` 배너 노출 동작 보존
**And** pending 분기와 deactivated 분기가 시각적/의미적으로 구분됨 (다른 메시지)

매핑: REQ-AUTH002-009, LESSON-003 직접 대응

자동화 검증: `pnpm test:e2e tests/e2e/phase2-admin.spec.ts`

---

### AC-AUTH002-013 — DB 무결성 (`pnpm db:verify`)

**Given** 마이그레이션 `20260428000010_*`, `20260428000011_*`, `20260428000012_*` 적용된 로컬 supabase 인스턴스
**When** `pnpm db:verify` 실행
**Then** 기존 SPEC-DB-002 검증 18/18 PASS 유지
**And** 신규 검증(테이블 존재, RLS 정책, UNIQUE 제약 `idx_signup_pending_one_per_user`) 추가 PASS
**And** `auth_events.event_type` CHECK 확장이 기존 row를 무효화하지 않음

매핑: spec.md §6 데이터 모델 변경

자동화 검증: `pnpm db:verify`

---

### AC-AUTH002-014 — `/signup` 폼 a11y

**Given** 비로그인 방문자가 `/signup` 페이지에 접근
**When** axe-core 또는 Playwright a11y helper로 페이지 검사
**Then** WCAG 2.1 AA critical 위반 0건
**And** 모든 input에 연결된 label 존재
**And** 키보드만으로 모든 필드 + 약관 체크박스 + 제출 버튼 도달 가능 (Tab 순서 = 시각 순서)
**And** 약관 체크박스가 진짜 `<input type="checkbox">` (커스텀 div 아님)
**And** 비밀번호 visibility toggle에 `aria-pressed` 적용
**And** 제출 후 검증 실패 시 첫 invalid 필드로 focus 이동

매핑: REQ-AUTH002-022, REQ-AUTH002-023

자동화 검증: `pnpm test:e2e --grep "signup a11y"` (axe-core 통합)

---

## 2. 엣지 케이스 (Edge Cases)

### EC-001: 가입 액션 부분 실패 → 롤백

**상황**: `auth.admin.createUser` 성공 후 `users` UPSERT 실패 (예: race condition)
**기대**: Server Action이 catch하여 `auth.admin.deleteUser` 호출로 `auth.users` row 정리. 사용자에게 한국어 일반 에러 메시지. `instructor_signup_requests` row 미생성.
**검증**: 통합 테스트에서 mock `users.upsert` 실패 주입 후 `auth.admin.deleteUser` 호출 검증.

### EC-002: rate-limit과 중복 이메일 동시 충족

**상황**: IP rate-limit 임계 초과 + 동시에 이메일도 중복
**기대**: rate-limit가 먼저 차단 (Server Action 진입 첫 줄). 중복 이메일 검사는 도달하지 않음. 응답 메시지는 rate-limit 메시지.
**검증**: 우선순위 테스트.

### EC-003: pending 사용자가 비밀번호 재설정 시도

**상황**: 가입 직후 pending 사용자가 `/forgot-password`에서 비밀번호 재설정 요청
**기대**: SPEC-AUTH-001 §REQ-AUTH-PASSWORD-003의 통일 메시지 노출 (가입 여부 미노출). 재설정 자체는 supabase 측에서 발송 시도. 그러나 reset 후 로그인해도 여전히 `is_active=false`로 차단.
**검증**: 본 SPEC은 `/forgot-password` 흐름을 변경하지 않는다. 단지 "재설정해도 활성화 안 됨"이 자연스럽게 보장됨.

### EC-004: 거부 후 동일 이메일 재가입 시도

**상황**: rejected 상태의 사용자가 `/signup`에서 동일 이메일 재시도
**기대**: REQ-AUTH002-004의 중복 이메일 통일 메시지 노출 (`auth.users` 측에서 이미 존재하므로 자동 차단). 30일 후 재가입 정책은 별도 SPEC.
**검증**: 통합 테스트.

### EC-005: 동시 가입 race (동일 이메일 2건 동시 제출)

**상황**: 두 브라우저 탭에서 동일 이메일로 동시에 `/signup` 제출
**기대**: 첫 번째는 성공, 두 번째는 `auth.users` unique 제약 위반 → 통일 메시지로 catch.
**검증**: 통합 테스트 (동시성 시뮬레이션).

### EC-006: operator가 본인 가입 신청 처리 시도

**상황**: 시드 환경 외 일반적 시나리오는 아니나, operator가 본인 가입 신청을 승인 (자가 처리)
**기대**: 본 SPEC은 자가 처리를 명시적 차단하지 않음 (admin 본인 비활성화 차단은 SPEC-ADMIN-001 §B-8 별도 처리). 그러나 본 SPEC의 가입은 `role='instructor'`로 고정되므로 operator가 가입 신청을 만들 일 자체가 비정상 (UI에서 operator 셀프 가입 진입점 없음).
**검증**: 본 SPEC 범위 외.

### EC-007: `auth.users` 측 `email_confirm`이 false인 경우

**상황**: 운영 환경 변경으로 `auth.admin.createUser({ email_confirm: false })` 호출
**기대**: 본 SPEC의 D-005 결정에 따라 `email_confirm: true`로 호출. false로 우회되면 supabase 측 이메일 검증이 추가로 발생하여 흐름이 깨짐. 코드 리뷰 게이트로 강제.
**검증**: 단위 테스트로 `email_confirm: true` 매개변수 검증.

### EC-008: pending 사용자가 `/signup`에 다시 접근

**상황**: pending 상태 사용자가 다시 `/signup` 페이지에 진입
**기대**: 비로그인 상태이므로 폼 자체는 노출. 새 이메일로 시도하면 새 가입 신청 row 생성 가능 (다른 사용자로 처리). 동일 이메일은 중복 거부.
**검증**: 본 SPEC 범위 — UI는 동일 폼.

### EC-009: 이미 로그인된 사용자가 `/signup` 진입

**상황**: instructor/operator/admin 활성 사용자가 `/signup` URL 직접 접근
**기대**: `(auth)/layout.tsx`의 가드(SPEC-AUTH-001 §7 위험 항목)가 `roleHomePath`로 redirect. 폼 노출 안 됨.
**검증**: e2e — 활성 사용자로 `/signup` 진입 시 home redirect.

---

## 3. 품질 게이트 (Quality Gate Criteria)

### 3.1 코드 품질
- [ ] TypeScript 타입 체크 통과 (`tsc --noEmit`)
- [ ] ESLint 규칙 위반 0
- [ ] 신규/변경 파일 테스트 커버리지 85% 이상 (signup actions, rate-limit helper, approval actions)
- [ ] `auth.admin.createUser` 호출은 `signupInstructor` 한 곳으로 한정 (Grep 검증)

### 3.2 보안
- [ ] Service-role key 사용 위치가 `import 'server-only'` 모듈 내부로 한정
- [ ] 중복 이메일 응답 메시지가 모든 케이스에서 동일 (이메일 enumeration 방지)
- [ ] Rate-limit 검사가 Server Action 진입 첫 줄에서 수행됨 (DB 변경 전)
- [ ] `instructor_signup_requests` RLS: anon/instructor SELECT 거부 검증

### 3.3 회귀 방지 (LESSON-003 직접 대응)
- [ ] SPEC-AUTH-001 e2e 21건 0 회귀
- [ ] SPEC-ADMIN-002 phase2-admin e2e 0 회귀
- [ ] SPEC-SEED-002 시드 검증 0 회귀 (`pnpm db:verify`)
- [ ] SPEC-ADMIN-001 admin 회원 관리 흐름 0 회귀

### 3.4 접근성
- [ ] `/signup` 폼 axe-core critical 0건
- [ ] 약관 체크박스가 네이티브 `<input type="checkbox">`
- [ ] 비밀번호 visibility toggle `aria-pressed` 적용
- [ ] 키보드 only 흐름 (Tab → 모든 필드 → 제출)

### 3.5 데이터 무결성
- [ ] `instructor_signup_requests` UNIQUE pending one-per-user 보장 (동시 가입 race 통과)
- [ ] `processed_consistency` CHECK 제약이 invalid 상태 전이를 차단
- [ ] `auth_events.event_type` CHECK 확장이 기존 row 무효화 0

### 3.6 운영 가시성
- [ ] `auth_events`에 4종 신규 event 모두 기록 (`signup_submitted`, `signup_approved`, `signup_rejected`, `invite_after_rejection`)
- [ ] `/operator/signup-requests` 큐가 시간 역순 정렬
- [ ] 빈 큐 상태 한국어 메시지 노출

---

## 4. 완료 정의 (Definition of Done)

본 SPEC은 다음을 모두 충족할 때 완료:

- [ ] 모든 AC(AC-AUTH002-001 ~ 014) 검증 완료
- [ ] 모든 EARS 요구사항(REQ-AUTH002-001 ~ 023) 구현 검증
- [ ] 모든 엣지 케이스(EC-001 ~ 009) 처리 또는 명시적 비대상 표기
- [ ] 품질 게이트 모든 항목 통과
- [ ] `tests/e2e/auth-signup.spec.ts` 신규 작성 + PASS
- [ ] `tests/e2e/rbac-cross-role.spec.ts` 보강 + PASS
- [ ] SPEC-AUTH-001 / SPEC-ADMIN-002 / SPEC-SEED-002 / SPEC-ADMIN-001 e2e 0 회귀
- [ ] LESSON-003 회귀 패턴 추가 발생 0
- [ ] manager-docs를 통한 SYNC 단계로 SPEC-AUTH-001 amendment 적용 + 문서/CHANGELOG 반영

---

## 5. 검증 방법 매트릭스 (Validation Methods Matrix)

| 검증 대상 | 도구 / 방법 | 자동화 명령 |
|---|---|---|
| 가입 폼 zod 검증 | Vitest 통합 | `pnpm test:unit src/lib/validation/auth.test.ts` |
| signupInstructor 액션 분기 | Vitest 통합 (mock supabase) | `pnpm test:unit --grep "signup-action"` |
| Rate-limit IP/email 임계값 | Vitest 통합 (fake timers) | `pnpm test:unit --grep "rate-limit"` |
| 중복 이메일 통일 메시지 | Vitest 통합 (3 케이스) | `pnpm test:unit --grep "duplicate email"` |
| pending 보호 라우트 차단 | Playwright e2e | `pnpm test:e2e --grep "pending 보호"` |
| 승인/거부 플로우 | Playwright e2e | `pnpm test:e2e --grep "operator 승인\|거부"` |
| `/login?error=pending_approval` 배너 | Playwright e2e + axe-core | `pnpm test:e2e --grep "pending banner"` |
| RLS 정책 | Vitest RLS integration | `pnpm test:integration --grep "signup-requests rls"` |
| DB 무결성 | `pnpm db:verify` | `npx supabase start && pnpm db:verify` |
| SPEC-AUTH-001 회귀 | 기존 e2e 재실행 | `pnpm test:e2e tests/e2e/auth.spec.ts` |
| SPEC-ADMIN-002 회귀 | 기존 e2e 재실행 | `pnpm test:e2e tests/e2e/phase2-admin.spec.ts` |
| a11y | axe-core / Playwright a11y | `pnpm test:e2e --grep "signup a11y"` |

---

## 6. 비대상 / 제외 (Out of Acceptance)

다음은 본 SPEC의 acceptance 검증 대상이 아닙니다 (별도 SPEC):

- 가입 알림 이메일 발송 검증
- `/terms`, `/privacy` 페이지 콘텐츠 / 다국어 검증
- Rate-limit 30일 GC 잡 검증
- 거부 사유 입력 / 사용자 통보
- 셀프 탈퇴 / 계정 삭제
- CAPTCHA / Redis / MFA / OAuth
- operator 셀프 가입 (강사만 셀프 가입 허용)
- `/admin/users` 내 pending 사용자 배지 표시 (SPEC-ADMIN-001 follow-up)
- 30일 후 거부된 이메일 재가입 정책
- Rate-limit 디폴트 임계값 운영 데이터 기반 튜닝

---

_End of SPEC-AUTH-002 acceptance.md_
