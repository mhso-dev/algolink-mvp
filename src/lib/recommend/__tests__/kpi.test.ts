// SPEC-PROJECT-001 §1.4 / EC-13 — KPI 측정 (1순위 채택률) 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOP1_ACCEPTANCE_RATE_SQL,
  computeTop1AcceptanceRate,
  defaultSinceIso,
  getRecommendationAcceptanceRate,
  type KpiSupabaseClient,
  type RecommendationRow,
} from "../kpi";

const INS_A = "11111111-1111-4111-8111-111111111111";
const INS_B = "22222222-2222-4222-8222-222222222222";
const INS_C = "33333333-3333-4333-8333-333333333333";

function row(top3: string[], adopted: string | null): RecommendationRow {
  return {
    top3Jsonb: top3.map((id) => ({ instructorId: id })),
    adoptedInstructorId: adopted,
  };
}

test("computeTop1AcceptanceRate: EC-13 정확 케이스 (3/4 = 0.75)", () => {
  const rows: RecommendationRow[] = [
    row([INS_A, INS_B, INS_C], INS_A),
    row([INS_A, INS_B, INS_C], INS_A),
    row([INS_A, INS_B, INS_C], INS_A),
    row([INS_A, INS_B, INS_C], INS_B),
    row([INS_A, INS_B, INS_C], null),
  ];
  const result = computeTop1AcceptanceRate(rows);
  assert.equal(result.decided, 4);
  assert.equal(result.top1Adopted, 3);
  assert.equal(result.rate, 0.75);
});

test("computeTop1AcceptanceRate: 빈 배열 → rate null", () => {
  const result = computeTop1AcceptanceRate([]);
  assert.equal(result.decided, 0);
  assert.equal(result.rate, null);
});

test("computeTop1AcceptanceRate: 모두 미배정 → rate null", () => {
  const result = computeTop1AcceptanceRate([row([INS_A, INS_B], null), row([INS_A], null)]);
  assert.equal(result.decided, 0);
  assert.equal(result.rate, null);
});

test("computeTop1AcceptanceRate: top3 빈 row 는 분모/분자 제외", () => {
  const result = computeTop1AcceptanceRate([row([], INS_A), row([INS_A, INS_B], INS_A)]);
  assert.equal(result.decided, 1);
  assert.equal(result.top1Adopted, 1);
  assert.equal(result.rate, 1);
});

test("computeTop1AcceptanceRate: 100% 채택 시 rate === 1", () => {
  const result = computeTop1AcceptanceRate([row([INS_A, INS_B], INS_A), row([INS_B, INS_A], INS_B)]);
  assert.equal(result.rate, 1);
});

test("computeTop1AcceptanceRate: 0% 채택 시 rate === 0", () => {
  const result = computeTop1AcceptanceRate([row([INS_A, INS_B], INS_B), row([INS_A, INS_B, INS_C], INS_C)]);
  assert.equal(result.decided, 2);
  assert.equal(result.top1Adopted, 0);
  assert.equal(result.rate, 0);
});

test("TOP1_ACCEPTANCE_RATE_SQL: SQL 문자열 기본 검증", () => {
  assert.match(TOP1_ACCEPTANCE_RATE_SQL, /ai_instructor_recommendations/);
  assert.match(TOP1_ACCEPTANCE_RATE_SQL, /adopted_instructor_id/);
  assert.match(TOP1_ACCEPTANCE_RATE_SQL, /top3_jsonb->0->>'instructorId'/);
  assert.match(TOP1_ACCEPTANCE_RATE_SQL, /NULLIF\(/);
});

test("defaultSinceIso: 90일 전 ISO timestamp 반환", () => {
  const now = new Date("2026-04-28T00:00:00Z");
  assert.equal(defaultSinceIso(now), "2026-01-28T00:00:00.000Z");
});

test("getRecommendationAcceptanceRate: 주입형 supabase client 동작 (3/4 = 0.75)", async () => {
  const fakeRows = [
    { top3_jsonb: [{ instructorId: INS_A }, { instructorId: INS_B }], adopted_instructor_id: INS_A },
    { top3_jsonb: [{ instructorId: INS_A }, { instructorId: INS_B }], adopted_instructor_id: INS_A },
    { top3_jsonb: [{ instructorId: INS_A }, { instructorId: INS_B }], adopted_instructor_id: INS_A },
    { top3_jsonb: [{ instructorId: INS_A }, { instructorId: INS_B }], adopted_instructor_id: INS_B },
    { top3_jsonb: [{ instructorId: INS_A }], adopted_instructor_id: null },
  ];
  let capturedSince: string | null = null;
  const fake: KpiSupabaseClient = {
    from(table) {
      assert.equal(table, "ai_instructor_recommendations");
      return {
        select(cols) {
          assert.match(cols, /top3_jsonb/);
          assert.match(cols, /adopted_instructor_id/);
          return {
            async gte(col, value) {
              assert.equal(col, "created_at");
              capturedSince = value;
              return { data: fakeRows, error: null };
            },
          };
        },
      };
    },
  };
  const result = await getRecommendationAcceptanceRate(fake, { since: "2026-01-01T00:00:00.000Z" });
  assert.equal(capturedSince, "2026-01-01T00:00:00.000Z");
  assert.equal(result.decided, 4);
  assert.equal(result.top1Adopted, 3);
  assert.equal(result.rate, 0.75);
});

test("getRecommendationAcceptanceRate: error 시 throw", async () => {
  const fake: KpiSupabaseClient = {
    from() {
      return {
        select() {
          return {
            async gte() {
              return { data: null, error: { message: "boom" } };
            },
          };
        },
      };
    },
  };
  await assert.rejects(() => getRecommendationAcceptanceRate(fake), /boom/);
});

test("getRecommendationAcceptanceRate: top3_jsonb 가 null/array 가 아닐 때 안전 처리", async () => {
  const fake: KpiSupabaseClient = {
    from() {
      return {
        select() {
          return {
            async gte() {
              return {
                data: [
                  { top3_jsonb: null, adopted_instructor_id: INS_A },
                  { top3_jsonb: "not-array", adopted_instructor_id: INS_A },
                  { top3_jsonb: [{ noKey: "x" }], adopted_instructor_id: INS_A },
                  { top3_jsonb: [{ instructorId: INS_A }], adopted_instructor_id: INS_A },
                ],
                error: null,
              };
            },
          };
        },
      };
    },
  };
  const result = await getRecommendationAcceptanceRate(fake, { since: "2026-01-01" });
  assert.equal(result.decided, 1);
  assert.equal(result.top1Adopted, 1);
  assert.equal(result.rate, 1);
});

test("getRecommendationAcceptanceRate: since 미지정 시 defaultSinceIso 사용", async () => {
  let captured: string | null = null;
  const fake: KpiSupabaseClient = {
    from() {
      return {
        select() {
          return {
            async gte(_col, value) {
              captured = value;
              return { data: [], error: null };
            },
          };
        },
      };
    },
  };
  await getRecommendationAcceptanceRate(fake);
  assert.ok(captured !== null);
  assert.match(captured!, /^\d{4}-\d{2}-\d{2}T/);
});
