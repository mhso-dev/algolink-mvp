// @MX:ANCHOR: SPEC-PAYOUT-002 §M1 REQ-PAYOUT002-SESSIONS-001/002 — 강의 세션 1회 단위 추적.
// @MX:REASON: 정산 산식의 source-of-truth. settlement_sessions junction을 통해 청구 추적.
// @MX:WARN: hours numeric(4,1) CHECK (> 0 AND <= 24) — DB 레벨 defense-in-depth (MEDIUM-4).
// @MX:REASON: zod 우회 INSERT가 도달해도 DB가 거부한다.
// @MX:WARN: original_session_id self-FK ON DELETE RESTRICT — 감사 추적 보존 (LOW-7).
// @MX:REASON: rescheduled chain의 원본 세션 hard-delete 차단으로 audit trail이 silent loss되지 않도록 함.
import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { lectureSessionStatus } from "../enums";
import { projects } from "./project";
import { instructors } from "./instructor";

export const lectureSessions = pgTable(
  "lecture_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    instructorId: uuid("instructor_id").references(() => instructors.id, {
      onDelete: "restrict",
    }), // 배정 전 NULL 허용
    date: date("date").notNull(),
    hours: numeric("hours", { precision: 4, scale: 1 }).notNull(),
    status: lectureSessionStatus("status").notNull().default("planned"),
    originalSessionId: uuid("original_session_id").references(
      (): AnyPgColumn => lectureSessions.id,
      { onDelete: "restrict" },
    ), // reschedule audit trail
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // REQ-PAYOUT002-SESSIONS-001 / -008 — DB-level defense-in-depth.
    check("lecture_sessions_hours_range_check", sql`${t.hours} > 0 AND ${t.hours} <= 24`),
    index("idx_lecture_sessions_project_date").on(t.projectId, t.date),
    index("idx_lecture_sessions_instructor_date").on(t.instructorId, t.date),
    index("idx_lecture_sessions_deleted").on(t.deletedAt),
  ],
);

export type LectureSessionRow = typeof lectureSessions.$inferSelect;
export type NewLectureSessionRow = typeof lectureSessions.$inferInsert;
