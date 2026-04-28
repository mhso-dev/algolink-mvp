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

# SPEC-CLIENT-001 — 인수 기준 (Acceptance Criteria)

본 문서는 `spec.md`의 EARS 요구사항이 충족되었는지 검증하기 위한 Given-When-Then 시나리오, 단위 테스트 케이스, Definition of Done을 정의한다. 모든 시나리오는 한국어 UI에서 운영자(operator) 계정으로 수행한다(별도 명시 시 instructor 계정).

---

## 1. EARS 인수 기준 (7종)

### AC-1 (REQ-CLIENT001-CREATE-SUBMIT, CREATE-FILE)

**WHEN** operator가 회사명("알고링크 주식회사"), 주소, 인수인계 메모(50자), 사업자등록증 PDF(2MB), 담당자 1명(이름="김담당", 이메일="kim@example.com", 전화="010-1234-5678")을 입력하고 등록 버튼을 클릭

**THEN THE SYSTEM SHALL**:
1. `files` 테이블에 `mime_type='application/pdf'`, `size_bytes=2097152` row 1건 생성
2. Supabase Storage `business-licenses/{client_id}/{uuid}.pdf` 경로에 객체 업로드
3. `clients` 테이블에 `company_name='알고링크 주식회사'`, `business_license_file_id=<files.id>`, `handover_memo=<50자>`, `deleted_at IS NULL` row 1건 생성
4. `client_contacts` 테이블에 `name='김담당'`, `sort_order='0'` row 1건 생성
5. 위 3개 INSERT는 단일 트랜잭션으로 묶임 (1개라도 실패 시 모두 롤백)
6. 상세 페이지 `/clients/{id}`로 redirect

---

### AC-2 (REQ-CLIENT001-LIST-SEARCH, LIST-DEFAULT, LIST-PAGINATE, LIST-COUNT)

**GIVEN** `clients` 테이블에 47건이 존재 (회사명에 "알고"를 포함하는 row 12건, 나머지 35건은 미포함, 모두 `deleted_at IS NULL`)

**WHEN** operator가 `/clients?q=알고&page=1`로 접근

**THEN THE SYSTEM SHALL**:
1. SQL: `SELECT * FROM clients WHERE company_name ILIKE '%알고%' AND deleted_at IS NULL ORDER BY company_name LIMIT 20 OFFSET 0` 실행
2. 결과 12건 모두 표시 (페이지당 20건 한도 내)
3. 상단에 "1-12 / 12" 표시
4. 12건 ≤ 20건이므로 페이지 네비게이션 비표시

**AND WHEN** operator가 `q=`를 비우고 `/clients?page=2`로 접근

**THEN THE SYSTEM SHALL**:
1. 47건 중 21~40번째 row 표시
2. 상단에 "21-40 / 47" 표시
3. 이전 페이지(`?page=1`) + 다음 페이지(`?page=3`) 링크 활성

---

### AC-3 (REQ-CLIENT001-FILE-MIME, FILE-SIZE, CREATE-VALIDATION)

**WHEN** operator가 다음 중 하나를 시도하여 등록:
- (a) 회사명 비어있음
- (b) 담당자 0명
- (c) 6MB PDF 첨부
- (d) `text/csv` mime 첨부

**THEN THE SYSTEM SHALL**:
1. 한국어 에러 메시지 표시 (각각 "회사명을 입력해주세요" / "담당자를 1명 이상 등록해주세요" / "파일 크기는 5MB 이하여야 합니다" / "PDF, PNG, JPG 형식만 업로드 가능합니다")
2. `clients` / `client_contacts` / `files` 어느 테이블에도 INSERT 발생하지 않음
3. Supabase Storage에 업로드 시도 발생하지 않음(클라이언트 사전 검증) 또는 업로드되었더라도 `files` row 미생성 + Storage 객체 보상 삭제
4. 폼 입력값 보존 (사용자가 다시 입력하지 않음)

---

### AC-4 (REQ-CLIENT001-AUTH-INSTRUCTOR-DENY, AUTH-OPERATOR)

**GIVEN** instructor 역할 사용자가 로그인 상태

**WHEN** instructor가 다음 URL에 직접 접근:
- `/clients`
- `/clients/new`
- `/clients/{any-id}`
- `/clients/{any-id}/edit`

**THEN THE SYSTEM SHALL**:
1. SPEC-AUTH-001 `requireRole(['operator', 'admin'])` 가드가 차단
2. HTTP 403 응답 또는 instructor 영역(`/instructor`)으로 redirect
3. `clients` 테이블 SELECT 쿼리 실행되지 않음 (서버 단에서 차단)

---

### AC-5 (REQ-CLIENT001-UPDATE-MEMO, UPDATE-CONTACTS)

**GIVEN** 기존 고객사 1건 (`company_name='기존회사'`, contacts 3명: A/B/C, sort_order: '0'/'1'/'2')

**WHEN** operator가 `/clients/{id}/edit`에서 다음 변경 후 저장:
- `handover_memo`를 "신규 메모 100자"로 변경
- 담당자 D 추가
- 담당자 B 삭제
- 순서를 A → D → C로 재정렬

**THEN THE SYSTEM SHALL**:
1. `clients.handover_memo`를 "신규 메모 100자"로 UPDATE
2. `clients.updated_at`을 `now()`로 자동 갱신 (트리거 또는 명시적 SET)
3. `client_contacts` 동기화 (단일 트랜잭션):
   - B row DELETE
   - D row INSERT (`sort_order='1'`)
   - A row UPDATE (`sort_order='0'`)
   - C row UPDATE (`sort_order='2'`)
4. `getClient(id)` 호출 시 contacts가 [A, D, C] 순서로 반환

---

### AC-6 (REQ-CLIENT001-DELETE-SOFT, DELETE-EXCLUDED, DELETE-PROJECTS-PRESERVED)

**GIVEN** 고객사 1건 (id=`X`)이 존재하고, 해당 고객사에 연결된 `projects` row 3건이 존재

**WHEN** operator가 `/clients/X` 상세 페이지에서 삭제 버튼을 클릭하고 확인 다이얼로그를 통과

**THEN THE SYSTEM SHALL**:
1. `UPDATE clients SET deleted_at = now() WHERE id = 'X'` 실행
2. `DELETE FROM clients` 또는 `DELETE FROM client_contacts` 발생하지 않음
3. `projects` 테이블 어떤 row도 변경되지 않음 (3건 모두 그대로 유지)
4. `/clients`로 redirect
5. 이후 `/clients` 리스트에서 X 미노출
6. 이후 `/clients?q=<X.company_name>` 검색에서도 미노출
7. 이후 `/clients/X` 직접 접근 시 Next.js 404

---

### AC-7 (REQ-CLIENT001-DETAIL-FILE, FILE-PATH)

**GIVEN** 고객사 1건이 사업자등록증 파일(`files.id=F1`, `mime_type='application/pdf'`, `storage_path='business-licenses/{client_id}/abc-123.pdf'`)과 연결됨

**WHEN** operator가 `/clients/{id}` 상세 페이지에 접근

**THEN THE SYSTEM SHALL**:
1. "사업자등록증" 섹션에 파일명 + 크기(예: "사업자등록증.pdf · 2.0MB") 표시
2. 다운로드 버튼/링크 표시
3. 클릭 시 Supabase Storage signed URL (60초 만료) 생성하여 새 탭에서 다운로드
4. signed URL은 절대 정적 마크업으로 노출되지 않음 (클릭 시 Server Action 또는 API route를 통해 발급)

---

## 2. 단위 테스트 시나리오 (Unit Test Cases)

### 2.1 `validation.test.ts`

| 케이스 | 입력 | 예상 결과 |
|--------|------|----------|
| UT-V-1 | `companyName=""` | `ZodError`: "회사명을 입력해주세요" |
| UT-V-2 | `contacts=[]` | `ZodError`: "담당자를 1명 이상 등록해주세요" |
| UT-V-3 | `file.size=6*1024*1024` | `ZodError`: "파일 크기는 5MB 이하여야 합니다" |
| UT-V-4 | `file.type="text/csv"` | `ZodError`: "PDF, PNG, JPG 형식만 업로드 가능합니다" |
| UT-V-5 | `contacts[0].email="invalid"` | `ZodError`: 이메일 형식 오류 |
| UT-V-6 | 정상 입력 (회사명 + 담당자 1명 + PDF 2MB) | `parse()` 성공 |

### 2.2 `list-query.test.ts`

| 케이스 | 입력 | 예상 결과 |
|--------|------|----------|
| UT-L-1 | `parseListParams({ q: "알고", page: "1" })` | `{ q: "알고", page: 1, pageSize: 20 }` |
| UT-L-2 | `parseListParams({ page: "-5" })` | `page: 1` (음수 정규화) |
| UT-L-3 | `parseListParams({ page: "abc" })` | `page: 1` (NaN 정규화) |
| UT-L-4 | `parseListParams({})` | `{ q: undefined, page: 1, pageSize: 20 }` |
| UT-L-5 | `buildPageMeta(47, 1, 20)` | `{ total: 47, totalPages: 3, range: [1, 20] }` |
| UT-L-6 | `buildPageMeta(47, 3, 20)` | `{ total: 47, totalPages: 3, range: [41, 47] }` |
| UT-L-7 | `buildPageMeta(0, 1, 20)` | `{ total: 0, totalPages: 0, range: [0, 0] }` |

### 2.3 `contacts.test.ts`

| 케이스 | existing → incoming | 예상 diff |
|--------|---------------------|-----------|
| UT-C-1 | `[A,B,C]` → `[A,B,C]` (변경 없음) | `add: [], remove: [], reorder: []` |
| UT-C-2 | `[A,B,C]` → `[A,B,C,D]` (D 추가) | `add: [D]`, sort_order='3' |
| UT-C-3 | `[A,B,C]` → `[A,C]` (B 삭제) | `remove: [B.id]`, C는 sort_order='1'로 재할당 |
| UT-C-4 | `[A,B,C]` → `[C,A,B]` (재정렬) | `reorder: [{C:'0'}, {A:'1'}, {B:'2'}]` |
| UT-C-5 | `[A,B]` → `[B,C]` (A 삭제 + C 추가 + B 위치 0) | `remove: [A.id]`, `add: [C]`, `reorder: [{B:'0'}]` |

### 2.4 `file-upload.test.ts`

| 케이스 | 입력 | 예상 결과 |
|--------|------|----------|
| UT-F-1 | mime=`text/csv` | Storage 호출 없이 `Error('FILE_MIME_INVALID')` |
| UT-F-2 | size=6MB | Storage 호출 없이 `Error('FILE_TOO_LARGE')` |
| UT-F-3 | 정상 PDF 2MB | `storagePath = 'business-licenses/{cid}/<uuid>.pdf'`, `files` INSERT 1회 |
| UT-F-4 | Storage upload 실패 (mock reject) | `files` INSERT 발생하지 않음, 에러 throw |
| UT-F-5 | clientId 미지정 (등록 전) | `storagePath = 'business-licenses/_tmp/<uuid>.pdf'` (임시 경로) |

---

## 3. 통합 시나리오 (Integration Scenarios)

### IS-1 — 등록 → 조회 라운드트립

1. `createClient({ companyName: '테스트사', contacts: [{ name: '홍길동' }] })`
2. 반환된 `id`로 `getClient(id)` 호출
3. 검증: `client.company_name === '테스트사'`, `contacts.length === 1`, `contacts[0].name === '홍길동'`, `businessLicense === null`

### IS-2 — 사업자등록증 포함 등록

1. PDF 2MB 파일 생성
2. `uploadBusinessLicense(file, undefined)` → `{ fileId, storagePath }`
3. `createClient({ companyName: 'PDF사', contacts: [...], businessLicenseFileId: fileId })`
4. `getClient(id)` 검증: `businessLicense.mime_type === 'application/pdf'`, `businessLicense.size_bytes === 2097152`
5. Supabase Storage `business-licenses/_tmp/<uuid>.pdf` 객체 존재 확인

### IS-3 — 검색 + 페이지네이션

1. 회사명 "알파"로 시작하는 25건 시드
2. `listClients({ q: '알파', page: 1, pageSize: 20 })` → `items.length === 20`, `total === 25`
3. `listClients({ q: '알파', page: 2 })` → `items.length === 5`, `total === 25`

### IS-4 — Soft delete + 재조회

1. `createClient(...)` → id 획득
2. `softDeleteClient(id)`
3. `getClient(id)` → `null` (deleted 표식 필터)
4. `listClients({ q: <company_name> })` → `items.length === 0`
5. DB 직접 확인: row는 존재 + `deleted_at IS NOT NULL`

### IS-5 — instructor 권한 차단

1. instructor 계정으로 `/clients` GET 요청
2. SPEC-AUTH-001 가드가 redirect 또는 403 반환
3. `clients` 테이블에 SELECT 쿼리 발생 0건 (DB 로그 확인)

---

## 4. 비기능 검증 (Non-Functional Validation)

| 항목 | 측정 방법 | 통과 기준 |
|------|----------|----------|
| 리스트 P95 latency | 1000건 시드 후 `/clients?page=1` 50회 호출 | ≤ 500ms |
| 접근성 | axe-core 자동 검사 + 키보드 only 수동 | 0 violations + Tab 순서 자연스러움 |
| 한국어 표시 | 모든 페이지 시각 점검 | 영어 잔여 텍스트 0개 |
| 시간대 | `created_at` 표시 확인 | KST 기준 (예: "2026-04-28 14:30") |
| 테스트 커버리지 | `pnpm test --coverage src/lib/clients/` | ≥ 85% |

---

## 5. Definition of Done

본 SPEC은 다음 모든 조건이 충족될 때 `status: completed`로 전환된다:

- [ ] AC-1 ~ AC-7 모든 EARS 인수 기준 통과 (수동 또는 자동 검증)
- [ ] UT-V / UT-L / UT-C / UT-F 모든 단위 테스트 통과 (`pnpm test src/lib/clients/`)
- [ ] IS-1 ~ IS-5 모든 통합 시나리오 통과
- [ ] TRUST 5 게이트 통과:
  - [ ] **Tested**: 도메인 커버리지 ≥ 85%
  - [ ] **Readable**: ESLint/Prettier 통과, 함수명 한국어 컨텍스트 명확
  - [ ] **Unified**: SPEC-LAYOUT-001 디자인 토큰/UI 프리미티브 재사용, 코드 스타일 일관성
  - [ ] **Secured**: `requireRole` 가드 적용, Zod 검증, RLS 정책 활성, signed URL 사용
  - [ ] **Trackable**: 커밋 메시지에 `SPEC-CLIENT-001` 참조, PR description에 요구사항 매핑
- [ ] `.moai/project/structure.md` 갱신 (clients 디렉터리 추가)
- [ ] `acceptance.md`의 모든 체크박스 ✓
- [ ] HISTORY에 v1.0.0 초기 출시 entry 추가
- [ ] (선택) Playwright E2E 시나리오 1건 SPEC-E2E-001 골든패스에 합류

---

## 6. 회귀 방지 (Regression Guards)

본 SPEC의 변경이 다음 기존 동작을 깨지 않음을 확인:

- [ ] SPEC-PROJECT-001의 프로젝트 등록 시 고객사 선택 콤보박스 정상 작동 (clients 리스트 의존)
- [ ] SPEC-AUTH-001의 `requireRole` 가드가 다른 라우트에서 동일하게 작동 (regression 없음)
- [ ] SPEC-LAYOUT-001의 운영자 사이드바 5종 메뉴 모두 정상 표시
- [ ] SPEC-DB-001의 `clients` / `client_contacts` / `files` 스키마 무변경 (RLS 보강 외)
- [ ] SPEC-E2E-001 Phase 1 골든패스 시나리오 모두 GREEN 유지
