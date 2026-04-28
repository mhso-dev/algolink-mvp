// SPEC-NOTIFY-001 §M3 — dday_unprocessed 트리거.
// @MX:NOTE: lazy 검사 — 정산 7일 미처리 + 의뢰 7일 미배정 → operator에게 emit.

import { emitNotification } from "../emit";
import type { EmitResult } from "../emit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

export interface CheckDdayOpts {
  settlementDays?: number;
  projectDays?: number;
}

interface SettlementRow {
  id: string;
  requested_at: string | null;
  operator_id: string | null;
  project_title: string | null;
}

interface ProjectRow {
  id: string;
  title: string | null;
  operator_id: string | null;
  created_at: string;
}

export async function checkDdayUnprocessed(
  supabase: SupaLike,
  opts: CheckDdayOpts = {},
): Promise<EmitResult[]> {
  const settlementDays = opts.settlementDays ?? 7;
  const projectDays = opts.projectDays ?? 7;
  const settlementSince = new Date(Date.now() - settlementDays * 86400 * 1000).toISOString();
  const projectSince = new Date(Date.now() - projectDays * 86400 * 1000).toISOString();

  const results: EmitResult[] = [];

  // 1) 정산 D+7 미처리
  const { data: settlements, error: sErr } = await supabase
    .from("settlements")
    .select("id, requested_at, operator_id, project_title")
    .eq("status", "requested")
    .lt("requested_at", settlementSince);
  if (sErr) {
    console.warn("[notify.trigger] dday settlements query failed", sErr);
  } else {
    for (const s of (settlements ?? []) as SettlementRow[]) {
      if (!s.operator_id) continue;
      const r = await emitNotification(supabase, {
        recipientId: s.operator_id,
        type: "dday_unprocessed",
        title: "D-Day 미처리 항목",
        body: `정산 요청 「${s.project_title ?? s.id}」이(가) ${settlementDays}일 이상 미처리 상태입니다.`,
        linkUrl: `/settlements/${s.id}`,
        dedupKey: `dday:settlement:${s.id}`,
        logContext: `recipient_id=${s.operator_id} settlement_id=${s.id}`,
      });
      results.push(r);
    }
  }

  // 2) 의뢰 D+7 미배정
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, title, operator_id, created_at")
    .eq("status", "proposal")
    .lt("created_at", projectSince);
  if (pErr) {
    console.warn("[notify.trigger] dday projects query failed", pErr);
  } else {
    for (const p of (projects ?? []) as ProjectRow[]) {
      if (!p.operator_id) continue;
      const r = await emitNotification(supabase, {
        recipientId: p.operator_id,
        type: "dday_unprocessed",
        title: "D-Day 미처리 항목",
        body: `의뢰 「${p.title ?? p.id}」이(가) ${projectDays}일 이상 배정되지 않았습니다.`,
        linkUrl: `/projects/${p.id}`,
        dedupKey: `dday:project:${p.id}`,
        logContext: `recipient_id=${p.operator_id} project_id=${p.id}`,
      });
      results.push(r);
    }
  }

  return results;
}
