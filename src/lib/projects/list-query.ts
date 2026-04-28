// SPEC-PROJECT-001 §2.1 REQ-PROJECT-LIST-001~007 — 리스트 검색·필터·페이지네이션 query 파서.
// @MX:NOTE: URL searchParams → 정규화된 ListQuery 변환. 순수 함수로 단위 테스트 가능.

import { z } from "zod";
import type { ProjectStatus } from "../projects";

export const PROJECT_PAGE_SIZE = 20;

export const PROJECT_SORT_KEYS = ["created_at", "scheduled_at", "education_start_at", "status"] as const;
export type ProjectSortKey = (typeof PROJECT_SORT_KEYS)[number];

export const PROJECT_SORT_ORDERS = ["asc", "desc"] as const;
export type ProjectSortOrder = (typeof PROJECT_SORT_ORDERS)[number];

const ALL_STATUSES: ProjectStatus[] = [
  "proposal",
  "contract_confirmed",
  "lecture_requested",
  "instructor_sourcing",
  "assignment_review",
  "assignment_confirmed",
  "education_confirmed",
  "recruiting",
  "progress_confirmed",
  "in_progress",
  "education_done",
  "settlement_in_progress",
  "task_done",
];

const STATUS_SET = new Set<ProjectStatus>(ALL_STATUSES);

export interface ProjectListQuery {
  q: string | null;
  status: ProjectStatus[];
  operatorId: string | null;
  clientId: string | null;
  startFrom: string | null; // ISO date (YYYY-MM-DD)
  startTo: string | null;
  sort: ProjectSortKey;
  order: ProjectSortOrder;
  page: number; // 1-based
  pageSize: number;
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
const uuidSchema = z.string().uuid();

/** searchParams → ProjectListQuery. 잘못된 값은 무시 (기본값 사용). */
export function parseProjectListQuery(
  raw: Record<string, string | string[] | undefined>,
): ProjectListQuery {
  const getOne = (k: string): string | null => {
    const v = raw[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const getMany = (k: string): string[] => {
    const v = raw[k];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.length > 0);
    if (typeof v === "string" && v.length > 0) return v.split(",").filter(Boolean);
    return [];
  };

  const q = getOne("q");
  const status = getMany("status").filter((s): s is ProjectStatus =>
    STATUS_SET.has(s as ProjectStatus),
  );

  const operatorIdRaw = getOne("operatorId") ?? getOne("operator_id");
  const operatorId = operatorIdRaw && uuidSchema.safeParse(operatorIdRaw).success
    ? operatorIdRaw
    : null;

  const clientIdRaw = getOne("clientId") ?? getOne("client_id");
  const clientId = clientIdRaw && uuidSchema.safeParse(clientIdRaw).success
    ? clientIdRaw
    : null;

  const startFromRaw = getOne("startFrom") ?? getOne("start_from");
  const startFrom = startFromRaw && isoDateRe.test(startFromRaw) ? startFromRaw : null;

  const startToRaw = getOne("startTo") ?? getOne("start_to");
  const startTo = startToRaw && isoDateRe.test(startToRaw) ? startToRaw : null;

  const sortRaw = getOne("sort");
  const sort: ProjectSortKey = (PROJECT_SORT_KEYS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as ProjectSortKey)
    : "scheduled_at";

  const orderRaw = getOne("order");
  const order: ProjectSortOrder = orderRaw === "asc" ? "asc" : "desc";

  const pageRaw = Number.parseInt(getOne("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    q,
    status,
    operatorId,
    clientId,
    startFrom,
    startTo,
    sort,
    order,
    page,
    pageSize: PROJECT_PAGE_SIZE,
  };
}

/** 현재 query → URL 쿼리 문자열. 빈/기본 값은 omit. */
export function serializeProjectListQuery(q: Partial<ProjectListQuery>): string {
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.status && q.status.length > 0) params.set("status", q.status.join(","));
  if (q.operatorId) params.set("operatorId", q.operatorId);
  if (q.clientId) params.set("clientId", q.clientId);
  if (q.startFrom) params.set("startFrom", q.startFrom);
  if (q.startTo) params.set("startTo", q.startTo);
  if (q.sort && q.sort !== "scheduled_at") params.set("sort", q.sort);
  if (q.order && q.order !== "desc") params.set("order", q.order);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  return params.toString();
}

/** 페이지네이션 메타. total 0 일 때 totalPages = 1 (첫 페이지 표시). */
export function computePagination(
  total: number,
  page: number,
  pageSize: number = PROJECT_PAGE_SIZE,
): {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  rangeStart: number; // 0-based offset
  rangeEnd: number; // exclusive
  isFirst: boolean;
  isLast: boolean;
  needsRedirect: boolean; // page > totalPages 일 때 true
} {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const needsRedirect = page > totalPages;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = (safePage - 1) * pageSize;
  const rangeEnd = Math.min(rangeStart + pageSize, total);
  return {
    page: safePage,
    totalPages,
    total,
    pageSize,
    rangeStart,
    rangeEnd,
    isFirst: safePage === 1,
    isLast: safePage === totalPages,
    needsRedirect,
  };
}
