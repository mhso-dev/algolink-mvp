# SPEC-ME-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, RED-GREEN-REFACTOR 매핑, 위험을 정의한다. 시간 추정은 사용하지 않고 **우선순위(High/Medium/Low) + 의존 순서**로만 표현한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족 또는 확인 필요)

- ✅ **SPEC-DB-001 완료** (`status: completed`) — 통합 마이그레이션 9종 (`20260427000010` ~ `20260427000082`) 적용 완료. `instructors` / `educations` / 7개 이력서 섹션 / `instructor_skills` / `skill_categories` / `schedule_items` / `settlements` / `settlement_status_history` / `files` / `ai_resume_parses` / `pii_access_log` 모두 존재. RLS 적용. enum (`user_role`, `schedule_kind`, `settlement_flow`, `settlement_status`, `proficiency`, `skill_tier`) 정의됨.
- ✅ **SPEC-AUTH-001 완료** (`status: completed`) — `getCurrentUser()`, `requireRole('instructor')`, `<AppShell userRole>`, ROLE_HOME `/me` 라우팅, middleware getClaims 가드 모두 동작.
- ✅ **SPEC-LAYOUT-001 완료** (`status: implemented`) — `(app)` route group, `<AppShell>` / `<Sidebar>` / `<Topbar>`, UI 프리미티브 11종, 디자인 토큰, 다크 모드, 한국어 폰트(Pretendard) 모두 동작.
- ✅ **Next.js 16 + React 19 + Tailwind 4 + Drizzle 부트스트랩** 완료
- ⚠️ **확인 필요 — Storage 버킷 3종**: `resume-attachments`, `payout-documents`, `instructor-photos`가 SPEC-DB-001 산출물에 포함되어 있는지 M1 게이트에서 확인. 부재 시 SPEC-DB-002로 분리 후 본 SPEC을 차단.
- ⚠️ **확인 필요 — pgcrypto user-callable RPC**: `app.encrypt_pii()` / `app.decrypt_pii()` 또는 동등 SECURITY DEFINER 함수가 `authenticated` role에 GRANT되어 있는지 M1 확인. 부재 시 (a) service role 우회 (REQ-ME-PAYOUT-008) 또는 (b) SPEC-DB-002로 위임.

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (전제 검증 + 의존성 + 도메인 헬퍼)이 모든 마일스톤의 선행
- M2 (이력서 양식 CRUD)는 M3 (스킬), M6 (AI 파싱), M8 (PDF)의 선행
- M4 (캘린더)는 M2와 독립이므로 병렬 가능
- M5 (정산 조회)는 단위 테스트(M10)의 선행 — 합계 계산 함수가 M5와 함께
- M6 (AI 파싱)은 M2 완료 후 (적용 흐름이 M2 데이터 모델 의존)
- M7 (지급 정보 + PII)은 M1 게이트(pgcrypto 확인) 통과 후
- M8 (PDF 다운로드 + 마스킹)은 M2 + M7 완료 후 (지급 정보 마스킹 포함)
- M9 (a11y + 한국어 + Asia/Seoul polish)는 모든 페이지 완성 후
- M10 (단위 테스트)는 M2-M8과 동시 진행 (TDD RED 우선)

### 1.3 후속 SPEC을 위한 산출물 약속

- `src/lib/instructor/settlement-summary.ts` — SPEC-RECO-001, SPEC-SETTLE-OP-001이 import 가능
- `src/lib/instructor/resume-mask.ts` — 운영자 영역에서 강사 정보 표시 시 재사용
- `src/db/queries/instructor/*.ts` — operator 영역에서 read 시 재사용 (write는 instructor만)
- `src/components/instructor/*` — 일부는 운영자 readonly 뷰에서 재사용 (`<SettlementsTable>`, `<CalendarView>`)

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 전제 검증 + 의존성 + 도메인 헬퍼 [Priority: High]

**목적:** Storage 버킷, pgcrypto RPC, 라이브러리 호환성을 사전 검증하여 후속 게이트가 막히는 것을 방지.

**산출물:**

- `package.json` 의존성 추가 (M1에서 한 번에):
  - `@anthropic-ai/sdk`
  - `@react-pdf/renderer` (또는 `pdf-lib`, M1 spike 결과로 결정)
  - `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`
  - `date-fns`, `date-fns-tz`
  - `pdf-parse` 또는 `pdfjs-dist` (이력서 PDF 텍스트 추출용)
  - (이미 있음) `zod`, `react-hook-form`, `@tanstack/react-query`
- `src/lib/format/datetime.ts` (또는 기존 파일 확장) — Asia/Seoul 변환 유틸 + 단위 테스트
- `src/lib/instructor/resume-mask.ts` — 마스킹 순수 함수 + 단위 테스트
- `.env.example`에 다음 항목 추가/확인:
  ```
  ANTHROPIC_API_KEY=
  ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-6
  ANTHROPIC_MODEL_FAST=claude-haiku-4-5
  ```
- spike 검증 보고:
  - Next.js 16 + React 19 + FullCalendar v6 호환 (간단 마운트 테스트)
  - `@react-pdf/renderer`로 한국어(Pretendard) 폰트 PDF 렌더 가능 확인
  - Anthropic SDK with prompt caching 기본 호출 1회 검증

**검증:**

- `pnpm install` 무오류
- `pnpm tsc --noEmit` 0 type 에러
- `pnpm lint` 0 critical
- M1에서 Storage 버킷 / pgcrypto RPC 확인 → 결과를 본 plan.md에 갱신:
  - 버킷 존재 여부 + RLS 정책 요약
  - pgcrypto helper 함수 시그니처

**RED-GREEN-REFACTOR 매핑 (TDD):**
- RED: `resume-mask.test.ts` (시나리오 13의 모든 케이스 + EC-9)
- GREEN: `resume-mask.ts` 구현
- REFACTOR: 정규식 반복 제거, helper 추출

**연관 EARS:** REQ-ME-RESUME-007 (마스킹 규칙), REQ-ME-A11Y-005 (시간/금액 포맷)

---

### M2 — 이력서 양식 CRUD (7 섹션) [Priority: High]

**목적:** 강사가 양식 기반으로 이력서를 직접 입력할 수 있는 기반.

**산출물:**

- `src/lib/validation/instructor.ts` — 7개 섹션 zod schema
- `src/db/queries/instructor/ensure-row.ts` — `ensureInstructorRow()`
- `src/db/queries/instructor/resume.ts` — 7개 섹션 read/write/reorder
- `src/app/(instructor)/me/resume/page.tsx` — 7-tab 양식 (server component + client form)
- `src/app/(instructor)/me/resume/actions.ts` — Server Actions (각 섹션 add/edit/delete/reorder)
- `src/components/instructor/ResumeForm.tsx` — 7-section tabs + 자동 저장 (localStorage debounce 5s)
- `src/components/instructor/ResumeSectionEditor.tsx` (재사용 단일 컴포넌트)

**RED-GREEN-REFACTOR:**
- RED: `tests/integration/instructor-resume.test.ts` — RLS 격리 + 7섹션 CRUD (테스트 DB)
- RED: `tests/unit/validation/instructor.test.ts` — zod 통과/거부 케이스
- GREEN: 위 산출물 구현
- REFACTOR: 7섹션 schema/query 중복 제거, generic helper로 압축

**검증:**
- 시나리오 3 PASS
- axe `/me/resume` critical 0
- localStorage draft 복원 동작 (시나리오 15)
- Instructor B의 row 수정 차단 (시나리오 12 일부)

**연관 EARS:** REQ-ME-RESUME-001 ~ -005, -008, -009, REQ-ME-A11Y-001 ~ -003

---

### M3 — 강의 가능 기술스택 / 도메인 체크리스트 [Priority: High]

**목적:** SPEC-RECO-001 추천 알고리즘이 활용할 instructor_skills 데이터 입력.

**산출물:**

- `src/db/queries/instructor/skills.ts` — instructor_skills upsert/delete + skill_categories tree query
- `src/app/(instructor)/me/resume/skills/page.tsx` (또는 `/me/resume`의 별도 탭)
- `src/components/instructor/SkillsPicker.tsx` — 3-tier tree + 검색 + proficiency 인라인 라디오
- `src/app/(instructor)/me/resume/skills/actions.ts` — `toggleSkill(skillId, proficiency)` Server Action

**RED-GREEN-REFACTOR:**
- RED: `tests/unit/components/SkillsPicker.test.tsx` — small tier만 selectable, medium/large 클릭 무시
- RED: `tests/integration/instructor-skills.test.ts` — UPSERT/DELETE
- GREEN: 위 산출물 구현
- REFACTOR: tree flatten/expand 로직 분리

**검증:**
- 시나리오 7 PASS
- skill_categories 시드 데이터 충분 (M1 검증 또는 추가 시드 작성 필요 시 SPEC-DB-002 영역)

**연관 EARS:** REQ-ME-SKILL-001 ~ -005

---

### M4 — 캘린더 (월/주 + system_lecture / personal / unavailable) [Priority: High]

**목적:** 강사 일정 관리 + SPEC-RECO-001이 회피할 unavailable 신호 수집.

**산출물:**

- `src/db/queries/instructor/schedules.ts` — read by viewport, INSERT/UPDATE/DELETE (system_lecture 차단)
- `src/app/(instructor)/me/calendar/page.tsx` — FullCalendar 마운트 + 권한 + 데이터 로드
- `src/app/(instructor)/me/calendar/actions.ts` — `createSchedule`, `updateSchedule`, `deleteSchedule`
- `src/components/instructor/CalendarView.tsx` — FullCalendar 래퍼 + 한국어 locale + Asia/Seoul TZ
- `src/components/instructor/ScheduleDialog.tsx` — 새 일정 / 편집 다이얼로그
- `src/lib/instructor/schedule-conflict.ts` — 표시용 충돌 검사 + 단위 테스트

**RED-GREEN-REFACTOR:**
- RED: `tests/unit/lib/schedule-conflict.test.ts`
- RED: `tests/integration/instructor-schedules.test.ts` — system_lecture write 차단, unavailable CRUD
- RED: `tests/unit/validation/schedule-input.test.ts` — ends_at <= starts_at 거부, ±2 year window
- GREEN: 위 산출물 구현
- REFACTOR: TanStack Query mutation 헬퍼 추출

**검증:**
- 시나리오 8, 9 PASS
- KST 시간대 일관 (시나리오 14)
- LCP < 2.5s (100건 이내 시드)

**연관 EARS:** REQ-ME-CAL-001 ~ -010

---

### M5 — 정산 조회 (리스트 + 상세) [Priority: High]

**목적:** 강사가 본인 정산 내역을 조회 + 합계 + 세금 분기 표시.

**산출물:**

- `src/lib/instructor/settlement-summary.ts` — 합계 계산 (BigInt + 단위 테스트 100%)
- `src/db/queries/instructor/settlements.ts` — 본인 settlements + projects/clients/status_history join
- `src/app/(instructor)/me/settlements/page.tsx` — 리스트 + summary band + 필터
- `src/app/(instructor)/me/settlements/[id]/page.tsx` — 상세 read-only
- `src/components/instructor/SettlementsTable.tsx`
- `src/components/instructor/SettlementSummaryBand.tsx`

**RED-GREEN-REFACTOR:**
- RED: `tests/unit/lib/settlement-summary.test.ts` — corporate(0%), government(3.30%, 8.80%), 혼합, 빈 배열, BigInt 정밀도, status 필터, 음수 거부 ([HARD] 100% 커버)
- RED: `tests/integration/instructor-settlements.test.ts` — RLS 격리 (Instructor B의 정산 0건)
- GREEN: 위 산출물 구현
- REFACTOR: 합계 계산을 reduce + map 패턴으로 깔끔히

**검증:**
- 시나리오 10 PASS
- 시나리오 14 (Asia/Seoul) PASS
- product.md §6 "정산 금액 계산 단위 테스트 필수" 충족

**연관 EARS:** REQ-ME-SET-001 ~ -008, REQ-ME-DASH-001 (위젯 합계는 같은 함수 재사용)

---

### M6 — AI 이력서 파싱 (캐시 + Claude + Fallback) [Priority: Medium]

**목적:** 기존 이력서 PDF/DOCX/TXT를 AI로 자동 양식화.

**산출물:**

- `src/ai/client.ts` — Anthropic SDK + caching 설정
- `src/ai/prompts/resume-parse.ts` — system 프롬프트 (`cache_control: { type: 'ephemeral' }`)
- `src/ai/parsers/resume.ts` — 응답 → ParsedResume + zod 검증
- `src/ai/fallback.ts` — 에러 매핑 + 한국어 메시지
- `src/ai/extract-text.ts` — PDF/DOCX/TXT → 텍스트 (PDF는 pdf-parse, DOCX는 mammoth or 단순 처리)
- `src/lib/instructor/pii-prefilter.ts` — 주민/계좌/사업자번호 정규식 제거 + 단위 테스트
- `src/db/queries/instructor/ai-cache.ts` — `ai_resume_parses` lookup/upsert
- `src/app/(instructor)/me/resume/import/page.tsx` — 드롭존 + progress
- `src/app/(instructor)/me/resume/import/actions.ts` — `parseResume(file)`, `applyParsedResume(parsed, mapping)`
- `src/components/instructor/ResumeImportDialog.tsx` — review UI (좌 JSON / 우 form)

**RED-GREEN-REFACTOR:**
- RED: `tests/unit/lib/pii-prefilter.test.ts` — 주민/계좌/사업자 패턴 제거 검증
- RED: `tests/unit/ai/parsers/resume.test.ts` — 정상 응답, schema 어긋난 응답, 빈 응답 처리
- RED: `tests/integration/ai-resume-cache.test.ts` — hash UNIQUE, miss → mock Claude → upsert, hit → cached return
- GREEN: 위 산출물 구현
- REFACTOR: AbortController + timeout helper 추출

**검증:**
- 시나리오 4, 5, 6, EC-1, EC-3, EC-4, EC-5 PASS
- Claude API 비용 측정 (캐시 hit ratio 추정)
- product.md §6 "AI 응답 fallback" 충족

**연관 EARS:** REQ-ME-AI-001 ~ -009

---

### M7 — 지급 정보 등록 (pgcrypto 암호화 + 통장사본 Storage) [Priority: High]

**목적:** 정산 지급에 필요한 PII(주민/사업자/계좌)를 안전하게 암호화 저장.

**산출물:**

- `src/db/queries/instructor/payout.ts` — instructors UPDATE (encrypted columns) + pii_access_log INSERT
- `src/lib/validation/payout.ts` — zod (주민번호 체크섬, 사업자번호 체크섬, 계좌, 통장사본)
- `src/app/(instructor)/me/settings/page.tsx` — 메뉴 진입
- `src/app/(instructor)/me/settings/payout/page.tsx` — 폼 (마스킹된 기존값 + 신 입력)
- `src/app/(instructor)/me/settings/payout/actions.ts` — `submitPayoutSettings`, `requestPayoutSettingsView`
- `src/components/instructor/PayoutSettingsForm.tsx`
- `src/lib/storage/payout-upload.ts` — Supabase Storage 업로드 헬퍼 (server-only)

**RED-GREEN-REFACTOR:**
- RED: `tests/unit/validation/payout.test.ts` — 주민번호 체크섬, 사업자번호 체크섬, 파일 크기/타입
- RED: `tests/integration/instructor-payout.test.ts` — 암호화 저장 + 복호화 마스킹 + pii_access_log row + RLS 격리
- GREEN: 위 산출물 구현
- REFACTOR: 암호화/복호화 호출을 단일 helper로 통합

**검증:**
- 시나리오 11, 12 PASS
- 평문 PII가 DB / 로그 / localStorage / sessionStorage / React state(commit 후) 어디에도 남지 않음 검증
- pii_access_log row 정확히 1건 INSERT (REQ-ME-PAYOUT-006)
- Storage RLS: Instructor B가 Instructor A의 payout-documents/* 접근 시 403

**연관 EARS:** REQ-ME-PAYOUT-001 ~ -009

---

### M8 — PDF 다운로드 (개인정보 마스킹 토글) [Priority: Medium]

**목적:** 강사가 본인 이력서를 PDF로 출력 + 외부 공유용 마스킹.

**산출물:**

- `src/lib/instructor/resume-pdf.tsx` — `<ResumePDF>` 컴포넌트 (@react-pdf/renderer)
- `src/app/(instructor)/me/resume/export/route.ts` — GET handler, query `mask=true|false`
- `src/lib/format/pdf-fonts.ts` — Pretendard / JetBrains Mono 등록

**RED-GREEN-REFACTOR:**
- RED: `tests/integration/resume-pdf.test.ts` — Buffer로 PDF 생성 → 검사 (한국어 텍스트 포함, 마스킹 적용 여부)
- GREEN: 위 산출물 구현
- REFACTOR: 7-section 렌더 로직을 데이터 매핑 패턴으로 압축

**검증:**
- 시나리오 13 PASS
- Content-Disposition + Content-Type 정확
- 마스킹 PDF에 평문 주민번호/계좌/연락처 0건 (PDF text extraction으로 검증)

**연관 EARS:** REQ-ME-RESUME-006, -007

---

### M9 — 접근성 / 한국어 / Asia/Seoul polish [Priority: Medium]

**목적:** 모든 페이지 WCAG 2.1 AA + 한국어 일관성 + KST 일관성 마무리.

**산출물:**

- `src/components/instructor/*` 모든 컴포넌트의 ARIA 점검
- 라이브 리전(`role="status"` / `role="alert"`) 일관 적용
- 한국어 에러/토스트 메시지 검수 (영문 노출 0)
- `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ... })` 일관 사용
- 다크 모드 대비 검증 (5개 페이지)
- 키보드 only 검증 보고서 작성

**RED-GREEN-REFACTOR:**
- RED: `tests/e2e/me-a11y.spec.ts` (Playwright + @axe-core/playwright) — 5개 페이지 critical 0
- GREEN: 발견된 issue fix
- REFACTOR: aria 속성 헬퍼 추출

**검증:**
- axe 5개 페이지 critical 0
- Lighthouse Accessibility ≥ 95
- 한국어 누락 검수 grep (영문 평문 매크로 제거)

**연관 EARS:** REQ-ME-A11Y-001 ~ -006

---

### M10 — 단위 테스트 통합 + 회귀 [Priority: High]

**목적:** product.md §6 회계 정확성 보장 + RED-GREEN-REFACTOR cycle 완성.

**산출물 (M2~M8과 병렬 진행):**

- `tests/unit/lib/settlement-summary.test.ts` (M5)
- `tests/unit/lib/resume-mask.test.ts` (M1)
- `tests/unit/lib/schedule-conflict.test.ts` (M4)
- `tests/unit/lib/pii-prefilter.test.ts` (M6)
- `tests/unit/validation/instructor.test.ts` (M2)
- `tests/unit/validation/payout.test.ts` (M7)
- `tests/unit/validation/schedule-input.test.ts` (M4)
- `tests/unit/ai/parsers/resume.test.ts` (M6)
- `tests/integration/*` (각 마일스톤별)
- 커버리지 보고: `src/lib/instructor/`, `src/lib/validation/`, `src/ai/parsers/` 100% line + branch

**검증:**
- `pnpm test` 0 fail
- `settlement-summary.ts` 100% (HARD)
- 전체 커버리지 ≥ 85%

---

## 3. 의존성 다이어그램 (Dependency Graph)

```
M1 (전제 검증 + 헬퍼)
 ├─→ M2 (이력서 CRUD) ──┬─→ M3 (스킬)
 │                       ├─→ M6 (AI 파싱)
 │                       └─→ M8 (PDF) ←── M7 (PII)
 ├─→ M4 (캘린더)
 ├─→ M5 (정산)
 └─→ M7 (지급 정보 + PII)

모든 M*에 대해 M10 (테스트)이 RED 단계로 선행, GREEN 단계로 동행
M9 (a11y/i18n polish)는 M2-M8 모두 완료 후
```

병렬 실행 가능한 마일스톤:
- M2 + M4 + M5 (서로 독립)
- M3은 M2 완료 후
- M7은 M1 게이트 통과 후 M2와 독립적으로 진행
- M6은 M2 완료 후

---

## 4. 파일 트리 (구현 후 예상)

```
src/app/(instructor)/me/
├── page.tsx                                  [M5+M2: 대시보드]
├── loading.tsx                               [M9]
├── resume/
│   ├── page.tsx                              [M2]
│   ├── actions.ts                            [M2]
│   ├── import/
│   │   ├── page.tsx                          [M6]
│   │   └── actions.ts                        [M6]
│   ├── export/
│   │   └── route.ts                          [M8]
│   └── skills/
│       └── page.tsx                          [M3]
├── calendar/
│   ├── page.tsx                              [M4]
│   └── actions.ts                            [M4]
├── settlements/
│   ├── page.tsx                              [M5]
│   └── [id]/page.tsx                         [M5]
└── settings/
    ├── page.tsx                              [M7]
    └── payout/
        ├── page.tsx                          [M7]
        └── actions.ts                        [M7]

src/lib/instructor/
├── resume-pdf.tsx                            [M8]
├── resume-mask.ts                            [M1]
├── settlement-summary.ts                     [M5]
├── schedule-conflict.ts                      [M4]
└── pii-prefilter.ts                          [M6]

src/lib/validation/
├── instructor.ts                             [M2]
├── payout.ts                                 [M7]
└── schedule-input.ts                         [M4]

src/lib/format/
├── datetime.ts                               [M1]
└── pdf-fonts.ts                              [M8]

src/lib/storage/
└── payout-upload.ts                          [M7]

src/db/queries/instructor/
├── ensure-row.ts                             [M2]
├── resume.ts                                 [M2]
├── skills.ts                                 [M3]
├── schedules.ts                              [M4]
├── settlements.ts                            [M5]
├── payout.ts                                 [M7]
├── files.ts                                  [M2/M6/M7]
└── ai-cache.ts                               [M6]

src/ai/
├── client.ts                                 [M6]
├── prompts/
│   └── resume-parse.ts                       [M6]
├── parsers/
│   └── resume.ts                             [M6]
├── extract-text.ts                           [M6]
└── fallback.ts                               [M6]

src/components/instructor/
├── DashboardWidgets.tsx                      [M5/M2]
├── ResumeForm.tsx                            [M2]
├── ResumeSectionEditor.tsx                   [M2]
├── ResumeImportDialog.tsx                    [M6]
├── SkillsPicker.tsx                          [M3]
├── CalendarView.tsx                          [M4]
├── ScheduleDialog.tsx                        [M4]
├── UnavailableEditor.tsx                     [M4]
├── SettlementsTable.tsx                      [M5]
├── SettlementSummaryBand.tsx                 [M5]
└── PayoutSettingsForm.tsx                    [M7]

src/components/app/
└── sidebar.tsx                               [M2: instructor 메뉴 placeholder 채움]

tests/
├── unit/
│   ├── lib/
│   │   ├── settlement-summary.test.ts        [M5, HARD 100%]
│   │   ├── resume-mask.test.ts               [M1]
│   │   ├── schedule-conflict.test.ts         [M4]
│   │   └── pii-prefilter.test.ts             [M6]
│   ├── validation/
│   │   ├── instructor.test.ts                [M2]
│   │   ├── payout.test.ts                    [M7]
│   │   └── schedule-input.test.ts            [M4]
│   ├── ai/parsers/
│   │   └── resume.test.ts                    [M6]
│   └── components/
│       └── SkillsPicker.test.tsx             [M3]
├── integration/
│   ├── instructor-resume.test.ts             [M2]
│   ├── instructor-skills.test.ts             [M3]
│   ├── instructor-schedules.test.ts          [M4]
│   ├── instructor-settlements.test.ts        [M5]
│   ├── ai-resume-cache.test.ts               [M6]
│   ├── instructor-payout.test.ts             [M7]
│   └── resume-pdf.test.ts                    [M8]
└── e2e/
    └── me-a11y.spec.ts                       [M9]
```

---

## 5. RED-GREEN-REFACTOR 통합 표 (manager-tdd 위임용)

| Milestone | RED 테스트 파일 | GREEN 산출물 | REFACTOR 포커스 |
|-----------|---------------|-------------|----------------|
| M1 | `tests/unit/lib/resume-mask.test.ts`, `tests/unit/lib/format/datetime.test.ts` | `resume-mask.ts`, `datetime.ts` | 정규식 helper 추출 |
| M2 | `tests/unit/validation/instructor.test.ts`, `tests/integration/instructor-resume.test.ts` | 7 sections CRUD + actions | 7 섹션 generic 압축 |
| M3 | `tests/integration/instructor-skills.test.ts`, `tests/unit/components/SkillsPicker.test.tsx` | `skills.ts`, `SkillsPicker.tsx` | tree expand/select 분리 |
| M4 | `tests/unit/lib/schedule-conflict.test.ts`, `tests/unit/validation/schedule-input.test.ts`, `tests/integration/instructor-schedules.test.ts` | `schedules.ts`, `CalendarView.tsx`, `ScheduleDialog.tsx` | mutation hook 추출 |
| M5 | `tests/unit/lib/settlement-summary.test.ts` (HARD 100%), `tests/integration/instructor-settlements.test.ts` | `settlement-summary.ts`, `settlements.ts`, list/detail pages | reduce/map 패턴 |
| M6 | `tests/unit/lib/pii-prefilter.test.ts`, `tests/unit/ai/parsers/resume.test.ts`, `tests/integration/ai-resume-cache.test.ts` | AI 모듈 + import flow | abort/timeout helper |
| M7 | `tests/unit/validation/payout.test.ts`, `tests/integration/instructor-payout.test.ts` | payout queries + form + actions | 암호화 호출 통합 |
| M8 | `tests/integration/resume-pdf.test.ts` | `resume-pdf.tsx`, export route | 7-section 데이터 매핑 |
| M9 | `tests/e2e/me-a11y.spec.ts` | aria 속성 정리 | aria helper |

---

## 6. 위험 / 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Storage 버킷 부재 | M7/M8 차단 | M1 게이트에서 즉시 확인. 누락 시 SPEC-DB-002로 분리 + 본 SPEC은 M7의 통장사본/M2의 첨부 기능을 disabled로 출시 |
| pgcrypto user-callable RPC 부재 | M7 차단 | (a) service role + Server Action 우회로 M7 진행 가능 (REQ-ME-PAYOUT-008), (b) 그래도 막히면 SPEC-DB-002 |
| FullCalendar v6 + React 19 호환 이슈 | M4 차단 | M1 spike에서 검증. 실패 시 `react-big-calendar` 또는 자체 구현으로 대체. SPEC 본문 변경 0 (UX 동일) |
| `@react-pdf/renderer` 한국어 폰트 깨짐 | M8 차단 | M1 spike에서 Pretendard 등록 검증. 실패 시 `pdf-lib` + 직접 폰트 임베드로 대체 |
| Claude API 응답이 schema와 다름 | M6 fallback 발동 빈도 ↑ | system 프롬프트에 strict JSON + tool use 권장. zod 검증 강제. fallback 흐름이 정상 작동하면 사용성 손상 0 |
| 정산 BigInt 정밀도 오차 | 회계 오류 | settlement-summary 단위 테스트 100%. JS Number 사용 0건 (eslint rule 또는 review) |
| RLS instructor self-write 정책 누락 | M2 차단 | M1 게이트에서 `supabase/migrations/20260427000060_rls_policies.sql` 검토. 누락 정책은 SPEC-DB-002로 분리 |
| 자동 저장 draft 충돌 | UX 혼란 | 단일 form version + timestamp + 사용자 명시 confirm 다이얼로그 |
| AI 비용 초과 | 운영 부담 | 캐시 + 파일 hash dedup + 강사별 일일 N회 limit. 캐시 hit ratio 모니터링 (M9 metric) |
| 통장사본 PDF에 평문 주민번호 | 개인정보 노출 | 통장사본 자체는 강사 본인 만 access. 이력서 PDF 다운로드는 별도 mask 토글로 분리 |
| KST/UTC 혼용 | 일정 시각 오표시 | `date-fns-tz` 일관 사용. M9에서 grep 검수 |
| Drizzle 마이그레이션 자동 생성 | SPEC 위반 | `pnpm db:generate` 결과 SQL 파일 신규 0건 검증. 발생 시 즉시 폐기 + SPEC-DB-002로 분리 |

---

## 7. Definition of Done (DoD)

- [ ] M1 ~ M10 모든 마일스톤 GREEN
- [ ] 시나리오 1–15 + EC-1 ~ EC-12 acceptance.md PASS
- [ ] 단위 테스트: settlement-summary 100% (HARD), 전체 ≥ 85%
- [ ] axe DevTools 5개 페이지 critical 0
- [ ] Lighthouse Accessibility ≥ 95
- [ ] `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` 0 에러
- [ ] DB 변경 0 (`supabase/migrations/` diff 0건)
- [ ] Storage 버킷 RLS 검증
- [ ] pii_access_log row 생성 검증
- [ ] product.md §6 모든 제약 준수 (개인정보 마스킹 / AI fallback / 회계 단위 테스트 / 한국어)
- [ ] 한국어 일관성 검수 (영문 평문 노출 0)
- [ ] Asia/Seoul 시간대 일관성 검수
- [ ] @MX 태그 부여:
  - `@MX:ANCHOR` — `getCurrentUser()` consumers, `settlement-summary.ts` 합계 함수, payout encryption
  - `@MX:NOTE` — Server Actions, AI 파싱 entry, PDF route handler
  - `@MX:WARN` — pgcrypto 호출, Storage 업로드 (PII), Claude 호출 timeout/abort
  - `@MX:TODO` — RLS 추가 검증 / SPEC-DB-002 위임 항목 표시
- [ ] SPEC-AUTH-001 / SPEC-LAYOUT-001 / SPEC-DB-001 회귀 0건
- [ ] commit 메시지 conventional commits + SPEC-ME-001 트레일러
- [ ] PR description에 시나리오 PASS 매트릭스 + axe/Lighthouse 보고

---

## 8. 후속 SPEC 제안 (본 SPEC 완료 후)

| SPEC ID (제안) | 제목 | 우선순위 |
|---------------|------|---------|
| SPEC-DB-002 | (조건부) Storage 버킷 + pgcrypto RPC + RLS 누락분 보완 | M1 게이트 결과에 따름 |
| SPEC-ME-002 | 강사 in-session 비밀번호 변경 + 프로필 편집 | Medium |
| SPEC-NOTIF-001 | 인앱 알림 트리거 + 표시 (강사 수락/거절 알림 포함) | High (전 페르소나 공통) |
| SPEC-RECO-001 | AI 강사 추천 알고리즘 (`unavailable` 회피 활용) | High |
| SPEC-INSTR-OP-001 | 운영자가 강사 이력서/정산을 read 또는 read-write 할 수 있는 화면 | High |

---

_End of SPEC-ME-001 plan.md_
