---
id: SPEC-PROJECT-SEARCH-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: medium
issue_number: null
---

# SPEC-PROJECT-SEARCH-001: 인수 기준 (Acceptance Criteria)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성 (draft). 6 개 AC + 5 개 엣지 케이스 + Definition of Done.

---

## 1. Acceptance Criteria (Given-When-Then)

### AC-1: 빈/공백 q 입력 시 검색 절 미발생

**REQ Coverage**: REQ-PS-003

**Given** Supabase 모킹된 query builder 가 chain 메서드(`select`, `is`, `or`, `ilike`, `in`, `eq`, `gte`, `lte`, `order`, `range`) 호출을 기록한다,
**And** `ProjectListQuery` 의 다른 필드(status[], page, pageSize, sort, order)는 기본값,
**When** `fetchProjectList(supabase, { ...defaults, q: undefined })` 를 호출하고,
**And** 같은 시나리오를 `q: ""` 와 `q: "   "` (공백만) 으로도 반복하면,
**Then** 세 호출 모두에서 `or` 메서드는 **0회** 호출되어야 하고,
**And** 기존의 `is("deleted_at", null)`, `select(...)`, `order(...)`, `range(...)` 호출은 정확히 1회씩 호출되어야 한다,
**And** `q: undefined` 호출과 `q: ""` 호출의 mock chain 호출 시퀀스는 완전히 동일해야 한다 (no-search behavior 동치성).

**Verification**: `tests/lib/projects/list-queries.test.ts` 내 `it("ignores empty/whitespace q")` 케이스.

---

### AC-2: LIKE 메타문자 이스케이프

**REQ Coverage**: REQ-PS-002

**Given** `q = "50%할인"` 입력,
**When** `buildSearchClause(q)` 호출,
**Then** 반환된 `searchExpr` 문자열에 다음이 모두 포함되어야 한다:

- `title.ilike.%50\%할인%`
- `notes.ilike.%50\%할인%`
- `clients.name.ilike.%50\%할인%`

**And** raw `%` (이스케이프되지 않은) 는 `50` 과 `할인` 사이 위치에 존재하지 않아야 한다 (정확히 검증: `searchExpr.indexOf("50%할인")` 는 `-1` — 항상 `50\%할인` 으로만 발견됨; 단, `%50\%할인%` 의 양 끝 `%` 는 wrapping 으로 정상).

**Edge case 동시 검증**:

- `q = "a_b"` → `searchExpr` 에 `a\_b` 포함, raw `_` 매칭 부재
- `q = "c\\d"` (JS 문자열 `c\d`) → `searchExpr` 에 `c\\\\d` (JS 문자열 `c\\d`) 포함

**Verification**: 단위 테스트 `it("escapes LIKE metacharacters: %, _, \\\\")`.

---

### AC-3: 100자 절단 (CJK-안전)

**REQ Coverage**: REQ-PS-004

**Given** 한글 150자 입력 — 예: `"가".repeat(150)`,
**When** `buildSearchClause(q)` 호출,
**Then** 반환된 `searchExpr` 의 패턴 본문(`%...%` 안쪽)은 정확히 100자(code points) 의 한글로 구성되어야 한다,
**And** `Array.from(pattern.slice(1, -1)).length === 100` 이 참이어야 한다,
**And** surrogate pair 분리로 인한 깨진 글자가 없어야 한다 (이모지 입력 케이스 — `q = "🎉".repeat(150)` 도 100 code points 로 절단되며 깨짐 없음).

**Edge case 추가**:

- `q = "  " + "가".repeat(150) + "  "` → 트리밍 후 절단 → 정확히 100 code points
- `q = "a".repeat(50)` → 절단 안 됨, 50자 그대로

**Verification**: 단위 테스트 `it("truncates to 100 code points (CJK-safe)")`.

---

### AC-4: 고객사명으로 매칭 (제목 미포함이어도)

**REQ Coverage**: REQ-PS-001, REQ-PS-006

**Given** Supabase mock 이 `q="삼성"` 으로 호출 시 빈 결과가 아니라 다음 데이터를 반환하도록 설정:

```
[
  { id: "p1", title: "AI 워크샵", client_id: "c1", clients: { name: "삼성전자" }, ... },
  { id: "p2", title: "삼성전자 임원 교육", client_id: "c1", clients: { name: "삼성전자" }, ... }
]
```

**When** `fetchProjectList(supabase, { ...defaults, q: "삼성" })` 호출,
**Then** mock 의 `or` 메서드는 정확히 1회 호출되었어야 하고,
**And** `or` 의 인자 문자열은 다음 세 부분을 모두 포함:

- `title.ilike.%삼성%`
- `notes.ilike.%삼성%`
- `clients.name.ilike.%삼성%`

**And** 반환된 `rows` 는 두 행 모두 포함 (mock 이 그대로 반환했으므로),
**And** `total` 은 mock 이 설정한 `count` 값과 일치.

**Note**: 본 AC 는 mock 기반 단위 테스트로 검증한다. 실제 Supabase 인스턴스에서의 join 검색 검증은 E2E (Playwright) 또는 통합 테스트 영역이며, MVP 본 SPEC 범위에서는 mock 의 chain 호출 인자 검증만으로도 충분 (REQ-PS-006 의 PostgREST 표현식이 올바르게 생성됨을 보장).

**Verification**: 단위 테스트 `it("queries title, notes, and clients.name when q is provided")`.

---

### AC-5: q + status 필터 AND 결합

**REQ Coverage**: REQ-PS-005

**Given** Supabase mock 의 chain 호출 기록,
**When** `fetchProjectList(supabase, { ...defaults, q: "삼성", status: ["proposal" as ProjectStatus] })` 호출,
**Then** 다음이 **모두** 호출되어야 한다 (호출 순서 무관, 호출 횟수 정확히 1회씩):

- `or("title.ilike.%삼성%,notes.ilike.%삼성%,clients.name.ilike.%삼성%")`
- `in("status", ["proposal"])`
- `is("deleted_at", null)`
- `order(...)` (정렬)
- `range(...)` (페이지네이션)

**And** PostgREST 의 `.or()` + `.in()` 체이닝은 SQL 레벨에서 AND 결합이라는 사실은 PostgREST 공식 동작이므로 별도 검증 불요. mock 단위 테스트는 두 호출이 모두 발생함만 보장하면 충분 (회귀 시 AC-4/AC-5 조합으로 검출 가능).

**추가 검증**: `q="삼성"` + `status=[]` (빈 배열) → `in` 호출 0회, `or` 호출 1회 (기존 동작 유지: `if (query.status.length > 0)` 조건).

**Verification**: 단위 테스트 `it("AND-combines q with status filter")`.

---

### AC-6: 전체 품질 게이트

**REQ Coverage**: REQ-PS-NFR-002, REQ-PS-NFR-004 (회귀 없음)

**Given** 본 SPEC 의 M1 ~ M4 마일스톤 모두 완료,
**When** 다음 명령을 순차 실행:

```
pnpm typecheck
pnpm lint
pnpm test:unit
```

**Then** 세 명령 모두 exit code 0 (그린) 으로 종료되어야 하고,
**And** 신규 추가된 단위 테스트(`tests/lib/projects/list-queries.test.ts`) 의 모든 케이스가 PASS,
**And** 기존 단위 테스트(`src/lib/recommend/__tests__/*.test.ts`, `src/lib/dashboard/__tests__/*.test.ts`, `src/auth/__tests__/*.test.ts`) 회귀 없음 (기존 PASS 케이스 모두 그대로 PASS),
**And** `pnpm lint` 결과에 `@typescript-eslint/no-explicit-any` 신규 경고 없음 (기존 라인 외).

**Optional**: `pnpm test:e2e` (Playwright) 도 그린 — 단, Playwright 가 검색 시나리오를 명시적으로 다루지 않으면 회귀만 확인.

**Verification**: CI 또는 로컬에서 위 명령 시퀀스 실행 후 모두 그린.

---

## 2. 엣지 케이스 (Edge Cases)

| ID | 케이스 | 입력 | 기대 동작 |
|----|--------|------|-----------|
| EC-1 | null 입력 | `q: null` (TS 시그니처 외 — 런타임 방어) | `buildSearchClause` 가 `{ searchExpr: null, hasSearch: false }` 반환. `fetchProjectList` 는 q 무시. |
| EC-2 | 단일 `%` 만 입력 | `q: "%"` | `searchExpr` 에 `\%` 포함, 모든 행 매칭이 아니라 리터럴 `%` 포함 행만 매칭. |
| EC-3 | 단일 `_` 만 입력 | `q: "_"` | `searchExpr` 에 `\_` 포함, 모든 한 글자 행이 아니라 리터럴 `_` 포함 행만 매칭. |
| EC-4 | 백슬래시 단독 | `q: "\\"` (JS 문자열 `\`) | `searchExpr` 에 `\\\\` (JS 문자열 `\\`) 포함. |
| EC-5 | 이모지 + ASCII 혼합 100+ | `q: "🎉".repeat(100) + "abc"` | code-point 절단으로 정확히 100 개 이모지만 남고 `abc` 는 잘림. surrogate pair 깨짐 없음. |
| EC-6 | 양쪽 공백 + 내부 공백 | `q: "  삼성 전자  "` | 양 끝만 트리밍, 내부 `삼성 전자` 는 그대로 — `searchExpr` 에 `삼성 전자` 포함. |
| EC-7 | 이미 wildcard 들어간 사용자 입력 | `q: "삼성%전자"` | `%` 이스케이프되어 `삼성\%전자` 로 wrap. PostgreSQL 이 리터럴 `%` 로 해석. |

---

## 3. Definition of Done

본 SPEC 은 다음을 **모두** 만족할 때 status = `done` 으로 전환한다:

### 3.1 코드 품질

- [ ] `src/lib/projects/list-queries.ts` 의 `buildSearchClause` export 됨
- [ ] `fetchProjectList` 의 `q` 처리 블록이 `buildSearchClause` + `.or()` 패턴으로 교체됨
- [ ] `select` 절에 `clients!inner(name)` 추가됨
- [ ] 코드 변경 라인 수 `git diff --stat src/lib/projects/list-queries.ts` 가 합리적 범위 (대략 +30 / -5 이내)
- [ ] 신규 코드 모두 한국어 주석 (기존 컨벤션 일치) + 영문 코드 식별자

### 3.2 테스트

- [ ] `tests/lib/projects/list-queries.test.ts` 신규 파일 생성, AC-1 ~ AC-5 + EC-1 ~ EC-7 케이스 커버
- [ ] `pnpm test:unit` 그린 (신규 + 기존 회귀 없음)
- [ ] 새 테스트 커버리지: `buildSearchClause` 함수의 line/branch 100% (단순 함수이므로 달성 가능)

### 3.3 정적 분석

- [ ] `pnpm typecheck` 그린 (TS 에러 0)
- [ ] `pnpm lint` 그린 (신규 경고/에러 0)

### 3.4 MX 태그

- [ ] `@MX:ANCHOR` 가 `buildSearchClause` 함수 정의 직전 라인에 부착됨
- [ ] `@MX:NOTE` 가 LIKE 이스케이프 라인 또는 함수 본문 상단에 부착되어 (a) 이스케이프 순서 (b) 100자 캡 근거를 명시함
- [ ] `@MX:WARN` 은 폴백 시나리오(REQ-PS-006 옵션 B 실패) 발생 시에만 부착, 미발생 시 부재

### 3.5 문서

- [ ] 본 `acceptance.md` 의 모든 체크박스 체크 완료
- [ ] `plan.md` 의 검증 체크리스트 완료
- [ ] `spec.md` 의 status 가 `draft` → `in_progress` → `done` 으로 진행
- [ ] 사용자 README 의 "Phase 1 SPEC 진행 상태" 섹션 업데이트 (별도 docs(readme) 커밋 — 본 SPEC 범위 외)

### 3.6 회귀 보장

- [ ] 기존 E2E 테스트 (`tests/e2e/projects.spec.ts` 등) 회귀 없음
- [ ] `(operator)/projects` 페이지가 q 미입력 시 기존과 동일한 결과 반환 (수동 또는 E2E)
- [ ] `q + status[]` + 페이지네이션 + 정렬 조합 시 기존 동작과 일치 (정렬 순서, 페이지 카운트, total)

### 3.7 사용자 검증 (선택)

- [ ] 로컬 `pnpm dev` + Supabase 시드 데이터로 다음 시나리오 수동 검증:
  - `/projects?q=삼성` → 고객사 "삼성*" 인 프로젝트가 결과에 포함됨
  - `/projects?q=AI&status=proposal` → 두 조건 모두 만족하는 행만 노출
  - `/projects?q=50%할인` → 빈 결과 또는 리터럴 "50%할인" 포함 행만 (와일드카드 매칭 아님)

---

## 4. 품질 게이트 매핑 (TRUST 5)

| TRUST 차원 | 본 SPEC 적용 |
|-----------|-------------|
| **T**ested | AC-1 ~ AC-6 + EC-1 ~ EC-7 단위 테스트로 커버. `buildSearchClause` 100% line/branch coverage. |
| **R**eadable | `buildSearchClause` 는 순수 함수, 단일 책임. 한국어 주석 + 영문 식별자. |
| **U**nified | 기존 `fetchProjectList` 코드 스타일/네이밍 컨벤션 준수. ESLint 규칙 위반 없음. |
| **S**ecured | LIKE 메타문자 이스케이프(REQ-PS-002) + 100자 캡(REQ-PS-004) = 사용자 입력 신뢰 경계. PII 로깅 없음(REQ-PS-NFR-003). |
| **T**rackable | `@MX:ANCHOR` / `@MX:NOTE` 부착. 커밋 메시지에 `SPEC-PROJECT-SEARCH-001` 참조. |

---

Version: 0.1.0
Status: draft
Last Updated: 2026-04-28
AC Coverage: AC-1 (REQ-PS-003), AC-2 (REQ-PS-002), AC-3 (REQ-PS-004), AC-4 (REQ-PS-001/006), AC-5 (REQ-PS-005), AC-6 (REQ-PS-NFR-002/004)
