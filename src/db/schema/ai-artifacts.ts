// @MX:NOTE: SPEC-DB-001 §2.11 REQ-DB001-AI-CACHE — AI 산출물 캐시.
// dedupe via input_file_hash UNIQUE (REQ-DB001-AI-DEDUPE).
import { pgTable, uuid, text, integer, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { instructors } from "./instructor";
import { projects } from "./project";

// 이력서 파싱 캐시 — 동일 파일은 재호출 없이 캐시 반환.
export const aiResumeParses = pgTable(
  "ai_resume_parses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inputFileHash: text("input_file_hash").notNull(),
    instructorId: uuid("instructor_id").references(() => instructors.id, {
      onDelete: "set null",
    }),
    parsedJson: jsonb("parsed_json").notNull(),
    model: text("model").notNull(),
    tokensUsed: integer("tokens_used"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_ai_resume_parses_hash").on(t.inputFileHash),
    index("idx_ai_resume_parses_instructor").on(t.instructorId),
  ],
);

// 만족도 요약 (강사별 누적 리뷰 → 자연어 요약).
export const aiSatisfactionSummaries = pgTable(
  "ai_satisfaction_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    summaryText: text("summary_text").notNull(),
    model: text("model").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ai_satisfaction_summaries_instructor").on(t.instructorId),
    index("idx_ai_satisfaction_summaries_generated").on(t.generatedAt.desc()),
  ],
);

// 강사 추천 결과 + 채택 여부 (KPI 측정).
export const aiInstructorRecommendations = pgTable(
  "ai_instructor_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    top3Jsonb: jsonb("top3_jsonb").notNull(), // [{instructor_id, score, reason}, ...]
    adoptedInstructorId: uuid("adopted_instructor_id").references(() => instructors.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ai_recommendations_project").on(t.projectId),
    index("idx_ai_recommendations_adopted").on(t.adoptedInstructorId),
  ],
);
