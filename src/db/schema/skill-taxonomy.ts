// @MX:ANCHOR: SPEC-SKILL-ABSTRACT-001 §2.2 — 9개 추상 카테고리(단일 레벨) + N:M 강사 매핑.
// @MX:REASON: 강사 추천/검색/리포팅의 분류 축. 모든 검색/필터 UI가 의존하는 단일 진실.
// @MX:SPEC: SPEC-DB-001 (supersede §2.4)
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { instructors } from "./instructor";

export const skillCategories = pgTable(
  "skill_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_skill_categories_name").on(t.name)],
);

// 강사-기술 N:M (REQ-SKILL-INSTRUCTOR-MAP-001~002).
// proficiency 컬럼 제거 — 보유=1/미보유=0 binary 매칭.
export const instructorSkills = pgTable(
  "instructor_skills",
  {
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_instructor_skills").on(t.instructorId, t.skillId),
    index("idx_instructor_skills_skill").on(t.skillId),
  ],
);

export type SkillCategory = typeof skillCategories.$inferSelect;
export type InstructorSkill = typeof instructorSkills.$inferSelect;
