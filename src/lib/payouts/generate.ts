// @MX:ANCHOR: SPEC-PAYOUT-002 §M5 REQ-PAYOUT002-GENERATE-003 — 정산 일괄 생성 핵심 로직.
// @MX:REASON: settlements + settlement_sessions의 단일 INSERT 통로. fan_in 예상 ≥ 3 (route + Server Action + 테스트).
// @MX:WARN: GENERATED 컬럼(profit_krw, withholding_tax_amount_krw)을 INSERT 페이로드에 포함하지 말 것.
// @MX:REASON: settlements 테이블의 두 컬럼은 GENERATED ALWAYS — 직접 INSERT 시 DB 에러.
// @MX:WARN: 동시 generate race-condition은 settlement_sessions(lecture_session_id) UNIQUE INDEX가 차단.
// @MX:REASON: application-layer NOT IN 만으로는 READ COMMITTED 격리에서 race를 막을 수 없다 (REQ-LINK-006).

import {
  calculateBusinessAmount,
  calculateInstructorFee,
  calculateInstructorFeePerHour,
  calculateTotalBilledHours,
} from "./calculator";
import { PAYOUT_ERRORS } from "./errors";
import type { SettlementFlow } from "./types";
import { listUnbilledCompletedSessions } from "../sessions/queries";
import { SESSION_ERRORS } from "../sessions/errors";
import type { LectureSession } from "../sessions/types";

/** Supabase client (Database 제네릭 회피용 최소 시그니처). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

/** 프로젝트 메타데이터 (settlement_flow_hint + 산식 입력값). */
interface ProjectMeta {
  id: string;
  instructor_id: string | null;
  hourly_rate_krw: number;
  instructor_share_pct: number | string;
  settlement_flow_hint: string | null;
}

/** 미리보기 row — UI에 표시 + 운영자가 flow override 가능. */
export interface SettlementPreviewRow {
  project_id: string;
  instructor_id: string | null;
  total_hours: number;
  business_amount_krw: number;
  instructor_fee_per_hour: number;
  instructor_fee_krw: number;
  default_flow: SettlementFlow | null; // null이면 운영자가 선택 필요
  session_ids: string[];
}

/** 운영자 입력 — 기간 + 옵션 필터 + flow override. */
export interface GenerateInput {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  projectIds?: readonly string[];
  /** project_id → flow 매핑 (운영자가 미리보기 단계에서 선택). default_flow가 있는 프로젝트는 생략 가능. */
  flowOverrides?: Readonly<Record<string, SettlementFlow>>;
  /** project_id → withholding tax rate 매핑 (government일 때 운영자가 3.30 또는 8.80 선택). */
  taxRateOverrides?: Readonly<Record<string, number>>;
}

export interface GenerateResult {
  ok: boolean;
  error?: string;
  createdCount: number;
  linkedCount: number;
  /** UNIQUE 위반으로 거절된 세션 ids (race-condition 회복용). */
  rejectedSessionIds?: string[];
}

/**
 * 미리보기 데이터 빌드 — UI가 호출하여 운영자에게 보여줌.
 * INSERT는 수행하지 않음.
 */
export async function buildSettlementPreview(
  supabase: SupaLike,
  input: GenerateInput,
): Promise<{
  rows: SettlementPreviewRow[];
  unbilledCount: number;
  projectCount: number;
}> {
  const sessions = await listUnbilledCompletedSessions(supabase, {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    projectIds: input.projectIds,
  });
  if (sessions.length === 0) {
    return { rows: [], unbilledCount: 0, projectCount: 0 };
  }

  const projectIds = Array.from(new Set(sessions.map((s) => s.project_id)));
  const projects = await fetchProjectMetas(supabase, projectIds);

  const rows = groupAndCompute(sessions, projects);
  return {
    rows,
    unbilledCount: sessions.length,
    projectCount: rows.length,
  };
}

/**
 * 정산 일괄 생성 (REQ-PAYOUT002-GENERATE-003).
 *
 * 단계:
 *   1) 미청구 세션 + 프로젝트 메타 fetch
 *   2) 프로젝트별 그룹 → 산식 적용
 *   3) 각 그룹마다 settlements INSERT + settlement_sessions INSERT (atomic per group)
 *
 * Supabase client는 multi-statement transaction을 직접 지원하지 않으므로
 * 그룹별 atomic 보장: settlement INSERT 후 junction INSERT가 실패하면 settlement는 보상 (best-effort 삭제).
 *
 * UNIQUE INDEX (REQ-LINK-006) 위반 시 SQLSTATE 23505 발생 — application은 한국어 ALREADY_BILLED 반환.
 */
export async function generateSettlementsForPeriod(
  supabase: SupaLike,
  input: GenerateInput,
): Promise<GenerateResult> {
  const sessions = await listUnbilledCompletedSessions(supabase, {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    projectIds: input.projectIds,
  });

  if (sessions.length === 0) {
    return {
      ok: false,
      error: SESSION_ERRORS.NO_UNBILLED_SESSIONS,
      createdCount: 0,
      linkedCount: 0,
    };
  }

  const projectIds = Array.from(new Set(sessions.map((s) => s.project_id)));
  const projects = await fetchProjectMetas(supabase, projectIds);
  const previewRows = groupAndCompute(sessions, projects);

  let createdCount = 0;
  let linkedCount = 0;
  const rejected: string[] = [];

  for (const row of previewRows) {
    // flow 결정: override 우선, 없으면 project hint, 둘 다 없으면 에러
    const flow: SettlementFlow | undefined =
      input.flowOverrides?.[row.project_id] ??
      (row.default_flow ?? undefined);
    if (!flow) {
      return {
        ok: false,
        error: `프로젝트 ${row.project_id}의 정산 흐름(corporate/government)이 지정되지 않았습니다.`,
        createdCount,
        linkedCount,
      };
    }

    // tax rate 결정: corporate=0, government는 override 우선 (3.30 또는 8.80)
    const taxRate =
      flow === "corporate"
        ? 0
        : (input.taxRateOverrides?.[row.project_id] ?? 3.3);

    if (!row.instructor_id) {
      return {
        ok: false,
        error: `프로젝트 ${row.project_id}에 강사가 배정되지 않아 정산을 생성할 수 없습니다.`,
        createdCount,
        linkedCount,
      };
    }

    // settlements INSERT (GENERATED 컬럼 제외 — REQ-PAYOUT002-GENERATE-004)
    const insertPayload = {
      project_id: row.project_id,
      instructor_id: row.instructor_id,
      settlement_flow: flow,
      status: "pending",
      business_amount_krw: row.business_amount_krw,
      instructor_fee_krw: row.instructor_fee_krw,
      withholding_tax_rate: taxRate,
    };
    const { data: settlementRow, error: insErr } = await supabase
      .from("settlements")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr) {
      return {
        ok: false,
        error: insErr.message ?? PAYOUT_ERRORS.GENERIC_FAILED,
        createdCount,
        linkedCount,
      };
    }
    const settlementId = (settlementRow as { id: string }).id;
    createdCount++;

    // settlement_sessions junction INSERT (UNIQUE 위반 가능)
    const linkPayload = row.session_ids.map((sid) => ({
      settlement_id: settlementId,
      lecture_session_id: sid,
    }));
    const { data: linkRows, error: linkErr } = await supabase
      .from("settlement_sessions")
      .insert(linkPayload)
      .select("lecture_session_id");

    if (linkErr) {
      // UNIQUE 위반 (SQLSTATE 23505) → 보상: settlement 행 삭제 후 한국어 에러
      const code = (linkErr as { code?: string }).code;
      const isUniqueViolation =
        code === "23505" ||
        (linkErr.message ?? "").toLowerCase().includes("unique");
      // best-effort 보상 — settlement 삭제 (RLS 허용 시에만)
      await supabase.from("settlements").delete().eq("id", settlementId);
      createdCount = Math.max(0, createdCount - 1);
      if (isUniqueViolation) {
        rejected.push(...row.session_ids);
        return {
          ok: false,
          error: SESSION_ERRORS.ALREADY_BILLED,
          createdCount,
          linkedCount,
          rejectedSessionIds: rejected,
        };
      }
      return {
        ok: false,
        error: linkErr.message ?? PAYOUT_ERRORS.GENERIC_FAILED,
        createdCount,
        linkedCount,
      };
    }
    linkedCount += Array.isArray(linkRows) ? linkRows.length : 0;
  }

  return { ok: true, createdCount, linkedCount };
}

// =============================================================================
// 내부 헬퍼
// =============================================================================

async function fetchProjectMetas(
  supabase: SupaLike,
  projectIds: readonly string[],
): Promise<Map<string, ProjectMeta>> {
  if (projectIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, instructor_id, hourly_rate_krw, instructor_share_pct, settlement_flow_hint",
    )
    .in("id", projectIds);
  if (error) {
    console.error("[payouts.generate.fetchProjectMetas] failed", error);
    return new Map();
  }
  const map = new Map<string, ProjectMeta>();
  for (const p of (data ?? []) as ProjectMeta[]) {
    map.set(p.id, p);
  }
  return map;
}

/**
 * 세션 → 프로젝트별 그룹 + 산식 적용.
 * 본 함수는 순수 함수로 분리되어 단위 테스트 가능.
 */
export function groupAndCompute(
  sessions: readonly LectureSession[],
  projects: ReadonlyMap<string, ProjectMeta>,
): SettlementPreviewRow[] {
  const groups = new Map<string, LectureSession[]>();
  for (const s of sessions) {
    const arr = groups.get(s.project_id) ?? [];
    arr.push(s);
    groups.set(s.project_id, arr);
  }

  const rows: SettlementPreviewRow[] = [];
  for (const [projectId, groupSessions] of groups) {
    const meta = projects.get(projectId);
    if (!meta) continue; // skip if project not found (should not happen)
    const sharePct = Number(meta.instructor_share_pct);
    const totalHours = calculateTotalBilledHours(groupSessions);
    const feePerHour = calculateInstructorFeePerHour(
      meta.hourly_rate_krw,
      sharePct,
    );
    const businessAmount = calculateBusinessAmount(
      meta.hourly_rate_krw,
      totalHours,
    );
    const instructorFee = calculateInstructorFee(feePerHour, totalHours);

    const defaultFlow = isValidFlow(meta.settlement_flow_hint)
      ? (meta.settlement_flow_hint as SettlementFlow)
      : null;

    rows.push({
      project_id: projectId,
      instructor_id: meta.instructor_id,
      total_hours: totalHours,
      business_amount_krw: businessAmount,
      instructor_fee_per_hour: feePerHour,
      instructor_fee_krw: instructorFee,
      default_flow: defaultFlow,
      session_ids: groupSessions.map((s) => s.id),
    });
  }
  return rows;
}

function isValidFlow(value: string | null): boolean {
  return value === "corporate" || value === "government";
}
