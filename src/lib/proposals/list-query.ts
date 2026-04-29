// SPEC-PROPOSAL-001 §M3 REQ-PROPOSAL-LIST-* — URL 파라미터 → ListQuery 정규화 + 페이지 메타.
// 순수 함수만 export — 단위 테스트 가능.
import type { ProposalStatus } from "./types";
import { PROPOSAL_STATUSES } from "./types";

export const PROPOSAL_PAGE_SIZE = 20;
const SEARCH_MAX_LENGTH = 100;

export interface ProposalListQuery {
  q: string | null;
  statuses: readonly ProposalStatus[];
  clientId: string | null;
  periodFrom: string | null; // YYYY-MM-DD
  periodTo: string | null;
  page: number;
  pageSize: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** searchParams → ProposalListQuery. 잘못된 값은 기본값으로 정규화. */
export function parseProposalsQuery(
  raw: Record<string, string | string[] | undefined>,
): ProposalListQuery {
  const getOne = (k: string): string | null => {
    const v = raw[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const qRaw = getOne("q");
  const qTrimmed = qRaw?.trim() ?? "";
  const q = qTrimmed.length > 0 ? qTrimmed.slice(0, SEARCH_MAX_LENGTH) : null;

  // status — comma-separated multi-select
  const statusRaw = getOne("status");
  const statuses: ProposalStatus[] = [];
  if (statusRaw) {
    for (const s of statusRaw.split(",")) {
      const trimmed = s.trim();
      if ((PROPOSAL_STATUSES as readonly string[]).includes(trimmed)) {
        statuses.push(trimmed as ProposalStatus);
      }
    }
  }

  const clientIdRaw = getOne("client_id");
  const clientId = clientIdRaw && UUID_RE.test(clientIdRaw) ? clientIdRaw : null;

  const periodFromRaw = getOne("period_from");
  const periodFrom =
    periodFromRaw && ISO_DATE_RE.test(periodFromRaw) ? periodFromRaw : null;
  const periodToRaw = getOne("period_to");
  const periodTo =
    periodToRaw && ISO_DATE_RE.test(periodToRaw) ? periodToRaw : null;

  const pageRaw = Number.parseInt(getOne("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    q,
    statuses,
    clientId,
    periodFrom,
    periodTo,
    page,
    pageSize: PROPOSAL_PAGE_SIZE,
  };
}

export interface ProposalPageMeta {
  total: number;
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  isFirst: boolean;
  isLast: boolean;
  needsRedirect: boolean;
  pageSize: number;
}

/** 페이지네이션 메타 계산 (REQ-PROPOSAL-LIST-005). */
export function buildProposalPageMeta(
  total: number,
  page: number,
  pageSize: number = PROPOSAL_PAGE_SIZE,
): ProposalPageMeta {
  if (total <= 0) {
    return {
      total: 0,
      page: 1,
      totalPages: 0,
      rangeStart: 0,
      rangeEnd: 0,
      isFirst: true,
      isLast: true,
      needsRedirect: false,
      pageSize,
    };
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const needsRedirect = page > totalPages;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);
  return {
    total,
    page: safePage,
    totalPages,
    rangeStart,
    rangeEnd,
    isFirst: safePage === 1,
    isLast: safePage === totalPages,
    needsRedirect,
    pageSize,
  };
}

/** raw q → ILIKE 안전 패턴 (%escaped%). null이면 미적용. */
export function buildProposalSearchPattern(
  rawQuery: string | null,
): string | null {
  if (!rawQuery) return null;
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) return null;
  const capped =
    trimmed.length > SEARCH_MAX_LENGTH
      ? trimmed.slice(0, SEARCH_MAX_LENGTH)
      : trimmed;
  const escaped = capped
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}
