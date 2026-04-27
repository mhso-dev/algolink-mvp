import "server-only";
// @MX:ANCHOR: SPEC-DASHBOARD-001 §M2 — 대시보드 read 쿼리 단일 진입점.
// @MX:REASON: KPI / 칸반 / 캘린더 / 알림 모든 Server Component가 본 모듈을 호출.
// @MX:SPEC: SPEC-DASHBOARD-001
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { clients } from "@/db/schema/client";
import { instructors } from "@/db/schema/instructor";
import { scheduleItems } from "@/db/schema/schedule";
import type { ProjectStatus } from "@/lib/projects";
import {
  DASHBOARD_COLUMNS,
  STATUS_COLUMN_MAP,
  statusToDashboardColumn,
  type DashboardColumnLabel,
  type KpiSummary,
  type NotificationPreview,
  type ProjectKanbanRow,
  type ScheduleEvent,
} from "./types";
import {
  canTransition as canTransitionRule,
} from "./transitions";

/** 컬럼당 LIMIT (운영 데이터 100건 초과 시 "더 보기" 링크로 위임). */
export const KANBAN_LIMIT_PER_QUERY = 500;

/**
 * KPI 4종을 단일 SQL aggregate 로 계산 (REQ-DASH-KPI-002).
 *
 * 의뢰 = '의뢰' 컬럼 묶음 status 합 (proposal / contract_confirmed / lecture_requested)
 * 배정확정 = 컨펌 컬럼 묶음 (assignment_confirmed / education_confirmed / recruiting)
 * 교육중 = 진행 컬럼 묶음 (progress_confirmed / in_progress)
 * 미정산 합계 = settlements.business_amount_krw 합 where status <> 'paid' (deleted_at IS NULL)
 */
export async function getKpiSummary(): Promise<KpiSummary> {
  const requestStatuses = STATUS_COLUMN_MAP["의뢰"] as readonly ProjectStatus[];
  const confirmedStatuses = STATUS_COLUMN_MAP["컨펌"] as readonly ProjectStatus[];
  const inProgressStatuses = STATUS_COLUMN_MAP["진행"] as readonly ProjectStatus[];

  // 단일 round-trip aggregate.
  const rows = await db.execute<{
    request_count: string;
    confirmed_count: string;
    in_progress_count: string;
    unsettled_total: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE p.status IN ${sql`(${sql.join(requestStatuses.map((s) => sql`${s}::project_status`), sql`, `)})`} AND p.deleted_at IS NULL) AS request_count,
      COUNT(*) FILTER (WHERE p.status IN ${sql`(${sql.join(confirmedStatuses.map((s) => sql`${s}::project_status`), sql`, `)})`} AND p.deleted_at IS NULL) AS confirmed_count,
      COUNT(*) FILTER (WHERE p.status IN ${sql`(${sql.join(inProgressStatuses.map((s) => sql`${s}::project_status`), sql`, `)})`} AND p.deleted_at IS NULL) AS in_progress_count,
      COALESCE((
        SELECT SUM(s.business_amount_krw)::bigint
        FROM public.settlements s
        WHERE s.status <> 'paid' AND s.deleted_at IS NULL
      ), 0)::text AS unsettled_total
    FROM public.projects p
  `);

  // drizzle-orm execute on postgres-js returns array-like rows.
  const r = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0]) as
    | {
        request_count: string | number;
        confirmed_count: string | number;
        in_progress_count: string | number;
        unsettled_total: string | number;
      }
    | undefined;
  if (!r) {
    return { requestCount: 0, confirmedCount: 0, inProgressCount: 0, unsettledTotal: 0 };
  }
  return {
    requestCount: Number(r.request_count) || 0,
    confirmedCount: Number(r.confirmed_count) || 0,
    inProgressCount: Number(r.in_progress_count) || 0,
    unsettledTotal: Number(r.unsettled_total) || 0,
  };
}

/**
 * 칸반 5컬럼 데이터 — 단일 쿼리 + 메모리 그룹화.
 * activeColumns가 비어있으면 5컬럼 모두 조회. 일부만 주어지면 해당 컬럼의 status enum만 IN.
 */
export async function getProjectsByStatus(
  activeColumns: readonly DashboardColumnLabel[] = [],
): Promise<Map<DashboardColumnLabel, ProjectKanbanRow[]>> {
  const cols = activeColumns.length > 0 ? activeColumns : DASHBOARD_COLUMNS;
  const statusList = cols.flatMap((c) => STATUS_COLUMN_MAP[c]) as ProjectStatus[];

  const t0 = Date.now();
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      educationStartAt: projects.educationStartAt,
      educationEndAt: projects.educationEndAt,
      scheduledAt: projects.scheduledAt,
      businessAmountKrw: projects.businessAmountKrw,
      clientId: projects.clientId,
      clientName: clients.companyName,
      instructorName: instructors.nameKr,
    })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(instructors, eq(instructors.id, projects.instructorId))
    .where(
      and(
        sql`${projects.deletedAt} IS NULL`,
        statusList.length > 0 ? inArray(projects.status, statusList as ProjectStatus[]) : sql`TRUE`,
      ),
    )
    .orderBy(sql`${projects.updatedAt} DESC`)
    .limit(KANBAN_LIMIT_PER_QUERY);
  const elapsed = Date.now() - t0;
  if (elapsed > 1000) {
    // REQ-DASH-DATA-005: 1초 초과 시 워닝.
    console.warn(`[dashboard.queries] getProjectsByStatus took ${elapsed}ms`);
  }

  const grouped = new Map<DashboardColumnLabel, ProjectKanbanRow[]>();
  for (const c of DASHBOARD_COLUMNS) grouped.set(c, []);
  for (const r of rows) {
    const col = statusToDashboardColumn(r.status as ProjectStatus);
    const arr = grouped.get(col);
    if (!arr) continue;
    arr.push({
      id: r.id,
      title: r.title,
      status: r.status as ProjectStatus,
      startDate: r.educationStartAt ? new Date(r.educationStartAt as unknown as string).toISOString() : null,
      endDate: r.educationEndAt ? new Date(r.educationEndAt as unknown as string).toISOString() : null,
      scheduledAt: (r.scheduledAt as unknown as string | null) ?? null,
      clientId: r.clientId ?? null,
      clientName: r.clientName ?? null,
      instructorName: r.instructorName ?? null,
      businessAmountKrw: Number(r.businessAmountKrw ?? 0),
    });
  }
  return grouped;
}

/**
 * 캘린더용 일정 — system_lecture 종류만, 컨펌/진행 단계 프로젝트 한정.
 */
export async function getInstructorScheduleRange(
  from: Date,
  to: Date,
): Promise<ScheduleEvent[]> {
  const calendarStatuses = [
    ...STATUS_COLUMN_MAP["컨펌"],
    ...STATUS_COLUMN_MAP["진행"],
  ] as ProjectStatus[];

  const t0 = Date.now();
  const rows = await db
    .select({
      id: scheduleItems.id,
      instructorId: scheduleItems.instructorId,
      instructorName: instructors.nameKr,
      projectId: scheduleItems.projectId,
      projectTitle: projects.title,
      startsAt: scheduleItems.startsAt,
      endsAt: scheduleItems.endsAt,
      kind: scheduleItems.scheduleKind,
      projectStatus: projects.status,
    })
    .from(scheduleItems)
    .leftJoin(instructors, eq(instructors.id, scheduleItems.instructorId))
    .leftJoin(projects, eq(projects.id, scheduleItems.projectId))
    .where(
      and(
        eq(scheduleItems.scheduleKind, "system_lecture"),
        gte(scheduleItems.startsAt, from),
        lt(scheduleItems.startsAt, to),
      ),
    )
    .orderBy(sql`${scheduleItems.startsAt} ASC`)
    .limit(500);
  const elapsed = Date.now() - t0;
  if (elapsed > 1000) {
    console.warn(`[dashboard.queries] getInstructorScheduleRange took ${elapsed}ms`);
  }

  return rows
    .filter((r) =>
      r.projectStatus
        ? calendarStatuses.includes(r.projectStatus as ProjectStatus)
        : false,
    )
    .map((r) => ({
      id: r.id,
      instructorId: r.instructorId,
      instructorName: r.instructorName ?? "강사 미상",
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      startsAt: new Date(r.startsAt as unknown as string).toISOString(),
      endsAt: new Date(r.endsAt as unknown as string).toISOString(),
    }));
}

/**
 * 알림 미리보기 (REQ-DASH-NOTIFY-002) — placeholder.
 * SPEC-NOTIF-001 구현 시 본 함수 body만 교체. 시그니처/타입 변경 금지.
 */
export async function getNotificationPreview(
  _operatorId: string,
  _limit: number = 5,
): Promise<NotificationPreview> {
  return {
    unanswered: 0,
    conflict: 0,
    deadline: 0,
    updatedAt: null,
  };
}

/**
 * SPEC-NOTIF-001 후속을 위한 시그니처 lock alias.
 * 미리 export 해둠으로써 호출처가 본 alias만 import 하면 본문 swap 시 변경 0 보장.
 */
export const getRecentNotifications = getNotificationPreview;

/**
 * 상태 전환 도메인 함수.
 * - canTransition 가드
 * - optimistic concurrency: WHERE id AND status = fromStatus
 */
export async function transitionProjectStatus(
  projectId: string,
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus,
): Promise<
  | { ok: true }
  | { ok: false; reason: "forbidden_transition" | "concurrent_modified" | "rls_denied" }
> {
  if (!canTransitionRule(fromStatus, toStatus)) {
    return { ok: false, reason: "forbidden_transition" };
  }
  try {
    const updated = await db
      .update(projects)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.status, fromStatus)))
      .returning({ id: projects.id });
    if (updated.length === 0) {
      return { ok: false, reason: "concurrent_modified" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[dashboard.queries] transitionProjectStatus failed", e);
    return { ok: false, reason: "rls_denied" };
  }
}
