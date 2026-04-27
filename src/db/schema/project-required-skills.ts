// @MX:NOTE: SPEC-PROJECT-001 §5.2 — 프로젝트 ↔ 필요 기술 N:M junction.
// leaf-only 트리거는 마이그레이션 SQL 에서 강제 (Drizzle 미지원).
import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { projects } from "./project";
import { skillCategories } from "./skill-taxonomy";

export const projectRequiredSkills = pgTable(
  "project_required_skills",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.skillId] }),
    index("idx_project_required_skills_skill").on(t.skillId),
  ],
);

export type ProjectRequiredSkill = typeof projectRequiredSkills.$inferSelect;
