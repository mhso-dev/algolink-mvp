---
spec_id: SPEC-DB-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
---

# SPEC-DB-002 — Acceptance Criteria

## AC-DB002-MIG-PENDING-OK

**Given**: 모든 마이그레이션이 schema_migrations 에 적용된 상태  
**When**: `pnpm db:verify` 실행  
**Then**: 19/19 PASS, 종료 코드 0

## AC-DB002-MIG-PENDING-FAIL

**Given**: 1건 누락 시뮬레이션 (예: 가짜 파일 추가 또는 적용 행 삭제)  
**When**: `pnpm db:verify` 실행  
**Then**: 18/19 PASS + 1 FAIL, 누락 timestamp 명시, 종료 코드 1

## AC-DB002-CLOUD-SAFE

**Given**: `supabase_migrations.schema_migrations` 테이블이 부재  
**When**: `pnpm db:verify` 실행  
**Then**: 본 AC 는 skip (○ 마커) 처리, 기존 18 AC 영향 0

## AC-DB002-NO-REGRESSION

**Given**: 본 SPEC 적용 전후  
**When**: `pnpm db:verify`  
**Then**: 기존 18 AC 의 결과 동일 (독립)

## DoD 체크리스트

- [ ] M1~M3 코드 변경 완료
- [ ] M4 누락 시뮬레이션 검증
- [ ] AC 4건 모두 PASS
- [ ] 종결 보고서 작성
