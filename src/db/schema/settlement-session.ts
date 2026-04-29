// @MX:ANCHOR: SPEC-PAYOUT-002 §M1 REQ-PAYOUT002-LINK-001/002/006 — settlement ↔ lecture_session junction.
// @MX:REASON: 이중 청구 방지의 권위 있는(authoritative) DB-layer guard. UNIQUE INDEX on lecture_session_id.
// @MX:WARN: lecture_session_id에 단일 컬럼 UNIQUE INDEX — 같은 세션을 두 settlement에 link 시 SQLSTATE 23505.
// @MX:REASON: concurrent generate race-condition을 application-layer NOT IN 만으로는 막을 수 없음 (READ COMMITTED).
import {
  pgTable,
  uuid,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { settlements } from "./settlement";
import { lectureSessions } from "./lecture-session";

export const settlementSessions = pgTable(
  "settlement_sessions",
  {
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    lectureSessionId: uuid("lecture_session_id")
      .notNull()
      .references(() => lectureSessions.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.settlementId, t.lectureSessionId] }),
    // REQ-PAYOUT002-LINK-002 / -006 — race-condition DB-layer guard (HIGH-2).
    uniqueIndex("settlement_sessions_lecture_session_unique").on(t.lectureSessionId),
    index("idx_settlement_sessions_settlement").on(t.settlementId),
  ],
);

export type SettlementSessionRow = typeof settlementSessions.$inferSelect;
export type NewSettlementSessionRow = typeof settlementSessions.$inferInsert;
