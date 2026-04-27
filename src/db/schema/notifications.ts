// @MX:NOTE: SPEC-DB-001 §2.10 REQ-DB001-NOTIFICATIONS — 인앱 알림.
// 이메일/SMS 발송은 SCOPE 제외 (console.log 스텁만).
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
