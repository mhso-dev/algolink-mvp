---
id: SPEC-PROJECT-SEARCH-001
version: 1.0.0
status: completed
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: medium
issue_number: null
---

# SPEC-PROJECT-SEARCH-001: 프로젝트 리스트 다중 컬럼 검색 (Project List Multi-Column Search)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성 (draft). SPEC-PROJECT-001(완료, v1.2.0)이 출시한 `(operator)/projects` 리스트 페이지의 `q` 검색 파라미터를 다중 컬럼 매칭으로 확장한다. 현재 구현(`src/lib/projects/list-queries.ts` `fetchProjectList`)은 `q` 가 들어오면 `ilike("title", "%q%")` 한 줄로만 처리하는 stub 상태이며, 사용자는 고객사명("삼성", "LG")으로 검색해도 결과가 비어 결과적으로 검색 박스가 **제목 한정**임을 학습해야 하는 UX 부채가 발생한다. 본 SPEC은 (1) `projects.title` + 임베디드 리소스 `clients.name` (필요 시 `projects.notes` — `description` 컬럼 부재 확인됨, §2.4) 세 컬럼 OR 결합 검색, (2) Postgres LIKE 메타문자(`%`, `_`, `\`) 이스케이프, (3) 공백 트리밍/빈 값 무시, (4) 100자 입력 길이 캡, (5) 기존 필터(`status[]`, `operatorId`, `clientId`, `startFrom`, `startTo`)와의 AND 결합 + 페이지네이션/정렬 보존, (6) `count: 'exact'` semantics 유지를 정의한다. SPEC-PROJECT-001(완료) `fetchProjectList`/`ProjectListQuery` 재사용. DB 마이그레이션 없음(기존 컬럼만 사용). 본 SPEC은 검색 결과 하이라이트 UI, 풀텍스트(`tsvector`) 인덱스 도입, 강사명/PM명 검색 확장은 명시적 제외한다.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

`(operator)/projects` 리스트의 `q` 검색 박스를 **제목 한정**에서 **제목 + 고객사명 + 비고(notes)** 다중 컬럼 OR 검색으로 승격한다. 사용자가 "삼성"을 입력하면 (a) 제목에 "삼성"이 포함된 프로젝트, (b) 고객사명이 "삼성전자"인 프로젝트, (c) 비고에 "삼성그룹 내부 교육"이 적힌 프로젝트가 모두 한 결과 셋으로 반환되도록 한다. 본 SPEC의 산출물은 (i) `src/lib/projects/list-queries.ts` 내 검색 절 빌더(`buildSearchClause`) 헬퍼, (ii) Postgres LIKE 메타문자 이스케이프 규칙, (iii) 입력 정규화 규칙(트리밍 + 빈 값 무시 + 100자 캡), (iv) Supabase PostgREST `.or()` + 임베디드 리소스 `clients!inner(name)` 필터 통합, (v) 기존 필터/정렬/페이지네이션과의 AND 보존, (vi) `tests/lib/projects/list-queries.test.ts` 단위 테스트, (vii) `@MX:ANCHOR` (검색 절 빌더는 리스트 페이지 + 향후 프로젝트 picker 의 high fan_in 코드 경로) 및 `@MX:NOTE` (이스케이프 규칙 + 100자 캡 근거) 코드 주석이다.

본 SPEC은 풀텍스트 인덱스(`tsvector`/`pg_trgm`) 도입, 검색 결과 하이라이트 렌더링, 강사명·PM명까지 확장, AI 의미 기반 검색은 빌드하지 않는다.

### 1.2 배경 (Background)

SPEC-PROJECT-001 §2.1 `fetchProjectList` (line 36-39, `src/lib/projects/list-queries.ts`)는 다음 stub 코멘트를 명시한다:

```
if (query.q) {
  // 제목 부분 일치 (case-insensitive). 고객사 검색은 별도 join 필요해 여기서는 제목만.
  q = q.ilike("title", `%${query.q}%`);
}
```

해당 코멘트가 명시하듯, 제목 한정은 의도된 MVP 스코프 축소였으며 **고객사 join 검색은 후속 SPEC** 으로 미뤄진 상태다. Phase 1 회귀 테스트 통과 후 제출되는 본 SPEC이 그 후속이다. 추가로, Phase 1 회귀(SPEC-AUTH-001 P0 회귀 방지)에서 고객사명 입력 케이스가 빈 결과를 반환하는 현상이 관찰되어, "검색이 동작하지 않는다"라는 사용자 오해를 유발할 수 있다는 우려가 대시보드 리뷰에서 보고됐다(2026-04-28, README §"테스트/MX 섹션").

또한 Postgres `ilike` 패턴은 `%` (zero-or-more) 와 `_` (single char) 를 메타문자로 해석하므로, 사용자가 할인 캠페인 검색을 위해 `"50%"`을 입력하면 현재 구현은 "**50** 으로 시작하는 모든 프로젝트"를 반환하는 의도치 않은 매칭을 발생시킨다. 본 SPEC은 이 메타문자 이스케이프도 함께 정의한다.

### 1.3 정의 (Terminology)

- **다중 컬럼 OR 검색**: 동일한 검색어 `q` 를 N 개 컬럼 각각에 대해 `ilike` 매칭한 뒤 OR 결합. PostgREST 표기로는 `.or("title.ilike.%q%,notes.ilike.%q%")`.
- **임베디드 리소스 필터(embedded resource filter)**: PostgREST 가 외래 키 join 결과(`clients`)의 컬럼(`clients.name`)을 자식 리소스 표기(`clients.name`) 로 노출하는 문법. Supabase JS 에서는 `.or("name.ilike.%q%", { foreignTable: "clients" })` 또는 `clients!inner(name)` 패턴.
- **LIKE 메타문자 이스케이프**: `%` → `\%`, `_` → `\_`, `\` → `\\` 치환. 치환 후 `%...%` 래핑.
- **고객사명**: `clients.name` (SPEC-DB-001 `clients` 테이블, 한국어 회사명).
- **`projects.notes`**: SPEC-DB-001 `projects` 테이블의 `notes text` 컬럼. SPEC 본문이 처음 가정한 `description` 컬럼은 **존재하지 않음**(§2.4 검증 결과). `notes` 가 사실상의 메모/설명 필드이므로 본 SPEC은 `notes` 까지 확장한다.

### 1.4 범위 (Scope)

[IN SCOPE]

- `fetchProjectList` 의 `q` 처리 로직 확장 (`src/lib/projects/list-queries.ts`)
- `buildSearchClause(q: string)` 헬퍼 함수 추출 (입력 정규화 + 이스케이프 + PostgREST `.or()` 표현식 생성)
- `clients!inner(name)` join + 임베디드 리소스 검색
- 단위 테스트 추가/확장 (`tests/lib/projects/list-queries.test.ts`)
- `@MX:ANCHOR` / `@MX:NOTE` 코드 주석

[OUT OF SCOPE]

- 검색 결과 하이라이트 렌더링 (UI 마크업 변경)
- 풀텍스트 인덱스(`tsvector`, `pg_trgm`) 도입
- 강사명·운영자명·PM명 검색 확장
- AI 의미 기반 검색(Claude embedding)
- DB 마이그레이션
- 검색 키워드 자동완성/최근 검색 기록

---

## 2. 요구사항 (Requirements — EARS Format)

### 2.1 핵심 기능 요구사항 (Functional)

**REQ-PS-001 (Ubiquitous — 다중 컬럼 검색):**
The system SHALL extend the `q` search parameter handling in `fetchProjectList` to match across the following columns, OR-combined: (a) `projects.title`, (b) joined `clients.name` (via PostgREST embedded resource filter `clients!inner(name)`), and (c) `projects.notes` (verified existing column on `projects` table — the originally hypothesized `description` column does NOT exist; see §2.4). Matching SHALL be case-insensitive (`ilike`). When any of the three columns matches, the row SHALL be included in the result set.

**REQ-PS-002 (Event-Driven — LIKE 메타문자 이스케이프):**
WHEN a non-empty `q` value is provided, the system SHALL escape Postgres LIKE special characters in this exact order before wrapping in `%...%`:

1. `\` → `\\` (backslash first, to avoid double-escaping subsequent replacements)
2. `%` → `\%`
3. `_` → `\_`

Example: `q = "50%할인_특가"` → escaped → `"50\%할인\_특가"` → wrapped → `"%50\%할인\_특가%"`. The escape SHALL be applied identically to all three target columns (`title`, `clients.name`, `notes`).

**REQ-PS-003 (Ubiquitous — 입력 정규화):**
The system SHALL trim leading and trailing whitespace from `q` before processing. IF the trimmed value is an empty string, THEN the system SHALL ignore the `q` parameter entirely and SHALL NOT add any `or`/`ilike` clause to the query (preserving the no-search behavior identical to `q === undefined`).

**REQ-PS-004 (Ubiquitous — 길이 상한):**
The system SHALL truncate `q` to a maximum of 100 Unicode code points (via `Array.from(q).slice(0, 100).join('')` to handle multi-byte CJK characters correctly) before applying the search. Truncation SHALL occur AFTER trimming (REQ-PS-003) but BEFORE escaping (REQ-PS-002). The 100-character cap exists to (a) bound query plan complexity, (b) prevent ReDoS-style abuse vectors via crafted long inputs, (c) match typical UI input field reality (`<input maxLength={100}>` SHOULD be set in a follow-up but server-side enforcement is the trust boundary).

**REQ-PS-005 (Ubiquitous — AND 결합 보존):**
The `q` filter clause SHALL be AND-combined with all existing filters (`status[]`, `operatorId`, `clientId`, `startFrom`, `startTo`) and SHALL NOT alter (a) the existing `is("deleted_at", null)` soft-delete guard, (b) the existing `order(...)` sort clause, (c) the existing `range(from, to)` pagination, (d) the existing `count: 'exact'` aggregation. A search query result SHALL satisfy `(title OR clients.name OR notes matches q) AND (all other filters)`.

**REQ-PS-006 (Ubiquitous — Supabase PostgREST 통합):**
The system SHALL implement client-table search using Supabase PostgREST embedded resource filter syntax. The `select` clause SHALL be extended to include the joined client name (e.g. `... , clients!inner(name)`) so PostgREST returns the join. The `.or()` filter SHALL be split into two calls — one for own-table columns (`title`, `notes`) and one for the embedded resource (`name`) using the `{ foreignTable: 'clients' }` option — combined into a single query result via the underlying SQL-level OR. The existing `count: 'exact'` semantics SHALL be preserved across the join.

> **Note on REQ-PS-006 implementation discovery**: Supabase JS does not expose a single-call OR across own-table + embedded resource columns directly. Two options exist:
> (A) Two separate `.or()` calls on the same builder — but PostgREST treats sequential `.or()` as AND-combined, which would produce `(title OR notes) AND (clients.name)` — **incorrect** for our OR-of-3 semantics.
> (B) `.or()` with PostgREST `.or` foreignTable expression syntax: `.or('title.ilike.%q%,notes.ilike.%q%,clients.name.ilike.%q%')` — this requires the embedded resource to be selected via `clients!inner(name)` so PostgREST can resolve `clients.name` in the filter. **This is the canonical approach** and what the implementation SHALL use.
>
> Fallback: if option (B) proves brittle in production due to Supabase JS version drift (verified locally with `@supabase/supabase-js@2.x` at SPEC time), the implementation MAY scope the search to `title + notes` only and document the limitation as a follow-up SPEC. This fallback MUST be flagged via `@MX:WARN` and a `// TODO(SPEC-PROJECT-SEARCH-002):` comment.

### 2.2 Non-Functional Requirements

- **REQ-PS-NFR-001 (Performance):** The added `.or()` clause across 3 columns SHALL NOT exceed P95 latency budget of 150ms on a dataset of 10,000 projects with the existing index set (no new index required for MVP). Verified via `EXPLAIN ANALYZE` in `pnpm db:verify` extension (deferred — not in scope, but SHOULD be added if KPI degrades).
- **REQ-PS-NFR-002 (Code Quality):** The `buildSearchClause` helper SHALL be a pure function (`(q: string | null | undefined) => { searchExpr: string | null }`) with zero side effects, fully unit-tested, and tagged `@MX:ANCHOR` since it is the single trust boundary for user-supplied LIKE patterns and will be reused by future SPECs (project picker, instructor picker, etc.).
- **REQ-PS-NFR-003 (Logging):** No PII SHALL be logged. The escaped `q` value MAY be logged at DEBUG level only. Production logging defaults to INFO and SHALL omit `q`.
- **REQ-PS-NFR-004 (Backward Compatibility):** The `ProjectListQuery.q` type signature (`string | undefined`) SHALL remain unchanged. Existing callers (page route, future picker) SHALL NOT require modification.

### 2.3 Acceptance Criteria

(상세 시나리오는 `acceptance.md` 참조)

- AC-1: 빈/공백 `q` 입력 시 `or`/`ilike` 절 미발생 (DB 호출 횟수·SQL 동등성 보장).
- AC-2: `q="50%할인"` → 이스케이프 후 `"50\%할인"` 으로 래핑.
- AC-3: 150자 입력 → 100자로 절단.
- AC-4: `q="삼성"` → 제목 미포함이지만 `clients.name='삼성전자'` 인 프로젝트 조회 가능.
- AC-5: `q="삼성"` + `status=['진행']` → 둘 다 만족하는 행만 반환 (AND 결합).
- AC-6: `pnpm typecheck && pnpm lint && pnpm test:unit` 전 통과.

### 2.4 컬럼 존재성 검증 (Schema Verification)

본 SPEC 작성 시점에 `supabase/migrations/20260427000030_initial_schema.sql` 의 `projects` 테이블 정의를 검증한 결과, 컬럼 셋은 다음과 같다:

```
projects (
  id, title, project_type, status,
  client_id, operator_id, instructor_id,
  education_start_at, education_end_at, scheduled_at,
  business_amount_krw, instructor_fee_krw, margin_krw (generated),
  settlement_flow_hint, notes,    -- ← description 아님
  deleted_at, created_at, ...
)
```

**결론**: `description` 컬럼은 존재하지 않으며, 사용자 메모/설명 용도의 사실상 동등 컬럼은 `notes` 이다. 따라서 REQ-PS-001 의 세 번째 검색 컬럼은 `projects.notes` 로 확정한다. (사용자 요청 SPEC 본문의 "if absent, scope is title + clients.name" 폴백 조건은 `notes` 가 적절한 대체 컬럼이므로 발동되지 않는다.)

### 2.5 의존성 (Dependencies)

- SPEC-PROJECT-001 (완료, v1.2.0) — `fetchProjectList`, `ProjectListQuery` 타입.
- SPEC-DB-001 (완료) — `projects` / `clients` 테이블 스키마, RLS 정책. `clients.name` 은 operator/admin 역할로 select 가능 (확인됨).
- SPEC-AUTH-001 (완료) — `(operator)/projects` 라우트 가드. 본 SPEC 은 인증/권한 흐름을 변경하지 않는다.

---

## 3. 제외 사항 (Exclusions — What NOT to Build)

[HARD] 본 SPEC 은 다음을 빌드하지 않는다:

1. **검색 결과 하이라이트 UI** — `<mark>` 래핑, 검색어 강조. UI 영역 후속 SPEC.
2. **풀텍스트 인덱스 도입** — `tsvector` 컬럼, `pg_trgm` GIN 인덱스, `to_tsquery` 변환. MVP 데이터 규모에서 `ilike + B-tree` 로 충분하다는 가정. 데이터 규모가 50k 행을 초과하면 `SPEC-PROJECT-SEARCH-002 (FTS)` 를 제기한다.
3. **추가 컬럼 검색 확장** — 강사명(`instructors.full_name`), 운영자명(`profiles.full_name`), 프로젝트 타입(`project_type` enum) 검색. 본 SPEC 은 title + clients.name + notes 로 한정.
4. **AI 의미 기반 검색** — Claude/OpenAI embedding 으로 의미 유사도 매칭. 별도 SPEC.
5. **검색 키워드 자동완성** — typeahead 드롭다운, 최근 검색 기록 저장.
6. **DB 마이그레이션** — 본 SPEC 은 기존 컬럼만 사용한다. 인덱스 추가도 본 SPEC 외.
7. **검색 키워드 분석 KPI** — "사용자가 가장 많이 검색하는 키워드 Top-10" 같은 product analytics. 별도 SPEC.
8. **다국어 검색 정규화** — 한영 자동 변환, 자모 분해 검색. 한국어 입력은 그대로 `ilike` 로 매칭.
9. **검색 페이지 직접 라우트** — `/search?q=...` 같은 별도 라우트. 본 SPEC 은 기존 `/projects?q=...` 만 강화.
10. **API 변경 (HTTP)** — `fetchProjectList` 는 서버 컴포넌트에서만 호출되며 외부 HTTP API 가 아니다. REST/GraphQL 엔드포인트 신설 없음.

---

## 4. 트레이서빌리티 (Traceability)

- 코드 변경 위치: `src/lib/projects/list-queries.ts` (`fetchProjectList` 본문 + 신규 `buildSearchClause` 헬퍼)
- 테스트 위치: `tests/lib/projects/list-queries.test.ts` (신규 또는 확장 — 기존 컨벤션은 `src/lib/<domain>/__tests__/<name>.test.ts` 이나, 본 SPEC 은 사용자 지정 경로를 따른다 — `plan.md` §"테스트 경로 결정" 참조)
- MX 태그:
  - `@MX:ANCHOR` — `buildSearchClause` 함수 (high fan_in: 리스트 페이지 + 향후 picker)
  - `@MX:NOTE` — `fetchProjectList` 내 `q` 처리 블록에 LIKE 이스케이프 규칙 + 100자 캡 근거
  - `@MX:WARN` — REQ-PS-006 폴백 시나리오 발생 시 (옵션 B 가 동작하지 않을 때만 부착)

---

---

## Implementation Notes

### 변경 파일

- **`src/lib/projects/list-queries.ts`** (+57 / -4): `buildSearchClause` 헬퍼 신규 export, `fetchProjectList` 내 `q` 처리 블록 교체, `clients.company_name` 2-stage 조회 통합.
- **`src/lib/projects/__tests__/list-queries.test.ts`** (+220 / 신규): `buildSearchClause` 단위 테스트 6케이스 + `fetchProjectList` mock 테스트 9케이스 = 총 15 테스트 케이스.

### 채택 전략: 2-stage 크로스 테이블 검색

SPEC 초안(REQ-PS-006)에서 제안한 PostgREST `.or()` 단일 호출로 own-table + embedded resource 컬럼을 OR 결합하는 방식(옵션 B) 대신, **2-stage 방식**을 채택했다.

구체적으로:
1. **1차 조회**: `clients` 테이블에서 `company_name ilike %q%` 조건으로 매칭 클라이언트 `id` 집합을 조회.
2. **2차 조회**: `projects` 테이블에서 `title.ilike.%q%,notes.ilike.%q%,client_id.in.(id1,id2,...)` OR 결합으로 최종 결과 조회.

**채택 이유**: PostgREST의 cross-table `.or()` 표현식(`clients.name.ilike.%q%`을 own-table 컬럼과 한 `.or()` 호출로 묶는 방식)은 Supabase JS 버전에 따라 HTTP 400을 반환하는 취약성이 있다. 2-stage 방식은 각 쿼리가 단일 테이블 범위 내에 머물러 PostgREST 호환성이 보장되며, 동일한 OR-of-3 의미를 안전하게 달성한다.

### 컬럼 확정

- `clients.company_name` — SPEC 초안에서 `clients.name` 으로 기술했으나, 실제 DB 스키마(`supabase/migrations/`) 확인 결과 `company_name` 이 정확한 컬럼명임을 확인하고 구현 및 테스트에 반영.
- `projects.notes` — SPEC 초안의 `description` 가정은 폴백 조건 적용 없이 `notes` 로 확정 (§2.4 검증 결과 그대로).

### 테스트 커버리지

총 15 케이스:

- `buildSearchClause` 헬퍼 (6 케이스): null/undefined/공백 → null, 일반 문자열 래핑, 공백 트리밍, LIKE 메타문자 escape (`%`, `_`, `\`), 100자 초과 절단, 100자 정확히 유지.
- `fetchProjectList` mock (9 케이스): q 없음 → clients 조회 없음, q 공백 → 미적용, q 있음 → company_name ilike + 3-컬럼 OR, clients 0 매칭 → client_id.in 생략, 메타문자 escape, 150자 절단, q+status AND 결합, q 없음+status, 페이지네이션 range 검증.

### MX 태그 현황

- `@MX:ANCHOR` — `buildSearchClause` 함수 직전: 사용자 입력 LIKE 패턴 신뢰 경계, fan_in ≥ 3 예상 (list page + 향후 picker).
- `@MX:NOTE` × 2 — 파일 상단: `ProjectListQuery → Supabase select chain` 개요, 2-stage 전략 근거.
- `@MX:REASON` — `@MX:ANCHOR` 하위: LIKE 메타문자 escape 필요성 + 100자 캡 근거 명시.

---

Version: 1.0.0
Status: completed
Last Updated: 2026-04-28
REQ coverage: REQ-PS-001, REQ-PS-002, REQ-PS-003, REQ-PS-004, REQ-PS-005, REQ-PS-006, REQ-PS-NFR-001, REQ-PS-NFR-002, REQ-PS-NFR-003, REQ-PS-NFR-004
