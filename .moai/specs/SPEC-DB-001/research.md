---
spec_id: SPEC-DB-001
version: 1.0.0
created: 2026-04-27
updated: 2026-04-27
type: research
---

# SPEC-DB-001 설계 근거 및 대안 분석 (Research & Design Rationale)

본 문서는 SPEC-DB-001의 주요 설계 결정에 대한 근거(Why), 검토한 대안(Alternatives), 채택 이유(Decision)를 기록한다. 향후 스키마 변경/SPEC 업데이트 시 컨텍스트 복원에 활용한다.

---

## 1. 마이그레이션 도구 선택: Drizzle Kit + Supabase Migration 듀얼 트랙

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. Drizzle Kit 단독 | TypeScript 단일 소스, 자동 generate | RLS / 트리거 / EXCLUSION / 함수 미지원 (2026-04 기준) |
| B. Supabase Migration SQL 단독 | RLS·트리거 native 지원, SQL 직관적 | 스키마 타입 안전 부재, ORM과 동기화 부담 |
| C. Prisma | 풍부한 ecosystem | RLS 부재, Supabase Auth 통합 미흡, Edge Runtime 호환성 부족 |
| **D. Drizzle Kit (스키마) + Supabase SQL (RLS·트리거·암호화)** ✅ | 양쪽 강점 결합, 책임 명확 | 두 도구 학습 곡선, 마이그레이션 파일 정렬 책임 |

### 결정 근거

- ADR-003(Drizzle ORM 채택)에 따라 ORM은 Drizzle 고정
- Supabase의 native 기능(RLS, pgcrypto, EXCLUSION)을 포기할 수 없음
- 두 도구의 책임을 명확히 분리하면 "Drizzle 변경 → generate → SQL 파일 commit"의 단순한 워크플로우로 정리 가능
- 마이그레이션 파일은 timestamp prefix로 정렬되므로 순서 충돌 없음

### Risk

- Drizzle Kit이 향후 RLS를 지원하면 일부 SQL을 통합 가능. 현재는 분리 유지가 정답.

---

## 2. PII 암호화 전략: pgcrypto + Application-Level Key

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. 애플리케이션 측 AES-GCM (Node Crypto) | 키가 DB 외부, 감사 용이 | DB 검색 불가, 모든 read 마다 복호화 round-trip |
| B. AWS KMS / Supabase Vault | 키 관리 자동화, 감사 강력 | 추가 인프라/비용, 호출 latency, MVP 단계 과잉 |
| **C. pgcrypto pgp_sym_encrypt + ALTER DATABASE SET GUC** ✅ | DB-side 일관성, 함수로 캡슐화 | 키가 DB 메모리에 존재 |
| D. PostgreSQL TDE (Transparent Data Encryption) | 자동, 투명 | Supabase managed에서 옵션 부재 |

### 결정 근거

- MVP 단계에서 KMS는 과잉. 단일 워크스페이스 + 소수 사용자 환경
- pgcrypto는 Postgres standard extension. Supabase에서 즉시 사용 가능
- `SECURITY DEFINER` 함수로 키 접근을 캡슐화 + 호출 로그 강제 → 감사 요건 충족
- 키 유출 시 영향: 강사 PII만. 키 rotation 절차는 별도 SPEC에서 정의

### 키 관리 정책

- 운영: Supabase 환경변수 → connection startup 시 `SET LOCAL app.pii_encryption_key = current_setting('vault.pii_key')` (Vault 도입 시)
- 개발: `.env.local`의 `PGRYPTO_SYMMETRIC_KEY`를 application bootstrap에서 connection-level GUC로 설정
- 절대 마이그레이션 SQL에 평문 키 commit 금지

---

## 3. 13단계 프로젝트 워크플로우 표현

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. 단일 enum (project_status) | 간단, 타입 안전 | 단계 추가 시 ALTER TYPE 필요, ordering 보장 약함 |
| B. lookup table (project_statuses) | 동적 추가, ordering 명시 | join 부담, FK 무결성만 보장 |
| C. state machine library (애플리케이션) | 풍부한 표현력 | DB 무결성 보장 없음, 분산된 진실 |
| **D. enum + 명시적 ordering 배열 (애플리케이션)** ✅ | 타입 안전 + 순서 명시 | 단계 추가 시 양쪽 동기화 |

### 결정 근거

- 13단계는 비즈니스 협의로 고정된 워크플로우. 잦은 변경 예상 없음
- enum은 PostgreSQL 레벨 타입 안전 + 인덱스 효율 우위
- 단계 추가 절차: `ALTER TYPE project_status ADD VALUE 'new_status' BEFORE 'task_done'` + 애플리케이션 enum 배열 업데이트

### 미해결 질문

- 단계 역행(예: in_progress → assignment_review)은 허용? → MVP에서는 허용. 강제 금지가 필요하면 후속 SPEC에서 trigger로 검증.

---

## 4. 정산 흐름 모델링: 단일 테이블 + 흐름 enum

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. 단일 settlements 테이블 + flow enum | 쿼리 단순, 통합 집계 | NULL 컬럼 일부 발생 |
| B. corporate_settlements + government_settlements 분리 | 흐름별 컬럼 명확 | UNION 쿼리, 중복 트리거 |
| C. 추상 settlements + corporate_details / government_details 1:1 | 정규화 우수 | join 부담, ORM 복잡 |

### 결정: A (단일 테이블)

- 두 흐름의 필드 차이는 `withholding_tax_rate` 1개 (CHECK 제약으로 무결성 보장)
- 매입매출 집계 view 작성이 단순
- ORM 매핑 단순

### Withholding Tax 검증

- Corporate (기업교육): 고객→알고링크→강사. 알고링크가 강사에게 사업비 지급 시 원천세 별도 적용 안 함 (강사가 알고링크에게 세금계산서 발행하는 흐름 가정). withholding_tax_rate = 0
- Government (정부교육): 고객→강사 직접 지급, 알고링크 fee 별도. 강사가 사업자 등록 시 8.80%(사업소득), 일용직이면 3.30%
- CHECK 제약으로 잘못된 조합 차단

---

## 5. 일정 충돌 감지: EXCLUSION constraint

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. 애플리케이션 레벨 검증 | 유연한 비즈니스 룰 | race condition, 데이터 무결성 약함 |
| B. BEFORE INSERT trigger | DB-side 검증 | 직렬화 실패 가능, 코드 복잡 |
| **C. EXCLUSION USING gist (tstzrange &&)** ✅ | DB-native 무결성, race-free | btree_gist 확장 필요 |

### 결정: C

- PostgreSQL의 EXCLUSION은 race-free + 인덱스 활용
- `WHERE schedule_kind IN ('system_lecture', 'unavailable')` 조건부 → personal 일정은 자유롭게 중복 가능
- `tstzrange(starts_at, ends_at, '[)')`로 동일 종료/시작 시간(예: 12:00 종료 + 12:00 시작) 충돌 방지

### Drizzle Kit 미지원 → 수동 SQL 분리

EXCLUSION constraint는 Drizzle Kit이 지원하지 않으므로 `supabase/migrations/20260427_000040_exclusion_constraints.sql`로 분리.

---

## 6. 메모/댓글 다형성: entity_type + entity_id

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. 도메인별 분리 (project_notes, instructor_notes) | FK 무결성, RLS 단순 | 중복 코드, 통합 검색 불편 |
| **B. 다형성 entity_type + entity_id** ✅ | 단일 테이블, 통합 처리 | FK 무결성 약함, 트리거로 검증 필요 |
| C. JSON 메타데이터 | 최대 유연 | 인덱스 어려움, 타입 안전 부재 |

### 결정: B (다형성)

- 메모/댓글이 부착되는 도메인이 3개(project, instructor, client)에 그치고 도메인별 차이가 작음
- `entity_type` enum + `entity_id` UUID + 검증 트리거(또는 polymorphic FK)로 무결성 보강
- RLS 정책은 `entity_type`별로 case 분기

### 트레이드오프

- entity_id에 cross-table FK 불가 → 검증 trigger 작성 필요. 또는 application 레이어에서 INSERT 전 존재 검증 강제.

---

## 7. AI 산출물 캐시 위치

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. Postgres 테이블 (본 SPEC 채택) | 트랜잭션, 조회 일관성 | DB 용량 증가 |
| B. Supabase Storage JSON 파일 | DB 부담 없음 | 검색/집계 어려움 |
| C. Redis (별도 인프라) | 빠른 조회, TTL | MVP 단계 과잉 |

### 결정: A

- 이력서 파싱 결과는 영구 보관 + 재사용 (단순 캐시 아님, 비즈니스 데이터)
- 만족도 요약은 강사 프로필과 동일 라이프사이클
- 추천 로그는 KPI 측정 (SQL 집계 필요)

---

## 8. 금액 타입: bigint vs numeric

### 검토 대안

| 대안 | 장점 | 단점 |
|------|------|------|
| A. `numeric(15, 2)` | 소수점 표현 | 인덱스 효율 낮음, 산술 비용 |
| **B. `bigint` (KRW 원 단위, 정수)** ✅ | 빠름, 정확함 | 표시 시 형식화 필요 (애플리케이션) |

### 결정: B

- KRW는 소수점 없음 (관행적으로 원 단위)
- 산술/집계 빈도 높음 → bigint 우위
- 9.2 × 10^18까지 표현 가능 → 충분

---

## 9. 단일 워크스페이스 가정의 영향

### 의사결정

- 모든 테이블에서 `workspace_id` / `tenant_id` 컬럼 제외
- RLS는 사용자 역할(role)과 본인 소유(user_id) 기반만 사용

### 향후 멀티테넌시 확장 시

- 모든 테이블에 `workspace_id` 추가 + RLS 정책 수정 필요 → 대규모 변경
- 본 SPEC은 단일 워크스페이스 명시적 가정. 멀티테넌시는 별도 SPEC(예: SPEC-MT-001)으로 진행

---

## 10. 모듈 분할 vs 단일 파일

### 검토

- `src/db/schema.ts` 단일 파일 (~1500 lines): 한 곳에서 전체 보기 가능, 검색 용이
- `src/db/schema/*.ts` 14개 파일: 도메인 인지 부담 분산, git diff 가독성, lint 단위

### 결정: 14개 파일 분할

- MoAI 코드 가독성 원칙(파일당 ~300 lines)
- relations는 `relations.ts`에 통합 (cross-file)
- 단일 진입점은 `src/db/schema/index.ts`의 re-export

---

## 11. 검토하지 않은 영역 (Open Questions)

본 SPEC 단계에서 명시적으로 미결정/후속 SPEC에 위임한 항목:

1. **소프트 삭제 통일 정책**: 현재 핵심 4 테이블(instructor, client, project, settlement)에만 `deleted_at` 적용. 부속 테이블도 동일 적용할지 후속 결정 필요.
2. **감사 로그(Audit Log) 범위**: status_history 외의 모든 변경 추적은 별도 SPEC.
3. **세금계산서/송금 외부 연동**: ERP/홈택스/은행 API 연동은 별도 SPEC.
4. **벡터 검색**: pgvector + 강사 추천/이력서 시맨틱 검색은 별도 SPEC.
5. **PII 키 rotation 절차**: KMS 도입 시점에 별도 SPEC. 현재는 키 변경 시 모든 PII bytea 컬럼 재암호화 스크립트 필요.
6. **Backup/PITR 정책**: Supabase managed 기본 설정 채택. 운영 SPEC에서 검증.

---

## 12. 참고 문서

- `.moai/project/product.md`: F-001 ~ F-302 기능 명세
- `.moai/project/tech.md`: ADR-001 ~ ADR-005
- `/Users/mhso/Downloads/LMS 시스템 개발_으뜸/`: 도메인 원본 HTML 7개
- [PostgreSQL pgcrypto](https://www.postgresql.org/docs/16/pgcrypto.html)
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL EXCLUSION Constraints](https://www.postgresql.org/docs/16/sql-createtable.html#SQL-CREATETABLE-EXCLUDE)
