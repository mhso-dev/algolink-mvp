// SPEC-PROJECT-001 §2.1 — 프로젝트 리스트 Supabase 쿼리 빌더.
// @MX:NOTE: ProjectListQuery → Supabase select chain. 페이지 카운트 + 결과 분리.

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

/** 필터 + 페이지네이션 적용된 프로젝트 리스트 + total 카운트. */
export async function fetchProjectList(
  // 다양한 Database 제네릭과 호환되도록 SupabaseClient 의 from 만 사용 — any 캐스트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  query: ProjectListQuery,
): Promise<{ rows: ProjectListRow[]; total: number }> {
  // count 와 결과를 한번에 가져오기 위해 head:false + count:'exact'.
  let q = supabase
    .from("projects")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (query.q) {
    // 제목 부분 일치 (case-insensitive). 고객사 검색은 별도 join 필요해 여기서는 제목만.
    q = q.ilike("title", `%${query.q}%`);
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
