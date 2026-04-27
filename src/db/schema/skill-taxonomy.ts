// @MX:ANCHOR: SPEC-DB-001 §2.4 REQ-DB001-SKILL-TAXONOMY — 3-tier self-ref 분류 + N:M 강사 매핑.
// @MX:REASON: 본 테이블은 강사 추천/검색/리포팅의 분류 축. 모든 검색 UI가 의존.
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { skillTier, proficiency } from "../enums";
import { instructors } from "./instructor";

export const skillCategories = pgTable(
  "skill_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tier: skillTier("tier").notNull(),
    name: text("name").notNull(),
    // 자기 참조 FK — large는 NULL, medium은 large 참조, small은 medium 참조.
    // leaf 검증은 트리거에서 (자식이 없는 노드만 instructor_skills.skill_id 가능).
    parentId: uuid("parent_id").references((): AnyPgColumn => skillCategories.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_skill_categories_tier_parent_name").on(t.tier, t.parentId, t.name),
    index("idx_skill_categories_tier").on(t.tier),
    index("idx_skill_categories_parent").on(t.parentId),
  ],
);

// 강사-기술 N:M + 난이도 (REQ-DB001-SKILL-INSTRUCTOR-MAP).
// REQ-DB001-SKILL-LEAF: skill_id는 leaf node만 허용 (자식이 없는 노드) — 트리거에서 강제.
export const instructorSkills = pgTable(
  "instructor_skills",
  {
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    proficiency: proficiency("proficiency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_instructor_skills").on(t.instructorId, t.skillId),
    index("idx_instructor_skills_skill").on(t.skillId),
  ],
);

export type SkillCategory = typeof skillCategories.$inferSelect;
export type InstructorSkill = typeof instructorSkills.$inferSelect;
