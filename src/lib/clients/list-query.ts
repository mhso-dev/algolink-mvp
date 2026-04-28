// SPEC-CLIENT-001 §2.2 REQ-CLIENT001-LIST-* — URL 파라미터 → ListQuery 정규화 + 페이지 메타.
// @MX:NOTE: 순수 함수만 export. 단위 테스트 가능.

export const CLIENT_PAGE_SIZE = 20;
const SEARCH_MAX_LENGTH = 100;

export interface ClientListQuery {
  q: string | null;
  page: number;
  pageSize: number;
}

/** searchParams → ClientListQuery. 잘못된 값은 기본값으로 정규화. */
export function parseClientsQuery(
  raw: Record<string, string | string[] | undefined>,
): ClientListQuery {
  const getOne = (k: string): string | null => {
    const v = raw[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  const qRaw = getOne("q");
  const qTrimmed = qRaw?.trim() ?? "";
  const q = qTrimmed.length > 0 ? qTrimmed.slice(0, SEARCH_MAX_LENGTH) : null;

  const pageRaw = Number.parseInt(getOne("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, page, pageSize: CLIENT_PAGE_SIZE };
}

export interface ClientPageMeta {
  total: number;
  page: number;
  totalPages: number;
  rangeStart: number; // 1-based 표시용 (0건일 땐 0)
  rangeEnd: number;
  isFirst: boolean;
  isLast: boolean;
  needsRedirect: boolean;
  pageSize: number;
}

/** 페이지네이션 메타 계산. */
export function buildPageMeta(
  total: number,
  page: number,
  pageSize: number = CLIENT_PAGE_SIZE,
): ClientPageMeta {
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

/**
 * raw q → ILIKE 안전 패턴 (`%escaped%`). null이면 검색 미적용.
 * @MX:NOTE: PostgREST ilike의 %/_/\ 메타문자 escape.
 */
export function buildClientSearchPattern(rawQuery: string | null): string | null {
  if (!rawQuery) return null;
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) return null;
  const capped = trimmed.length > SEARCH_MAX_LENGTH ? trimmed.slice(0, SEARCH_MAX_LENGTH) : trimmed;
  const escaped = capped
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}
