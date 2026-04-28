---
id: SPEC-CLIENT-001
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
author: 철
priority: high
issue_number: null
---

# SPEC-CLIENT-001 — 구현 계획 (Implementation Plan)

본 문서는 `spec.md`의 EARS 요구사항을 충족하기 위한 구현 단계, 의존성, 위험을 정의한다. 시간 추정 대신 **우선순위(High/Medium/Low) + 의존 순서**로 표현한다. 본 SPEC은 `quality.development_mode: tdd`에 따라 manager-tdd 에이전트가 RED-GREEN-REFACTOR 사이클로 진행하되, 도메인 함수(`src/lib/clients/`)에 우선 집중한다.

---

## 1. 의존성 / 선행 조건

### 1.1 외부 선행 조건 (이미 충족)

- ✅ SPEC-DB-001 완료 — `clients` / `client_contacts` / `files` 테이블 + `idx_clients_company` / `idx_clients_deleted` / `idx_client_contacts_client` 인덱스 적용됨
- ✅ SPEC-AUTH-001 완료 — `(operator)/layout.tsx`에서 `requireRole(['operator', 'admin'])` 가드 동작
- ✅ SPEC-LAYOUT-001 완료 — `<AppShell userRole>` 컴포넌트, 운영자 사이드바 "Clients" 메뉴
- ✅ Supabase Storage bucket — `business-licenses` bucket 존재 여부 확인 필요. 누락 시 M1에서 생성 마이그레이션 추가
- ✅ Drizzle ORM + Supabase Client 부트스트랩

### 1.2 본 SPEC 내 선행 조건 (Internal Sequencing)

- M1 (RLS 검증 + Storage bucket 확인 + Drizzle 타입) → 모든 후속 마일스톤의 선행
- M2 (도메인 순수 함수: validation + list-query) → M3·M4의 선행
- M3 (DB 쿼리 레이어 + 트랜잭션) → M4·M5의 선행
- M4 (파일 업로드 어댑터) → M5 (Server Actions)·M6 (UI)의 선행
- M5 (Server Actions) → M6 (UI 컴포넌트)·M7 (페이지 와이어링)의 선행
- M6 (UI 컴포넌트) → M7 (페이지)의 선행
- M7 (페이지 와이어링) → M8 (통합 검증)의 선행

### 1.3 후속 SPEC을 위한 산출물 약속

- `listClients(q, page)`는 SPEC-PROJECT-001 등록 폼의 고객사 선택 콤보박스가 재사용
- `uploadBusinessLicense` 패턴은 후속 파일 업로드 SPEC(강사 프로필 사진, 정산 증빙)의 베이스라인
- `client_contacts.sort_order` 텍스트 정렬 규칙(`'0'`, `'1'`, ...)은 후속 lexorank 도입 시 마이그레이션 필요

---

## 2. 마일스톤 분해 (Milestones)

### M1 — 사전 점검 + Storage bucket + Drizzle 타입 [Priority: High]

**산출물:**

- 검증: `clients` / `client_contacts` / `files` 테이블의 기존 RLS 정책 점검 (`psql` 또는 Supabase Studio)
  - 누락 시 신규 마이그레이션 `supabase/migrations/20260428100000_clients_rls.sql` 추가
  - 작성 후 `npx supabase db reset --local` + `pnpm db:verify`로 회귀 확인
- 검증: Supabase Storage `business-licenses` bucket 존재 + private bucket 설정
  - 누락 시 마이그레이션에 `INSERT INTO storage.buckets ...` 추가
- Drizzle schema export 확인 (`src/db/schema.ts`):
  - `clients`, `clientContacts`, `files` 테이블 정의 export
  - 누락 시 추가
- TypeScript 타입 정의 (`src/lib/clients/types.ts`):
  ```ts
  export type Client = InferSelectModel<typeof clients>;
  export type ClientContact = InferSelectModel<typeof clientContacts>;
  export type FileMeta = InferSelectModel<typeof files>;

  export type ContactInput = {
    name: string;
    position?: string;
    email?: string;
    phone?: string;
  };

  export type CreateClientInput = {
    companyName: string;
    address?: string;
    handoverMemo?: string;
    contacts: ContactInput[];
    businessLicenseFileId?: string;
  };

  export type UpdateClientInput = Partial<CreateClientInput> & {
    contactsToAdd?: ContactInput[];
    contactIdsToRemove?: string[];
    contactsReorder?: { id: string; sortOrder: string }[];
  };
  ```

**완료 조건:**
- RLS 정책 검증 또는 신규 마이그레이션 적용
- `business-licenses` Storage bucket 활성
- Drizzle 타입 컴파일 성공 (`pnpm typecheck`)

---

### M2 — Validation + 한국어 에러 [Priority: High]

**산출물:**

- `src/lib/clients/validation.ts`:
  - `contactSchema` (`name` 필수, `email` 선택 + email 검증, `phone` 선택)
  - `createClientSchema` (`companyName` 필수, `contacts.min(1)`, `businessLicenseFile` 선택)
  - `updateClientSchema`
  - `fileMimeWhitelist` 상수 (`['application/pdf', 'image/png', 'image/jpeg']`)
  - `fileMaxSizeBytes` 상수 (`5 * 1024 * 1024`)
- `src/lib/clients/errors.ts`:
  - `clientErrorMessages` 한국어 매핑 (`COMPANY_NAME_REQUIRED`, `CONTACTS_MIN_ONE`, `FILE_TOO_LARGE`, `FILE_MIME_INVALID`, ...)
- 단위 테스트 `src/lib/clients/__tests__/validation.test.ts`:
  - 회사명 비어있을 때 에러
  - 담당자 0명일 때 에러
  - 6MB 파일 거부
  - mime `text/csv` 거부
  - 정상 입력 통과

**완료 조건:**
- `pnpm test src/lib/clients/__tests__/validation.test.ts` 모두 통과
- TRUST 5: Tested ✓ Readable ✓

---

### M3 — DB 쿼리 + 트랜잭션 [Priority: High]

**산출물:**

- `src/lib/clients/queries.ts`:
  - `listClients(params)` — `q` ILIKE + `deleted_at IS NULL` + offset/limit + `count(*) over()`
  - `getClient(id)` — clients + contacts(sort_order asc) + files JOIN
  - `createClient(input)` — Drizzle `db.transaction` 내 INSERT clients + INSERT contacts BULK
  - `updateClient(id, input)` — 조건부 UPDATE clients + contacts diff 적용
  - `softDeleteClient(id)` — `UPDATE clients SET deleted_at = now()`
- `src/lib/clients/list-query.ts`:
  - `parseListParams(searchParams)` — URL params → `{ q, page, pageSize }` 안전 변환
  - `buildPageMeta(total, page, pageSize)` — `{ total, page, totalPages, range: [from, to] }`
- `src/lib/clients/contacts.ts`:
  - `diffContacts(existing, incoming)` — 추가/삭제/재정렬 분류 (순수 함수)
- 단위 테스트:
  - `__tests__/list-query.test.ts` — `parseListParams` (q decode, page 음수 → 1), `buildPageMeta` (47건 → "1-20 / 47")
  - `__tests__/contacts.test.ts` — `diffContacts` (3 → 4명, 정렬 변경, 1명 삭제)

**완료 조건:**
- `pnpm test src/lib/clients/__tests__/` 모두 통과
- 통합 시나리오 1건: `createClient` → `getClient` → contacts 1명 (수동 또는 supabase 로컬 DB 대상 통합 테스트)

---

### M4 — 파일 업로드 어댑터 [Priority: High]

**산출물:**

- `src/lib/clients/file-upload.ts`:
  - `uploadBusinessLicense(file, clientId?)` — Supabase Storage `business-licenses/{clientIdOrTmp}/{uuid}.{ext}` 업로드 후 `files` INSERT
  - `getBusinessLicenseSignedUrl(fileId, expiresIn = 60)` — 다운로드용 signed URL 생성
  - `deleteOrphanFile(fileId)` — 트랜잭션 롤백 시 보상 트랜잭션 (best-effort, 실패해도 throw 없음)
- 단위 테스트 `__tests__/file-upload.test.ts`:
  - mime/size 검증 (Storage 호출 전 차단)
  - 정상 파일 → `storage_path` 정상 생성
  - Storage upload 실패 시 `files` row 미생성
- mock: Supabase Storage client는 `vi.mock` 또는 의존성 주입 패턴

**완료 조건:**
- `pnpm test src/lib/clients/__tests__/file-upload.test.ts` 모두 통과
- 로컬 Supabase에서 실제 PDF 1건 업로드 → `files` row + Storage 객체 확인

---

### M5 — Server Actions [Priority: High]

**산출물:**

- `src/app/(app)/(operator)/clients/new/actions.ts`:
  - `createClientAction(formData: FormData)`:
    1. `requireRole(['operator', 'admin'])`
    2. FormData → object → `createClientSchema.parse`
    3. (선택) `uploadBusinessLicense` → `fileId`
    4. `createClient({ ..., businessLicenseFileId: fileId })`
    5. `revalidatePath('/clients')` + `redirect(\`/clients/${id}\`)`
    6. 실패 시 한국어 에러 + 업로드된 파일 보상 삭제
- `src/app/(app)/(operator)/clients/[id]/edit/actions.ts`:
  - `updateClientAction(id, formData)` — 동일 패턴 + contacts diff
  - `deleteClientAction(id)` — confirm token 검증 → `softDeleteClient` → redirect

**완료 조건:**
- 정상 시나리오 등록 → 상세 페이지 이동 확인
- 검증 실패 시 폼 에러 표시 확인
- TRUST 5: Secured ✓ (auth guard + zod 검증 + RLS 의존)

---

### M6 — UI 컴포넌트 [Priority: Medium]

**산출물:**

- `src/components/clients/ClientFiltersBar.tsx` — 검색창 (debounce 300ms) + URL push
- `src/components/clients/ClientListTable.tsx` — `<table>` 시맨틱, `aria-sort`, 컬럼: 회사명/담당자수/등록일/액션
- `src/components/clients/ClientForm.tsx`:
  - props: `mode: 'create' | 'edit'`, `defaultValues?`
  - react-hook-form + `zodResolver(createClientSchema)`
  - 섹션: 회사 정보 + `<BusinessLicenseUploader />` + `<ContactsEditor />`
- `src/components/clients/ContactsEditor.tsx`:
  - 담당자 row 추가/삭제, 드래그 핸들 또는 `↑↓` 버튼으로 재정렬
  - `useFieldArray` 활용
- `src/components/clients/BusinessLicenseUploader.tsx`:
  - 드롭존 + 파일 선택 + 미리보기 (PDF는 파일명, 이미지는 thumbnail)
  - mime/size 클라이언트 사전 검증 + 에러 표시
- 디자인 시스템: SPEC-LAYOUT-001의 UI 프리미티브(`Button`, `Input`, `Label`, `Card`) 재사용

**완료 조건:**
- 컴포넌트 단위 렌더링 가능 (Storybook 또는 페이지 직접 호출)
- 키보드 내비게이션: Tab 순서 자연스러움
- a11y axe 검사 0 violations

---

### M7 — 페이지 와이어링 [Priority: High]

**산출물:**

- `src/app/(app)/(operator)/clients/page.tsx` — Server Component, `parseListParams(searchParams)` → `listClients` → `<ClientFiltersBar />` + `<ClientListTable />`
- `src/app/(app)/(operator)/clients/new/page.tsx` — `<ClientForm mode="create" action={createClientAction} />`
- `src/app/(app)/(operator)/clients/[id]/page.tsx`:
  - `getClient(id)` → null이면 `notFound()`
  - 카드: 회사 정보 + 사업자등록증 다운로드 (signed URL) + 담당자 목록 + 액션 (수정/삭제)
- `src/app/(app)/(operator)/clients/[id]/edit/page.tsx` — `<ClientForm mode="edit" defaultValues={...} action={updateClientAction} />`

**완료 조건:**
- 4개 페이지 모두 정상 렌더링 (운영자 계정 로그인 후)
- instructor 계정으로 `/clients` 접근 시 차단 확인
- 사이드바 "Clients" 활성 표시

---

### M8 — 통합 검증 [Priority: High]

**산출물:**

- 수동 시나리오 7종 (`acceptance.md` 참조) 전체 통과
- TRUST 5 점검:
  - Tested: 도메인 단위 테스트 통과
  - Readable: lint/format 통과
  - Unified: 디자인 토큰/컴포넌트 일관성
  - Secured: auth 가드 + zod + RLS
  - Trackable: 커밋 메시지에 `SPEC-CLIENT-001` 참조
- (선택) Playwright E2E 시나리오 1건 추가 (SPEC-E2E-001 골든패스에 합류 검토)

**완료 조건:**
- `acceptance.md` 모든 인수 기준 통과
- `status: completed`로 갱신, HISTORY 업데이트

---

## 3. 위험 (Risks) 및 완화

| ID | 위험 | 완화 |
|----|------|------|
| R1 | `business-licenses` Storage bucket 미존재 | M1에서 마이그레이션으로 자동 생성, private 설정 강제 |
| R2 | RLS 정책 누락으로 instructor가 SELECT 가능 | M1 검증 단계에서 정책 매트릭스 확인, 누락 시 `20260428100000_clients_rls.sql` 추가 |
| R3 | 트랜잭션 도중 Storage 업로드 실패 → 고아 파일 | `deleteOrphanFile` 보상 트랜잭션, 추가로 야간 GC 잡은 후속 SPEC으로 위임 |
| R4 | `client_contacts.sort_order`가 텍스트라 lexorank 미적용 → 재정렬 시 모든 row UPDATE 필요 | MVP에서는 단순 0,1,2,... 재할당 (담당자 수가 작음). 후속 SPEC에서 lexorank 도입 검토 |
| R5 | 한국어 회사명 ILIKE 검색이 인덱스 미사용 (`%알고%`) | 1000건 규모는 seq scan 허용. 데이터셋 확장 시 trigram 인덱스 도입 (후속 SPEC) |
| R6 | 파일 업로드 5MB 제한이 사업자등록증 스캔 PDF에 부족 | MVP는 5MB. 부족 시 10MB로 상향 + 압축 가이드 (후속) |
| R7 | soft-delete된 고객사를 참조하는 projects의 회사명 표시 깨짐 | projects 측에서 `company_name` JOIN 시 deleted 표식 + tooltip 추가 (SPEC-PROJECT-001 후속) |

---

## 4. 파일 매니페스트 (File Manifest)

### 4.1 신규 생성

```
.moai/specs/SPEC-CLIENT-001/
  spec.md
  plan.md
  acceptance.md

src/app/(app)/(operator)/clients/
  page.tsx
  new/page.tsx
  new/actions.ts
  [id]/page.tsx
  [id]/edit/page.tsx
  [id]/edit/actions.ts

src/lib/clients/
  list-query.ts
  queries.ts
  contacts.ts
  file-upload.ts
  validation.ts
  errors.ts
  types.ts
  __tests__/list-query.test.ts
  __tests__/queries.test.ts
  __tests__/contacts.test.ts
  __tests__/file-upload.test.ts
  __tests__/validation.test.ts

src/components/clients/
  ClientFiltersBar.tsx
  ClientListTable.tsx
  ClientForm.tsx
  ContactsEditor.tsx
  BusinessLicenseUploader.tsx
```

### 4.2 조건부 생성 (검증 결과에 따라)

```
supabase/migrations/20260428100000_clients_rls.sql   # RLS 누락 시
supabase/migrations/20260428100001_business_licenses_bucket.sql  # bucket 누락 시
```

### 4.3 수정

```
src/db/schema.ts                       # 누락된 export 보강 (필요 시)
src/components/layout/Sidebar.tsx      # "Clients" 메뉴 active 라우트 매칭 (필요 시)
```

---

## 5. 테스트 전략

### 5.1 단위 테스트 (`node:test` + `tsx --test`)

- `validation.test.ts` — Zod schema (정상/에러 케이스 각 5건+)
- `list-query.test.ts` — `parseListParams` / `buildPageMeta` (10건+)
- `contacts.test.ts` — `diffContacts` 순수 함수 (8건+)
- `file-upload.test.ts` — mime/size 검증 + Storage mock (6건+)

### 5.2 통합 테스트 (로컬 Supabase)

- `createClient` → `getClient` 라운드트립 1건
- `updateClient`로 contacts 추가/삭제/재정렬 1건
- `softDeleteClient` 후 `listClients` 결과에서 제외 확인 1건

### 5.3 수동 시나리오

- `acceptance.md` 7종 시나리오를 운영자 계정으로 직접 수행
- instructor 계정으로 `/clients` 접근 차단 확인

### 5.4 (선택) E2E

- Playwright로 등록 → 검색 → 수정 → 삭제 골든패스 1건
- SPEC-E2E-001에 신규 시나리오로 합류 검토
