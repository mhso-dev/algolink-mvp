---
spec_id: SPEC-DB-001
version: 1.0.0
created: 2026-04-27
updated: 2026-04-27
---

# SPEC-DB-001 구현 계획 (Implementation Plan)

## 1. 개요 (Overview)

본 문서는 SPEC-DB-001(초기 데이터베이스 스키마)의 **HOW**를 정의한다. Drizzle ORM 스키마 파일 분할, Supabase 마이그레이션 순서, RLS 정책 정의, Seed 데이터 구성, 검증 절차를 포함한다.

핵심 결정:

- **스키마 분할 전략**: 도메인별 14개 파일로 분할하여 인지 부담 최소화
- **마이그레이션 듀얼 트랙**: Drizzle Kit(스키마) + Supabase migration SQL(RLS·트리거·암호화)
- **금액 타입**: `bigint` (KRW 원 단위, 소수점 없음) — `numeric(15,2)`보다 인덱스 효율 우위
- **시간 타입**: 모든 timestamp는 `timestamptz`, 표시는 애플리케이션 레이어에서 Asia/Seoul 변환

---

## 2. 디렉토리 구조 (Directory Layout)

```
src/db/
├── enums.ts                      # PostgreSQL native enum 정의 (role, project_status, settlement_flow, settlement_status, project_type, schedule_kind, audience, entity_type, notification_type, proficiency, skill_tier)
├── client.ts                     # Drizzle client + Supabase client 인스턴스
├── schema/
│   ├── index.ts                  # 모든 테이블 + relations re-export
│   ├── auth.ts                   # users (auth.users FK)
│   ├── instructor.ts             # instructors (기본 + PII bytea 컬럼)
│   ├── resume.ts                 # educations, certifications, work_experiences, teaching_experiences, instructor_projects, other_activities, publications
│   ├── skill-taxonomy.ts         # skill_categories (3-tier self-ref), instructor_skills (N:M + proficiency)
│   ├── client.ts                 # clients, client_contacts
│   ├── project.ts                # projects (13단계 status + GENERATED margin), project_status_history
│   ├── schedule.ts               # schedule_items (EXCLUSION은 raw SQL)
│   ├── settlement.ts             # settlements, settlement_status_history
│   ├── notes.ts                  # notes (다형성), notes_attachments, comments
│   ├── notifications.ts          # notifications
│   ├── ai-artifacts.ts           # ai_resume_parses, ai_satisfaction_summaries, ai_instructor_recommendations
│   ├── files.ts                  # files (Storage 메타)
│   ├── review.ts                 # satisfaction_reviews
│   └── pii-log.ts                # pii_access_log
└── relations.ts                  # Drizzle relations (cross-file)

supabase/
├── config.toml                   # Supabase 로컬 dev 설정
└── migrations/
    ├── 20260427_000010_extensions.sql        # CREATE EXTENSION pgcrypto
    ├── 20260427_000020_pgcrypto_functions.sql # app.encrypt_pii / decrypt_pii (SECURITY DEFINER)
    ├── 20260427_000030_initial_schema.sql    # ← Drizzle Kit generate 결과물 그대로 commit
    ├── 20260427_000040_exclusion_constraints.sql # schedule_items EXCLUSION USING gist
    ├── 20260427_000050_triggers.sql          # status_history triggers + updated_at trigger
    ├── 20260427_000060_rls_policies.sql      # ENABLE RLS + 역할별 정책
    └── 20260427_000070_seed.sql              # 관리자 + 샘플 + 기술 택소노미

drizzle.config.ts                 # Drizzle Kit 설정 (out: supabase/migrations 경로 매핑)
```

---

## 3. 마일스톤 (Milestones — 우선순위 기반, 시간 추정 없음)

### M1 (우선순위 High): 기반 설정 + 인증·권한

**의존성**: 없음

작업:

1. `pnpm add drizzle-orm postgres @supabase/supabase-js`
2. `pnpm add -D drizzle-kit`
3. `drizzle.config.ts` 작성 (out 경로를 `supabase/migrations/`로 매핑하지 말고, 별도 `drizzle/` 폴더 사용 후 수동 이름변경)
4. `src/db/enums.ts` — 11종 enum 정의
5. `src/db/schema/auth.ts` — `users` (id PK = auth.uid(), role, name_kr, email)
6. `src/db/client.ts` — Drizzle + Supabase client
7. `supabase/migrations/20260427_000010_extensions.sql` — pgcrypto 확장
8. `supabase/migrations/20260427_000020_pgcrypto_functions.sql` — `app.encrypt_pii` / `app.decrypt_pii` / `app.set_pii_access_logger`

검증: `supabase db reset` 후 `SELECT app.encrypt_pii('test')` 성공

### M2 (우선순위 High): 강사 도메인 + 민감정보

**의존성**: M1

작업:

1. `src/db/schema/instructor.ts` — `instructors` (사진 storage path, 평문 컬럼 + bytea 4종)
2. `src/db/schema/files.ts` — `files`
3. `src/db/schema/pii-log.ts` — `pii_access_log`
4. `src/db/schema/resume.ts` — 7개 sub-domain 테이블
5. Drizzle Kit generate → `supabase/migrations/20260427_000030_initial_schema.sql` (M2~M7 종료 시점에 일괄 생성)

검증: `instructors` INSERT 시 bytea 컬럼은 `app.encrypt_pii(?)` 호출 결과만 허용 (애플리케이션 레이어 책임)

### M3 (우선순위 High): 기술 택소노미 + 고객사

**의존성**: M2

작업:

1. `src/db/schema/skill-taxonomy.ts` — `skill_categories` (self-ref FK, tier enum) + `instructor_skills` (N:M + proficiency)
2. `src/db/schema/client.ts` — `clients`, `client_contacts`
3. CHECK 제약: `skill_categories.tier IN ('large','medium','small')`
4. 트리거 (`supabase/migrations/20260427_000050_triggers.sql`에 추가): leaf node 검증 trigger for `instructor_skills`

검증: 대단위 카테고리에 instructor_skills INSERT 시도 시 trigger error 발생

### M4 (우선순위 High): 프로젝트 워크플로우 + 일정

**의존성**: M3

작업:

1. `src/db/schema/project.ts` — `projects` (13단계 status enum, GENERATED margin_krw), `project_status_history`
2. `src/db/schema/schedule.ts` — `schedule_items` (Drizzle로는 일반 테이블만, EXCLUSION은 별도 SQL)
3. `supabase/migrations/20260427_000040_exclusion_constraints.sql`:
   ```sql
   ALTER TABLE schedule_items
     ADD CONSTRAINT schedule_items_no_overlap
     EXCLUDE USING gist (
       instructor_id WITH =,
       tstzrange(starts_at, ends_at, '[)') WITH &&
     )
     WHERE (schedule_kind IN ('system_lecture', 'unavailable'));
   ```
4. status_history 트리거 (project + settlement 공통)

검증: 동일 강사·중복 시간 INSERT 2건 시 두 번째에서 SQLSTATE 23P01 (exclusion_violation)

### M5 (우선순위 High): 정산

**의존성**: M4

작업:

1. `src/db/schema/settlement.ts` — `settlements` (settlement_flow, withholding_tax_rate CHECK, GENERATED profit_krw + withholding_tax_amount_krw), `settlement_status_history`
2. CHECK 제약:
   ```sql
   CHECK (
     (settlement_flow = 'corporate' AND withholding_tax_rate = 0)
     OR (settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))
   )
   ```
3. settlement_status 변경 트리거 등록

검증: corporate + 8.80 INSERT 거부, government + 0 INSERT 거부

### M6 (우선순위 Medium): 메모/댓글/알림/AI/리뷰

**의존성**: M5

작업:

1. `src/db/schema/notes.ts` — `notes` (entity_type+entity_id 다형성, audience), `notes_attachments`, `comments`
2. `src/db/schema/notifications.ts` — `notifications` (notification_type enum, read_at nullable)
3. `src/db/schema/ai-artifacts.ts` — 3개 테이블, `input_file_hash`에 UNIQUE 인덱스
4. `src/db/schema/review.ts` — `satisfaction_reviews` + UNIQUE(instructor_id, project_id)

검증: 동일 (instructor, project) 리뷰 2건 시 UNIQUE 위반

### M7 (우선순위 High): RLS 정책 일괄 적용

**의존성**: M6

작업:

1. `supabase/migrations/20260427_000060_rls_policies.sql`:
   - 모든 public 테이블 `ENABLE ROW LEVEL SECURITY`
   - JWT claim helper: `auth.jwt() ->> 'role'` 또는 `auth.users.raw_app_meta_data->>'role'` 활용 함수 `app.current_role()`
   - 정책 패턴 (테이블당 최소 4개 정책: SELECT/INSERT/UPDATE/DELETE):
     - admin: ALL ALLOW
     - operator: SELECT/INSERT/UPDATE ALLOW (raw PII 컬럼 제외 view 제공)
     - instructor: SELECT WHERE owner = auth.uid() OR (audience = 'instructor' AND assigned)
2. PII 컬럼 보호: `instructors_safe` view 생성 (PII 컬럼 제외)

검증: `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub": "<uuid>", "role": "instructor"}';` 후 타 강사 SELECT 시 0 rows

### M8 (우선순위 High): Seed 데이터

**의존성**: M7

작업:

1. `supabase/migrations/20260427_000070_seed.sql`:
   - 관리자 1명 (auth.users INSERT는 Supabase CLI seed 또는 별도 스크립트)
   - 기술 택소노미 대단위 12개 + 중단위 ~30개 + 소단위 ~30개
   - 샘플 고객사 2개 + 담당자 각 2명
   - 샘플 강사 3명 (PII는 `app.encrypt_pii` 호출 사용)
   - 샘플 프로젝트 2건: 1건 corporate(원천세 0%), 1건 government(원천세 8.80%)
   - 모든 INSERT는 `ON CONFLICT (id) DO NOTHING` 적용

검증: `supabase db reset` 후 행 수 검증 쿼리 실행

### M9 (우선순위 Medium): 검증 자동화

**의존성**: M8

작업:

1. `scripts/db-verify.sh` — 모든 acceptance 시나리오를 SQL로 자동 검증
2. CI에서 `supabase db reset && pnpm tsx scripts/db-verify.ts` 실행

---

## 4. 기술적 접근 (Technical Approach)

### 4.1 Drizzle Kit과 Supabase migration의 분담

| 책임 | 도구 | 근거 |
|------|------|------|
| 테이블/컬럼/인덱스/FK/CHECK | Drizzle Kit (`generate`) | TypeScript 타입 안전 + 스키마 단일 소스 |
| RLS 정책 | 수동 SQL | Drizzle Kit 미지원 (2026-04 기준) |
| EXCLUSION constraint | 수동 SQL | Drizzle Kit 미지원 |
| 트리거 + SECURITY DEFINER 함수 | 수동 SQL | Drizzle Kit 미지원 |
| pgcrypto 함수 | 수동 SQL | DB-side 함수 |
| Seed | 수동 SQL | 명시적 UUID + ON CONFLICT 제어 필요 |

**워크플로우**:

1. `src/db/schema/*.ts` 수정
2. `pnpm drizzle-kit generate --out=./drizzle/` (임시 폴더)
3. 생성된 SQL을 검토 후 `supabase/migrations/{timestamp}_initial_schema.sql`로 이름변경하여 commit
4. RLS/트리거/EXCLUSION/Seed는 별도 timestamp 파일로 수동 작성
5. `supabase db reset` 또는 `supabase migration up`으로 일괄 적용

### 4.2 PII 암호화 패턴

```sql
-- supabase/migrations/20260427_000020_pgcrypto_functions.sql
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.encrypt_pii(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF plaintext IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.decrypt_pii(ciphertext bytea, instructor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(auth.jwt() ->> 'role', '');
  IF v_role NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'permission denied for PII decryption';
  END IF;

  INSERT INTO pii_access_log (caller_id, target_instructor_id, accessed_at)
  VALUES (auth.uid(), instructor_id, now());

  RETURN pgp_sym_decrypt(
    ciphertext,
    current_setting('app.pii_encryption_key', false)
  );
END;
$$;
```

`app.pii_encryption_key`는 Supabase에서 `ALTER DATABASE ... SET app.pii_encryption_key = '...'` 또는 connection-level `SET LOCAL app.pii_encryption_key = ...` (애플리케이션 레이어가 매 connection 시작 시 설정)으로 주입.

### 4.3 13단계 워크플로우 enum

```ts
// src/db/enums.ts
export const projectStatus = pgEnum('project_status', [
  'proposal',
  'contract_confirmed',
  'lecture_requested',
  'instructor_sourcing',
  'assignment_review',
  'assignment_confirmed',
  'education_confirmed',
  'recruiting',
  'progress_confirmed',
  'in_progress',
  'education_done',
  'settlement_in_progress',
  'task_done',
]);
```

ordering 관리: `project_status_order` lookup 테이블 별도 두지 않고, 애플리케이션 enum 배열 순서를 단일 소스로 사용. 단계 추가 시 `ALTER TYPE project_status ADD VALUE ... BEFORE/AFTER ...` 사용.

### 4.4 GENERATED 컬럼 (마진/수익 자동계산)

```ts
// src/db/schema/project.ts
businessAmountKrw: bigint('business_amount_krw', { mode: 'bigint' }).notNull(),
instructorFeeKrw: bigint('instructor_fee_krw', { mode: 'bigint' }).notNull(),
marginKrw: bigint('margin_krw', { mode: 'bigint' })
  .generatedAlwaysAs(sql`business_amount_krw - instructor_fee_krw`, { mode: 'stored' }),
```

### 4.5 일정 충돌 EXCLUSION

```sql
-- supabase/migrations/20260427_000040_exclusion_constraints.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE schedule_items
  ADD CONSTRAINT schedule_items_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (schedule_kind IN ('system_lecture', 'unavailable'));
```

`btree_gist` 확장은 EXCLUSION에 uuid 동등 비교를 위해 필수.

### 4.6 RLS 정책 패턴 예시 (instructors)

```sql
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;

-- admin: ALL
CREATE POLICY instructors_admin_all ON instructors
  FOR ALL TO authenticated
  USING (app.current_role() = 'admin')
  WITH CHECK (app.current_role() = 'admin');

-- operator: SELECT/INSERT/UPDATE (DELETE 금지)
CREATE POLICY instructors_operator_rw ON instructors
  FOR SELECT TO authenticated
  USING (app.current_role() IN ('admin', 'operator'));

CREATE POLICY instructors_operator_insert ON instructors
  FOR INSERT TO authenticated
  WITH CHECK (app.current_role() IN ('admin', 'operator'));

CREATE POLICY instructors_operator_update ON instructors
  FOR UPDATE TO authenticated
  USING (app.current_role() IN ('admin', 'operator'))
  WITH CHECK (app.current_role() IN ('admin', 'operator'));

-- instructor: 본인 행만 SELECT/UPDATE
CREATE POLICY instructors_self_select ON instructors
  FOR SELECT TO authenticated
  USING (app.current_role() = 'instructor' AND user_id = auth.uid());

CREATE POLICY instructors_self_update ON instructors
  FOR UPDATE TO authenticated
  USING (app.current_role() = 'instructor' AND user_id = auth.uid())
  WITH CHECK (app.current_role() = 'instructor' AND user_id = auth.uid());
```

### 4.7 Seed 패턴 (택소노미)

```sql
-- supabase/migrations/20260427_000070_seed.sql
INSERT INTO skill_categories (id, tier, name, parent_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'large', '프로그래밍', NULL),
  ('00000000-0000-0000-0000-000000000002', 'large', '운영체제', NULL),
  ('00000000-0000-0000-0000-000000000003', 'large', '프론트엔드', NULL),
  ('00000000-0000-0000-0000-000000000004', 'large', '백엔드', NULL),
  ('00000000-0000-0000-0000-000000000005', 'large', '모바일', NULL),
  ('00000000-0000-0000-0000-000000000006', 'large', '데이터분석', NULL),
  ('00000000-0000-0000-0000-000000000007', 'large', '인공지능', NULL),
  ('00000000-0000-0000-0000-000000000008', 'large', '생성형AI', NULL),
  ('00000000-0000-0000-0000-000000000009', 'large', '인프라', NULL),
  ('00000000-0000-0000-0000-00000000000a', 'large', '클라우드', NULL),
  ('00000000-0000-0000-0000-00000000000b', 'large', '자동화', NULL),
  ('00000000-0000-0000-0000-00000000000c', 'large', '산업도메인', NULL)
ON CONFLICT (id) DO NOTHING;
```

---

## 5. 위험 및 대응 (Risks)

| 위험 | 가능성 | 영향 | 대응 |
|------|--------|------|------|
| Drizzle Kit이 생성한 SQL이 기대와 다름 | High | Medium | 매 generate 후 SQL diff 리뷰 절차 의무화 |
| pgcrypto key 환경변수 누락 | Medium | Critical | application bootstrap 시 `SET LOCAL app.pii_encryption_key` 누락 검증 (헬스체크) |
| RLS 정책 누락 테이블 발견 | Medium | High | 모든 테이블에 대해 `pg_policies` 조회로 정책 1개 이상 보유 검증 SQL 작성 |
| EXCLUSION이 timezone 변경 시 잘못 작동 | Low | Medium | `tstzrange`로 일관 사용 + 테스트 케이스 |
| Seed UUID 충돌 (실제 운영 데이터와) | Low | Low | seed UUID는 `00000000-...` prefix로 명시적 식별 |
| GENERATED 컬럼 변경 시 ALTER TABLE 락 | Low | High | 운영 적용 전 `pg_stat_activity` 모니터링, off-peak 배포 |

---

## 6. 검증 절차 (Validation Steps)

```bash
# 1. 로컬 Supabase 시작
supabase start

# 2. DB 리셋 + 마이그레이션 + seed 적용
supabase db reset

# 3. Drizzle 타입 생성 검증
pnpm drizzle-kit check

# 4. Acceptance 시나리오 자동 검증
pnpm tsx scripts/db-verify.ts

# 5. Supabase Studio에서 RLS 정책 시각 확인
open http://127.0.0.1:54323
```

상세 acceptance 시나리오는 [`acceptance.md`](./acceptance.md) 참조.

---

## 7. 후속 SPEC 인터페이스 (Downstream Contract)

본 SPEC 완료 후 노출되는 인터페이스:

- `src/db/schema/index.ts`: 모든 테이블 스키마 export
- `src/db/client.ts`: `db` (Drizzle), `supabase` (Supabase JS) 인스턴스
- `app.encrypt_pii(text) → bytea`, `app.decrypt_pii(bytea, uuid) → text` SQL 함수
- `app.current_role() → text` JWT claim 추출 함수

후속 SPEC은 위 인터페이스만 사용하며, 스키마 직접 변경은 본 SPEC 또는 SPEC-DB-002+로 한정한다.
