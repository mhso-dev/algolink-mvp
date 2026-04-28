// @MX:NOTE: SPEC-SKILL-ABSTRACT-001 §2.1 — 9개 추상 카테고리 단일 레벨.
// 3-tier 트리 빌더는 supersede됨. 단순 카테고리 타입만 export 한다.
// @MX:SPEC: SPEC-ME-001 (supersede §2.4)
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001

/**
 * 단일 레벨 9개 추상 카테고리. tier/parentId 부재.
 */
export interface SkillCategory {
  id: string;
  name: string;
  sortOrder: number;
}
