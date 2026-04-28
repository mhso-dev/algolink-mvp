// @MX:NOTE: SPEC-SKILL-ABSTRACT-001 — 9개 추상 카테고리 마스터 + 본인 instructor_skills 조회.
// @MX:SPEC: SPEC-ME-001 (supersede §2.4)
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
// server-only. RLS는 SPEC-DB-001이 적용되어 있어 본인 row만 반환됨.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { SkillCategory } from "./skill-tree";

interface RawCategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

/** skill_categories 전체 마스터(9개)를 sort_order 순으로 반환. */
// @MX:ANCHOR: SPEC-SKILL-ABSTRACT-001 — 강사 스킬 마스터 데이터 단일 진입점.
// @MX:REASON: fan_in 3+, 강사 등록/이력서/operator 강사 목록/프로젝트 폼이 동일 마스터에 의존. 시그니처 변경 시 UI/필터/추천 동시 회귀.
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
export async function getAllSkillCategories(): Promise<SkillCategory[]> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("skill_categories")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[getAllSkillCategories] failed", error);
    return [];
  }
  return ((data ?? []) as RawCategoryRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
  }));
}

/** 본인 instructor_skills 조회 (skillId만). proficiency 필드 부재. */
export async function getMySkills(
  instructorId: string,
): Promise<Array<{ skillId: string }>> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("instructor_skills")
    .select("skill_id")
    .eq("instructor_id", instructorId);
  if (error) {
    console.error("[getMySkills] failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ skill_id: string }>).map((r) => ({
    skillId: r.skill_id,
  }));
}
