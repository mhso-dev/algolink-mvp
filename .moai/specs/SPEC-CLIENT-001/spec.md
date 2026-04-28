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

# SPEC-CLIENT-001: 고객사 관리 (Client Management — F-204)

## HISTORY

- **2026-04-28 (v0.1.0)**: 초기 작성. Algolink MVP `.moai/project/product.md` §3.1 [F-204] 고객사 관리 기능. 담당자(operator/admin)가 (1) 고객사 등록(회사명/주소/사업자등록증 파일 업로드/인수인계용 메모/담당자 N명), (2) 고객사 리스트 조회(회사명 부분일치 검색 + 페이지네이션, soft-delete 제외), (3) 고객사 상세 조회(회사 정보 + 담당자 목록 + 사업자등록증 다운로드), (4) 고객사 정보 수정, (5) 고객사 soft-delete (연관 projects는 유지)를 수행할 수 있어야 한다. 본 SPEC은 SPEC-DB-001(완료)에 이미 정의된 `clients`(`company_name`, `address`, `business_license_file_id`, `handover_memo`, `deleted_at`), `client_contacts`(N명, sort_order), `files` 테이블 및 인덱스(`idx_clients_company`, `idx_clients_deleted`, `idx_client_contacts_client`)를 그대로 사용하며 신규 마이그레이션은 발생하지 않는다(필요 시 RLS 정책 검증/보강만 수행). SPEC-AUTH-001(완료) `requireRole(['operator', 'admin'])` 가드와 SPEC-LAYOUT-001(완료) `<AppShell userRole>` 운영자 사이드바 "Clients" 메뉴를 활용한다. 고객사별 프로젝트 이력 통계(SPEC-PROJECT-001), 사업자등록증 OCR/AI 파싱, 이메일 연동 자동 등록은 명시적 제외.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform MVP의 **담당자(operator) 영역 [F-204] 고객사 관리**를 구축한다. 본 SPEC의 산출물은 (a) `(operator)/clients` 라우트 그룹의 리스트/신규/상세/수정 4개 페이지, (b) Supabase Storage에 사업자등록증 파일(PDF·PNG·JPG, 5MB 이하)을 업로드하고 `files` 테이블에 메타데이터를 기록하는 파일 업로드 어댑터, (c) `clients` row + `client_contacts` rows + `files` row를 단일 트랜잭션으로 생성하는 등록 흐름, (d) 회사명 ILIKE 부분일치 검색 + soft-delete 제외 + cursor 또는 offset 기반 페이지네이션(20건/페이지)을 제공하는 리스트 쿼리, (e) 담당자 정보(이름/직책/이메일/전화) N명을 sort_order 순으로 정렬·표시·편집·재정렬하는 도메인 로직, (f) operator/admin 외 역할 차단 + 본인 회사 row만 조회 가능하도록 SPEC-AUTH-001 가드를 재사용하는 RLS 정합성, (g) Zod 기반 입력 검증 + 한국어 에러 UX, (h) WCAG 2.1 AA 접근성, (i) `node:test` + `tsx --test` 기반 단위 테스트이다.

본 SPEC은 고객사별 프로젝트 매출 통계 화면, 사업자등록증 OCR 파싱, 외부 이메일 연동 자동 등록 흐름, 사업자등록증 만료일 알림은 빌드하지 않는다.

### 1.2 배경 (Background)

`.moai/project/product.md` §3.1 [F-204]는 담당자가 고객사를 등록할 때 (1) 회사명·주소·사업자등록증 파일 업로드·메모·담당자 정보(이름/전화/이메일)를 입력할 수 있어야 하고, (2) 인수인계용 메모를 남겨 후임자가 즉시 컨텍스트를 파악할 수 있어야 한다고 명시한다. 또한 고객사 리스트에서 회사명으로 빠르게 검색·조회 가능해야 한다.

기술 기반은 모두 SPEC-DB-001에서 마련되었다. `supabase/migrations/20260427000030_initial_schema.sql` 기준 실제 컬럼:

- `clients` 테이블:
  - `id uuid PRIMARY KEY`
  - **`company_name text NOT NULL`** — 회사명 (NOT `name`)
  - `address text` — 주소
  - `business_license_file_id uuid REFERENCES files(id)` — 사업자등록증 파일 FK (nullable)
  - **`handover_memo text`** — 인수인계 메모 (NOT `notes`)
  - `deleted_at timestamptz` — soft-delete 마커 (NULL = 활성)
  - `created_at`, `updated_at`, `created_by`
- `client_contacts` 테이블:
  - `id uuid PRIMARY KEY`
  - `client_id uuid REFERENCES clients(id) ON DELETE CASCADE`
  - `name text NOT NULL`
  - `position text`
  - `email text`
  - `phone text`
  - `sort_order text DEFAULT '0'` — 정렬 순서
  - `created_at`
- `files` 테이블:
  - `id uuid PRIMARY KEY`
  - `storage_path text NOT NULL` — Supabase Storage path
  - `mime_type text`
  - `size_bytes bigint`
  - `owner_id uuid` — 업로더
  - `uploaded_at timestamptz`
- 인덱스: `idx_clients_company` (`company_name`), `idx_clients_deleted` (`deleted_at`), `idx_client_contacts_client` (`client_id`)

SPEC-AUTH-001은 `(operator)/layout.tsx`에 `requireRole(['operator', 'admin'])`을 강제하는 server layout 가드와 `getCurrentUser()` 헬퍼를 이미 제공하며, SPEC-LAYOUT-001은 `<AppShell userRole>` + 운영자 사이드바 5종 메뉴(Dashboard / Projects / **Clients** / Instructors / Settlements)를 제공한다. 본 SPEC은 그 중 "Clients" 메뉴의 콘텐츠를 채우는 작업이다.

### 1.3 범위 (Scope)

**In Scope:**

- 라우트 (`src/app/(app)/(operator)/clients/`):
  - `page.tsx` — 리스트 (회사명 ILIKE 검색 + 페이지네이션, soft-delete 제외)
  - `new/page.tsx` + `new/actions.ts` — 등록 폼 + Server Action (회사명/주소/사업자등록증/메모/담당자 N명)
  - `[id]/page.tsx` — 상세 (회사 정보 카드 + 담당자 목록 + 사업자등록증 다운로드 링크)
  - `[id]/edit/page.tsx` + `[id]/edit/actions.ts` — 수정 폼 (회사 정보 + 담당자 추가/삭제/재정렬 + 사업자등록증 교체)
- 도메인 로직 (`src/lib/clients/`):
  - `list-query.ts` — 리스트 쿼리 (q-param ILIKE 검색 + offset/limit 페이지네이션 + `deleted_at IS NULL` 필터)
  - `queries.ts` — CRUD: `createClient`, `updateClient`, `getClient`, `listClients`, `softDeleteClient`
  - `contacts.ts` — 담당자 N명 관리 (`addContact`, `removeContact`, `reorderContacts`)
  - `file-upload.ts` — Supabase Storage 업로드 + `files` row 생성 (`uploadBusinessLicense`)
  - `validation.ts` — Zod schema (등록·수정 폼, 파일 mime/size, 담당자 배열)
  - `errors.ts` — 한국어 에러 매핑
- UI 컴포넌트 (`src/components/clients/`):
  - `ClientFiltersBar.tsx` — 회사명 검색창 + 페이지 네비게이션
  - `ClientListTable.tsx` — 리스트 테이블 (회사명/담당자수/등록일/액션)
  - `ClientForm.tsx` — react-hook-form 기반 등록/수정 공용 폼 (모드 prop)
  - `ContactsEditor.tsx` — 담당자 N명 추가/삭제/재정렬 인라인 에디터
  - `BusinessLicenseUploader.tsx` — 드래그 앤 드롭 + 미리보기 + 5MB 검증
- 단위 테스트 (`src/lib/clients/__tests__/*.test.ts`) — `list-query` / `validation` / `contacts` / `file-upload` 4종 (`node:test` + `tsx --test`)
- (선택) 마이그레이션 — 추가 마이그레이션 없음. RLS 정책 검증 후 미흡할 경우에만 `supabase/migrations/20260428100000_clients_rls.sql` 신규 생성 (operator/admin SELECT/INSERT/UPDATE/DELETE 정책 + instructor 제외)

**Out of Scope:**

- 고객사별 프로젝트 매출/이력 통계 (SPEC-PROJECT-001 또는 후속 SPEC에서 처리)
- 사업자등록증 OCR/AI 파싱 (텍스트 추출 후속 SPEC)
- 이메일 연동 자동 등록 흐름 (SPEC-NOTIF-001 의존)
- 사업자등록증 만료일 알림
- 다국어 (한국어 단일 지원)
- 고객사 병합/분할 도구

---

## 2. 요구사항 (Requirements — EARS 형식)

### 2.1 등록 (Create)

- **REQ-CLIENT001-CREATE-FORM (Event-Driven)**: WHEN operator가 `/clients/new` 페이지에 접근, THE SYSTEM SHALL 회사명·주소·사업자등록증 업로드·인수인계 메모·담당자(이름/직책/이메일/전화) 입력 폼을 1개 이상의 담당자 row와 함께 렌더링한다.
- **REQ-CLIENT001-CREATE-SUBMIT (Event-Driven)**: WHEN operator가 회사명(필수)/담당자 1명 이상(필수)을 포함한 폼을 submit, THE SYSTEM SHALL `clients` row + `client_contacts` rows를 단일 트랜잭션으로 생성하고 상세 페이지(`/clients/[id]`)로 redirect한다.
- **REQ-CLIENT001-CREATE-FILE (Event-Driven)**: WHEN operator가 사업자등록증 파일(PDF/PNG/JPG, 5MB 이하)을 첨부하고 submit, THE SYSTEM SHALL Supabase Storage에 업로드 후 `files` 테이블에 `mime_type`/`size_bytes`/`storage_path`/`owner_id` row를 생성하고 그 `id`를 `clients.business_license_file_id`로 연결한다.
- **REQ-CLIENT001-CREATE-VALIDATION (Unwanted)**: IF 회사명이 비어있거나, 담당자가 0명이거나, 첨부 파일이 5MB를 초과하거나 허용 mime이 아니면, THE SYSTEM SHALL 한국어 에러 메시지를 표시하고 트랜잭션을 시작하지 않는다.

### 2.2 리스트 조회 (List)

- **REQ-CLIENT001-LIST-DEFAULT (Ubiquitous)**: THE SYSTEM SHALL `/clients` 리스트 페이지에서 `deleted_at IS NULL`인 고객사를 회사명 오름차순으로 페이지당 20건씩 표시한다.
- **REQ-CLIENT001-LIST-SEARCH (Event-Driven)**: WHEN operator가 검색창에 `q="알고"`와 같이 키워드를 입력하고 검색, THE SYSTEM SHALL `company_name ILIKE '%알고%' AND deleted_at IS NULL` 조건의 행만 반환한다.
- **REQ-CLIENT001-LIST-PAGINATE (State-Driven)**: WHILE 결과가 20건 초과, THE SYSTEM SHALL 이전/다음 페이지 네비게이션 컨트롤을 표시하고 URL query param(`?page=N`)으로 상태를 유지한다.
- **REQ-CLIENT001-LIST-COUNT (Ubiquitous)**: THE SYSTEM SHALL 리스트 상단에 총 결과 건수와 현재 페이지 범위(예: "1-20 / 47")를 표시한다.

### 2.3 상세 조회 (Detail)

- **REQ-CLIENT001-DETAIL-VIEW (Event-Driven)**: WHEN operator가 `/clients/[id]` 페이지에 접근, THE SYSTEM SHALL 회사명·주소·인수인계 메모·등록일을 카드로 표시하고 `client_contacts` 전체를 sort_order 순으로 목록 표시한다.
- **REQ-CLIENT001-DETAIL-FILE (Event-Driven)**: WHEN `business_license_file_id`가 NULL이 아닌 고객사 상세 페이지를 열면, THE SYSTEM SHALL 사업자등록증 파일 다운로드 링크(파일명 + 크기)를 표시하고 클릭 시 Supabase Storage signed URL을 통해 다운로드한다.
- **REQ-CLIENT001-DETAIL-NOTFOUND (Unwanted)**: IF `[id]`가 존재하지 않거나 `deleted_at IS NOT NULL`이면, THE SYSTEM SHALL Next.js 404 페이지를 반환한다.

### 2.4 수정 (Update)

- **REQ-CLIENT001-UPDATE-FORM (Event-Driven)**: WHEN operator가 `/clients/[id]/edit`에 접근, THE SYSTEM SHALL 기존 값으로 채워진 폼(회사 정보 + 담당자 N명 + 현재 사업자등록증 파일)을 렌더링한다.
- **REQ-CLIENT001-UPDATE-MEMO (Event-Driven)**: WHEN operator가 `handover_memo`를 수정하고 저장, THE SYSTEM SHALL `clients.handover_memo`를 갱신하고 `updated_at`을 자동 갱신한다.
- **REQ-CLIENT001-UPDATE-CONTACTS (Event-Driven)**: WHEN operator가 담당자를 추가/삭제/재정렬하고 저장, THE SYSTEM SHALL `client_contacts` 테이블을 단일 트랜잭션으로 동기화한다(추가는 INSERT, 삭제는 DELETE, 재정렬은 sort_order UPDATE).
- **REQ-CLIENT001-UPDATE-FILE-REPLACE (Event-Driven)**: WHEN operator가 사업자등록증을 교체, THE SYSTEM SHALL 새 파일을 Storage에 업로드하고 `files` row를 신규 생성한 뒤 `clients.business_license_file_id`를 갱신한다(기존 파일은 보존, 별도 GC는 후속 SPEC).

### 2.5 삭제 (Soft Delete)

- **REQ-CLIENT001-DELETE-SOFT (Event-Driven)**: WHEN operator가 고객사 상세 페이지에서 삭제 버튼을 클릭하고 확인 다이얼로그를 통과, THE SYSTEM SHALL `clients.deleted_at = now()`를 설정하고 리스트로 redirect한다.
- **REQ-CLIENT001-DELETE-EXCLUDED (Ubiquitous)**: THE SYSTEM SHALL `deleted_at IS NOT NULL`인 고객사를 리스트·검색·상세 어디에서도 노출하지 않는다.
- **REQ-CLIENT001-DELETE-PROJECTS-PRESERVED (Ubiquitous)**: THE SYSTEM SHALL 고객사 soft-delete 시 연관된 `projects` row를 삭제하지 않고 그대로 유지한다(외래키는 유지, projects 측에서 회사명 표시는 deleted 표식과 함께).

### 2.6 인증/권한 (Authentication & Authorization)

- **REQ-CLIENT001-AUTH-OPERATOR (Ubiquitous)**: THE SYSTEM SHALL `(app)/(operator)/clients/**` 모든 라우트에 SPEC-AUTH-001의 `requireRole(['operator', 'admin'])` 가드를 적용한다.
- **REQ-CLIENT001-AUTH-INSTRUCTOR-DENY (Unwanted)**: IF instructor 역할이 `/clients` 또는 하위 라우트에 접근, THEN THE SYSTEM SHALL 403 응답 또는 `/instructor` 영역으로 redirect한다.

### 2.7 파일 업로드 (Storage)

- **REQ-CLIENT001-FILE-MIME (Unwanted)**: IF 업로드 파일의 mime이 `application/pdf` / `image/png` / `image/jpeg`가 아니면, THEN THE SYSTEM SHALL 업로드를 거부하고 한국어 에러 메시지를 반환한다.
- **REQ-CLIENT001-FILE-SIZE (Unwanted)**: IF 업로드 파일 크기가 5MB(5 × 1024 × 1024 bytes)를 초과하면, THEN THE SYSTEM SHALL 업로드를 거부하고 한국어 에러 메시지를 반환한다.
- **REQ-CLIENT001-FILE-PATH (Ubiquitous)**: THE SYSTEM SHALL Supabase Storage path를 `business-licenses/{client_id}/{uuid}.{ext}` 패턴으로 생성하여 충돌을 방지한다.

### 2.8 비기능 (Non-Functional)

- **REQ-CLIENT001-NFR-LATENCY (Ubiquitous)**: THE SYSTEM SHALL 리스트 페이지 P95 응답시간이 500ms 이하(로컬 Supabase 기준, 1000건 데이터셋)이도록 `idx_clients_company`/`idx_clients_deleted` 인덱스를 활용한다.
- **REQ-CLIENT001-NFR-A11Y (Ubiquitous)**: THE SYSTEM SHALL 모든 폼 입력에 `<label>` 연결, 에러 메시지에 `aria-describedby`, 테이블 헤더에 `<th scope>`을 부여하여 WCAG 2.1 AA 키보드 내비게이션·스크린리더 접근성을 충족한다.
- **REQ-CLIENT001-NFR-LANG (Ubiquitous)**: THE SYSTEM SHALL 모든 사용자 가시 텍스트(라벨/에러/버튼/플레이스홀더)를 한국어로 표시한다.
- **REQ-CLIENT001-NFR-TIMEZONE (Ubiquitous)**: THE SYSTEM SHALL `created_at`/`updated_at`을 Asia/Seoul 시간대로 표시한다(`Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })`).

---

## 3. 기술 설계 (Technical Design)

### 3.1 데이터 모델 (사용 그대로)

신규 마이그레이션 없음. `supabase/migrations/20260427000030_initial_schema.sql`의 다음 스키마 그대로 사용:

```sql
-- 이미 존재 (요약)
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  address text,
  business_license_file_id uuid REFERENCES files(id),
  handover_memo text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE TABLE client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  position text,
  email text,
  phone text,
  sort_order text DEFAULT '0',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  owner_id uuid,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX idx_clients_company ON clients(company_name);
CREATE INDEX idx_clients_deleted ON clients(deleted_at);
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);
```

### 3.2 모듈 구조

```
src/app/(app)/(operator)/clients/
  page.tsx                    # 리스트
  new/
    page.tsx                  # 등록 폼
    actions.ts                # createClient Server Action
  [id]/
    page.tsx                  # 상세
    edit/
      page.tsx                # 수정 폼
      actions.ts              # updateClient Server Action

src/lib/clients/
  list-query.ts               # 검색·페이지네이션
  queries.ts                  # CRUD
  contacts.ts                 # 담당자 관리
  file-upload.ts              # Storage + files row
  validation.ts               # Zod schema
  errors.ts                   # 한국어 에러
  __tests__/
    list-query.test.ts
    validation.test.ts
    contacts.test.ts
    file-upload.test.ts

src/components/clients/
  ClientFiltersBar.tsx
  ClientListTable.tsx
  ClientForm.tsx
  ContactsEditor.tsx
  BusinessLicenseUploader.tsx
```

### 3.3 핵심 함수 시그니처

```ts
// src/lib/clients/queries.ts
export async function listClients(params: {
  q?: string;
  page?: number;
  pageSize?: number; // default 20
}): Promise<{ items: Client[]; total: number; page: number }>;

export async function getClient(id: string): Promise<{
  client: Client;
  contacts: ClientContact[];
  businessLicense: FileMeta | null;
} | null>;

export async function createClient(input: CreateClientInput): Promise<{ id: string }>;
export async function updateClient(id: string, input: UpdateClientInput): Promise<void>;
export async function softDeleteClient(id: string): Promise<void>;

// src/lib/clients/file-upload.ts
export async function uploadBusinessLicense(
  file: File,
  clientId: string,
): Promise<{ fileId: string; storagePath: string }>;

// src/lib/clients/validation.ts
export const createClientSchema = z.object({
  companyName: z.string().min(1, '회사명을 입력해주세요'),
  address: z.string().optional(),
  handoverMemo: z.string().optional(),
  contacts: z.array(contactSchema).min(1, '담당자를 1명 이상 등록해주세요'),
  businessLicenseFile: fileSchema.optional(),
});
```

### 3.4 Server Action 흐름 (등록)

1. `requireRole(['operator', 'admin'])` 가드 통과
2. FormData → Zod 검증 → 실패 시 한국어 에러 반환
3. 트랜잭션 시작:
   - (선택) `uploadBusinessLicense` → Storage 업로드 + `files` INSERT
   - `clients` INSERT (`business_license_file_id` 포함)
   - `client_contacts` BULK INSERT (sort_order는 입력 순서대로 `'0'`, `'1'`, ...)
4. 트랜잭션 commit → `revalidatePath('/clients')` → `redirect('/clients/[id]')`

### 3.5 RLS 정책

기존 정책 검증. 만약 `clients` / `client_contacts` / `files` 테이블에 operator/admin SELECT/INSERT/UPDATE/DELETE 정책이 누락되어 있으면, 다음 마이그레이션을 추가:

```sql
-- supabase/migrations/20260428100000_clients_rls.sql (조건부)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_operator_admin_all ON clients
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('operator', 'admin'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('operator', 'admin'));

-- client_contacts 동일 패턴
-- files: owner_id = auth.uid() OR role IN ('operator','admin')
```

검증 결과 이미 충분하다면 신규 마이그레이션 없음.

---

## 4. 비기능 요구사항 (Non-Functional Requirements)

| 항목 | 목표 |
|------|------|
| 리스트 P95 latency | ≤ 500ms (1000건 기준, 로컬 Supabase) |
| 파일 업로드 max size | 5MB |
| 허용 mime | application/pdf, image/png, image/jpeg |
| 페이지 사이즈 | 20건/페이지 |
| 접근성 | WCAG 2.1 AA |
| 언어 | 한국어 단일 |
| 시간대 | Asia/Seoul |
| 테스트 커버리지 | 도메인 로직(`src/lib/clients/`) ≥ 85% (`node:test` + `tsx --test`) |

---

## 5. 의존성 (Dependencies)

### 5.1 선행 SPEC

- ✅ SPEC-DB-001 (`status: completed`) — 모든 테이블/인덱스/Storage bucket 준비됨
- ✅ SPEC-AUTH-001 (`status: completed`) — `requireRole` / `getCurrentUser` 헬퍼
- ✅ SPEC-LAYOUT-001 (`status: implemented`) — `<AppShell>` + 운영자 사이드바 "Clients" 메뉴

### 5.2 후속 SPEC을 위한 산출물 약속

- `listClients(q, page)` 시그니처는 SPEC-PROJECT-001 등록 폼의 고객사 선택 콤보박스가 재사용
- `uploadBusinessLicense` 패턴은 후속 파일 업로드 SPEC(강사 프로필 사진, 정산 증빙 등)의 베이스라인
- `softDeleteClient`는 후속 archive/restore SPEC의 reverse migration 진입점

### 5.3 외부 라이브러리

신규 추가 없음. 기존 사용 라이브러리 활용:
- `drizzle-orm` (DB)
- `zod` (검증)
- `react-hook-form` + `@hookform/resolvers/zod` (폼)
- `@supabase/supabase-js` (Storage)
- `node:test` + `tsx --test` (테스트)
