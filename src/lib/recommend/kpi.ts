// @MX:ANCHOR: SPEC-PROJECT-001 §1.4 / EC-13 — KPI 측정: 추천 1순위 채택률.
// @MX:REASON: product.md §5 KPI(추천 1순위 채택률 ≥ 60%)의 산출 진입점.
// @MX:SPEC: SPEC-PROJECT-001

import type { RecommendationCandidate } from "./types";

export interface RecommendationRow {
  top3Jsonb: readonly Pick<RecommendationCandidate, "instructorId">[];
  adoptedInstructorId: string | null;
}

export interface AcceptanceRateResult {
  decided: number;
  top1Adopted: number;
  rate: number | null;
}

export function computeTop1AcceptanceRate(
  rows: readonly RecommendationRow[],
): AcceptanceRateResult {
  let decided = 0;
  let top1Adopted = 0;
  for (const row of rows) {
    if (!row.adoptedInstructorId) continue;
    if (!row.top3Jsonb || row.top3Jsonb.length === 0) continue;
    decided += 1;
    const first = row.top3Jsonb[0];
    if (first?.instructorId === row.adoptedInstructorId) {
      top1Adopted += 1;
    }
  }
  return {
    decided,
    top1Adopted,
    rate: decided === 0 ? null : top1Adopted / decided,
  };
}

export const TOP1_ACCEPTANCE_RATE_SQL = `
SELECT
  count(*) FILTER (
    WHERE adopted_instructor_id = (top3_jsonb->0->>'instructorId')::uuid
  )::float
  / NULLIF(count(*) FILTER (WHERE adopted_instructor_id IS NOT NULL), 0)
  AS top1_adoption_rate,
  count(*) FILTER (WHERE adopted_instructor_id IS NOT NULL) AS decided_count,
  count(*) AS total_count
FROM ai_instructor_recommendations
WHERE created_at >= $1::timestamptz;
`.trim();

export interface KpiPeriodInput {
  since?: string;
}

export function defaultSinceIso(now: Date = new Date()): string {
  const since = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  return since.toISOString();
}

export interface KpiSupabaseClient {
  from(table: "ai_instructor_recommendations"): {
    select(cols: string): {
      gte(
        col: string,
        value: string,
      ): Promise<{
        data:
          | { top3_jsonb: unknown; adopted_instructor_id: string | null }[]
          | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function getRecommendationAcceptanceRate(
  supabase: KpiSupabaseClient,
  input: KpiPeriodInput = {},
): Promise<AcceptanceRateResult> {
  const since = input.since ?? defaultSinceIso();
  const { data, error } = await supabase
    .from("ai_instructor_recommendations")
    .select("top3_jsonb, adopted_instructor_id")
    .gte("created_at", since);
  if (error) throw new Error(`[kpi] fetch failed: ${error.message}`);
  const rows: RecommendationRow[] = (data ?? []).map((r) => {
    const arr = Array.isArray(r.top3_jsonb)
      ? (r.top3_jsonb as { instructorId?: string }[])
      : [];
    return {
      top3Jsonb: arr
        .filter((c) => typeof c.instructorId === "string")
        .map((c) => ({ instructorId: c.instructorId as string })),
      adoptedInstructorId: r.adopted_instructor_id,
    };
  });
  return computeTop1AcceptanceRate(rows);
}
