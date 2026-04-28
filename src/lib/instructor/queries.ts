// SPEC-INSTRUCTOR-001 §2.6 REQ-INSTRUCTOR-DATA-001~007 — 강사 도메인 쿼리.
//
// PII 차단 (REQ-INSTRUCTOR-DATA-003): instructors_safe view만 SELECT.
// Supabase 생성 타입의 relationship 모호성으로 .returns<...>()로 명시한다.
//
// @MX:NOTE: [AUTO] 강사 도메인의 기본 쿼리 허브. 현재 fan_in=2 (list 페이지, detail 페이지).
// @MX:NOTE: [AUTO] fan_in이 3 이상으로 증가 시 @MX:ANCHOR로 승격 필요.
// @MX:SPEC: SPEC-INSTRUCTOR-001

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type {
  InstructorDetail,
  InstructorHistoryRow,
  InstructorListFilter,
  InstructorListRow,
} from "./types";

const COMPLETED_PROJECT_STATUSES = [
  "education_done",
  "settlement_in_progress",
  "task_done",
] as const;

const PAYABLE_SETTLEMENT_STATUSES = ["requested", "paid", "held"] as const;

type SafeBaseRow = {
  id: string;
  name_kr: string | null;
  email: string | null;
  phone: string | null;
  deleted_at: string | null;
};

type SkillJoinRow = {
  instructor_id: string;
  skill_categories: { id: string; name: string } | null;
};

type ProjectAggRow = {
  instructor_id: string | null;
  status: string;
  education_end_at: string | null;
  scheduled_at: string | null;
};

type ReviewAggRow = {
  instructor_id: string;
  score: number;
};

type SettlementAggRow = {
  instructor_id: string;
  instructor_fee_krw: number;
  status: string;
};

type ListResult = {
  rows: InstructorListRow[];
  total: number;
};

export async function listInstructorsForOperator(
  filter: InstructorListFilter,
): Promise<ListResult> {
  const supabase = createClient(await cookies());

  // 1) 후보 instructor 집합 (이름 ILIKE + soft-delete 필터).
  let baseQuery = supabase
    .from("instructors_safe")
    .select("id, name_kr, email, phone, deleted_at", { count: "exact" })
    .is("deleted_at", null);

  if (filter.name && filter.name.trim()) {
    baseQuery = baseQuery.ilike("name_kr", `%${filter.name.trim()}%`);
  }

  // 2) skill 필터: 별도 쿼리로 매칭되는 instructor_id 집합을 얻고 in() 적용.
  if (filter.skillIds && filter.skillIds.length > 0) {
    const { data: skillRows } = await supabase
      .from("instructor_skills")
      .select("instructor_id")
      .in("skill_id", filter.skillIds)
      .returns<{ instructor_id: string }[]>();
    const ids = Array.from(
      new Set((skillRows ?? []).map((r) => r.instructor_id)),
    );
    if (ids.length === 0) {
      return { rows: [], total: 0 };
    }
    baseQuery = baseQuery.in("id", ids);
  }

  const { data: candidatesRaw, count } = await baseQuery
    .order("name_kr", { ascending: true })
    .returns<SafeBaseRow[]>();

  const candidates = candidatesRaw ?? [];
  if (candidates.length === 0) {
    return { rows: [], total: count ?? 0 };
  }

  const candidateIds = candidates.map((c) => c.id);

  // 3) 부수 데이터 일괄 로드.
  const [skillsRes, projectsRes, reviewsRes, settlementsRes] = await Promise.all([
    supabase
      .from("instructor_skills")
      .select("instructor_id, skill_categories(id, name)")
      .in("instructor_id", candidateIds)
      .returns<SkillJoinRow[]>(),
    supabase
      .from("projects")
      .select("instructor_id, status, education_end_at, scheduled_at")
      .in("instructor_id", candidateIds)
      .is("deleted_at", null)
      .returns<ProjectAggRow[]>(),
    supabase
      .from("satisfaction_reviews")
      .select("instructor_id, score")
      .in("instructor_id", candidateIds)
      .returns<ReviewAggRow[]>(),
    supabase
      .from("settlements")
      .select("instructor_id, instructor_fee_krw, status")
      .in("instructor_id", candidateIds)
      .is("deleted_at", null)
      .returns<SettlementAggRow[]>(),
  ]);

  // 강사별 집계 맵.
  const skillsMap = new Map<string, string[]>();
  for (const row of skillsRes.data ?? []) {
    const name = row.skill_categories?.name ?? null;
    if (!name) continue;
    const arr = skillsMap.get(row.instructor_id) ?? [];
    arr.push(name);
    skillsMap.set(row.instructor_id, arr);
  }

  const lectureCountMap = new Map<string, number>();
  const lastLectureMap = new Map<string, Date | null>();
  for (const p of projectsRes.data ?? []) {
    if (
      !COMPLETED_PROJECT_STATUSES.includes(
        p.status as (typeof COMPLETED_PROJECT_STATUSES)[number],
      )
    ) {
      continue;
    }
    if (!p.instructor_id) continue;
    lectureCountMap.set(
      p.instructor_id,
      (lectureCountMap.get(p.instructor_id) ?? 0) + 1,
    );
    const endStr = p.education_end_at ?? p.scheduled_at;
    if (endStr) {
      const d = new Date(endStr);
      const cur = lastLectureMap.get(p.instructor_id);
      if (!cur || d > cur) lastLectureMap.set(p.instructor_id, d);
    }
  }

  const reviewSumMap = new Map<string, { sum: number; count: number }>();
  for (const r of reviewsRes.data ?? []) {
    const cur = reviewSumMap.get(r.instructor_id) ?? { sum: 0, count: 0 };
    cur.sum += r.score ?? 0;
    cur.count += 1;
    reviewSumMap.set(r.instructor_id, cur);
  }

  const settlementMap = new Map<string, number>();
  for (const s of settlementsRes.data ?? []) {
    if (
      !PAYABLE_SETTLEMENT_STATUSES.includes(
        s.status as (typeof PAYABLE_SETTLEMENT_STATUSES)[number],
      )
    ) {
      continue;
    }
    const cur = settlementMap.get(s.instructor_id) ?? 0;
    settlementMap.set(s.instructor_id, cur + (s.instructor_fee_krw ?? 0));
  }

  // 4) row 빌드.
  let rows: InstructorListRow[] = candidates.map((c) => {
    const allSkills = skillsMap.get(c.id) ?? [];
    const review = reviewSumMap.get(c.id);
    const avgScore =
      review && review.count > 0 ? review.sum / review.count : null;
    return {
      id: c.id,
      nameKr: c.name_kr ?? "(이름 미상)",
      topSkills: allSkills.slice(0, 3),
      totalSkillCount: allSkills.length,
      lectureCount: lectureCountMap.get(c.id) ?? 0,
      settlementTotalKrw: settlementMap.get(c.id) ?? 0,
      avgScore,
      reviewCount: review?.count ?? 0,
      lastLectureDate: lastLectureMap.get(c.id) ?? null,
    };
  });

  // 5) 만족도 범위 필터.
  if (filter.scoreMin !== undefined || filter.scoreMax !== undefined) {
    const min = filter.scoreMin ?? 0;
    const max = filter.scoreMax ?? 5;
    rows = rows.filter((r) => {
      if (r.avgScore === null) return min <= 0;
      return r.avgScore >= min && r.avgScore <= max;
    });
  }

  // 6) 정렬.
  const sortKey = filter.sort ?? "name_kr";
  const dir = filter.dir ?? "asc";
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "lecture_count":
        cmp = a.lectureCount - b.lectureCount;
        break;
      case "avg_score":
        cmp = (a.avgScore ?? -Infinity) - (b.avgScore ?? -Infinity);
        break;
      case "last_lecture_date":
        cmp =
          (a.lastLectureDate?.getTime() ?? -Infinity) -
          (b.lastLectureDate?.getTime() ?? -Infinity);
        break;
      case "name_kr":
      default:
        cmp = a.nameKr.localeCompare(b.nameKr, "ko");
    }
    if (cmp === 0) cmp = a.nameKr.localeCompare(b.nameKr, "ko");
    return cmp * mul;
  });

  const total = rows.length;
  const page = Math.max(1, filter.page);
  const pageSize = Math.max(1, filter.pageSize);
  const start = (page - 1) * pageSize;
  const paged = rows.slice(start, start + pageSize);

  return { rows: paged, total };
}

type InstructorDetailRow = {
  id: string;
  name_kr: string | null;
  name_en: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  user_id: string | null;
  deleted_at: string | null;
};

type DetailSkillRow = {
  skill_categories: { id: string; name: string } | null;
};

type DetailHistoryRow = {
  id: string;
  title: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  scheduled_at: string | null;
  satisfaction_reviews:
    | { score: number; comment: string | null }[]
    | null;
};

export async function getInstructorDetailForOperator(
  id: string,
): Promise<InstructorDetail | null> {
  const supabase = createClient(await cookies());

  const { data: instArr } = await supabase
    .from("instructors_safe")
    .select("id, name_kr, name_en, email, phone, created_at, user_id, deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1)
    .returns<InstructorDetailRow[]>();

  const inst = instArr?.[0];
  if (!inst) return null;

  const [skillsRes, historyRes] = await Promise.all([
    supabase
      .from("instructor_skills")
      .select("skill_categories(id, name)")
      .eq("instructor_id", id)
      .returns<DetailSkillRow[]>(),
    supabase
      .from("projects")
      .select(
        "id, title, education_start_at, education_end_at, scheduled_at, satisfaction_reviews(score, comment)",
      )
      .eq("instructor_id", id)
      .is("deleted_at", null)
      .order("education_end_at", { ascending: false, nullsFirst: false })
      .limit(50)
      .returns<DetailHistoryRow[]>(),
  ]);

  const skills = (skillsRes.data ?? [])
    .map((row) => row.skill_categories)
    .filter((c): c is { id: string; name: string } => c !== null);

  const history: InstructorHistoryRow[] = (historyRes.data ?? []).map((p) => {
    const reviews = p.satisfaction_reviews ?? [];
    const r = reviews[0];
    const startStr = p.education_start_at ?? p.scheduled_at ?? null;
    const endStr = p.education_end_at ?? p.scheduled_at ?? null;
    return {
      projectId: p.id,
      projectTitle: p.title ?? "(프로젝트 미상)",
      startDate: startStr ? new Date(startStr) : null,
      endDate: endStr ? new Date(endStr) : null,
      score: typeof r?.score === "number" ? r.score : null,
      comment: r?.comment ?? null,
    };
  });

  return {
    id: inst.id,
    nameKr: inst.name_kr ?? "(이름 미상)",
    nameEn: inst.name_en,
    email: inst.email,
    phone: inst.phone,
    skills,
    createdAt: inst.created_at ? new Date(inst.created_at) : new Date(),
    userId: inst.user_id,
    history,
  };
}

export async function getAllSkillCategories(): Promise<
  { id: string; name: string }[]
> {
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("skill_categories")
    .select("id, name")
    .order("sort_order", { ascending: true })
    .returns<{ id: string; name: string }[]>();
  return data ?? [];
}
