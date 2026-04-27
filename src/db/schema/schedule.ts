// @MX:ANCHOR: SPEC-DB-001 §2.7 REQ-DB001-SCHEDULE — 강사 일정 + EXCLUSION 충돌 감지.
// @MX:REASON: EXCLUSION constraint는 마이그레이션 SQL에서 별도 추가 (Drizzle Kit 미지원).
// @MX:WARN: schedule_kind ∈ {system_lecture, unavailable}만 충돌 검사 대상.
// @MX:REASON: personal 일정은 강사가 임의 추가하므로 검사 제외 (EC-04).
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { scheduleKind } from "../enums";
import { instructors } from "./instructor";
import { projects } from "./project";

export const scheduleItems = pgTable(
  "schedule_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    scheduleKind: scheduleKind("schedule_kind").notNull(),

    // system_lecture는 NOT NULL projectId 강제 (트리거 또는 CHECK)
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),

    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("idx_schedule_items_instructor").on(t.instructorId),
    index("idx_schedule_items_project").on(t.projectId),
    index("idx_schedule_items_starts").on(t.startsAt),
    index("idx_schedule_items_kind").on(t.scheduleKind),
  ],
);

export type ScheduleItem = typeof scheduleItems.$inferSelect;
