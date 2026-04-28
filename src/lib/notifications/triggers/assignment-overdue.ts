// SPEC-NOTIFY-001 §M3 — assignment_overdue 트리거.
// @MX:NOTE: 배정 요청 후 24h 경과 + 강사 미응답 프로젝트 검출 → operator에게 lazy emit.

import { emitNotification } from "../emit";
import type { EmitResult } from "../emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface CheckAssignmentOverdueOpts {
  hoursThreshold?: number;
}

interface OverdueRow {
  id: string;
  title: string | null;
  operator_id: string | null;
  updated_at: string;
}

export async function checkAssignmentOverdue(
  supabase: SupaLike,
  opts: CheckAssignmentOverdueOpts = {},
): Promise<EmitResult[]> {
  const hours = opts.hoursThreshold ?? 24;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("projects")
    .select("id, title, operator_id, updated_at")
    .eq("status", "assignment_review")
    .not("instructor_id", "is", null)
    .lt("updated_at", since);

  if (error) {
    console.warn("[notify.trigger] assignment-overdue query failed", error);
    return [];
  }

  const rows = (data ?? []) as OverdueRow[];
  const results: EmitResult[] = [];
  for (const p of rows) {
    if (!p.operator_id) continue;
    const r = await emitNotification(supabase, {
      recipientId: p.operator_id,
      type: "assignment_overdue",
      title: "배정 요청 응답 지연",
      body: `프로젝트 「${p.title ?? "제목 없음"}」의 강사 응답이 ${hours}시간 이상 지연되고 있습니다.`,
      linkUrl: `/projects/${p.id}`,
      dedupKey: `overdue:project:${p.id}`,
      logContext: `recipient_id=${p.operator_id} project_id=${p.id}`,
    });
    results.push(r);
  }
  return results;
}
