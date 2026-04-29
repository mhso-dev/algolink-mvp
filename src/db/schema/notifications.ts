// @MX:NOTE: SPEC-DB-001 §2.10 REQ-DB001-NOTIFICATIONS — 인앱 알림.
// 이메일/SMS 발송은 SCOPE 제외 (console.log 스텁만).
// SPEC-CONFIRM-001 §M1 REQ-CONFIRM-NOTIFY-002 (HIGH-3): source_kind / source_id 컬럼 추가
// + idx_notifications_idempotency partial UNIQUE 인덱스로 동시 INSERT 정확히-1행 보장.
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { notificationType } from "../enums";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id").notNull(), // FK to users.id
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    // SPEC-CONFIRM-001 §M1 — idempotency partial UNIQUE: (recipient_id, source_kind, source_id, type)
    sourceKind: text("source_kind"),
    sourceId: uuid("source_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notifications_recipient").on(t.recipientId),
    index("idx_notifications_recipient_unread").on(t.recipientId, t.readAt),
    index("idx_notifications_created_at").on(t.createdAt.desc()),
  ],
);

export type Notification = typeof notifications.$inferSelect;
