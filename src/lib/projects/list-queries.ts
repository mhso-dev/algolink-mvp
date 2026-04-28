// SPEC-PROJECT-001 §2.1 + SPEC-PROJECT-SEARCH-001 — 프로젝트 리스트 Supabase 쿼리 빌더.
// @MX:NOTE: ProjectListQuery → Supabase select chain. 페이지 카운트 + 결과 분리.
// @MX:NOTE: q 검색은 title + notes + clients.company_name 3개 컬럼 OR. clients 는 별도 1차 조회로
//          ID 집합을 구해 projects.client_id.in 으로 결합 — PostgREST cross-table .or() 의
//          취약성을 피하면서 동일한 의미를 보장한다.

import type { ProjectStatus } from "../projects";
import type { ProjectListQuery } from "./list-query";

export interface ProjectListRow {
  id: string;
  title: string;
  status: ProjectStatus;
  scheduled_at: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  instructor_fee_krw: number;
  margin_krw: number | null;
  client_id: string;
  instructor_id: string | null;
  operator_id: string | null;
  created_at: string;
}

const SELECT_COLUMNS =
  "id, title, status, scheduled_at, education_start_at, education_end_at, business_amount_krw, instructor_fee_krw, margin_krw, client_id, instructor_id, operator_id, created_at";

const SEARCH_MAX_LENGTH = 100;

// @MX:ANCHOR: q 입력을 SQL LIKE 안전 패턴으로 변환. fan_in 예상 ≥ 3 (list page,
// 향후 project picker, settlement picker). 변경 시 호출자 전체 검색 회귀 영향.
// @MX:REASON: PostgREST ilike 는 % 와 _ 를 와일드카드로 해석하므로 사용자가 입력한
//             literal % / _ / \ 를 escape 해야 부분 일치 의미가 안전하게 유지된다.
//             또한 빈/공백/과도한 길이 입력은 DB 부하·악용을 방지하기 위해 정규화한다.
/**
 * raw q → `%escaped%` ILIKE 패턴 또는 null.
 * - trim 후 빈 문자열이면 null (검색 미적용)
 * - 100자 초과 시 100자로 절단
 * - LIKE 메타문자 (%, _, \\) 를 backslash 로 escape
 */
export function buildSearchClause(rawQuery: string | null | undefined): string | null {
  if (rawQuery == null) return null;
  const trimmed = rawQuery.trim();
  if (trimmed.length === 0) return null;
  const capped = trimmed.length > SEARCH_MAX_LENGTH ? trimmed.slice(0, SEARCH_MAX_LENGTH) : trimmed;
  // backslash 먼저 escape (이후 % / _ escape 시 추가되는 backslash 와 충돌 방지)
  const escaped = capped
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}

/** 필터 + 페이지네이션 적용된 프로젝트 리스트 + total 카운트. */
export async function fetchProjectList(
  // 다양한 Database 제네릭과 호환되도록 SupabaseClient 의 from 만 사용 — any 캐스트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  query: ProjectListQuery,
): Promise<{ rows: ProjectListRow[]; total: number }> {
  // q → 검색 패턴. null 이면 검색 미적용.
  const pattern = buildSearchClause(query.q);

  // q 가 있으면 clients.company_name 매칭 ID 집합을 먼저 조회한다.
  // 이후 projects.or() 에 client_id.in.(...) 으로 합류시킨다.
  let matchedClientIds: string[] = [];
  if (pattern) {
    const clientsRes = await supabase
      .from("clients")
      .select("id")
      .ilike("company_name", pattern)
      .is("deleted_at", null);
    const data = (clientsRes as { data: { id: string }[] | null }).data;
    matchedClientIds = (data ?? []).map((r) => r.id);
  }

  // count 와 결과를 한번에 가져오기 위해 head:false + count:'exact'.
  let q = supabase
    .from("projects")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (pattern) {
    // title / notes / clients.company_name (via client_id) 3-way OR.
    const orClauses = [
      `title.ilike.${pattern}`,
      `notes.ilike.${pattern}`,
    ];
    if (matchedClientIds.length > 0) {
      // PostgREST in.(...) 리터럴: 따옴표 없이 콤마 구분 UUID. UUID 는 안전 문자만 포함.
      orClauses.push(`client_id.in.(${matchedClientIds.join(",")})`);
    }
    q = q.or(orClauses.join(","));
  }
  if (query.status.length > 0) {
    q = q.in("status", query.status);
  }
  if (query.operatorId) {
    q = q.eq("operator_id", query.operatorId);
  }
  if (query.clientId) {
    q = q.eq("client_id", query.clientId);
  }
  if (query.startFrom) {
    q = q.gte("education_start_at", `${query.startFrom}T00:00:00+09:00`);
  }
  if (query.startTo) {
    q = q.lte("education_start_at", `${query.startTo}T23:59:59+09:00`);
  }

  // 정렬 — sort=status 인 경우 enum 순서가 아니라 string 순. MVP 허용.
  q = q.order(query.sort, { ascending: query.order === "asc", nullsFirst: false });

  // 페이지네이션 — range 는 inclusive [from, to]
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  q = q.range(from, to);

  const { data, count, error } = (await q) as {
    data: ProjectListRow[] | null;
    count: number | null;
    error: unknown;
  };
  if (error) {
    console.error("[fetchProjectList] supabase error", error);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}
