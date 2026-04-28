// SPEC-NOTIFY-001 §M3 — low_satisfaction_assignment 트리거.
// @MX:NOTE: operator가 평균 만족도 < 3.0 강사 배정 시도 시 본인에게 경고 emit. 리뷰 0건은 emit 안 함.

import { emitNotification } from "../emit";
import type { EmitResult } from "../emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

interface ReviewRow {
  score: number;
}

interface InstructorRow {
  id: string;
  name_kr: string | null;
}

export async function checkLowSatisfaction(
  supabase: SupaLike,
  instructorId: string,
  operatorId: string,
  projectId: string,
  threshold: number = 3.0,
): Promise<EmitResult | null> {
  const { data: reviews, error } = await supabase
    .from("satisfaction_reviews")
    .select("score")
    .eq("instructor_id", instructorId);

  if (error) {
    console.warn("[notify.trigger] low-satisfaction query failed", error);
    return null;
  }

  const rows = (reviews ?? []) as ReviewRow[];
  if (rows.length === 0) return null; // prior 미적용
  const avg = rows.reduce((s, r) => s + Number(r.score), 0) / rows.length;
  if (avg >= threshold) return null;

  let instructorName = "강사";
  const { data: ins } = await supabase
    .from("instructors")
    .select("id, name_kr")
    .eq("id", instructorId)
    .maybeSingle();
  if (ins) instructorName = (ins as InstructorRow).name_kr ?? instructorName;

  const meanStr = avg.toFixed(2);
  const r = await emitNotification(supabase, {
    recipientId: operatorId,
    type: "low_satisfaction_assignment",
    title: "만족도 낮은 강사 배정",
    body: `강사 ${instructorName}의 평균 만족도가 ${meanStr}/5입니다. 배정을 재검토하세요.`,
    linkUrl: `/projects/${projectId}`,
    dedupKey: `lowsat:operator:${operatorId}:project:${projectId}`,
    logContext: `recipient_id=${operatorId} instructor_id=${instructorId} project_id=${projectId} avg=${meanStr}`,
  });
  return r;
}
