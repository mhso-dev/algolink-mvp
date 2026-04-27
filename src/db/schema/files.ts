// @MX:NOTE: SPEC-DB-001 §2.12 REQ-DB001-FILES — Supabase Storage 메타데이터.
// 실제 바이너리는 Supabase Storage 버킷, 본 테이블은 메타만 보관.
import { pgTable, uuid, text, bigint, timestamp, index } from "drizzle-orm/pg-core";

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    ownerId: uuid("owner_id"), // FK to users.id — Supabase auth 가입 후 채워짐
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_files_owner").on(t.ownerId),
    index("idx_files_uploaded_at").on(t.uploadedAt.desc()),
  ],
);

export type FileRow = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
