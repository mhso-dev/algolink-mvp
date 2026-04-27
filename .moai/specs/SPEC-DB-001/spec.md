---
id: SPEC-DB-001
version: 1.0.0
status: draft
created: 2026-04-27
updated: 2026-04-27
author: 철
priority: high
issue_number: null
---

# SPEC-DB-001: 초기 데이터베이스 스키마 (Initial Database Schema)

## HISTORY

- **2026-04-27 (v1.0.0)**: 초기 작성. Algolink AI Agentic Platform MVP 전체 도메인 (Auth, Instructor, Resume, Skill Taxonomy, Client, Project, Schedule, Settlement, Notes, Notifications, AI Artifacts, Files, Review) 커버. Drizzle Kit + Supabase migration 병행, RLS default-deny, pgcrypto 민감정보 암호화, 13단계 프로젝트 워크플로우, 2종 정산 흐름(기업/정부) 정의.

---

## 1. 개요 (Overview)

### 1.1 목적 (Goal)

Algolink AI Agentic Platform의 MVP 데이터베이스 기반을 정의한다. 본 SPEC은 강사 프로필·이력서, 고객사·프로젝트·정산, 일정·메모·알림, AI 산출물 캐시까지 단일 워크스페이스 내 전 도메인을 포괄하는 ~25-30개 테이블의 초기 스키마와 마이그레이션 전략, RLS 정책, Seed 데이터를 명세한다.

### 1.2 배경 (Background)

본 시스템은 한국 교육 컨설팅 워크플로우(F-001 ~ F-302, `.moai/project/product.md`)를 지원한다. 강사·운영자·관리자 3종 역할이 동일 워크스페이스에서 협업하며, 강사 민감정보(주민번호·계좌·원천세)와 고객사 기밀(메모·정산내역)이 혼재하므로 **테이블 단위 default-deny RLS + application-level 암호화**를 기본으로 한다.

기술 스택은 Next.js 16 + Supabase Postgres 16 + Drizzle ORM(ADR-001~005)이며, 스키마 정의는 Drizzle Kit으로, RLS·트리거·암호화 함수는 Supabase migration SQL로 분리 관리한다.

### 1.3 범위 (Scope)

**In Scope:**

- 단일 워크스페이스(테넌트 분리 없음) 전체 도메인 스키마
- Supabase Auth 통합 + 3종 역할(instructor/operator/admin) 기반 RLS
- 13단계 교육 프로젝트 워크플로우 + 2종 정산 흐름(corporate/government)
- 강사 7-sub-domain 이력서 + 3-tier 기술 분류 + N:M 난이도 매핑
- pgcrypto 기반 민감정보(주민번호·계좌·원천세율) application-level 암호화
- 일정 충돌 감지 EXCLUSION constraint
- 다형성 메모/댓글, 인앱 알림, AI 산출물 캐시
- Drizzle Kit + Supabase migration 병행 + Seed (관리자·샘플데이터·기술택소노미)

**Out of Scope (Exclusions — What NOT to Build):**

- **다중 테넌트(multi-tenancy)**: 단일 워크스페이스 가정. 테넌트 분리 컬럼/RLS 제외.
- **이메일 알림 발송 인프라**: MVP에서는 console.log 스텁. SMTP/SES 연동은 별도 SPEC.
- **결제·정산 외부 시스템 연동**: 세금계산서 자동발행, 은행 송금 API는 제외. 입금 확인일자/송금일자 수기 입력 필드만 제공.
- **벡터 임베딩 / 시맨틱 검색**: pgvector 도입은 후속 SPEC. AI 산출물은 단순 JSON 캐시.
- **감사 로그(Audit Log) 전체 테이블**: 변경 이력은 핵심 테이블(project_status_history, settlement_status_history)에만 적용. 모든 테이블의 trigger 기반 감사 로그는 제외.
- **소프트 삭제(soft delete) 일괄 적용**: `deleted_at` 컬럼은 사용자가 직접 보유한 핵심 엔티티(instructor, client, project, settlement)에만 적용. 부속 테이블(notes, comments, schedule_items)은 hard delete.
- **다국어 텍스트 컬럼**: 한국어 단일 언어. i18n 컬럼/번역 테이블 제외.
- **파일 바이너리 저장**: Storage 메타데이터만 보관. 실제 파일은 Supabase Storage 버킷.

### 1.4 성공 지표 (Success Criteria)

- ✅ `pnpm drizzle-kit push` 무오류 실행
- ✅ `supabase db reset` 시 RLS·pgcrypto·seed 모두 정상 적용
- ✅ 모든 테이블 RLS 활성화 + default-deny 정책 1건 이상 보유
- ✅ 강사 민감정보 컬럼 raw select 시 암호화된 bytea 반환 확인
- ✅ Seed 실행 후: admin 1명 + 샘플 instructor 3명 + 샘플 client 2개 + 샘플 project 2건 + 기술 택소노미 12개 대단위 + 50+ 중/소단위 존재
- ✅ 강사 이중 배정 시도 시 EXCLUSION constraint 위반으로 INSERT 거부

---

## 2. 요구사항 (Requirements - EARS Format)

### 2.1 인증 및 권한 (Authentication & Authorization)

**REQ-DB001-AUTH** *(Ubiquitous)*: 시스템은 Supabase Auth(`auth.users`)를 신원 소스로 사용하고, 프로젝트 레벨 `users` 테이블이 `auth.uid()`를 PK/FK로 참조하여 `role` enum(`instructor` | `operator` | `admin`)과 프로필을 보유한다.

**REQ-DB001-AUTH-CLAIM** *(Event-Driven)*: 사용자 가입 또는 역할 변경 이벤트가 발생할 때, 시스템은 `auth.users.raw_app_meta_data.role`에 역할을 동기화하여 JWT claim으로 RLS에서 활용 가능하도록 한다.

**REQ-DB001-RLS** *(Ubiquitous)*: 시스템의 모든 public 스키마 테이블은 `ENABLE ROW LEVEL SECURITY`가 적용되며, 명시적 정책이 없는 접근은 거부된다(default deny).

**REQ-DB001-RLS-ROLE** *(State-Driven)*: 사용자 역할이 `admin`인 경우, 시스템은 모든 테이블에 대해 SELECT/INSERT/UPDATE/DELETE를 허용한다.

**REQ-DB001-RLS-INSTRUCTOR** *(State-Driven)*: 사용자 역할이 `instructor`인 경우, 시스템은 본인 소유(`instructor.user_id = auth.uid()`) 레코드 및 본인이 배정된 프로젝트의 강사용(`audience='instructor'`) 메모/일정만 조회 가능하도록 제한한다.

**REQ-DB001-RLS-OPERATOR** *(State-Driven)*: 사용자 역할이 `operator`인 경우, 시스템은 모든 강사·고객사·프로젝트·정산 데이터에 대한 SELECT/INSERT/UPDATE는 허용하되, 강사 민감정보 raw 컬럼(주민번호·계좌)에 대한 직접 SELECT는 거부하고 복호화 함수 경유만 허용한다.

**REQ-DB001-RLS-DENY** *(Unwanted Behavior)*: 미인증 사용자(`auth.uid() IS NULL`) 또는 정의되지 않은 역할의 접근이 발생하면, 시스템은 모든 데이터 접근을 거부한다.

### 2.2 민감정보 보호 (PII Protection)

**REQ-DB001-PII** *(Ubiquitous)*: 시스템은 강사의 주민번호(`resident_number_enc`), 계좌번호(`bank_account_enc`), 사업자등록번호(`business_number_enc`), 원천세율(`withholding_tax_rate_enc`)을 `pgcrypto`의 `pgp_sym_encrypt` 기반 bytea 컬럼으로 저장한다.

**REQ-DB001-PII-KEY** *(Ubiquitous)*: 시스템은 암호화 키를 환경변수(`PGRYPTO_SYMMETRIC_KEY`)에서 로드하는 SECURITY DEFINER 함수 `app.encrypt_pii(text)` / `app.decrypt_pii(bytea)`를 통해서만 PII에 접근하도록 한다.

**REQ-DB001-PII-DECRYPT** *(State-Driven)*: 사용자 역할이 `admin` 또는 `operator`인 경우, 시스템은 `app.decrypt_pii()` 호출을 허용한다. 그 외 역할의 호출은 즉시 권한 오류를 반환한다.

**REQ-DB001-PII-LOG** *(Event-Driven)*: PII 복호화 함수가 호출될 때, 시스템은 호출자(`auth.uid()`), 대상 강사 ID, 호출 시각을 `pii_access_log` 테이블에 기록한다.

### 2.3 강사 프로필 및 이력서 (Instructor Profile & Resume)

**REQ-DB001-INSTRUCTOR** *(Ubiquitous)*: 시스템은 강사 기본정보를 `instructors` 테이블에 저장하며, 7개 sub-domain(학력 `educations`, 자격 `certifications`, 현업경력 `work_experiences`, 강의경력 `teaching_experiences`, 프로젝트 `instructor_projects`, 기타활동 `other_activities`, 저서 `publications`)을 1:N FK 관계로 분리 보관한다.

**REQ-DB001-INSTRUCTOR-PHOTO** *(Optional)*: 강사 사진이 업로드된 경우, 시스템은 Supabase Storage 경로(`photo_storage_path`)와 메타데이터(`files` 테이블 FK)를 동시 보관한다.

**REQ-DB001-INSTRUCTOR-CONTACT** *(Ubiquitous)*: 시스템은 강사의 한자명, 영문명, 생년월일, 주소, 이메일, 전화번호를 평문으로 저장한다.

### 2.4 기술 분류 택소노미 (Skill Taxonomy)

**REQ-DB001-SKILL-TAXONOMY** *(Ubiquitous)*: 시스템은 기술 분류를 3-tier 계층(`skill_categories.tier`: `large` | `medium` | `small`)으로 self-referencing FK(`parent_id`)와 함께 단일 테이블에 저장한다.

**REQ-DB001-SKILL-LARGE-12** *(Ubiquitous)*: 시스템은 대단위(`tier='large'`) 12개(프로그래밍, 운영체제, 프론트엔드, 백엔드, 모바일, 데이터분석, 인공지능, 생성형AI, 인프라, 클라우드, 자동화, 산업도메인)를 seed 시 자동 삽입한다.

**REQ-DB001-SKILL-INSTRUCTOR-MAP** *(Ubiquitous)*: 시스템은 강사-기술 N:M 관계를 `instructor_skills` 테이블로 표현하며, 각 매핑은 난이도(`proficiency` enum: `beginner` | `intermediate` | `advanced` | `expert`)를 보유한다.

**REQ-DB001-SKILL-LEAF** *(Unwanted Behavior)*: `instructor_skills.skill_id`가 leaf node가 아닌(자식이 존재하는) `skill_categories`를 참조하는 INSERT가 발생하면, 시스템은 트리거 또는 CHECK 제약으로 거부한다. (강사 기술은 항상 가장 세분화된 레벨에 매핑)

### 2.5 고객사 (Clients)

**REQ-DB001-CLIENT** *(Ubiquitous)*: 시스템은 고객사 정보(`clients`: 회사명, 주소, 사업자등록증 파일 FK, 인수인계용 메모)와 담당자(`client_contacts`: 이름, 전화, 이메일, 직책)를 1:N 관계로 분리 보관한다.

**REQ-DB001-CLIENT-MEMO** *(Optional)*: 고객사 메모가 작성된 경우, 시스템은 마크다운 본문과 작성자(`created_by` FK to `users`)를 함께 저장한다.

### 2.6 교육 프로젝트 워크플로우 (Project Workflow)

**REQ-DB001-PROJECT-WORKFLOW** *(Ubiquitous)*: 시스템은 교육 프로젝트(`projects`)의 진행상황을 13단계 enum (`project_status`: `proposal`, `contract_confirmed`, `lecture_requested`, `instructor_sourcing`, `assignment_review`, `assignment_confirmed`, `education_confirmed`, `recruiting`, `progress_confirmed`, `in_progress`, `education_done`, `settlement_in_progress`, `task_done`)으로 표현한다.

**REQ-DB001-PROJECT-TYPE** *(Ubiquitous)*: 시스템은 프로젝트 유형을 `project_type` enum(`education` | `material_development`)으로 구분하여, 교육 프로젝트와 교재개발 과업을 동일 테이블에서 표현한다.

**REQ-DB001-PROJECT-STATUS-HISTORY** *(Event-Driven)*: `projects.status` 컬럼이 변경되는 UPDATE 이벤트가 발생할 때, 시스템은 트리거를 통해 `project_status_history`에 (이전상태, 새상태, 변경자, 변경시각)을 자동 기록한다.

**REQ-DB001-PROJECT-MARGIN** *(Ubiquitous)*: 시스템은 `projects.margin_krw`를 `business_amount_krw - instructor_fee_krw`로 자동 계산되는 `GENERATED ALWAYS AS (...) STORED` 컬럼으로 정의한다.

**REQ-DB001-PROJECT-FK** *(Ubiquitous)*: 시스템은 프로젝트가 고객사(`client_id`), 알고링크 담당자(`operator_id` FK to `users`), 강사(`instructor_id`, nullable until assignment)를 외래키로 참조하도록 한다.

### 2.7 일정 및 충돌 감지 (Schedule & Conflict Detection)

**REQ-DB001-SCHEDULE** *(Ubiquitous)*: 시스템은 강사 일정을 `schedule_items` 테이블에 저장하며, `schedule_kind` enum(`system_lecture` | `personal` | `unavailable`)으로 시스템 강의(read-only) / 개인 일정 / 강의불가 차단을 구분한다.

**REQ-DB001-SCHEDULE-CONFLICT** *(Unwanted Behavior)*: 동일 강사(`instructor_id`)에 대해 시간이 겹치는 `schedule_kind IN ('system_lecture', 'unavailable')` 일정 INSERT가 발생하면, 시스템은 PostgreSQL EXCLUSION constraint(`tstzrange` + `&&`)로 거부한다.

**REQ-DB001-SCHEDULE-LECTURE-LINK** *(State-Driven)*: `schedule_items.schedule_kind = 'system_lecture'`인 경우, 시스템은 `project_id`(NOT NULL FK)를 통해 원본 프로젝트에 연결하고, 일정의 강사 변경/삭제는 프로젝트 측 변경으로만 발생하도록 한다.

### 2.8 정산 (Settlement)

**REQ-DB001-SETTLEMENT** *(Ubiquitous)*: 시스템은 정산을 `settlements` 테이블에 저장하며, `settlement_flow` enum(`corporate` | `government`)으로 흐름을 구분하고, `settlement_status` enum(`pending` | `requested` | `paid` | `held`)으로 상태를 관리한다.

**REQ-DB001-SETTLEMENT-WITHHOLDING** *(State-Driven)*: `settlement_flow = 'corporate'`인 경우, 시스템은 `withholding_tax_rate`을 0%로 강제한다. `settlement_flow = 'government'`인 경우, 시스템은 강사 유형에 따라 8.80%(사업소득) 또는 3.30%(일용직)를 적용하도록 `withholding_tax_rate` 컬럼에 `CHECK (rate IN (0, 3.30, 8.80))` 제약을 둔다.

**REQ-DB001-SETTLEMENT-AMOUNT** *(Ubiquitous)*: 시스템은 정산 항목으로 사업비(`business_amount_krw`), 강사비(`instructor_fee_krw`), 수익(`profit_krw` = GENERATED), 원천세액(`withholding_tax_amount_krw` = GENERATED)을 보유한다.

**REQ-DB001-SETTLEMENT-DATES** *(Optional)*: 입금 확인일자(`payment_received_at`) 및 송금일자(`payout_sent_at`)가 입력된 경우, 시스템은 두 날짜를 `timestamptz`로 보관하며 세금계산서 발행 여부(`tax_invoice_issued` boolean)를 함께 기록한다.

**REQ-DB001-SETTLEMENT-STATUS-HISTORY** *(Event-Driven)*: `settlements.status` 변경 시, 시스템은 `settlement_status_history`에 변경 이력을 트리거로 자동 기록한다.

### 2.9 메모 및 댓글 (Notes & Comments)

**REQ-DB001-NOTES** *(Ubiquitous)*: 시스템은 메모를 다형성 `notes` 테이블에 저장하며, `entity_type` enum(`project` | `instructor` | `client`)과 `entity_id` UUID 조합으로 부착 대상을 식별하고, `audience` enum(`instructor` | `internal`)으로 노출 범위를 구분한다.

**REQ-DB001-NOTES-MARKDOWN** *(Ubiquitous)*: 시스템은 `notes.body_markdown`을 `text` 컬럼으로 저장하며, 첨부파일은 `notes_attachments`(notes_id FK + file_id FK) 매핑 테이블로 관리한다.

**REQ-DB001-COMMENTS** *(Ubiquitous)*: 시스템은 댓글을 `comments` 테이블에 저장하며, `note_id` FK 또는 다형성 `entity_type`/`entity_id` 조합으로 부착되고, `created_by` FK로 작성자를 추적한다.

**REQ-DB001-NOTES-RLS-INSTRUCTOR** *(State-Driven)*: 메모를 조회하는 사용자가 `instructor` 역할인 경우, 시스템은 `audience='instructor'` 메모만 조회 가능하도록 RLS로 제한한다.

### 2.10 알림 (Notifications)

**REQ-DB001-NOTIFICATIONS** *(Ubiquitous)*: 시스템은 인앱 알림을 `notifications` 테이블(recipient_id FK, type enum, title, body, link_url, read_at nullable)에 저장한다.

**REQ-DB001-NOTIFICATIONS-TYPE** *(Ubiquitous)*: 시스템은 알림 유형 enum(`notification_type`)으로 다음을 정의한다: `assignment_overdue`(강사 배정 지연), `schedule_conflict`(일정 충돌), `low_satisfaction_assignment`(만족도 낮은 강사 배정 시도), `dday_unprocessed`(미처리 D-Day), `settlement_requested`(정산 요청).

**REQ-DB001-NOTIFICATIONS-EMAIL-STUB** *(Optional)*: MVP 단계에서는 시스템이 이메일 발송 대신 `console.log` 스텁만 호출하며, 실제 발송 인프라는 제외한다(SCOPE 제외).

### 2.11 AI 산출물 캐시 (AI Artifacts)

**REQ-DB001-AI-CACHE** *(Ubiquitous)*: 시스템은 AI 산출물을 도메인별 테이블에 캐시한다: 이력서 파싱 결과(`ai_resume_parses`: input_file_hash, parsed_json, model, tokens_used), 만족도 요약(`ai_satisfaction_summaries`: instructor_id, summary_text, model, generated_at), 강사 추천 로그(`ai_instructor_recommendations`: project_id, top3_jsonb, adopted_instructor_id nullable).

**REQ-DB001-AI-DEDUPE** *(Event-Driven)*: 동일한 input_file_hash로 이력서 파싱 요청이 재차 발생할 때, 시스템은 신규 Claude API 호출 없이 캐시된 `parsed_json`을 반환한다.

**REQ-DB001-AI-KPI** *(Ubiquitous)*: 시스템은 `ai_instructor_recommendations.adopted_instructor_id`를 통해 추천 채택률(KPI)을 SQL 집계로 측정 가능하도록 한다.

### 2.12 첨부파일 메타 (Files)

**REQ-DB001-FILES** *(Ubiquitous)*: 시스템은 Supabase Storage 객체 메타데이터를 `files` 테이블(storage_path, mime_type, size_bytes, owner_id FK, uploaded_at)에 보관한다.

**REQ-DB001-FILES-RLS** *(State-Driven)*: `files.owner_id`가 `auth.uid()`와 일치하거나, 사용자 역할이 `admin` 또는 `operator`인 경우, 시스템은 SELECT를 허용한다. 그 외에는 거부한다.

### 2.13 만족도 리뷰 (Satisfaction Reviews)

**REQ-DB001-REVIEW** *(Ubiquitous)*: 시스템은 교육 종료 후 담당자가 입력하는 만족도를 `satisfaction_reviews` 테이블(instructor_id, project_id, score `smallint CHECK (score BETWEEN 1 AND 5)`, comment, created_by, created_at)에 저장한다.

**REQ-DB001-REVIEW-UNIQUE** *(Unwanted Behavior)*: 동일 (instructor_id, project_id) 조합에 대한 중복 리뷰 INSERT가 발생하면, 시스템은 UNIQUE 제약으로 거부한다.

### 2.14 마이그레이션 및 Seed (Migration & Seed)

**REQ-DB001-MIGRATION** *(Ubiquitous)*: 시스템은 스키마 변경을 두 가지 도구로 분리 관리한다: (1) Drizzle Kit이 테이블·컬럼·인덱스·FK·CHECK 제약을 `supabase/migrations/{timestamp}_initial_schema.sql`로 생성하고, (2) 수동 SQL이 RLS 정책·pgcrypto 함수·트리거·EXCLUSION constraint를 별도 timestamp 파일로 작성한다.

**REQ-DB001-MIGRATION-ORDER** *(Ubiquitous)*: 시스템은 마이그레이션을 다음 순서로 적용한다: ① pgcrypto 확장 + 함수 → ② initial_schema (Drizzle 생성) → ③ rls_policies → ④ triggers (status_history, EXCLUSION) → ⑤ seed.

**REQ-DB001-SEED** *(Ubiquitous)*: 시스템은 Seed 실행 시 다음을 삽입한다: 관리자 1명, 샘플 고객사 2개, 샘플 강사 3명, 샘플 프로젝트 2건(corporate 1 + government 1), 기술 택소노미 대단위 12개 + 중단위·소단위 50개 이상.

**REQ-DB001-SEED-IDEMPOTENT** *(Unwanted Behavior)*: Seed 스크립트가 중복 실행될 때, 시스템은 `ON CONFLICT DO NOTHING` 또는 `INSERT ... WHERE NOT EXISTS`로 중복 행 생성을 거부한다.

---

## 3. 비기능 요구사항 (Non-Functional Requirements)

### 3.1 성능 (Performance)

- 강사 목록 조회 (1000명 기준) `< 200ms` (P95)
- 프로젝트 목록 + 상태/강사/고객사 join 조회 `< 300ms` (P95)
- 일정 충돌 감지 EXCLUSION 검증 `< 50ms` per INSERT
- 모든 외래키 컬럼에 인덱스 생성 의무

### 3.2 보안 (Security)

- 모든 public 테이블 RLS 활성화 (default deny)
- 민감정보 4종(주민번호·계좌·사업자번호·원천세율) pgcrypto 암호화
- PII 복호화 함수 호출 시 `pii_access_log` 자동 기록
- 마이그레이션 SQL에 평문 시크릿/키 포함 금지 (`PGRYPTO_SYMMETRIC_KEY`는 환경변수)

### 3.3 데이터 무결성 (Data Integrity)

- 모든 PK는 `uuid DEFAULT gen_random_uuid()`
- 모든 timestamp 컬럼은 `timestamptz` (Asia/Seoul 표시는 애플리케이션 레이어)
- 금액 컬럼은 `bigint` (KRW 원 단위) 또는 `numeric(15,2)` 둘 중 하나로 일관 적용 (plan.md에서 결정)
- enum 타입은 PostgreSQL native enum으로 정의하여 type safety 보장
- ON DELETE 정책: 강사·고객사 삭제 시 종속 데이터는 `RESTRICT` (soft delete 권장)

### 3.4 추적성 (Trackability)

- 모든 핵심 테이블(`instructors`, `projects`, `settlements`, `clients`)에 `created_at`, `updated_at`, `created_by` 컬럼 의무
- `updated_at`은 `BEFORE UPDATE` 트리거로 자동 갱신
- 상태 변경(`projects.status`, `settlements.status`)은 별도 history 테이블에 자동 기록

---

## 4. 의존성 (Dependencies)

### 4.1 사전 의존성 (Prerequisites)

- Supabase 프로젝트 생성 완료 (Postgres 16, pgcrypto 확장 가능)
- `.env.local` 환경변수: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PGRYPTO_SYMMETRIC_KEY`
- pnpm 설치 + Drizzle Kit, drizzle-orm, postgres, @supabase/supabase-js 패키지 설치

### 4.2 후속 SPEC (Downstream Dependencies)

- **SPEC-AUTH-001**: Supabase Auth UI + 역할 기반 라우팅 (본 SPEC의 `users` 테이블 활용)
- **SPEC-INSTRUCTOR-001**: 강사 CRUD UI + 이력서 등록 워크플로우
- **SPEC-PROJECT-001**: 프로젝트 워크플로우 13단계 UI + 상태 전환
- **SPEC-AI-RESUME-001**: Claude Sonnet 4.6 이력서 파싱 (`ai_resume_parses` 캐시 활용)

---

## 5. 수용 기준 요약 (Acceptance Criteria Summary)

상세 Given-When-Then 시나리오는 [`acceptance.md`](./acceptance.md) 참조. 주요 게이트:

- ✅ `pnpm drizzle-kit generate && pnpm drizzle-kit push` 무오류
- ✅ `supabase db reset` 후 모든 마이그레이션 + seed 적용 성공
- ✅ 미인증 사용자의 모든 SELECT 거부 (RLS default deny 검증)
- ✅ instructor 역할로 타 강사 데이터 SELECT 시 0 rows
- ✅ operator 역할로 강사 `resident_number_enc` raw SELECT 시 bytea 반환 (텍스트 아님)
- ✅ 동일 강사에 시간 겹치는 `system_lecture` 2건 INSERT 시 EXCLUSION 위반
- ✅ `settlement_flow='corporate'` + `withholding_tax_rate=8.80` INSERT 시 CHECK 위반
- ✅ Seed 후 `SELECT count(*) FROM skill_categories WHERE tier='large'` = 12

---

## 6. 위험 및 완화 (Risks & Mitigations)

| 위험 | 영향 | 완화책 |
|------|------|--------|
| pgcrypto 키 유출 | 민감정보 전수 노출 | Supabase Vault 또는 환경변수 분리, key rotation 절차 별도 SPEC |
| Drizzle Kit이 EXCLUSION constraint 미지원 | 충돌 감지 누락 | EXCLUSION은 수동 SQL 마이그레이션에 분리 작성 |
| 13단계 enum 추가 시 마이그레이션 부담 | 운영 중단 | `ALTER TYPE ADD VALUE`로 무중단 추가, 단 ordering은 미보장 → status_order 컬럼 보조 |
| Seed 중복 실행으로 데이터 오염 | QA 환경 오염 | `ON CONFLICT DO NOTHING` + 명시적 UUID 사용 |
| RLS 정책 누락 시 default deny가 read 차단 | 운영 장애 | 각 테이블별 SELECT 정책 1개 이상 보유 강제, 테스트 케이스 작성 |

---

## 7. 참고 자료 (References)

- `.moai/project/product.md`: MVP 기능 범위 F-001 ~ F-302
- `.moai/project/tech.md`: ADR-001(Next.js 16) ~ ADR-005(Supabase Storage)
- `.moai/project/db/schema.md`: (현재 _TBD_, 본 SPEC으로 채움)
- 도메인 원본: `/Users/mhso/Downloads/LMS 시스템 개발_으뜸/` HTML 7종
- [`plan.md`](./plan.md): 구현 계획 + Drizzle 스키마 분할 + 마이그레이션 순서
- [`acceptance.md`](./acceptance.md): Given-When-Then 시나리오 + 엣지 케이스
- [`research.md`](./research.md): 설계 근거 + 대안 분석
