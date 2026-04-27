## SPEC-AUTH-001 Progress

- Started: 2026-04-27
- Mode: TDD (per quality.yaml)
- Harness: standard
- Branch: main (auto_branch: feature/SPEC-AUTH-001 to be created at Phase 3 of each milestone batch)

## Reconciliation Decisions (User-confirmed 2026-04-27)

- **Module structure (hybrid)**: `src/utils/supabase/` keeps raw SDK factories (browser/server/middleware-helper); `src/auth/` adds domain layer (roles, guards, errors, events, admin, getCurrentUser). Domain depends on adapter, not vice versa.
- **Middleware upgrade**: `src/utils/supabase/middleware.ts` to be upgraded to use `supabase.auth.getClaims()` (JWT signature verification) per REQ-AUTH-SESSION-002. Existing `src/proxy.ts` to be renamed to `src/middleware.ts` per SPEC §4.2 (or kept as proxy.ts if Next.js 16 enforces the new name — to verify).
- **Login relocation**: existing `src/app/login/{actions.ts,login-form.tsx,page.tsx}` migrated to `src/app/(auth)/login/` with full rewrite to satisfy zod validation, a11y, Korean error mapping, `?next=` validation per REQ-AUTH-LOGIN-001..006.
- **ENV key naming**: KEEP `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase 2024+ rename). SPEC plan.md M1 mentions `_ANON_KEY` only — treat as documentation drift; SPEC text remains authoritative for behavior, env var name follows existing project convention.

## Phase 0 — Pre-flight

- Phase 0.5 (memory_guard): not configured → skipped
- Phase 0.9 (JIT language detection): TypeScript/Next.js (package.json with "typescript" devDep) → moai-lang-typescript
- Phase 0.95 (scale-based mode): files >= 10 (~50), domains >= 3 (auth/db/frontend) → **Full Pipeline** mode (sequential sub-agent delegation by milestone batch)
- Reconciliation Gate: complete (above)
