## SPEC-DB-001 Progress

- Started: 2026-04-27
- Development mode: TDD (RED-GREEN-REFACTOR)
- Harness level: standard
- Execution mode: sub-agent (sequential per milestone)
- Branch: feature/SPEC-DB-001 (off main)
- Remote: github.com/mhso-dev/algolink-mvp

## Milestone Tracker

| Milestone | Status | Artifact |
|-----------|--------|----------|
| Phase 0: Bootstrap | ✅ DONE | Next.js 16 + Drizzle + Supabase, git main + feature 브랜치 |
| M1: pgcrypto/auth | ✅ DONE | `enums.ts`, `auth.ts`, `client.ts`, `types.ts`, `drizzle.config.ts`, `000010_extensions.sql`, `000020_pgcrypto_functions.sql` |
| M2: instructor/PII/resume | ✅ DONE | `instructor.ts`, `files.ts`, `pii-log.ts`, `resume.ts` (7 sub-domain) |
| M3: skill taxonomy/clients | ✅ DONE | `skill-taxonomy.ts`, `client.ts` |
| M4: projects/schedule | ✅ DONE | `project.ts` (13단계 + GENERATED margin), `schedule.ts`, `000040_exclusion_constraints.sql` |
| M5: settlements | ✅ DONE | `settlement.ts` (CHECK + GENERATED 2개) |
| M6: notes/notif/AI/review | ✅ DONE | `notes.ts`, `notifications.ts`, `ai-artifacts.ts`, `review.ts` |
| M7: RLS policies | ✅ DONE | `000060_rls_policies.sql` (28 테이블 RLS, 80+ 정책, instructors_safe view) |
| M8: Seed data | ✅ DONE | `000070_seed.sql` (admin/operator/instructor + 12 large + 30+ medium + 30+ small + 2 client + 3 instructor + 2 project + 2 settlement) |
| M9: db-verify.ts | ✅ DONE | `scripts/db-verify.ts` (15 시나리오) |
| 트리거 (M4/M5 보강) | ✅ DONE | `000050_triggers.sql` (status_history × 2, leaf check, updated_at × 7, auth FK) |
| Supabase config | ✅ DONE | `supabase/config.toml`, `supabase/seed/dev_setup.sql` |
| Phase 2.5/2.8/2.9: Quality + MX | ✅ DONE | tsc + eslint 모두 통과 (.next 캐시 정리 후 0 오류 확인) |
| Phase 3: Git commits + push | ✅ DONE | 3 커밋 푸시 완료 (db57283/f017958/fb31c51), PR + main merge 진행 |

## TRUST 5 자체 평가

- **Tested**: db-verify.ts 15 시나리오로 acceptance.md 핵심 게이트 자동화. (실제 실행은 supabase CLI 설치 필요 — 사용자 환경에서 `pnpm supabase:start && pnpm supabase:reset && pnpm db:verify`)
- **Readable**: 모든 테이블명/컬럼명 snake_case, FK는 `_id`, enum은 `_type`/`_status` 일관 적용. @MX 태그로 의도 전달.
- **Unified**: timestamptz/uuid/bigint 일관 사용, 14개 schema 파일 + 7개 migration 동일 헤더 형식.
- **Secured**: 28 테이블 RLS + FORCE RLS + default-deny. PII 4종 pgcrypto 암호화. decrypt_pii는 admin/operator만 + access log 자동 기록.
- **Trackable**: status_history 2개 (project/settlement), pii_access_log, updated_at 7 테이블 자동 갱신, conventional commits + Co-Authored-By.

## 알려진 제한 / 후속 SPEC 권장

- Supabase CLI 설치는 사용자 환경 책임 (`brew install supabase/tap/supabase` 또는 `npx supabase`). 본 SPEC은 마이그레이션 SQL과 검증 스크립트까지만 포함.
- `users.id ↔ auth.users.id` FK는 마이그레이션 시점에 auth 스키마가 있으면 자동 적용 (000050_triggers.sql DO 블록).
- 후속 SPEC-AUTH-001에서 Supabase Auth UI + 역할 기반 라우팅 구현 예정.
- pgvector / 시맨틱 검색은 SCOPE 제외, 후속 SPEC에서 도입.

## Live Reset 검증 결과 (2026-04-27, hotfix/SPEC-DB-001-live-reset)

PR #6(pii_access_log 중복 제거) 머지 이후, SPEC-AUTH-001 라이브 검증을 차단했던 SPEC-DB-001 로컬 스택 결함을 일괄 해소.

수정 항목:

| # | 영역 | 변경 |
|---|------|------|
| 1 | `supabase/config.toml` | `db.major_version` 16 → 17 (Supabase CLI 2.95.4 거부 해소) |
| 2 | `supabase/migrations/20260427000020_pgcrypto_functions.sql` | SECURITY DEFINER 함수 search_path 에 `extensions` 추가 — `pgp_sym_encrypt(text,text) does not exist` 해소 |
| 3 | `supabase/migrations/20260427000070_seed.sql` | PRE-SEED 블록 추가: auth.users + auth.identities 3행 멱등 INSERT — public.users FK 위반(롤백) 해소 |
| 4 | `supabase/seed/dev_setup.sql` | auth.users 멱등 seed + identity seed 추가 (안전망), `ALTER DATABASE` → `ALTER ROLE postgres IN DATABASE postgres` (PG17 GUC 권한 변경 대응) |
| 5 | `scripts/db-verify.ts` | postgres-js bigint string 캐스팅 (SETTLE-01), `set_config(true)` 트랜잭션 스코프 + `extensions.pgp_sym_decrypt` 사용 (PII-02) |

검증 명령:

```bash
npx supabase stop --no-backup && npx supabase start
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' pnpm db:verify
```

결과:
- `supabase start` 모든 마이그레이션 + seed + dev_setup.sql 클린 통과
- `pnpm db:verify` 18 / 18 시나리오 통과 (SETTLE-01, PII-02 포함 전 항목 PASS)
- TRUST 5 게이트 재통과 (lint/type/test 영향 없음, schema 무관 변경 없음)
