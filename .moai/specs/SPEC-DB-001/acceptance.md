---
spec_id: SPEC-DB-001
version: 1.0.0
created: 2026-04-27
updated: 2026-04-27
---

# SPEC-DB-001 수용 기준 (Acceptance Criteria)

본 문서는 SPEC-DB-001 구현 완료 여부를 판정하는 Given-When-Then 시나리오와 엣지 케이스, 품질 게이트, Definition of Done을 정의한다. 모든 시나리오는 자동화 가능해야 하며 `scripts/db-verify.ts` 또는 SQL 검증 쿼리로 실행된다.

---

## 1. 마이그레이션 및 환경 (Migration & Environment)

### Scenario AC-DB001-MIG-01: 신규 환경 일괄 마이그레이션

**Given** Supabase 로컬 환경이 초기화된 상태이고
**And** `supabase/migrations/` 디렉토리에 모든 마이그레이션 SQL 파일이 존재하며
**And** `.env.local`에 `app.pii_encryption_key`가 설정되어 있을 때

**When** `supabase db reset` 명령을 실행하면

**Then** 모든 마이그레이션이 순서대로 적용되고 (extensions → pgcrypto_functions → initial_schema → exclusion_constraints → triggers → rls_policies → seed)
**And** 종료 코드 0으로 완료되며
**And** 다음 SQL이 모두 통과한다:
```sql
SELECT count(*) > 0 FROM pg_extension WHERE extname = 'pgcrypto';
SELECT count(*) > 0 FROM pg_extension WHERE extname = 'btree_gist';
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';  -- ≥ 25
```

### Scenario AC-DB001-MIG-02: Drizzle Kit 스키마 일관성

**Given** `src/db/schema/*.ts` 파일들이 commit된 상태일 때

**When** `pnpm drizzle-kit check` 실행

**Then** "No schema changes detected" 또는 동등한 메시지가 출력되어 스키마와 마이그레이션 SQL이 일치함을 확인한다.

---

## 2. 인증 및 RLS (Auth & RLS)

### Scenario AC-DB001-RLS-01: 미인증 사용자 거부

**Given** 데이터베이스에 강사 데이터가 1건 이상 존재할 때

**When** JWT claim 없이(`role = anon`) `SELECT * FROM instructors` 실행

**Then** 0 rows 반환 또는 권한 오류 발생

### Scenario AC-DB001-RLS-02: instructor 역할 본인 데이터만 조회

**Given** 강사 A(`user_id = uuid_a`)와 강사 B(`user_id = uuid_b`)가 존재하고
**And** 현재 세션이 `auth.uid() = uuid_a, role = 'instructor'`로 설정될 때

**When** `SELECT id, name_kr FROM instructors` 실행

**Then** 강사 A의 행 1건만 반환된다.

### Scenario AC-DB001-RLS-03: operator 역할 전체 조회 + 수정

**Given** 다수의 강사·고객사·프로젝트가 존재하고
**And** 현재 세션이 `role = 'operator'`로 설정될 때

**When** `SELECT count(*) FROM instructors`, `INSERT INTO clients ...`, `UPDATE projects SET status = 'in_progress' WHERE id = ...` 각각 실행

**Then** 모두 성공하고 데이터 변경이 반영된다.

### Scenario AC-DB001-RLS-04: operator의 PII raw 접근 차단

**Given** 강사 A의 `resident_number_enc` (bytea) 컬럼에 암호화된 값이 저장되어 있고
**And** 현재 세션이 `role = 'operator'`일 때

**When** `SELECT resident_number_enc FROM instructors WHERE id = ?` 실행

**Then** bytea 값이 반환되지만 사람이 읽을 수 있는 평문은 아니다 (raw bytea만 노출)

**And When** `SELECT app.decrypt_pii(resident_number_enc, id) FROM instructors WHERE id = ?` 실행

**Then** 평문이 반환되고 `pii_access_log`에 호출 기록 1건이 추가된다.

### Scenario AC-DB001-RLS-05: instructor 역할의 PII 복호화 거부

**Given** 강사 A 본인이 로그인한 상태이고

**When** `SELECT app.decrypt_pii(resident_number_enc, id) FROM instructors WHERE id = <자신>` 실행

**Then** "permission denied for PII decryption" 예외 발생 (본인이라도 평문 복호화는 admin/operator만 가능)

---

## 3. PII 암호화 (PII Encryption)

### Scenario AC-DB001-PII-01: 평문 저장 금지 검증

**Given** seed 데이터로 강사 3명이 INSERT된 상태일 때

**When** `SELECT pg_typeof(resident_number_enc) FROM instructors LIMIT 1` 실행

**Then** `bytea` 타입이 반환되고
**And When** `SELECT resident_number_enc::text FROM instructors LIMIT 1` 실행
**Then** `\x...` 형태의 hex 문자열이 반환되어 평문이 아님을 확인한다.

### Scenario AC-DB001-PII-02: 암호화-복호화 라운드트립

**Given** application 레이어가 `app.pii_encryption_key`를 설정한 connection을 보유할 때

**When** 다음 SQL을 순차 실행:
```sql
INSERT INTO instructors (id, user_id, name_kr, resident_number_enc, ...)
VALUES (gen_random_uuid(), '<uuid>', '홍길동', app.encrypt_pii('900101-1234567'), ...)
RETURNING id;

SELECT app.decrypt_pii(resident_number_enc, id) FROM instructors WHERE id = '<반환된 id>';
```

**Then** 복호화 결과가 `'900101-1234567'`과 정확히 일치한다.

### Scenario AC-DB001-PII-03: 키 미설정 시 오류

**Given** `app.pii_encryption_key`가 설정되지 않은 connection일 때

**When** `SELECT app.encrypt_pii('test')` 실행

**Then** "unrecognized configuration parameter" 또는 동등한 오류가 발생한다.

---

## 4. 기술 택소노미 (Skill Taxonomy)

### Scenario AC-DB001-SKILL-01: 대단위 12개 seed 검증

**When** `SELECT count(*) FROM skill_categories WHERE tier = 'large'` 실행

**Then** 정확히 12가 반환된다.

### Scenario AC-DB001-SKILL-02: leaf node에만 강사 매핑 허용

**Given** 대단위 카테고리 `프로그래밍` (tier='large')에 자식 카테고리가 존재하고
**And** 강사 A가 존재할 때

**When** `INSERT INTO instructor_skills (instructor_id, skill_id, proficiency) VALUES ('<강사A>', '<프로그래밍 대단위 id>', 'expert')` 실행

**Then** 트리거 또는 CHECK 위반으로 INSERT 거부 발생 (대단위는 leaf가 아님)

**And When** 소단위 카테고리(자식 없음)에 동일 INSERT 실행
**Then** 성공한다.

### Scenario AC-DB001-SKILL-03: 3-tier 계층 무결성

**When** 다음 SQL 실행:
```sql
SELECT
  l.name AS large,
  m.name AS medium,
  s.name AS small
FROM skill_categories s
JOIN skill_categories m ON s.parent_id = m.id
JOIN skill_categories l ON m.parent_id = l.id
WHERE s.tier = 'small' AND m.tier = 'medium' AND l.tier = 'large';
```

**Then** 모든 행에서 tier 계층이 large → medium → small 순서로 정확히 매칭된다.

---

## 5. 프로젝트 워크플로우 (Project Workflow)

### Scenario AC-DB001-PROJ-01: 13단계 enum 검증

**When** `SELECT unnest(enum_range(NULL::project_status))` 실행

**Then** 정확히 13개의 값이 다음 순서로 반환된다: proposal, contract_confirmed, lecture_requested, instructor_sourcing, assignment_review, assignment_confirmed, education_confirmed, recruiting, progress_confirmed, in_progress, education_done, settlement_in_progress, task_done.

### Scenario AC-DB001-PROJ-02: 마진 자동계산

**Given** 프로젝트 A를 다음으로 INSERT:
- business_amount_krw = 10000000
- instructor_fee_krw = 6000000

**When** `SELECT margin_krw FROM projects WHERE id = '<프로젝트 A>'` 실행

**Then** 4000000이 반환된다 (자동 GENERATED).

**And When** `UPDATE projects SET margin_krw = 999 WHERE id = '<프로젝트 A>'` 시도
**Then** GENERATED 컬럼은 직접 UPDATE 불가 오류가 발생한다.

### Scenario AC-DB001-PROJ-03: 상태 변경 이력 자동 기록

**Given** 프로젝트 A가 `status = 'proposal'` 상태일 때

**When** `UPDATE projects SET status = 'contract_confirmed' WHERE id = '<프로젝트 A>'` 실행

**Then** `project_status_history` 테이블에 (project_id, from_status='proposal', to_status='contract_confirmed', changed_by, changed_at) 행 1건이 자동 추가된다.

---

## 6. 일정 충돌 (Schedule Conflict)

### Scenario AC-DB001-SCHED-01: 충돌 일정 거부

**Given** 강사 A에 대해 다음 schedule_item이 존재:
- starts_at = 2026-05-01 09:00 KST
- ends_at = 2026-05-01 12:00 KST
- schedule_kind = 'system_lecture'

**When** 동일 강사 A에 대해 다음 INSERT 시도:
- starts_at = 2026-05-01 11:00 KST
- ends_at = 2026-05-01 14:00 KST
- schedule_kind = 'system_lecture'

**Then** SQLSTATE 23P01 (exclusion_violation) 오류 발생

### Scenario AC-DB001-SCHED-02: 다른 강사 동시간 허용

**Given** 강사 A의 09:00-12:00 일정이 존재할 때

**When** 강사 B가 동일 시간대 INSERT

**Then** 성공한다.

### Scenario AC-DB001-SCHED-03: personal 일정은 충돌 검증 제외

**Given** 강사 A의 09:00-12:00 `system_lecture`가 존재할 때

**When** 동일 강사 A의 09:00-12:00 `personal` 일정 INSERT

**Then** 성공한다 (EXCLUSION의 WHERE 절이 personal 제외).

---

## 7. 정산 (Settlement)

### Scenario AC-DB001-SETTLE-01: corporate 흐름 원천세 0%

**When** 다음 INSERT:
```sql
INSERT INTO settlements (project_id, settlement_flow, withholding_tax_rate, business_amount_krw, instructor_fee_krw)
VALUES ('<프로젝트 X>', 'corporate', 0, 10000000, 6000000);
```

**Then** 성공하고 `profit_krw = 4000000`, `withholding_tax_amount_krw = 0` (GENERATED).

### Scenario AC-DB001-SETTLE-02: corporate + 8.80% 거부

**When** `INSERT INTO settlements (..., settlement_flow='corporate', withholding_tax_rate=8.80, ...)` 실행

**Then** CHECK 제약 위반 오류 발생.

### Scenario AC-DB001-SETTLE-03: government 흐름 원천세 8.80% 또는 3.30% 허용

**When** 다음 INSERT 2건 각각 실행:
```sql
INSERT INTO settlements (..., settlement_flow='government', withholding_tax_rate=8.80, instructor_fee_krw=5000000);
INSERT INTO settlements (..., settlement_flow='government', withholding_tax_rate=3.30, instructor_fee_krw=300000);
```

**Then** 모두 성공하고 `withholding_tax_amount_krw`가 각각 440000(=5,000,000 × 8.80%), 9900(=300,000 × 3.30%)으로 자동 계산된다.

### Scenario AC-DB001-SETTLE-04: government + 5.00% 거부

**When** `INSERT INTO settlements (..., settlement_flow='government', withholding_tax_rate=5.00, ...)` 실행

**Then** CHECK 제약 위반 (허용값은 0, 3.30, 8.80만).

### Scenario AC-DB001-SETTLE-05: 정산 상태 이력 자동 기록

**Given** 정산 S가 `status = 'pending'` 상태일 때

**When** `UPDATE settlements SET status = 'requested' WHERE id = '<S>'` 실행

**Then** `settlement_status_history`에 변경 이력 1건이 자동 추가된다.

---

## 8. 메모, 댓글, 알림 (Notes, Comments, Notifications)

### Scenario AC-DB001-NOTES-01: instructor 역할이 internal 메모 차단

**Given** 프로젝트 P에 다음 두 메모가 존재:
- 메모 1: audience='internal', body='내부 검토 의견'
- 메모 2: audience='instructor', body='강사 안내사항'

**When** 강사 A(P에 배정됨)가 `SELECT * FROM notes WHERE entity_type='project' AND entity_id='<P>'` 실행

**Then** 메모 2만 반환된다.

### Scenario AC-DB001-NOTES-02: 다형성 entity 부착

**Given** 강사 A에 메모 1건, 고객사 C에 메모 1건 INSERT

**When** `SELECT entity_type, count(*) FROM notes GROUP BY entity_type` 실행

**Then** instructor: 1, client: 1로 반환된다.

### Scenario AC-DB001-COMMENTS-01: 메모에 댓글 부착

**Given** 메모 N이 존재할 때

**When** `INSERT INTO comments (note_id, body, created_by) VALUES ('<N>', '확인했습니다', '<user>')` 실행

**Then** 성공하고 `SELECT count(*) FROM comments WHERE note_id = '<N>'` = 1.

### Scenario AC-DB001-NOTIF-01: 알림 타입 enum 검증

**When** `SELECT unnest(enum_range(NULL::notification_type))` 실행

**Then** 다음 5개 값이 반환된다: assignment_overdue, schedule_conflict, low_satisfaction_assignment, dday_unprocessed, settlement_requested.

### Scenario AC-DB001-NOTIF-02: 본인 알림만 조회

**Given** 사용자 U1, U2 각각 알림 1건씩 보유할 때
**And** 현재 세션이 `auth.uid() = U1`일 때

**When** `SELECT * FROM notifications` 실행

**Then** U1의 알림 1건만 반환된다 (RLS).

---

## 9. AI 산출물 캐시 (AI Artifacts)

### Scenario AC-DB001-AI-01: 동일 hash 중복 INSERT 거부

**Given** `ai_resume_parses`에 `input_file_hash = 'abc123'` 행이 존재할 때

**When** 동일 hash로 INSERT 시도

**Then** UNIQUE 제약 위반 오류 발생.

### Scenario AC-DB001-AI-02: 추천 채택률 KPI 집계

**Given** `ai_instructor_recommendations`에 10건이 존재하고 그 중 7건의 `adopted_instructor_id`가 NULL이 아닐 때

**When** `SELECT count(*) FILTER (WHERE adopted_instructor_id IS NOT NULL)::float / count(*) FROM ai_instructor_recommendations` 실행

**Then** 0.7이 반환된다.

---

## 10. 첨부파일 (Files)

### Scenario AC-DB001-FILES-01: 본인 + admin/operator만 SELECT

**Given** 강사 A가 업로드한 파일 F가 존재 (owner_id = A.user_id)

**When** 강사 B가 `SELECT * FROM files WHERE id = '<F>'` 실행
**Then** 0 rows 반환

**And When** operator가 동일 SELECT 실행
**Then** 1 row 반환.

---

## 11. 만족도 리뷰 (Satisfaction Reviews)

### Scenario AC-DB001-REVIEW-01: 점수 범위 검증

**When** `INSERT INTO satisfaction_reviews (..., score = 6, ...)` 실행

**Then** CHECK 위반 (1 ≤ score ≤ 5).

### Scenario AC-DB001-REVIEW-02: 동일 (instructor, project) 중복 거부

**Given** (instructor_id = A, project_id = P) 리뷰 1건 존재

**When** 동일 조합으로 INSERT 시도

**Then** UNIQUE 위반 오류 발생.

---

## 12. Seed 데이터 (Seed)

### Scenario AC-DB001-SEED-01: 필수 데이터 존재

**When** seed 적용 후 다음 SQL 실행:
```sql
SELECT
  (SELECT count(*) FROM users WHERE role = 'admin') AS admin_count,
  (SELECT count(*) FROM clients) AS client_count,
  (SELECT count(*) FROM instructors) AS instructor_count,
  (SELECT count(*) FROM projects WHERE settlement_flow_hint = 'corporate') AS corp_proj,
  (SELECT count(*) FROM projects WHERE settlement_flow_hint = 'government') AS gov_proj,
  (SELECT count(*) FROM skill_categories WHERE tier = 'large') AS large_skill,
  (SELECT count(*) FROM skill_categories) AS total_skill;
```

**Then** 다음을 만족:
- admin_count ≥ 1
- client_count ≥ 2
- instructor_count ≥ 3
- corp_proj ≥ 1
- gov_proj ≥ 1
- large_skill = 12
- total_skill ≥ 62 (12 large + 30 medium + 30 small 가정 하한)

### Scenario AC-DB001-SEED-02: 멱등성

**Given** seed가 1회 적용된 상태일 때

**When** 동일 seed SQL 재실행

**Then** 오류 없이 완료되고 행 수가 변하지 않는다 (`ON CONFLICT DO NOTHING`).

---

## 13. 엣지 케이스 (Edge Cases)

### EC-01: NULL PII 처리
- `app.encrypt_pii(NULL)` → NULL 반환 (오류 아님)
- `app.decrypt_pii(NULL, '<uuid>')` → NULL 반환

### EC-02: 강사 user_id 없이 INSERT
- 외부 강사가 아직 Supabase Auth에 가입하지 않은 경우 `instructors.user_id`는 nullable. RLS 정책에서 `user_id IS NULL`인 경우 instructor 본인 정책은 매칭하지 않음(operator만 접근).

### EC-03: 고객사 삭제 시 프로젝트 RESTRICT
- 프로젝트가 참조 중인 고객사 DELETE 시도 시 FK RESTRICT로 거부됨.

### EC-04: 동일 강사 동일 시간 + 다른 schedule_kind
- 09:00-12:00 system_lecture + 09:00-12:00 personal: EXCLUSION의 WHERE는 system_lecture/unavailable만 검증하므로 INSERT 성공.

### EC-05: 큰 금액 (long type 한계)
- bigint 컬럼에 9,223,372,036,854,775,807 INSERT 성공. 그 이상은 overflow.

### EC-06: 트리거에 의한 변경 시 status_history의 changed_by
- `auth.uid()`가 NULL인 시스템 작업의 경우 changed_by도 NULL로 기록 허용 (`nullable`).

### EC-07: AI 추천 top3 빈 배열
- `ai_instructor_recommendations.top3_jsonb = '[]'::jsonb` INSERT 허용 (추천 결과 없음 사례).

---

## 14. 품질 게이트 (Quality Gates)

### TRUST 5 Validation

- ✅ **Tested**: 본 acceptance.md의 모든 시나리오를 자동화 검증하는 `scripts/db-verify.ts` 작성, 100% 통과
- ✅ **Readable**: 모든 테이블/컬럼명은 snake_case, 외래키는 `_id` 접미사, enum 타입은 `_type` 또는 `_status` 접미사
- ✅ **Unified**: 모든 timestamp는 `timestamptz`, 모든 PK는 `uuid`, 모든 금액은 `bigint`(KRW 원 단위)
- ✅ **Secured**: 모든 public 테이블 RLS 활성화, PII 4종 pgcrypto 암호화, PII 복호화 호출 로그
- ✅ **Trackable**: 핵심 테이블 created_at/updated_at/created_by 컬럼 보유, status 변경 이력 자동 기록

### 기술적 게이트

- ✅ `pnpm drizzle-kit generate` 실행 결과 SQL이 `supabase/migrations/{timestamp}_initial_schema.sql`과 byte-for-byte 일치 또는 의도된 차이만 존재
- ✅ `supabase db reset` 종료 코드 0
- ✅ `pg_policies` 조회 시 모든 public 테이블에 정책 ≥ 1
- ✅ `pg_stat_user_indexes`에서 모든 FK 컬럼에 인덱스 존재 검증
- ✅ `pg_constraint`에서 EXCLUSION 1건(`schedule_items_no_overlap`) 존재

---

## 15. Definition of Done (DoD)

본 SPEC은 다음을 모두 충족할 때 완료(`status: completed`)로 변경한다:

- [ ] `src/db/schema/*.ts` 14개 파일 작성 완료
- [ ] `src/db/enums.ts` 11종 enum 정의 완료
- [ ] `src/db/client.ts` Drizzle + Supabase 클라이언트 export 완료
- [ ] `supabase/migrations/` 7개 SQL 파일 작성 (extensions, pgcrypto_functions, initial_schema, exclusion_constraints, triggers, rls_policies, seed)
- [ ] `drizzle.config.ts` 작성
- [ ] `supabase db reset` 종료 코드 0
- [ ] `scripts/db-verify.ts`가 본 문서의 모든 Scenario AC-DB001-* 통과
- [ ] `.moai/project/db/schema.md` 업데이트 (현재 _TBD_ 해소)
- [ ] PII 키 환경변수 설정 가이드 README 또는 별도 문서 작성
- [ ] 후속 SPEC(SPEC-AUTH-001 등)이 본 SPEC의 인터페이스(`src/db/schema/index.ts`, `app.encrypt_pii/decrypt_pii`)만으로 작업 가능함을 코드 리뷰로 확인
- [ ] CI에서 마이그레이션 + 검증이 자동 실행되도록 워크플로우 추가 (선택, 권장)
