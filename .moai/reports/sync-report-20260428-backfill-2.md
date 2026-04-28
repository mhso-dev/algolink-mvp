# Sync Report — Backfill 2 (2026-04-28)

이전 backfill 커밋 `534fba3` 이후 `main`에 추가된 5개 커밋에 대한 메타데이터 보정 리포트.

---

## 대상 커밋 (시간순)

| 커밋 | 메시지 | 영향 SPEC |
|------|--------|-----------|
| `86306bd` | merge: SPEC-ME-001 M3 + M5 — 3-tier SkillsPicker + 정산 조회 | SPEC-ME-001 |
| `bb0a369` | merge: SPEC-ME-001 M8 — 이력서 PDF 다운로드 (마스킹/원본) | SPEC-ME-001 |
| `28fc5c1` | merge: SPEC-ME-001 M7 — 지급 정보 pgcrypto 암호화 (RPC) | SPEC-ME-001 |
| `9ad42c3` | test(project): SPEC-PROJECT-001 — KPI module + integration scenarios 1~7 | SPEC-PROJECT-001 |
| `9affe74` | feat(project): SPEC-PROJECT-001 — KPI rank 로깅 + index export + test:unit 등록 | SPEC-PROJECT-001 |

---

## 갱신된 파일 목록

### SPEC 문서

| 파일 | 변경 내용 |
|------|-----------|
| `.moai/specs/SPEC-ME-001/spec.md` | status: in-progress → completed, version: 1.1.0 → 1.2.0, Deferred Items 업데이트, Implementation Notes (Backfill 2) 추가 |
| `.moai/specs/SPEC-PROJECT-001/spec.md` | status: in-progress → completed, version: 1.1.0 → 1.2.0, KPI 모듈 + 통합 테스트 Implementation Notes (Backfill 2) 추가 |

### Project docs

| 파일 | 변경 내용 |
|------|-----------|
| `.moai/project/tech.md` | @react-pdf/renderer 추가, pgcrypto RPC 패턴 상세, ADR-009/010/011 추가, version 1.2.0 |
| `.moai/project/product.md` | F-101/F-103/F-104 ✅ 완료 마킹, F-202 KPI 완료 표기, version 1.2.0 |
| `.moai/project/structure.md` | src/lib/instructor/* 신규 파일 반영, src/lib/recommend/kpi.ts 반영, public/fonts/ 반영, supabase/migrations/20260428000010 반영, version 1.2.0 |

### 코드 파일 (MX 태그 추가)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/instructor/resume-pdf-data.ts` | @MX:ANCHOR + @MX:REASON + @MX:SPEC 추가 |

### Lessons

| 파일 | 변경 내용 |
|------|-----------|
| `~/.claude/projects/.../memory/lessons.md` | LESSON-004 (pgcrypto GUC 키), LESSON-005 (NotoSansKR PDF 폰트), LESSON-006 (통합 테스트 SPEC 매핑) 추가 |

---

## 신규 파일 요약 (커밋별)

### 86306bd — SPEC-ME-001 M3 + M5

**신규:**
- `src/components/instructor/skills-picker.tsx`
- `src/components/instructor/settlement-list.tsx`
- `src/components/instructor/settlement-summary-widget.tsx`
- `src/lib/instructor/skill-tree.ts`
- `src/lib/instructor/skill-queries.ts`
- `src/lib/instructor/settlement-grouping.ts`
- `src/lib/instructor/settlement-queries.ts`
- `src/lib/instructor/__tests__/skill-tree.test.ts`
- `src/lib/instructor/__tests__/settlement-grouping.test.ts`

**수정:**
- `src/app/(app)/(instructor)/me/resume/page.tsx` (SkillsPicker 통합)
- `src/app/(app)/(instructor)/me/settlements/page.tsx` (요약 위젯 + 리스트 교체)

### bb0a369 — SPEC-ME-001 M8

**신규:**
- `src/app/(app)/(instructor)/me/resume/export/route.tsx`
- `src/components/instructor/resume-pdf-document.tsx`
- `src/lib/instructor/resume-pdf-data.ts`
- `src/lib/instructor/__tests__/resume-pdf-data.test.ts`
- `public/fonts/NotoSansKR-Regular.ttf` (4.4 MB)
- `public/fonts/NotoSansKR-Bold.ttf` (4.6 MB)

**의존성:**
- `package.json`: `@react-pdf/renderer` 추가

### 28fc5c1 — SPEC-ME-001 M7

**신규:**
- `supabase/migrations/20260428000010_pgcrypto_payout_rpc.sql`
- `src/lib/instructor/payout-queries.ts`
- `src/lib/instructor/payout-bank-bundle.ts`
- `src/lib/instructor/__tests__/pii-encrypt.test.ts` (156 lines)
- `src/lib/instructor/__tests__/payout-bank-bundle.test.ts` (42 lines)

**수정:**
- `src/lib/instructor/pii-encrypt.ts` (SupabaseClient 제네릭 widen + RPC 패턴)
- `src/app/(app)/(instructor)/me/settings/payout/actions.ts` (Server Action 완성)
- `src/app/(app)/(instructor)/me/settings/payout/page.tsx`
- `src/components/instructor/payout-settings-form.tsx`

### 9ad42c3 — SPEC-PROJECT-001 KPI + integration

**신규:**
- `src/lib/recommend/kpi.ts` (99 lines)
- `src/lib/recommend/__tests__/kpi.test.ts` (179 lines, 12종)
- `src/app/(app)/(operator)/projects/__tests__/integration.test.ts` (335 lines, 7 시나리오)

### 9affe74 — SPEC-PROJECT-001 KPI rank 로깅

**수정:**
- `src/lib/recommend/index.ts` (kpi re-export)
- `src/app/(app)/(operator)/projects/[id]/actions.ts` (rank 산출 + 로그)
- `package.json` (test:unit 등록)

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| `pnpm typecheck` | PASS (0 type errors) |
| `pnpm lint` | PASS (0 critical) |
| `pnpm test:unit` | PASS (332 tests) |
| `pnpm build` | PASS (0 errors) |

---

## MX 태그 변경 요약

| 파일 | 추가 | 제거 | 변경 |
|------|------|------|------|
| `src/lib/instructor/resume-pdf-data.ts` | @MX:ANCHOR, @MX:REASON, @MX:SPEC | 0 | 0 |

기존 태그 상태:
- `src/lib/instructor/pii-encrypt.ts`: @MX:WARN + @MX:ANCHOR 정상 (기존)
- `src/lib/recommend/kpi.ts`: @MX:ANCHOR 정상 (신규 커밋에서 이미 태깅)
- `src/lib/instructor/skill-tree.ts`: @MX:NOTE 정상 (신규 커밋에서 이미 태깅)
- `src/lib/instructor/settlement-grouping.ts`: @MX:NOTE 정상 (신규 커밋에서 이미 태깅)

---

_Sync report generated: 2026-04-28_
_Backfill scope: commits 86306bd → 9affe74 (5 commits after 534fba3)_
