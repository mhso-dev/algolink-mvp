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

# SPEC-PROJECT-SEARCH-001: 구현 계획 (Implementation Plan)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성 (draft). 마일스톤 M1(헬퍼 추출) → M2(`fetchProjectList` 통합) → M3(테스트) → M4(MX 태그 + 회귀 검증) 4 단계.

---

## 1. 변경 파일 (Files Modified)

### 1.1 코드

- **`src/lib/projects/list-queries.ts`** (수정)
  - 신규 export: `buildSearchClause(q: string | null | undefined): { searchExpr: string | null; hasSearch: boolean }`
  - `fetchProjectList` 의 기존 `if (query.q) { q = q.ilike("title", ...) }` 블록을 `buildSearchClause` 호출 + `.or(...)` 절로 교체
  - `select` 절에 `clients!inner(name)` 추가 (PostgREST 가 `clients.name` 컬럼을 임베디드 리소스 필터에서 해석할 수 있도록)
  - 응답 타입 `ProjectListRow` 에 `clients?: { name: string }` 옵셔널 필드 추가 (필요 시 — 검색용 join 결과를 호출자가 무시 가능하도록 선택적 노출)
  - `@MX:ANCHOR` 주석을 `buildSearchClause` 위에 부착
  - `@MX:NOTE` 주석을 LIKE 이스케이프 + 100자 캡 라인 위에 부착

### 1.2 테스트

- **`tests/lib/projects/list-queries.test.ts`** (신규)
  - 사용자 지정 경로. 기존 컨벤션은 `src/lib/<domain>/__tests__/<name>.test.ts` 이나 본 SPEC 은 사용자 지시(테스트 위치는 `tests/lib/projects/list-queries.test.ts`)를 따른다.
  - **테스트 경로 결정 근거**: 사용자 SPEC 명시 우선. Vitest 의 `test.include` 패턴 (`vitest.config.ts` 확인 → 통상 `**/*.test.ts` 매칭) 을 통해 `tests/` 경로도 자동 수집됨을 검증한다. 만약 수집되지 않으면 M3 단계에서 `vitest.config.ts` 의 `include` 에 `tests/**/*.test.ts` 를 추가하는 단일-라인 변경을 포함시킨다 (해당 변경은 본 SPEC 범위 내).
  - `__tests__/` 컨벤션과 일관되게 둘 곳을 원하면 사용자 승인 후 `src/lib/projects/__tests__/list-queries.test.ts` 로 이동 (V0.2.0 에서 결정).

### 1.3 변경 없는 파일 (No Modification)

- `src/app/(operator)/projects/page.tsx` — `fetchProjectList` 시그니처 무변경이므로 페이지 레벨 변경 없음.
- `src/lib/projects/list-query.ts` — `ProjectListQuery` 타입 무변경.
- `supabase/migrations/*` — DB 마이그레이션 없음.
- `vitest.config.ts` — 위 §1.2 단서대로 필요 시에만.

---

## 2. 마일스톤 (Milestones — Priority-Ordered)

[HARD] 시간 추정치 사용 금지. 우선순위 라벨 + 단계 순서로만 표기.

### M1 (Priority: High) — 헬퍼 추출

**Scope**: `buildSearchClause(q)` 순수 함수를 `list-queries.ts` 상단 export 로 추가. 입력 정규화(트리밍, 빈 값 처리, 100자 절단) + LIKE 이스케이프(`\` → `\\` → `%` → `\%` → `_` → `\_` 순서) + PostgREST `.or()` 표현식 문자열 생성.

**Output**:

- 함수 시그니처: `(q: string | null | undefined) => { searchExpr: string | null; hasSearch: boolean }`
- `searchExpr` 예시: `q="삼성"` → `"title.ilike.%삼성%,notes.ilike.%삼성%,clients.name.ilike.%삼성%"`
- `q=""` 또는 `q="   "` → `{ searchExpr: null, hasSearch: false }`
- `q="50%할인_특가"` → `searchExpr` 내 `"50\%할인\_특가"` 패턴 포함

**Verification**: 함수가 export 되며, 컴파일 성공 (`pnpm typecheck`).

### M2 (Priority: High) — `fetchProjectList` 통합

**Scope**:

1. `select` 절을 `SELECT_COLUMNS + ", clients!inner(name)"` 형태로 확장 (또는 기존 select 문자열 끝에 `, clients!inner(name)` 추가).
2. 기존 `if (query.q) { q = q.ilike("title", ...) }` 블록을 다음으로 교체:
   ```
   const search = buildSearchClause(query.q);
   if (search.hasSearch && search.searchExpr) {
     q = q.or(search.searchExpr);
   }
   ```
3. 다른 모든 필터/정렬/페이지네이션/카운트 코드는 무변경.

**Output**: 기존 동작 (q 미입력 / status / clientId / operatorId / 정렬 / 페이지네이션) 회귀 없음 + 신규 다중 컬럼 검색 동작.

**Verification**:

- M3 의 단위 테스트 통과
- 기존 E2E (Playwright `tests/e2e/projects.spec.ts`) 회귀 통과

### M3 (Priority: High) — 단위 테스트

**Scope**: `tests/lib/projects/list-queries.test.ts` 작성.

**테스트 케이스**:

1. `buildSearchClause` 단위 테스트
   - `(undefined) → { searchExpr: null, hasSearch: false }`
   - `("") → { searchExpr: null, hasSearch: false }`
   - `("   ") → { searchExpr: null, hasSearch: false }`
   - `("삼성") → searchExpr` 에 `title.ilike.%삼성%`, `notes.ilike.%삼성%`, `clients.name.ilike.%삼성%` 모두 포함
   - `("  삼성  ") → trimmed → 위와 동일`
   - `("50%할인") → searchExpr` 에 `50\%할인` 패턴 포함 (raw `%` 부재 검증)
   - `("a_b") → \_` 이스케이프 검증
   - `("c\\d") → \\\\` 이스케이프 검증 (입력 `c\d` 가 `c\\d` 로 이스케이프됨)
   - `(151자 한글) → 100자 절단` (Array.from + slice 검증, CJK 안전)

2. `fetchProjectList` 모킹 테스트 (Supabase chain mock)
   - mock 객체: `{ select, is, ilike, in, eq, gte, lte, or, order, range, then }` — 각 메서드는 `this` 반환 + 마지막 `then` 에서 `{ data: [], count: 0, error: null }` resolve
   - 빈 q → `or` 메서드 호출 0 회
   - `q="삼성"` → `or` 메서드가 정확히 한 번, 인자에 세 컬럼 모두 포함
   - `q="삼성" + status=['proposal']` → `or` 호출 + `in('status', ...)` 호출 모두 발생 (AND 결합 증명)
   - 기존 호출 (`is('deleted_at', null)`, `order(...)`, `range(...)`) 모두 호출됨 (회귀 없음 증명)

**Verification**: `pnpm test:unit` 신규 케이스 모두 PASS, 기존 케이스 회귀 없음.

### M4 (Priority: Medium) — MX 태그 + 최종 검증

**Scope**:

- `buildSearchClause` 위에 `@MX:ANCHOR` 주석 추가 (high fan_in 코드 경로: 현재 1 caller, 향후 project picker / instructor picker 에서 재사용 예정).
- LIKE 이스케이프 라인 위에 `@MX:NOTE` 주석 추가 (이스케이프 순서 근거 + 100자 캡 근거 명시).
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:e2e` 전체 그린.
- `git diff --stat` 검토 후 커밋.

**Verification**: `.moai/scripts/mx-scan.{sh,ts}` (있다면) 또는 grep 으로 `@MX:ANCHOR` `@MX:NOTE` 가 새 위치에 부착됐음을 확인.

---

## 3. 기술 접근 (Technical Approach)

### 3.1 `buildSearchClause` 의사 구현

```ts
// @MX:ANCHOR — User-supplied LIKE pattern trust boundary.
// Reused by future project/instructor pickers; do not inline.
export function buildSearchClause(q: string | null | undefined): {
  searchExpr: string | null;
  hasSearch: boolean;
} {
  if (q == null) return { searchExpr: null, hasSearch: false };
  const trimmed = q.trim();
  if (trimmed.length === 0) return { searchExpr: null, hasSearch: false };

  // CJK-safe truncation: code-point slice, not UTF-16 unit slice.
  const truncated = Array.from(trimmed).slice(0, 100).join("");

  // @MX:NOTE — LIKE escape order matters: backslash first, then % and _.
  // Reversing this order would produce double-escapes (e.g. % → \% → \\%).
  // 100-char cap bounds plan complexity and limits abuse vectors via crafted inputs.
  const escaped = truncated
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  const pattern = `%${escaped}%`;
  const expr = [
    `title.ilike.${pattern}`,
    `notes.ilike.${pattern}`,
    `clients.name.ilike.${pattern}`,
  ].join(",");

  return { searchExpr: expr, hasSearch: true };
}
```

### 3.2 `fetchProjectList` 통합 의사 구현

```ts
const SELECT_COLUMNS =
  "id, title, status, scheduled_at, ..., created_at, clients!inner(name)";
//  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//  기존 컬럼 + clients!inner(name) 추가 (PostgREST 임베디드 리소스 join)

let q = supabase
  .from("projects")
  .select(SELECT_COLUMNS, { count: "exact" })
  .is("deleted_at", null);

const search = buildSearchClause(query.q);
if (search.hasSearch && search.searchExpr) {
  q = q.or(search.searchExpr);
}
// (이후 status/operatorId/clientId/날짜/정렬/페이지네이션 — 기존 로직 무변경)
```

### 3.3 PostgREST `.or()` 임베디드 리소스 검증

`.or("title.ilike.%삼성%,clients.name.ilike.%삼성%")` 패턴이 `clients!inner(name)` join 과 함께 동작하는지는 다음 두 단계로 검증:

1. 단위 테스트의 mock 에서 `or` 메서드 호출 인자가 위 expression 과 일치하는지 assert.
2. 통합/E2E 단계에서 `pnpm db:verify` 후 실 Supabase 인스턴스에 데이터를 시딩하고 `q="삼성"` 검색 시 결과가 비어있지 않은지 확인 (E2E 신규 케이스로 추가 가능 — M3 의 단위 테스트만으로도 본 SPEC AC 충족하므로 E2E 추가는 nice-to-have).

### 3.4 폴백 전략 (Fallback)

REQ-PS-006 의 옵션 B 가 Supabase JS 의 특정 버전에서 PostgREST 에 의해 거부되면(예: `clients.name` resolve 실패 → HTTP 400), 다음 폴백을 적용:

1. `clients.name` 검색 분기를 제거하고 `title + notes` 만 OR.
2. `@MX:WARN` 주석으로 폴백 사유 + 재발 시 `SPEC-PROJECT-SEARCH-002 (PostgREST FTS migration)` 발동 조건 명시.
3. `acceptance.md` AC-4 를 "고객사명 검색은 후속 SPEC" 으로 다운그레이드. 사용자 합의 필요.

---

## 4. 리스크 및 완화 (Risks & Mitigations)

| ID | 리스크 | 영향 | 완화책 |
|----|--------|------|--------|
| R-1 | PostgREST `.or()` 가 임베디드 리소스 컬럼(`clients.name`) 을 own-table 컬럼과 한 줄에 못 묶음 | 고객사명 검색 동작 안 함 | §3.4 폴백 (`title + notes` 만), `@MX:WARN` 부착, 후속 SPEC. |
| R-2 | `clients!inner(name)` 추가로 인한 응답 페이로드 증가 | 네트워크/메모리 약간 증가 | `name` 단일 컬럼 추가는 무시 가능. P95 지연 영향 < 5ms 예상. NFR-001 모니터링. |
| R-3 | 100자 절단 시 surrogate pair 분리 → 깨진 글자 | UI 표시 깨짐 (희박) | `Array.from + slice` 로 code-point 단위 절단 — 이모지/CJK 안전. |
| R-4 | LIKE 이스케이프 순서 오류 (`%` 먼저 처리 시 `\%` 가 `\\%` 으로 더블 이스케이프됨) | 검색이 의도와 다르게 동작 | 백슬래시 우선 → `%` → `_` 순서를 단위 테스트로 강제. M3 의 `("c\\d")` 케이스가 가드. |
| R-5 | `vitest.config.ts` 가 `tests/**/*.test.ts` 를 수집하지 않음 | 테스트가 안 돌아감 | M3 단계 첫 액션이 `pnpm test:unit -- tests/lib/projects/list-queries.test.ts` 로 수집 확인. 미수집 시 `vitest.config.ts` 의 `include` 한 줄 추가. |
| R-6 | RLS 정책으로 인해 `clients.name` 이 일부 역할에서 select 되지 않음 | 검색 결과 누락 | SPEC-AUTH-001 + SPEC-DB-001 의 RLS 검토 결과, `(operator)/projects` 라우트는 `requireRole(['operator', 'admin'])` 가드 + `clients` 테이블은 operator/admin select 허용 — 영향 없음. 강사 라우트에서 본 검색을 재사용하면 별도 검증 필요 (현재 SPEC 범위 외). |

---

## 5. 검증 체크리스트 (Verification Checklist)

- [ ] `pnpm typecheck` 그린
- [ ] `pnpm lint` 그린 (특히 `@typescript-eslint/no-explicit-any` 경고 없음 — 기존 함수 시그니처 유지)
- [ ] `pnpm test:unit` 신규 + 기존 모두 그린
- [ ] `pnpm test:e2e` (Playwright) 회귀 통과 — `tests/e2e/projects.spec.ts` 의 검색 케이스가 있다면 업데이트
- [ ] `@MX:ANCHOR` `buildSearchClause` 위에 부착됨
- [ ] `@MX:NOTE` LIKE 이스케이프 라인 위에 부착됨
- [ ] `acceptance.md` AC-1 ~ AC-6 모두 PASS
- [ ] 본 plan.md 의 모든 마일스톤 (M1 ~ M4) 완료 표시

---

## 6. 후속 SPEC 후보 (Follow-up Candidates)

- **SPEC-PROJECT-SEARCH-002** — 풀텍스트 인덱스 (`tsvector` + `pg_trgm`) 도입. 데이터 50k 행 초과 또는 P95 > 150ms 시 발동.
- **SPEC-PROJECT-SEARCH-003** — 강사명/PM명 검색 확장. 강사 라우트에서 picker 가 `buildSearchClause` 를 재사용할 때 함께 정의.
- **SPEC-INSTRUCTOR-SEARCH-001** — 강사 리스트(`/instructors`) 에 동일 패턴 적용. `buildSearchClause` 재사용 가능성 검증.
- **SPEC-PROJECT-SEARCH-UI-001** — 검색 결과 하이라이트 `<mark>` 렌더링.

---

Version: 0.1.0
Status: draft
Last Updated: 2026-04-28
