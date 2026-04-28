---
spec_id: SPEC-SEED-002
version: 0.1.0
status: draft
created: 2026-04-28
updated: 2026-04-28
---

# SPEC-SEED-002 — 인수 기준 (Acceptance Criteria)

본 문서는 SPEC-SEED-002의 인수 기준을 Given-When-Then 형식으로 정의한다. 모든 AC는 자동화 가능한 단언으로 작성되며 `pnpm db:verify` 또는 `pnpm e2e`에서 측정 가능해야 한다.

---

## AC-SEED002-PENDING-COUNT

**의도**: REQ-SEED002-002 — pending 정산 ≥ 3건 보장.

- **Given** 로컬 Supabase 스택이 깨끗한 상태에서 시작한다 (`npx supabase db reset` 직후).
- **When** 모든 마이그레이션이 순서대로 적용된다 (`20260427000070_seed.sql` 다음에 `20260428000010_e2e_seed_phase2.sql`).
- **Then** `SELECT COUNT(*) FROM public.settlements WHERE status = 'pending'` 결과는 **3 이상**이어야 한다.
- **And** `pnpm db:verify`가 `AC-SEED002-PENDING-COUNT` 라인을 PASS로 출력한다.

검증 SQL:
```sql
SELECT COUNT(*) FROM public.settlements WHERE status = 'pending';
-- expected: >= 3
```

---

## AC-SEED002-OPERATOR2-EXISTS

**의도**: REQ-SEED002-001 — 보조 운영자 페르소나 존재 보장.

- **Given** 마이그레이션이 모두 적용되었다.
- **When** `public.users`와 `auth.users`에서 operator2를 조회한다.
- **Then**
  - `SELECT COUNT(*) FROM public.users WHERE email = 'operator2@algolink.local' AND role = 'operator'` 결과는 정확히 **1**이다.
  - 해당 행의 `id`는 `00000000-0000-0000-0000-00000000bbb2`이다.
  - `auth.users`에도 동일 id·email 행이 정확히 1건 존재한다.
  - `auth.identities`에 `(provider='email', user_id=bbb2)` 행이 1건 존재한다.
- **And** `pnpm db:verify`가 `AC-SEED002-OPERATOR2` 라인을 PASS로 출력한다.

검증 SQL:
```sql
SELECT COUNT(*) FROM public.users
WHERE email = 'operator2@algolink.local' AND role = 'operator';
-- expected: 1

SELECT id FROM public.users WHERE email = 'operator2@algolink.local';
-- expected: 00000000-0000-0000-0000-00000000bbb2
```

---

## AC-SEED002-IDEMPOTENT

**의도**: REQ-SEED002-003 — 마이그레이션 재실행 시 상태 분기 없음.

- **Given** 마이그레이션이 한 번 적용되어 pending 정산 N건, operator2 1건이 존재한다.
- **When** `npx supabase db reset`을 한 번 더 실행하거나 동일 마이그레이션을 다시 적용한다.
- **Then**
  - 마이그레이션이 오류 없이 종료된다 (PK 충돌, FK 위반, UNIQUE 충돌 모두 발생하지 않음).
  - `public.users` 행 수는 변동 없다.
  - `public.settlements WHERE status = 'pending'` 행 수는 변동 없다.
  - `auth.users`/`auth.identities`의 operator2 관련 행 수는 변동 없다.
- **And** 모든 INSERT 문이 `ON CONFLICT DO NOTHING`(또는 동등 가드)을 사용함을 SQL 파일에서 확인할 수 있다.

검증 절차:
```bash
# 1차 적용
npx supabase db reset
COUNT_1=$(psql ... -c "SELECT COUNT(*) FROM public.settlements WHERE status='pending';" -tA)

# 2차 적용
npx supabase db reset
COUNT_2=$(psql ... -c "SELECT COUNT(*) FROM public.settlements WHERE status='pending';" -tA)

# 단언: COUNT_1 == COUNT_2
```

---

## AC-SEED002-OPERATOR-PRIMARY-INTACT

**의도**: REQ-SEED002-004 — operator 주 페르소나 절대 보호.

- **Given** 070 시드가 적용된 상태(주 운영자 `operator@algolink.local` 존재).
- **When** 본 SPEC의 신규 마이그레이션을 적용한다.
- **Then**
  - `operator@algolink.local`의 `auth.users.id`, `email`, `encrypted_password`가 070 적용 직후 값과 **완전히 동일**하다.
  - `public.users.role`이 `'operator'`로 유지된다.
  - `auth.identities`의 해당 행도 변경되지 않는다.
- **And** `git diff supabase/migrations/20260427000070_seed.sql`이 변경 없음을 보인다(파일 자체 불변).
- **And** 신규 마이그레이션 파일에 `operator@algolink.local` 또는 주 운영자 UUID에 대한 `UPDATE`/`DELETE` 문이 존재하지 않음을 grep으로 확인할 수 있다.

검증 SQL:
```sql
-- baseline 캡처(070만 적용된 상태)
SELECT id, email, encrypted_password FROM auth.users WHERE email = 'operator@algolink.local';

-- 본 SPEC 마이그레이션 적용 후 동일 쿼리
-- expected: 행이 baseline과 byte-for-byte 동일
```

검증 grep:
```bash
grep -n "operator@algolink.local" supabase/migrations/20260428000010_e2e_seed_phase2.sql
# expected: 매칭 없음

git diff supabase/migrations/20260427000070_seed.sql
# expected: empty diff
```

---

## AC-SEED002-ENV-FALLBACK

**의도**: REQ-SEED002-005 — env override 패턴 + 기본값 폴백.

- **Given** `SEED_OPERATOR2_EMAIL`과 `SEED_OPERATOR2_PASSWORD` 환경 변수가 모두 미설정인 상태.
- **When** `tests/e2e/helpers/seed-users.ts`의 `SEED_USERS.operator2`를 import해 값을 평가한다.
- **Then**
  - `SEED_USERS.operator2.email === 'operator2@algolink.local'`
  - `SEED_USERS.operator2.password === 'DevOperator2!2026'`
- **And When** 두 env가 다른 값(예: `qa-op2@example.com` / `OverridePass!1`)으로 설정된 후 동일 객체를 평가한다.
- **And Then**
  - `SEED_USERS.operator2.email === 'qa-op2@example.com'`
  - `SEED_USERS.operator2.password === 'OverridePass!1'`
- **And** `scripts/seed-users.ts`도 동일한 fallback 동작을 갖는다 (env 비어 있을 때 `operator2@algolink.local` / `DevOperator2!2026` 사용).

검증 절차:
```bash
# fallback 케이스
unset SEED_OPERATOR2_EMAIL SEED_OPERATOR2_PASSWORD
pnpm tsx -e "import { SEED_USERS } from './tests/e2e/helpers/seed-users'; console.log(SEED_USERS.operator2)"
# expected: { email: 'operator2@algolink.local', password: 'DevOperator2!2026' }

# override 케이스
SEED_OPERATOR2_EMAIL=qa-op2@example.com SEED_OPERATOR2_PASSWORD='OverridePass!1' \
  pnpm tsx -e "import { SEED_USERS } from './tests/e2e/helpers/seed-users'; console.log(SEED_USERS.operator2)"
# expected: { email: 'qa-op2@example.com', password: 'OverridePass!1' }
```

---

## 엣지 케이스 (Edge Cases)

| 케이스 | 기대 동작 |
|---|---|
| 마이그레이션 두 번 적용 | 행 수 변동 없음, 오류 없음 (AC-SEED002-IDEMPOTENT) |
| 070 시드만 적용된 상태에서 본 마이그레이션 단독 적용 | 정상 적용 (070 의존성 충족) |
| 신규 마이그레이션이 070보다 먼저 정렬되도록 파일명을 잘못 지은 경우 | FK 위반으로 실패 → 파일명 prefix `20260428…` 강제로 사전 차단 |
| operator2 비밀번호를 운영(prod)에서 사용 시도 | 본 SPEC은 dev 한정 — 운영 환경에서는 SEED_USERS 사용 자체가 비활성 (스크립트 가드) |
| `pnpm seed:users` 재실행 시 operator2 중복 생성 시도 | Supabase Admin API의 `email_confirm: true` upsert 동작으로 idempotent (기존 스크립트 패턴 준수) |

---

## Quality Gate

다음 조건이 모두 충족되어야 SPEC-SEED-002가 DONE으로 간주된다.

- [ ] AC-SEED002-PENDING-COUNT PASS
- [ ] AC-SEED002-OPERATOR2-EXISTS PASS
- [ ] AC-SEED002-IDEMPOTENT PASS
- [ ] AC-SEED002-OPERATOR-PRIMARY-INTACT PASS
- [ ] AC-SEED002-ENV-FALLBACK PASS
- [ ] `pnpm db:verify` 결과 20/20 PASS
- [ ] `pnpm e2e --grep phase2` 결과 SKIP 0건 (SPEC-E2E-002 후속 작업과 합산)
- [ ] `git diff supabase/migrations/20260427000070_seed.sql` 가 빈 diff
- [ ] 본 SPEC 마이그레이션 파일에 `UPDATE`/`DELETE` 문이 존재하지 않음 (grep 확인)

## Definition of Done

- 5개 AC 모두 PASS
- Quality Gate 모두 충족
- 070 시드 파일과 operator 주 페르소나 행 불변 확인
- M1~M6 마일스톤 산출물이 코드베이스에 존재 (plan.md 참조)
