// SPEC-ME-001 §2.4 REQ-ME-SKILL — skill_categories 마스터 + 본인 instructor_skills 조회.
// @MX:NOTE: server-only. RLS는 SPEC-DB-001이 적용되어 있어 본인 row만 반환됨.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { SkillCategoryRow, Proficiency } from "./skill-tree";

interface RawCategoryRow {
  id: string;
  tier: "large" | "medium" | "small";
  name: string;
  parent_id: string | null;
  sort_order: number;
}

/** skill_categories 전체 마스터를 평면 배열로 반환. */
// @MX:ANCHOR: [AUTO] getAllSkillCategories — 스킬 마스터 데이터 단일 진입점
// @MX:REASON: fan_in 3, 강사 등록/이력서/operator 강사 목록이 동일 마스터에 의존. 시그니처 변경 시 UI 트리/필터 동시 회귀.
export async function getAllSkillCategories(): Promise<SkillCategoryRow[]> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("skill_categories")
    .select("id, tier, name, parent_id, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[getAllSkillCategories] failed", error);
    return [];
  }
  return ((data ?? []) as RawCategoryRow[]).map((r) => ({
    id: r.id,
    tier: r.tier,
    name: r.name,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
  }));
}

/** 본인 instructor_skills 조회 (skillId, proficiency). */
export async function getMySkills(
  instructorId: string,
): Promise<Array<{ skillId: string; proficiency: Proficiency }>> {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("instructor_skills")
    .select("skill_id, proficiency")
    .eq("instructor_id", instructorId);
  if (error) {
    console.error("[getMySkills] failed", error);
    return [];
  }
  return ((data ?? []) as Array<{ skill_id: string; proficiency: Proficiency }>).map((r) => ({
    skillId: r.skill_id,
    proficiency: r.proficiency,
  }));
}
