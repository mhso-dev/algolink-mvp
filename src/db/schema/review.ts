// @MX:NOTE: SPEC-DB-001 §2.13 REQ-DB001-REVIEW — 만족도 리뷰.
// score는 1-5, (instructor_id, project_id) UNIQUE.
import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { instructors } from "./instructor";
import { projects } from "./project";

export const satisfactionReviews = pgTable(
  "satisfaction_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(),
    comment: text("comment"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_satisfaction_reviews_instructor_project").on(t.instructorId, t.projectId),
    check("satisfaction_reviews_score_range", sql`score BETWEEN 1 AND 5`),
    index("idx_satisfaction_reviews_instructor").on(t.instructorId),
    index("idx_satisfaction_reviews_project").on(t.projectId),
  ],
);

export type SatisfactionReview = typeof satisfactionReviews.$inferSelect;
