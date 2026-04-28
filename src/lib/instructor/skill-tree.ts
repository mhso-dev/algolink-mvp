// SPEC-ME-001 §2.4 REQ-ME-SKILL-001 — skill_categories 3-tier 트리 빌더 (순수 함수).
// @MX:NOTE: 평면 배열을 large/medium/small 트리로 그룹화. M3 SkillsPicker가 단일 진실로 사용.

export type SkillTier = "large" | "medium" | "small";
export type Proficiency = "beginner" | "intermediate" | "advanced" | "expert";

export interface SkillCategoryRow {
  id: string;
  tier: SkillTier;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface SkillSmallNode {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SkillMediumNode {
  id: string;
  name: string;
  sortOrder: number;
  smalls: SkillSmallNode[];
}

export interface SkillLargeNode {
  id: string;
  name: string;
  sortOrder: number;
  mediums: SkillMediumNode[];
}

/**
 * 평면 skill_categories 행을 large→medium→small 3-tier 트리로 변환한다.
 * - parent 매칭이 안 되는 행은 누락된 것으로 간주하고 무시한다.
 * - 정렬: 각 tier 내에서 sortOrder ASC, 동일 sortOrder 시 name ASC.
 */
export function buildSkillTree(rows: readonly SkillCategoryRow[]): SkillLargeNode[] {
  const larges = rows.filter((r) => r.tier === "large");
  const mediums = rows.filter((r) => r.tier === "medium");
  const smalls = rows.filter((r) => r.tier === "small");

  const sortNodes = <T extends { sortOrder: number; name: string }>(arr: T[]) =>
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));

  return sortNodes(
    larges.map((l) => ({
      id: l.id,
      name: l.name,
      sortOrder: l.sortOrder,
      mediums: sortNodes(
        mediums
          .filter((m) => m.parentId === l.id)
          .map((m) => ({
            id: m.id,
            name: m.name,
            sortOrder: m.sortOrder,
            smalls: sortNodes(
              smalls
                .filter((s) => s.parentId === m.id)
                .map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder })),
            ),
          })),
      ),
    })),
  );
}

/**
 * 검색어로 트리를 필터링한다.
 * - small 노드의 name 부분 일치(대소문자 무시, 한글 NFC 비교).
 * - 매치된 small을 포함하는 medium / large만 보존.
 * - 빈 검색어는 원본 트리 그대로 반환.
 */
export function filterSkillTree(tree: SkillLargeNode[], query: string): SkillLargeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree
    .map((large) => {
      const mediums = large.mediums
        .map((m) => {
          const matchedSmalls = m.smalls.filter((s) => s.name.toLowerCase().includes(q));
          if (matchedSmalls.length === 0) return null;
          return { ...m, smalls: matchedSmalls };
        })
        .filter((m): m is SkillMediumNode => m !== null);
      if (mediums.length === 0) return null;
      return { ...large, mediums };
    })
    .filter((l): l is SkillLargeNode => l !== null);
}

/**
 * 선택된 instructor_skills를 (skillId → proficiency) Map으로 변환.
 * 단순 변환이지만 컴포넌트가 한 곳에서만 import 하도록 export.
 */
export function indexSelections(
  selections: ReadonlyArray<{ skillId: string; proficiency: Proficiency }>,
): Map<string, Proficiency> {
  const m = new Map<string, Proficiency>();
  for (const s of selections) m.set(s.skillId, s.proficiency);
  return m;
}

/**
 * 트리에서 small skillId만 평면 추출 (검증용).
 * REQ-ME-SKILL-005: medium/large는 selectable 아니다. 호출자는 이 결과로 선택 시도를 차단할 수 있다.
 */
export function collectSmallSkillIds(tree: SkillLargeNode[]): Set<string> {
  const out = new Set<string>();
  for (const l of tree) for (const m of l.mediums) for (const s of m.smalls) out.add(s.id);
  return out;
}
