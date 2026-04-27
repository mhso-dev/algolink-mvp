// @MX:NOTE: SPEC-DB-001 §2.9 REQ-DB001-NOTES — 다형성 메모/댓글/첨부.
// entity_type + entity_id 조합으로 project/instructor/client 부착 대상 식별.
// audience로 노출 범위 분리 (instructor / internal).
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { entityType, audience } from "../enums";
import { files } from "./files";

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: entityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    audience: audience("audience").notNull().default("internal"),
    bodyMarkdown: text("body_markdown").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notes_entity").on(t.entityType, t.entityId),
    index("idx_notes_audience").on(t.audience),
    index("idx_notes_created_by").on(t.createdBy),
  ],
);

export const notesAttachments = pgTable(
  "notes_attachments",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    sortOrder: text("sort_order").default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_notes_attachments_note").on(t.noteId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
    // 다형성 부착 (note가 NULL일 때 entity_type/entity_id 사용)
    entityType: entityType("entity_type"),
    entityId: uuid("entity_id"),
    body: text("body").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_comments_note").on(t.noteId),
    index("idx_comments_entity").on(t.entityType, t.entityId),
    index("idx_comments_created_by").on(t.createdBy),
  ],
);

export type Note = typeof notes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
